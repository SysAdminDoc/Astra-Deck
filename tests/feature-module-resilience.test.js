'use strict';

// One rejected deferred feature module used to fail the ENTIRE runtime:
// Promise.all over the peeled feature imports means a single rejection stops
// ytkit.js from ever executing, so "one feature is broken" became "the
// extension does nothing on this page" with only a console signal.
//
// Fail-closed is still correct for the FOUNDATION tier — a missing guard
// module must never be softened into a partial load.
//
// This file used to assert that distinction with regexes over the generated
// bootstrap. It now RUNS the generated bootstrap: one narrow textual
// substitution turns `import(` into a stub call, because a real dynamic import
// inside `vm` needs --experimental-vm-modules and the suite does not pass
// runner flags. Everything else — the settings gate, allSettled handling, the
// failure recording, the ordering of the monolith stage — executes for real.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const generatedPath = path.join(repoRoot, 'extension/runtime-bootstrap.js');
const generated = fs.readFileSync(generatedPath, 'utf8');
const generator = fs.readFileSync(path.join(repoRoot, 'scripts/generate-runtime-bootstrap.js'), 'utf8');

const IMPORT_CALL = /\bimport\(/g;

/**
 * Run the real bootstrap with module loading stubbed.
 *
 * `failing` names module paths whose import should reject. Returns the load
 * order actually attempted, the console errors, and the bootstrap state the
 * health panel reads.
 */
async function runBootstrap({ failing = [], settings = {} } = {}) {
    const substitutionCount = (generated.match(IMPORT_CALL) || []).length;
    assert.equal(substitutionCount, 3,
        'the bootstrap should load exactly the core loader, the feature tier, and the monolith; '
        + 'a new import() call needs this harness updated');
    const source = generated.replace(IMPORT_CALL, '__stubImport(');

    const imported = [];
    const errors = [];
    const diagnostics = [];
    const dispatched = [];

    const context = {
        console: {
            error: (...args) => errors.push(args.join(' ')),
            warn() {},
            log() {},
            debug() {}
        },
        Date,
        Math,
        Object,
        Array,
        Set,
        Map,
        JSON,
        String,
        Number,
        Boolean,
        Promise,
        Error,
        CustomEvent: class { constructor(type) { this.type = type; } },
        performance: { now: () => 0 },
        setTimeout,
        clearTimeout,
        globalThis: null,
        __stubImport(url) {
            imported.push(url);
            if (failing.some((needle) => url.includes(needle))) {
                return Promise.reject(new Error(`stubbed failure for ${url}`));
            }
            return Promise.resolve({});
        },
        chrome: {
            runtime: {
                getURL: (rel) => rel,
                sendMessage: (_msg, cb) => { if (typeof cb === 'function') cb(null); }
            },
            storage: { local: { get: async () => ({ ytSuiteSettings: settings }) } }
        },
        YTKitCore: {
            installLifecycleRouteBridge: () => true,
            DiagnosticLog: { record: (...args) => diagnostics.push(args) }
        }
    };
    context.globalThis = context;
    context.dispatchEvent = (event) => dispatched.push(event.type);
    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/runtime-bootstrap.js' });

    let failure = null;
    try {
        await context.__ytkitRuntimePromise;
    } catch (error) {
        failure = error;
    }
    const state = context.__ytkitRuntimeBootstrap;
    return {
        imported,
        errors,
        diagnostics,
        dispatched,
        failure,
        state: {
            ...state,
            // Arrays created inside the vm carry that realm's Array prototype,
            // which assert/strict refuses to call deep-equal to a host array.
            failedFeatureModules: Array.from(state?.failedFeatureModules || [])
        }
    };
}

test('a healthy run loads the core loader, the feature tier, then the monolith', async () => {
    const run = await runBootstrap();
    assert.equal(run.failure, null, 'nothing should reject when every module resolves');
    assert.equal(run.imported[0], 'runtime-core-loader.mjs', 'the core loader goes first');
    assert.equal(run.imported.at(-1), 'ytkit.js', 'the monolith goes last');
    assert.ok(run.imported.length > 2, 'feature modules load in between');
    assert.equal(run.state.phase, 'ready');
    assert.deepEqual(run.state.failedFeatureModules, []);
    assert.deepEqual(run.dispatched, ['ytkit-runtime-ready']);
});

test('one broken feature module does not stop the monolith', async () => {
    // The whole point. Under Promise.all this run ended with ytkit.js never
    // imported and the extension inert on the page.
    const run = await runBootstrap({ failing: ['features/sponsorblock/index.js'] });

    assert.equal(run.failure, null, 'a broken feature must not reject the runtime');
    assert.ok(run.imported.includes('ytkit.js'), 'the monolith must still execute');
    assert.equal(run.state.phase, 'ready');
    assert.deepEqual(run.state.failedFeatureModules, ['features/sponsorblock/index.js'],
        'the failure must be named on bootstrap state for the health panel');
    assert.deepEqual(run.dispatched, ['ytkit-runtime-ready']);
});

test('several broken feature modules are each named, and the rest still load', async () => {
    const run = await runBootstrap({
        failing: ['features/sponsorblock/index.js', 'features/dearrow/index.js']
    });

    assert.equal(run.failure, null);
    assert.ok(run.imported.includes('ytkit.js'));
    assert.equal(run.state.failedFeatureModules.length, 2);
    assert.ok(run.state.failedFeatureModules.every((entry) => entry.startsWith('features/')));
    assert.ok(run.imported.some((url) => url.startsWith('features/')
        && !run.state.failedFeatureModules.includes(url)),
        'the surviving feature modules must still be imported');
});

test('a rejected module is named in the console and the diagnostic ring', async () => {
    const run = await runBootstrap({ failing: ['features/sponsorblock/index.js'] });

    const line = run.errors.find((entry) => entry.includes('feature module failed to load'));
    assert.ok(line, 'a silent degradation is the failure mode this replaces');
    assert.match(line, /features\/sponsorblock\/index\.js/, 'the path must be named');
    assert.match(line, /stubbed failure/, 'the reason must be reported, not just the path');

    const record = run.diagnostics.find((entry) => entry[0] === 'feature-module-load');
    assert.ok(record, 'the diagnostic ring must carry the failure');
    assert.match(record[1], /features\/sponsorblock\/index\.js/);
});

test('the FOUNDATION tier still fails closed', async () => {
    // A missing guard module must never be softened. This is the asymmetry
    // that makes the feature-tier change safe. The foundation tier is loaded
    // by runtime-core-loader.mjs, a different file with a deliberately
    // different failure policy, so the bootstrap's own core-loader import is
    // what has to reject here.
    const run = await runBootstrap({ failing: ['runtime-core-loader.mjs'] });

    assert.ok(run.failure, 'a foundation failure must reject the runtime');
    assert.equal(run.state.phase, 'failed');
    assert.ok(!run.imported.includes('ytkit.js'),
        'the monolith must not run without its foundation');

    const loader = fs.readFileSync(path.join(repoRoot, 'extension/runtime-core-loader.mjs'), 'utf8');
    assert.match(loader, /await Promise\.all\(FOUNDATION_MODULES\.map/,
        'foundation modules must remain all-or-nothing');
    assert.doesNotMatch(loader, /Promise\.allSettled\(FOUNDATION_MODULES/,
        'softening the foundation tier would let a missing guard module through');
});

test('a module whose every feature is switched off is not loaded at all', async () => {
    const all = await runBootstrap();
    const off = await runBootstrap({
        settings: { sponsorBlock: false, sbPerChannelProfiles: false }
    });

    const sponsorBlockLoaded = (run) => run.imported.includes('features/sponsorblock/index.js');
    assert.equal(sponsorBlockLoaded(all), true, 'it loads with default settings');
    assert.equal(sponsorBlockLoaded(off), false,
        'the settings gate must skip a module with nothing enabled');
    assert.ok(off.imported.includes('ytkit.js'), 'skipping a module is not a failure');
});

test('the generated file matches the generator', () => {
    // The generated bootstrap is what ships; the generator is what a
    // contributor edits. `npm run check` regenerates and byte-compares, so
    // this only has to catch the distinguishing intent surviving in both.
    assert.match(generated, /allSettled, NOT all/);
    assert.match(generator, /allSettled, NOT all/);
    assert.match(generator, /await Promise\.all\(FOUNDATION_MODULES\.map/);
});
