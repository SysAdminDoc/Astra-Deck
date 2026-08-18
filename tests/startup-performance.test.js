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
    for (const lane of ['acceptedRegression', 'fallbackAcceptedRegression']) {
        assert.ok(shipped[lane], `${lane} must document the debt the gate carries`);
        assert.match(shipped[lane].reason, /RATCHET|ratchet/,
            `${lane} must state that it may only decrease`);
        assert.ok(shipped[lane].recordedAt, `${lane} must say when the debt was accepted`);
    }
});

test('startup benchmark CLI and check gate are wired to the real fixture', () => {
    assert.equal(packageJson.scripts['bench:startup'], 'node scripts/bench-startup.js');
    // --allow-synthetic is deliberate and explicit: the mhtml captures are
    // gitignored, so a clean clone measures the synthetic fixture. Without the
    // flag the gate refuses to switch budgets rather than doing it silently.
    assert.equal(packageJson.scripts['check:startup'], 'node scripts/bench-startup.js --check --allow-synthetic');
    assert.equal(packageJson.scripts['check:startup:captured'], 'node scripts/bench-startup.js --check');
    assert.match(packageJson.scripts.check, /npm run check:startup/);
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
        timeoutMs: 30000,
        updateBaseline: false,
    });
    assert.equal(benchmark.parseArgs(['--check', '--allow-synthetic']).allowSynthetic, true);
    assert.throws(() => benchmark.parseArgs(['--iterations', '0']), /from 1 to 20/);
    assert.throws(() => benchmark.parseArgs(['--iterations', '21']), /from 1 to 20/);
    assert.throws(() => benchmark.parseArgs(['--check', '--update-baseline']), /cannot be combined/);
});
