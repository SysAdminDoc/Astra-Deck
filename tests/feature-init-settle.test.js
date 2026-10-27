'use strict';

// A feature whose init returns a promise used to be marked initialized and
// healthy the moment init returned. A rejection then left a "healthy" feature
// that never ran, surfaced as an unhandled rejection, and kept whatever it had
// half set up. Old work settling after a destroy or a newer init could also
// overwrite the newer attempt's status.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDeclarations, loadDeclarationsFrom } = require('./helpers/monolith');
const { sources } = require('./helpers/source');
const { createLifecycle } = require('../extension/core/feature-lifecycle.js');

const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(reason));

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function wrapper() {
    const health = [];
    const quiet = { ...console, warn() {}, error() {} };
    const api = loadDeclarations(['updateFeatureHealth', 'initFeatureLifecycle', 'settleFeatureInitOutcome', 'destroyFeatureLifecycle'], {
        console: quiet,
        performance: { now: () => 0 },
        DebugManager: { log() {} },
        setFeatureHealth: (id, patch) => health.push({ id, ...patch }),
        getFeatureName: (feature) => feature.id,
        getFeatureSettingKey: (feature) => feature.id
    });
    const last = () => health[health.length - 1];
    return { ...api, health, last };
}

function asyncFeature() {
    const attempts = [];
    const feature = {
        id: 'asyncFeature',
        destroyed: 0,
        init() {
            const attempt = deferred();
            attempts.push(attempt);
            return attempt.promise;
        },
        destroy() { this.destroyed++; }
    };
    return { feature, attempts };
}

test('a rejected async init is reported as failed and cleans up after itself', async () => {
    const w = wrapper();
    const { feature, attempts } = asyncFeature();
    assert.equal(w.initFeatureLifecycle(feature, 'startup'), true, 'init started');
    assert.equal(w.last().status, 'starting');
    assert.equal(w.last().initialized, false, 'a starting feature is not reported as running');

    attempts[0].reject(new Error('player API missing'));
    const outcome = await feature._initSettled;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.message, 'player API missing');
    assert.equal(w.last().status, 'init-error');
    assert.equal(w.last().lastError, 'player API missing');
    assert.equal(feature._initialized, false, 'a failed feature is not left initialized');
    assert.equal(feature.destroyed, 1, 'what it set up before failing is torn down');
    await settle();
    assert.equal(unhandled.length, 0, 'the rejection is observed');
});

test('a resolved async init is healthy only once it settles', async () => {
    const w = wrapper();
    const { feature, attempts } = asyncFeature();
    w.initFeatureLifecycle(feature, 'startup');
    assert.equal(w.last().status, 'starting');
    attempts[0].resolve();
    const outcome = await feature._initSettled;
    assert.equal(outcome.ok, true);
    assert.equal(outcome.error, null);
    assert.equal(w.last().status, 'initialized');
    assert.equal(w.last().initialized, true);
    assert.equal(feature._initialized, true);
});

test('old init work settling after a destroy or a newer init changes nothing', async () => {
    const w = wrapper();
    const { feature, attempts } = asyncFeature();
    w.initFeatureLifecycle(feature, 'startup');
    const firstSettled = feature._initSettled;
    w.destroyFeatureLifecycle(feature, 'settings');
    w.initFeatureLifecycle(feature, 'settings');
    attempts[1].resolve();
    await feature._initSettled;
    assert.equal(w.last().status, 'initialized', 'the newer attempt is running');

    attempts[0].reject(new Error('stale'));
    const stale = await firstSettled;
    assert.equal(stale.ok, false);
    assert.equal(stale.error, null, 'the stale failure is not reported');
    assert.equal(w.last().status, 'initialized', 'it cannot overwrite the newer status');
    assert.equal(feature._initialized, true, 'it cannot stop the newer attempt');
    assert.equal(feature.destroyed, 1, 'only the explicit destroy ran');

    w.destroyFeatureLifecycle(feature, 'settings');
    w.initFeatureLifecycle(feature, 'settings');
    w.destroyFeatureLifecycle(feature, 'settings');
    attempts[2].resolve();
    await settle();
    assert.equal(feature._initialized, false, 'a late success cannot reactivate a destroyed feature');
    assert.equal(w.last().status, 'destroyed');
    assert.equal(feature.destroyed, 4, 'what the late init attached after its destroy is torn down too');
    assert.equal(unhandled.length, 0);
});

test('a late success while a newer init owns the feature leaves it alone', async () => {
    const w = wrapper();
    const { feature, attempts } = asyncFeature();
    w.initFeatureLifecycle(feature, 'startup');
    const firstSettled = feature._initSettled;
    w.destroyFeatureLifecycle(feature, 'settings');
    w.initFeatureLifecycle(feature, 'settings');
    attempts[0].resolve();
    await firstSettled;
    assert.equal(feature.destroyed, 1, 'only the explicit destroy ran');
    assert.equal(feature._initialized, true);
});

test('crash counting waits for an async init and ignores a stale one', async () => {
    const w = wrapper();
    const tally = () => {
        const counts = { ok: 0, crashes: [] };
        return { counts, onOk: () => { counts.ok++; }, onCrash: (error) => { counts.crashes.push(error.message); } };
    };

    const sync = tally();
    const syncFeature = { id: 'syncFeature', init() {}, destroy() {} };
    w.initFeatureLifecycle(syncFeature, 'startup');
    await w.settleFeatureInitOutcome(syncFeature, sync.onOk, sync.onCrash);
    assert.deepEqual([sync.counts.ok, sync.counts.crashes.length], [1, 0]);

    const failing = tally();
    const { feature, attempts } = asyncFeature();
    w.initFeatureLifecycle(feature, 'startup');
    const outcome = w.settleFeatureInitOutcome(feature, failing.onOk, failing.onCrash);
    assert.equal(failing.counts.ok, 0, 'nothing counts while it is still starting');
    attempts[0].reject(new Error('player API missing'));
    await outcome;
    assert.deepEqual([failing.counts.ok, failing.counts.crashes.join()], [0, 'player API missing']);

    const stale = tally();
    w.initFeatureLifecycle(feature, 'navigation');
    const staleOutcome = w.settleFeatureInitOutcome(feature, stale.onOk, stale.onCrash);
    w.destroyFeatureLifecycle(feature, 'navigation');
    attempts[1].reject(new Error('stale'));
    await staleOutcome;
    assert.deepEqual([stale.counts.ok, stale.counts.crashes.length], [0, 0], 'a stale settle is neither');

    const fine = tally();
    w.initFeatureLifecycle(feature, 'navigation');
    const fineOutcome = w.settleFeatureInitOutcome(feature, fine.onOk, fine.onCrash);
    attempts[2].resolve();
    await fineOutcome;
    assert.deepEqual([fine.counts.ok, fine.counts.crashes.length], [1, 0]);
});

test('a synchronous init still reports at once', () => {
    const w = wrapper();
    const feature = { id: 'syncFeature', init() {}, destroy() {} };
    assert.equal(w.initFeatureLifecycle(feature, 'startup'), true);
    assert.equal(w.last().status, 'initialized');
    assert.equal(feature._initSettled, null);
    const broken = { id: 'brokenFeature', init() { throw new Error('boom'); } };
    assert.throws(() => w.initFeatureLifecycle(broken, 'startup'), /boom/);
    assert.equal(w.last().status, 'init-error');
});

test('the lifecycle core waits for an async init and cleans up when it rejects', async () => {
    const warnings = [];
    const lifecycle = createLifecycle({ logger: { warn: (message) => warnings.push(message) } });
    const attempts = [];
    let destroyed = 0;
    let signal = null;
    lifecycle.defineFeature({
        id: 'coreAsync',
        init(ctx) { signal = ctx.signal; const d = deferred(); attempts.push(d); return d.promise; },
        destroy() { destroyed++; }
    });

    const first = lifecycle.start('coreAsync');
    assert.equal(lifecycle.snapshot()[0].pending, true, 'reported as still starting');
    assert.equal(lifecycle.start('coreAsync'), first, 'a second start answers with the same in-flight result');
    attempts[0].reject(new Error('nope'));
    assert.equal(await first, false);
    const row = lifecycle.snapshot()[0];
    assert.equal(row.started, false, 'a failed start is not left started');
    assert.equal(row.pending, false);
    assert.match(row.lastError, /nope/);
    assert.equal(destroyed, 1, 'its destroy ran');
    assert.equal(signal.aborted, true, 'its in-flight work was aborted');
    assert.equal(warnings.length, 1);

    const stale = lifecycle.start('coreAsync');
    lifecycle.destroy('coreAsync');
    const fresh = lifecycle.start('coreAsync');
    attempts[1].reject(new Error('stale'));
    assert.equal(await stale, false);
    assert.equal(lifecycle.snapshot()[0].started, true, 'a stale rejection leaves the newer start running');
    attempts[2].resolve();
    assert.equal(await fresh, true);
    assert.equal(lifecycle.snapshot()[0].pending, false);
    assert.equal(destroyed, 2, 'only the explicit destroy ran for the stale attempt');
    await settle();
    assert.equal(unhandled.length, 0);
});

test('the popup labels a feature that is still starting as Starting, not missing', () => {
    const { featureHealthStatusLabel } = loadDeclarationsFrom(sources.popup, ['featureHealthStatusLabel'], {
        t: (_key, fallback) => fallback
    });
    assert.equal(featureHealthStatusLabel('idle', 'starting'), 'Starting');
    assert.equal(featureHealthStatusLabel('idle', 'registered'), 'Not active here');
    assert.equal(featureHealthStatusLabel('failed', 'init-error'), 'Failed');
});
