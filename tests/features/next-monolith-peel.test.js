'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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

test('downloadUI monolith delegates feature objects through the module factory', () => {
    // Verify the monolith constructs _downloadUI from the module factory
    const factoryNeedle = 'globalThis.YTKitFeatures?.createDownloadUIFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct _downloadUI through the module factory');

    // Verify the dependency bag includes key deps
    const bagEnd = sources.ytkit.indexOf('}) || null;', factoryIndex);
    assert.ok(bagEnd > factoryIndex, 'factory construction must fall back to null');
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
        'normalizeCookieExpiry',
        'BRAND',
        't',
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }

    // Verify each feature object delegates through _downloadUI with inline fallback
    for (const featureId of [
        'downloadHealthPanel',
        'downloadStreamLinksPanel',
        'downloadCobaltFallback',
        'downloadHistoryPanel'
    ]) {
        // Accept both parenthesized and bare delegation forms
        const delegateNeedle = `_downloadUI?.${featureId} || {`;
        const delegateNeedleAlt = `(_downloadUI?.${featureId} || {`;
        const hasDelegation = sources.ytkit.includes(delegateNeedle) || sources.ytkit.includes(delegateNeedleAlt);
        assert.ok(
            hasDelegation,
            `ytkit.js must delegate ${featureId} through _downloadUI with inline fallback`
        );
        const fallbackNeedle = `id: '${featureId}'`;
        const delegateIndex = Math.max(
            sources.ytkit.indexOf(delegateNeedle),
            sources.ytkit.indexOf(delegateNeedleAlt)
        );
        const fallbackIndex = sources.ytkit.indexOf(fallbackNeedle, delegateIndex);
        assert.ok(
            fallbackIndex > delegateIndex,
            `ytkit.js must retain inline ${featureId} fallback after the delegation`
        );
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
        '_importGroups',
        '_toggleMembersPanel',
        '_playGroupAsQueue',
        '_generateAiTagsForGroup'
    ]) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
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
        'handleFileExport'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
});

// ── Digital Wellbeing peel ──

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
        'trapFocusWithin'
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
        '_showPinDialog',
        '_showPinManageDialog',
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
        'isBooleanFeature',
        'isPinSet',
        'liveFeatureList',
        'normalizeSelectOptions',
        'openExternalUrl',
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
