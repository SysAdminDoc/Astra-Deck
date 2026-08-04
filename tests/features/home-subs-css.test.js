'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Home/Subs CSS peeled module exports builder functions', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'home-subs-css', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
    assert.match(modSrc, /homeSubsCss|buildHide/i,
        'Module must export CSS builder functions for home/subs features');
});

test('Home/Subs CSS module covers expected feature IDs', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'home-subs-css', 'index.js'), 'utf8');
    // These are the features documented as bundled in the home-subs-css peel
    const expectedIds = ['hideCreateButton', 'hideVoiceSearch', 'widenSearchBar',
        'disablePlayOnHover', 'fullWidthSubscriptions', 'hideSubscriptionOptions',
        'listFeedLayout'];
    let found = 0;
    for (const id of expectedIds) {
        if (modSrc.includes(id)) found++;
    }
    assert.ok(found >= 3,
        `Module should reference at least 3 of the 7 bundled home/subs features (found ${found})`);
});

test('listFeedLayout covers the three feed surfaces and modern card metadata', () => {
    const mod = require('../../extension/features/home-subs-css/index.js');
    const css = mod.buildListFeedLayoutCss();
    for (const marker of [
        'page-subtype="home"',
        'page-subtype="subscriptions"',
        'page-subtype="search"',
        'grid-template-columns',
        'yt-lockup-view-model',
        'yt-lockup-metadata-view-model',
        '#details'
    ]) {
        assert.ok(css.includes(marker), `listFeedLayout CSS must contain ${marker}`);
    }
});

test('hideCreateButton does not depend on the English aria-label alone', () => {
    // The label is English-only, so the toggle silently did nothing on the ten
    // other shipped locales. The "+" glyph path is identical in every language
    // (captured in mhtml/YouTube.mhtml) and is scoped to the masthead button
    // row so the signed-out Sign in button is not caught by it.
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'home-subs-css', 'index.js'), 'utf8');
    const start = modSrc.indexOf('function buildHideCreateButtonCss');
    assert.ok(start > -1, 'the create-button rule builder must exist');
    const css = modSrc.slice(start, start + 900);
    assert.doesNotMatch(css, /button\[aria-label="Create"\]/,
        'the module must not depend on the English label');
    assert.match(css, /ytd-masthead #buttons ytd-button-renderer:has\(path\[d\^="M12 3a1 1 0 00-1 1v7H4"\]\)/,
        'a language-independent glyph anchor must exist');
});
