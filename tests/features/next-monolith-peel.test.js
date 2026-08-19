'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sources, config } = require('../helpers/source');

function loadFeatureModule(modulePath, namespaceKey) {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(modulePath)];
    globalThis.YTKitFeatures = {};
    const mod = require(modulePath);
    const exported = globalThis.YTKitFeatures[namespaceKey];
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
}

test('floatingLogoOnWatch module exports the Astra Player Dock runtime factory', () => {
    const { mod, exported } = loadFeatureModule(
        '../../extension/features/player-dock/index.js',
        'floatingLogoOnWatch'
    );

    assert.equal(typeof mod.createFloatingLogoOnWatchFeature, 'function');
    assert.equal(typeof exported.createFloatingLogoOnWatchFeature, 'function');
});

test('floatingLogoOnWatch factory returns the player dock runtime surface', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/player-dock/index.js',
        'floatingLogoOnWatch'
    );
    const feature = mod.createFloatingLogoOnWatchFeature();

    assert.equal(feature.id, 'floatingLogoOnWatch');
    assert.equal(feature.name, 'Astra Player Dock');
    assert.equal(feature._ruleId, 'floatingLogoRule');
    for (const method of ['init', 'destroy', '_cleanup', '_getLogoHref', '_inject']) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
});

test('youtubeMusicCompat module exports the YouTube Music runtime factory', () => {
    const { mod, exported } = loadFeatureModule(
        '../../extension/features/youtube-music-compat/index.js',
        'youtubeMusicCompat'
    );

    assert.equal(typeof mod.createYoutubeMusicCompatFeature, 'function');
    assert.equal(typeof exported.createYoutubeMusicCompatFeature, 'function');
});

test('youtubeMusicCompat factory returns the YouTube Music runtime surface', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/youtube-music-compat/index.js',
        'youtubeMusicCompat'
    );
    const feature = mod.createYoutubeMusicCompatFeature();

    assert.equal(feature.id, 'youtubeMusicCompat');
    assert.equal(feature.name, 'YouTube Music Compatibility');
    assert.equal(feature.group, 'Integrations');
    assert.equal(typeof feature.init, 'function');
    assert.equal(typeof feature.destroy, 'function');
});

test('floatingLogoOnWatch monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.floatingLogoOnWatch?.createFloatingLogoOnWatchFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct floatingLogoOnWatch through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'floatingLogoOnWatch'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline floatingLogoOnWatch fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('}) || {'),
        'module factory path must fall back to the inline feature object');

    for (const dep of [
        'appState',
        'getFeatureById',
        't',
        'showDownloadPopup',
        'showSpeedPopup',
        'toggleSettingsPanel',
        'BRAND',
        'appendStyleSheet',
        'addNavigateRule',
        'removeNavigateRule'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
    assert.ok(dependencyBag.includes('ICONS: globalThis.YTKitCore?.ICONS'),
        'factory dependency bag must avoid the later-declared local ICONS binding');
});

test('youtubeMusicCompat monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.youtubeMusicCompat?.createYoutubeMusicCompatFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct youtubeMusicCompat through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'youtubeMusicCompat'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline youtubeMusicCompat fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('}) || {'),
        'module factory path must fall back to the inline feature object');
    assert.ok(dependencyBag.includes('injectStyle'),
        'ytkit.js factory dependency bag must include injectStyle');
});

test('Next-2 peel modules load before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        for (const modulePath of [
            'features/player-dock/index.js',
            'features/youtube-music-compat/index.js'
        ]) {
            const moduleIndex = scripts.indexOf(modulePath);
            assert.ok(moduleIndex > -1, 'manifest content script must include ' + modulePath);
            assert.ok(moduleIndex < ytkitIndex, modulePath + ' must load before ytkit.js');
        }
    }
});

// ── Download UI peel ──

test('downloadUI module exports the download UI factory', () => {
    const { mod, exported } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );

    assert.equal(typeof mod.createDownloadUIFeature, 'function');
    assert.equal(typeof exported, 'function');
});

test('downloadUI factory returns all required exports', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const result = mod.createDownloadUIFeature();

    assert.equal(typeof result.showDownloadPopup, 'function');
    assert.equal(typeof result.ytKitDownload, 'function');
    assert.ok(result.MediaDLManager, 'factory must return MediaDLManager');
    assert.equal(typeof result.MediaDLManager.check, 'function');
    assert.equal(typeof result.MediaDLManager.tryAutoStart, 'function');
    assert.equal(typeof result.MediaDLManager.resetAutoStart, 'function');
    assert.equal(typeof result.MediaDLManager.showInstallPrompt, 'function');
    assert.equal(typeof result.MediaDLManager.updateYtdlp, 'function');
    assert.equal(typeof result.MediaDLManager.updateCompanion, 'function');
    assert.equal(typeof result.MediaDLManager.baseUrl, 'function');
    assert.equal(typeof result.showDownloadProgress, 'function');
    assert.equal(typeof result._closeDlPopup, 'function');
    assert.equal(typeof result._mediaDLSendDownload, 'function');
    assert.equal(typeof result._fetchServerConfig, 'function');
    assert.equal(typeof result.classifyDownloaderFailureResponse, 'function');
    assert.equal(typeof result.showDownloaderFailure, 'function');
    assert.equal(typeof result.showNativeChannelRequired, 'function');
});

test('downloadUI Settings installer downloads the real GitHub release asset', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const calls = [];
    const result = mod.createDownloadUIFeature({
        triggerDownload: async (...args) => { calls.push(args); },
    });

    assert.equal(
        result.MediaDLManager.INSTALLER_URL,
        'https://github.com/SysAdminDoc/AstraDownloader/releases/latest/download/AstraDownloader.exe'
    );
    assert.equal(await result.MediaDLManager.downloadInstaller(), true);
    assert.deepEqual(calls, [[
        result.MediaDLManager.INSTALLER_URL,
        'AstraDownloader.exe',
        { showInFolder: true },
    ]]);
});

test('downloadUI MediaDLManager prefers native messaging token over /health token echo', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const calls = [];
    const result = mod.createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: 'native-token' }),
        extensionFetchJson: async (details) => {
            calls.push(details);
            return {
                data: {
                    service: 'astra-downloader',
                    token_required: true,
                    port: 9751,
                    version: '1.5.1',
                    downloads: 0,
                },
            };
        },
        DebugManager: { log() {} },
    });

    const status = await result.MediaDLManager.check(true);

    assert.equal(status.ok, true);
    assert.equal(status.token, 'native-token');
    assert.equal(status.tokenSource, 'native');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['X-MDL-Token-Source'], 'native');
});

test('downloadUI MediaDLManager falls back to legacy /health token when native messaging is unavailable', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const calls = [];
    const result = mod.createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: null, error: 'host missing' }),
        extensionFetchJson: async (details) => {
            calls.push(details);
            return {
                data: {
                    service: 'astra-downloader',
                    token_required: true,
                    token: 'legacy-token',
                    port: 9751,
                    version: '1.5.1',
                    downloads: 0,
                },
            };
        },
        DebugManager: { log() {} },
    });

    const status = await result.MediaDLManager.check(true);

    assert.equal(status.ok, true);
    assert.equal(status.token, 'legacy-token');
    assert.equal(status.tokenSource, 'legacy-health');
    assert.equal(status.nativeTokenError, 'host missing');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['X-MDL-Token-Source'], undefined);
});

test('downloadUI never requests cookies for a legacy-health token', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const requests = [];
    const diagnostics = [];
    let nativeProofRequests = 0;
    let cookieRequests = 0;
    const result = mod.createDownloadUIFeature({
        requestNativeDownloaderToken: async () => {
            nativeProofRequests += 1;
            return { token: 'native-token' };
        },
        browserCookies: {
            async getDownloadHandoff() {
                cookieRequests += 1;
                return { cookies: [] };
            }
        },
        extensionFetchJson: async (details) => {
            requests.push(details);
            return {
                response: { status: 202, responseText: '{}' },
                data: { error: 'fixture' }
            };
        },
        DiagnosticLog: { record: (...args) => diagnostics.push(args) },
        DebugManager: { log() {} },
        showToast() {}
    });
    result.MediaDLManager._tokenSource = 'legacy-health';

    await result._mediaDLSendDownload(
        'https://www.youtube.com/watch?v=abcdefghijk',
        false,
        'legacy-health-secret'
    );

    assert.equal(nativeProofRequests, 0);
    assert.equal(cookieRequests, 0);
    assert.equal(Object.hasOwn(JSON.parse(requests[0].data), 'cookies'), false);
    assert.ok(diagnostics.some(([kind, detail]) => kind === 'cookie-handoff'
        && /legacy-token-withheld/.test(detail)));
    assert.equal(JSON.stringify(diagnostics).includes('legacy-health-secret'), false);
});

test('downloadUI uses a fresh native capability and discloses the first cookie-bearing handoff once', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const cookieCapabilitySecret = 'capability-secret';
    const loginSecret = 'login-cookie-secret';
    const sidSecret = 'sid-cookie-secret';
    const requests = [];
    const toasts = [];
    const diagnostics = [];
    const storage = new Map();
    const storageWrites = [];
    const proofOptions = [];
    const result = mod.createDownloadUIFeature({
        requestNativeDownloaderToken: async (options) => {
            proofOptions.push(options);
            return {
                token: 'native-download-token',
                service: 'astra-downloader',
                api: 2,
                cookieCapability: {
                    token: cookieCapabilitySecret,
                    protocolVersion: 1,
                    expiresAt: Date.now() + 20000
                }
            };
        },
        browserCookies: {
            async getDownloadHandoff(capability) {
                assert.equal(capability.token, cookieCapabilitySecret);
                return {
                    cookies: [
                        { domain: '.youtube.com', name: 'LOGIN_INFO', value: loginSecret, path: '/', secure: true, httpOnly: true },
                        { domain: '.youtube.com', name: 'SAPISID', value: sidSecret, path: '/', secure: true }
                    ],
                    diagnostics: {
                        protocolVersion: 1,
                        acceptedCount: 2,
                        acceptedBytes: 37,
                        droppedCount: 3
                    }
                };
            }
        },
        extensionFetchJson: async (details) => {
            requests.push(details);
            return {
                response: { status: 202, responseText: '{}' },
                data: { error: 'fixture' }
            };
        },
        storageRead: (key, fallback) => storage.has(key) ? storage.get(key) : fallback,
        storageWrite: async (key, value) => {
            storage.set(key, value);
            storageWrites.push([key, value]);
        },
        showToast: (...args) => toasts.push(args),
        DiagnosticLog: { record: (...args) => diagnostics.push(args) },
        DebugManager: { log() {} }
    });
    result.MediaDLManager._tokenSource = 'native';

    await result._mediaDLSendDownload(
        'https://www.youtube.com/watch?v=abcdefghijk',
        false,
        'native-download-token'
    );
    await result._mediaDLSendDownload(
        'https://www.youtube.com/watch?v=abcdefghijk',
        false,
        'native-download-token'
    );

    assert.deepEqual(proofOptions, [{ cookieHandoff: true }, { cookieHandoff: true }]);
    assert.equal(requests.length, 2);
    assert.equal(JSON.parse(requests[0].data).cookies.length, 2);
    assert.equal(storageWrites.length, 1);
    assert.deepEqual(storageWrites[0], ['ytkit_cookie_handoff_disclosed_v1', true]);
    assert.equal(toasts.filter(([message]) => /only the required YouTube sign-in cookies/i.test(message)).length, 1);

    const serializedDiagnostics = JSON.stringify(diagnostics);
    for (const secret of [cookieCapabilitySecret, loginSecret, sidSecret, 'LOGIN_INFO', 'SAPISID']) {
        assert.equal(serializedDiagnostics.includes(secret), false,
            'cookie diagnostics must include counts only');
    }
    assert.match(serializedDiagnostics, /status=ok protocol=1 accepted=2 bytes=37 dropped=3/);
});

test('downloadUI MediaDLManager reports native-channel-required when legacy health token echo is disabled', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const calls = [];
    const result = mod.createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: null, error: 'host missing' }),
        extensionFetchJson: async (details) => {
            calls.push(details);
            if (calls.length > 1) throw new Error('closed');
            return {
                data: {
                    service: 'astra-downloader',
                    token_required: true,
                    legacyTokenEcho: false,
                    nativeChannelRequired: true,
                    port: 9751,
                    version: '1.6.0',
                    downloads: 0,
                },
            };
        },
        DebugManager: { log() {} },
    });

    const status = await result.MediaDLManager.check(true);

    assert.equal(status.ok, false);
    assert.equal(status.nativeChannelRequired, true);
    assert.equal(status.nativeTokenError, 'host missing');
    assert.equal(status.tokenSource, 'native-required');
    assert.equal(status.version, '1.6.0');
    assert.equal(calls[0].headers['X-MDL-Token-Source'], undefined);
});

test('downloadUI native-channel-required failures show recovery copy without install prompt', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const toasts = [];
    const diagnostics = [];
    const protocolLaunches = [];
    let healthCalls = 0;
    const result = mod.createDownloadUIFeature({
        requestNativeDownloaderToken: async () => ({ token: null, error: 'host missing' }),
        extensionFetchJson: async () => {
            healthCalls += 1;
            if (healthCalls > 1) throw new Error('closed');
            return {
                data: {
                    service: 'astra-downloader',
                    token_required: true,
                    legacyTokenEcho: false,
                    nativeChannelRequired: true,
                    port: 9751,
                    version: '1.6.0',
                },
            };
        },
        showToast: (...args) => { toasts.push(args); },
        openProtocol: (url) => { protocolLaunches.push(url); },
        DiagnosticLog: { record: (...args) => diagnostics.push(args) },
        DebugManager: { log() {} },
    });

    await result.ytKitDownload('https://www.youtube.com/watch?v=abcdefghijk', false);

    assert.equal(protocolLaunches.length, 0);
    assert.ok(toasts.some(([message]) => /browser native messaging/i.test(message)));
    assert.ok(toasts.some(([message]) => /native host registration/i.test(message)));
    assert.ok(toasts.some(([message]) => /host missing/i.test(message)));
    assert.ok(diagnostics.some(([kind, detail]) => kind === 'download-failure' && /native-channel-required/.test(detail)));
});

test('downloadUI classifies companion failure codes into recovery copy', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const result = mod.createDownloadUIFeature();
    const expected = new Map([
        ['po-token-required', /PO token/i],
        ['po-provider-stale', /provider/i],
        ['sabr-limited', /SABR/i],
        ['deno-runtime-missing', /Deno/i],
        ['js-runtime-missing', /JavaScript runtime/i],
        ['js-runtime-unverified', /verified|repair/i],
        ['js-runtime-unsupported', /update|upgrade/i],
        ['ejs-runtime-not-ready', /readiness|repair/i],
        ['sign-in-required', /signed-in|Sign in/i],
        ['ffmpeg-missing-or-stale', /ffmpeg/i],
        ['network-unreachable', /network/i],
    ]);

    for (const [code, pattern] of expected) {
        const classified = result.classifyDownloaderFailureResponse({ error_code: code });

        assert.equal(classified.code, code);
        assert.match(classified.message + ' ' + classified.advice, pattern);
        assert.equal(typeof classified.nextAction, 'string');
        assert.ok(classified.nextAction.length > 0);
    }
});

test('downloadUI classified failures render recovery toast and diagnostic code', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const toasts = [];
    const diagnostics = [];
    const result = mod.createDownloadUIFeature({
        extensionFetchJson: async () => ({
            response: { status: 422, responseText: '{"error_code":"po-token-required"}' },
            data: {
                error_code: 'po-token-required',
                error: 'PO token required by YouTube',
                advice: 'Start bgutil-ytdlp-pot-provider on 127.0.0.1:4416.',
                next_action: 'start-po-token-provider',
            },
        }),
        showToast: (...args) => toasts.push(args),
        DiagnosticLog: { record: (...args) => diagnostics.push(args) },
        browserCookies: {},
        DebugManager: { log() {} },
    });

    await result._mediaDLSendDownload('https://www.youtube.com/watch?v=abcdefghijk', false, 'token');

    assert.equal(toasts.length, 1);
    assert.match(toasts[0][0], /PO token required/i);
    assert.match(toasts[0][0], /127\.0\.0\.1:4416/);
    assert.deepEqual(diagnostics[0][0], 'download-failure');
    assert.match(diagnostics[0][1], /po-token-required/);
});

test('downloadUI sends reviewed clip and playlist selections without exposing yt-dlp flags', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const calls = [];
    const result = mod.createDownloadUIFeature({
        extensionFetchJson: async (details) => {
            calls.push(details);
            return {
                response: { status: 400, responseText: '{"error":"fixture"}' },
                data: { error: 'fixture' },
            };
        },
        showToast() {},
        browserCookies: {},
        DebugManager: { log() {} },
    });

    await result._mediaDLSendDownload(
        'https://www.youtube.com/watch?v=abcdefghijk',
        false,
        'token',
        {
            format: 'mp4',
            section: { start: 62.5, end: 65 },
            playlistItems: [1, 3, 5],
        }
    );

    const payload = JSON.parse(calls[0].data);
    assert.deepEqual(payload.section, { start: 62.5, end: 65 });
    assert.deepEqual(payload.playlistItems, [1, 3, 5]);
    assert.equal(payload.format, 'mp4');
    assert.equal(Object.hasOwn(payload, 'args'), false);
    assert.equal(Object.hasOwn(payload, 'downloadSections'), false);
    assert.equal(Object.hasOwn(payload, 'playlist-items'), false);
    assert.equal(Object.hasOwn(payload, 'playlistRange'), false);
});

test('downloadUI playlist chooser uses preview endpoint and canonical subset request', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'download-ui', 'index.js'),
        'utf8'
    );

    assert.match(source, /MediaDLManager\.baseUrl\(\) \+ '\/playlist'/);
    assert.match(source, /https:\/\/www\.youtube\.com\/playlist\?list=/);
    assert.match(source, /opts\.playlistItems = Array\.from\(playlistSelection\)\.sort/);
    // An EMPTY selection must fall through to the single video, matching the
    // hint above the button ("Without a selection, this video downloads
    // normally."). The old hard block contradicted that copy and created a
    // dead end whose only escape was reopening the popup.
    assert.match(source, /if \(playlistSelection\.size\) \{/);
    assert.doesNotMatch(source, /Select at least one playlist item/);
    assert.match(source, /if \(clip\.section\)/);
    assert.match(source, /playlistList\.setAttribute\('aria-label'/);
    assert.match(source, /checkbox\.type = 'checkbox'/);
});

test('downloadUI factory returns all four feature objects', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const result = mod.createDownloadUIFeature();

    for (const featureId of [
        'downloadHealthPanel',
        'downloadStreamLinksPanel',
        'downloadCobaltFallback',
        'downloadHistoryPanel'
    ]) {
        const feature = result[featureId];
        assert.ok(feature, `factory must return ${featureId}`);
        assert.equal(feature.id, featureId, `${featureId} must have correct id`);
        assert.equal(typeof feature.init, 'function', `${featureId} must have init()`);
        assert.equal(typeof feature.destroy, 'function', `${featureId} must have destroy()`);
        assert.equal(feature.group, 'Downloads', `${featureId} must be in Downloads group`);
    }
});

test('download history sends bounded filters and preserves page metadata', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/download-ui/index.js',
        'createDownloadUIFeature'
    );
    const calls = [];
    const expected = {
        history: [{ id: 'row-51' }],
        count: 1,
        total: 120,
        filteredTotal: 61,
        offset: 50,
        limit: 50,
        hasMore: true,
        sort: 'oldest',
    };
    const result = mod.createDownloadUIFeature({
        extensionFetchJson: async (details) => {
            calls.push(details);
            return { data: expected };
        },
        DebugManager: { log() {} },
    });
    result.MediaDLManager.check = async () => ({ ok: true, token: 'history-token' });
    result.MediaDLManager.baseUrl = () => 'http://127.0.0.1:9751';
    Object.assign(result.downloadHistoryPanel._filters, {
        q: 'lecture',
        status: 'complete',
        format: 'mp4',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        sort: 'oldest',
        offset: 50,
    });

    const response = await result.downloadHistoryPanel._fetchHistory();

    assert.deepEqual(response, expected);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/history');
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.get('offset'), '50');
    assert.equal(url.searchParams.get('q'), 'lecture');
    assert.equal(url.searchParams.get('status'), 'complete');
    assert.equal(url.searchParams.get('format'), 'mp4');
    assert.equal(url.searchParams.get('dateFrom'), '2026-07-01');
    assert.equal(url.searchParams.get('dateTo'), '2026-07-31');
    assert.equal(url.searchParams.get('sort'), 'oldest');
    assert.equal(calls[0].headers.Authorization, 'Bearer history-token');
});

test('downloadUI module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const modulePath = 'features/download-ui/index.js';
        const moduleIndex = scripts.indexOf(modulePath);
        assert.ok(moduleIndex > -1, 'manifest content script must include ' + modulePath);
        assert.ok(moduleIndex < ytkitIndex, modulePath + ' must load before ytkit.js');
    }
});

test('downloadUI monolith uses the canonical factory with an artifact-safe fallback', () => {
    const factoryLookup = 'const createDownloadUIFeature = globalThis.YTKitFeatures?.createDownloadUIFeature;';
    assert.ok(sources.ytkit.includes(factoryLookup),
        'ytkit.js must resolve the preloaded downloadUI factory explicitly');
    assert.ok(sources.ytkit.includes('createUnavailableDownloadUIFeature'),
        'ytkit.js must keep the rest of the runtime alive when the store artifact omits the module');

    // Verify the monolith constructs _downloadUI from the required module factory.
    const factoryNeedle = 'const _downloadUI = typeof createDownloadUIFeature === \'function\'';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct _downloadUI through the module factory');

    // Verify the dependency bag includes key deps
    const bagEnd = sources.ytkit.indexOf('});', factoryIndex);
    assert.ok(bagEnd > factoryIndex, 'factory construction must close normally');
    const dependencyBag = sources.ytkit.slice(factoryIndex, bagEnd);
    for (const dep of [
        'appState',
        'extensionFetchJson',
        'showToast',
        'DebugManager',
        'DiagnosticLog',
        'storageRead',
        'storageWrite',
        'getVideoId',
        'isWatchPagePath',
        'addNavigateRule',
        'removeNavigateRule',
        'injectStyle',
        'openExternalUrl',
        'openProtocol',
        'triggerDownload',
        'requestNativeDownloaderToken',
        'browserCookies',
        'getProfileExportMode',
        'BRAND',
        't',
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }

    // Every extension download feature must come from the module; retaining an
    // inline fallback creates two independently drifting implementations.
    for (const featureId of [
        'downloadHealthPanel',
        'downloadStreamLinksPanel',
        'downloadCobaltFallback',
        'downloadHistoryPanel'
    ]) {
        assert.ok(sources.ytkit.includes(`_downloadUI.${featureId}`),
            `ytkit.js must use the canonical ${featureId} object`);
        assert.ok(!sources.ytkit.includes(`_downloadUI?.${featureId} || {`),
            `ytkit.js must not retain an inline ${featureId} fallback`);
        assert.ok(!sources.ytkit.includes(`id: '${featureId}'`),
            `ytkit.js must not duplicate the ${featureId} implementation`);
    }

    for (const duplicate of [
        'function showDownloadProgress',
        'const MediaDLManager = {',
        'function showDownloadPopup',
        'function normalizeCookieExpiry',
    ]) {
        assert.ok(!sources.ytkit.includes(duplicate),
            `ytkit.js must not duplicate canonical download implementation: ${duplicate}`);
    }
});

// ── Subscription Groups peel ──

test('subscriptionGroups module exports the runtime factory', () => {
    const { mod, exported } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );

    assert.equal(typeof mod.createSubscriptionGroupsFeature, 'function');
    assert.equal(typeof exported.createSubscriptionGroupsFeature, 'function');
});

test('subscriptionGroups factory returns the group management runtime surface', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const feature = mod.createSubscriptionGroupsFeature();

    assert.equal(feature.id, 'subscriptionGroups');
    assert.equal(feature.name, 'Subscription Groups');
    assert.equal(feature.group, 'Subscriptions');
    assert.equal(feature._GROUPS_KEY, 'subscriptionGroupData');
    assert.deepEqual(feature._SORT_MODES, Object.freeze(['default', 'date-desc', 'duration-asc', 'unwatched', 'new-since-last-visit', 'popular']));
    for (const method of [
        'init',
        'destroy',
        '_renderToolbar',
        '_applyGroupFilter',
        '_exportGroups',
        '_exportGroupsCsv',
        '_exportGroupsOpml',
        '_importGroups',
        '_importGroupsOpml',
        '_buildGroupsOpml',
        '_parseGroupsOpml',
        '_toggleMembersPanel',
        '_playGroupAsQueue',
        '_generateAiTagsForGroup',
        '_runCardBatch',
        '_cancelAllBudgetedScans',
        '_recordScanDiagnostics'
    ]) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
});

test('subscriptionGroups archives active groups through the extension fetch bridge', async () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const requests = [];
    const toasts = [];
    const feature = mod.createSubscriptionGroupsFeature({
        appState: {
            settings: {
                subscriptionGroupData: {
                    coding: {
                        name: 'Coding',
                        channelIds: ['UCalpha', 'UCbeta'],
                    },
                },
            },
        },
        showToast: (...args) => toasts.push(args),
        MediaDLManager: {
            check: async () => ({ ok: true, token: 'companion-token' }),
            baseUrl: () => 'http://127.0.0.1:9751',
            _headers: (extra) => ({ ...extra, 'X-MDL-Client': 'MediaDL' }),
        },
        extensionFetchJson: async (details) => {
            requests.push(details);
            if (requests.length === 2) {
                const error = new Error('HTTP 409');
                error.response = { status: 409 };
                throw error;
            }
            return { response: { status: 201 }, data: { ok: true } };
        },
    });
    feature._activeGroupId = 'coding';

    await feature._archiveActiveGroup();

    assert.equal(requests.length, 2);
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url, 'http://127.0.0.1:9751/subscriptions');
    assert.equal(requests[0].headers['X-Auth-Token'], 'companion-token');
    assert.deepEqual(JSON.parse(requests[0].data), {
        url: 'https://www.youtube.com/channel/UCalpha',
        intervalMinutes: 60,
    });
    assert.match(toasts[0][0], /Scheduled 1/);
    assert.match(toasts[0][0], /already configured 1/);
});

test('subscriptionGroups module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const modulePath = 'features/subscription-groups/index.js';
        const moduleIndex = scripts.indexOf(modulePath);
        assert.ok(moduleIndex > -1, 'manifest content script must include ' + modulePath);
        assert.ok(moduleIndex < ytkitIndex, modulePath + ' must load before ytkit.js');
    }
});

test('subscriptionGroups monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.subscriptionGroups?.createSubscriptionGroupsFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct subscriptionGroups through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'subscriptionGroups'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline subscriptionGroups fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('}) || {'),
        'module factory path must fall back to the inline feature object');

    for (const dep of [
        'PageTypes',
        'appState',
        'injectStyle',
        'settingsManager',
        'DebugManager',
        'showToast',
        'getVideoId',
        'getUrlParam',
        'storageReadJSON',
        'storageWriteJSON',
        'addNavigateRule',
        'removeNavigateRule',
        'addMutationRule',
        'removeMutationRule',
        'runBudgetedElementBatch',
        'handleFileExport',
        'isSafeObjectKey'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
});

test('subscriptionGroups budgets high-card feed passes and cancels stale work', () => {
    const source = sources.ytkit;
    const factoryNeedle = 'globalThis.YTKitFeatures?.subscriptionGroups?.createSubscriptionGroupsFeature?.({';
    const factoryIndex = source.indexOf(factoryNeedle);
    const fallbackIndex = source.indexOf("id: 'subscriptionGroups'", factoryIndex);
    const dependencyBag = source.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('runBudgetedElementBatch'),
        'ytkit.js must pass the navigation batch budget helper into subscriptionGroups');

    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const featureSource = String(mod.createSubscriptionGroupsFeature);
    for (const label of [
        'subscription-groups:${safeLabel}',
        'group-filter',
        'content-type-filter',
        'new-since-markers',
        'stamp-last-visit',
        'dead-channel-markers'
    ]) {
        assert.ok(featureSource.includes(label),
            'subscriptionGroups budgeted scan source must include ' + label);
    }
    assert.ok(featureSource.includes('this._cancelAllBudgetedScans();'),
        'navigation-away and destroy paths must cancel pending subscription scans');
    assert.ok(featureSource.includes("DebugManager.log('SubGroups', `Budgeted scan"),
        'slow subscription scans must log budget diagnostics');
});

test('subscriptionGroups OPML export/import round-trips nested groups and channels', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const sourceAppState = {
        settings: {
            subscriptionGroupData: {
                coding: {
                    name: 'Coding',
                    color: '#22c55e',
                    channelIds: ['UCalpha1111111111111111'],
                    parentId: '',
                    sortMode: 'popular',
                    updatedAt: 1,
                },
                codingFrontend: {
                    name: 'Frontend',
                    color: '#7c3aed',
                    channelIds: ['UCbeta22222222222222222'],
                    parentId: 'coding',
                    sortMode: 'date-desc',
                    updatedAt: 1,
                },
            },
        },
    };
    const source = mod.createSubscriptionGroupsFeature({
        appState: sourceAppState,
        settingsManager: { save() {} },
        showToast() {},
    });

    const opml = source._buildGroupsOpml();

    assert.match(opml, /<opml version="2\.0"/);
    assert.match(opml, /astra:id="coding"/);
    assert.match(opml, /channel_id=UCalpha1111111111111111/);

    const targetAppState = { settings: { subscriptionGroupData: {} } };
    const target = mod.createSubscriptionGroupsFeature({
        appState: targetAppState,
        settingsManager: { save() {} },
        showToast() {},
    });
    target._renderToolbar = () => {};
    target._applyGroupFilter = () => {};
    target._renderDeadChannelMarkers = () => {};

    const result = target._importGroupsOpml(opml);
    const imported = targetAppState.settings.subscriptionGroupData;

    assert.equal(result.ok, true);
    assert.equal(imported.coding.name, 'Coding');
    assert.equal(imported.coding.sortMode, 'popular');
    assert.deepEqual(imported.coding.channelIds, ['UCalpha1111111111111111']);
    assert.equal(imported.codingFrontend.parentId, 'coding');
    assert.deepEqual(imported.codingFrontend.channelIds, ['UCbeta22222222222222222']);
});

test('subscriptionGroups OPML import deduplicates channels and exposes undo status', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const appState = {
        settings: {
            subscriptionGroupData: {
                previous: { name: 'Previous', color: '#7c3aed', channelIds: ['UCold'], parentId: '', sortMode: 'default', updatedAt: 1 },
            },
        },
    };
    const toasts = [];
    const feature = mod.createSubscriptionGroupsFeature({
        appState,
        settingsManager: { save() {} },
        showToast: (...args) => toasts.push(args),
    });
    feature._renderToolbar = () => {};
    feature._applyGroupFilter = () => {};
    feature._renderDeadChannelMarkers = () => {};
    const opml = `<?xml version="1.0"?>
<opml version="2.0"><body>
  <outline text="News" astra:type="group" astra:id="news">
    <outline type="rss" text="One" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UCone11111111111111111" />
    <outline type="rss" text="One duplicate" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UCone11111111111111111" />
    <outline type="rss" text="Two" htmlUrl="https://www.youtube.com/channel/UCtwo22222222222222222" />
  </outline>
</body></opml>`;

    const result = feature._importGroupsOpml(opml);

    assert.equal(result.ok, true);
    assert.equal(result.duplicateChannels, 1);
    assert.deepEqual(appState.settings.subscriptionGroupData.news.channelIds, [
        'UCone11111111111111111',
        'UCtwo22222222222222222',
    ]);
    assert.match(toasts[0][0], /skipped 1 duplicate channel/);
    assert.equal(toasts[0][2].action.text, 'Undo');

    toasts[0][2].action.onClick();
    assert.deepEqual(Object.keys(appState.settings.subscriptionGroupData), ['previous']);
});

test('subscriptionGroups OPML import reports malformed files without overwriting groups', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const appState = {
        settings: {
            subscriptionGroupData: {
                keep: { name: 'Keep', color: '#7c3aed', channelIds: ['UCkeep'], parentId: '', sortMode: 'default', updatedAt: 1 },
            },
        },
    };
    const toasts = [];
    const feature = mod.createSubscriptionGroupsFeature({
        appState,
        settingsManager: { save() {} },
        showToast: (...args) => toasts.push(args),
    });

    const result = feature._importGroupsOpml('<not-opml><outline text="Broken" /></not-opml>');

    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(appState.settings.subscriptionGroupData), ['keep']);
    assert.match(toasts[0][0], /OPML import failed/i);
});

test('subscriptionGroups factory wires the scoped mutation-rule helpers (init/destroy would ReferenceError otherwise)', () => {
    const factorySource = require('fs').readFileSync(
        require('path').join(__dirname, '../../extension/features/subscription-groups/index.js'), 'utf8');
    assert.match(factorySource, /addScopedMutationRule\s*=\s*\(\)\s*=>\s*\{\}/,
        'factory must destructure addScopedMutationRule from deps');
    assert.match(factorySource, /removeScopedMutationRule\s*=\s*\(\)\s*=>\s*\{\}/,
        'factory must destructure removeScopedMutationRule from deps');
    const callSite = sources.ytkit.slice(
        sources.ytkit.indexOf('createSubscriptionGroupsFeature?.({'));
    const passedBlock = callSite.slice(0, callSite.indexOf('}) || {'));
    assert.ok(/addScopedMutationRule/.test(passedBlock),
        'monolith must pass addScopedMutationRule into the subscriptionGroups factory');
    assert.ok(/removeScopedMutationRule/.test(passedBlock),
        'monolith must pass removeScopedMutationRule into the subscriptionGroups factory');
});

test('subscriptionGroups CSV export reads channelIds, not the non-existent channels array', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const csvSource = String(mod.createSubscriptionGroupsFeature({})._exportGroupsCsv);
    assert.ok(/group\.channelIds/.test(csvSource),
        'CSV export must iterate group.channelIds');
    assert.ok(!/Array\.isArray\(group\.channels\)/.test(csvSource),
        'CSV export must not read the never-populated group.channels array');
    assert.ok(/youtube\.com\/channel\//.test(csvSource),
        'CSV export must build a canonical channel URL from each id');
});

// ── Digital Wellbeing peel ──

test('digitalWellbeing watch-time accumulator advances past 30s (does not freeze on the save tick)', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/digital-wellbeing/index.js',
        'digitalWellbeing'
    );
    const saves = [];
    const feature = mod.createDigitalWellbeingFeature({
        appState: { settings: { dwDailyCapMin: 0, dwBreakIntervalMin: 0 } },
        settingsManager: { save: (s) => saves.push(s) },
        DebugManager: { log() {} },
    });
    const priorDocument = global.document;
    global.document = { querySelector: () => ({ paused: false }), hidden: false };
    try {
        for (let i = 0; i < 65; i++) feature._tick();
    } finally {
        if (priorDocument === undefined) delete global.document;
        else global.document = priorDocument;
    }
    assert.equal(feature._loadToday().seconds, 65,
        'accumulator must keep counting past the 30s batch-save boundary');
    // Batched to every 30s: 65 ticks -> saves at 30 and 60 only.
    assert.equal(saves.length, 2, 'storage writes must stay batched at 30s intervals');
});

test('digitalWellbeing module exports the runtime factory', () => {
    const { mod, exported } = loadFeatureModule(
        '../../extension/features/digital-wellbeing/index.js',
        'digitalWellbeing'
    );

    assert.equal(typeof mod.createDigitalWellbeingFeature, 'function');
    assert.equal(typeof exported.createDigitalWellbeingFeature, 'function');
});

test('digitalWellbeing factory returns the timer and overlay runtime surface', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/digital-wellbeing/index.js',
        'digitalWellbeing'
    );
    const feature = mod.createDigitalWellbeingFeature();

    assert.equal(feature.id, 'digitalWellbeing');
    assert.equal(feature.name, 'Digital Wellbeing');
    assert.equal(feature.group, 'Advanced');
    assert.equal(feature._capDismissKey, 'ytkit_dw_cap_dismissed_date');
    assert.equal(feature._lastTodayKey, null);
    for (const method of [
        'init',
        'destroy',
        '_tick',
        '_showOverlay',
        '_loadToday',
        '_saveToday',
        '_getCapDismissDate',
        '_setCapDismissDate'
    ]) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
});

test('digitalWellbeing Resume Video resumes only playback paused by the reminder', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/digital-wellbeing/index.js',
        'digitalWellbeing'
    );
    const created = [];
    const makeNode = (tagName) => {
        const node = {
            tagName,
            children: [],
            listeners: {},
            dataset: {},
            append(...children) { this.children.push(...children); },
            appendChild(child) { this.children.push(child); return child; },
            addEventListener(type, callback) { this.listeners[type] = callback; },
            removeEventListener() {},
            remove() {},
            setAttribute() {},
            focus() {}
        };
        created.push(node);
        return node;
    };
    const video = {
        paused: false,
        pauseCalls: 0,
        playCalls: 0,
        pause() { this.pauseCalls += 1; this.paused = true; },
        play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); }
    };
    const documentRef = {
        body: makeNode('body'),
        querySelector(selector) { return selector === 'video' ? video : null; },
        createElement: makeNode,
        addEventListener() {},
        removeEventListener() {}
    };
    const priorDocument = global.document;
    const priorAnimationFrame = global.requestAnimationFrame;
    global.document = documentRef;
    global.requestAnimationFrame = callback => callback();
    try {
        const feature = mod.createDigitalWellbeingFeature({ DebugManager: { log() {} } });
        feature._showOverlay('break');
        const resumeButton = created.find(node => node.tagName === 'button');
        assert.equal(video.pauseCalls, 1, 'break reminder must pause active playback');
        resumeButton.listeners.click();
        assert.equal(video.playCalls, 1, 'Resume Video must resume playback it paused');

        video.paused = true;
        feature._showOverlay('break');
        const pausedButton = created.filter(node => node.tagName === 'button').at(-1);
        pausedButton.listeners.click();
        assert.equal(video.playCalls, 1,
            'Resume Video must not start a video that was already paused');
    } finally {
        if (priorDocument === undefined) delete global.document;
        else global.document = priorDocument;
        if (priorAnimationFrame === undefined) delete global.requestAnimationFrame;
        else global.requestAnimationFrame = priorAnimationFrame;
    }

    const dwIdx = sources.ytkit.indexOf("id: 'digitalWellbeing'");
    const fallback = sources.ytkit.slice(dwIdx, dwIdx + 24000);
    for (const [label, source] of [['module', fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'features', 'digital-wellbeing', 'index.js'), 'utf8')], ['ytkit.js fallback', fallback]]) {
        assert.match(source, /resumeAfterDismiss = kind === 'break'/,
            `${label} must record whether the break paused active playback`);
        assert.match(source, /resumeAfterDismiss && video && video\.paused/,
            `${label} must guard Resume Video with the recorded playback state`);
    }
});

test('digitalWellbeing enforces a Shorts budget with an inaccessible hard block and a five-minute snooze', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/digital-wellbeing/index.js',
        'digitalWellbeing'
    );
    const pad = (value) => String(value).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const previousLocation = global.location;
    const previousDocument = global.document;
    const previousAnimationFrame = global.requestAnimationFrame;

    const makeHarness = (mode) => {
        const created = [];
        const documentListeners = {};
        const locationRef = {
            pathname: '/shorts/example',
            assigned: '',
            assign(path) { this.assigned = path; }
        };
        const makeNode = (tagName) => {
            const node = {
                tagName,
                children: [],
                listeners: {},
                dataset: {},
                append(...children) { this.children.push(...children); },
                appendChild(child) { this.children.push(child); return child; },
                addEventListener(type, callback) { this.listeners[type] = callback; },
                removeEventListener() {},
                remove() { this.removed = true; },
                setAttribute() {},
                focus() {}
            };
            created.push(node);
            return node;
        };
        const video = {
            paused: false,
            pauseCalls: 0,
            playCalls: 0,
            pause() { this.pauseCalls += 1; this.paused = true; },
            play() { this.playCalls += 1; this.paused = false; return Promise.resolve(); }
        };
        const documentRef = {
            body: makeNode('body'),
            hidden: false,
            visibilityState: 'visible',
            querySelector(selector) { return selector === 'video' ? video : null; },
            createElement: makeNode,
            addEventListener(type, callback) { documentListeners[type] = callback; },
            removeEventListener(type) {
                delete documentListeners[type];
            }
        };
        const settings = {
            dwDailyCapMin: 0,
            dwBreakIntervalMin: 0,
            shortsDailyLimitMin: 1,
            shortsDailyLimitMode: mode,
            dwWatchTimeToday: { date: today, seconds: 0 },
            shortsWatchTimeToday: { date: today, seconds: 60, snoozeUntil: 0 }
        };
        return { created, documentListeners, documentRef, locationRef, settings, video };
    };

    try {
        global.requestAnimationFrame = callback => callback();

        const hard = makeHarness('hard');
        global.location = hard.locationRef;
        global.document = hard.documentRef;
        const hardFeature = mod.createDigitalWellbeingFeature({
            appState: { settings: hard.settings },
            DebugManager: { log() {} }
        });
        hardFeature._tick();
        assert.equal(hardFeature._isShortsRoute(), true);
        assert.equal(hardFeature._overlay?.dataset.kind, 'shorts-limit');
        assert.equal(hardFeature._overlay?.dataset.locked, 'true');
        assert.equal(hard.video.pauseCalls, 1, 'hard block must pause active Shorts playback');
        hard.documentListeners.keydown({
            key: 'Escape',
            preventDefault() {},
            stopPropagation() {}
        });
        assert.ok(hardFeature._overlay, 'Escape must not dismiss a hard Shorts block');
        hardFeature._overlay.listeners.click({ target: hardFeature._overlay });
        assert.ok(hardFeature._overlay, 'backdrop click must not dismiss a hard Shorts block');
        const leaveButton = hard.created.find((node) => node.tagName === 'button');
        leaveButton.listeners.click();
        assert.equal(hard.locationRef.assigned, '/', 'hard block must offer an accessible route out of Shorts');
        assert.equal(hardFeature._overlay, null);

        const paused = makeHarness('hard');
        paused.video.paused = true;
        global.location = paused.locationRef;
        global.document = paused.documentRef;
        const pausedFeature = mod.createDigitalWellbeingFeature({
            appState: { settings: paused.settings },
            DebugManager: { log() {} }
        });
        pausedFeature._tick();
        assert.equal(pausedFeature._overlay?.dataset.kind, 'shorts-limit',
            'a Shorts route at the limit must remain blocked when autoplay is paused');
        assert.equal(paused.video.playCalls, 0, 'an already-paused video must not be started by the block');

        const snooze = makeHarness('snooze');
        global.location = snooze.locationRef;
        global.document = snooze.documentRef;
        const snoozeFeature = mod.createDigitalWellbeingFeature({
            appState: { settings: snooze.settings },
            DebugManager: { log() {} }
        });
        snoozeFeature._tick();
        assert.equal(snoozeFeature._overlay?.dataset.kind, 'shorts-limit');
        assert.equal(snoozeFeature._overlay?.dataset.locked, 'false');
        const snoozeButton = snooze.created.find((node) => node.tagName === 'button');
        snoozeButton.listeners.click();
        assert.ok(snooze.settings.shortsWatchTimeToday.snoozeUntil > Date.now(),
            'snooze mode must persist a five-minute local deadline');
        assert.equal(snooze.video.playCalls, 1, 'snooze must resume the playback it paused');
        assert.equal(snoozeFeature._overlay, null);

        snooze.settings.shortsWatchTimeToday = {
            date: '2000-01-01', seconds: 999, snoozeUntil: Date.now() + 600000
        };
        assert.equal(snoozeFeature._loadShortsToday().seconds, 0,
            'a stale Shorts ledger must reset at the local day boundary');

        const source = fs.readFileSync(
            path.join(__dirname, '..', '..', 'extension', 'features', 'digital-wellbeing', 'index.js'), 'utf8');
        assert.match(source, /shortsDailyLimitMin/, 'module must wire the Shorts daily limit setting');
        assert.match(source, /shortsDailyLimitMode/, 'module must wire the Shorts block policy setting');
        assert.match(source, /shortsWatchTimeToday/, 'module must persist a separate Shorts daily ledger');
        assert.match(source, /_pendingShortsSeconds/, 'module must batch Shorts watch-time writes');
        assert.match(source, /locked: !snoozable/, 'module must provide an explicit hard-block overlay');
        assert.match(source, /Snooze 5 Minutes/, 'module must provide the five-minute snooze action');
    } finally {
        if (previousLocation === undefined) delete global.location;
        else global.location = previousLocation;
        if (previousDocument === undefined) delete global.document;
        else global.document = previousDocument;
        if (previousAnimationFrame === undefined) delete global.requestAnimationFrame;
        else global.requestAnimationFrame = previousAnimationFrame;
    }
});

test('the Shorts daily ledger re-keys at the local midnight rollover', () => {
    const mod = require('../../extension/features/digital-wellbeing/index.js');
    const today = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    const originalLocation = global.location;
    const originalDocument = global.document;
    const video = { paused: false, pause() { this.paused = true; }, play() { return Promise.resolve(); } };
    const settings = {
        dwDailyCapMin: 0,
        dwBreakIntervalMin: 0,
        shortsDailyLimitMin: 1,
        shortsDailyLimitMode: 'snooze',
        dwWatchTimeToday: { date: today, seconds: 0 },
        // Yesterday's ledger: well past the limit AND holding a snooze that has
        // not expired in wall-clock terms. Both must die with the old day.
        shortsWatchTimeToday: { date: '2000-01-01', seconds: 9999, snoozeUntil: Date.now() + 3_600_000 }
    };

    try {
        global.location = { pathname: '/shorts/abc12345678', assign() {} };
        global.document = {
            body: { appendChild() {}, removeChild() {} },
            hidden: false,
            visibilityState: 'visible',
            querySelector: (selector) => (selector === 'video' ? video : null),
            createElement: () => ({
                dataset: {}, style: {}, classList: { add() {}, remove() {} },
                setAttribute() {}, append() {}, appendChild() {}, remove() {},
                addEventListener() {}, focus() {}
            }),
            addEventListener() {},
            removeEventListener() {}
        };

        const feature = mod.createDigitalWellbeingFeature({
            appState: { settings },
            DebugManager: { log() {} }
        });

        // Reading the ledger must present a clean day, not yesterday's numbers.
        const loaded = feature._loadShortsToday();
        assert.equal(loaded.date, today, 'the ledger must re-key to the local day');
        assert.equal(loaded.seconds, 0, "yesterday's seconds must not carry over");
        assert.equal(loaded.snoozeUntil, 0,
            'a stale snooze must not survive the rollover and silently suppress the new day limit');

        // And a tick must therefore NOT block: one second of Shorts is under a
        // one-minute limit once the day has rolled.
        feature._tick();
        assert.equal(feature._overlay, null, 'a fresh day must not open the limit overlay');

        // The pending second merges into today's ledger, not yesterday's.
        feature._pendingShortsSeconds = 5;
        feature._flushShortsToday();
        assert.equal(settings.shortsWatchTimeToday.date, today);
        assert.equal(settings.shortsWatchTimeToday.seconds, 5,
            'the flush must merge onto the re-keyed day, not resurrect the old total');
        assert.equal(feature._pendingShortsSeconds, 0, 'a flush must drain the pending counter');

        // A second flush with nothing pending must be a no-op, not a rewrite.
        feature._flushShortsToday();
        assert.equal(settings.shortsWatchTimeToday.seconds, 5);
    } finally {
        if (originalLocation === undefined) delete global.location; else global.location = originalLocation;
        if (originalDocument === undefined) delete global.document; else global.document = originalDocument;
    }
});

test('digitalWellbeing module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const modulePath = 'features/digital-wellbeing/index.js';
        const moduleIndex = scripts.indexOf(modulePath);
        assert.ok(moduleIndex > -1, 'manifest content script must include ' + modulePath);
        assert.ok(moduleIndex < ytkitIndex, modulePath + ' must load before ytkit.js');
    }
});

test('digitalWellbeing monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.digitalWellbeing?.createDigitalWellbeingFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct digitalWellbeing through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'digitalWellbeing'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline digitalWellbeing fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('}) || {'),
        'module factory path must fall back to the inline feature object');

    for (const dep of [
        'appState',
        'StorageManager',
        'settingsManager',
        'DebugManager',
        'injectStyle',
        'trapFocusWithin',
        't'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
});

// ── Settings Panel peel ──

test('settingsPanel module exports the runtime factory', () => {
    const { mod, exported } = loadFeatureModule(
        '../../extension/features/settings-panel/index.js',
        'settingsPanel'
    );

    assert.equal(typeof mod.createSettingsPanelRuntime, 'function');
    assert.equal(typeof exported.createSettingsPanelRuntime, 'function');
});

test('settingsPanel factory returns the panel runtime surface', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/settings-panel/index.js',
        'settingsPanel'
    );
    const runtime = mod.createSettingsPanelRuntime();

    for (const method of [
        'isSettingsPanelOpen',
        'setSettingsPanelOpen',
        'toggleSettingsPanel',
        'countEnabledToggleFeatures',
        'buildSettingsPanel',
        'buildFeatureCard',
        'updateAllToggleStates',
        'attachUIEventListeners'
    ]) {
        assert.equal(typeof runtime[method], 'function', 'factory runtime must expose ' + method);
    }
});

test('settingsPanel module ensures lazy styles before its direct build path', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/settings-panel/index.js',
        'settingsPanel'
    );
    let styleCalls = 0;
    const runtime = mod.createSettingsPanelRuntime({
        ensurePanelStyles: () => { styleCalls += 1; },
        shouldBuildPrimaryUI: () => false,
    });

    runtime.buildSettingsPanel();

    assert.equal(styleCalls, 1,
        'module runtime must inject the lazy panel stylesheet before returning');
});

test('settingsPanel module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const modulePath = 'features/settings-panel/index.js';
        const moduleIndex = scripts.indexOf(modulePath);
        assert.ok(moduleIndex > -1, 'manifest content script must include ' + modulePath);
        assert.ok(moduleIndex < ytkitIndex, modulePath + ' must load before ytkit.js');
    }
});

test('settingsPanel monolith prefers the module runtime before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.settingsPanel?.createSettingsPanelRuntime';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must resolve settingsPanel through the module factory');
    const factoryCallIndex = sources.ytkit.indexOf('_settingsPanelRuntime = factory({', factoryIndex);
    assert.ok(factoryCallIndex > factoryIndex, 'ytkit.js must construct the settingsPanel runtime through the factory');
    const fallbackIndex = sources.ytkit.indexOf('function buildSettingsPanel()', factoryCallIndex);
    assert.ok(fallbackIndex > factoryCallIndex, 'ytkit.js must retain the inline buildSettingsPanel fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryCallIndex, fallbackIndex);

    for (const dep of [
        'BRAND',
        'CATEGORY_CONFIG',
        'CATEGORY_META',
        'CONFLICT_MAP',
        'DebugManager',
        'FEATURE_PREVIEWS',
        'ICONS',
        'LEGACY_STORAGE_KEYS',
        'MediaDLManager',
        'PANEL_OPEN_CLASS',
        'STORAGE_KEYS',
        'StorageManager',
        'YTKIT_VERSION',
        '_i18n',
        'appState',
        'createBrandImage',
        'createToast',
        'destroyFeatureLifecycle',
        'formatPageLabel',
        'getFeatureById',
        'getFeatureDescription',
        'getFeatureName',
        'getFocusableUiElements',
        'handleExternalStorageChanges',
        'handleFileExport',
        'handleFileImport',
        'initFeatureLifecycle',
        'injectStyle',
        'ensurePanelStyles',
        'isBooleanFeature',
        'liveFeatureList',
        'normalizeSelectOptions',
        'openExternalUrl',
        'requestFeatureOptionalHosts',
        'safeDestroyFeature',
        'safeInitFeature',
        'settingsManager',
        'shouldBuildPrimaryUI',
        'showToast',
        'storageRead',
        'storageReadJSON',
        'storageWrite',
        't',
        'trapFocusWithin',
        'getPinSessionUnlocked',
        'getPageModalOpen',
        'getFeatureCrashCounts',
        'persistCrashCounts'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }

    for (const method of [
        'isSettingsPanelOpen',
        'setSettingsPanelOpen',
        'toggleSettingsPanel',
        'countEnabledToggleFeatures',
        'buildSettingsPanel',
        'buildFeatureCard',
        'updateAllToggleStates',
        'attachUIEventListeners'
    ]) {
        assert.ok(sources.ytkit.includes(`runtime?.${method}`), 'ytkit.js must delegate ' + method + ' through the settingsPanel runtime');
    }
});

test('settingsPanel requests optional hosts before enabling and rolls back denial', () => {
    const moduleSource = fs.readFileSync(require.resolve(
        '../../extension/features/settings-panel/index.js'
    ), 'utf8');
    for (const [label, source] of [
        ['module', moduleSource],
        ['inline fallback', sources.ytkit]
    ]) {
        const handlerStart = source.indexOf("doc.addEventListener('change', async (e) =>");
        assert.ok(handlerStart > -1, `${label} must use an async settings change handler`);
        const featureWrite = source.indexOf('appState.settings[featureId] = isEnabled', handlerStart);
        assert.ok(featureWrite > handlerStart, `${label} must persist feature toggles`);
        const handler = source.slice(handlerStart, featureWrite + 80);
        assert.match(handler, /await requestFeatureOptionalHosts\(featureId, true\)/,
            `${label} must request optional hosts before enabling a feature`);
        assert.ok(
            handler.indexOf('await requestFeatureOptionalHosts') < handler.indexOf('appState.settings[featureId] = isEnabled'),
            `${label} must request host access before persisting enabled state`
        );
        assert.match(handler, /input\.checked = false/,
            `${label} must restore the toggle when host access is denied`);
        assert.match(handler, /approve the browser prompt/,
            `${label} must explain how to recover from a denied prompt`);
    }
});

// ── Video Notes peel ──

test('videoNotes module exports the runtime factory', () => {
    const { mod, exported } = loadFeatureModule(
        '../../extension/features/video-notes/index.js',
        'videoNotes'
    );

    assert.equal(typeof mod.createVideoNotesFeature, 'function');
    assert.equal(typeof exported.createVideoNotesFeature, 'function');
});

test('videoNotes factory returns the per-video notes runtime surface', () => {
    const { mod } = loadFeatureModule(
        '../../extension/features/video-notes/index.js',
        'videoNotes'
    );
    const feature = mod.createVideoNotesFeature();

    assert.equal(feature.id, 'videoNotes');
    assert.equal(feature.name, 'Per-Video Notes');
    assert.equal(feature.group, 'Watch Page');
    assert.equal(feature._DATA_KEY, 'videoNotesData');
    assert.equal(feature._MAX_NOTES, 1000);
    for (const method of [
        'init',
        'destroy',
        '_enforceNotesCap',
        '_readNotes',
        '_writeNotes',
        '_scheduleSave',
        '_flushPendingSave',
        '_deleteCurrentNote',
        '_exportNotes',
        '_renderPanel',
        '_attach'
    ]) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
});

test('videoNotes module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const modulePath = 'features/video-notes/index.js';
        const moduleIndex = scripts.indexOf(modulePath);
        assert.ok(moduleIndex > -1, 'manifest content script must include ' + modulePath);
        assert.ok(moduleIndex < ytkitIndex, modulePath + ' must load before ytkit.js');
    }
});

test('videoNotes monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.videoNotes?.createVideoNotesFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct videoNotes through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'videoNotes'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline videoNotes fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('}) || {'),
        'module factory path must fall back to the inline feature object');

    for (const dep of [
        'PageTypes',
        'appState',
        'DebugManager',
        'injectStyle',
        'getVideoId',
        'isWatchPagePath',
        'settingsManager',
        'showToast',
        'handleFileExport',
        'addNavigateRule',
        'removeNavigateRule'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
});

test('subscriptionGroups import merges by default and only replaces on request', () => {
    // Importing any file used to delete every group missing from it, with a
    // six second toast Undo as the only recovery.
    const { mod } = loadFeatureModule(
        '../../extension/features/subscription-groups/index.js',
        'subscriptionGroups'
    );
    const makeFeature = () => {
        const appState = {
            settings: {
                subscriptionGroupData: {
                    keep: { name: 'Keep', color: '#7c3aed', channelIds: ['UCkeep1111111111111111'], parentId: '', sortMode: 'default', updatedAt: 1 },
                    news: { name: 'Old News', color: '#7c3aed', channelIds: ['UCexisting111111111111'], parentId: '', sortMode: 'default', updatedAt: 1 },
                },
            },
        };
        const feature = mod.createSubscriptionGroupsFeature({
            appState,
            settingsManager: { save() {} },
            showToast() {},
        });
        feature._renderToolbar = () => {};
        feature._applyGroupFilter = () => {};
        feature._renderDeadChannelMarkers = () => {};
        return { feature, appState };
    };
    const payload = JSON.stringify({
        groups: {
            news: { name: 'News', color: '#123456', channelIds: ['UCimported11111111111'], sortMode: 'default' },
        },
    });

    const merge = makeFeature();
    const mergeResult = merge.feature._importGroups(payload);
    const mergedGroups = merge.appState.settings.subscriptionGroupData;
    assert.equal(mergeResult.ok, true);
    assert.ok(mergedGroups.keep, 'a group missing from the file must survive an import');
    assert.equal(mergedGroups.news.name, 'News', 'the imported record wins on presentation');
    assert.deepEqual(mergedGroups.news.channelIds, ['UCexisting111111111111', 'UCimported11111111111'],
        'existing channels are kept and imported ones appended');
    assert.equal(mergeResult.removedGroups, 0, 'merging never reports removals');

    const replace = makeFeature();
    const replaceResult = replace.feature._importGroups(payload, { mode: 'replace' });
    const replacedGroups = replace.appState.settings.subscriptionGroupData;
    assert.equal(replaceResult.ok, true);
    assert.deepEqual(Object.keys(replacedGroups), ['news'], 'explicit replace still wipes the rest');
    assert.equal(replaceResult.removedGroups, 1);
});

test('the MONOLITH subscriptionGroups copy also merges on import', () => {
    // The peeled module is only imported when the session LANDS on the
    // subscriptions feed; land anywhere else and this copy is what runs. It
    // kept the destructive full-replace long after the peeled copy was fixed,
    // so a partial file deleted every group missing from it — and the test
    // above passed the whole time because it only drove the module.
    const { loadFallbackFeature } = require('../helpers/monolith');
    const makeFeature = () => {
        const appState = {
            settings: {
                subscriptionGroupData: {
                    keep: { name: 'Keep', color: '#7c3aed', channelIds: ['UCkeep1111111111111111'], parentId: '', sortMode: 'default', updatedAt: 1 },
                    news: { name: 'Old News', color: '#7c3aed', channelIds: ['UCexisting111111111111'], parentId: '', sortMode: 'default', updatedAt: 1 },
                },
            },
        };
        const feature = loadFallbackFeature('subscriptionGroups', {
            appState,
            settingsManager: { save() {} },
            showToast() {},
        });
        feature._renderToolbar = () => {};
        feature._applyGroupFilter = () => {};
        feature._renderDeadChannelMarkers = () => {};
        return { feature, appState };
    };
    const payload = JSON.stringify({
        groups: {
            news: { name: 'News', color: '#123456', channelIds: ['UCimported11111111111'], sortMode: 'default' },
        },
    });

    const merge = makeFeature();
    const mergeResult = merge.feature._importGroups(payload);
    const mergedGroups = merge.appState.settings.subscriptionGroupData;
    assert.equal(mergeResult.ok, true);
    assert.ok(mergedGroups.keep, 'a group missing from the file must survive an import');
    assert.equal(mergedGroups.news.name, 'News', 'the imported record wins on presentation');
    // The fallback runs in a vm realm, so its arrays carry that realm's
    // prototype; spread them back into this realm before a strict compare.
    assert.deepEqual([...mergedGroups.news.channelIds], ['UCexisting111111111111', 'UCimported11111111111'],
        'existing channels are kept and imported ones appended');
    assert.equal(mergeResult.removedGroups, 0, 'merging never reports removals');

    const replace = makeFeature();
    const replaceResult = replace.feature._importGroups(payload, { mode: 'replace' });
    assert.equal(replaceResult.ok, true);
    assert.deepEqual(Object.keys(replace.appState.settings.subscriptionGroupData), ['news'],
        'explicit replace still wipes the rest');
    assert.equal(replaceResult.removedGroups, 1);
});

test('the watch-time dashboard renders an empty state instead of 30 zero-height bars', () => {
    const ytkitSource = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8'
    );
    const start = ytkitSource.indexOf("id: 'watchHistoryAnalytics'");
    assert.ok(start > -1, 'watchHistoryAnalytics feature must exist');
    const block = ytkitSource.slice(start, start + 9000);

    // With nothing tracked, max clamps to 1 and every bar computes 0% height,
    // so the modal rendered a flat axis and four zeroes — indistinguishable
    // from a broken chart.
    assert.match(block, /if \(total <= 0 && !\(stats\.total > 0\)\)/,
        'the renderer must branch on having no tracked data at all');
    assert.match(block, /ytkit-wha-empty/, 'the zero-data branch must render an empty state');
    assert.match(block, /whaEmptyTitle/, 'the empty state must use a localised title');
    assert.match(block, /whaEmptyCopy/, 'the empty state must use localised copy');
    assert.match(block, /\} else \{\s*card\.append\(head, statsRow, chart\);/,
        'the populated path must still render stats and the chart');

    // The empty state shares the modal tail, so focus/Escape/teardown cannot
    // diverge between the two branches.
    const emptyBranch = block.slice(block.indexOf('if (total <= 0'), block.indexOf('overlay.appendChild(card)'));
    assert.doesNotMatch(emptyBranch, /document\.body\.appendChild/,
        'the empty branch must not mount its own overlay — it shares the tail below');

    // Both surfaces must carry a light-theme lane; the audit ratchets on this.
    // The stylesheet lives outside the feature block, so match the full source.
    assert.match(ytkitSource, /html:not\(\[dark\]\) \.ytkit-wha-empty-title/,
        'the empty state needs a light-theme lane like every other injected surface');
    assert.match(ytkitSource, /\.ytkit-wha-empty \{/,
        'the empty state needs its own layout rule');

    const localesDir = path.join(__dirname, '..', '..', 'extension', '_locales');
    const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en', 'messages.json'), 'utf8'));
    for (const key of ['whaEmptyTitle', 'whaEmptyCopy']) {
        assert.ok(en[key]?.message, `EN must declare ${key}`);
        for (const locale of fs.readdirSync(localesDir)) {
            if (locale === 'en') continue;
            const messages = JSON.parse(
                fs.readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8')
            );
            assert.ok(messages[key]?.message, `${locale} must declare ${key}`);
            assert.notEqual(messages[key].message, en[key].message,
                `${locale} ${key} is still English — it fell through instead of being translated`);
        }
    }
});
