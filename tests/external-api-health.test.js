'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sources, config } = require('./helpers/source');

function loadFeatureModule(modulePath, namespaceKey) {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(modulePath)];
    globalThis.YTKitFeatures = {};
    const mod = require(modulePath);
    const exported = globalThis.YTKitFeatures[namespaceKey];
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
}

test('external API health core module loads before crowd API feature modules', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const coreIndex = scripts.indexOf('core/external-api-health.js');
        if (coreIndex === -1) continue;
        for (const featurePath of [
            'features/return-dislike/index.js',
            'features/sponsorblock/index.js',
            'features/dearrow/index.js'
        ]) {
            const featureIndex = scripts.indexOf(featurePath);
            if (featureIndex === -1) continue;
            assert.ok(coreIndex < featureIndex, 'external-api-health must load before ' + featurePath);
        }
    }
});

test('popup and sidepanel expose external API health snapshots and diagnostics export includes them', () => {
    const popupHtml = sources.popupHtml;
    const popupJs = sources.popup;
    const sidepanelHtml = fs.readFileSync(path.join(__dirname, '..', 'extension', 'sidepanel.html'), 'utf8');
    const sidepanelJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'sidepanel.js'), 'utf8');

    assert.match(popupHtml, /id="external-health"/, 'popup must declare the external API health section');
    assert.match(popupJs, /YTKIT_GET_EXTERNAL_API_HEALTH/, 'popup must request the external API health snapshot');
    assert.match(popupJs, /externalApiHealth/, 'diagnostics save payload must include externalApiHealth');
    assert.match(sidepanelHtml, /id="sp-external"/, 'sidepanel must declare the external API health section');
    assert.match(sidepanelJs, /YTKIT_GET_EXTERNAL_API_HEALTH/, 'sidepanel must request the external API health snapshot');
});

test('ytkit exposes external API health message handler and passes tracker into crowd modules', () => {
    assert.match(sources.ytkit, /createExternalApiHealth/, 'ytkit must instantiate ExternalApiHealth');
    assert.match(sources.ytkit, /YTKIT_GET_EXTERNAL_API_HEALTH/, 'ytkit must expose the health snapshot message');
    for (const factoryName of [
        'createSponsorBlockFeature',
        'createDeArrowFeature',
        'createReturnDislikeFeature'
    ]) {
        const idx = sources.ytkit.indexOf(factoryName);
        assert.ok(idx > -1, factoryName + ' must be instantiated');
        const depBag = sources.ytkit.slice(idx, idx + 600);
        assert.match(depBag, /ExternalApiHealth/, factoryName + ' dependency bag must include ExternalApiHealth');
    }
});

test('SponsorBlock reports stale-cache fallback to ExternalApiHealth', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/sponsorblock/index.js',
        'createSponsorBlockFeature'
    );
    const calls = [];
    const videoId = 'dQw4w9WgXcQ';
    const staleTs = Date.now() - (13 * 60 * 60 * 1000);
    const feature = mod.createSponsorBlockFeature({
        appState: { settings: { sbCat_sponsor: true } },
        storageReadJSON: () => ({
            [videoId]: {
                ts: staleTs,
                categoryKey: 'sponsor',
                segments: [{ segment: [1, 4], category: 'sponsor', actionType: 'skip' }]
            }
        }),
        storageWriteJSON() {},
        extensionFetchJson: async () => { throw new Error('network offline'); },
        ExternalApiHealth: {
            recordCacheFallback: (...args) => calls.push(args)
        },
        DiagnosticLog: { record() {} },
        VIDEO_ID_PATTERN: /^[A-Za-z0-9_-]{11}$/
    });

    const segments = await feature._fetchSegments(videoId);

    assert.equal(segments.length, 1);
    assert.equal(segments[0]._ytkitCacheSource, 'stale');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'sponsorBlock');
    assert.equal(calls[0][2].fallbackState, 'stale-cache');
});

test('DeArrow reports invalid branding payload to ExternalApiHealth', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/dearrow/index.js',
        'createDeArrowFeature'
    );
    const calls = [];
    const feature = mod.createDeArrowFeature({
        appState: { settings: {} },
        extensionFetchJson: async () => ({ data: [] }),
        storageWriteJSON() {},
        ExternalApiHealth: {
            recordFailure: (...args) => calls.push(args)
        },
        DiagnosticLog: { record() {} }
    });

    const result = await feature._doFetch('dQw4w9WgXcQ');

    assert.equal(result, null);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'deArrow');
    assert.equal(calls[0][2].errorClass, 'invalid-payload');
});

test('Return Dislike reports invalid payload and request-budget exhaustion', async () => {
    const { mod } = loadFeatureModule(
        '../extension/features/return-dislike/index.js',
        'createReturnDislikeFeature'
    );
    const calls = [];
    let fetchCount = 0;
    const feature = mod.createReturnDislikeFeature({
        appState: { settings: { returnDislikeCacheHours: 24 } },
        storageReadJSON: () => ({}),
        storageWriteJSON() {},
        extensionFetchJson: async () => {
            fetchCount += 1;
            if (fetchCount === 1) return { data: { likes: 10 } };
            return { data: { likes: 10, dislikes: 3, viewCount: 100, rating: 4.5 } };
        },
        ExternalApiHealth: {
            recordFailure: (...args) => calls.push(['failure', ...args]),
            recordSuccess: (...args) => calls.push(['success', ...args])
        },
        DiagnosticLog: { record() {} }
    });

    assert.equal(await feature._fetch('invalid-payload-video'), null);
    assert.equal(calls[0][0], 'failure');
    assert.equal(calls[0][3].errorClass, 'invalid-payload');

    for (let i = 0; i < 99; i++) {
        const data = await feature._fetch(`budget-ok-${i}`);
        assert.ok(data);
    }
    assert.equal(await feature._fetch('budget-exhausted'), null);
    const last = calls[calls.length - 1];
    assert.equal(last[0], 'failure');
    assert.equal(last[1], 'returnDislike');
    assert.equal(last[3].errorClass, 'rate-limited');
    assert.equal(last[3].requestBudget.used, 100);
});
