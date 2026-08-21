'use strict';

// The light-theme gate decides, per surface, whether text is nearly invisible
// on white. Until 2026-08-21 it answered that question by matching literal hex
// values in the rule body, which was wrong in three directions at once:
//
//   - a rule saying `color: var(--ytkit-card-text)` was invisible to it, so
//     tokenising a surface removed it from the scan without fixing anything;
//   - a light-lane rule counted as coverage the moment it contained any
//     `color:` at all, even when the token it named had no light value and
//     resolved straight back to the dark one;
//   - and a surface painting its own opaque ground was flagged even though it
//     reads correctly on either theme.
//
// The summary line is a poor oracle for any of this: the skips are silent by
// construction. These exercise the predicates directly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gate = require('../scripts/check-light-theme-lane.js');

test('the gate reuses the shared contrast implementation without a hex-prefix matcher', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'check-light-theme-lane.js'), 'utf8');
    assert.match(source, /require\('\.\/check-contrast\.js'\)/);
    assert.doesNotMatch(source, /NEAR_WHITE|#\[ef\]\[0-9a-f\]/i);
});

test('the palette is read in both lanes', () => {
    const palette = gate.readPalette();
    assert.ok(palette.dark.size >= 20, `dark lane parsed ${palette.dark.size} tokens`);
    assert.ok(palette.light.size >= 3, `light lane parsed ${palette.light.size} tokens`);
    // The card family is the page-embedded one and is the reason the light
    // lane exists at all.
    for (const token of ['--ytkit-card-bg', '--ytkit-card-border', '--ytkit-card-text']) {
        assert.ok(palette.dark.has(token), `${token} must have a dark value`);
        assert.ok(palette.light.has(token), `${token} must have a light value`);
        assert.notEqual(palette.dark.get(token), palette.light.get(token),
            `${token} must actually differ between lanes`);
    }
});

test('the panel palette is read too, or every panel label looks broken', () => {
    // settings-visual-system.js relights --ytkit-v3-* under a panel-scoped
    // lane. Miss it and .ytkit-feature-name and friends read as near-invisible
    // text with no light lane, which they are not.
    const palette = gate.readPalette();
    assert.ok(palette.dark.has('--ytkit-v3-text'), 'panel dark text token must be read');
    assert.ok(palette.light.has('--ytkit-v3-text'), 'panel light text token must be read');
    assert.ok(gate.isNearInvisibleOnLight(palette.dark.get('--ytkit-v3-text')),
        'the panel dark text token should be near-invisible on white');
    assert.ok(!gate.isNearInvisibleOnLight(palette.light.get('--ytkit-v3-text')),
        'the panel light text token must remain visible on white');
});

test('a token with no light value resolves back to its dark one', () => {
    // Not a lookup failure. It is the defect: a light-lane rule naming such a
    // token paints the dark colour on a light page.
    const dark = gate.resolveColor('var(--ytkit-overlay-text)', 'dark');
    const light = gate.resolveColor('var(--ytkit-overlay-text)', 'light');
    assert.equal(dark, light, '--ytkit-overlay-text is deliberately dark-only');
    assert.ok(gate.isNearInvisibleOnLight(light), 'so it stays near-invisible in the light lane');

    // And one that does relight must not.
    assert.equal(gate.isNearInvisibleOnLight(gate.resolveColor('var(--ytkit-card-text)', 'dark')), false,
        '--ytkit-card-text is visible in either lane');
    assert.notEqual(gate.resolveColor('var(--ytkit-card-text)', 'dark'),
        gate.resolveColor('var(--ytkit-card-text)', 'light'));
});

test('an unknown token falls back to the literal beside it', () => {
    assert.match(gate.resolveColor('var(--ytkit-not-a-token, #ffffff)', 'dark'), /#ffffff/);
    // No fallback and no definition leaves the reference alone rather than
    // inventing a colour — the declaration is invalid in the browser too.
    assert.match(gate.resolveColor('var(--ytkit-not-a-token)', 'dark'), /var\(/);
});

test('the detector measures light-background contrast instead of a hex prefix', () => {
    assert.equal(gate.YOUTUBE_LIGHT_BACKGROUND, '#ffffff');
    assert.equal(gate.LIGHT_THEME_CONTRAST_FLOOR, 2);
    assert.equal(gate.isNearInvisibleOnLight('#ff0000'), false, 'red remains legible');
    assert.equal(gate.isNearInvisibleOnLight('#ff8f70'), false, 'salmon remains legible');
    assert.equal(gate.isNearInvisibleOnLight('#e0af68'), false, '2.00:1 amber is visible');
    assert.equal(gate.isNearInvisibleOnLight('#d8d8d8'), true, 'light gray is near-invisible on white');
    assert.equal(gate.lightThemeContrast('#d8d8d8').toFixed(2), '1.43');
    assert.equal(gate.isNearInvisibleOnLight('rgba(255, 0, 0, 0.1)'), true,
        'alpha must be composited onto the light background before measurement');
});

test('tokenised near-invisible text is still measured', () => {
    // The escape hatch this closes: swapping a literal for a dark-only token
    // must not make a surface disappear from the scan.
    assert.ok(gate.paintsNearInvisibleOnLight('color: var(--ytkit-overlay-text);', 'dark'));
    assert.ok(gate.paintsNearInvisibleOnLight('color: var(--ytkit-overlay-text);', 'light'));
    assert.ok(!gate.paintsNearInvisibleOnLight('color: var(--ytkit-card-text);', 'light'));
});

test('a surface that paints its own ground is not flagged', () => {
    assert.ok(gate.providesOwnGround('background: #171b23;'));
    assert.ok(gate.providesOwnGround('background: var(--ytkit-overlay-bg);'));
    assert.ok(gate.providesOwnGround('background-image: linear-gradient(135deg, #ff8a64, #ff5f4a);'));
    assert.ok(!gate.providesOwnGround('background: transparent;'));
    assert.ok(!gate.providesOwnGround('color: #fff;'));
});


test('a wash is not a ground, but an opaque colour is', () => {
    // Two thresholds on purpose. The loose one keeps the report quiet about
    // surfaces sitting on an Astra panel a regex cannot walk up to; the strict
    // one refuses to let a four-percent wash excuse a light lane that resolves
    // to the dark colour anyway. Collapsing them either buries the real debt
    // under 150 false positives or lets the inert-lane check be defeated by
    // the very surface that motivated it.
    assert.ok(gate.providesOwnGround('background: rgba(15,23,42,0.04);'),
        'the loose threshold accepts a wash');
    assert.ok(!gate.providesOpaqueGround('background: rgba(15,23,42,0.04);'),
        'the strict threshold does not');
    assert.ok(gate.providesOpaqueGround('background: rgba(23,27,35,0.96);'));
    assert.ok(gate.providesOpaqueGround('background: linear-gradient(135deg, #ff8a64, #ff5f4a);'));
    assert.ok(gate.providesOpaqueGround('color:#f8fafc;text-shadow: 0 1px 3px #000;'),
        'a rule that shadows its own text has provided legibility explicitly');
    assert.ok(!gate.providesOpaqueGround('background: transparent;'));
});


test('a surface inherits the ground of the container it is named under', () => {
    // .ytkit-pm paints a 98%-opaque ground and .ytkit-pm-title sits inside it,
    // so the child is as legible on light theme as the parent. A per-class scan
    // cannot walk the DOM, and without this it flags all eight children of a
    // perfectly good dark overlay. The class naming is prefix-based throughout,
    // which makes the prefix a usable stand-in for containment.
    const { needsLane, hasLane } = gate.scan(['extension/ytkit.js']);
    const flagged = (token) => needsLane.has(token) && !hasLane.has(token);
    for (const token of ['ytkit-pm-card-desc', 'ytkit-pm-card-label', 'ytkit-pm-empty-title']) {
        assert.ok(!flagged(token), `${token} sits on an opaque overlay and must not be reported`);
    }
});

test('the scan still reports the real debt and every covered surface', () => {
    const files = ['extension/ytkit.js', 'extension/features/video-hider/index.js'];
    const { needsLane, hasLane } = gate.scan(files);
    assert.ok(hasLane.size > 0, 'the scan must find covered surfaces');
    // .ytkit-hidden-note and the placeholder are the two surfaces whose light
    // lanes were inert until the card family gave them real light values.
    for (const token of ['ytkit-hidden-note', 'ytkit-video-hidden-placeholder']) {
        assert.ok(hasLane.has(token), `${token} must count as covered`);
        assert.ok(!needsLane.has(token), `${token} must not also be reported as uncovered`);
    }
});
