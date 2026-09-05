'use strict';

// Canary rules in the remote selector asset.
//
// The hot-update path could repair a broken surface but could not add detection
// for one that had newly broken: applySelectorAsset replaced SurfaceSelectorMap
// and never touched SurfacePackRegistry, and getCriticalSelectorCanaryRules
// reads the registry. Only 9 of 33 packs declare a canary, so the surfaces most
// likely to break silently were the ones a hotfix could not start watching.
//
// The properties under test are the dangerous ones. This is a remote document:
// a malformed canary must be rejected without disturbing the shipped packs, an
// asset must not be able to leave a stale canary behind, and rejection must
// happen before anything is mutated.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.join(__dirname, '..');

function loadCore() {
    globalThis.YTKitCore = {};
    const packsDir = path.join(repoRoot, 'extension', 'core', 'selector-packs');
    const files = ['extension/core/registry.js']
        .concat(fs.readdirSync(packsDir).filter((f) => f.endsWith('.js')).sort()
            .map((f) => `extension/core/selector-packs/${f}`))
        .concat(['extension/core/selectors.js', 'extension/core/selector-health.js']);
    for (const rel of files) {
        (0, eval)(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    }
    return globalThis.YTKitCore;
}

function sortJsonValue(value) {
    if (Array.isArray(value)) return value.map(sortJsonValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJsonValue(value[key])]));
}

/** Build a valid asset from the shipped map, with `mutate` applied to its packs. */
function assetFrom(core, mutate = () => {}) {
    const packs = JSON.parse(JSON.stringify(core.SurfaceSelectorMap));
    mutate(packs);
    const payload = { schemaVersion: 1, assetVersion: '9.9.9.selector.1', packs };
    const canonical = JSON.stringify(sortJsonValue({
        schemaVersion: payload.schemaVersion,
        assetVersion: payload.assetVersion,
        packs: payload.packs
    }));
    const digest = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
    return { ...payload, digest: `sha256:${digest}` };
}

const canaryOf = (core, surface) => core.SurfacePackRegistry.get(surface)?.canary || null;

test('the shipped asset carries every canary the packs declare', () => {
    const core = loadCore();
    const asset = JSON.parse(fs.readFileSync(path.join(repoRoot, 'selector-packs.json'), 'utf8'));

    const shipped = [...core.SurfacePackRegistry.entries()].filter(([, pack]) => pack?.canary).map(([s]) => s).sort();
    const inAsset = Object.entries(asset.packs).filter(([, pack]) => pack?.canary).map(([s]) => s).sort();

    assert.ok(shipped.length > 0, 'some packs declare a canary');
    assert.deepEqual(inAsset, shipped,
        'an asset that omitted a shipped canary would delete it on apply');
});

test('applying an asset installs a canary onto a surface that had none', async () => {
    const core = loadCore();
    const target = [...core.SurfacePackRegistry.entries()].find(([, pack]) => !pack?.canary)[0];
    assert.equal(canaryOf(core, target), null, 'the chosen surface starts without a canary');

    const asset = assetFrom(core, (packs) => {
        packs[target].canary = { routes: ['watch'], featureIds: ['someFeature'] };
    });
    const result = await core.applySelectorAsset(asset, { source: 'remote' });

    assert.equal(result.ok, true, result.error);
    assert.deepEqual(canaryOf(core, target), { routes: ['watch'], featureIds: ['someFeature'] });

    // And the rules the health lane actually reads must now include it.
    const rules = core.getCriticalSelectorCanaryRules('watch');
    assert.ok(rules.some((rule) => rule.surface === target),
        'a hotfix must be able to start watching a surface that newly broke');
});

test('an asset cannot leave a stale canary behind', async () => {
    const core = loadCore();
    const target = [...core.SurfacePackRegistry.entries()].find(([, pack]) => !pack?.canary)[0];

    await core.applySelectorAsset(assetFrom(core, (packs) => {
        packs[target].canary = { routes: ['watch'], featureIds: ['someFeature'] };
    }), { source: 'remote' });
    assert.ok(canaryOf(core, target), 'installed');

    // A later asset that declares no canary for this surface must put it back
    // to what the build shipped, not keep the previous asset's rule forever.
    // `null` rather than a deleted key, because the digest is taken over the
    // NORMALIZED asset and that is the shape the real generator emits.
    await core.applySelectorAsset(assetFrom(core, (packs) => { packs[target].canary = null; }), { source: 'remote' });
    assert.equal(canaryOf(core, target), null, 'the surface returns to its shipped state');
});

test('resetting the asset restores the canaries the build shipped', async () => {
    const core = loadCore();
    const withCanary = [...core.SurfacePackRegistry.entries()].find(([, pack]) => pack?.canary)[0];
    const original = canaryOf(core, withCanary);

    await core.applySelectorAsset(assetFrom(core, (packs) => {
        packs[withCanary].canary = { routes: ['home'], featureIds: ['replaced'] };
    }), { source: 'remote' });
    assert.deepEqual(canaryOf(core, withCanary), { routes: ['home'], featureIds: ['replaced'] });

    core.resetSelectorAsset();
    assert.deepEqual(canaryOf(core, withCanary), original, 'reset returns the shipped canary');
});

test('a malformed canary is rejected and the shipped packs are untouched', async () => {
    const malformed = [
        ['not an object', 'watch'],
        ['routes missing', { featureIds: ['x'] }],
        ['routes empty', { routes: [], featureIds: ['x'] }],
        ['routes not an array', { routes: 'watch', featureIds: [] }],
        ['route not a string', { routes: [42], featureIds: [] }],
        ['route with a selector in it', { routes: ['div > .thing'], featureIds: [] }],
        ['route too long', { routes: ['x'.repeat(65)], featureIds: [] }],
        ['too many routes', { routes: Array.from({ length: 25 }, (_, i) => `r${i}`), featureIds: [] }],
        ['too many featureIds', { routes: ['watch'], featureIds: Array.from({ length: 25 }, (_, i) => `f${i}`) }],
        ['featureId with markup', { routes: ['watch'], featureIds: ['<script>'] }]
    ];

    for (const [label, canary] of malformed) {
        const core = loadCore();
        const target = [...core.SurfacePackRegistry.entries()].find(([, pack]) => !pack?.canary)[0];
        const before = [...core.SurfacePackRegistry.entries()].map(([s, p]) => [s, p?.canary || null]);

        const result = await core.applySelectorAsset(
            assetFrom(core, (packs) => { packs[target].canary = canary; }),
            { source: 'remote' }
        );

        assert.equal(result.ok, false, `${label} must be rejected`);
        assert.equal(result.state.status, 'rollback', `${label} must roll back`);
        const after = [...core.SurfacePackRegistry.entries()].map(([s, p]) => [s, p?.canary || null]);
        assert.deepEqual(after, before, `${label} must not disturb the shipped packs`);
    }
});

test('a canary in an asset whose digest does not verify never reaches the registry', async () => {
    const core = loadCore();
    const target = [...core.SurfacePackRegistry.entries()].find(([, pack]) => !pack?.canary)[0];

    const asset = assetFrom(core, (packs) => {
        packs[target].canary = { routes: ['watch'], featureIds: ['someFeature'] };
    });
    // Tamper AFTER the digest was computed, which is exactly what substitution
    // looks like.
    asset.packs[target].canary.featureIds = ['injected'];

    const result = await core.applySelectorAsset(asset, { source: 'remote' });

    assert.equal(result.ok, false);
    assert.match(result.error, /digest/i);
    assert.equal(canaryOf(core, target), null, 'an unverified asset installs nothing');
});
