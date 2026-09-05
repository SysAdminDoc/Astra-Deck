'use strict';

// Which player rollout the page is actually showing.
//
// YouTube's 2026 refresh is served per account and per device, so two users on
// the same extension version can be looking at different players. The tier
// already answers "did the stable chain hold"; it cannot answer "which page is
// this", and with an empty issue tracker the diagnostics bundle is the only
// intake this project has. Without the variant, "the selector broke" and "this
// user is on the other rollout" are indistinguishable, and they need different
// fixes.
//
// The rule these enforce is that the answer is derived from the selector that
// already matched. Nothing here may issue a document query of its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

function loadCoreModule(relPath, primeCore) {
    if (primeCore) globalThis.YTKitCore = primeCore;
    const src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    (0, eval)(src);
    return globalThis.YTKitCore;
}

function loadWithPacks() {
    globalThis.YTKitCore = {};
    loadCoreModule('extension/core/selector-packs/playerChrome.js');
    return loadCoreModule('extension/core/selectors.js');
}

test('a matched selector names the rollout its pack declares it under', () => {
    const core = loadWithPacks();

    assert.equal(core.resolveSurfaceVariant('playerChrome', '.ytp-chrome-bottom').variant, 'classic');
    assert.equal(core.resolveSurfaceVariant('playerChrome', '.ytp-delhi-modern').variant, 'delhi');
    assert.equal(core.resolveSurfaceVariant('playerChrome', '.ytp-overflow-panel').variant, 'delhi');

    const classic = core.resolveSurfaceVariant('playerChrome', '.ytp-progress-bar');
    assert.equal(classic.primary, 'classic');
    assert.equal(classic.isPrimary, true);

    const delhi = core.resolveSurfaceVariant('playerChrome', '.ytp-action-pill');
    assert.equal(delhi.isPrimary, false, 'the non-primary rollout is what a report needs to call out');
});

test('an unrecognised page reports unknown rather than guessing a rollout', () => {
    const core = loadWithPacks();

    for (const [surface, selector] of [
        ['playerChrome', '.some-selector-that-no-pack-declares'],
        ['playerChrome', ''],
        ['', '.ytp-chrome-bottom'],
        ['aSurfaceWithNoPack', '.ytp-chrome-bottom']
    ]) {
        const resolved = core.resolveSurfaceVariant(surface, selector);
        assert.equal(resolved.variant, 'unknown', `${surface || '(none)'} / ${selector || '(none)'}`);
        assert.equal(resolved.isPrimary, null, 'unknown must not be reported as primary or non-primary');
    }
});

test('a pack that declares no variants is left alone', () => {
    const core = loadWithPacks();
    const registry = new Map([['plain', { surface: 'plain', stable: ['.a'], fallback: ['.b'] }]]);

    const resolved = core.resolveSurfaceVariant('plain', '.a', { registry });

    assert.equal(resolved.variant, 'unknown');
    assert.equal(resolved.primary, null);
});

test('hook lookups resolve against their parent surface pack', () => {
    const core = loadWithPacks();
    // Attribution records hook lookups as `surface.hook`, and the variant of a
    // hook is the variant of the surface it belongs to.
    assert.equal(core.resolveSurfaceVariant('playerChrome.right.controls', '.ytp-delhi-modern').variant, 'delhi');
});

test('the health report names the player rollout and the surfaces off their primary', () => {
    const packs = loadWithPacks();
    const health = loadCoreModule('extension/core/feature-health.js', packs);

    const report = health.buildFeatureHealthReport({
        features: [{ id: 'playerDock', name: 'Player Dock' }],
        registryHealth: [{ id: 'playerDock', status: 'initialized', initialized: true }],
        attribution: [{
            featureId: 'playerDock',
            surfaces: [
                { surface: 'playerChrome', lastOutcome: 'hit', lastSelector: '.ytp-delhi-modern' },
                { surface: 'somethingElse', lastOutcome: 'hit', lastSelector: '.ytp-unknown-thing' }
            ]
        }]
    });

    assert.equal(report.playerVariant, 'delhi', 'the bundle says which player the reporter is looking at');
    assert.deepEqual(
        report.surfacesOnNonPrimaryVariant.map((row) => row.surface),
        ['playerChrome'],
        'only surfaces resolved off their pack primary are listed'
    );
    assert.equal(report.surfacesOnNonPrimaryVariant[0].primary, 'classic');
    assert.equal(report.surfacesOnNonPrimaryVariant[0].selector, '.ytp-delhi-modern');
});

test('a page on the primary rollout reports it with nothing flagged', () => {
    const packs = loadWithPacks();
    const health = loadCoreModule('extension/core/feature-health.js', packs);

    const report = health.buildFeatureHealthReport({
        features: [{ id: 'playerDock', name: 'Player Dock' }],
        registryHealth: [{ id: 'playerDock', status: 'initialized', initialized: true }],
        attribution: [{
            featureId: 'playerDock',
            surfaces: [{ surface: 'playerChrome', lastOutcome: 'hit', lastSelector: '.ytp-chrome-bottom' }]
        }]
    });

    assert.equal(report.playerVariant, 'classic');
    assert.deepEqual(report.surfacesOnNonPrimaryVariant, []);
});

test('a surface that missed contributes no rollout claim', () => {
    const packs = loadWithPacks();
    const health = loadCoreModule('extension/core/feature-health.js', packs);

    const report = health.buildFeatureHealthReport({
        features: [{ id: 'playerDock', name: 'Player Dock' }],
        registryHealth: [{ id: 'playerDock', status: 'initialized', initialized: true }],
        attribution: [{
            featureId: 'playerDock',
            surfaces: [{ surface: 'playerChrome', lastOutcome: 'miss', lastSelector: '.ytp-delhi-modern' }]
        }]
    });

    assert.equal(report.playerVariant, 'unknown',
        'a miss says the surface was not found, not that the page is on a rollout');
    assert.deepEqual(report.surfacesOnNonPrimaryVariant, []);
});

test('the reported player variant does not depend on which feature resolved first', () => {
    const packs = loadWithPacks();
    const health = loadCoreModule('extension/core/feature-health.js', packs);

    // A delhi page still matches the classic chain, so both rows are real
    // evidence from one page. Whichever order attribution recorded them in, the
    // answer has to be the same, and it has to be the one that is actually
    // distinguishing: only delhi pages carry .ytp-overflow-panel.
    const classicRow = { surface: 'playerChrome.bottom', lastOutcome: 'hit', lastSelector: '.ytp-chrome-bottom' };
    const delhiRow = { surface: 'playerChrome.overflow', lastOutcome: 'hit', lastSelector: '.ytp-overflow-panel' };
    const build = (surfaces) => health.buildFeatureHealthReport({
        features: [{ id: 'playerDock', name: 'Player Dock' }],
        registryHealth: [{ id: 'playerDock', status: 'initialized', initialized: true }],
        attribution: [{ featureId: 'playerDock', surfaces }]
    });

    assert.equal(build([classicRow, delhiRow]).playerVariant, 'delhi');
    assert.equal(build([delhiRow, classicRow]).playerVariant, 'delhi',
        'the headline variant must not flip with attribution order');

    // Split across two features, which is how it actually arrives.
    const split = health.buildFeatureHealthReport({
        features: [{ id: 'playerDock', name: 'Player Dock' }],
        registryHealth: [{ id: 'playerDock', status: 'initialized', initialized: true }],
        attribution: [
            { featureId: 'b', surfaces: [classicRow] },
            { featureId: 'a', surfaces: [delhiRow] }
        ]
    });
    assert.equal(split.playerVariant, 'delhi');
});

test('a report built with no attribution at all still has the fields', () => {
    const packs = loadWithPacks();
    const health = loadCoreModule('extension/core/feature-health.js', packs);

    const report = health.buildFeatureHealthReport({
        features: [{ id: 'playerDock', name: 'Player Dock' }],
        registryHealth: [{ id: 'playerDock', status: 'initialized', initialized: true }]
    });

    assert.equal(report.playerVariant, 'unknown');
    assert.deepEqual(report.surfacesOnNonPrimaryVariant, []);
});

test('every selector a pack declares as a variant is one it actually resolves', () => {
    const core = loadWithPacks();
    // A variant list that names a selector missing from the stable/fallback
    // chains could never be reported, because attribution only ever records a
    // selector the resolver matched. That would be a decorative declaration.
    for (const [surface, pack] of core.SurfacePackRegistry.entries()) {
        if (!pack?.variants) continue;
        const chain = new Set([...(pack.stable || []), ...(pack.fallback || [])]);
        for (const [variant, selectors] of Object.entries(pack.variants)) {
            for (const selector of selectors) {
                assert.ok(chain.has(selector),
                    `${surface} variant "${variant}" names ${selector}, which is in neither its stable nor fallback chain`);
            }
        }
        assert.ok(pack.primaryVariant && pack.variants[pack.primaryVariant],
            `${surface} declares variants but no primaryVariant among them`);
    }
});
