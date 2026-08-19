'use strict';

// The mobile lane switched .ytkit-feature-desc to a two-line -webkit-line-clamp
// box. A later top-level rule for the same element sets overflow: visible, and
// being later it wins — so the clamp sized the box to two lines and the third
// line painted outside it, sheared horizontally behind the select control with
// no ellipsis. A clamp without overflow: hidden is not a clamp.
//
// The rendered smoke is the real proof (it reproduces the shear and names each
// offending description); this pins the CSS contract so the fight cannot be
// reintroduced, and pins the smoke check that would catch it if it were.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const visualSystem = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'settings-visual-system.js'), 'utf8');
const smoke = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'smoke-settings-overlay.js'), 'utf8');

function descriptionRules() {
    // Every rule whose selector list ends at .ytkit-feature-desc, with its body.
    return [...visualSystem.matchAll(/#ytkit-settings-panel[^{}]*\.ytkit-feature-desc\s*\{([^}]*)\}/g)]
        .map((m) => m[1]);
}

test('no description rule clamps lines', () => {
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
    // If this ever flips back to hidden, a clamp becomes viable again and the
    // assertion above should be revisited rather than worked around.
    const rules = descriptionRules();
    const last = rules[rules.length - 1];
    assert.match(last, /overflow:\s*visible/,
        'the last rule decides the box model for every width');
    assert.match(last, /white-space:\s*normal/);
});

test('the mobile lane still narrows the type without re-boxing it', () => {
    const at = visualSystem.indexOf('@media (max-width: 560px)');
    assert.ok(at > 0, 'the mobile lane must still exist');
    const lane = visualSystem.slice(at, visualSystem.indexOf('@media', at + 10));
    const rule = lane.match(/\.ytkit-feature-desc\s*\{([^}]*)\}/);
    assert.ok(rule, 'the mobile lane must still style descriptions');
    assert.match(rule[1], /font-size:\s*13px/);
    assert.match(rule[1], /display:\s*block/,
        'block, so nothing re-boxes the element on the way to the later rule');
});

test('the rendered smoke checks description overflow on mobile states', () => {
    // The pre-existing "readable primary controls" assertion never looked at
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

test('both mobile states run the check', () => {
    const states = [...smoke.matchAll(/\{ name: '(mobile-[a-z]+)', width: (\d+)/g)];
    assert.equal(states.length, 2, 'both mobile states must still be rendered');
    for (const [, , width] of states) {
        assert.ok(Number(width) <= 560,
            'a mobile state wider than the lane would never enter the branch');
    }
});
