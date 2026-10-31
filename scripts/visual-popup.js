#!/usr/bin/env node
'use strict';

// Screenshots the real popup page in Chromium and Firefox and compares it with
// the committed baselines. Unit tests can't see a layout that broke, a colour
// that stopped resolving or a German label that wraps.
//
//   npm run visual:popup             fails on a difference, writes a diff image
//   npm run visual:popup:update      writes new baselines (review them in the commit)
//
// Baselines are per platform, since text renders differently on each. Options:
// --only chromium|firefox, --browser <path>, --firefox <path>, --geckodriver <path>.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const WebSocket = require('ws');

const REPO_ROOT = path.join(__dirname, '..');
const BASELINE_ROOT = path.join(REPO_ROOT, 'tests', 'visual', 'baseline');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'visual');
// The popup's own size. Its scroller is unrolled before the shot, so the second
// number only applies until the page has been measured.
const VIEWPORT = Object.freeze({ width: 420, height: 600 });
const MAX_HEIGHT = 4000;
const READY = 'document.querySelectorAll("button, input, select, textarea").length >= 20';
const SETTLE_MS = 2200;
const BOOT_TIMEOUT_MS = 30000;
// Tolerances for a page rendered twice by the same browser. Text antialiasing
// is excluded by pixelmatch itself, so this is room for noise, not for change.
const COLOR_THRESHOLD = 0.1;
const MAX_DIFF_RATIO = 0.0005;
// Motion, carets and focus rings all depend on when the shot lands.
const STILL_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;'
    + 'caret-color:transparent!important;scrollbar-width:none!important}';
// The page is 600 pixels with one inner scroller, so a plain shot misses most rows.
const UNROLL_CSS = 'html,body,.page-shell,.options-workspace,.quick-toggles-section,.toggles{'
    + 'height:auto!important;max-height:none!important;overflow:visible!important;flex:none!important}';

// German for long labels, Arabic for the mirrored layout.
const STATES = Object.freeze([
    Object.freeze({ name: 'dark', theme: 'dark', locale: '' }),
    Object.freeze({ name: 'light', theme: 'light', locale: '' }),
    Object.freeze({ name: 'german', theme: 'dark', locale: 'de' }),
    Object.freeze({ name: 'arabic', theme: 'dark', locale: 'ar' })
]);

function parseArgs(argv) {
    const options = { update: false, only: '', browser: '', firefox: '', geckodriver: '' };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = () => {
            index += 1;
            if (index >= argv.length) throw new Error(`${arg} needs a value`);
            return argv[index];
        };
        if (arg === '--update') options.update = true;
        else if (arg === '--only') options.only = next();
        else if (arg === '--browser') options.browser = next();
        else if (arg === '--firefox') options.firefox = next();
        else if (arg === '--geckodriver') options.geckodriver = next();
        else throw new Error(`Unknown option: ${arg}`);
    }
    if (options.only && !['chromium', 'firefox'].includes(options.only)) {
        throw new Error('--only takes chromium or firefox');
    }
    return options;
}

function baselinePath(browserName, stateName, platform = process.platform) {
    return path.join(BASELINE_ROOT, platform, `${browserName}-${stateName}.png`);
}

function statePath(state) {
    const params = new URLSearchParams({ theme: state.theme });
    if (state.locale) params.set('locale', state.locale);
    return `/popup-a11y.html?${params}`;
}

// Returns the numbers and the diff image, and leaves writing files to the caller.
async function compareImages(actualBytes, baselineBytes, options = {}) {
    const actual = PNG.sync.read(actualBytes);
    const baseline = PNG.sync.read(baselineBytes);
    if (actual.width !== baseline.width || actual.height !== baseline.height) {
        return {
            ok: false,
            reason: `size changed from ${baseline.width}x${baseline.height} to ${actual.width}x${actual.height}`,
            diffPixels: null,
            diffPng: null
        };
    }
    const { default: pixelmatch } = await import('pixelmatch');
    const diff = new PNG({ width: actual.width, height: actual.height });
    const diffPixels = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, {
        threshold: options.threshold ?? COLOR_THRESHOLD
    });
    const ratio = diffPixels / (actual.width * actual.height);
    const ok = ratio <= (options.maxDiffRatio ?? MAX_DIFF_RATIO);
    return {
        ok,
        reason: ok ? '' : `${diffPixels} pixels differ (${(ratio * 100).toFixed(2)}%)`,
        diffPixels,
        diffPng: PNG.sync.write(diff)
    };
}

// Newest Playwright Chromium first: it doesn't update itself under the baselines.
function playwrightChromium(env = process.env, platform = process.platform) {
    const root = env.PLAYWRIGHT_BROWSERS_PATH || (platform === 'win32'
        ? path.join(env.LOCALAPPDATA || '', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright'));
    if (!fs.existsSync(root)) return '';
    const builds = fs.readdirSync(root)
        .filter((name) => /^chromium-\d+$/.test(name))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
        const candidate = ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']
            .map((relative) => path.join(root, build, relative))
            .find((file) => fs.existsSync(file));
        if (candidate) return candidate;
    }
    return '';
}

async function captureChromium(stageOrigin, options, onShot) {
    const { DevtoolsClient, findBrowser, sleep, waitFor } = require('./smoke-settings-overlay.js');
    const browserPath = options.browser || process.env.CHROMIUM_PATH || playwrightChromium() || findBrowser('');
    if (!browserPath) throw new Error('No Chromium-family browser found. Pass --browser <path>.');
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-visual-chromium-'));
    const browser = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-color-profile=srgb',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let socket = null;
    try {
        let stderr = '';
        const devtoolsUrl = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Chromium did not expose a DevTools endpoint.')), BOOT_TIMEOUT_MS);
            browser.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
                const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) { clearTimeout(timer); resolve(match[1]); }
            });
            browser.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Chromium exited early (code ${code}).`)); });
        });
        const port = new URL(devtoolsUrl).port;
        const page = await waitFor(async () => {
            const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((res) => res.json()).catch(() => []);
            return targets.find((target) => target.type === 'page') || null;
        }, BOOT_TIMEOUT_MS, 'a page target');
        const version = await fetch(`http://127.0.0.1:${port}/json/version`).then((res) => res.json());
        socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        const client = new DevtoolsClient(socket);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
        for (const state of STATES) {
            await client.send('Emulation.setEmulatedMedia', {
                media: 'screen',
                features: [
                    { name: 'prefers-color-scheme', value: state.theme },
                    { name: 'prefers-reduced-motion', value: 'reduce' }
                ]
            });
            await client.send('Page.navigate', { url: `${stageOrigin}${statePath(state)}` });
            await waitFor(() => client.evaluate(`document.readyState === 'complete' && ${READY}`), BOOT_TIMEOUT_MS, `${state.name} popup`);
            const height = await client.evaluate(stillExpression());
            await client.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height, deviceScaleFactor: 1, mobile: false });
            await sleep(SETTLE_MS);
            const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
            await client.send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
            await onShot(state, Buffer.from(shot.data, 'base64'));
        }
        return version.Browser || browserPath;
    } finally {
        if (socket) socket.close();
        browser.kill();
        await sleep(500);
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 300 });
    }
}

function stillExpression() {
    return `(() => {
        // The page's CSP refuses an inline style element, not a constructed sheet.
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(${JSON.stringify(STILL_CSS + UNROLL_CSS)});
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        document.activeElement?.blur?.();
        document.scrollingElement.scrollTop = 0;
        return Math.min(Math.ceil(document.documentElement.scrollHeight), ${MAX_HEIGHT});
    })()`;
}

async function captureFirefox(stageOrigin, options, onShot) {
    const { captureScreenshot, evaluateJson, sleep, startFirefoxSession, waitForJson } = require('./firefox-webdriver.js');
    const { resolveFirefoxExecutable } = require('./smoke-firefox-webext.js');
    const firefox = resolveFirefoxExecutable(options.firefox);
    let version = '';
    // The colour scheme is a pref in Firefox, so each theme gets its own session.
    for (const theme of ['dark', 'light']) {
        const session = await startFirefoxSession({
            firefox,
            geckodriver: options.geckodriver,
            cwd: REPO_ROOT,
            prefs: {
                'layout.css.prefers-color-scheme.content-override': theme === 'dark' ? 0 : 1,
                'ui.prefersReducedMotion': 1,
                'widget.non-native-theme.scrollbar.size.override': 0
            }
        });
        try {
            version = `Firefox/${session.browserVersion}`;
            const { contexts } = await session.client.command('browsingContext.getTree', { maxDepth: 0 });
            const context = contexts[0].context;
            await session.client.command('browsingContext.setViewport', { context, viewport: VIEWPORT, devicePixelRatio: 1 });
            for (const state of STATES.filter((entry) => entry.theme === theme)) {
                await session.client.command('browsingContext.navigate', { context, url: `${stageOrigin}${statePath(state)}`, wait: 'complete' });
                await waitForJson(session.client, context, READY, Boolean, { timeoutMs: BOOT_TIMEOUT_MS });
                const height = await evaluateJson(session.client, context, stillExpression());
                await session.client.command('browsingContext.setViewport', { context, viewport: { width: VIEWPORT.width, height }, devicePixelRatio: 1 });
                await sleep(SETTLE_MS);
                const file = path.join(os.tmpdir(), `astra-visual-${process.pid}-${state.name}.png`);
                await captureScreenshot(session.client, context, file);
                const bytes = fs.readFileSync(file);
                fs.rmSync(file, { force: true });
                await session.client.command('browsingContext.setViewport', { context, viewport: VIEWPORT, devicePixelRatio: 1 });
                await onShot(state, bytes);
            }
        } finally {
            await session.close();
        }
    }
    return version;
}

async function run(options) {
    const { createStage, startFixtureServer } = require('./smoke-headless-a11y.js');
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-visual-stage-'));
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    createStage(stageDir);
    const server = await startFixtureServer(stageDir);
    const baselineDir = path.dirname(baselinePath('x', 'x'));
    const versionsFile = path.join(baselineDir, 'versions.json');
    const recorded = fs.existsSync(versionsFile) ? JSON.parse(fs.readFileSync(versionsFile, 'utf8')) : {};
    const failures = [];
    const browsers = { chromium: captureChromium, firefox: captureFirefox };
    try {
        for (const [browserName, capture] of Object.entries(browsers)) {
            if (options.only && options.only !== browserName) continue;
            const version = await capture(server.origin, options, async (state, bytes) => {
                const label = `${browserName}-${state.name}`;
                const baselineFile = baselinePath(browserName, state.name);
                if (options.update) {
                    fs.mkdirSync(baselineDir, { recursive: true });
                    fs.writeFileSync(baselineFile, bytes);
                    console.log(`[visual-popup] ${label}: baseline written`);
                    return;
                }
                fs.writeFileSync(path.join(OUT_DIR, `${label}.png`), bytes);
                if (!fs.existsSync(baselineFile)) {
                    failures.push(`${label}: no baseline for ${process.platform}, run npm run visual:popup:update`);
                    return;
                }
                const result = await compareImages(bytes, fs.readFileSync(baselineFile));
                if (result.diffPng && !result.ok) fs.writeFileSync(path.join(OUT_DIR, `${label}.diff.png`), result.diffPng);
                console.log(`[visual-popup] ${label}: ${result.ok ? 'same' : result.reason}${result.diffPixels ? ` (${result.diffPixels} px)` : ''}`);
                if (!result.ok) failures.push(`${label}: ${result.reason}`);
            });
            if (options.update) {
                recorded[browserName] = version;
            } else if (recorded[browserName] && recorded[browserName] !== version && failures.length) {
                failures.push(`${browserName}: baselines came from ${recorded[browserName]}, this run used ${version}, which can explain small differences`);
            }
        }
        if (options.update) fs.writeFileSync(versionsFile, `${JSON.stringify(recorded, null, 2)}\n`);
    } finally {
        await server.close();
        fs.rmSync(stageDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 300 });
    }
    return failures;
}

if (require.main === module) {
    (async () => {
        const failures = await run(parseArgs(process.argv.slice(2)));
        if (failures.length) {
            failures.forEach((line) => console.error(`[visual-popup] ${line}`));
            console.error(`[visual-popup] FAIL: the images are in ${OUT_DIR}. If the change is meant, run npm run visual:popup:update and review the new baselines.`);
            process.exit(1);
        }
        console.log('[visual-popup] PASS');
    })().catch((error) => {
        console.error(`[visual-popup] ${error.message || error}`);
        process.exit(1);
    });
}

module.exports = {
    baselinePath,
    compareImages,
    parseArgs,
    playwrightChromium,
    statePath,
    STATES,
    stillExpression,
    VIEWPORT
};
