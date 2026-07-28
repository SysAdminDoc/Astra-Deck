'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    createDownloadUIFeature,
    normalizeDownloadHealthSnapshot,
    DOWNLOAD_HEALTH_SCHEMA_VERSION,
} = require('../extension/features/download-ui');
const { waitForCondition } = require('./helpers/async');

const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'download-health-v2.json'),
    'utf8'
));

test('versioned downloader health crosses the UI boundary without diagnostics or echoed tokens', () => {
    const normalized = normalizeDownloadHealthSnapshot({
        ...fixture,
        token: 'echoed-by-legacy-health'
    }, {
        token: 'native-channel-token',
        tokenSource: 'native'
    });

    assert.equal(DOWNLOAD_HEALTH_SCHEMA_VERSION, 2);
    assert.equal(normalized.schemaVersion, 2);
    assert.equal(normalized.token, 'native-channel-token');
    assert.equal(normalized.tokenSource, 'native');
    assert.equal(normalized.ytDlpVersion, '2026.07.04');
    assert.equal(normalized.javascriptRuntime.ejsReady, true);
    assert.equal(Object.hasOwn(normalized, 'recentErrors'), false);
    assert.equal(Object.hasOwn(normalized, 'updateRecovery'), false);
    assert.deepEqual(normalized.ffmpegCapabilities, { version: '7.1.1', current: true });
    assert.deepEqual(normalized.poTokenProvider, { ok: true });
    assert.equal(normalizeDownloadHealthSnapshot(fixture, {}).tokenSource, null);
    assert.equal(normalizeDownloadHealthSnapshot({ ...fixture, api: 3 }, {}), null);
    assert.equal(normalizeDownloadHealthSnapshot({ ...fixture, service: 'other', token_required: false }, {}), null);
});

class FakeElement {
    constructor() {
        this.children = [];
        this.dataset = {};
        this.style = {};
        this.attributes = new Map();
        this.isConnected = true;
        this.className = '';
        this.classList = { contains: (name) => this.className.split(/\s+/).includes(name) };
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = [...children]; }
    addEventListener() {}
    remove() { this.isConnected = false; }
}

test('download health polling and navigation teardown use a deterministic lifecycle boundary', async () => {
    const previousDocument = globalThis.document;
    const timeouts = new Map();
    const intervals = new Map();
    let nextTimerId = 1;
    let navRule = null;
    let removedRule = null;
    let fetchCalls = 0;
    const anchor = {
        nextElementSibling: null,
        insertAdjacentElement(_position, element) {
            this.nextElementSibling = element;
        }
    };
    globalThis.document = {
        visibilityState: 'visible',
        querySelector: () => anchor,
        createElement: () => new FakeElement()
    };

    try {
        const feature = createDownloadUIFeature({
            isWatchPagePath: () => true,
            requestNativeDownloaderToken: async () => ({ token: 'native-channel-token' }),
            extensionFetchJson: async () => {
                fetchCalls += 1;
                return { data: fixture };
            },
            injectStyle: () => new FakeElement(),
            addNavigateRule: (_id, callback) => { navRule = callback; },
            removeNavigateRule: (id) => { removedRule = id; },
            setTimeoutFn(callback, delay) {
                const id = nextTimerId++;
                timeouts.set(id, { callback, delay });
                return id;
            },
            clearTimeoutFn: (id) => { timeouts.delete(id); },
            setIntervalFn(callback, delay) {
                const id = nextTimerId++;
                intervals.set(id, { callback, delay });
                return id;
            },
            clearIntervalFn: (id) => { intervals.delete(id); }
        });
        const panel = feature.downloadHealthPanel;
        panel.init();

        await waitForCondition(() => panel._container?.children.length >= 6);
        assert.deepEqual([...intervals.values()].map((entry) => entry.delay), [30000]);
        assert.ok(panel._container.children.some((pill) => pill.textContent === 'Auth: native'));
        assert.ok(panel._container.children.some((pill) => pill.textContent === 'yt-dlp: 2026.07.04'));

        navRule();
        const staleNavigationCallback = [...timeouts.values()][0].callback;
        assert.deepEqual([...timeouts.values()].map((entry) => entry.delay), [1500]);
        const callsBeforeDestroy = fetchCalls;
        panel.destroy();
        assert.equal(removedRule, 'downloadHealthPanel');
        assert.equal(timeouts.size, 0);
        assert.equal(intervals.size, 0);

        staleNavigationCallback();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(fetchCalls, callsBeforeDestroy, 'a queued navigation callback must not resurrect polling after destroy');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

// Regression: a stale/legacy downloader (e.g. an old YTYT-Downloader) can
// answer /health on 9751 — the companion's primary port — without being Astra
// Downloader. The extension must reject it by service identity, keep probing,
// adopt the real companion on a fallback port, and record the shadowing server
// so the repair prompt can name it instead of failing generically.
test('a non-Astra server squatting the primary port is skipped and recorded', async () => {
    // Legacy YTYT-Downloader health shape: no service/api/name, no token_required,
    // no port — but a token + status:ok, exactly what fooled older builds.
    const legacyHealth = { status: 'ok', downloads: 0, token: 'legacy-token', version: '4.1.0' };
    const realHealth = { ...fixture, port: 9761 };

    const feature = createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: 'native-token' }),
        extensionFetchJson: async ({ url }) => {
            if (url.includes(':9751/')) return { data: legacyHealth };
            if (url.includes(':9761/')) return { data: realHealth };
            throw new Error('ECONNREFUSED');
        },
    });
    const mgr = feature.MediaDLManager;

    const result = await mgr.check(true);
    assert.equal(result.ok, true, 'should adopt the real companion despite the squatter');
    assert.equal(result.port, 9761, 'must fall through to the fallback port');
    assert.equal(mgr._foreignServer && mgr._foreignServer.port, 9751);
    assert.equal(mgr._foreignServer && mgr._foreignServer.version, '4.1.0');

    // And when ONLY the squatter is present, report not-installed but still
    // surface which port is shadowed.
    const shadowOnly = createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: null, error: 'no native host' }),
        extensionFetchJson: async ({ url }) => {
            if (url.includes(':9751/')) return { data: legacyHealth };
            throw new Error('ECONNREFUSED');
        },
    });
    const shadowResult = await shadowOnly.MediaDLManager.check(true);
    assert.equal(shadowResult.ok, false);
    assert.deepEqual(shadowResult.foreignServer, { port: 9751, version: '4.1.0' });
});

// A download initiated while the companion is stopped must fire mediadl://start
// and adopt the server once it comes up — the "start it on download" path.
test('initiating a download auto-starts a stopped companion via mediadl://start', async () => {
    let started = false;
    const protocolCalls = [];
    const realHealth = { ...fixture, port: 9751 };
    const feature = createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: 'native-token' }),
        openProtocol: (uri) => { protocolCalls.push(uri); if (uri === 'mediadl://start') started = true; },
        showToast: () => {},
        extensionFetchJson: async ({ url }) => {
            // Server is down until the protocol launch flips `started`.
            if (!started) throw new Error('ECONNREFUSED');
            if (url.includes(':9751/')) return { data: realHealth };
            throw new Error('ECONNREFUSED');
        },
    });
    const result = await feature.MediaDLManager.tryAutoStart(4);
    assert.deepEqual(protocolCalls, ['mediadl://start'], 'must launch the companion via its registered protocol');
    assert.equal(result.ok, true, 'must adopt the server once it responds');
    assert.equal(result.port, 9751);
});
