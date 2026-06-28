'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sources, config } = require('../helpers/source');

const MODULE_PATH = '../../extension/features/video-hider/index.js';
const MODULE_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'features', 'video-hider', 'index.js'),
    'utf8'
);

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    const exported = globalThis.YTKitFeatures.hideVideosFromHome;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
}

test('hideVideosFromHome module exports the Video Hider runtime factory', () => {
    const { mod, exported } = loadModule();
    assert.equal(typeof mod.createHideVideosFromHomeFeature, 'function');
    assert.equal(typeof exported.createHideVideosFromHomeFeature, 'function');
});

test('hideVideosFromHome factory returns the Video Hider runtime surface', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    assert.equal(feature.id, 'hideVideosFromHome');
    assert.equal(feature.name, 'Video Hider');
    assert.equal(feature.isParent, true);
    assert.equal(feature._channelKeyCache, null);
    for (const method of [
        'init',
        'destroy',
        '_processAllVideos',
        '_processVideoElement',
        '_setBlockedChannelCache',
        '_getBlockedChannelKeys',
        '_getPredicateEvaluator',
        '_createHomeHideAllButton',
        '_createSubsHideAllButton',
        '_removeHiddenVideosOnPage'
    ]) {
        assert.equal(typeof feature[method], 'function', 'factory feature must expose ' + method);
    }
});

test('hideVideosFromHome monolith prefers the module runtime factory before inline fallback', () => {
    const factoryNeedle = 'globalThis.YTKitFeatures?.hideVideosFromHome?.createHideVideosFromHomeFeature?.({';
    const factoryIndex = sources.ytkit.indexOf(factoryNeedle);
    assert.ok(factoryIndex > -1, 'ytkit.js must construct hideVideosFromHome through the module factory');
    const fallbackIndex = sources.ytkit.indexOf("id: 'hideVideosFromHome'", factoryIndex);
    assert.ok(fallbackIndex > factoryIndex, 'ytkit.js must retain the inline hideVideosFromHome fallback after the factory call');
    const dependencyBag = sources.ytkit.slice(factoryIndex, fallbackIndex);
    assert.ok(dependencyBag.includes('}) || {'),
        'module factory path must fall back to the inline feature object');

    for (const dep of [
        'Z',
        'appState',
        'DebugManager',
        'setSettingsPanelOpen',
        'storageRead',
        'storageReadJSON',
        'storageWrite',
        'sanitizeImportedHiddenVideos',
        'sanitizeImportedVideoIdList',
        'sanitizeImportedBlockedChannels',
        'IMPORT_LIMITS',
        'VIDEO_ID_PATTERN',
        'normalizeBlockedChannelRecord',
        'getBlockedChannelIdentityKeys',
        'isPlainObject',
        'showToast',
        'PredicateSandbox',
        'addNavigateRule',
        'removeNavigateRule',
        'runBudgetedElementBatch',
        'injectStyle'
    ]) {
        assert.ok(dependencyBag.includes(dep), 'ytkit.js factory dependency bag must include ' + dep);
    }
    assert.ok(dependencyBag.includes('createSVG: globalThis.YTKitCore?.createSVG'),
        'factory dependency bag must avoid the later-declared local createSVG binding');
});

test('hideVideosFromHome budgets large feed scans and cancels stale batches', () => {
    assert.match(MODULE_SOURCE, /runBudgetedElementBatch = \(items, callback\) =>/,
        'module factory must accept an injected budgeted batch runner');
    assert.match(MODULE_SOURCE, /_processAllBudgetHandle: null/,
        'full-page scan handle must be tracked for cancellation');
    assert.match(MODULE_SOURCE, /_mutationBudgetHandle: null/,
        'mutation scan handle must be tracked for cancellation');
    assert.match(MODULE_SOURCE, /_cancelBudgetedScans\(\)/,
        'feature must expose a shared cancellation helper');
    assert.match(MODULE_SOURCE, /label: 'video-hider:process-all'/,
        'all-card scans must carry a diagnostic label');
    assert.match(MODULE_SOURCE, /label: 'video-hider:mutation-batch'/,
        'mutation batches must carry a diagnostic label');
    assert.match(MODULE_SOURCE, /chunkSize: 60/,
        'full-page scans should use a bounded chunk size');
    assert.match(MODULE_SOURCE, /chunkSize: 80/,
        'mutation batches should use a bounded chunk size');
    assert.match(MODULE_SOURCE, /DebugManager\.log\('VideoHider', `Budgeted scan/,
        'slow multi-chunk scans must be logged for diagnostics');
    assert.match(MODULE_SOURCE, /this\._cancelBudgetedScans\(\);[\s\S]*this\._restoreRemovedVideoNodes/,
        'destroy must cancel pending scans before restoring DOM state');
});

test('_parseCompactCount preserves comma-grouped view counts (no decimal corruption)', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    // Regression: "1,234 views" must not be read as 1 (the old replace(',', '.') bug).
    assert.equal(feature._parseCompactCount('1,234 views'), 1234);
    assert.equal(feature._parseCompactCount('12,345 views'), 12345);
    assert.equal(feature._parseCompactCount('1,234,567 views'), 1234567);
    assert.equal(feature._parseCompactCount('987 views'), 987);
    assert.equal(feature._parseCompactCount('42 watching'), 42);

    // Suffixed counts keep their decimal semantics.
    assert.equal(feature._parseCompactCount('1.2M views'), 1200000);
    assert.equal(feature._parseCompactCount('12.5K views'), 12500);
    assert.equal(feature._parseCompactCount('3B views'), 3000000000);

    // Sentinels.
    assert.equal(feature._parseCompactCount('No views'), 0);
    assert.equal(feature._parseCompactCount('Streamed 3 years ago'), null);
});

test('_extractViewCount reads grouped counts from a card element (popular video not misread)', () => {
    const { mod } = loadModule();
    const feature = mod.createHideVideosFromHomeFeature();

    // Minimal fake card: a metadata line carrying the grouped view count, like
    // YouTube renders. The headline bug made this read as 1, so a low-view
    // filter wrongly hid popular videos.
    function fakeCard(metaText) {
        const meta = {
            textContent: metaText,
            getAttribute: () => null
        };
        return {
            querySelectorAll: () => [meta],
            textContent: metaText
        };
    }

    assert.equal(feature._extractViewCount(fakeCard('1,234,567 views')), 1234567);
    assert.equal(feature._extractViewCount(fakeCard('1.2M views')), 1200000);
    assert.equal(feature._extractViewCount(fakeCard('No views')), 0);
    // Cards with no parseable count return null so a low-view filter can tell
    // "no data" apart from "zero views" and leave them alone.
    assert.equal(feature._extractViewCount(fakeCard('Recommended for you')), null);
});

test('hideVideosFromHome module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const moduleIndex = scripts.indexOf('features/video-hider/index.js');
        assert.ok(moduleIndex > -1, 'manifest content script must include video-hider module');
        assert.ok(moduleIndex < ytkitIndex, 'video-hider module must load before ytkit.js');
    }
});
