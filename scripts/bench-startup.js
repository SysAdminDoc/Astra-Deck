#!/usr/bin/env node
'use strict';

// Headless startup benchmark for the real isolated-world content-script
// fixture. Captured YouTube watch/feed DOM is preferred when the local MHTML
// captures are available; the small synthetic fixture remains a portable
// fallback for clean checkouts that do not carry ignored captures. The
// benchmark deliberately measures only the extension stack:
// `startup-bench-start.js` runs immediately before the manifest's isolated
// scripts, and the ready mark is taken after the real YTKIT message listener
// is registered. The first-feature-paint metric is the first observed
// Astra-managed DOM/style node (or the first animation frame that observes
// one), and the steady-state metrics are collected during a bounded,
// pointer-free DOM/event session.

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const {
    buildFixture,
    findBrowser,
} = require('./smoke-settings-overlay');
const {
    killProcessTree,
    removeDirWithRetries,
} = require('./smoke-chromium-optional-hosts');

const REPO_ROOT = path.join(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'startup-performance-baseline.json');
// Seven samples per surface, compared on the MINIMUM. Machine load can only
// ever inflate a timing sample, never deflate one, so the fastest observed run
// is the best available estimate of the code's own cost and is the one statistic
// a busy box cannot push upward. With three samples and a median, a single slow
// scheduling slice moved the compared number and the gate could not tell a
// regression from a loaded machine — which is how a real ~5x regression went
// unremarked. More samples cost wall-clock, not accuracy; seven is the point
// where the minimum stops moving run to run on the reference hardware.
const DEFAULT_ITERATIONS = 7;
const DEFAULT_TIMEOUT_MS = 30000;
const BOUNDED_SESSION_MS = 750;
// Idle window for the steady-state lane. Long enough that a once-per-second
// interval is unmistakable and short enough to gate on; results are normalised
// per minute so this can change without moving the recorded budget.
const STEADY_STATE_MS = 10000;
const STEADY_STATE_KEYS = Object.freeze([
    'idleScriptMsPerMin',
    'idleTaskMsPerMin',
    'idleLayoutsPerMin',
    'idleStyleRecalcsPerMin',
    'idleHeapGrowthBytesPerMin',
]);
// Photosensitive protection gets one millisecond per presented frame for its
// 2x2 luminance readback. The shared frame sampler disables itself after three
// consecutive over-budget callbacks; keep this contract visible beside the
// startup budget so performance changes are reviewed with the same gate.
const PHOTOSENSITIVE_FRAME_BUDGET_MS = 1;
const HEADED_PRIVATE = process.env.YTKIT_BENCH_HEADED_PRIVATE === '1';
// Tolerance against the MINIMUM, which is far steadier than the median the
// gate used to compare: 0.35 relative existed to absorb load the statistic now
// rejects, and at that width a 35% regression on top of the absolute floor was
// invisible. Keep the absolute floors — they cover genuine sub-millisecond
// jitter and the heap sampler's granularity.
const DEFAULT_TOLERANCE = Object.freeze({
    relative: 0.20,
    absoluteMs: 25,
    absoluteBytes: 512 * 1024,
});
// The statistic every budget comparison uses. Recorded in the baseline so a
// baseline captured under the old median rule can never be compared as if it
// were a minimum.
// A fixed CPU-bound workload, timed alongside the real measurement. The gate
// compares the MINIMUM because load can only ever inflate a sample, but on a
// machine that is busy for the whole run every sample is inflated, minimum
// included — so a loaded box reports a regression that does not exist. This
// probe is the control: its cost is constant, so how far IT has inflated is a
// direct read on how much of the startup number is the machine rather than the
// code. Observed 2026-08-19: an unchanged tree measured 110 ms idle and 147-153
// ms while a game held the CPU at 90%, failing the gate three runs running.
const CALIBRATION_ITERATIONS = 21;
// Spread below this is ordinary scheduler jitter, not a busy machine.
const LOAD_FACTOR_NOTE = 1.15;

// Runs a workload whose real cost is fixed, several times, and reports the
// spread. Because the true cost cannot change between samples, every bit of
// spread is contention from other processes — which makes this a load meter
// that needs no reference value recorded on some other machine.
function runCalibrationProbe() {
    const samples = [];
    for (let sample = 0; sample < CALIBRATION_ITERATIONS; sample += 1) {
        const started = process.hrtime.bigint();
        // Integer mix with a data dependency so the optimiser cannot hoist it,
        // and no allocation so GC timing stays out of the measurement.
        let acc = 1;
        for (let i = 1; i <= 2000000; i += 1) {
            acc = (acc * 31 + i) % 2147483647;
            acc ^= (acc >>> 7);
        }
        const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
        if (acc === -1) throw new Error('unreachable');
        samples.push(elapsed);
    }
    return { min: Math.min(...samples), median: median(samples) };
}

// How much a timing sample on this box is expected to read high right now.
//
// The gate compares the MINIMUM because load can only inflate a sample. That
// holds for one sample, but not for a whole run: when the machine is busy for
// its entire duration every sample is inflated, the minimum included, and an
// unchanged tree reports a regression. Observed 2026-08-19 — an unchanged tree
// measured 110 ms idle and 147-153 ms while another process held the CPU at
// 90%, failing three runs running and costing about forty minutes of bisecting
// a regression that was never there.
//
// A short probe usually finds one uncontended slice, so its minimum stays near
// the machine's true speed while its median rises with contention. That ratio
// is the correction, and it is self-contained: nothing has to be recorded on a
// quiet machine first, so a reference captured on a busy one cannot quietly
// widen the budget forever.
function calibrationLoadFactor(probe) {
    if (!probe || !Number.isFinite(probe.min) || probe.min <= 0) return null;
    if (!Number.isFinite(probe.median) || probe.median <= 0) return null;
    return Math.max(1, probe.median / probe.min);
}

const COMPARISON_STATISTIC = 'min';
const METRIC_KEYS = Object.freeze([
    'parseInitMs',
    'firstFeaturePaintMs',
    'heapDeltaBytes',
    'observerCallbackMs',
]);
const METRIC_FIELDS = Object.freeze({
    parseInitMs: 'Ms',
    firstFeaturePaintMs: 'Ms',
    heapDeltaBytes: 'Bytes',
    observerCallbackMs: 'Ms',
});
const CAPTURED_SURFACES = Object.freeze([
    Object.freeze({
        id: 'watch',
        routeHint: '/watch?v=jNQXAC9IVRw',
        mhtmlPath: path.join(REPO_ROOT, 'mhtml', 'WatchPage.mhtml'),
    }),
    Object.freeze({
        id: 'feed',
        routeHint: '/',
        mhtmlPath: path.join(REPO_ROOT, 'mhtml', 'YouTube.mhtml'),
    }),
]);

class BenchmarkDevtoolsClient {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        ws.on('message', (raw) => {
            let message;
            try { message = JSON.parse(raw); } catch { return; }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(message.error.message || 'DevTools error'));
            else pending.resolve(message.result);
        });
    }

    send(method, params = {}, timeoutMs = 15000) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`DevTools call timed out: ${method}`));
            }, timeoutMs);
            this.pending.set(id, { reject, resolve, timer });
            try {
                this.ws.send(JSON.stringify({ id, method, params }));
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error);
            }
        });
    }

    async evaluate(expression, timeoutMs = 15000) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        }, timeoutMs);
        if (result.exceptionDetails) {
            throw new Error(`page evaluate failed: ${result.exceptionDetails.text || 'exception'}`);
        }
        return result.result?.value;
    }

    close() {
        this.ws.close();
    }
}

const START_DRIVER = `'use strict';
(() => {
    const state = {
        scriptStartAt: performance.now(),
        scriptEndAt: null,
        initReadyAt: null,
        firstFeaturePaintAt: null,
        firstFeatureNode: '',
        sessionStartAt: null,
        sessionEndAt: null,
        observerCallbackMs: 0,
        observerCallbackCount: 0,
    };
    const isFeatureNode = (node) => {
        if (!(node instanceof Element)) return false;
        if (node.id && node.id.toLowerCase().startsWith('ytkit')) return true;
        if (node.matches('style[data-ytkit], style[id^="ytkit" i]')) return true;
        return Array.from(node.classList || []).some((name) => name.toLowerCase().includes('ytkit'));
    };
    const markFeaturePaint = (node, source) => {
        if (state.firstFeaturePaintAt !== null || !isFeatureNode(node)) return;
        state.firstFeaturePaintAt = performance.now();
        state.firstFeatureNode = source || node.id || node.className || node.nodeName;
    };
    const observer = new MutationObserver((records) => {
        const callbackStartAt = performance.now();
        try {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (state.firstFeaturePaintAt === null) {
                        markFeaturePaint(node, 'mutation');
                        if (node.querySelector) {
                            const child = node.querySelector('[id^="ytkit" i], [class*="ytkit" i], style[data-ytkit], style[id^="ytkit" i]');
                            if (child) markFeaturePaint(child, 'mutation-descendant');
                        }
                    }
                }
            }
        } finally {
            state.observerCallbackMs += performance.now() - callbackStartAt;
            state.observerCallbackCount += 1;
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame((timestamp) => {
        if (state.firstFeaturePaintAt === null) {
            const featureNode = document.querySelector('[id^="ytkit" i], [class*="ytkit" i], style[data-ytkit], style[id^="ytkit" i]');
            if (featureNode) markFeaturePaint(featureNode, 'animation-frame');
        }
        callback(timestamp);
    });

    globalThis.__ytkitStartupBenchmark = state;
})();
`;

const END_DRIVER = `'use strict';
(() => {
    const state = globalThis.__ytkitStartupBenchmark;
    if (state) state.scriptEndAt = performance.now();
})();
`;

function parseArgs(argv) {
    const opts = {
        allowSynthetic: false,
        browser: '',
        check: false,
        iterations: DEFAULT_ITERATIONS,
        steadyState: false,
        steadyStateMs: STEADY_STATE_MS,
        selfTestLeak: false,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        updateBaseline: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--browser') {
            opts.browser = path.resolve(argv[++index] || '');
        } else if (arg === '--check') {
            opts.check = true;
        } else if (arg === '--iterations') {
            opts.iterations = Number(argv[++index]);
        } else if (arg === '--timeout-ms') {
            opts.timeoutMs = Number(argv[++index]);
        } else if (arg === '--update-baseline') {
            opts.updateBaseline = true;
        } else if (arg === '--allow-synthetic') {
            opts.allowSynthetic = true;
        } else if (arg === '--self-test-leak') {
            opts.selfTestLeak = true;
            opts.steadyState = true;
            opts.check = true;
        } else if (arg === '--steady-state') {
            opts.steadyState = true;
        } else if (arg === '--steady-state-ms') {
            opts.steadyStateMs = Number(argv[++index]);
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    if (!Number.isInteger(opts.iterations) || opts.iterations < 1 || opts.iterations > 20) {
        throw new Error('--iterations must be an integer from 1 to 20');
    }
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 5000) {
        throw new Error('--timeout-ms must be at least 5000');
    }
    if (opts.check && opts.updateBaseline) {
        throw new Error('--check and --update-baseline cannot be combined');
    }
    if (!Number.isFinite(opts.steadyStateMs) || opts.steadyStateMs < 2000 || opts.steadyStateMs > 120000) {
        throw new Error('--steady-state-ms must be between 2000 and 120000');
    }
    return opts;
}

function median(values) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
    return sorted[index];
}

function summarize(samples) {
    const metrics = {};
    for (const key of METRIC_KEYS) {
        const values = samples.map((sample) => Number(sample[key])).filter(Number.isFinite);
        if (!values.length) throw new Error(`No finite ${key} samples were collected`);
        const field = METRIC_FIELDS[key];
        metrics[key] = {
            [`median${field}`]: roundMetric(key, median(values)),
            [`p95${field}`]: roundMetric(key, percentile(values, 0.95)),
            [`min${field}`]: roundMetric(key, Math.min(...values)),
            [`max${field}`]: roundMetric(key, Math.max(...values)),
        };
    }
    return metrics;
}

// The four serial stages of runtime-bootstrap's loadRuntime(), reported on the
// same minimum-of-samples basis as the gated metrics so the two can be read
// together. Attribution only — these are not gated, because a stage boundary
// can legitimately move work between stages without changing the total.
const STAGE_KEYS = Object.freeze(['coreLoaderMs', 'settingsReadMs', 'featureModulesMs', 'monolithMs']);

function summarizeStageTimings(samples) {
    const lines = [];
    for (const surface of [...new Set(samples.map((sample) => sample.surface))]) {
        const forSurface = samples.filter((sample) => sample.surface === surface && sample.stageTimings);
        if (!forSurface.length) continue;
        const parts = STAGE_KEYS.map((key) => {
            const values = forSurface.map((sample) => Number(sample.stageTimings[key])).filter(Number.isFinite);
            return values.length ? `${key.replace(/Ms$/, '')} ${Math.min(...values).toFixed(2)}` : null;
        }).filter(Boolean);
        const moduleCount = forSurface[0].stageTimings.featureModuleCount;
        lines.push(`${surface} stage min (ms): ${parts.join('; ')}`
            + (Number.isFinite(moduleCount) ? ` [${moduleCount} feature modules]` : ''));
    }
    return lines;
}

// Idle metrics are collected once per surface, so there is nothing to take a
// minimum over — the worst (highest) surface is the honest number to gate on.
function summarizeSteadyState(samples) {
    const withIdle = (samples || []).filter((sample) => Number.isFinite(Number(sample.idleTaskMsPerMin)));
    if (!withIdle.length) return null;
    const summary = {};
    for (const key of STEADY_STATE_KEYS) {
        summary[key] = Math.max(...withIdle.map((sample) => Number(sample[key]) || 0));
    }
    return summary;
}

// Two of these five keys are CPU time and scale with machine load exactly like
// the startup timings do; the other three are counts and bytes and do not. The
// startup lane has always widened timing budgets by the load probe and left
// size budgets alone (see checkAgainstBaseline) — this applies the same policy
// here, so a busy box cannot manufacture an idle-CPU regression while a real
// leak, measured in retained bytes, is still judged against the flat budget.
const STEADY_STATE_TIMING_KEYS = new Set(['idleScriptMsPerMin', 'idleTaskMsPerMin']);

function checkSteadyState(summary, baseline, loadFactor = null) {
    const budget = baseline?.steadyStateBudget;
    if (!summary || !budget) return [];
    const timingScale = Number.isFinite(loadFactor) && loadFactor > 1 ? loadFactor : 1;
    const failures = [];
    for (const key of STEADY_STATE_KEYS) {
        const rawLimit = Number(budget[key]);
        if (!Number.isFinite(rawLimit)) continue;
        const scale = STEADY_STATE_TIMING_KEYS.has(key) ? timingScale : 1;
        const limit = rawLimit * scale;
        const observed = Number(summary[key]) || 0;
        if (observed > limit) {
            const scaleNote = scale > 1 ? ` (budget ${rawLimit.toFixed(2)} widened x${scale.toFixed(2)} for machine load)` : '';
            failures.push(`idle ${key} ${observed.toFixed(2)} exceeds budget ${limit.toFixed(2)}${scaleNote} (per minute, default feature set)`);
        }
    }
    return failures;
}

function roundMetric(key, value) {
    if (key === 'heapDeltaBytes') return Math.round(Number(value));
    return Math.round(Number(value) * 100) / 100;
}

function metricMedian(summary, key) {
    return Number(summary?.[key]?.[`median${METRIC_FIELDS[key]}`]);
}

// The gated statistic. Separate from metricMedian, which still backs the
// informational per-metric log lines.
function metricValue(summary, key) {
    return Number(summary?.[key]?.[`${COMPARISON_STATISTIC}${METRIC_FIELDS[key]}`]);
}

function metricUnit(key) {
    return METRIC_FIELDS[key] === 'Bytes' ? 'bytes' : 'ms';
}

function buildBaseline(summary, options, browserPath, fallbackSummary = summary) {
    return {
        schemaVersion: 2,
        recordedAt: new Date().toISOString(),
        fixture: 'mhtml/WatchPage.mhtml + mhtml/YouTube.mhtml',
        fallbackFixture: 'scripts/smoke-settings-overlay.js::buildFixture',
        surfaces: CAPTURED_SURFACES.map((surface) => ({
            id: surface.id,
            mhtml: path.relative(REPO_ROOT, surface.mhtmlPath).replace(/\\/g, '/'),
        })),
        metricOrigin: 'performance.now() plus Runtime.getHeapUsage() around the isolated-world stack',
        browser: path.basename(browserPath),
        iterations: options.iterations,
        comparisonStatistic: COMPARISON_STATISTIC,
        tolerance: { ...DEFAULT_TOLERANCE },
        metrics: summary,
        fallbackMetrics: fallbackSummary,
    };
}

function preserveBaselineContext(nextBaseline, previousBaseline) {
    if (!previousBaseline || typeof previousBaseline !== 'object') return nextBaseline;
    const merged = { ...nextBaseline };
    for (const key of ['steadyStateBudget', 'history', 'machineNote']) {
        if (previousBaseline[key] !== undefined) merged[key] = previousBaseline[key];
    }
    return merged;
}

function readBaseline(filePath = BASELINE_PATH) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`startup baseline is missing: ${path.relative(REPO_ROOT, filePath)}`);
    }
    let baseline;
    try {
        baseline = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new Error(`could not parse startup baseline: ${error.message}`);
    }
    if (baseline?.schemaVersion !== 2
            || baseline?.fixture !== 'mhtml/WatchPage.mhtml + mhtml/YouTube.mhtml'
            || !Array.isArray(baseline.surfaces)
            || !CAPTURED_SURFACES.every((surface) => baseline.surfaces.some((entry) => entry.id === surface.id))) {
        throw new Error('startup baseline schema or fixture identity is invalid');
    }
    // A baseline recorded before the gate moved to the minimum carries medians
    // that were never meant to bound a minimum. Refuse it outright rather than
    // comparing two different statistics and calling the result a budget.
    if (baseline.comparisonStatistic !== COMPARISON_STATISTIC) {
        throw new Error(
            `startup baseline was recorded for the '${baseline.comparisonStatistic || 'median'}' statistic `
            + `but this gate compares '${COMPARISON_STATISTIC}'; re-record with npm run bench:startup -- --update-baseline`
        );
    }
    for (const key of METRIC_KEYS) {
        const field = `${COMPARISON_STATISTIC}${METRIC_FIELDS[key]}`;
        if (!Number.isFinite(Number(baseline.metrics?.[key]?.[field]))) {
            throw new Error(`startup baseline is missing metrics.${key}.${field}`);
        }
        if (!Number.isFinite(Number(baseline.fallbackMetrics?.[key]?.[field]))) {
            throw new Error(`startup fallback baseline is missing metrics.${key}.${field}`);
        }
    }
    const tolerance = baseline.tolerance || {};
    if (!Number.isFinite(Number(tolerance.relative))
            || !Number.isFinite(Number(tolerance.absoluteMs))
            || !Number.isFinite(Number(tolerance.absoluteBytes))) {
        throw new Error('startup baseline tolerance is invalid');
    }
    return baseline;
}

// Debt the gate knowingly carries on top of the reference floor, per metric.
// This exists so a measured, tracked regression does not force a choice between
// a permanently red gate (which detects nothing new) and re-recording the
// reference (which erases the evidence). The reference stays as the goal; the
// accepted number is the ratchet and may only ever decrease.
function acceptedRegression(baseline, key) {
    const value = Number(baseline?.acceptedRegression?.[key]);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function checkAgainstBaseline(summary, baseline, loadFactor = null) {
    const tolerance = baseline.tolerance;
    const failures = [];
    // Timing metrics scale with machine load; byte counts do not, so the probe
    // must never widen a size budget.
    const timingScale = Number.isFinite(loadFactor) && loadFactor > 1 ? loadFactor : 1;
    for (const key of METRIC_KEYS) {
        const baselineValue = metricValue(baseline.metrics, key);
        const observedValue = metricValue(summary, key);
        const isBytes = METRIC_FIELDS[key] === 'Bytes';
        const absoluteTolerance = isBytes
            ? Number(tolerance.absoluteBytes)
            : Number(tolerance.absoluteMs);
        const allowance = Math.max(absoluteTolerance, Math.max(0, baselineValue) * Number(tolerance.relative));
        const accepted = acceptedRegression(baseline, key);
        const scale = isBytes ? 1 : timingScale;
        // Scaling the whole expected value, not just the tolerance: if the box
        // is running 1.4x slow on a workload of known cost, a 1.4x startup
        // reading is what an unchanged tree produces.
        const limit = (baselineValue + allowance) * scale + accepted;
        if (observedValue > limit) {
            failures.push(
                `${key} ${COMPARISON_STATISTIC} ${observedValue.toFixed(2)} ${metricUnit(key)} exceeds ${limit.toFixed(2)} ${metricUnit(key)} `
                + `(baseline ${baselineValue.toFixed(2)} ${metricUnit(key)} + ${allowance.toFixed(2)} ${metricUnit(key)} tolerance`
                + `${scale > 1 ? `, scaled x${scale.toFixed(2)} for machine load` : ''}`
                + `${accepted ? ` + ${accepted.toFixed(2)} ${metricUnit(key)} accepted regression` : ''})`
            );
        }
    }
    return failures;
}

// Reports how much of the accepted debt each metric is no longer using, so the
// ratchet is actionable instead of a number nobody revisits.
function reportAcceptedRegressionHeadroom(summary, baseline) {
    const lines = [];
    for (const key of METRIC_KEYS) {
        const accepted = acceptedRegression(baseline, key);
        if (!accepted) continue;
        const tolerance = baseline.tolerance;
        const baselineValue = metricValue(baseline.metrics, key);
        const absoluteTolerance = METRIC_FIELDS[key] === 'Bytes'
            ? Number(tolerance.absoluteBytes)
            : Number(tolerance.absoluteMs);
        const allowance = Math.max(absoluteTolerance, Math.max(0, baselineValue) * Number(tolerance.relative));
        const used = metricValue(summary, key) - baselineValue - allowance;
        lines.push(
            `${key}: carrying ${accepted.toFixed(2)} ${metricUnit(key)} of accepted regression, `
            + `using ${Math.max(0, used).toFixed(2)} ${metricUnit(key)}`
            + (used < accepted ? ` — the ratchet can drop to ${Math.max(0, Math.ceil(used)).toFixed(2)}` : '')
        );
    }
    return lines;
}

function decodeQuotedPrintable(value) {
    const binary = String(value)
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(binary, 'latin1').toString('utf8');
}

function decodeMhtmlPart(body, headers) {
    const encoding = String(headers.match(/^Content-Transfer-Encoding:\s*([^\r\n]+)/im)?.[1] || '')
        .trim()
        .toLowerCase();
    if (encoding === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (encoding === 'quoted-printable') return decodeQuotedPrintable(body);
    return body;
}

function extractCapturedHtml(mhtmlPath) {
    const raw = fs.readFileSync(mhtmlPath, 'utf8');
    const headerEnd = raw.search(/\r?\n\r?\n/);
    const headerBlock = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
    const boundary = headerBlock.match(/boundary\s*=\s*"?([^";\r\n]+)"?/i)?.[1];
    if (!boundary) throw new Error('MHTML multipart boundary is missing');
    for (const part of raw.split(`--${boundary}`)) {
        if (!/Content-Type:\s*text\/html\b/i.test(part)) continue;
        const separator = part.match(/\r?\n\r?\n/);
        if (!separator || separator.index === undefined) continue;
        const headerEnd = separator.index + separator[0].length;
        const headers = part.slice(0, separator.index);
        const body = part.slice(headerEnd).replace(/\r?\n$/, '');
        return decodeMhtmlPart(body, headers);
    }
    throw new Error('MHTML has no text/html part');
}

function sanitizeCapturedBody(html) {
    const bodyMatch = String(html).match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
    let body = bodyMatch ? bodyMatch[1] : String(html);
    body = body
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<script\b[^>]*\/?>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
        .replace(/<iframe\b[^>]*\/?>/gi, '')
        .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(src|srcset|poster)\s*=\s*("[^"]*"|'[^']*')/gi, (match, name, quoted) => {
            const quote = quoted[0];
            const value = quoted.slice(1, -1);
            return /^(?:https?:|\/\/)/i.test(value)
                ? ` ${name}=${quote}data:,${quote}`
                : match;
        });
    if (body.trim().length < 100) throw new Error('captured HTML body is unexpectedly empty');
    return body;
}

function renderCapturedFixture(surface, bodyMarkup) {
    return `<!DOCTYPE html>
<html lang="en" dark>
<head>
<meta charset="utf-8">
<title>Astra Deck captured ${surface.id} startup fixture</title>
<script>globalThis.__ytkitRouteHint=${JSON.stringify(surface.routeHint)};</script>
<style>body{margin:0;font-family:Roboto,system-ui,sans-serif;}</style>
</head>
<body>
${bodyMarkup}
<div id="fixture-download-anchor" aria-hidden="true"></div>
${surface.id === 'watch' ? '<ytd-watch-flexy><div id="top-level-buttons-computed"></div><div id="secondary"></div></ytd-watch-flexy>' : ''}
    <script src="chrome-stub.js"></script>
    <script src="startup-bench-start.js"></script>
    <script src="runtime-bootstrap.js"></script>
    <script src="startup-bench-end.js"></script>
    <script src="a11y-fixture-driver.js"></script>
</body>
</html>
`;
}

function injectSyntheticBenchmarkScripts(html, surface) {
    return html
        .replace(
            '    <script src="chrome-stub.js"></script>',
            `    <script>globalThis.__ytkitRouteHint=${JSON.stringify(surface.routeHint)};</script>\n    <script src="chrome-stub.js"></script>\n    <script src="startup-bench-start.js"></script>`
        )
        .replace(
            '    <script src="a11y-fixture-driver.js"></script>',
            '    <script src="startup-bench-end.js"></script>\n    <script src="a11y-fixture-driver.js"></script>'
        );
}

// A gate nobody has watched fail is a gate nobody knows works. This plants the
// exact defect the steady-state lane exists to catch — a listener the teardown
// never removes, holding a growing retained set — so `--self-test-leak` can
// prove the check goes red before it is trusted to keep a release green.
const LEAK_SELF_TEST_DRIVER = `'use strict';
(() => {
    // Deliberate, self-test only. A handler registered on an object that is
    // never released, appending to a closure-held array on a short interval:
    // retained heap, so it survives the forced collection the sampler takes.
    const retained = [];
    const handler = () => {
        for (let i = 0; i < 400; i += 1) {
            retained.push({ at: Date.now(), pad: new Array(64).fill('astra-deck-steady-state-self-test') });
        }
    };
    globalThis.__ytkitSteadyStateSelfTestRetained = retained;
    globalThis.addEventListener('ytkit-steady-state-self-test', handler);
    setInterval(() => globalThis.dispatchEvent(new Event('ytkit-steady-state-self-test')), 50);
})();
`;

function prepareFixtureDetails(stageDir, surface = CAPTURED_SURFACES[0], { forceSynthetic = false, plantLeak = false } = {}) {
    const runtimeSettings = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'extension', 'default-settings.json'),
        'utf8'
    ));
    runtimeSettings.transcriptViewer = true;
    const fixturePath = buildFixture(stageDir, { runtimeSettings });
    fs.writeFileSync(path.join(stageDir, 'startup-bench-start.js'), START_DRIVER, 'utf8');
    fs.writeFileSync(path.join(stageDir, 'startup-bench-end.js'), END_DRIVER, 'utf8');
    let html = fs.readFileSync(fixturePath, 'utf8');
    let fixtureMode = 'synthetic-fallback';
    if (!forceSynthetic && fs.existsSync(surface.mhtmlPath)) {
        try {
            html = renderCapturedFixture(surface, sanitizeCapturedBody(extractCapturedHtml(surface.mhtmlPath)));
            fixtureMode = 'captured-mhtml';
            console.log(`[bench-startup] using captured ${path.relative(REPO_ROOT, surface.mhtmlPath).replace(/\\/g, '/')}`);
        } catch (error) {
            console.warn(`[bench-startup] could not use ${path.relative(REPO_ROOT, surface.mhtmlPath).replace(/\\/g, '/')}: ${error.message}`);
            console.warn('[bench-startup] using the deterministic synthetic fixture for this surface');
            html = injectSyntheticBenchmarkScripts(html, surface);
        }
    } else {
        if (!forceSynthetic) {
            console.warn(`[bench-startup] missing ${path.relative(REPO_ROOT, surface.mhtmlPath).replace(/\\/g, '/')}; using the deterministic synthetic fixture`);
        }
        html = injectSyntheticBenchmarkScripts(html, surface);
    }
    if (plantLeak) {
        fs.writeFileSync(path.join(stageDir, 'steady-state-leak-self-test.js'), LEAK_SELF_TEST_DRIVER, 'utf8');
        const anchor = '    <script src="a11y-fixture-driver.js"></script>';
        // Fail loudly if the anchor ever moves. A silent no-op replace would
        // make the self-test report "the planted leak did not trip the budget",
        // which blames the gate for an injection that never happened.
        if (!html.includes(anchor)) {
            throw new Error('steady-state self-test could not find the fixture script anchor to plant the leak after');
        }
        html = html.replace(anchor, `    <script src="steady-state-leak-self-test.js"></script>\n${anchor}`);
    }
    fs.writeFileSync(fixturePath, html, 'utf8');
    return { fixturePath, fixtureMode };
}

function prepareFixture(stageDir, surface = CAPTURED_SURFACES[0], options = {}) {
    return prepareFixtureDetails(stageDir, surface, options).fixturePath;
}

function httpGetJson(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, { timeout: timeoutMs }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('DevTools HTTP request timed out')));
        request.on('error', reject);
    });
}

async function waitFor(predicate, label, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
        lastValue = await predicate();
        if (lastValue) return lastValue;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`timed out waiting for ${label}; last value: ${JSON.stringify(lastValue)}`);
}

async function waitForDevtoolsUrl(browser, timeoutMs) {
    return new Promise((resolve, reject) => {
        let stderr = '';
        const timer = setTimeout(() => reject(new Error('browser did not expose a DevTools endpoint')), timeoutMs);
        browser.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
            const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) {
                clearTimeout(timer);
                resolve(match[1]);
            }
        });
        browser.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        browser.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`browser exited before DevTools startup (code ${code})`));
        });
    });
}

// Retained heap, not allocated heap. `Runtime.getHeapUsage` reports whatever is
// live at the instant it is read, so a window in which no GC happened to run
// reports the raw allocation rate and a window in which one did reports far
// less. Measured 2026-09-05 on a busy box: two back-to-back runs both reported
// 6.85 MB/min of idle "growth" — reproducible to 0.04%, and entirely garbage
// that had not been collected yet. The 2026-08-18 reference recorded 364-386
// KB/min on a quiet machine for the same code. Neither number was a leak
// measurement, which is why this lane could never be gated on. Collecting first
// makes the delta mean retention, which is the thing worth failing a build over.
async function readHeapBytes(client, { collectFirst = false } = {}) {
    if (collectFirst) {
        // Best effort: the domain is not always available, and a missing GC must
        // degrade to the old reading rather than fail the run.
        // Enable, collect, disable. Leaving the domain enabled across the idle
        // window costs real ScriptDuration — it took idleScriptMsPerMin from ~52
        // to ~803 in one measured run — and this lane exists to attribute idle
        // CPU to the extension, so the instrument must not be in the sample.
        await client.send('HeapProfiler.enable').catch(() => {});
        await client.send('HeapProfiler.collectGarbage').catch(() => {});
        await client.send('HeapProfiler.disable').catch(() => {});
    }
    const usage = await client.send('Runtime.getHeapUsage').catch(() => null);
    if (Number.isFinite(Number(usage?.usedSize))) return Number(usage.usedSize);
    const pageHeap = await client.evaluate('performance.memory?.usedJSHeapSize ?? null').catch(() => null);
    if (Number.isFinite(Number(pageHeap))) return Number(pageHeap);
    throw new Error('browser did not expose a readable JavaScript heap size');
}

async function runBoundedSession(client) {
    const result = await client.evaluate(`(async () => {
        const state = globalThis.__ytkitStartupBenchmark;
        if (!state) throw new Error('startup benchmark state is missing');
        state.observerCallbackMs = 0;
        state.observerCallbackCount = 0;
        state.sessionStartAt = performance.now();
        const root = document.querySelector('ytd-app, #content, main') || document.body || document.documentElement;
        const marker = document.createElement('div');
        marker.id = 'ytkit-benchmark-session-marker';
        marker.hidden = true;
        state.sessionMarkerId = marker.id;
        for (let index = 0; index < 32; index += 1) {
            const item = document.createElement('div');
            item.className = 'ytkit-benchmark-session-record';
            item.innerHTML = '<span data-ytkit-benchmark-record="' + index + '"></span>';
            marker.appendChild(item);
        }
        root.appendChild(marker);
        document.dispatchEvent(new CustomEvent('yt-navigate-start', { detail: { page: 'benchmark' } }));
        document.dispatchEvent(new CustomEvent('yt-page-data-updated', { detail: { page: 'benchmark' } }));
        document.dispatchEvent(new CustomEvent('yt-navigate-finish', { detail: { page: 'benchmark' } }));
        await new Promise((resolve) => setTimeout(resolve, ${BOUNDED_SESSION_MS}));
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        state.sessionEndAt = performance.now();
        return {
            sessionMs: state.sessionEndAt - state.sessionStartAt,
            observerCallbackMs: state.observerCallbackMs,
            observerCallbackCount: state.observerCallbackCount,
        };
    })()`);
    if (!result || !Number.isFinite(Number(result.sessionMs))) {
        throw new Error(`bounded benchmark session returned invalid state: ${JSON.stringify(result)}`);
    }
    return result;
}

// Holds the page open and IDLE — no synthetic mutations, no navigation events —
// and measures what the runtime costs for doing nothing. runBoundedSession above
// deliberately churns the DOM to exercise observers; this is the opposite lane,
// and it is the one that answers "why is this extension using CPU when I have
// not touched anything". Rates are normalised per minute so the window length
// can change without moving the budget.
async function readPerformanceMetrics(client) {
    const result = await client.send('Performance.getMetrics').catch(() => null);
    const out = Object.create(null);
    for (const entry of result?.metrics || []) out[entry.name] = Number(entry.value) || 0;
    return out;
}

// Holds the page open and IDLE — no synthetic mutations, no navigation events —
// and measures what the runtime costs for doing nothing. runBoundedSession above
// deliberately churns the DOM to exercise observers; this is the opposite lane,
// and it answers "why is this extension using CPU when I have not touched
// anything", which is the single largest uninstall complaint in the category.
//
// Measured through CDP Performance.getMetrics rather than by patching
// setTimeout/setInterval in the page. Wrapping the timer APIs was tried first
// and REJECTED: it cost ~14 ms of parse+init on every run because the wrappers
// are installed before the runtime loads, so the instrument moved the startup
// numbers it shares a harness with. It also could not see intervals scheduled
// before the wrapper was installed — which is exactly the case that matters.
// ScriptDuration/TaskDuration are real CPU seconds and cost nothing to read.
async function runSteadyStateSession(client, durationMs) {
    await client.send('Performance.enable', {}).catch(() => {});
    const heapStartBytes = await readHeapBytes(client, { collectFirst: true });
    const before = await readPerformanceMetrics(client);
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    const elapsedMs = Date.now() - startedAt;
    const after = await readPerformanceMetrics(client);
    const heapEndBytes = await readHeapBytes(client, { collectFirst: true });

    const minutes = Math.max(elapsedMs, 1) / 60000;
    const delta = (name) => Math.max(0, (after[name] || 0) - (before[name] || 0));
    return {
        // Performance.getMetrics reports durations in SECONDS.
        idleScriptMsPerMin: (delta('ScriptDuration') * 1000) / minutes,
        idleTaskMsPerMin: (delta('TaskDuration') * 1000) / minutes,
        idleLayoutsPerMin: delta('LayoutCount') / minutes,
        idleStyleRecalcsPerMin: delta('RecalcStyleCount') / minutes,
        idleHeapGrowthBytesPerMin: Math.max(0, heapEndBytes - heapStartBytes) / minutes
    };
}

async function waitForProcessExit(proc, timeoutMs = 3000) {
    if (!proc || proc.exitCode !== null) return;
    await Promise.race([
        new Promise((resolve) => proc.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
}

async function runIteration(browserPath, fixturePath, timeoutMs, options = {}) {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-startup-bench-profile-'));
    const fixtureUrl = pathToFileURL(fixturePath).href;
    const browser = spawn(browserPath, [
        ...(HEADED_PRIVATE ? ['--window-size=1356,920'] : ['--headless=new']),
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-file-access-from-files',
        '--enable-precise-memory-info',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        fixtureUrl,
    ], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: !HEADED_PRIVATE,
    });
    let client = null;
    try {
        const devtoolsUrl = await waitForDevtoolsUrl(browser, timeoutMs);
        const port = new URL(devtoolsUrl).port;
        const page = await waitFor(async () => {
            const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`, 2000).catch(() => []);
            return targets.find((target) => target.type === 'page' && target.url === fixtureUrl) || null;
        }, 'the startup fixture page', timeoutMs);
        const socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        client = new BenchmarkDevtoolsClient(socket);
        await client.send('Runtime.enable');
        const result = await waitFor(async () => client.evaluate(`(() => {
            const state = globalThis.__ytkitStartupBenchmark;
            if (!state) return null;
            if (state.initReadyAt === null && globalThis.__ytkitSmoke?.listenerCount?.() > 0) {
                state.initReadyAt = performance.now();
            }
            if (state.initReadyAt === null || state.firstFeaturePaintAt === null) return null;
            return {
                parseInitMs: state.initReadyAt - state.scriptStartAt,
                firstFeaturePaintMs: state.firstFeaturePaintAt - state.scriptStartAt,
                firstFeatureNode: state.firstFeatureNode,
                scriptEndMs: state.scriptEndAt === null ? null : state.scriptEndAt - state.scriptStartAt,
                // Per-stage attribution from the bootstrap, so a regression can
                // be pinned to core-loader / settings / feature fan-out /
                // monolith instead of only showing up in the end-to-end number.
                stageTimings: globalThis.__ytkitRuntimeBootstrap?.stageTimings || null
            };
        })()`), 'content-script initialization and first feature paint', timeoutMs);
        if (!Number.isFinite(result.parseInitMs) || !Number.isFinite(result.firstFeaturePaintMs)) {
            throw new Error(`benchmark returned invalid metrics: ${JSON.stringify(result)}`);
        }
        const heapStartBytes = await readHeapBytes(client);
        const session = await runBoundedSession(client);
        const heapEndBytes = await readHeapBytes(client);
        const heapDeltaBytes = Math.max(0, heapEndBytes - heapStartBytes);
        const steadyState = await client.evaluate(`(() => {
            const state = globalThis.__ytkitStartupBenchmark;
            const marker = state?.sessionMarkerId && document.getElementById(state.sessionMarkerId);
            const result = state ? {
                observerCallbackMs: state.observerCallbackMs,
                observerCallbackCount: state.observerCallbackCount,
                sessionMs: state.sessionEndAt - state.sessionStartAt,
            } : null;
            marker?.remove();
            if (state) state.sessionMarkerId = null;
            return result;
        })()`);
        if (!Number.isFinite(Number(heapDeltaBytes))
                || !Number.isFinite(Number(steadyState?.observerCallbackMs))) {
            throw new Error(`benchmark returned invalid steady-state metrics: ${JSON.stringify({ heapDeltaBytes, session, steadyState })}`);
        }
        // The idle lane runs LAST and only when asked: it holds the page still
        // for STEADY_STATE_MS, which would otherwise add that to every startup
        // sample for numbers nobody reads.
        const idle = options.steadyState
            ? await runSteadyStateSession(client, options.steadyStateMs || STEADY_STATE_MS)
            : null;
        return {
            ...result,
            heapDeltaBytes,
            observerCallbackMs: Number(steadyState.observerCallbackMs),
            observerCallbackCount: Number(steadyState.observerCallbackCount),
            boundedSessionMs: Number(steadyState.sessionMs),
            ...(idle || {}),
        };
    } finally {
        client?.close();
        killProcessTree(browser);
        await waitForProcessExit(browser);
        await removeDirWithRetries(profileDir);
    }
}

async function runBenchmark(options, browserPath, { forceSynthetic = false, plantLeak = false } = {}) {
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-startup-bench-stage-'));
    try {
        const samples = [];
        for (const surface of CAPTURED_SURFACES) {
            const prepared = prepareFixtureDetails(stageDir, surface, { forceSynthetic, plantLeak });
            const fixturePath = prepared.fixturePath;
            for (let index = 0; index < options.iterations; index += 1) {
                const sample = await runIteration(browserPath, fixturePath, options.timeoutMs, {
                    // Only the FIRST sample per surface pays the idle window;
                    // idle cost does not vary between identical loads and
                    // paying it seven times would add ~70 s per surface.
                    steadyState: options.steadyState && index === 0,
                    steadyStateMs: options.steadyStateMs
                });
                const taggedSample = {
                    ...sample,
                    surface: surface.id,
                    fixtureMode: prepared.fixtureMode,
                };
                samples.push(taggedSample);
                console.log(`[bench-startup] ${surface.id} sample ${index + 1}/${options.iterations}: parse+init ${sample.parseInitMs.toFixed(2)} ms; first-feature-paint ${sample.firstFeaturePaintMs.toFixed(2)} ms; heap +${sample.heapDeltaBytes} bytes; observer ${sample.observerCallbackMs.toFixed(2)} ms/${sample.observerCallbackCount} callbacks`);
            }
        }
        return {
            samples,
            metrics: summarize(samples),
            fixtureMode: samples.every((sample) => sample.fixtureMode === 'captured-mhtml')
                ? 'captured-mhtml'
                : 'synthetic-fallback',
        };
    } finally {
        await removeDirWithRetries(stageDir);
    }
}

async function main(argv = process.argv.slice(2)) {
    if (HEADED_PRIVATE && process.env.YTKIT_VISUAL_ISOLATED !== '1') {
        throw new Error('YTKIT_BENCH_HEADED_PRIVATE requires YTKIT_VISUAL_ISOLATED=1 and a private-desktop launcher');
    }
    const options = parseArgs(argv);
    const browserPath = findBrowser(options.browser);
    if (!browserPath) {
        throw new Error('no Chromium-family browser found; set CHROME_PATH/EDGE_PATH or pass --browser');
    }
    if (options.selfTestLeak) {
        // Prove the gate can fail. Runs the real steady-state lane against a
        // fixture carrying a listener the teardown never removes, and succeeds
        // only when the heap budget catches it. A pass here means the check is
        // still wired to something; a "did not detect" means it is decorative.
        const planted = await runBenchmark(options, browserPath, { plantLeak: true });
        const baseline = readBaseline();
        const idle = summarizeSteadyState(planted.samples);
        if (!idle) throw new Error('self-test collected no steady-state sample');
        console.log(`[bench-startup] self-test idle idleHeapGrowthBytesPerMin: ${idle.idleHeapGrowthBytesPerMin.toFixed(2)}`);
        const heapFailures = checkSteadyState(idle, baseline, null)
            .filter((line) => line.includes('idleHeapGrowthBytesPerMin'));
        if (!heapFailures.length) {
            console.error('[bench-startup] SELF-TEST FAILED — a planted retained-heap leak did not trip the steady-state budget.');
            console.error(`[bench-startup] observed ${idle.idleHeapGrowthBytesPerMin.toFixed(2)} bytes/min against budget `
                + `${Number(baseline?.steadyStateBudget?.idleHeapGrowthBytesPerMin).toFixed(2)}.`);
            process.exitCode = 1;
            return;
        }
        console.log('[bench-startup] SELF-TEST PASSED — the planted leak tripped the budget:');
        for (const line of heapFailures) console.log(`[bench-startup]   ${line}`);
        return;
    }
    const result = await runBenchmark(options, browserPath);
    console.log(`[bench-startup] fixture mode: ${result.fixtureMode}`);
    console.log(`[bench-startup] photosensitive frame budget: ${PHOTOSENSITIVE_FRAME_BUDGET_MS.toFixed(2)} ms/sample`);
    for (const line of summarizeStageTimings(result.samples)) {
        console.log(`[bench-startup] ${line}`);
    }

    // Idle steady state. Reported and gated separately from startup: they answer
    // different questions and a change to one rarely moves the other.
    const idle = summarizeSteadyState(result.samples);
    if (idle) {
        for (const key of STEADY_STATE_KEYS) {
            console.log(`[bench-startup] idle ${key}: ${idle[key].toFixed(2)}`);
        }
    } else if (options.steadyState) {
        throw new Error('steady-state lane requested but no sample reported idle metrics');
    }
    for (const key of METRIC_KEYS) {
        console.log(
            `[bench-startup] ${COMPARISON_STATISTIC} ${key}: ${metricValue(result.metrics, key).toFixed(2)} ${metricUnit(key)}`
            + ` (median ${metricMedian(result.metrics, key).toFixed(2)} ${metricUnit(key)}, ${options.iterations} samples/surface)`
        );
    }

    if (options.updateBaseline) {
        const fallbackResult = result.fixtureMode === 'captured-mhtml'
            ? await runBenchmark(options, browserPath, { forceSynthetic: true })
            : result;
        const previousBaseline = fs.existsSync(BASELINE_PATH) ? readBaseline() : null;
        const baseline = preserveBaselineContext(
            buildBaseline(result.metrics, options, browserPath, fallbackResult.metrics),
            previousBaseline
        );
        fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
        console.log(`[bench-startup] wrote ${path.relative(REPO_ROOT, BASELINE_PATH).replace(/\\/g, '/')}`);
        return { result, baseline, failures: [] };
    }

    const baseline = readBaseline();
    const usedCaptures = result.fixtureMode === 'captured-mhtml';
    const baselineMetrics = usedCaptures ? baseline.metrics : baseline.fallbackMetrics;
    const budgetSource = usedCaptures ? 'metrics (captured mhtml)' : 'fallbackMetrics (synthetic fixture)';
    console.log(`[bench-startup] budget source: baseline.${budgetSource}`);

    // The mhtml captures are gitignored, so a clean clone silently fell through
    // to the synthetic fixture AND to a different budget with only a
    // console.warn. Two budgets that swap themselves out on a missing file are
    // not a gate. Gating on the fallback is still useful, but it has to be
    // asked for.
    if (options.check && !usedCaptures && !options.allowSynthetic) {
        throw new Error(
            'startup captures are missing, so the run measured the synthetic fixture and would have been\n'
            + `  gated against baseline.fallbackMetrics instead of baseline.metrics.\n`
            + '  Capture mhtml/WatchPage.mhtml + mhtml/YouTube.mhtml, or pass --allow-synthetic to gate\n'
            + '  against the synthetic budget deliberately.'
        );
    }

    // Each budget source carries its own ratchet: the captured and synthetic
    // fixtures have different reference shapes, so one shared allowance would
    // have to be widened to the looser lane and would stop gating the tighter
    // one.
    const acceptedForSource = usedCaptures
        ? baseline.acceptedRegression
        : baseline.fallbackAcceptedRegression;
    const comparisonBaseline = {
        ...baseline,
        metrics: baselineMetrics,
        acceptedRegression: acceptedForSource,
    };
    if (acceptedForSource) {
        console.warn(
            `[bench-startup] carrying accepted startup regression recorded ${acceptedForSource.recordedAt}: `
            + `${acceptedForSource.reason}`
        );
        for (const line of reportAcceptedRegressionHeadroom(result.metrics, comparisonBaseline)) {
            console.warn(`[bench-startup]   ${line}`);
        }
    }

    // Read the machine before judging the code. See runCalibrationProbe().
    const probe = runCalibrationProbe();
    const loadFactor = calibrationLoadFactor(probe);
    if (loadFactor !== null) {
        console.log(
            `[bench-startup] machine load probe: min ${probe.min.toFixed(1)} ms, `
            + `median ${probe.median.toFixed(1)} ms (x${loadFactor.toFixed(2)})`
            + (loadFactor > LOAD_FACTOR_NOTE ? ' — this box is busy; timing budgets are scaled to match' : '')
        );
    }

    const failures = checkAgainstBaseline(result.metrics, comparisonBaseline, loadFactor);
    failures.push(...checkSteadyState(idle, baseline, loadFactor));
    if (failures.length) {
        // Both statistics, always: a reader can tell load from regression at a
        // glance only if the spread is visible next to the compared number.
        for (const key of METRIC_KEYS) {
            const field = METRIC_FIELDS[key];
            const entry = result.metrics?.[key] || {};
            const min = Number(entry[`min${field}`]);
            const med = Number(entry[`median${field}`]);
            const p95 = Number(entry[`p95${field}`]);
            if (!Number.isFinite(min)) continue;
            console.warn(
                `[bench-startup]   ${key}: min ${min.toFixed(2)} / median ${Number.isFinite(med) ? med.toFixed(2) : 'n/a'}`
                + ` / p95 ${Number.isFinite(p95) ? p95.toFixed(2) : 'n/a'} ${metricUnit(key)}`
            );
        }
        if (loadFactor !== null && loadFactor > LOAD_FACTOR_NOTE) {
            console.warn(
                `[bench-startup] the load probe read x${loadFactor.toFixed(2)} slow, so the budgets above were `
                + 'already widened by that factor and the overage is on top of it. Re-run on an idle machine '
                + 'before treating this as a regression.'
            );
        }
        failures.push(`measured with fixture mode '${result.fixtureMode}' against baseline.${budgetSource}`);
        // `--check` gates (that is `npm run check:startup`); a bare bench run
        // REPORTS. The flag was parsed but never read, so both modes were
        // identical and measuring on a busy machine failed the run instead of
        // printing the numbers you asked for.
        const summary = `startup budget regression:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`;
        if (options.check) throw new Error(summary);
        console.warn(`[bench-startup] ${summary}`);
        console.warn('[bench-startup] reporting only — run `npm run check:startup` to gate on this.');
        return { result, baseline, failures };
    }
    console.log('[bench-startup] PASS — startup metrics are within the tracked budget');
    return { result, baseline, failures };
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[bench-startup] ${error.message || error}`);
        process.exit(1);
    });
}

module.exports = {
    BASELINE_PATH,
    BOUNDED_SESSION_MS,
    CALIBRATION_ITERATIONS,
    CAPTURED_SURFACES,
    DEFAULT_TOLERANCE,
    LOAD_FACTOR_NOTE,
    calibrationLoadFactor,
    runCalibrationProbe,
    PHOTOSENSITIVE_FRAME_BUDGET_MS,
    METRIC_KEYS,
    buildBaseline,
    preserveBaselineContext,
    checkAgainstBaseline,
    extractCapturedHtml,
    checkSteadyState,
    median,
    parseArgs,
    prepareFixture,
    readBaseline,
    STEADY_STATE_KEYS,
    summarize,
    summarizeSteadyState,
};
