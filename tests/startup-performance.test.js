'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const benchmark = require('../scripts/bench-startup');
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
        tolerance: { relative: 0.35, absoluteMs: 25, absoluteBytes: 512 * 1024 },
        metrics: {
            parseInitMs: { medianMs: 100 },
            firstFeaturePaintMs: { medianMs: 50 },
            heapDeltaBytes: { medianBytes: 1000000 },
            observerCallbackMs: { medianMs: 10 },
        },
        fallbackMetrics: {
            parseInitMs: { medianMs: 100 },
            firstFeaturePaintMs: { medianMs: 50 },
            heapDeltaBytes: { medianBytes: 1000000 },
            observerCallbackMs: { medianMs: 10 },
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
        parseInitMs: { medianMs: 124 },
        firstFeaturePaintMs: { medianMs: 74 },
        heapDeltaBytes: { medianBytes: 1300000 },
        observerCallbackMs: { medianMs: 13 },
    }, base), []);

    const failures = benchmark.checkAgainstBaseline({
        parseInitMs: { medianMs: 136 },
        firstFeaturePaintMs: { medianMs: 76 },
        heapDeltaBytes: { medianBytes: 1600000 },
        observerCallbackMs: { medianMs: 40 },
    }, base);
    assert.equal(failures.length, 4);
    assert.match(failures[0], /parseInitMs median 136\.00 ms exceeds 135\.00 ms/);
    assert.match(failures[1], /firstFeaturePaintMs median 76\.00 ms exceeds 75\.00 ms/);
    assert.match(failures[2], /heapDeltaBytes median 1600000\.00 bytes exceeds 1524288\.00 bytes/);
    assert.match(failures[3], /observerCallbackMs median 40\.00 ms exceeds 35\.00 ms/);
});

test('startup benchmark CLI and check gate are wired to the real fixture', () => {
    assert.equal(packageJson.scripts['bench:startup'], 'node scripts/bench-startup.js');
    assert.equal(packageJson.scripts['check:startup'], 'node scripts/bench-startup.js --check');
    assert.match(packageJson.scripts.check, /npm run check:startup/);
    assert.match(source, /buildFixture\(stageDir(?:,\s*\{\s*runtimeSettings\s*\})?\)/);
    assert.match(source, /--headless=new/);
    assert.match(source, /windowsHide: true/);
    assert.match(source, /__ytkitSmoke\?\.listenerCount\?\.\(\) > 0/);
    assert.match(source, /firstFeaturePaintAt/);
    assert.match(source, /WatchPage\.mhtml/);
    assert.match(source, /YouTube\.mhtml/);
    assert.match(source, /Runtime\.getHeapUsage/);
    assert.match(source, /BOUNDED_SESSION_MS/);
    assert.match(source, /observerCallbackMs/);
    assert.match(source, /startup-performance-baseline\.json/);
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
        browser: '',
        check: true,
        iterations: 3,
        timeoutMs: 30000,
        updateBaseline: false,
    });
    assert.throws(() => benchmark.parseArgs(['--iterations', '0']), /from 1 to 20/);
    assert.throws(() => benchmark.parseArgs(['--iterations', '21']), /from 1 to 20/);
    assert.throws(() => benchmark.parseArgs(['--check', '--update-baseline']), /cannot be combined/);
});
