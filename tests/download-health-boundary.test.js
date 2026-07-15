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
