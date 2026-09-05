'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const benchmark = require('../scripts/bench-startup');
const { buildChromeStub } = require('../scripts/smoke-settings-overlay');
const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'bench-startup.js'), 'utf8');
const packageJson = require('../package.json');
const { checkChainText } = require('./helpers/check-chain');

function baseline(overrides = {}) {
    return {
        schemaVersion: 2,
        fixture: 'mhtml/WatchPage.mhtml + mhtml/YouTube.mhtml',
        surfaces: [
            { id: 'watch', mhtml: 'mhtml/WatchPage.mhtml' },
            { id: 'feed', mhtml: 'mhtml/YouTube.mhtml' },
        ],
        comparisonStatistic: 'min',
        tolerance: { relative: 0.35, absoluteMs: 25, absoluteBytes: 512 * 1024 },
        // The gate compares MINIMA, not medians: machine load can only inflate a
        // timing sample, so the fastest run is the only statistic a busy box
        // cannot push upward.
        metrics: {
            parseInitMs: { minMs: 100 },
            firstFeaturePaintMs: { minMs: 50 },
            heapDeltaBytes: { minBytes: 1000000 },
            observerCallbackMs: { minMs: 10 },
        },
        fallbackMetrics: {
            parseInitMs: { minMs: 100 },
            firstFeaturePaintMs: { minMs: 50 },
            heapDeltaBytes: { minBytes: 1000000 },
            observerCallbackMs: { minMs: 10 },
        },
        ...overrides,
    };
}

test('startup benchmark summarizes deterministic medians and p95 values', () => {
    const summary = benchmark.summarize([
        { parseInitMs: 30, firstFeaturePaintMs: 12, heapDeltaBytes: 100, observerCallbackMs: 1 },
        { parseInitMs: 10, firstFeaturePaintMs: 20, heapDeltaBytes: 200, observerCallbackMs: 2 },
        { parseInitMs: 20, firstFeaturePaintMs: 16, heapDeltaBytes: 300, observerCallbackMs: 3 },
        { parseInitMs: 40, firstFeaturePaintMs: 24, heapDeltaBytes: 400, observerCallbackMs: 4 },
    ]);
    assert.deepEqual(summary.parseInitMs, { medianMs: 25, p95Ms: 40, minMs: 10, maxMs: 40 });
    assert.deepEqual(summary.firstFeaturePaintMs, { medianMs: 18, p95Ms: 24, minMs: 12, maxMs: 24 });
    assert.deepEqual(summary.heapDeltaBytes, { medianBytes: 250, p95Bytes: 400, minBytes: 100, maxBytes: 400 });
    assert.deepEqual(summary.observerCallbackMs, { medianMs: 2.5, p95Ms: 4, minMs: 1, maxMs: 4 });
});

test('startup budget gate allows normal noise and rejects a measured regression', () => {
    const base = baseline();
    assert.deepEqual(benchmark.checkAgainstBaseline({
        parseInitMs: { minMs: 124 },
        firstFeaturePaintMs: { minMs: 74 },
        heapDeltaBytes: { minBytes: 1300000 },
        observerCallbackMs: { minMs: 13 },
    }, base), []);

    const failures = benchmark.checkAgainstBaseline({
        parseInitMs: { minMs: 136 },
        firstFeaturePaintMs: { minMs: 76 },
        heapDeltaBytes: { minBytes: 1600000 },
        observerCallbackMs: { minMs: 40 },
    }, base);
    assert.equal(failures.length, 4);
    assert.match(failures[0], /parseInitMs min 136\.00 ms exceeds 135\.00 ms/);
    assert.match(failures[1], /firstFeaturePaintMs min 76\.00 ms exceeds 75\.00 ms/);
    assert.match(failures[2], /heapDeltaBytes min 1600000\.00 bytes exceeds 1524288\.00 bytes/);
    assert.match(failures[3], /observerCallbackMs min 40\.00 ms exceeds 35\.00 ms/);
});

test('the gate compares minima, so a load spike cannot move the verdict', () => {
    const base = baseline();
    // Same fast floor, wildly different tails: under the old median rule the
    // loaded sample set would have failed. The minimum ignores it.
    const quiet = benchmark.summarize([
        { parseInitMs: 100, firstFeaturePaintMs: 50, heapDeltaBytes: 0, observerCallbackMs: 0 },
        { parseInitMs: 104, firstFeaturePaintMs: 52, heapDeltaBytes: 0, observerCallbackMs: 0 },
        { parseInitMs: 108, firstFeaturePaintMs: 54, heapDeltaBytes: 0, observerCallbackMs: 0 },
    ]);
    const loaded = benchmark.summarize([
        { parseInitMs: 100, firstFeaturePaintMs: 50, heapDeltaBytes: 0, observerCallbackMs: 0 },
        { parseInitMs: 300, firstFeaturePaintMs: 220, heapDeltaBytes: 0, observerCallbackMs: 0 },
        { parseInitMs: 420, firstFeaturePaintMs: 310, heapDeltaBytes: 0, observerCallbackMs: 0 },
    ]);
    assert.ok(loaded.firstFeaturePaintMs.medianMs > 200, 'the loaded run really is slow at the median');
    assert.deepEqual(benchmark.checkAgainstBaseline(quiet, base), []);
    assert.deepEqual(benchmark.checkAgainstBaseline(loaded, base), [],
        'a load spike must not be reported as a startup regression');

    // A genuine regression moves the floor, and the floor is what is gated.
    const regressed = benchmark.summarize([
        { parseInitMs: 200, firstFeaturePaintMs: 150, heapDeltaBytes: 0, observerCallbackMs: 0 },
        { parseInitMs: 204, firstFeaturePaintMs: 152, heapDeltaBytes: 0, observerCallbackMs: 0 },
        { parseInitMs: 208, firstFeaturePaintMs: 154, heapDeltaBytes: 0, observerCallbackMs: 0 },
    ]);
    const failures = benchmark.checkAgainstBaseline(regressed, base);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /parseInitMs min 200\.00 ms/);
});

test('accepted regression widens the budget explicitly and is named in the failure', () => {
    const base = baseline({
        acceptedRegression: { recordedAt: '2026-08-18', reason: 'tracked', firstFeaturePaintMs: 30 },
    });
    // 50 baseline + 25 absolute tolerance + 30 accepted = 105.
    assert.deepEqual(benchmark.checkAgainstBaseline({
        parseInitMs: { minMs: 100 },
        firstFeaturePaintMs: { minMs: 104 },
        heapDeltaBytes: { minBytes: 1000000 },
        observerCallbackMs: { minMs: 10 },
    }, base), []);

    const failures = benchmark.checkAgainstBaseline({
        parseInitMs: { minMs: 100 },
        firstFeaturePaintMs: { minMs: 106 },
        heapDeltaBytes: { minBytes: 1000000 },
        observerCallbackMs: { minMs: 10 },
    }, base);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /exceeds 105\.00 ms/);
    assert.match(failures[0], /\+ 30\.00 ms accepted regression/,
        'carried debt must be visible in the failure, never folded silently into the budget');
});

test('a baseline recorded for a different statistic is refused, not silently compared', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-startup-baseline-'));
    const baselinePath = path.join(tempDir, 'baseline.json');
    try {
        const stale = baseline();
        delete stale.comparisonStatistic;
        fs.writeFileSync(baselinePath, JSON.stringify(stale), 'utf8');
        assert.throws(() => benchmark.readBaseline(baselinePath),
            /recorded for the 'median' statistic/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('the shipped baseline records the statistic it was measured with, and its debt only ratchets down', () => {
    const shipped = require('../scripts/startup-performance-baseline.json');
    assert.equal(shipped.comparisonStatistic, 'min');
    assert.ok(shipped.iterations >= 7,
        'a load-robust minimum needs enough samples for the floor to settle');
    // Debt is optional -- when the reference matches reality there is none to
    // carry -- but any debt that IS carried must say when and why, and that it
    // only ratchets down.
    for (const lane of ['acceptedRegression', 'fallbackAcceptedRegression']) {
        if (!shipped[lane]) continue;
        assert.match(shipped[lane].reason, /RATCHET|ratchet/,
            `${lane} must state that it may only decrease`);
        assert.ok(shipped[lane].recordedAt, `${lane} must say when the debt was accepted`);
    }

    // Re-recording the reference is legitimate when the hardware changes, but
    // it must never erase the evidence that justified the old one -- otherwise
    // a real regression can be laundered into a new baseline. The 2026-08-08
    // reference outlived its machine (OS wiped 2026-08-15) and was retired only
    // after b5c933aa and HEAD were measured back to back and matched.
    assert.ok(Array.isArray(shipped.history) && shipped.history.length > 0,
        'a retired reference must be preserved in history, not deleted');
    const retired = shipped.history[0];
    assert.ok(retired.metrics && Number.isFinite(Number(retired.metrics.firstFeaturePaintMs)),
        'the retired reference must keep its numbers');
    assert.ok(retired.retiredAt && retired.machine, 'a retired reference must say when and why it was retired');
    assert.match(retired.note, /3c9a5ef2/,
        'the bisect that made the retired reference meaningful must survive with it');
    assert.ok(shipped.machineNote && /not a code regression/i.test(shipped.machineNote),
        'a re-record must record the check that proved it was not covering a regression');
});

test('startup benchmark CLI and check gate are wired to the real fixture', () => {
    assert.equal(packageJson.scripts['bench:startup'], 'node scripts/bench-startup.js');
    // --allow-synthetic is deliberate and explicit: the mhtml captures are
    // gitignored, so a clean clone measures the synthetic fixture. Without the
    // flag the gate refuses to switch budgets rather than doing it silently.
    assert.equal(packageJson.scripts['check:startup'], 'node scripts/bench-startup.js --check --allow-synthetic');
    assert.equal(packageJson.scripts['check:startup:captured'], 'node scripts/bench-startup.js --check');
    assert.match(checkChainText(), /bench-startup\.js --check/);
    assert.match(source, /startup captures are missing/,
        'a silent budget switch must fail loudly instead of warning');
    assert.match(source, /measured with fixture mode '\$\{result\.fixtureMode\}'/,
        'the failure must name the fixture mode it measured');
    assert.match(source, /buildFixture\(stageDir(?:,\s*\{\s*runtimeSettings\s*\})?\)/);
    assert.match(source, /--headless=new/);
    assert.match(source, /HEADED_PRIVATE = process\.env\.YTKIT_BENCH_HEADED_PRIVATE === '1'/);
    assert.match(source, /windowsHide: !HEADED_PRIVATE/);
    assert.match(source, /YTKIT_BENCH_HEADED_PRIVATE requires YTKIT_VISUAL_ISOLATED=1/);
    assert.match(source, /__ytkitSmoke\?\.listenerCount\?\.\(\) > 0/);
    assert.match(source, /firstFeaturePaintAt/);
    assert.match(source, /WatchPage\.mhtml/);
    assert.match(source, /YouTube\.mhtml/);
    assert.match(source, /Runtime\.getHeapUsage/);
    assert.match(source, /BOUNDED_SESSION_MS/);
    assert.match(source, /observerCallbackMs/);
    assert.match(source, /startup-performance-baseline\.json/);
    assert.equal(benchmark.PHOTOSENSITIVE_FRAME_BUDGET_MS, 1);
    assert.match(source, /photosensitive frame budget/);
});

test('settings fixture preserves explicit runtime settings after popup smoke seeding', () => {
    const runtimeSettings = { transcriptViewer: false, blueLightFilter: true };
    const stub = buildChromeStub(runtimeSettings);
    assert.match(stub,
        /const injectedRuntimeSettings = \{"transcriptViewer":false,"blueLightFilter":true\};/);
    assert.match(stub, /store\.ytSuiteSettings = injectedRuntimeSettings \|\|/,
        'explicit benchmark settings must win over query-driven popup fixtures');
});

test('startup benchmark extracts folded-boundary quoted-printable captures', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-startup-mhtml-'));
    const mhtmlPath = path.join(tempDir, 'surface.mhtml');
    const boundary = '----benchmark-boundary';
    fs.writeFileSync(mhtmlPath, [
        'MIME-Version: 1.0',
        'Content-Type: multipart/related;',
        `\tboundary="${boundary}";`,
        '\ttype="text/html"',
        '',
        `--${boundary}`,
        'Content-Type: text/html',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        '<html><body><ytd-app>captured =3Csurface=3E</ytd-app></body></html>',
        `--${boundary}--`,
        '',
    ].join('\r\n'), 'utf8');
    try {
        assert.match(benchmark.extractCapturedHtml(mhtmlPath), /captured <surface>/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('startup benchmark argument parser rejects unsafe or ambiguous runs', () => {
    assert.deepEqual(benchmark.parseArgs(['--check']), {
        allowSynthetic: false,
        browser: '',
        check: true,
        iterations: 7,
        steadyState: false,
        steadyStateMs: 10000,
        selfTestLeak: false,
        timeoutMs: 30000,
        updateBaseline: false,
    });
    assert.equal(benchmark.parseArgs(['--steady-state']).steadyState, true);
    // --self-test-leak is the gate's own proof that it can fail, so it has to
    // imply the lane it proves: the steady-state window and the check.
    const selfTest = benchmark.parseArgs(['--self-test-leak']);
    assert.equal(selfTest.selfTestLeak, true);
    assert.equal(selfTest.steadyState, true, '--self-test-leak must collect the idle window it judges');
    assert.equal(selfTest.check, true, '--self-test-leak must compare against the recorded budget');
    assert.throws(() => benchmark.parseArgs(['--steady-state-ms', '500']), /between 2000 and 120000/);
    assert.equal(benchmark.parseArgs(['--check', '--allow-synthetic']).allowSynthetic, true);
    assert.throws(() => benchmark.parseArgs(['--iterations', '0']), /from 1 to 20/);
    assert.throws(() => benchmark.parseArgs(['--iterations', '21']), /from 1 to 20/);
    assert.throws(() => benchmark.parseArgs(['--check', '--update-baseline']), /cannot be combined/);
});

test('recording a startup reference preserves long-running budget context', () => {
    const next = {
        schemaVersion: 2,
        recordedAt: '2026-08-22T00:00:00.000Z',
        metrics: { parseInitMs: { minMs: 166.2 } }
    };
    const previous = {
        steadyStateBudget: { idleTaskMsPerMin: 200 },
        history: [{ recordedAt: '2026-08-18' }],
        machineNote: 'Verified not a code regression before recording.'
    };
    const merged = benchmark.preserveBaselineContext(next, previous);
    assert.equal(merged.metrics.parseInitMs.minMs, 166.2);
    assert.deepEqual(merged.steadyStateBudget, previous.steadyStateBudget);
    assert.deepEqual(merged.history, previous.history);
    assert.equal(merged.machineNote, previous.machineNote);
});

// ── Idle steady state ──
// Startup numbers say nothing about what the runtime costs once it is just
// sitting on an open page, which is the largest uninstall complaint in the
// category ("ramped up CPU 30-40%, I haven't even toggled anything ON").

test('the idle lane gates CPU, layout churn and heap growth per minute', () => {
    const baseline = {
        steadyStateBudget: {
            idleScriptMsPerMin: 60,
            idleTaskMsPerMin: 200,
            idleLayoutsPerMin: 30,
            idleStyleRecalcsPerMin: 30,
            idleHeapGrowthBytesPerMin: 1500000
        }
    };
    const quiet = {
        idleScriptMsPerMin: 22, idleTaskMsPerMin: 97, idleLayoutsPerMin: 6,
        idleStyleRecalcsPerMin: 6, idleHeapGrowthBytesPerMin: 385000
    };
    assert.deepEqual(benchmark.checkSteadyState(quiet, baseline), []);

    // A runaway interval is the shape this exists to catch.
    const runaway = { ...quiet, idleScriptMsPerMin: 109, idleTaskMsPerMin: 313 };
    const failures = benchmark.checkSteadyState(runaway, baseline);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /idleScriptMsPerMin 109\.00 exceeds budget 60\.00/);
    assert.match(failures[1], /idleTaskMsPerMin/);

    // A layout-thrash loop is the other shape.
    const thrash = { ...quiet, idleLayoutsPerMin: 900 };
    assert.match(benchmark.checkSteadyState(thrash, baseline)[0], /idleLayoutsPerMin/);
});

test('the idle lane reports the worst surface, and is skipped when not collected', () => {
    // Idle metrics are collected once per surface, so there is no minimum to
    // take — the worst surface is the honest number to gate on.
    const summary = benchmark.summarizeSteadyState([
        { surface: 'watch', idleTaskMsPerMin: 80, idleScriptMsPerMin: 20, idleLayoutsPerMin: 6, idleStyleRecalcsPerMin: 6, idleHeapGrowthBytesPerMin: 100 },
        { surface: 'feed', idleTaskMsPerMin: 140, idleScriptMsPerMin: 12, idleLayoutsPerMin: 9, idleStyleRecalcsPerMin: 4, idleHeapGrowthBytesPerMin: 900 }
    ]);
    assert.equal(summary.idleTaskMsPerMin, 140);
    assert.equal(summary.idleScriptMsPerMin, 20);
    assert.equal(summary.idleHeapGrowthBytesPerMin, 900);

    // Startup-only runs carry no idle fields and must not be gated on them.
    assert.equal(benchmark.summarizeSteadyState([{ surface: 'watch', parseInitMs: 100 }]), null);
    assert.deepEqual(benchmark.checkSteadyState(null, { steadyStateBudget: { idleTaskMsPerMin: 1 } }), []);
});

test('the idle lane measures through CDP, not by patching page timers', () => {
    // Wrapping setTimeout/setInterval in the page was tried and rejected: the
    // wrappers install before the runtime loads, so they cost ~14 ms of
    // parse+init and moved the startup numbers this harness also reports. They
    // also could not see intervals scheduled before the wrapper existed.
    assert.match(source, /Performance\.getMetrics/,
        'idle CPU must come from the protocol, not from page instrumentation');
    assert.doesNotMatch(source, /window\.setInterval = /,
        'the page timer patch must not come back — it taxes the startup lane it shares');
    assert.doesNotMatch(source, /window\.setTimeout = /,
        'the page timer patch must not come back — it taxes the startup lane it shares');
    assert.match(source, /ScriptDuration/);
    assert.match(source, /LayoutCount/);

    const shipped = require('../scripts/startup-performance-baseline.json');
    assert.ok(shipped.steadyStateBudget, 'a budget must be recorded, not just measured');
    for (const key of benchmark.STEADY_STATE_KEYS) {
        assert.ok(Number.isFinite(Number(shipped.steadyStateBudget[key])),
            `steadyStateBudget must bound ${key}`);
    }
    assert.equal(packageJson.scripts['check:steady-state'],
        'node scripts/bench-startup.js --check --allow-synthetic --steady-state');
});


// ── Machine-load correction ─────────────────────────────────────────────
//
// The gate compares the MINIMUM of seven samples because load can only inflate
// a timing sample. That reasoning holds for one sample but not for a whole run:
// when the box is busy for the entire duration, every sample is inflated and
// the minimum with them. On 2026-08-19 an unchanged tree measured 110 ms idle
// and 147-153 ms while another process held the CPU at 90%, failing three runs
// in a row. These pin the correction that tells the two apart.

test('the load probe reports no correction when its samples agree', () => {
    const { calibrationLoadFactor } = require('../scripts/bench-startup.js');
    // An idle machine runs a fixed workload in the same time every go.
    assert.equal(calibrationLoadFactor({ min: 40, median: 40 }), 1);
    // Never below 1: a fast outlier must not shrink the budget.
    assert.equal(calibrationLoadFactor({ min: 40, median: 38 }), 1);
});

test('the load probe reports the spread as the correction factor', () => {
    const { calibrationLoadFactor } = require('../scripts/bench-startup.js');
    // The probe's true cost cannot change between samples, so all of its spread
    // is contention — which is exactly what inflates the startup numbers.
    assert.equal(calibrationLoadFactor({ min: 40, median: 52 }), 1.3);
    assert.equal(calibrationLoadFactor({ min: 100, median: 150 }), 1.5);
});

test('the load probe refuses to guess from unusable samples', () => {
    const { calibrationLoadFactor } = require('../scripts/bench-startup.js');
    for (const bad of [null, undefined, {}, { min: 0, median: 10 }, { min: 10, median: 0 }, { min: NaN, median: 1 }]) {
        assert.equal(calibrationLoadFactor(bad), null,
            'an unusable probe must yield no factor rather than a fabricated one');
    }
});

test('a busy machine widens the timing budget but never the size budget', () => {
    const { checkAgainstBaseline } = require('../scripts/bench-startup.js');
    const baseline = {
        tolerance: { relative: 0.2, absoluteMs: 25, absoluteBytes: 512 * 1024 },
        metrics: {
            parseInitMs: { minMs: 110.4 },
            firstFeaturePaintMs: { minMs: 78.4 },
            heapDeltaBytes: { minBytes: 0 },
            observerCallbackMs: { minMs: 0 }
        }
    };
    // The reading an unchanged tree produced while the machine was at 90%.
    const loaded = {
        parseInitMs: { minMs: 150.7 },
        firstFeaturePaintMs: { minMs: 106.5 },
        heapDeltaBytes: { minBytes: 0 },
        observerCallbackMs: { minMs: 0 }
    };
    assert.ok(checkAgainstBaseline(loaded, baseline, null).length > 0,
        'without the correction this is the false regression that cost 40 minutes');
    assert.deepEqual(checkAgainstBaseline(loaded, baseline, 1.36), [],
        'a probe reading x1.36 must absorb a x1.36 inflation of an unchanged tree');

    // Bytes do not get slower under CPU load, so the factor must not touch them.
    // Sized to land between the real byte budget (524288) and what that budget
    // would become if the factor were wrongly applied to it (524288 x 1.36).
    const fatHeap = { ...loaded, heapDeltaBytes: { minBytes: 600000 } };
    const failures = checkAgainstBaseline(fatHeap, baseline, 1.36);
    assert.equal(failures.length, 1, 'the size budget must still fail under a load correction');
    assert.match(failures[0], /heapDeltaBytes/);
});

test('a real regression still fails on a busy machine', () => {
    const { checkAgainstBaseline } = require('../scripts/bench-startup.js');
    const baseline = {
        tolerance: { relative: 0.2, absoluteMs: 25, absoluteBytes: 512 * 1024 },
        metrics: {
            parseInitMs: { minMs: 110.4 },
            firstFeaturePaintMs: { minMs: 78.4 },
            heapDeltaBytes: { minBytes: 0 },
            observerCallbackMs: { minMs: 0 }
        }
    };
    // x1.36 of load plus 25 ms the code actually got slower by.
    const regressed = {
        parseInitMs: { minMs: (110.4 + 25) * 1.36 + 25 },
        firstFeaturePaintMs: { minMs: 78.4 * 1.36 },
        heapDeltaBytes: { minBytes: 0 },
        observerCallbackMs: { minMs: 0 }
    };
    const failures = checkAgainstBaseline(regressed, baseline, 1.36);
    assert.equal(failures.length, 1, 'the correction must not swallow a genuine regression');
    assert.match(failures[0], /parseInitMs/);
    assert.match(failures[0], /scaled x1\.36 for machine load/,
        'the failure must say the budget was already widened, so a reader can tell load from code');
});

test('the load probe measures a fixed workload, not the clock', () => {
    const { runCalibrationProbe, CALIBRATION_ITERATIONS, LOAD_FACTOR_NOTE } =
        require('../scripts/bench-startup.js');
    assert.ok(CALIBRATION_ITERATIONS >= 9,
        'too few samples and the spread is noise rather than a load reading');
    assert.ok(LOAD_FACTOR_NOTE > 1, 'the note threshold must sit above "no load"');
    const probe = runCalibrationProbe();
    assert.ok(Number.isFinite(probe.min) && probe.min > 0, 'the probe must produce a real minimum');
    assert.ok(probe.median >= probe.min, 'a median below the minimum would mean the maths is wrong');
});
