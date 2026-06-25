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
