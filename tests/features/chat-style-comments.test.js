'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, config, extractFeatureBlock } = require('../helpers/source');

const MODULE_PATH = '../../extension/features/chat-style-comments/index.js';

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    const exported = globalThis.YTKitFeatures.chatStyleComments;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
}

function extractTemplate(block, name) {
    const tick = String.fromCharCode(96);
    const needle = 'const ' + name + ' = ';
    const start = block.indexOf(needle);
    assert.ok(start > -1, 'chatStyleComments block must declare ' + name);
    const open = block.indexOf(tick, start + needle.length);
    assert.ok(open > -1, name + ' must be a template literal');
    for (let i = open + 1; i < block.length; i++) {
        if (block[i] === tick && block[i - 1] !== '\\') return block.slice(open + 1, i);
    }
    throw new Error('unterminated template literal: ' + name);
}

test('chatStyleComments module exports the style builder surface', () => {
    const { mod, exported } = loadModule();
    assert.equal(typeof mod.buildCommentRestyleCss, 'function');
    assert.equal(typeof mod.buildPremiumCommentsCss, 'function');
    assert.equal(typeof mod.buildPremiumInteractionCss, 'function');
    assert.equal(typeof mod.buildSelectorSupportFallbackCss, 'function');
    assert.deepEqual(mod.STYLE_IDS, {
        base: 'chatStyleComments',
        premium: 'chatStyleComments-premium',
        interaction: 'chatStyleComments-premium-2'
    });
    assert.equal(typeof exported.buildCommentRestyleCss, 'function');
});

test('chatStyleComments style builders preserve the monolith fallback CSS', () => {
    const { mod } = loadModule();
    const [block] = extractFeatureBlock(sources.ytkit, 'chatStyleComments');
    const interpolation = String.fromCharCode(36, 123) + 'Z.TOAST + 2}';

    assert.equal(mod.buildCommentRestyleCss(), extractTemplate(block, 'css'));
    assert.equal(mod.buildPremiumCommentsCss(), extractTemplate(block, 'premiumCss'));
    assert.equal(
        mod.buildPremiumInteractionCss({ tooltipZ: 70002 }),
        extractTemplate(block, 'premiumInteractionCss').replace(interpolation, '70002')
    );
    assert.equal(mod.buildSelectorSupportFallbackCss(), extractTemplate(block, 'selectorSupportFallbackCss'));
});

test('chatStyleComments monolith delegates CSS payloads through the feature module', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'chatStyleComments');
    assert.match(block, /globalThis\.YTKitFeatures && globalThis\.YTKitFeatures\.chatStyleComments/,
        'ytkit.js must read the chatStyleComments feature namespace');
    for (const builder of [
        'buildCommentRestyleCss',
        'buildPremiumCommentsCss',
        'buildPremiumInteractionCss',
        'buildSelectorSupportFallbackCss'
    ]) {
        assert.match(block, new RegExp('chatStyleFeatures\\.' + builder),
            'ytkit.js must delegate to ' + builder + ' when the module is loaded');
    }
    assert.match(block, /buildPremiumInteractionCss\(\{ tooltipZ: Z\.TOAST \+ 2 \}\)/,
        'tooltip z-index must remain tied to the monolith Z table');
});

test('chatStyleComments module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const moduleIndex = scripts.indexOf('features/chat-style-comments/index.js');
        assert.ok(moduleIndex > -1, 'manifest content script must include chat-style-comments module');
        assert.ok(moduleIndex < ytkitIndex, 'chat-style-comments module must load before ytkit.js');
    }
});
