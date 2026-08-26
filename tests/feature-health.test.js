'use strict';

// Feature health — the per-feature answer to "which of my features are
// working right now?".
//
// Two things are under test and they are different:
//
//   1. core/feature-health.js — the pure join. Fed synthetic snapshots,
//      it must pick the worst status, name the cause, and never invent a
//      problem out of stale evidence.
//   2. The ATTRIBUTION that makes the join possible. Nothing in the
//      codebase maps a feature to the page elements it needs; that link
//      is observed at runtime by selectors.js while feature code runs.
//      The end-to-end test at the bottom is the one that matters: break
//      a selector pack entry, run the feature's mutation rule, and the
//      report must say that feature is degraded and name the surface.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadCoreModule(relPath, primeCore) {
    if (primeCore) globalThis.YTKitCore = primeCore;
    const src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

function loadFeatureHealth() {
    return loadCoreModule('extension/core/feature-health.js', {});
}

// ── the pure join ──

test('an enabled, initialized feature with clean telemetry is reported healthy', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        now: 1000,
        features: [{ id: 'videoHider', name: 'Video Hider', category: 'Feed' }],
        registryHealth: [{ id: 'videoHider', status: 'initialized', initialized: true }]
    });
    assert.equal(report.total, 1);
    assert.equal(report.features[0].status, 'healthy');
    assert.equal(report.features[0].reasons.length, 0);
    assert.equal(report.counts.healthy, 1);
    assert.equal(report.worstStatus, 'healthy');
});

test('a feature whose init threw is reported failed and carries the thrown message', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [{ id: 'sponsorBlock', name: 'SponsorBlock' }],
        registryHealth: [{
            id: 'sponsorBlock',
            status: 'init-error',
            initialized: false,
            lastError: 'Cannot read properties of null',
            updatedAt: 500
        }]
    });
    const row = report.features[0];
    assert.equal(row.status, 'failed');
    assert.equal(row.reasons[0].kind, 'runtime');
    assert.match(row.reasons[0].detail, /Cannot read properties of null/);
    assert.equal(report.counts.failed, 1);
});

test('an open mutation-rule circuit fails the feature and names the budget it blew', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [{ id: 'stickyVideo', name: 'Sticky Video' }],
        registryHealth: [{ id: 'stickyVideo', status: 'initialized', initialized: true }],
        // navigation.js stamps openedAt as an ISO string, not epoch ms.
        mutationRules: [{
            featureId: 'stickyVideo',
            circuitOpen: true,
            reason: 'window-duration',
            openedAt: new Date(1200).toISOString()
        }]
    });
    const row = report.features[0];
    assert.equal(row.status, 'failed');
    const budget = row.reasons.find((r) => r.kind === 'budget');
    assert.equal(budget.detail, 'window-duration');
    assert.equal(budget.at, 1200, 'the ISO openedAt must be normalised to epoch ms');
});

test('a surface whose whole selector chain now misses degrades its feature and names the surface', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [{ id: 'videoHider', name: 'Video Hider' }],
        registryHealth: [{ id: 'videoHider', status: 'initialized', initialized: true }],
        attribution: [{
            featureId: 'videoHider',
            surfaces: [{
                surface: 'feedCard',
                lastOutcome: 'miss',
                lastSelector: 'ytd-rich-item-renderer',
                lastMissAt: 900
            }]
        }]
    });
    const row = report.features[0];
    assert.equal(row.status, 'degraded');
    const selector = row.reasons.find((r) => r.kind === 'selector');
    assert.equal(selector.surface, 'feedCard');
    assert.equal(selector.at, 900);
});

test('critical selector canary degrades each affected feature once across several failed surfaces', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [
            { id: 'stickyVideo', name: 'Theater Split' },
            { id: 'sponsorBlock', name: 'SponsorBlock' }
        ],
        registryHealth: [
            { id: 'stickyVideo', status: 'initialized', initialized: true },
            { id: 'sponsorBlock', status: 'initialized', initialized: true }
        ],
        criticalCanary: {
            status: 'degraded',
            checkedAt: 1200,
            youtubeClientVersion: '2.20260820.01.00',
            failedSurfaces: [
                { surface: 'player', featureIds: ['stickyVideo', 'sponsorBlock'] },
                { surface: 'mainVideo', featureIds: ['stickyVideo', 'sponsorBlock'] }
            ]
        }
    });
    const byId = new Map(report.features.map((row) => [row.id, row]));
    for (const id of ['stickyVideo', 'sponsorBlock']) {
        const row = byId.get(id);
        assert.equal(row.status, 'degraded');
        const canaryReasons = row.reasons.filter((reason) => reason.kind === 'selector-canary');
        assert.equal(canaryReasons.length, 1, `${id} must receive one aggregate canary reason`);
        assert.deepEqual(canaryReasons[0].surfaces, ['player', 'mainVideo']);
        assert.equal(canaryReasons[0].youtubeClientVersion, '2.20260820.01.00');
    }
    assert.equal(report.criticalCanary.youtubeClientVersion, '2.20260820.01.00');
});

test('a visible anti-adblock warning carries its selector and measured playback state into health', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [{ id: 'sponsorBlock', name: 'SponsorBlock' }],
        registryHealth: [{ id: 'sponsorBlock', status: 'initialized', initialized: true }],
        antiAdblock: {
            selector: 'ytd-enforcement-message-view-model',
            playbackState: 'unknown',
            observedAt: 1400,
            signalStrength: 'strong'
        }
    });

    const row = report.features[0];
    assert.equal(row.status, 'degraded');
    const reason = row.reasons.find((entry) => entry.kind === 'anti-adblock');
    assert.equal(reason.selector, 'ytd-enforcement-message-view-model');
    assert.equal(reason.playbackState, 'unknown');
    assert.equal(reason.at, 1400);
    assert.equal(report.antiAdblock.playbackState, 'unknown');
});

test('a surface that missed once but is hitting again is not reported as a problem', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [{ id: 'videoHider', name: 'Video Hider' }],
        registryHealth: [{ id: 'videoHider', status: 'initialized', initialized: true }],
        attribution: [{
            featureId: 'videoHider',
            surfaces: [{
                surface: 'feedCard',
                // 40 historic misses, but the most recent resolution hit.
                misses: 40,
                hits: 1,
                lastOutcome: 'hit',
                lastMissAt: 100,
                lastHitAt: 900
            }]
        }]
    });
    assert.equal(report.features[0].status, 'healthy');
    assert.equal(report.features[0].reasons.length, 0);
});

test('an unavailable external API degrades only the feature that drives it', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [
            { id: 'returnDislike', name: 'Return YouTube Dislike' },
            { id: 'deArrow', name: 'DeArrow' }
        ],
        registryHealth: [
            { id: 'returnDislike', status: 'initialized', initialized: true },
            { id: 'deArrow', status: 'initialized', initialized: true }
        ],
        externalApis: [
            {
                id: 'returnDislike',
                label: 'Return YouTube Dislike',
                feature: 'returnDislike',
                availability: 'unavailable',
                lastErrorMessage: 'network error',
                lastErrorTs: 700
            },
            // Serving from cache is the fallback working, not a degradation.
            { id: 'deArrow', label: 'DeArrow', feature: 'deArrow', availability: 'stale' }
        ]
    });
    const byId = new Map(report.features.map((row) => [row.id, row]));
    assert.equal(byId.get('returnDislike').status, 'degraded');
    assert.equal(byId.get('returnDislike').reasons[0].kind, 'api');
    assert.equal(byId.get('deArrow').status, 'healthy');
});

test('disabled features are omitted entirely rather than reported as a state', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [
            { id: 'on', name: 'On' },
            { id: 'off', name: 'Off', enabled: false }
        ],
        registryHealth: [{ id: 'on', status: 'initialized', initialized: true }]
    });
    assert.equal(report.total, 1);
    assert.equal(report.features[0].id, 'on');
});

test('an enabled feature that never initialized here is idle, not broken', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [{ id: 'liveChatTweak', name: 'Live Chat Tweak' }],
        registryHealth: [{ id: 'liveChatTweak', status: 'registered', initialized: false }]
    });
    assert.equal(report.features[0].status, 'idle');
    assert.equal(report.counts.idle, 1);
});

test('rows sort worst-first so a breakage never hides below the healthy list', () => {
    const core = loadFeatureHealth();
    const report = core.buildFeatureHealthReport({
        features: [
            { id: 'aHealthy', name: 'A Healthy' },
            { id: 'zFailed', name: 'Z Failed' },
            { id: 'mDegraded', name: 'M Degraded' }
        ],
        registryHealth: [
            { id: 'aHealthy', status: 'initialized', initialized: true },
            { id: 'zFailed', status: 'init-error', initialized: false, lastError: 'boom' },
            { id: 'mDegraded', status: 'initialized', initialized: true }
        ],
        attribution: [{
            featureId: 'mDegraded',
            surfaces: [{ surface: 'watch', lastOutcome: 'miss', lastMissAt: 5 }]
        }]
    });
    assert.deepEqual(report.features.map((r) => r.id), ['zFailed', 'mDegraded', 'aHealthy']);
    assert.equal(report.worstStatus, 'failed');
});

test('the reason list is capped but the true count survives for the bundle', () => {
    const core = loadFeatureHealth();
    const surfaces = [];
    for (let i = 0; i < 12; i += 1) {
        surfaces.push({ surface: `surface${i}`, lastOutcome: 'miss', lastMissAt: 100 + i });
    }
    const report = core.buildFeatureHealthReport({
        features: [{ id: 'wide', name: 'Wide' }],
        registryHealth: [{ id: 'wide', status: 'initialized', initialized: true }],
        attribution: [{ featureId: 'wide', surfaces }]
    });
    const row = report.features[0];
    assert.equal(row.reasonCount, 12);
    assert.ok(row.reasons.length <= 5, `expected the reason list capped, got ${row.reasons.length}`);
    // Newest first — the most recent miss must survive the cap.
    assert.equal(row.reasons[0].at, 111);
});

test('the summary line leads with what is broken, and says so only when something is', () => {
    const core = loadFeatureHealth();
    const allWell = core.buildFeatureHealthReport({
        features: [{ id: 'a', name: 'A' }],
        registryHealth: [{ id: 'a', status: 'initialized', initialized: true }]
    });
    assert.equal(core.formatFeatureHealthLine(allWell), '1 features working');

    const broken = core.buildFeatureHealthReport({
        features: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        registryHealth: [
            { id: 'a', status: 'initialized', initialized: true },
            { id: 'b', status: 'init-error', initialized: false, lastError: 'boom' }
        ]
    });
    const line = core.formatFeatureHealthLine(broken);
    assert.match(line, /^1 failed/, `summary must lead with the failure, got "${line}"`);
});

// ── attribution: the link that makes the join possible ──

test('selector attribution credits a surface resolution to the feature that ran it', () => {
    const core = loadCoreModule('extension/core/selectors.js', {});
    core.resetSelectorAttribution();

    const root = {
        querySelector: (sel) => (sel === '#present' ? { tagName: 'DIV' } : null)
    };

    core.withSelectorAttribution('featureA', () => {
        core.findSurfaceElement(['#present'], { root });
        core.findSurfaceElement(['#absent'], { root, surface: 'brokenSurface' });
    });
    // Outside any attribution window nothing may be credited.
    core.findSurfaceElement(['#absent'], { root, surface: 'unattributed' });

    const snapshot = core.getSelectorAttributionSnapshot();
    assert.equal(snapshot.length, 1, 'only the attributed window may produce a row');
    assert.equal(snapshot[0].featureId, 'featureA');
    const surfaces = new Map(snapshot[0].surfaces.map((s) => [s.surface, s]));
    assert.equal(surfaces.get('brokenSurface').lastOutcome, 'miss');
    assert.ok(!surfaces.has('unattributed'), 'an unattributed query must not invent a feature');
});

test('a surface that falls back to a later selector counts as working, not broken', () => {
    const core = loadCoreModule('extension/core/selectors.js', {});
    core.resetSelectorAttribution();
    const root = {
        querySelector: (sel) => (sel === '.fallback' ? { tagName: 'DIV' } : null)
    };
    core.withSelectorAttribution('featureB', () => {
        // The stable selector misses; the fallback hits. Recording per
        // selector would call this broken — it is not.
        core.findSurfaceElement(['.stable', '.fallback'], { root, surface: 'twoStep' });
    });
    const row = core.getSelectorAttributionSnapshot()[0].surfaces[0];
    assert.equal(row.lastOutcome, 'hit');
    assert.equal(row.misses, 0, 'the surface resolved; only the chain step missed');
});

test('nested attribution windows keep the outermost feature', () => {
    const core = loadCoreModule('extension/core/selectors.js', {});
    core.resetSelectorAttribution();
    const root = { querySelector: () => null };
    core.withSelectorAttribution('outer', () => {
        core.withSelectorAttribution('innerHelper', () => {
            core.findSurfaceElement(['#gone'], { root, surface: 'shared' });
        });
    });
    const snapshot = core.getSelectorAttributionSnapshot();
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].featureId, 'outer');
});

test('attribution is restored after a feature throws mid-window', () => {
    const core = loadCoreModule('extension/core/selectors.js', {});
    core.resetSelectorAttribution();
    assert.throws(() => core.withSelectorAttribution('thrower', () => {
        throw new Error('feature blew up');
    }), /feature blew up/);
    assert.equal(core.getAttributedFeatureId(), null,
        'a throwing feature must not leave its id ambient for every later query');
});

// ── end to end: break a selector, watch the feature go degraded ──
//
// This is the acceptance criterion. It drives the real selectors.js, the
// real navigation.js mutation-rule dispatcher, and the real join — no
// stubbed attribution anywhere.

test('breaking a selector pack entry flips the owning feature to degraded within one rule run', () => {
    const listeners = new Map();
    const documentStub = {
        body: { nodeType: 1 },
        documentElement: { nodeType: 1 },
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: (name) => listeners.delete(name),
        querySelector: () => null,
        querySelectorAll: () => []
    };

    const priorDocument = globalThis.document;
    const priorWindow = globalThis.window;
    const priorObserver = globalThis.MutationObserver;
    const priorRaf = globalThis.requestAnimationFrame;

    globalThis.document = documentStub;
    globalThis.window = {
        location: { pathname: '/feed/subscriptions', href: 'https://www.youtube.com/feed/subscriptions' },
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    globalThis.MutationObserver = class {
        observe() {}
        disconnect() {}
        takeRecords() { return []; }
    };
    globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

    try {
        globalThis.YTKitCore = {};
        loadCoreModule('extension/core/selectors.js');
        loadCoreModule('extension/core/navigation.js');
        const core = loadCoreModule('extension/core/feature-health.js');

        core.resetSelectorAttribution();

        // The feature does what a real feed feature does: resolve its
        // surface every mutation tick. The bait is that the surface's
        // selectors no longer match anything on the page.
        const BROKEN_SURFACE = 'feedCard';
        const SELECTORS = ['ytd-rich-item-renderer', '.ytd-rich-grid-renderer'];
        let ran = 0;
        const videoHiderRule = () => {
            ran += 1;
            core.findSurfaceElements(SELECTORS, {
                root: documentStub,
                surface: BROKEN_SURFACE
            });
        };
        // addMutationRule executes the rule once immediately, which is the
        // "within one navigation" the acceptance criterion asks for.
        core.addMutationRule('videoHider', videoHiderRule);
        assert.equal(ran, 1, 'addMutationRule must run the rule once immediately');

        const buildReport = () => core.buildFeatureHealthReport({
            features: [{ id: 'videoHider', name: 'Video Hider' }],
            registryHealth: [{ id: 'videoHider', status: 'initialized', initialized: true }],
            attribution: core.getSelectorAttributionSnapshot(),
            mutationRules: core.getMutationRuleHealthSnapshot()
        });

        const broken = buildReport();
        assert.equal(broken.features[0].status, 'degraded',
            'a feature whose surface stopped matching must not report as working');
        const reason = broken.features[0].reasons.find((r) => r.kind === 'selector');
        assert.equal(reason.surface, BROKEN_SURFACE,
            'the report must name the surface that failed, not just say "something broke"');
        assert.ok(Number.isFinite(reason.at), 'the report must say when it broke');

        // Bait check: repair the page so the surface resolves again, run the
        // rule once more, and the same feature must return to healthy. If
        // this half fails the "degraded" verdict above is just a constant.
        documentStub.querySelectorAll = (sel) => (sel === SELECTORS[0] ? [{ tagName: 'DIV' }] : []);
        core.addMutationRule('videoHider', videoHiderRule);
        assert.equal(ran, 2, 're-registering must re-run the rule against the repaired page');

        const repaired = buildReport();
        assert.equal(repaired.features[0].status, 'healthy',
            'once the surface resolves again the feature must stop being reported as degraded');

        core.removeMutationRule('videoHider');
    } finally {
        globalThis.document = priorDocument;
        globalThis.window = priorWindow;
        globalThis.MutationObserver = priorObserver;
        globalThis.requestAnimationFrame = priorRaf;
    }
});
