'use strict';

// The userscript build has no native messaging channel and its manager sends
// no extension Origin, so it pairs with Astra Downloader once, through a
// window the user opens in the companion, and keeps the token in the
// manager's private storage. These drive the real MediaDLManager against a
// fake companion.

const test = require('node:test');
const assert = require('node:assert/strict');
const { DURABLE_DOMAIN_REGISTRY } = require('../../extension/core/persisted-domains');

const USERSCRIPT_ID = 'astra-deck-userscript';
const TOKEN_KEY = 'ytkit_mediadl_userscript_token';
const TOKEN = 'c'.repeat(32);

function loadDownloadUi() {
    const modulePath = '../../extension/features/download-ui/index.js';
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(modulePath)];
    globalThis.YTKitFeatures = {};
    const mod = require(modulePath);
    globalThis.YTKitFeatures = originalFeatures;
    return mod;
}

// A companion on 9751. `pairing` is 'open' (hand over the token once),
// 'closed', or 'none' (the route never answers with a token).
function fakeCompanion({ pairing = 'closed', token = TOKEN, service = 'astra-downloader' } = {}) {
    const calls = [];
    let windowOpen = pairing === 'open';
    async function extensionFetchJson(details) {
        const url = String(details.url || '');
        const headers = details.headers || {};
        calls.push({ method: details.method || 'GET', url, headers, data: details.data, timeout: details.timeout });
        if (!url.startsWith('http://127.0.0.1:9751/')) throw new Error('connection refused');
        if (url.endsWith('/pair-extension')) {
            assert.equal(JSON.parse(details.data).id, USERSCRIPT_ID);
            if (windowOpen) {
                windowOpen = false;
                return { data: { ok: true, paired: true, userscript: true, token, service: 'astra-downloader', api: 3 } };
            }
            const error = new Error('HTTP 403');
            error.response = { status: 403 };
            error.data = { ok: false, paired: false, code: 'userscript-pairing-closed' };
            throw error;
        }
        if (url.endsWith('/health')) {
            const data = {
                service,
                token_required: true,
                legacyTokenEcho: false,
                paired: false,
                nativeChannelRequired: true,
                port: 9751,
                version: '2.16.0',
                downloads: 0,
            };
            if ('X-Auth-Token' in headers) data.authorized = headers['X-Auth-Token'] === token;
            return { data };
        }
        throw new Error('unexpected ' + url);
    }
    return { calls, extensionFetchJson };
}

function manager(companion, store = {}, extra = {}) {
    const mod = loadDownloadUi();
    const result = mod.createDownloadUIFeature({
        getExtensionRuntimeId: () => USERSCRIPT_ID,
        requestNativeDownloaderToken: async () => ({ token: null, error: 'Native messaging is unavailable in the userscript.' }),
        extensionFetchJson: companion.extensionFetchJson,
        storageRead: (key, fallback) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback),
        storageWrite: (key, value) => { store[key] = value; },
        DebugManager: { log() {} },
        ...extra,
    });
    return { MediaDLManager: result.MediaDLManager, result, store };
}

test('an open pairing window hands the userscript its token, which it keeps', async () => {
    const companion = fakeCompanion({ pairing: 'open' });
    const { MediaDLManager, store } = manager(companion);

    const status = await MediaDLManager.check(true);

    assert.equal(status.ok, true);
    assert.equal(status.token, TOKEN);
    assert.equal(status.tokenSource, 'userscript');
    assert.equal(store[TOKEN_KEY], TOKEN);
    assert.equal(MediaDLManager._headers()['X-MDL-Token-Source'], 'userscript');
});

test('a saved token is used without pairing again', async () => {
    const companion = fakeCompanion({ pairing: 'closed' });
    const { MediaDLManager } = manager(companion, { [TOKEN_KEY]: TOKEN });

    const status = await MediaDLManager.check(true);

    assert.equal(status.ok, true);
    assert.equal(status.token, TOKEN);
    assert.ok(!companion.calls.some((call) => call.url.endsWith('/pair-extension')));
    assert.ok(companion.calls.some((call) => call.headers['X-Auth-Token'] === TOKEN),
        'the saved token is checked against /health');
});

test('a regenerated companion token clears the saved one and asks to pair', async () => {
    const companion = fakeCompanion({ pairing: 'closed', token: 'd'.repeat(32) });
    const { MediaDLManager, store } = manager(companion, { [TOKEN_KEY]: TOKEN });

    const status = await MediaDLManager.check(true);

    assert.equal(status.ok, false);
    assert.equal(status.nativeChannelRequired, true);
    assert.equal(store[TOKEN_KEY], '');
    assert.ok(companion.calls.some((call) => call.url.endsWith('/pair-extension')));
    assert.equal(MediaDLManager._needsUserscriptPairing(), true);
});

test('the saved token never goes to a server that does not name itself', async () => {
    const companion = fakeCompanion({ pairing: 'closed', service: null });
    const { MediaDLManager } = manager(companion, { [TOKEN_KEY]: TOKEN });

    const status = await MediaDLManager.check(true);

    assert.equal(status.ok, false);
    assert.ok(!companion.calls.some((call) => call.headers['X-Auth-Token'] === TOKEN));
});

test('the extension never treats a pairing response token as its own', async () => {
    const companion = fakeCompanion({ pairing: 'open' });
    const store = {};
    const mod = loadDownloadUi();
    const { MediaDLManager } = mod.createDownloadUIFeature({
        getExtensionRuntimeId: () => 'abcdefghijklmnopabcdefghijklmnop',
        requestNativeDownloaderToken: async () => ({ token: null, error: 'host missing' }),
        extensionFetchJson: async (details) => {
            if (String(details.url).endsWith('/pair-extension')) {
                return { data: { ok: true, paired: true, userscript: true, token: TOKEN } };
            }
            return companion.extensionFetchJson(details);
        },
        storageRead: (key, fallback) => (key in store ? store[key] : fallback),
        storageWrite: (key, value) => { store[key] = value; },
        DebugManager: { log() {} },
    });

    const status = await MediaDLManager.check(true);

    assert.equal(status.ok, false);
    assert.equal(store[TOKEN_KEY], undefined);
});

test('an unpaired userscript download names the pairing step, not an update', async () => {
    const companion = fakeCompanion({ pairing: 'closed' });
    const toasts = [];
    const diagnostics = [];
    const promptModes = [];
    const protocolLaunches = [];
    const { MediaDLManager, result } = manager(companion, {}, {
        showToast: (...args) => toasts.push(args),
        openProtocol: (url) => protocolLaunches.push(url),
        DiagnosticLog: { record: (...args) => diagnostics.push(args) },
    });
    MediaDLManager.showInstallPrompt = (mode) => promptModes.push(mode);

    await result.ytKitDownload('https://www.youtube.com/watch?v=abcdefghijk', false);

    assert.deepEqual(protocolLaunches, [], 'the companion is running; launching it fixes nothing');
    assert.deepEqual(promptModes, ['retry']);
    assert.ok(toasts.some(([message]) => /Pair userscript/.test(message)));
    assert.ok(!toasts.some(([message]) => /Download setup/.test(message)));
    assert.ok(diagnostics.some(([kind, detail]) => kind === 'download-failure' && /userscript-pairing-required/.test(detail)));
});

test('the userscript gives the companion time to answer through its manager', async () => {
    // Tampermonkey in Firefox adds one to two seconds to each round trip.
    const companion = fakeCompanion({ pairing: 'open' });
    const { MediaDLManager } = manager(companion);

    await MediaDLManager.check(true);

    const health = companion.calls.find((call) => call.url === 'http://127.0.0.1:9751/health');
    const pair = companion.calls.find((call) => call.url.endsWith('/pair-extension'));
    assert.ok(health.timeout >= 5000, 'health probe timeout ' + health.timeout);
    assert.ok(pair.timeout >= 5000, 'pairing timeout ' + pair.timeout);

    const extension = fakeCompanion();
    const mod = loadDownloadUi();
    await mod.createDownloadUIFeature({
        getExtensionRuntimeId: () => 'abcdefghijklmnopabcdefghijklmnop',
        requestNativeDownloaderToken: async () => ({ token: TOKEN, error: null }),
        extensionFetchJson: extension.extensionFetchJson,
        DebugManager: { log() {} },
    }).MediaDLManager.check(true);
    assert.equal(extension.calls[0].timeout, 1500, 'the extension keeps its short probe');
});

function slowRefusals() {
    let inFlight = 0;
    let most = 0;
    const urls = [];
    return {
        urls,
        most: () => most,
        extensionFetchJson: (details) => {
            urls.push(details.url);
            inFlight += 1;
            most = Math.max(most, inFlight);
            return new Promise((resolve, reject) => setTimeout(() => {
                inFlight -= 1;
                reject(new Error('connection refused'));
            }, 20));
        },
    };
}

test('with no companion running, the userscript asks the other ports at once', async () => {
    const network = slowRefusals();
    const { MediaDLManager } = manager(network);
    const ports = MediaDLManager._PORT_CANDIDATES.length;

    await MediaDLManager.check(true);

    assert.equal(network.urls.length, ports, 'each port is asked once');
    assert.equal(network.most(), ports - 1, 'the known port first, then the rest together');

    const extensionNetwork = slowRefusals();
    const mod = loadDownloadUi();
    await mod.createDownloadUIFeature({
        getExtensionRuntimeId: () => 'abcdefghijklmnopabcdefghijklmnop',
        requestNativeDownloaderToken: async () => ({ token: null, error: 'host missing' }),
        extensionFetchJson: extensionNetwork.extensionFetchJson,
        DebugManager: { log() {} },
    }).MediaDLManager.check(true);
    assert.equal(extensionNetwork.most(), 1, 'the extension still asks one port at a time');
});

test('the userscript token is registered and never backed up', () => {
    const entry = DURABLE_DOMAIN_REGISTRY.find((domain) => domain.key === TOKEN_KEY);
    assert.ok(entry, 'the storage key is in the persisted-domain registry');
    assert.equal(entry.backup, 'exclude');
    assert.equal(entry.credentialScrub, 'entire-domain');
});

test('a download from the watch page carries the video title', async () => {
    const companion = fakeCompanion({ pairing: 'closed' });
    const sent = [];
    const mod = loadDownloadUi();
    const { ytKitDownload } = mod.createDownloadUIFeature({
        getExtensionRuntimeId: () => USERSCRIPT_ID,
        requestNativeDownloaderToken: async () => ({ token: null, error: 'unavailable' }),
        storageRead: (key, fallback) => (key === TOKEN_KEY ? TOKEN : fallback),
        storageWrite() {},
        getVideoId: () => 'jNQXAC9IVRw',
        getPlayerResponseGlobal: () => ({ videoDetails: { videoId: 'jNQXAC9IVRw', title: 'Me at the zoo' } }),
        extensionFetchJson: async (details) => {
            if (String(details.url).endsWith('/download')) {
                sent.push(JSON.parse(details.data));
                return { response: { status: 200 }, data: { id: 'dl_1', status: 'downloading' } };
            }
            return companion.extensionFetchJson(details);
        },
        DebugManager: { log() {} },
    });

    await ytKitDownload('https://www.youtube.com/watch?v=jNQXAC9IVRw', false);
    await ytKitDownload('https://www.youtube.com/watch?v=abcdefghijk', false);

    assert.equal(sent.length, 2, 'both downloads reached the companion');
    assert.equal(sent[0].title, 'Me at the zoo');
    assert.equal(sent[1].title, undefined, 'another video\'s title is never borrowed from this page');
});
