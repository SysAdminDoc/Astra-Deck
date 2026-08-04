'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const REPO_ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const ytkitSource = read('extension', 'ytkit.js');
const earlyCss = read('extension', 'early.css');
const watchPackSource = read('extension', 'core', 'selector-packs', 'watch.js');
const engagementPackSource = read('extension', 'core', 'selector-packs', 'engagementPanels.js');
const defaultSettings = JSON.parse(read('extension', 'default-settings.json'));
const settingsSchema = require(path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js'));

const captureTokenSources = [
    read('tests', 'fixtures', 'yt-watch.tokens.txt'),
    read('tests', 'fixtures', 'yt-home.tokens.txt'),
    read('tests', 'fixtures', 'yt-subscriptions.tokens.txt')
].join('\n');

function featureBlock(id) {
    const start = ytkitSource.indexOf(`cssFeature('${id}'`);
    assert.ok(start >= 0, `cssFeature(${id}) must exist`);
    const next = ytkitSource.indexOf('\n        cssFeature(', start + 1);
    return ytkitSource.slice(start, next >= 0 ? next : undefined);
}

function loadSelectorPacks() {
    const context = { console, globalThis: null };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(watchPackSource, context, { filename: 'watch.js' });
    vm.runInContext(engagementPackSource, context, { filename: 'engagementPanels.js' });
    return context.YTKitCore.SurfacePackRegistry;
}

test('AI surface controls have independent schema defaults and localized feature copy', () => {
    const expectedKeys = [
        'hideAskAi',
        'hideGeminiButtons',
        'hideAiSummary',
        'hideAiContextPanels'
    ];
    const schemaByKey = new Map(settingsSchema.SETTINGS_SCHEMA.map((entry) => [entry.key, entry]));

    for (const key of expectedKeys) {
        assert.equal(defaultSettings[key], true, `${key} should preserve the legacy enabled default`);
        const entry = schemaByKey.get(key);
        assert.ok(entry, `${key} must be present in the settings schema`);
        assert.equal(entry.category, 'watch-player', `${key} belongs with watch-page controls`);
        assert.equal(entry.scope, 'watch', `${key} must be watch-scoped`);
        assert.equal(entry.destroyRequired, true, `${key} must tear down its injected CSS`);
        assert.match(featureBlock(key), new RegExp(`t\\('feature_${key}_(?:name|desc)'`),
            `${key} must resolve its visible copy through i18n`);
    }
});

test('combined AI CSS is split without cross-hiding the independent surfaces', () => {
    const ask = featureBlock('hideAskAi');
    const gemini = featureBlock('hideGeminiButtons');
    const summary = featureBlock('hideAiSummary');
    const context = featureBlock('hideAiContextPanels');

    assert.match(ask, /conversational-ui-watch-metadata-button-view-model/);
    assert.match(ask, /ytd-reel-shelf-renderer:has\(\[is-ask-ai\]\)/);
    assert.doesNotMatch(ask, /target-id\*="summary"|info_outline|ytd-factoid-renderer/);

    assert.match(gemini, /data-action="gemini"/);
    assert.match(gemini, /target-id\*="gemini"/);
    assert.doesNotMatch(gemini, /target-id\*="summary"|info_outline|ytd-factoid-renderer/);

    assert.match(summary, /target-id\*="ai-summary"/);
    assert.match(summary, /target-id\*="summary"/);
    assert.doesNotMatch(summary, /conversational-ui-watch-metadata-button-view-model|is-ask-ai|info_outline|ytd-factoid-renderer/);

    assert.match(context, /ytd-info-panel-content-renderer:has\(\[icon="info_outline"\]\)/);
    assert.match(context, /ytd-factoid-renderer/);
    assert.doesNotMatch(context, /conversational-ui-watch-metadata-button-view-model|is-ask-ai|target-id\*="summary"/);
});

test('AI early-hide rules are body-scoped for every independent toggle', () => {
    for (const id of ['hideAskAi', 'hideGeminiButtons', 'hideAiSummary', 'hideAiContextPanels']) {
        assert.match(
            earlyCss,
            new RegExp(`body\\.ytkit-${id}[^\\{]+\\{`),
            `early.css must gate ${id} behind its runtime body class`
        );
    }
});

test('AI surface selector packs expose frozen hook chains', () => {
    const registry = loadSelectorPacks();
    const watch = registry.get('watch');
    const panels = registry.get('engagementPanels');
    assert.ok(watch?.hooks?.['element.askAiSurface']);
    assert.ok(panels?.hooks?.['panel.aiSummary']);
    assert.ok(panels?.hooks?.['panel.aiContext']);
    assert.ok(panels?.hooks?.['panel.gemini']);

    for (const entry of [
        watch.hooks['element.askAiSurface'],
        panels.hooks['panel.aiSummary'],
        panels.hooks['panel.aiContext'],
        panels.hooks['panel.gemini']
    ]) {
        assert.ok(Object.isFrozen(entry));
        assert.ok(Object.isFrozen(entry.stable));
        assert.ok(Object.isFrozen(entry.fallback));
        assert.ok(entry.stable.length > 0);
        assert.ok(entry.fallback.length > 0);
    }
});

test('AI selector canaries retain capture-backed structural hosts', () => {
    const canaries = {
        ask: ['ytd-watch-metadata', 'ytd-reel-shelf-renderer'],
        gemini: ['ytd-watch-metadata', 'ytd-engagement-panel-section-list-renderer'],
        summary: ['ytd-engagement-panel-section-list-renderer'],
        context: ['ytd-info-panel-content-renderer', 'ytd-factoid-renderer']
    };
    const runtimeSources = [ytkitSource, earlyCss, watchPackSource, engagementPackSource];

    for (const [surface, tokens] of Object.entries(canaries)) {
        for (const token of tokens) {
            assert.match(captureTokenSources, new RegExp(`^${token}$`, 'm'),
                `${surface} canary ${token} must remain present in a captured fixture`);
            assert.ok(runtimeSources.some((source) => source.includes(token)),
                `${surface} runtime selectors must retain ${token}`);
        }
    }
});
