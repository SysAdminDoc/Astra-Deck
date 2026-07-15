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

test('downloadUI monolith requires the canonical module factory', () => {
    const factoryLookup = 'const createDownloadUIFeature = globalThis.YTKitFeatures?.createDownloadUIFeature;';
    assert.ok(sources.ytkit.includes(factoryLookup),
        'ytkit.js must resolve the preloaded downloadUI factory explicitly');
    assert.ok(sources.ytkit.includes('Download UI module is unavailable; aborting ytkit initialization.'),
        'ytkit.js must fail closed when the required module is unavailable');

    // Verify the monolith constructs _downloadUI from the required module factory.
    const factoryNeedle = 'const _downloadUI = createDownloadUIFeature({';
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
