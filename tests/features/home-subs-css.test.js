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

/** Rules as { selectors, body, media }. The sheet ends in one @media block. */
function cssRules(css) {
    const at = css.indexOf('@media');
    const chunks = at === -1
        ? [[css, '']]
        : [[css.slice(0, at), ''], [css.slice(css.indexOf('{', at) + 1), css.slice(at, css.indexOf('{', at)).trim()]];
    const rules = [];
    for (const [chunk, media] of chunks) {
        for (const match of chunk.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            rules.push({
                // Commas inside :not(...)/:has(...) don't separate selectors.
                selectors: match[1].split(/,(?![^(]*\))/).map((part) => part.trim().replace(/\s+/g, ' ')),
                body: match[2].replace(/\s+/g, ' ').trim(),
                media
            });
        }
    }
    return rules;
}

test('listFeedLayout puts the 2026-09 lockup in a row on Home and channel video grids', () => {
    // The 2026-09 lockup nests the thumbnail link and the metadata inside
    // .ytLockupViewModelHost, so the rules on yt-lockup-view-model's direct
    // children never matched and each card sat in the narrow thumbnail column.
    const html = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'feed-card-layouts-2026-10.html'), 'utf8');
    const channelCard = html.split('<!-- lockup: channel videos grid -->')[1].split('<!--')[0];
    assert.match(channelCard, /<yt-lockup-view-model[^>]*><div class="ytLockupViewModelHost[^"]*"><a [^>]*class="ytLockupViewModelContentImage"/,
        'the captured lockup still nests its thumbnail link inside the host');
    assert.match(channelCard, /<\/a><div class="ytLockupViewModelMetadata">/, 'with the metadata as the next sibling');

    delete require.cache[require.resolve('../../extension/features/home-subs-css/index.js')];
    const mod = require('../../extension/features/home-subs-css/index.js');
    const rules = cssRules(mod.buildListFeedLayoutCss());
    const declarations = (selector, media = '') => rules
        .filter((rule) => rule.media === media && rule.selectors.includes(selector))
        .map((rule) => rule.body)
        .join(' ');

    const GRID = '#contents.ytd-rich-grid-renderer';
    const channelGrid = 'ytd-browse[page-subtype="channels"] ytd-rich-grid-renderer:not(:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)) > ' + GRID;
    for (const item of [
        `ytd-browse[page-subtype="home"] ${GRID} > ytd-rich-item-renderer`,
        `ytd-browse[page-subtype="subscriptions"]:not([data-ytkit-subscription-view]) ${GRID} > ytd-rich-item-renderer`,
        `${channelGrid} > ytd-rich-item-renderer`
    ]) {
        assert.match(declarations(`${item} .ytLockupViewModelHost`), /display: grid !important; grid-template-columns: minmax\(180px/, `${item}: the host is the row grid`);
        assert.match(declarations(`${item} yt-lockup-view-model > .ytLockupViewModelHost`), /grid-column: 1 \/ -1 !important/, `${item}: the host spans its lockup's grid`);
        assert.match(declarations(`${item} .ytLockupViewModelHost > .ytLockupViewModelContentImage`), /grid-column: 1 !important/, `${item}: thumbnail on the left`);
        assert.match(declarations(`${item} .ytLockupViewModelHost > .ytLockupViewModelMetadata`), /grid-column: 2 !important/, `${item}: details on the right`);
        assert.match(declarations(`${item} .ytLockupViewModelHost`, '@media (max-width: 700px)'), /grid-template-columns: minmax\(128px, 38vw\)/, `${item}: narrow column below 700px`);
    }
    assert.match(declarations(channelGrid), /flex-direction: column !important/, 'a channel video grid becomes one column');
    assert.ok(!rules.some((rule) => rule.selectors.some((selector) => selector.startsWith('ytd-browse[page-subtype="channels"]')
        && !selector.startsWith(channelGrid))), 'channel rules reach grid items only, never Home-tab shelves or the Shorts grid');
    assert.match(declarations('ytd-search[page-subtype="search"] ytd-video-renderer #dismissible > .text-wrapper'), /grid-column: 2 !important/,
        'a search result keeps its text beside the thumbnail');

    const spec = mod.LIFECYCLE_SPECS.find((entry) => entry.id === 'listFeedLayout');
    assert.deepEqual([...spec.pageScopes], ['home', 'subscriptions', 'search', 'channel']);
});

test('listFeedLayout steps aside on Subscriptions once the View switcher is mounted', () => {
    // Subscription View Controls stamps data-ytkit-subscription-view on the
    // page. With List Feed Layout on too, the switcher read Grid over a list
    // and its Grid button did nothing.
    delete require.cache[require.resolve('../../extension/features/home-subs-css/index.js')];
    const mod = require('../../extension/features/home-subs-css/index.js');
    const layout = cssRules(mod.buildListFeedLayoutCss())
        .filter((rule) => !/-webkit-line-clamp/.test(rule.body));
    const subsSelectors = layout.flatMap((rule) => rule.selectors)
        .filter((selector) => selector.includes('page-subtype="subscriptions"'));
    assert.ok(subsSelectors.length > 0);
    for (const selector of subsSelectors) {
        assert.ok(selector.includes(':not([data-ytkit-subscription-view])'), `${selector} must yield to the switcher`);
    }
    const grid = mod.buildFeedGridCss('subscriptions');
    assert.match(grid, /:is\(body:not\(\.ytkit-listFeedLayout\) \*, \[data-ytkit-subscription-view="grid"\]\) #contents\.ytd-rich-grid-renderer/,
        'the switcher set to Grid keeps the workspace grid even with List Feed Layout on');
    assert.match(mod.buildFeedGridCss('home'), /body:not\(\.ytkit-listFeedLayout\) ytd-browse\[page-subtype="home"\]/, 'Home is unchanged');
});

test('listFeedLayout never shows a card Video Hider hid', () => {
    // The list rule's display: block !important on each card out-specified
    // the hider's .ytkit-video-hidden { display: none !important }, so every
    // hidden or filtered card came back once list mode was on.
    delete require.cache[require.resolve('../../extension/features/home-subs-css/index.js')];
    const mod = require('../../extension/features/home-subs-css/index.js');
    const cardEnd = /(?:ytd-rich-item-renderer|ytd-video-renderer|yt-lockup-view-model)(?::not\([^)]*\))*$/;
    const cardRules = cssRules(mod.buildListFeedLayoutCss())
        .filter((rule) => /\bdisplay:/.test(rule.body))
        .flatMap((rule) => rule.selectors.filter((selector) => cardEnd.test(selector)));
    assert.ok(cardRules.length >= 7, 'Home, Subscriptions and channel items plus search cards are styled');
    for (const selector of cardRules) {
        assert.ok(selector.endsWith(':not(.ytkit-video-hidden)'), `${selector} must leave hidden cards hidden`);
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
