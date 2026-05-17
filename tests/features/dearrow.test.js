'use strict';

// Per-area test bed for the DeArrow feature.
//
// NX12 modularization seed (v3.23.0). This file is the canonical home
// for future DeArrow-specific regressions; existing DeArrow tests in
// `tests/hardening.test.js` may migrate here incrementally — until then,
// keep new DeArrow regressions HERE and old ones THERE rather than
// duplicating.

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, extractFeatureBlock } = require('../helpers/source');

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
    const block = sources.ytkit;
    const start = block.indexOf('Show original title on hover if setting enabled');
    assert.ok(start > -1, 'DeArrow primary-title path must exist');
    const region = block.slice(start, start + 1500);
    assert.match(region, /announceA11y\(/,
        'DeArrow primary-title replacement must call announceA11y');
    assert.match(region, /isWatchPagePath\(\)/,
        'DeArrow announcement must be gated on isWatchPagePath() — grid spam would be unacceptable');
});
