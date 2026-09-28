#!/usr/bin/env node
'use strict';

// Re-captures the README's Theater Split screenshots from live YouTube with
// the current build, so a design change can refresh them in one command.
//
//   npm run capture:theater-split            # both themes into outputs/
//   node scripts/capture-theater-split.js --scheme dark --out <file.png>
//
// It opens "Me at the zoo" in a headless browser, injects the extension's
// content runtime the way the offline smokes do (chrome stub + runtime
// bootstrap, default settings), opens the split and captures 1440x900.
// The browser is chrome-headless-shell only: CHROMIUM_PATH if set, otherwise
// Playwright's copy under LOCALAPPDATA. It never starts a desktop browser.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { buildFixture } = require('./smoke-settings-overlay.js');

const REPO_ROOT = path.join(__dirname, '..');
const WATCH_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const WIDTH = 1440;
const HEIGHT = 900;
const DEFAULT_OUTPUTS = Object.freeze({
    dark: path.join(REPO_ROOT, 'outputs', 'astra-deck-theater-split-dark-v8.png'),
    light: path.join(REPO_ROOT, 'outputs', 'astra-deck-theater-split-light-v8.png')
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    }
    return args;
}

function findHeadlessShell() {
    const explicit = process.env.CHROMIUM_PATH;
    if (explicit) return fs.existsSync(explicit) ? explicit : null;
    const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
    if (!fs.existsSync(root)) return null;
    const builds = fs.readdirSync(root).filter((name) => name.startsWith('chromium_headless_shell-')).sort().reverse();
    for (const build of builds) {
        const candidate = path.join(root, build, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

async function launch(binary) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-split-capture-'));
    const proc = spawn(binary, ['--headless', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--mute-audio',
        `--window-size=${WIDTH},${HEIGHT}`, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const wsUrl = await new Promise((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(() => reject(new Error('the headless browser did not start')), 20000);
        proc.stderr.on('data', (chunk) => {
            buffer += chunk;
            const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
    });
    const port = new URL(wsUrl).port;
    let target = null;
    for (let i = 0; i < 100 && !target; i += 1) {
        const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
        target = list.find((entry) => entry.type === 'page');
        if (!target) await sleep(100);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    ws.on('message', (raw) => {
        const message = JSON.parse(raw);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        } else if (message.method && listeners.has(message.method)) {
            for (const fn of listeners.get(message.method)) fn(message.params);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        id += 1;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const on = (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]);
    const evaluate = async (expression) => {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result?.value;
    };
    const close = async () => {
        try { ws.close(); } catch (_) { /* reason: the socket may already be closed */ }
        proc.kill();
        await sleep(400);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* reason: best-effort temp cleanup */ }
    };
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    return { send, on, evaluate, close };
}

async function capture(binary, scheme, out) {
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-split-stage-'));
    const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'default-settings.json'), 'utf8'));
    buildFixture(stageDir, { runtimeSettings: settings });
    const browser = await launch(binary);
    try {
        await browser.send('Page.enable');
        await browser.send('Runtime.enable');
        await browser.send('Page.setBypassCSP', { enabled: true });
        // YouTube takes its theme from the PREF cookie, not the media query.
        await browser.send('Network.enable');
        await browser.send('Network.setCookie', { name: 'PREF', value: scheme === 'dark' ? 'f6=400' : 'f6=80000', domain: '.youtube.com', path: '/', secure: true });
        // Serve the staged extension files at the paths the chrome stub
        // resolves them to; everything else goes to the network untouched.
        await browser.send('Fetch.enable', { patterns: [{ urlPattern: 'https://www.youtube.com/*', requestStage: 'Request' }] });
        browser.on('Fetch.requestPaused', ({ requestId, request }) => {
            const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
            const file = path.join(stageDir, rel);
            if (rel && !rel.startsWith('s/') && file.startsWith(stageDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
                const type = /\.m?js$/.test(file) ? 'text/javascript' : /\.css$/.test(file) ? 'text/css' : /\.json$/.test(file) ? 'application/json' : 'application/octet-stream';
                return browser.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }], body: fs.readFileSync(file).toString('base64') }).catch(() => {});
            }
            return browser.send('Fetch.continueRequest', { requestId }).catch(() => {});
        });
        await browser.send('Page.navigate', { url: WATCH_URL });
        await sleep(7000);
        await browser.evaluate(`document.querySelector('video')?.pause?.()`);
        await browser.evaluate(`new Promise((resolve) => {
            const stub = document.createElement('script');
            stub.src = '/chrome-stub.js';
            stub.onload = () => {
                const boot = document.createElement('script');
                boot.src = '/runtime-bootstrap.js';
                boot.onload = resolve;
                document.body.appendChild(boot);
            };
            document.body.appendChild(stub);
        })`);
        let mounted = false;
        for (let i = 0; i < 80 && !mounted; i += 1) {
            // The navigation events fired before the runtime existed.
            if (i % 4 === 0) await browser.evaluate(`document.dispatchEvent(new CustomEvent('yt-navigate-finish', { detail: { pageType: 'watch' } }))`);
            mounted = await browser.evaluate(`!!document.getElementById('ytkit-split-wrapper')`);
            if (!mounted) await sleep(250);
        }
        if (!mounted) throw new Error('Theater Split did not mount on the live page');
        await sleep(4000); // the pre-scroll behind the overlay loads comments
        await browser.evaluate(`document.querySelector('#movie_player video, #movie_player')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }))`);
        await sleep(3500);
        await browser.evaluate(`document.querySelector('video')?.pause?.()`);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
        await sleep(1500);
        const state = await browser.evaluate(`({ open: document.documentElement.classList.contains('ytkit-split-open'), comments: document.querySelectorAll('ytd-comment-thread-renderer').length })`);
        if (!state.open || !state.comments) throw new Error(`the split is not ready to capture: ${JSON.stringify(state)}`);
        const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(out, Buffer.from(data, 'base64'));
        console.log(`[capture-theater-split] ${scheme}: ${path.relative(REPO_ROOT, out)} (${state.comments} comments)`);
    } finally {
        await browser.close();
        try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (_) { /* reason: best-effort temp cleanup */ }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const binary = findHeadlessShell();
    if (!binary) {
        console.error('[capture-theater-split] no chrome-headless-shell found. Install it with `npx playwright install chromium-headless-shell` or set CHROMIUM_PATH.');
        process.exitCode = 1;
        return;
    }
    const schemes = args.scheme ? [args.scheme] : ['dark', 'light'];
    for (const scheme of schemes) {
        await capture(binary, scheme, args.out ? path.resolve(args.out) : DEFAULT_OUTPUTS[scheme]);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[capture-theater-split] ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { findHeadlessShell };
