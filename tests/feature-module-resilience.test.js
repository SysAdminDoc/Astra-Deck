'use strict';

// One rejected deferred feature module used to fail the ENTIRE runtime:
// Promise.all over the peeled feature imports means a single rejection stops
// ytkit.js from ever executing, so "one feature is broken" became "the
// extension does nothing on this page" with only a console signal.
//
// Fail-closed is still correct for the FOUNDATION tier — a missing guard
// module must never be softened into a partial load. This test pins that
// distinction in both directions.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const generated = fs.readFileSync(path.join(repoRoot, 'extension/runtime-bootstrap.js'), 'utf8');
const generator = fs.readFileSync(path.join(repoRoot, 'scripts/generate-runtime-bootstrap.js'), 'utf8');

function featureLoadBlock(source) {
    const at = source.indexOf("timeStage('featureModulesMs'");
    assert.ok(at > 0, 'the feature-module load stage must exist');
    return source.slice(at - 200, at + 1600);
}

test('the feature tier loads with allSettled so one bad module is survivable', () => {
    for (const [name, source] of [['generated', generated], ['generator', generator]]) {
        const block = featureLoadBlock(source);
        assert.match(block, /Promise\.allSettled\(/, `${name}: feature imports must not be all-or-nothing`);
        assert.doesNotMatch(block, /timeStage\('featureModulesMs', \(\) => Promise\.all\(/,
            `${name}: Promise.all here turns one broken feature into a dead runtime`);
    }
});

test('the FOUNDATION tier still fails closed', () => {
    // A missing guard module must never be softened. This is the asymmetry
    // that makes the change above safe.
    // The foundation tier is loaded by runtime-core-loader.mjs, not by the
    // bootstrap -- different file, deliberately different failure policy.
    const loader = fs.readFileSync(path.join(repoRoot, 'extension/runtime-core-loader.mjs'), 'utf8');
    assert.match(generator, /await Promise\.all\(FOUNDATION_MODULES\.map/,
        'foundation modules must remain all-or-nothing');
    assert.match(loader, /await Promise\.all\(FOUNDATION_MODULES\.map/);
    assert.doesNotMatch(loader, /Promise\.allSettled\(FOUNDATION_MODULES/,
        'softening the foundation tier would let a missing guard module through');
});

test('a rejected module is named in the console and the diagnostic ring', () => {
    const block = featureLoadBlock(generated);
    assert.match(block, /console\.error\('\[YTKit\] feature module failed to load: '/);
    assert.match(block, /DiagnosticLog\?\.record\?\.\(/,
        'a silent degradation is the failure mode this replaces');
    assert.match(block, /result\.reason\?\.message/, 'the reason must be reported, not just the path');
});

test('failures are surfaced on bootstrap state for the health panel', () => {
    const block = featureLoadBlock(generated);
    assert.match(block, /bootstrapState\.failedFeatureModules = failedFeatureModules/);
    assert.match(block, /stageTimings\.featureModuleFailureCount = failedFeatureModules\.length/);
    // And the field must be declared up front so readers never see undefined.
    assert.match(generated, /failedFeatureModules: \[\]/);
});

test('the monolith still runs after a feature module fails', () => {
    // The whole point: ytkit.js import must NOT be inside the guarded block or
    // conditional on zero failures.
    const at = generated.indexOf("timeStage('monolithMs'");
    assert.ok(at > 0);
    const before = generated.slice(at - 900, at);
    assert.doesNotMatch(before, /if \(failedFeatureModules\.length\)\s*(return|throw)/,
        'a failed feature must not prevent the monolith from executing');
});

test('the generated file matches the generator', () => {
    // Cheap drift guard: the distinguishing comment must appear in both.
    assert.match(generated, /allSettled, NOT all/);
    assert.match(generator, /allSettled, NOT all/);
});
