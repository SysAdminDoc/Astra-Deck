'use strict';

// The mobile lane switched .ytkit-feature-desc to a two-line -webkit-line-clamp
// box. A later top-level rule for the same element sets overflow: visible, and
// being later it wins — so the clamp sized the box to two lines and the third
// line painted outside it, sheared horizontally behind the select control with
// no ellipsis. A clamp without overflow: hidden is not a clamp.
//
// The CSS assertions now read the stylesheet the module PRODUCES, and the
// viewport list comes from the smoke's exported STATES, so neither can drift
// from what ships. Two assertions stay scans and say why: they describe checks
// inside a CLI script that exports no function to call.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { SETTINGS_VISUAL_SYSTEM_CSS } = require('../extension/core/settings-visual-system.js');
const { STATES } = require('../scripts/smoke-settings-overlay.js');

const repoRoot = path.join(__dirname, '..');
const smoke = fs.readFileSync(path.join(repoRoot, 'scripts', 'smoke-settings-overlay.js'), 'utf8');

/** Every rule in the shipped stylesheet whose selector ends at the description. */
function descriptionRules(css = SETTINGS_VISUAL_SYSTEM_CSS) {
    return [...String(css).matchAll(/#ytkit-settings-panel[^{}]*\.ytkit-feature-desc\s*\{([^}]*)\}/g)]
        .map((match) => match[1]);
}

test('the shipped stylesheet clamps no description', () => {
    const rules = descriptionRules();
    assert.ok(rules.length >= 3, `expected the description rules, found ${rules.length}`);
    for (const body of rules) {
        assert.doesNotMatch(body, /-webkit-line-clamp/,
            'a clamp here fights the later overflow: visible rule and shears the overflowing line');
        assert.doesNotMatch(body, /display:\s*-webkit-box/,
            '-webkit-box is only useful with the clamp it was paired with');
    }
});

test('the rule that wins on overflow still wants descriptions to wrap', () => {
    // Later rule, same specificity: this one decides the box model. If it ever
    // flips back to hidden, a clamp becomes viable again and the assertion
    // above should be revisited rather than worked around.
    const rules = descriptionRules();
    const last = rules[rules.length - 1];
    assert.match(last, /overflow:\s*visible/, 'the last rule decides the box model for every width');
    assert.match(last, /white-space:\s*normal/);
});

test('the mobile lane narrows the type without re-boxing it', () => {
    const at = SETTINGS_VISUAL_SYSTEM_CSS.indexOf('@media (max-width: 560px)');
    assert.ok(at > 0, 'the mobile lane must still exist');
    const lane = SETTINGS_VISUAL_SYSTEM_CSS.slice(at, SETTINGS_VISUAL_SYSTEM_CSS.indexOf('@media', at + 10));
    const rule = lane.match(/\.ytkit-feature-desc\s*\{([^}]*)\}/);
    assert.ok(rule, 'the mobile lane must still style descriptions');
    assert.match(rule[1], /font-size:\s*13px/);
    assert.match(rule[1], /display:\s*block/,
        'block, so nothing re-boxes the element on the way to the later rule');
    assert.doesNotMatch(rule[1], /-webkit-line-clamp/, 'and the lane that introduced the clamp stays clear of it');
});

test('both mobile states are narrow enough to enter the lane', () => {
    // Read from the smoke's own STATES rather than from its source: a state
    // renamed or widened there has to fail here.
    const mobile = STATES.filter((state) => state.name.startsWith('mobile-'));
    assert.equal(mobile.length, 2, 'both mobile states must still be rendered');
    for (const state of mobile) {
        assert.ok(state.width <= 560,
            `${state.name} is ${state.width}px, which never enters the max-width: 560px lane`);
    }
});

test('the rendered smoke checks description overflow on mobile states', () => {
    // A scan, because the check lives inside the smoke's page-evaluated string
    // and the script exports no function to call. The rendered smoke is the
    // real proof; this guards the check from being removed silently. The
    // pre-existing "readable primary controls" assertion never looked at
    // descriptions, which is why a sheared line shipped through it.
    assert.match(smoke, /window\.innerWidth <= 560/, 'the mobile branch must still exist');
    assert.match(smoke, /panel\.querySelectorAll\('\.ytkit-feature-desc'\)/,
        'the smoke must walk the descriptions');
    assert.match(smoke, /scrollHeight > description\.clientHeight \+ 1/,
        'content taller than its own box is the signature of the shear');
    assert.match(smoke, /paints outside it/,
        'the failure must distinguish a clean clip from content escaping the box');
    assert.match(smoke, /overflows its box by/,
        'the failure must quantify the overflow so it is actionable');
});
