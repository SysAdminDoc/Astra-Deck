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

// The ytkit.js `|| { … }` object is the fallback used only when the module
// content script fails to load. It drifted from the module for months (the
// module never wrote the voting/peek attributes; the fallback never learned
// the route token or the lazy-image guard), so the two are now kept
// character-identical and this pin fails the moment they diverge again.
function extractObjectBody(source, startIndex) {
    let depth = 0;
    for (let i = startIndex; i < source.length; i += 1) {
        const char = source[i];
        if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(startIndex, i + 1);
        }
    }
    throw new Error('extractObjectBody: unbalanced braces');
}

test('DeArrow monolith fallback is character-identical to the peeled module', () => {
    const moduleStart = dearrowModuleSource.indexOf('return {') + 'return '.length;
    const moduleBody = extractObjectBody(dearrowModuleSource, moduleStart)
        .split('\n').map(line => line.replace(/^\s+/, '')).join('\n');
    const fallbackStart = sources.ytkit.indexOf('|| {', sources.ytkit.indexOf('createDeArrowFeature')) + 3;
    const fallbackBody = extractObjectBody(sources.ytkit, fallbackStart)
        .split('\n').map(line => line.replace(/^\s+/, '')).join('\n');
    assert.equal(fallbackBody, moduleBody,
        'extension/ytkit.js DeArrow fallback must mirror features/dearrow/index.js — ' +
        'fix the module, then copy its object body into the fallback');
});

test('DeArrow feature block is reachable via the shared helper', () => {
    // Sanity: the helper-based extraction works for DeArrow. If this
    // ever fails, the feature id was renamed and every DeArrow
    // regression in this file is suspect.
    const [block] = extractFeatureBlock(sources.ytkit, 'deArrow');
    assert.ok(block.length > 100,
        'DeArrow feature block must contain non-trivial source');
    assert.match(block, /name:\s*['"]DeArrow['"]/,
        'DeArrow feature block must carry the user-facing name');
});

test('DeArrow watch-page title replacement announces via aria-live (NX5)', () => {
    // The watch-page-gated aria-live announcement lives in the title-
    // replace path. Pin both the announce call and the page gate so a
    // refactor can't silently regress the assistive-tech surface.
    // Anchored on the code that builds the replacement title node, not on a
    // comment: the module and the ytkit.js fallback are kept identical, and a
    // comment-only anchor made the pin drift with prose.
    for (const [label, source] of [['ytkit.js', sources.ytkit], ['module', dearrowModuleSource]]) {
        const start = source.indexOf("clone.className = 'daCustomTitle '");
        assert.ok(start > -1, `DeArrow primary-title path must exist in ${label}`);
        const region = source.slice(start, start + 2400);
        assert.match(region, /announceA11y\(/,
            `DeArrow primary-title replacement must call announceA11y (${label})`);
        assert.match(region, /isWatchPagePath\(\)/,
            `DeArrow announcement must be gated on isWatchPagePath() — grid spam would be unacceptable (${label})`);
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
    const [block] = extractFeatureBlock(sources.ytkit, 'deArrow');

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

test('DeArrow marker classes are unique to YTKit (no YouTube namespace collision)', () => {
    // The .daCustomTitle / .da-replaced-thumb / [data-da-processed]
    // markers are how we know we've already touched a node. They MUST
    // stay unique to us (the "da" prefix is short for "DeArrow"). If
    // YouTube ever shipped a class named .daCustomTitle natively, our
    // duplicate-detection would false-positive.
    const [block] = extractFeatureBlock(sources.ytkit, 'deArrow');
    assert.match(block, /\.daCustomTitle/);
    assert.match(block, /\.da-replaced-thumb/);
    assert.match(block, /\[data-da-processed\]|data-da-processed/);
    // Be defensive: marker classes must NOT be generic words like "title"
    // or "thumb" alone. They must keep the "da" / "da-" prefix.
    const markerLine = (block.match(/'\.daCustomTitle'[^;]*?(?:;|\n)/) || [''])[0];
    assert.ok(markerLine.includes('daCustomTitle'),
        'marker class must keep the "da" prefix to avoid colliding with YouTube namespace');
});
