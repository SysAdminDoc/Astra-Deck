'use strict';

// These were two regex scans asking whether the module file contains the words
// "YTKitFeatures" and "accent". The builders are pure functions, so they are
// now called and their CSS read back.

const test = require('node:test');
const assert = require('node:assert/strict');

const themeCss = require('../../extension/features/theme-css');

test('the progress-bar builder stays silent unless the user picked a colour', () => {
    // Emitting a rule for YouTube's own red would override nothing and add a
    // stylesheet for no reason.
    assert.equal(themeCss.buildProgressBarCss({}), null, 'no colour, no rule');
    assert.equal(themeCss.buildProgressBarCss({ customProgressBarColor: '#ff0000' }), null,
        "YouTube's own red is not a customisation");
    assert.equal(themeCss.buildProgressBarCss({ customProgressBarColor: '#FF0000' }), null,
        'and case must not smuggle it past that check');
    assert.equal(themeCss.buildProgressBarCss({ customProgressBarColor: 'red' }), null,
        'a non-hex value is refused rather than interpolated into CSS');
    assert.equal(themeCss.buildProgressBarCss({ customProgressBarColor: '#00ff00; } body { display:none' }), null,
        'and so is anything that would break out of the declaration');

    const css = themeCss.buildProgressBarCss({ customProgressBarColor: '#00ff88' });
    assert.match(css, /\.ytp-play-progress[^{]*\{[^}]*background: #00ff88 !important/);
    assert.match(css, /\.ytp-volume-slider-foreground::after[^{]*\{[^}]*background: #00ff88 !important/,
        'the volume slider follows the same accent, or the player looks half-themed');
});

test('the accent builder publishes both the hex and the rgb triple', () => {
    const css = themeCss.buildAccentColorCss({ themeAccentColor: '#ff0000' });
    assert.match(css, /--ytkit-accent: #ff0000 !important/);
    assert.match(css, /--ytkit-accent-rgb: 255,0,0 !important/,
        'rgba() consumers need the triple, and deriving it in CSS is not possible');

    const other = themeCss.buildAccentColorCss({ themeAccentColor: '#0080ff' });
    assert.match(other, /--ytkit-accent-rgb: 0,128,255 !important/,
        'the triple must be derived from the hex, not hardcoded');
});

test('the selection builder always emits a rule, so the caller owns the toggle', () => {
    const css = themeCss.buildSelectionColorCss({ selectionColor: '#0000ff' });
    assert.match(css, /::selection \{ background: #0000ff !important/);
    assert.match(css, /::-moz-selection \{ background: #0000ff !important/,
        'Firefox needs its own prefixed rule or selection stays default there');

    const fallback = themeCss.buildSelectionColorCss({});
    assert.match(fallback, /#2dd36f/, 'an unset colour falls back to the schema default');
});

test('every lifecycle spec names a feature and builds CSS for it', () => {
    assert.ok(Array.isArray(themeCss.LIFECYCLE_SPECS) && themeCss.LIFECYCLE_SPECS.length > 0);
    for (const spec of themeCss.LIFECYCLE_SPECS) {
        assert.ok(spec.id, 'a spec with no id cannot be toggled');
        assert.equal(typeof spec.buildCss, 'function', `${spec.id} must build its own CSS`);
        const css = spec.buildCss({});
        assert.ok(css === null || typeof css === 'string',
            `${spec.id} must return CSS or an explicit null, never undefined`);
    }
});
