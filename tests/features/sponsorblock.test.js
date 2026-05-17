'use strict';

// Per-area test bed for the SponsorBlock feature.
//
// NX12 modularization seed (v3.23.0). Future SponsorBlock regressions
// land here; pre-existing tests in `tests/hardening.test.js` migrate
// incrementally.

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, extractFeatureBlock } = require('../helpers/source');

test('SponsorBlock feature block is reachable via the shared helper', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'sponsorBlock');
    assert.ok(block.length > 100,
        'SponsorBlock feature block must contain non-trivial source');
    assert.match(block, /_loadForVideo|_checkSkip|_segments/,
        'SponsorBlock feature must carry its segment-load / skip API');
});

test('SponsorBlock skip path announces via aria-live with a human-friendly category label (NX5)', () => {
    // The aria-live announcement landed in _checkSkip alongside the
    // already-shipped no-toast invariant. Pin the label map so a
    // refactor can't reduce screen-reader output to "Skipped sponsor"
    // (which is fine but the v3.23.0 surface uses richer labels).
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    assert.ok(idx > -1, '_checkSkip must exist');
    const region = block.slice(idx, idx + 3500);
    assert.match(region, /announceA11y\(/,
        'SponsorBlock skip must announce via announceA11y');
    assert.match(region, /Skipped \$\{label\}/,
        'SponsorBlock announcement must use a human-friendly category label, not the raw category id');
});

test('poi_highlight stays a marker, never a skip target (v3.20.1 Pass 8)', () => {
    // Pin the documented SponsorBlock API contract: poi_highlight is
    // a jump-to reference, never an auto-skip end. Pass 8 closed this
    // correctness finding; this regression keeps it closed.
    const block = sources.ytkit;
    const idx = block.indexOf('_checkSkip()');
    const region = block.slice(idx, idx + 1500);
    assert.match(region, /poi_highlight/,
        '_checkSkip must reference poi_highlight by name');
    assert.match(region, /continue/,
        '_checkSkip must short-circuit on poi_highlight (continue, not skip)');
});
