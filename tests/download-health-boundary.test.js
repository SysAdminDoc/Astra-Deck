'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    createDownloadUIFeature,
    normalizeDownloadHealthSnapshot,
    summarizeFormatProbe,
    DOWNLOAD_HEALTH_SCHEMA_VERSION,
    AUTO_START_RETRY_BUDGET,
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

test('Cobalt fallback rejects extension-hosted custom instances before EXT_FETCH', async () => {
    const previousLocation = globalThis.location;
    const toasts = [];
    const diagnostics = [];
    const requests = [];
    globalThis.location = { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };

    try {
        const feature = createDownloadUIFeature({
            appState: {
                settings: {
                    githubFullProfile: true,
                    downloadCobaltInstance: 'https://self-hosted.example/api/json'
                }
            },
            getProfileExportMode: () => 'github-full',
            extensionFetchJson: async (details) => {
                requests.push(details);
                return { data: { status: 'error', text: 'must not be called' } };
            },
            showToast: (...args) => toasts.push(args),
            DiagnosticLog: { record: (...args) => diagnostics.push(args) }
        });
        feature.MediaDLManager.check = async () => ({ ok: false });

        await feature.downloadCobaltFallback._trigger();

        assert.equal(requests.length, 0, 'a custom origin must be rejected before the extension bridge');
        assert.match(toasts[0]?.[0] || '', /api\.cobalt\.tools/);
        assert.match(toasts[0]?.[0] || '', /userscript/);
        assert.match(diagnostics[0]?.[1] || '', /origin allowlist/);
    } finally {
        if (previousLocation === undefined) delete globalThis.location;
        else globalThis.location = previousLocation;
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
    const result = await feature.MediaDLManager.tryAutoStart(AUTO_START_RETRY_BUDGET);
    assert.deepEqual(protocolCalls, ['mediadl://start'], 'must launch the companion via its registered protocol');
    assert.equal(result.ok, true, 'must adopt the server once it responds');
    assert.equal(result.port, 9751);
});

test('all normal and recovery auto-start paths use the documented cold-start budget', () => {
    assert.equal(AUTO_START_RETRY_BUDGET, 8);
    const moduleSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'features', 'download-ui', 'index.js'),
        'utf8'
    );
    const monolithSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'ytkit.js'),
        'utf8'
    );
    assert.match(moduleSource, /tryAutoStart\(retries = AUTO_START_RETRY_BUDGET\)/);
    const callArgs = [...moduleSource.matchAll(/(?:this|MediaDLManager)\.tryAutoStart\(([^)\n]+)\)/g)]
        .map((match) => match[1].trim());
    assert.ok(callArgs.length >= 4, 'module should cover the initial, recovery, and UI retry paths');
    assert.ok(callArgs.every((arg) => arg === 'AUTO_START_RETRY_BUDGET'
        || arg === 'likelyNeverInstalled ? 2 : AUTO_START_RETRY_BUDGET'));
    assert.match(monolithSource, /const AUTO_START_RETRY_BUDGET = 8;/);
    assert.match(monolithSource, /MediaDLManager\.tryAutoStart\(AUTO_START_RETRY_BUDGET\)/);

    // The userscript ships a SEPARATE GM downloader implementation, so this
    // fix had to be hand-ported — and the pin that was supposed to protect it
    // deliberately excluded the file, leaving the cold-start timeout live for
    // every userscript user. A ~12s cold start of the one-file companion exe
    // does not fit in a 4/5-retry budget, so the retry buttons reported "still
    // not responding" on a perfectly healthy start.
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );
    assert.match(userscriptSource, /const AUTO_START_RETRY_BUDGET = 8;/,
        'the userscript must declare the same cold-start budget');

    // The settings-panel module reinstated the short budget at its own
    // "Start service" button while its ytkit.js twin had been fixed — the
    // module is the shipping path, so the timeout was live.
    const settingsPanelSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'features', 'settings-panel', 'index.js'),
        'utf8'
    );
    assert.doesNotMatch(settingsPanelSource, /tryAutoStart\(\s*[45]\s*\)/,
        'the settings panel must not pass a short retry budget');
    assert.doesNotMatch(`${moduleSource}\n${monolithSource}\n${userscriptSource}`, /tryAutoStart\(\s*[45]\s*\)/);
});

test('userscript twins carry the shipped extension fixes', () => {
    // The drift checker is feature-ID granular: a feature present in both files
    // counts as "in parity" no matter how stale the userscript copy is. These
    // four fixes shipped on the extension path and were never hand-ported.
    const userscriptSource = fs.readFileSync(
        path.join(__dirname, '..', 'YTKit.user.js'),
        'utf8'
    );

    // 6ebf7403 — localized YouTube action hooks.
    assert.ok(!userscriptSource.includes('_buttonAriaLabels'),
        'exact English aria-label matching must be gone; it no-ops on every other locale');
    assert.match(userscriptSource, /_buttonHookChains/,
        'watch-page action hooks must resolve through structural selector chains');

    // 2df33124 — resetting a channel to 1x must clear the stored speed.
    assert.match(userscriptSource, /if \(video\.playbackRate === 1\) delete speeds\[channelId\];/,
        'per-channel speed must be cleared when reset to 1x, not left stored');

    // d2561495 — focused mode is a watch-page feature.
    const focusedIdx = userscriptSource.indexOf("id: 'focusedMode'");
    assert.ok(focusedIdx > -1, 'focusedMode must exist in the userscript');
    assert.match(userscriptSource.slice(focusedIdx, focusedIdx + 400), /pages: \[PageTypes\.WATCH\]/,
        'focused mode must not hide the masthead on every page type');
});

test('quality ladder rungs the companion cannot honor are rejected', () => {
    // The static ladder promised 4K on a 720p upload and 480p on a video whose
    // lowest stream is 1080p. yt-dlp's cascade silently downloads something
    // else in both cases, so the picker looked like it worked.
    const probe = {
        formats: [
            { format_id: '137', has_video: true, has_audio: false, height: 1080 },
            { format_id: '136', has_video: true, has_audio: false, height: 720 },
            { format_id: '140', has_video: false, has_audio: true, height: 0 },
        ],
    };
    const summary = summarizeFormatProbe(probe);
    assert.deepEqual(summary.heights, [1080, 720]);
    assert.equal(summary.maxHeight, 1080);
    assert.equal(summary.minHeight, 720);
    assert.equal(summary.formatCount, 3, 'audio-only entries still count as formats');
    assert.equal(summary.canHonor('best'), true, 'Best is always honorable');
    assert.equal(summary.canHonor('1080'), true);
    assert.equal(summary.canHonor('720'), true);
    assert.equal(summary.canHonor('2160'), false, 'nothing at or above 4K exists');
    assert.equal(summary.canHonor('1440'), false);
    assert.equal(summary.canHonor('480'), false, 'no stream is at or below 480p');
});

test('a probe with no video streams honors nothing but Best', () => {
    const summary = summarizeFormatProbe({ formats: [{ has_video: false, has_audio: true, height: 0 }] });
    assert.deepEqual(summary.heights, []);
    assert.equal(summary.maxHeight, 0);
    assert.equal(summary.canHonor('best'), true);
    assert.equal(summary.canHonor('1080'), false);
    // Malformed payloads must not throw on the way to the status line.
    assert.equal(summarizeFormatProbe(null).formatCount, 0);
    assert.equal(summarizeFormatProbe({ formats: 'nope' }).formatCount, 0);
});

test('the quality row probes the companion /formats endpoint', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'features', 'download-ui', 'index.js'),
        'utf8'
    );
    const start = source.indexOf('const applyFormatProbe');
    assert.ok(start > -1, 'the popup must apply a format probe');
    const block = source.slice(start, start + 4000);
    assert.match(block, /MediaDLManager\.baseUrl\(\) \+ '\/formats'/,
        'the probe must call the companion endpoint that already ships');
    assert.match(block, /'X-Auth-Token': status\.token/,
        'the probe must authenticate like every other companion call');
    assert.match(block, /summarizeFormatProbe\(probe\)/,
        'availability must come from the shared, tested helper');
});
