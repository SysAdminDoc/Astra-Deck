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
