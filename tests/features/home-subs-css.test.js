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

// ── Views on Their Own Line ─────────────────────────────────────────

const VIEWS_ROW_SCOPE = 'ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) ytd-rich-item-renderer';
const VIEWS_ROW = `${VIEWS_ROW_SCOPE} .ytContentMetadataViewModelMetadataRow:has(> .ytContentMetadataViewModelDelimiter + .ytContentMetadataViewModelLeadingIcon)`;

/** The class lists of each metadata row's direct children, in order. */
function metadataRows(html) {
    const rows = [];
    const tagRe = /<(\/?)([a-z][\w-]*)([^>]*)>/g;
    let current = null;
    let depth = 0;
    for (const match of html.matchAll(tagRe)) {
        const [, closing, , attrs] = match;
        const classes = (/class="([^"]*)"/.exec(attrs)?.[1] || '').split(/\s+/).filter(Boolean);
        if (!current) {
            if (!closing && classes.includes('ytContentMetadataViewModelMetadataRow')) {
                current = [];
                depth = 0;
            }
            continue;
        }
        if (closing) {
            if (depth === 0) {
                rows.push(current);
                current = null;
            } else {
                depth -= 1;
            }
            continue;
        }
        if (depth === 0) current.push(classes);
        depth += 1;
    }
    return rows;
}

// What `:has(> .Delimiter + .LeadingIcon)` asks of a row.
const breaksBeforeEye = (children) => children.some((classes, index) =>
    classes.includes('ytContentMetadataViewModelDelimiter')
    && (children[index + 1] || []).includes('ytContentMetadataViewModelLeadingIcon'));

test('views on their own line breaks only the one-row card, at the delimiter in front of the eye icon', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'feed-views-row-2026-10.html'), 'utf8');
    const [oneRowHtml, twoRowHtml] = html.split('<!-- two rows -->');
    const oneRow = metadataRows(oneRowHtml.split('<!-- one row -->')[1]);
    assert.equal(oneRow.length, 1);
    assert.equal(breaksBeforeEye(oneRow[0]), true);
    assert.ok(oneRow[0][0].includes('ytContentMetadataViewModelMetadataText'), 'the channel name is the first child the ellipsis rule takes');
    assert.ok(oneRow[0][1].includes('ytContentMetadataViewModelIcon'), 'and the badge stays beside it');

    const twoRows = metadataRows(twoRowHtml);
    assert.ok(twoRows.length >= 2);
    assert.deepEqual(twoRows.filter(breaksBeforeEye), [], 'a card that already prints views on a row of its own is left alone');
    assert.ok(twoRows[1][0].includes('ytContentMetadataViewModelLeadingIcon'), 'there the eye icon starts its own row');
});

test('views on their own line wraps the row, caps the channel name and turns the delimiter into the line break', () => {
    const mod = require('../../extension/features/home-subs-css/index.js');
    const css = mod.buildViewsOnSeparateLineCss();
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
        selector: match[1].trim().replace(/\s+/g, ' '),
        body: match[2].replace(/\s+/g, ' ').trim()
    }));
    assert.deepEqual(rules.map((rule) => rule.selector), [
        VIEWS_ROW,
        `${VIEWS_ROW} > .ytContentMetadataViewModelMetadataText:first-child`,
        `${VIEWS_ROW} > .ytContentMetadataViewModelDelimiter:has(+ .ytContentMetadataViewModelLeadingIcon)`
    ]);
    assert.match(rules[0].body, /flex-wrap: wrap !important/);
    assert.match(rules[1].body, /max-width: calc\(100% - 20px\) !important/);
    assert.match(rules[1].body, /text-overflow: ellipsis !important/);
    assert.match(rules[2].body, /flex-basis: 100% !important/);
    assert.match(rules[2].body, /height: 0 !important/);
    assert.doesNotMatch(css, /display: none/, 'the verified badge and the eye icon both stay');

    const spec = mod.LIFECYCLE_SPECS.find((entry) => entry.id === 'viewsOnSeparateLine');
    assert.deepEqual([...spec.pageScopes], ['home', 'subscriptions']);
});

test('views on their own line ships off, and the monolith fallback carries the same rules', () => {
    const schema = require('../../extension/core/settings-schema.js');
    const entry = schema.SETTINGS_SCHEMA.find((setting) => setting.key === 'viewsOnSeparateLine');
    assert.equal(entry.defaultValue, false);
    assert.equal(entry.category, 'feed');
    const defaults = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'default-settings.json'), 'utf8'));
    assert.equal(defaults.viewsOnSeparateLine, false);

    // The runtime skips this module when none of its gating settings is on,
    // and the feature array fixes its CSS when it is built.
    const ytkit = fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');
    const fallback = /buildViewsOnSeparateLineCss\?\.\(\)\s*\|\|\s*`([^`]+)`/.exec(ytkit);
    assert.ok(fallback, 'ytkit.js must carry a fallback for viewsOnSeparateLine');
    const normalize = (text) => text.replace(/\s+/g, ' ').trim();
    const mod = require('../../extension/features/home-subs-css/index.js');
    assert.equal(normalize(fallback[1]), normalize(mod.buildViewsOnSeparateLineCss()));
});
