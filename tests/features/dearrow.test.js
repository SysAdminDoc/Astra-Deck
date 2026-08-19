'use strict';

// Per-area test bed for the DeArrow feature.
//
// NX12 modularization seed (v3.23.0). This file is the canonical home
// for future DeArrow-specific regressions; existing DeArrow tests in
// `tests/hardening.test.js` may migrate here incrementally — until then,
// keep new DeArrow regressions HERE and old ones THERE rather than
// duplicating.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, extractFeatureBlock } = require('../helpers/source');

const dearrowModulePath = path.join(
    __dirname, '..', '..', 'extension', 'features', 'dearrow', 'index.js'
);
const dearrowModuleSource = fs.readFileSync(dearrowModulePath, 'utf8');

// The ytkit.js `|| { … }` object used to be a full second copy of the feature,
// reached only when the module content script failed to load. It drifted from
// the module for months (the module never wrote the voting/peek attributes; the
// copy never learned the route token or the lazy-image guard), and the remedy
// was a character-identical pin. v4.72.0 deleted the copy instead, which is the
// only way the drift cannot come back. What is left must stay a descriptor: the
// settings list still needs a name, a group, and isParent when the module is
// missing.
test('DeArrow monolith keeps only a descriptor stub', () => {
    const factoryIndex = sources.ytkit.indexOf('createDeArrowFeature');
    assert.ok(factoryIndex > -1, 'ytkit.js must construct DeArrow through the module factory');
    const stubStart = sources.ytkit.indexOf('|| {', factoryIndex);
    const stubEnd = sources.ytkit.indexOf('\n        }),', stubStart);
    assert.ok(stubEnd > stubStart, 'DeArrow stub must terminate');
    const stub = sources.ytkit.slice(stubStart, stubEnd);
    assert.ok(stub.length < 1400,
        `DeArrow fallback must stay a descriptor stub, got ${stub.length} bytes`);
    for (const key of ['id', 'name', 'description', 'group', 'icon', 'isParent']) {
        assert.match(stub, new RegExp(`\\b${key}:`), `stub must still declare ${key}`);
    }
    assert.doesNotMatch(stub, /_renderTitle|_fetchBranding|_processPage/,
        'stub must not re-inline the implementation the module owns');
});

test('DeArrow feature block is reachable via the shared helper', () => {
    // Sanity: the helper-based extraction works for DeArrow. If this
    // ever fails, the feature id was renamed and every DeArrow
    // regression in this file is suspect.
    const [block] = extractFeatureBlock(sources.ytkit, 'deArrow');
    assert.ok(block.length > 100,
        'DeArrow feature block must contain non-trivial source');
    assert.match(block, /name:\s*(?:t\(['"]feature_deArrow_name['"],\s*)?['"]DeArrow['"]/,
        'DeArrow feature block must carry the user-facing name');
});

test('DeArrow watch-page title replacement announces via aria-live (NX5)', () => {
    // The watch-page-gated aria-live announcement lives in the title-
    // replace path. Pin both the announce call and the page gate so a
    // refactor can't silently regress the assistive-tech surface.
    // Anchor on the shared title renderer rather than a prose comment: the
    // module and the ytkit.js fallback are kept identical.
    for (const [label, source] of [['module', dearrowModuleSource]]) {
        const start = source.indexOf('_renderTitle(titleEl, formatted');
        assert.ok(start > -1, `DeArrow primary-title path must exist in ${label}`);
        const region = source.slice(start, start + 4200);
        assert.match(region, /announceA11y\(/,
            `DeArrow primary-title replacement must call announceA11y (${label})`);
        assert.match(source, /announce:\s*isWatchPagePath\(\)/,
            `DeArrow card announcement must be gated on isWatchPagePath() — grid spam would be unacceptable (${label})`);
        assert.match(region, /daTogether/,
            `DeArrow title renderer must mark the opt-in paired-title mode (${label})`);
    }
});

test('DeArrow paired-title mode covers cards, the watch title, and teardown', () => {
    for (const [label, source] of [['module', dearrowModuleSource]]) {
        assert.match(source, /daShowOriginalTitle/,
            `paired-title mode must read daShowOriginalTitle (${label})`);
        assert.match(source, /_WATCH_TITLE_SELECTORS:[\s\S]*?not\(\.daCustomTitle\)/,
            `watch title lookup must ignore an already-rendered DeArrow clone (${label})`);
        assert.match(source, /if \(isWatchPagePath\(\) && replaceTitles\)/,
            `paired-title mode must process the primary watch title (${label})`);
        assert.match(source, /data-da-original-display/,
            `paired-title mode must remember original display state for teardown (${label})`);
        assert.match(source, /removeAttribute\('data-da-original-title'\)/,
            `paired-title teardown must remove its marker (${label})`);
    }
});

test('DeArrow selectors are resilient to YouTube class-name churn', () => {
    // Upstream DeArrow shipped v2.3.4 (2026-04-08), v2.3.5 (2026-04-11), and
    // v2.3.6 (2026-04-23) — three rapid patches for YouTube swapping one
    // CSS class at a time on the title/thumb nodes. Our DeArrow integration
    // uses durable primitives instead:
    //
    //   - Custom-element tags (Polymer/LIT — durable):
    //       ytd-rich-item-renderer, ytd-video-renderer,
    //       ytd-compact-video-renderer, ytd-grid-video-renderer
    //   - ID selectors (durable — YT keeps these stable for a11y):
    //       #video-title, #video-title-link, #thumbnail
    //   - Attribute selectors (durable):
    //       a[href*="/watch"], a[href*="/channel/"], a[href*="/@"]
    //   - Our own marker classes (we own these):
    //       .daCustomTitle, .da-replaced-thumb, [data-da-processed]
    //   - YT core class (resilient, not hashed):
    //       img.yt-core-image
    //
    // This test pins the resilient surface so a future "optimization" that
    // swaps in a hashed class would fail loudly.
    const block = dearrowModuleSource;

    // Custom-element tags must be the primary card walker.
    assert.match(block, /ytd-rich-item-renderer/,
        'DeArrow must walk ytd-rich-item-renderer (the home/subs grid card)');
    assert.match(block, /ytd-video-renderer/,
        'DeArrow must walk ytd-video-renderer (search results)');
    assert.match(block, /ytd-compact-video-renderer/,
        'DeArrow must walk ytd-compact-video-renderer (watch page sidebar)');
    assert.match(block, /ytd-grid-video-renderer/,
        'DeArrow must walk ytd-grid-video-renderer (channel grid)');

    // ID-based selection for the title element (no hashed-class dependency).
    assert.match(block, /#video-title-link/,
        'DeArrow must select the title link via its stable ID');
    assert.match(block, /#video-title/,
        'DeArrow must fall back to the #video-title ID');
    assert.match(block, /a#thumbnail|#thumbnail/,
        'DeArrow must select the thumbnail anchor via its stable ID');

    // Attribute-based watch-link detection — survives URL parsing changes.
    assert.match(block, /href\*=["']\/watch["']/,
        'DeArrow must match watch URLs via [href*="/watch"]');

    // No hashed-class regression. The pattern that bit upstream DeArrow
    // is a class name like ".Mb_class_abc123" — random alphanumeric
    // suffix on a CSS class. We should never lean on those.
    assert.equal(/\.[A-Z][a-zA-Z_]+_[a-z0-9]{6,}/.test(block), false,
        'DeArrow must NEVER target a hashed/obfuscated CSS class (e.g. ".Mb_xyz_abc123") — ' +
        'YouTube rolls these every few weeks. Use custom-element tags or stable IDs instead.');
});

test('DeArrow Casual Mode gates fallback formatting on the deArrowCasualMode setting', () => {
    const src = dearrowModuleSource;
    assert.match(src, /casualMode/,
        'peeled DeArrow module must reference casualMode');
    assert.match(src, /deArrowCasualMode/,
        'casual mode must read from appState.settings.deArrowCasualMode');
    assert.match(src, /fallback && !casualMode/,
        'fallback formatting path must be gated on !casualMode');
});

test('DeArrow writes the attributes its voting and peek consumers query', () => {
    // deArrowVoting selects `[data-ytkit-dearrow-uuid]` and dearrowPeekButton
    // renders `attr(data-ytkit-orig-title)`. Neither attribute was written by
    // the module that actually ships, so both features were inert.
    assert.match(dearrowModuleSource, /data-ytkit-dearrow-uuid/,
        'the submission UUID must reach the DOM or DeArrow voting finds nothing to vote on');
    assert.match(dearrowModuleSource, /data-ytkit-orig-title/,
        'the original title must reach the DOM or the peek overlay renders empty');
    const voteSelector = sources.ytkit.indexOf('.daCustomTitle[data-ytkit-dearrow-uuid]');
    assert.ok(voteSelector > -1, 'deArrowVoting must still select on the UUID attribute');
    assert.match(sources.ytkit, /html\.ytkit-peek \[data-ytkit-dearrow-title\]/,
        'peek CSS must still key on the marker attribute the replacement writes');
});

test('DeArrow attributes remote titles and thumbnails but not local fallback formatting', () => {
    const source = dearrowModuleSource;
    assert.match(source, /if \(!fallback\) this\._ensureAttribution\(clone\)/,
        'remote title replacements must receive attribution while local formatting stays unattributed');
    assert.match(source, /const attribution = this\._ensureAttribution\(img\)/,
        'remote thumbnail replacements must receive attribution');
    assert.match(source, /\.ytkit-dearrow-attribution[\s\S]*?CC BY-NC-SA 4\.0/,
        'the visible attribution surface must identify the licensed SponsorBlock data');
    assert.match(source, /document\.querySelectorAll\('\.ytkit-dearrow-attribution'\)\.forEach\(c => c\.remove\(\)\)/,
        'navigation and teardown must remove attribution when transformed data disappears');
    assert.match(source, /href = 'https:\/\/sponsor\.ajay\.app\/'/,
        'the attribution must link to the upstream data source');
    assert.match(source, /rel = 'noopener noreferrer'/,
        'the external attribution link must isolate its opener');
});

test('DeArrow marker classes are unique to YTKit (no YouTube namespace collision)', () => {
    // The .daCustomTitle / .da-replaced-thumb / [data-da-processed]
    // markers are how we know we've already touched a node. They MUST
    // stay unique to us (the "da" prefix is short for "DeArrow"). If
    // YouTube ever shipped a class named .daCustomTitle natively, our
    // duplicate-detection would false-positive.
    const block = dearrowModuleSource;
    assert.match(block, /\.daCustomTitle/);
    assert.match(block, /\.da-replaced-thumb/);
    assert.match(block, /\[data-da-processed\]|data-da-processed/);
    // Be defensive: marker classes must NOT be generic words like "title"
    // or "thumb" alone. They must keep the "da" / "da-" prefix.
    const markerLine = (block.match(/'\.daCustomTitle'[^;]*?(?:;|\n)/) || [''])[0];
    assert.ok(markerLine.includes('daCustomTitle'),
        'marker class must keep the "da" prefix to avoid colliding with YouTube namespace');
});
