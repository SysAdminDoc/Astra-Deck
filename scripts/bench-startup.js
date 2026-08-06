#!/usr/bin/env node
'use strict';

// Headless startup benchmark for the real isolated-world content-script
// fixture. The benchmark deliberately measures only the extension stack:
// `startup-bench-start.js` runs immediately before the manifest's isolated
// scripts, and the ready mark is taken after the real YTKIT message listener
// is registered. The first-feature-paint metric is the first observed
// Astra-managed DOM/style node (or the first animation frame that observes
// one), which is stable and available without a live YouTube page.

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
const DEFAULT_ITERATIONS = 3;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TOLERANCE = Object.freeze({ relative: 0.35, absoluteMs: 25 });
const METRIC_KEYS = Object.freeze(['parseInitMs', 'firstFeaturePaintMs']);

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

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`DevTools call timed out: ${method}`));
            }, 15000);
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

    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
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
        firstFeatureNode: ''
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
        for (const record of records) {
            for (const node of record.addedNodes) {
                markFeaturePaint(node, 'mutation');
                if (state.firstFeaturePaintAt !== null) return;
                if (node.querySelector) {
                    const child = node.querySelector('[id^="ytkit" i], [class*="ytkit" i], style[data-ytkit], style[id^="ytkit" i]');
                    if (child) markFeaturePaint(child, 'mutation-descendant');
                    if (state.firstFeaturePaintAt !== null) return;
                }
            }
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
        browser: '',
        check: false,
        iterations: DEFAULT_ITERATIONS,
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
        metrics[key] = {
            medianMs: roundMs(median(values)),
            p95Ms: roundMs(percentile(values, 0.95)),
            minMs: roundMs(Math.min(...values)),
            maxMs: roundMs(Math.max(...values)),
        };
    }
    return metrics;
}

function roundMs(value) {
    return Math.round(Number(value) * 100) / 100;
}

function buildBaseline(summary, options, browserPath) {
    return {
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        fixture: 'scripts/smoke-settings-overlay.js::buildFixture',
        metricOrigin: 'performance.now() from the marker before the isolated-world stack',
        browser: path.basename(browserPath),
        iterations: options.iterations,
        tolerance: { ...DEFAULT_TOLERANCE },
        metrics: summary,
    };
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
    if (baseline?.schemaVersion !== 1 || baseline?.fixture !== 'scripts/smoke-settings-overlay.js::buildFixture') {
        throw new Error('startup baseline schema or fixture identity is invalid');
    }
    for (const key of METRIC_KEYS) {
        if (!Number.isFinite(Number(baseline.metrics?.[key]?.medianMs))) {
            throw new Error(`startup baseline is missing metrics.${key}.medianMs`);
        }
    }
    const tolerance = baseline.tolerance || {};
    if (!Number.isFinite(Number(tolerance.relative)) || !Number.isFinite(Number(tolerance.absoluteMs))) {
        throw new Error('startup baseline tolerance is invalid');
    }
    return baseline;
}

function checkAgainstBaseline(summary, baseline) {
    const tolerance = baseline.tolerance;
    const failures = [];
    for (const key of METRIC_KEYS) {
        const baselineMs = Number(baseline.metrics[key].medianMs);
        const observedMs = Number(summary[key].medianMs);
        const allowance = Math.max(Number(tolerance.absoluteMs), baselineMs * Number(tolerance.relative));
        const limitMs = baselineMs + allowance;
        if (observedMs > limitMs) {
            failures.push(
                `${key} median ${observedMs.toFixed(2)} ms exceeds ${limitMs.toFixed(2)} ms `
                + `(baseline ${baselineMs.toFixed(2)} ms + ${allowance.toFixed(2)} ms tolerance)`
            );
        }
    }
    return failures;
}

function prepareFixture(stageDir) {
    const fixturePath = buildFixture(stageDir);
    fs.writeFileSync(path.join(stageDir, 'startup-bench-start.js'), START_DRIVER, 'utf8');
    fs.writeFileSync(path.join(stageDir, 'startup-bench-end.js'), END_DRIVER, 'utf8');
    let html = fs.readFileSync(fixturePath, 'utf8');
    html = html.replace(
        '    <script src="chrome-stub.js"></script>',
        '    <script src="chrome-stub.js"></script>\n    <script src="startup-bench-start.js"></script>'
    );
    html = html.replace(
        '    <script src="a11y-fixture-driver.js"></script>',
        '    <script src="startup-bench-end.js"></script>\n    <script src="a11y-fixture-driver.js"></script>'
    );
    fs.writeFileSync(fixturePath, html, 'utf8');
    return fixturePath;
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

async function runIteration(browserPath, fixturePath, timeoutMs) {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-startup-bench-profile-'));
    const fixtureUrl = pathToFileURL(fixturePath).href;
    const browser = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-file-access-from-files',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        fixtureUrl,
    ], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
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
                scriptEndMs: state.scriptEndAt === null ? null : state.scriptEndAt - state.scriptStartAt
            };
        })()`), 'content-script initialization and first feature paint', timeoutMs);
        if (!Number.isFinite(result.parseInitMs) || !Number.isFinite(result.firstFeaturePaintMs)) {
            throw new Error(`benchmark returned invalid metrics: ${JSON.stringify(result)}`);
        }
        return result;
    } finally {
        client?.close();
        killProcessTree(browser);
        await removeDirWithRetries(profileDir);
    }
}

async function runBenchmark(options, browserPath) {
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-startup-bench-stage-'));
    try {
        const fixturePath = prepareFixture(stageDir);
        const samples = [];
        for (let index = 0; index < options.iterations; index += 1) {
            const sample = await runIteration(browserPath, fixturePath, options.timeoutMs);
            samples.push(sample);
            console.log(`[bench-startup] sample ${index + 1}/${options.iterations}: parse+init ${sample.parseInitMs.toFixed(2)} ms; first-feature-paint ${sample.firstFeaturePaintMs.toFixed(2)} ms (${sample.firstFeatureNode})`);
        }
        return { samples, metrics: summarize(samples) };
    } finally {
        await removeDirWithRetries(stageDir);
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const browserPath = findBrowser(options.browser);
    if (!browserPath) {
        throw new Error('no Chromium-family browser found; set CHROME_PATH/EDGE_PATH or pass --browser');
    }
    const result = await runBenchmark(options, browserPath);
    console.log(`[bench-startup] median parse+init: ${result.metrics.parseInitMs.medianMs.toFixed(2)} ms`);
    console.log(`[bench-startup] median first-feature-paint: ${result.metrics.firstFeaturePaintMs.medianMs.toFixed(2)} ms`);

    if (options.updateBaseline) {
        const baseline = buildBaseline(result.metrics, options, browserPath);
        fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
        console.log(`[bench-startup] wrote ${path.relative(REPO_ROOT, BASELINE_PATH).replace(/\\/g, '/')}`);
        return { result, baseline, failures: [] };
    }

    const baseline = readBaseline();
    const failures = checkAgainstBaseline(result.metrics, baseline);
    if (failures.length) {
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
    DEFAULT_TOLERANCE,
    METRIC_KEYS,
    buildBaseline,
    checkAgainstBaseline,
    median,
    parseArgs,
    prepareFixture,
    summarize,
};
