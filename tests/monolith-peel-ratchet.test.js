'use strict';

// The peel ratchet.
//
// The property that matters is that the gate FAILS when the monolith grows, and
// that it measures the remainder rather than a number that can never fall. A
// count of `id:` occurrences in ytkit.js alone would never move, because the
// monolith keeps a descriptor stub for every feature that has already been
// peeled — so these run the real measurement and the real comparison against a
// planted baseline rather than pinning the script's source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const ratchet = require('../scripts/check-monolith-peel.js');

test('the peel measurement separates peeled features from the inline remainder', () => {
    const measured = ratchet.measure();

    assert.ok(measured.featureModuleCount > 0, 'there are peeled feature modules to find');
    assert.ok(measured.inlineOnly.length > 0, 'the peel is not finished, so a remainder must be reported');
    assert.equal(measured.inlineOnly.length, new Set(measured.inlineOnly).size,
        'the remainder must not double-count an id');

    // The remainder is strictly smaller than the monolith's own id count,
    // because ids the monolith declares that a module ALSO declares are peeled.
    // If these were ever equal, the measure would have degenerated into
    // "ids in ytkit.js", which cannot fall and would make the ratchet inert.
    assert.ok(measured.inlineOnly.length < measured.monolithIdCount,
        'peeled features keep a descriptor stub in ytkit.js and must not count as remainder');

    // Cross-check against the generator that produces the README facts table,
    // so the gate and the published number cannot disagree about what a feature is.
    // Unconditional on purpose. Written first as `typeof facts.collectFacts ===
    // 'function' ? ... : null`, which passed while asserting nothing, because the
    // real export is collectProjectFacts. A guarded cross-check is not a check.
    const { collectProjectFacts } = require('../scripts/project-facts.js');
    const collected = collectProjectFacts();
    assert.equal(measured.totalFeatureIds, collected.featureIds.length,
        'the ratchet and project-facts must count the same feature ids');
});

test('the recorded baseline matches what the tree measures today', () => {
    const baseline = JSON.parse(fs.readFileSync(ratchet.BASELINE_PATH, 'utf8'));
    const measured = ratchet.measure();

    assert.equal(baseline.schemaVersion, 1);
    assert.match(String(baseline.recordedAt), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(baseline.inlineOnlyFeatureIds), 'the baseline records the ids, not just a count');
    assert.equal(baseline.inlineOnlyFeatureIdCount, baseline.inlineOnlyFeatureIds.length,
        'the recorded count and the recorded list must agree');

    const recorded = new Set(baseline.inlineOnlyFeatureIds);
    const grew = measured.inlineOnly.filter((id) => !recorded.has(id));
    assert.deepEqual(grew, [],
        `these feature ids are inline but not in the baseline: ${grew.join(', ')}. `
        + 'Peel them, or re-record with `node scripts/check-monolith-peel.js --record` in the same commit.');
});

test('the ratchet is wired into the check runner under its own floor', () => {
    const { GATES, MIN_GATES } = require('../scripts/run-checks.js');
    const gate = GATES.find((entry) => entry.id === 'monolith-peel');
    assert.ok(gate, 'the peel ratchet must run as part of `npm run check`');
    assert.equal(gate.script, 'check-monolith-peel.js');
    assert.ok(GATES.length >= MIN_GATES,
        `${GATES.length} gates is below the floor of ${MIN_GATES}`);
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', gate.script)),
        'the gate script the runner names must exist');
});
