'use strict';

// Stable-chain erosion.
//
// The resolver walks `[...stable, ...fallback]` and returns the first match.
// Until v4.88.3 it recorded only that *something* matched, so a surface whose
// stable selectors had all broken reported a clean hit and stayed invisible
// until the fallback broke as well. 29 of the 35 shipped surfaces are flagged
// high-churn, which is exactly the population that erodes one selector at a
// time.
//
// These drive the real resolver against a real DOM-ish fixture rather than
// asserting on the recorder's shape.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');

// A DOM stub small enough to reason about: `querySelector` matches an element
// whose recorded selector strings include the query.
function makeDocument(presentSelectors) {
    const present = new Set(presentSelectors);
    const node = (selector) => ({ nodeName: 'DIV', __selector: selector, isConnected: true });
    const root = {
        querySelector(selector) {
            return present.has(selector) ? node(selector) : null;
        },
        querySelectorAll(selector) {
            return present.has(selector) ? [node(selector)] : [];
        }
    };
    return { root, node };
}

function loadSelectors(presentSelectors) {
    const { root } = makeDocument(presentSelectors);
    const context = {
        console,
        Date,
        Math,
        Object,
        Set,
        Map,
        Array,
        JSON,
        String,
        Number,
        Boolean,
        Error,
        globalThis: null,
        document: {
            ...root,
            documentElement: root,
            body: root,
            createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
        },
        dispatchEvent() {},
        CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
        setTimeout,
        clearTimeout
    };
    context.globalThis = context;
    vm.createContext(context);

    for (const rel of [
        'extension/core/registry.js',
        'extension/core/selector-packs/player.js',
        'extension/core/selectors.js'
    ]) {
        vm.runInContext(fs.readFileSync(path.join(repoRoot, rel), 'utf8'), context, { filename: rel });
    }
    return context.globalThis.YTKitCore;
}

test('the player pack still has distinct stable and fallback chains', () => {
    const core = loadSelectors([]);
    const entry = core.SurfaceSelectorMap.player;
    assert.ok(entry.stable.length > 0, 'the fixture surface needs a stable chain');
    assert.ok(entry.fallback.length > 0, 'and a fallback chain to erode onto');
    assert.equal(core.selectorTier('player', entry.stable[0]), 'stable');
    assert.equal(core.selectorTier('player', entry.fallback[0]), 'fallback');
    assert.equal(core.selectorTier('player', '#not-in-either-chain'), 'unknown');
});

test('a hit on the stable chain records the stable tier', () => {
    const core = loadSelectors(['#movie_player']);
    core.resetSelectorAttribution();
    core.withSelectorAttribution('stickyVideo', () => {
        assert.ok(core.findSurfaceElement('player'), 'the stable selector must resolve');
    });

    const row = core.getSelectorAttributionSnapshot()
        .find((entry) => entry.featureId === 'stickyVideo')
        .surfaces.find((surface) => surface.surface === 'player');

    assert.equal(row.lastOutcome, 'hit');
    assert.equal(row.lastTier, 'stable');
    assert.equal(row.stableHits, 1);
    assert.equal(row.fallbackHits, 0);
});

test('with the stable chain removed the surface resolves on fallback and says so', () => {
    const core = loadSelectors(['ytd-player #movie_player']);
    core.resetSelectorAttribution();
    core.withSelectorAttribution('stickyVideo', () => {
        assert.ok(core.findSurfaceElement('player'), 'the fallback selector must still resolve');
    });

    const row = core.getSelectorAttributionSnapshot()
        .find((entry) => entry.featureId === 'stickyVideo')
        .surfaces.find((surface) => surface.surface === 'player');

    assert.equal(row.lastOutcome, 'hit', 'the feature still works — that is the point');
    assert.equal(row.lastTier, 'fallback');
    assert.equal(row.fallbackHits, 1);
    assert.equal(row.stableHits, 0);
});

test('a fallback-only surface reports degraded and names the surface', () => {
    const { buildFeatureHealthReport } = require('../extension/core/feature-health.js');
    const core = loadSelectors(['ytd-player #movie_player']);
    core.resetSelectorAttribution();
    core.withSelectorAttribution('stickyVideo', () => core.findSurfaceElement('player'));

    const report = buildFeatureHealthReport({
        features: [{ id: 'stickyVideo', name: 'Sticky Video', enabled: true }],
        registryHealth: [{ id: 'stickyVideo', lifecycleStatus: 'active' }],
        attribution: core.getSelectorAttributionSnapshot()
    });

    const entry = report.features.find((feature) => feature.id === 'stickyVideo');
    assert.equal(entry.status, 'degraded',
        'a surface living on its fallback is one change away from broken');

    const reason = entry.reasons.find((candidate) => candidate.kind === 'selector-fallback');
    assert.ok(reason, 'the report must carry a fallback reason');
    assert.equal(reason.surface, 'player', 'the degraded surface must be named');
    assert.equal(reason.tier, 'fallback');
});

test('a surface resolving on its stable chain stays healthy', () => {
    const { buildFeatureHealthReport } = require('../extension/core/feature-health.js');
    const core = loadSelectors(['#movie_player']);
    core.resetSelectorAttribution();
    core.withSelectorAttribution('stickyVideo', () => core.findSurfaceElement('player'));

    const report = buildFeatureHealthReport({
        features: [{ id: 'stickyVideo', name: 'Sticky Video', enabled: true }],
        registryHealth: [{ id: 'stickyVideo', lifecycleStatus: 'active' }],
        attribution: core.getSelectorAttributionSnapshot()
    });

    const entry = report.features.find((feature) => feature.id === 'stickyVideo');
    assert.notEqual(entry.status, 'degraded', 'a clean stable hit must not raise a warning');
    assert.equal(entry.reasons.some((candidate) => candidate.kind === 'selector-fallback'), false);
});
