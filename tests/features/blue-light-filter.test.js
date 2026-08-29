'use strict';

// These were two regex scans asking whether the module file contains the words
// "YTKitFeatures" and "rgba". Neither could tell a working warm-tint from a
// broken one, so the builder is now called across its range and its output
// parsed back into numbers.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBlueLightRgba, OVERLAY_FIXED_CSS, featureSpec } = require('../../extension/features/blue-light-filter');

const parseRgba = (value) => {
    const match = /^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/.exec(value);
    assert.ok(match, `expected an rgba() string, got ${value}`);
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: Number(match[4]) };
};

test('the warm tint gets warmer and stronger as intensity rises', () => {
    const low = parseRgba(buildBlueLightRgba({ blueLightIntensity: 10 }));
    const mid = parseRgba(buildBlueLightRgba({ blueLightIntensity: 40 }));
    const high = parseRgba(buildBlueLightRgba({ blueLightIntensity: 80 }));

    for (const tint of [low, mid, high]) {
        assert.equal(tint.r, 255, 'the overlay is a warm tint, so red stays at full');
    }
    assert.ok(low.a < mid.a && mid.a < high.a, 'a higher setting must be more opaque');
    assert.ok(low.g > mid.g && mid.g > high.g, 'and warmer: green falls as intensity rises');
    assert.ok(low.b > mid.b && mid.b > high.b, 'and blue falls fastest, which is the point');
    assert.ok(high.a <= 0.35, 'the overlay never becomes opaque enough to hide the video');
});

test('the intensity is clamped to the schema range, in both directions', () => {
    const floor = buildBlueLightRgba({ blueLightIntensity: 10 });
    const ceiling = buildBlueLightRgba({ blueLightIntensity: 80 });

    assert.equal(buildBlueLightRgba({ blueLightIntensity: 0 }), floor, 'below the floor clamps up');
    assert.equal(buildBlueLightRgba({ blueLightIntensity: -50 }), floor);
    assert.equal(buildBlueLightRgba({ blueLightIntensity: 100 }), ceiling, 'above the ceiling clamps down');
    assert.equal(buildBlueLightRgba({ blueLightIntensity: 9999 }), ceiling);
});

test('a missing setting falls back to the schema default rather than nothing', () => {
    const fallback = buildBlueLightRgba({});
    assert.equal(buildBlueLightRgba(undefined), fallback);
    assert.equal(buildBlueLightRgba({ blueLightIntensity: null }), fallback);
    assert.equal(fallback, buildBlueLightRgba({ blueLightIntensity: 30 }),
        'the fallback is the schema default of 30, not 0');
    assert.ok(parseRgba(fallback).a > 0, 'a default install must actually tint something');
});

test('the overlay covers the viewport without swallowing clicks', () => {
    assert.equal(OVERLAY_FIXED_CSS.position, 'fixed');
    assert.equal(OVERLAY_FIXED_CSS.pointerEvents, 'none',
        'an overlay that ate pointer events would make the page unusable');
    assert.equal(featureSpec.id, 'blueLightFilter');
    assert.equal(featureSpec.buildRgba, buildBlueLightRgba,
        'the lifecycle spec and the export must be the same builder');
});
