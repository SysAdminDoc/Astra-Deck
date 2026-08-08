'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const benchmark = require('../scripts/bench-startup');
const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'bench-startup.js'), 'utf8');
const packageJson = require('../package.json');

function baseline(overrides = {}) {
    return {
        schemaVersion: 1,
        fixture: 'scripts/smoke-settings-overlay.js::buildFixture',
        tolerance: { relative: 0.35, absoluteMs: 25 },
        metrics: {
            parseInitMs: { medianMs: 100 },
            firstFeaturePaintMs: { medianMs: 50 },
        },
        ...overrides,
    };
}

test('startup benchmark summarizes deterministic medians and p95 values', () => {
    const summary = benchmark.summarize([
        { parseInitMs: 30, firstFeaturePaintMs: 12 },
        { parseInitMs: 10, firstFeaturePaintMs: 20 },
        { parseInitMs: 20, firstFeaturePaintMs: 16 },
        { parseInitMs: 40, firstFeaturePaintMs: 24 },
    ]);
    assert.deepEqual(summary.parseInitMs, { medianMs: 25, p95Ms: 40, minMs: 10, maxMs: 40 });
    assert.deepEqual(summary.firstFeaturePaintMs, { medianMs: 18, p95Ms: 24, minMs: 12, maxMs: 24 });
});

test('startup budget gate allows normal noise and rejects a measured regression', () => {
    const base = baseline();
    assert.deepEqual(benchmark.checkAgainstBaseline({
        parseInitMs: { medianMs: 124 },
        firstFeaturePaintMs: { medianMs: 74 },
    }, base), []);

    const failures = benchmark.checkAgainstBaseline({
        parseInitMs: { medianMs: 136 },
        firstFeaturePaintMs: { medianMs: 76 },
    }, base);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /parseInitMs median 136\.00 ms exceeds 135\.00 ms/);
    assert.match(failures[1], /firstFeaturePaintMs median 76\.00 ms exceeds 75\.00 ms/);
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
    assert.match(source, /startup-performance-baseline\.json/);
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
