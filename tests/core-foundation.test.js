'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
// v4.31.0: selector-packs/*.js MUST load before selectors.js so the
// pack registry is populated when SurfaceSelectorMap is built. Mirrors
// the manifest content_scripts order.
const selectorPackFiles = [
    'selector-packs/appShell.js',
    'selector-packs/nav.js',
    'selector-packs/search.js',
    'selector-packs/leftNav.js',
    'selector-packs/feed.js',
    'selector-packs/feedCard.js',
    'selector-packs/thumbnail.js',
    'selector-packs/shortsShelf.js',
    'selector-packs/watch.js',
    'selector-packs/relatedSidebar.js',
    'selector-packs/player.js',
    'selector-packs/mainVideo.js'
];
const coreSources = [
    'registry.js',
    ...selectorPackFiles,
    'selectors.js',
    'trusted-html.js',
    'api-limiter.js',
    'diagnostic-log.js',
    'predicate-sandbox.js',
    'video-type.js'
].map((fileName) => ({
    fileName,
    source: fs.readFileSync(path.join(repoRoot, 'extension', 'core', fileName), 'utf8')
}));

class TestCustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
}

function loadFoundation(extra = {}) {
    const context = {
        console,
        Date,
        Math,
        Promise,
        setTimeout,
        clearTimeout,
        CustomEvent: TestCustomEvent,
        globalThis: null,
        ...extra
    };
    context.globalThis = context;
    vm.createContext(context);
    for (const { fileName, source } of coreSources) {
        vm.runInContext(source, context, { filename: `extension/core/${fileName}` });
    }
    return context.globalThis.YTKitCore;
}

test('feature registry registers, tracks health, and runs cleanup in reverse order', () => {
    const core = loadFoundation();
    const calls = [];
    const registry = core.createFeatureRegistry({
        now: () => 1234,
        logger: { error() {} }
    });
    const feature = {
        id: 'demo-feature',
        category: 'tests',
        destroy() {
            calls.push('destroy');
        }
    };

    registry.register(feature);
    registry.addCleanup('demo-feature', () => calls.push('cleanup-a'));
    registry.addCleanup('demo-feature', () => calls.push('cleanup-b'));
    registry.setHealth('demo-feature', { status: 'ready' });

    assert.equal(registry.get('demo-feature'), feature);
    assert.equal(registry.getHealth('demo-feature').status, 'ready');
    assert.equal(registry.destroy('demo-feature'), true);
    assert.deepEqual(calls, ['destroy', 'cleanup-b', 'cleanup-a']);
    assert.equal(registry.getHealth('demo-feature').status, 'destroyed');
});

test('feature registry generates a settings schema from registered metadata and defaults', () => {
    const core = loadFoundation();
    const registry = core.createFeatureRegistry();
    registry.register({
        id: 'qualityMode',
        name: 'Quality Mode',
        category: 'Player',
        type: 'select',
        settingKey: 'qualityMode',
        pages: ['watch'],
        dependsOn: 'playerTools',
        source: 'ytkit'
    });

    const schema = registry.createSettingsSchema({
        qualityMode: 'best',
        diagnosticLog: false,
        _errors: []
    }, { settingsVersion: 7 });

    assert.equal(schema.settingsVersion, 7);
    assert.equal(schema.featureCount, 1);
    assert.equal(schema.entryCount, 3);
    const qualityEntry = JSON.parse(JSON.stringify(schema.entries.find((entry) => entry.key === 'qualityMode')));
    assert.deepEqual(qualityEntry, {
        key: 'qualityMode',
        featureId: 'qualityMode',
        name: 'Quality Mode',
        category: 'Player',
        control: 'select',
        valueType: 'string',
        defaultValue: 'best',
        hasDefault: true,
        pages: ['watch'],
        dependsOn: 'playerTools',
        parentId: null,
        isSubFeature: false,
        source: 'ytkit'
    });
    assert.equal(schema.entries.find((entry) => entry.key === 'diagnosticLog').control, 'toggle');
    assert.equal(schema.entries.find((entry) => entry.key === '_errors').category, 'Internal');
});

test('feature registry supports category cleanup and category health snapshots', () => {
    const core = loadFoundation();
    const registry = core.createFeatureRegistry({ logger: { error() {} } });
    const calls = [];

    registry.register({
        id: 'watchOne',
        name: 'Watch One',
        category: 'Watch',
        destroy() {
            calls.push('feature');
        }
    });
    registry.setHealth('watchOne', { status: 'initialized', initialized: true });
    registry.addCategoryCleanup('Watch', () => calls.push('category-b'));
    registry.addCategoryCleanup('Watch', () => calls.push('category-a'));

    const before = registry.getCategoryHealthSnapshot().find((entry) => entry.category === 'Watch');
    assert.equal(before.featureCount, 1);
    assert.equal(before.initializedCount, 1);
    assert.equal(before.cleanupCount, 2);
    assert.equal(before.statuses.initialized, 1);

    assert.deepEqual(JSON.parse(JSON.stringify(registry.destroyCategory('Watch'))), { ok: true, errors: [] });
    assert.deepEqual(calls, ['feature', 'category-a', 'category-b']);
    assert.equal(registry.getHealth('watchOne').status, 'destroyed');
});

test('surface selectors prefer stable selectors and emit first-miss diagnostics', () => {
    const events = [];
    const core = loadFoundation({
        dispatchEvent(event) {
            events.push(event);
        }
    });
    const player = { id: 'movie_player' };
    const queried = [];
    const root = {
        querySelector(selector) {
            queried.push(selector);
            if (selector === '#movie_player') return player;
            if (selector === 'bad[') throw new Error('invalid selector');
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'bad[') throw new Error('invalid selector');
            return [];
        }
    };

    assert.equal(core.findSurfaceElement('player', { root }), player);
    assert.deepEqual(queried, ['#movie_player']);
    assert.equal(core.findSurfaceElement(['bad[', '.missing'], { root }), null);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.detail.selector), ['bad[', '.missing']);
});

test('surface selector map promotes roadmap surfaces with stable-first fallback chains', () => {
    const core = loadFoundation();
    const requiredSurfaces = [
        'appShell',
        'nav',
        'search',
        'leftNav',
        'feed',
        'feedCard',
        'thumbnail',
        'shortsShelf',
        'watch',
        'relatedSidebar',
        'player',
        'mainVideo',
        'playerChrome',
        'playerSettings',
        'comments',
        'commentComposer',
        'engagementPanels',
        'profile',
        'notifications',
        'liveChatFrame',
        'liveChat',
        'liveChatPlaceholder'
    ];

    for (const surface of requiredSurfaces) {
        const entry = core.getSurfaceSelectorEntry(surface);
        assert.ok(entry, `${surface} should have a promoted selector-map entry`);
        assert.ok(entry.stable.length >= 1, `${surface} should define at least one stable selector`);
        assert.ok(entry.fallback.length >= 1, `${surface} should define at least one fallback selector`);
        assert.deepEqual(
            entry.selectors.slice(0, entry.stable.length),
            entry.stable,
            `${surface} should try stable selectors before fallbacks`
        );
    }

    assert.ok(core.SurfaceSelectorMap.feed.highChurn, 'feed should be marked high churn');
    assert.ok(core.SurfaceSelectorMap.liveChat.needsFreshCapture, 'live chat should require a fresh capture');
    assert.ok(core.getSurfaceSelectorChain('playerChrome').includes('.ytp-delhi-modern'),
        'player chrome chain should include new-player transition selectors');
});

test('selector health snapshot tracks hits, misses, errors, and exports JSON', () => {
    const events = [];
    const core = loadFoundation({
        dispatchEvent(event) {
            events.push(event);
        }
    });
    const feed = { id: 'feed' };
    const root = {
        querySelector(selector) {
            if (selector === 'bad[') throw new Error('invalid selector');
            if (selector === 'ytd-browse ytd-rich-grid-renderer') return feed;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'ytd-notification-topbar-button-renderer') return [{ id: 'bell' }];
            return [];
        }
    };

    assert.equal(core.findSurfaceElement('feed', { root }), feed);
    assert.equal(core.findSurfaceElement(['bad['], { root }), null);
    assert.equal(core.findSurfaceElements('notifications', { root }).length, 1);

    const snapshot = core.getSelectorHealthSnapshot();
    const feedHealth = snapshot.find((entry) => entry.surface === 'feed');
    const notificationHealth = snapshot.find((entry) => entry.surface === 'notifications');
    const customHealth = snapshot.find((entry) => entry.surface === 'custom');

    assert.equal(feedHealth.hitCount, 1);
    assert.equal(notificationHealth.hitCount, 1);
    assert.equal(customHealth, undefined, 'custom one-off selectors should not pollute surface-map reports');
    assert.equal(events.length, 1);
    assert.equal(events[0].detail.selector, 'bad[');
    // v4.5+ (iter-5 N5): schemaVersion bumped to 2 — snapshot rows now
    // carry shape-drift fields. Consumers parsing v1 must ignore the new
    // keys safely; v2 callers can read them.
    assert.equal(JSON.parse(core.exportSelectorHealth()).schemaVersion, 2);
});

test('recordSelectorShape silently captures the first shape, emits on drift, no-ops on repeats', () => {
    // v4.5+ (iter-5 N5): drift signal mirrors the iSponsorBlockTV story —
    // YouTube changed a paired-device screen-id from 26 chars to 64 hex
    // digits without changing the selector that targets it. The selector
    // keeps hitting but the matched node's identifier shape silently
    // changes; that is the failure mode this API surfaces.
    const events = [];
    const core = loadFoundation({
        dispatchEvent(event) { events.push(event); }
    });

    // First observation — captures, no event. Use a real selector from the
    // watch surface so the health snapshot row is reachable below.
    const SEL = 'ytd-watch-flexy[video-id]';
    const first = core.recordSelectorShape('watch', SEL, 'attr-len:11');
    assert.equal(first.drifted, false);
    assert.equal(events.length, 0);

    // Repeat observation — no event, no drift.
    const second = core.recordSelectorShape('watch', SEL, 'attr-len:11');
    assert.equal(second.drifted, false);
    assert.equal(events.length, 0);

    // Actual drift — captures, emits one event with previous + current.
    const drifted = core.recordSelectorShape('watch', SEL, 'attr-len:32');
    assert.equal(drifted.drifted, true);
    assert.equal(drifted.previousShape, 'attr-len:11');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'ytkit-selector-shape-drift');
    assert.equal(events[0].detail.surface, 'watch');
    assert.equal(events[0].detail.selector, SEL);
    assert.equal(events[0].detail.previousShape, 'attr-len:11');
    assert.equal(events[0].detail.currentShape, 'attr-len:32');
    assert.equal(events[0].detail.drifts, 1);
    assert.equal(events[0].detail.firstShape, 'attr-len:11');

    // Snapshot row now carries shape fields with v2 schema.
    const snap = JSON.parse(core.exportSelectorHealth());
    assert.equal(snap.schemaVersion, 2);
    const watchRow = snap.surfaces
        .find((s) => s.surface === 'watch')
        .selectors.find((r) => r.selector === SEL);
    assert.equal(watchRow.hasShapeSample, true);
    assert.equal(watchRow.firstShape, 'attr-len:11');
    assert.equal(watchRow.lastShape, 'attr-len:32');
    assert.equal(watchRow.shapeDrifts, 1);
    // Other watch selectors haven't been observed for shape — must report
    // hasShapeSample:false so pollers can distinguish "healthy" from
    // "never sampled" (the L3 audit's E-WARN about shapeDrifts:0 ambiguity).
    const otherRow = snap.surfaces
        .find((s) => s.surface === 'watch')
        .selectors.find((r) => r.selector === 'ytd-watch-flexy');
    assert.equal(otherRow.hasShapeSample, false);
    assert.equal(otherRow.firstShape, null);
    assert.equal(otherRow.shapeDrifts, 0);

    // Defensive: missing / non-string / huge shapes don't blow up the
    // selector pipeline. Empty + non-string returns null without
    // mutating the stat.
    assert.equal(core.recordSelectorShape('watch', SEL, null), null);
    assert.equal(core.recordSelectorShape('watch', SEL, ''), null);
    assert.equal(core.recordSelectorShape('watch', SEL, 12345), null);
    // Huge shape gets clamped to 120 chars — still records.
    const huge = 'x'.repeat(500);
    const clampResult = core.recordSelectorShape('watch', SEL, huge);
    assert.equal(clampResult.drifted, true);
    assert.equal(clampResult.previousShape, 'attr-len:32');
    // The recorded lastShape should be clamped to 120 chars.
    const snap2 = JSON.parse(core.exportSelectorHealth());
    const row2 = snap2.surfaces
        .find((s) => s.surface === 'watch')
        .selectors.find((r) => r.selector === SEL);
    assert.equal(row2.lastShape.length, 120);
});

test('recordSelectorShape suppresses event storms via per-(surface,selector) cooldown (iter-5 Q1 S3)', () => {
    const events = [];
    const core = loadFoundation({
        dispatchEvent(event) { events.push(event); }
    });
    const SEL = 'ytd-watch-flexy[video-id]';
    // First sample — silent.
    core.recordSelectorShape('watch', SEL, 'a');
    assert.equal(events.length, 0);
    // Real drift — emits.
    const r1 = core.recordSelectorShape('watch', SEL, 'b');
    assert.equal(r1.drifted, true);
    assert.equal(events.length, 1);
    // Immediate alternation within cooldown — drift count still increments
    // but event NOT emitted (suppression flagged in return).
    const r2 = core.recordSelectorShape('watch', SEL, 'c');
    assert.equal(r2.drifted, true);
    assert.equal(r2.suppressed, 'cooldown');
    assert.equal(events.length, 1, 'cooldown must suppress in-window events');
    // Snapshot still reflects the suppressed drift count.
    const snap = JSON.parse(core.exportSelectorHealth());
    const row = snap.surfaces
        .find((s) => s.surface === 'watch')
        .selectors.find((r) => r.selector === SEL);
    assert.equal(row.shapeDrifts, 2, 'cooldown does not hide saturation');
});

test('recordSelectorShape does not recurse when a listener calls back synchronously (iter-5 Q1 S5)', () => {
    // A listener for ytkit-selector-shape-drift that synchronously invokes
    // recordSelectorShape() must not cause stack-exhaustion recursion.
    let inListener = false;
    let maxDepth = 0;
    let depth = 0;
    const core = loadFoundation({
        dispatchEvent(event) {
            if (event.type !== 'ytkit-selector-shape-drift') return;
            // Simulate a listener that re-enters with an alternating shape.
            inListener = true;
            depth += 1;
            if (depth > maxDepth) maxDepth = depth;
            try {
                if (depth < 100) {
                    // Recursive call with a NEW shape would otherwise cause
                    // infinite recursion. The re-entry guard must catch it.
                    core.recordSelectorShape('watch', 'ytd-watch-flexy[video-id]', 'rec-' + depth);
                }
            } finally {
                depth -= 1;
                inListener = false;
            }
        }
    });

    core.recordSelectorShape('watch', 'ytd-watch-flexy[video-id]', 'a');
    core.recordSelectorShape('watch', 'ytd-watch-flexy[video-id]', 'b');
    // Without the guard, maxDepth would have spiked to ~100. With the
    // guard, the nested call returns early and never re-enters dispatch.
    assert.ok(maxDepth <= 1, `re-entry guard failed; depth went to ${maxDepth}`);
});

test('findSurfaceElement wires hits into recordSelectorShape with a default signature (iter-5 N5 L3 follow-up)', () => {
    // L3 audit's F-FAIL: the recordSelectorShape API existed but no live
    // resolver path invoked it. Verify the wiring is now real — a hit on
    // a real surface selector produces a shape sample without the caller
    // having to manually call recordSelectorShape.
    const events = [];
    const core = loadFoundation({
        dispatchEvent(event) { events.push(event); }
    });
    const fakeWatchFlexy = {
        nodeType: 1,
        tagName: 'YTD-WATCH-FLEXY',
        getAttribute(name) { return name === 'video-id' ? 'aaaaaaaaaaa' : null; },
        attributes: { length: 4 },
        childElementCount: 3
    };
    const root = {
        querySelector(sel) {
            if (sel === 'ytd-watch-flexy[video-id]') return fakeWatchFlexy;
            return null;
        }
    };

    // First hit captures the shape — no drift event yet.
    const hit1 = core.findSurfaceElement('watch', { root });
    assert.equal(hit1, fakeWatchFlexy);
    assert.equal(events.length, 0, 'first-shape observation is silent');
    let snap = JSON.parse(core.exportSelectorHealth());
    let row = snap.surfaces
        .find((s) => s.surface === 'watch')
        .selectors.find((r) => r.selector === 'ytd-watch-flexy[video-id]');
    assert.equal(row.hasShapeSample, true);
    assert.match(row.firstShape, /vid-len:11/);

    // Mutate the node so the next resolver hit derives a different signature
    // — this is the iSponsorBlockTV class of drift (id length changed).
    fakeWatchFlexy.getAttribute = (name) => (
        name === 'video-id' ? 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' : null
    );
    const hit2 = core.findSurfaceElement('watch', { root });
    assert.equal(hit2, fakeWatchFlexy);
    // Now we should have a drift event.
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'ytkit-selector-shape-drift');
    assert.match(events[0].detail.currentShape, /vid-len:64/);
    assert.match(events[0].detail.previousShape, /vid-len:11/);

    snap = JSON.parse(core.exportSelectorHealth());
    row = snap.surfaces
        .find((s) => s.surface === 'watch')
        .selectors.find((r) => r.selector === 'ytd-watch-flexy[video-id]');
    assert.equal(row.shapeDrifts, 1);
});

test('trusted html helper centralizes TrustedTypes policy creation', () => {
    const createdPolicies = [];
    const core = loadFoundation({
        trustedTypes: {
            createPolicy(name, rules) {
                createdPolicies.push(name);
                return {
                    createHTML(value) {
                        return {
                            policy: name,
                            value: rules.createHTML(value)
                        };
                    }
                };
            }
        }
    });

    assert.deepEqual(core.toTrustedHTML('<b>Astra</b>'), {
        policy: 'astraDeck',
        value: '<b>Astra</b>'
    });
    assert.deepEqual(createdPolicies, ['astraDeck']);
});

test('api limiter serializes same-bucket work and reports queue state', async () => {
    const core = loadFoundation();
    const order = [];
    const limiter = core.createApiLimiter({
        capacity: 1,
        refillMs: 0,
        jitterMs: 0,
        setTimeout(callback) {
            callback();
            return 0;
        },
        clearTimeout() {}
    });

    const first = limiter.run('youtube', async () => {
        order.push('first');
        return 1;
    });
    const second = limiter.run('youtube', async () => {
        order.push('second');
        return 2;
    });

    assert.deepEqual(await Promise.all([first, second]), [1, 2]);
    assert.deepEqual(order, ['first', 'second']);
    assert.equal(limiter.getState('youtube').queued, 0);
});

test('api limiter clear() rejects pending tasks instead of dropping them silently', async () => {
    // Regression: a previous clear() implementation simply forgot the bucket's
    // queue, leaving every awaited Promise unresolved forever. Awaiters now
    // get an explicit rejection so feature cleanup paths cannot leak.
    const core = loadFoundation();
    let blockResolve;
    const blockHead = new Promise((resolve) => { blockResolve = resolve; });
    const limiter = core.createApiLimiter({
        capacity: 1,
        refillMs: 0,
        jitterMs: 0,
        // Real-clock fake so the queued task only runs after we resolve manually.
        setTimeout(callback) { return setTimeout(callback, 0); },
        clearTimeout(id) { clearTimeout(id); }
    });

    // First task occupies the single token and blocks on `blockHead`.
    const headPromise = limiter.run('youtube', async () => {
        await blockHead;
        return 'head';
    });
    // Tail enqueues behind head — it must be rejected by clear().
    const tailPromise = limiter.run('youtube', async () => 'tail');

    // Yield so head leaves the queue, then clear before tail can run.
    await new Promise((r) => setTimeout(r, 0));
    limiter.clear('youtube');

    await assert.rejects(tailPromise, /API limiter cleared/);

    // Unblock the head; it still resolves normally since it had already left
    // the queue before clear() — clear only affects tasks still queued.
    blockResolve('head');
    assert.equal(await headPromise, 'head');
});

// ── iter-6 N11 (M-phase partial): DiagnosticLog factory ──

test('createDiagnosticLog records, counts per-ctx, and respects the diagnosticLog gate (iter-6 N11)', () => {
    const core = loadFoundation();
    const settings = { diagnosticLog: true, _errors: [] };
    const saved = [];
    const log = core.createDiagnosticLog({
        getSettings: () => settings,
        saveSettings: (s) => saved.push(s),
        getVersion: () => '4.4.0',
        cap: 4
    });

    // Disabled-by-default in-memory flag — relies on the
    // diagnosticLog settings gate.
    log.record('tt', 'first');
    log.record('selectors', 'second');
    log.record('tt', 'third');
    assert.equal(settings._errors.length, 3);
    // countsByCtx() returns a VM-context object; JSON-normalize so
    // deepStrictEqual's prototype check passes across realms.
    assert.deepEqual(
        JSON.parse(JSON.stringify(log.countsByCtx())),
        { tt: 2, selectors: 1 }
    );

    // Cap-bounded ring with counter decrement.
    log.record('storage-corruption', 'fourth');  // size = 4 (at cap)
    log.record('window', 'fifth');               // shifts out 'tt:first'
    assert.equal(settings._errors.length, 4);
    assert.deepEqual(
        JSON.parse(JSON.stringify(log.countsByCtx())),
        { tt: 1, selectors: 1, 'storage-corruption': 1, window: 1 }
    );

    // clear() resets both the ring AND the in-memory counter map.
    log.clear();
    assert.deepEqual(JSON.parse(JSON.stringify(log.countsByCtx())), {});
    // settings._errors was replaced inside the VM (clear() assigns []),
    // so normalize across realms before comparing.
    assert.deepEqual(JSON.parse(JSON.stringify(settings._errors)), []);
    assert.equal(saved.length, 1);  // clear triggered one save

    // Settings gate: diagnosticLog=false silences record() unless
    // enable() has been called.
    settings.diagnosticLog = false;
    log.record('tt', 'after-gate-off');
    assert.equal(settings._errors.length, 0);
    log.enable();
    log.record('tt', 'after-enable');
    assert.equal(settings._errors.length, 1);
});

test('createDiagnosticLog resyncs counters from a pre-populated ring (iter-6 N11)', () => {
    // Cross-session entries loaded from chrome.storage at startup must
    // be reflected in countsByCtx() without requiring a record() call.
    const core = loadFoundation();
    const settings = {
        diagnosticLog: true,
        _errors: [
            { ts: 1, ctx: 'tt', msg: 'prior session a' },
            { ts: 2, ctx: 'tt', msg: 'prior session b' },
            { ts: 3, ctx: 'selectors', msg: 'prior session c' }
        ]
    };
    const log = core.createDiagnosticLog({ getSettings: () => settings });
    assert.deepEqual(
        JSON.parse(JSON.stringify(log.countsByCtx())),
        { tt: 2, selectors: 1 }
    );
});

// ── iter-7 N11 (M-phase extraction #2): PredicateSandbox factory ──

test('createPredicateSandbox parses and evaluates ctx-bound expressions (iter-7 N11)', () => {
    const core = loadFoundation();
    const debugCalls = [];
    const sandbox = core.createPredicateSandbox({
        debugLog: (category, message) => debugCalls.push([category, message])
    });

    // Happy-path compile + evaluate. The evaluator must freeze the ctx
    // it's handed; the call site freezes upstream too as a belt-and-braces.
    const compiled = sandbox.compile('ctx.title.includes("review") && ctx.duration > 60');
    assert.equal(compiled.ok, true);
    assert.equal(typeof compiled.evaluator, 'function');
    assert.equal(compiled.evaluator({ title: 'movie review', duration: 120 }), true);
    assert.equal(compiled.evaluator({ title: 'unboxing', duration: 120 }), false);
    assert.equal(compiled.evaluator({ title: 'movie review', duration: 30 }), false);

    // Parse failures surface a PredicateError-shaped { error, position }.
    const bad = sandbox.compile('ctx. ');
    assert.equal(bad.ok, false);
    assert.equal(typeof bad.error, 'string');
    assert.ok(bad.position >= 0);

    // ReDoS guard rejects nested-quantifier regex patterns at parse time.
    const reDoS = sandbox.compile('ctx.title.test("(a+)+")');
    assert.equal(reDoS.ok, false);
    assert.match(reDoS.error, /nested quantifiers/);

    // Identifiers other than `ctx` are rejected (no globals reachable).
    const escape = sandbox.compile('window.location.href.includes("evil")');
    assert.equal(escape.ok, false);
});

// ── iter-7 N11 (M-phase extraction #3): VideoTypeDetector factory ──

test('createVideoTypeDetector classifies from player response and caches by video id (iter-7 N11)', () => {
    const core = loadFoundation();

    // Stub the document so _fromDOM finds no live signals — exercise
    // the player-response branch in isolation. We don't go through vm's
    // document/window because the detector is now decoupled enough that
    // a minimal stub on globalThis works.
    let currentVid = 'abc11111111';
    let playerResponse = {
        videoDetails: { videoId: 'abc11111111', isLive: true }
    };
    const debugCalls = [];

    const detector = core.createVideoTypeDetector({
        getPlayerResponse: () => playerResponse,
        getVideoId: () => currentVid,
        getMainVideoElement: () => null,
        debugLog: (category, message) => debugCalls.push([category, message])
    });

    assert.equal(detector.getType(), 'live');
    assert.equal(detector.isLive(), true);
    assert.equal(detector.hasChat(), true);
    assert.equal(detector.hasComments(), false);

    // Cache: same videoId must not re-run detection (no new debug log).
    debugCalls.length = 0;
    detector.getType();
    detector.getType();
    assert.equal(debugCalls.length, 0, 'cache hit must not re-emit debug telemetry');

    // Video id change forces re-detection.
    currentVid = 'def22222222';
    playerResponse = {
        videoDetails: { videoId: 'def22222222', isUpcoming: true }
    };
    assert.equal(detector.getType(), 'premiere');
    assert.equal(detector.isPremiere(), true);

    // Stale player response (videoId mismatch) falls back to DOM (which
    // we've stubbed to nothing) → returns 'standard'.
    currentVid = 'ghi33333333';
    playerResponse = {
        videoDetails: { videoId: 'stale-id-mismatch', isLive: true }
    };
    assert.equal(detector.refresh(), 'standard');
});

test('createPredicateSandbox opens the circuit after consecutive evaluator errors (iter-7 N11)', () => {
    const core = loadFoundation();
    const debugCalls = [];
    const sandbox = core.createPredicateSandbox({
        debugLog: (category, message) => debugCalls.push([category, message])
    });

    // ctx access on a field that isn't an own property throws inside
    // evaluate() — caught by compile()'s evaluator wrapper. 10 in a row
    // must open the circuit and freeze all subsequent calls to false.
    const compiled = sandbox.compile('ctx.unknown === "x"');
    assert.equal(compiled.ok, true);
    for (let i = 0; i < 10; i++) {
        assert.equal(compiled.evaluator({ other: 'y' }), false);
    }
    // 11th call should be short-circuited regardless of ctx shape.
    assert.equal(compiled.evaluator({ unknown: 'x' }), false);
    // Telemetry must surface the circuit-open event.
    const circuitMsg = debugCalls.find(([, msg]) => /Circuit opened/.test(msg));
    assert.ok(circuitMsg, 'debugLog must record the circuit-open telemetry');

    // reset() unlocks the evaluator without recompilation.
    compiled.evaluator.reset();
    assert.equal(compiled.evaluator({ unknown: 'x' }), true);
});
