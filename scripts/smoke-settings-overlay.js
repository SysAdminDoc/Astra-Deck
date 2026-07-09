#!/usr/bin/env node
'use strict';

// Rendered visual smoke for the in-page settings overlay.
//
// Static a11y/theme audits (audit-overlays-a11y.js, check-contrast.js) pin
// source contracts but cannot prove the settings window actually RENDERS.
// This smoke stages the real ISOLATED-world content-script stack onto a
// local fixture page with a minimal chrome-API stub, opens the overlay
// through the real YTKIT_OPEN_PANEL message path in a headless Chromium,
// captures desktop/mobile screenshots for dark/light/RTL states, and fails
// on blank render, horizontal overflow, a missing close/focus target, or
// unreadable primary controls.
//
// Usage: npm run smoke:settings-overlay [-- --browser <path>] [--keep-stage]
// Screenshots land in build/settings-overlay-smoke/.

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { copyDir } = require('../build-extension.js');

const REPO_ROOT = path.join(__dirname, '..');
const EXT_DIR = path.join(REPO_ROOT, 'extension');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'settings-overlay-smoke');
const PANEL_SELECTOR = '#ytkit-settings-panel, [data-ytkit-surface="control-center"], .ytkit-control-center, #ytkit-panel, .ytkit-panel';

const STATES = [
    { name: 'desktop-dark', width: 1356, height: 920, dark: true, dir: 'ltr', mobile: false },
    { name: 'desktop-light', width: 1356, height: 920, dark: false, dir: 'ltr', mobile: false },
    { name: 'desktop-rtl', width: 1356, height: 920, dark: true, dir: 'rtl', mobile: false },
    // mobile: false is deliberate — YouTube desktop is not a mobile-UA site;
    // the honest narrow-screen case is a desktop window at phone width, where
    // window.innerWidth really is 390 (mobile emulation without a viewport
    // meta falls back to a 980px layout viewport and hides real overflow).
    { name: 'mobile-dark', width: 390, height: 844, dark: true, dir: 'ltr', mobile: false },
    { name: 'mobile-light', width: 390, height: 844, dark: false, dir: 'ltr', mobile: false },
];

function parseArgs(argv) {
    const opts = { browser: '', keepStage: false, fallbackOnly: false, timeoutMs: 45000 };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--browser') { opts.browser = path.resolve(argv[++i] || ''); continue; }
        if (arg === '--keep-stage') { opts.keepStage = true; continue; }
        if (arg === '--fallback-only') { opts.fallbackOnly = true; continue; }
        if (arg === '--timeout') { opts.timeoutMs = Number(argv[++i]) || opts.timeoutMs; continue; }
        throw new Error(`unknown argument: ${arg}`);
    }
    return opts;
}

function findBrowser(cliPath) {
    const candidates = [];
    const push = (p) => { if (p) candidates.push(p); };
    push(cliPath);
    push(process.env.CHROMIUM_PATH);
    push(process.env.CHROME_PATH);
    push(process.env.EDGE_PATH);
    if (process.platform === 'win32') {
        const pf = process.env.ProgramFiles || 'C:\\Program Files';
        const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        push(path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        push(path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        push(path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    } else if (process.platform === 'darwin') {
        push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
        push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    } else {
        push('/usr/bin/google-chrome');
        push('/usr/bin/chromium');
        push('/usr/bin/chromium-browser');
    }
    return candidates.find((p) => p && fs.existsSync(p)) || null;
}

const CHROME_STUB = `'use strict';
// Minimal chrome-API stub so the real content-script stack boots on a
// local fixture page. Storage is in-memory; onMessage listeners are
// captured so the smoke can drive the real YTKIT_OPEN_PANEL path.
(() => {
    const store = Object.create(null);
    const messageListeners = [];
    const changeListeners = [];
    const normalizeKeys = (keys) => {
        if (keys == null) return Object.keys(store);
        if (typeof keys === 'string') return [keys];
        if (Array.isArray(keys)) return keys;
        return Object.keys(keys);
    };
    const readOut = (keys) => {
        const out = {};
        for (const key of normalizeKeys(keys)) {
            if (key in store) out[key] = store[key];
            else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[key] = keys[key];
        }
        return out;
    };
    globalThis.chrome = {
        runtime: {
            id: 'ytkit-smoke-fixture',
            getURL: (p) => p,
            getManifest: () => ({ version: '0.0.0-smoke' }),
            sendMessage: (_msg, cb) => { if (typeof cb === 'function') cb({}); },
            onMessage: { addListener: (fn) => messageListeners.push(fn) },
            lastError: null
        },
        storage: {
            local: {
                get: (keys, cb) => {
                    const out = readOut(keys);
                    if (typeof cb === 'function') { cb(out); return undefined; }
                    return Promise.resolve(out);
                },
                set: (items, cb) => {
                    Object.assign(store, items);
                    if (typeof cb === 'function') { cb(); return undefined; }
                    return Promise.resolve();
                },
                remove: (keys, cb) => {
                    for (const key of normalizeKeys(keys)) delete store[key];
                    if (typeof cb === 'function') { cb(); return undefined; }
                    return Promise.resolve();
                }
            },
            session: {
                get: (_k, cb) => { const out = {}; if (typeof cb === 'function') { cb(out); return undefined; } return Promise.resolve(out); },
                set: (_i, cb) => { if (typeof cb === 'function') { cb(); return undefined; } return Promise.resolve(); }
            },
            onChanged: { addListener: (fn) => changeListeners.push(fn) }
        },
        i18n: { getMessage: () => '' },
        permissions: {
            contains: (_p, cb) => { if (typeof cb === 'function') cb(false); },
            onAdded: { addListener() {} },
            onRemoved: { addListener() {} }
        }
    };
    globalThis.__ytkitSmoke = {
        openPanel() {
            let dispatched = 0;
            for (const listener of messageListeners) {
                try { listener({ type: 'YTKIT_OPEN_PANEL' }, {}, () => {}); dispatched += 1; }
                catch (err) { console.warn('smoke openPanel listener failed', err); }
            }
            return dispatched;
        },
        listenerCount: () => messageListeners.length
    };
})();
`;

const IN_PAGE_CHECKS = `(() => {
    const PANEL_SELECTOR = ${JSON.stringify(PANEL_SELECTOR)};
    const failures = [];
    const panel = document.querySelector(PANEL_SELECTOR);
    if (!panel) return JSON.stringify({ failures: ['settings overlay root not found (' + PANEL_SELECTOR + ')'] });
    const rect = panel.getBoundingClientRect();
    const controls = panel.querySelectorAll('button, input, select, textarea, [role="tab"]');
    if (rect.width < 280 || rect.height < 300) {
        failures.push('blank/collapsed render: panel rect ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
    }
    if (controls.length < 10) {
        failures.push('blank render: only ' + controls.length + ' interactive controls inside the panel');
    }
    if (rect.left < -1 || rect.right > window.innerWidth + 1) {
        failures.push('horizontal overflow: panel spans ' + Math.round(rect.left) + '..' + Math.round(rect.right) + ' in a ' + window.innerWidth + 'px viewport');
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
        failures.push('document horizontal overflow: scrollWidth ' + document.documentElement.scrollWidth + ' > viewport ' + window.innerWidth);
    }
    if (window.innerWidth <= 560) {
        const sidebarRect = panel.querySelector('.ytkit-sidebar')?.getBoundingClientRect();
        const footerRect = panel.querySelector('.ytkit-footer')?.getBoundingClientRect();
        const firstNavRect = panel.querySelector('.ytkit-nav-btn')?.getBoundingClientRect();
        if (sidebarRect && sidebarRect.height > 96) failures.push('mobile navigation consumes ' + Math.round(sidebarRect.height) + 'px (>96px)');
        if (footerRect && footerRect.height > 180) failures.push('mobile footer consumes ' + Math.round(footerRect.height) + 'px (>180px)');
        if (firstNavRect && (firstNavRect.width < 140 || firstNavRect.height < 44)) {
            failures.push('mobile navigation target is clipped at ' + Math.round(firstNavRect.width) + 'x' + Math.round(firstNavRect.height));
        }
    }
    const closeCandidates = Array.from(panel.querySelectorAll('button')).filter((btn) => {
        const label = ((btn.getAttribute('aria-label') || '') + ' ' + (btn.textContent || '')).toLowerCase();
        return label.includes('close');
    });
    const visibleClose = closeCandidates.find((btn) => {
        const r = btn.getBoundingClientRect();
        return r.width >= 20 && r.height >= 20 && getComputedStyle(btn).visibility !== 'hidden';
    });
    if (!visibleClose) failures.push('no visible close target (>=20px, labeled "close") inside the panel');
    if (!panel.contains(document.activeElement)) {
        failures.push('focus is not inside the panel (activeElement=' + (document.activeElement && document.activeElement.tagName) + ')');
    }
    const parseRgb = (value) => {
        const m = String(value || '').match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const parts = m[1].split(',').map((x) => parseFloat(x));
        if (parts.length >= 4 && parts[3] === 0) return null;
        return parts.slice(0, 3);
    };
    const luminance = (rgb) => {
        const [r, g, b] = rgb.map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const effectiveBackground = (el) => {
        let node = el;
        while (node && node !== document.documentElement) {
            const bg = parseRgb(getComputedStyle(node).backgroundColor);
            if (bg) return bg;
            node = node.parentElement;
        }
        return document.documentElement.hasAttribute('dark') ? [15, 15, 15] : [255, 255, 255];
    };
    const primary = panel.querySelector('h1, h2, h3, [class*="title"]') || panel.querySelector('button');
    if (primary) {
        const fg = parseRgb(getComputedStyle(primary).color);
        if (fg) {
            const bg = effectiveBackground(primary);
            const l1 = luminance(fg);
            const l2 = luminance(bg);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (ratio < 4.5) {
                failures.push('primary control contrast ' + ratio.toFixed(2) + ':1 < 4.5:1 (' + getComputedStyle(primary).color + ' on rgb(' + bg.join(',') + '))');
            }
        }
    }
    return JSON.stringify({ failures, controls: controls.length, rect: { w: Math.round(rect.width), h: Math.round(rect.height) } });
})()`;

function buildFixture(stageDir, { fallbackOnly = false } = {}) {
    copyDir(EXT_DIR, stageDir);
    fs.writeFileSync(path.join(stageDir, 'chrome-stub.js'), CHROME_STUB, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8'));
    const isolatedGroup = (manifest.content_scripts || []).find((group) =>
        Array.isArray(group.js) && group.js.includes('ytkit.js') && !group.js.includes('ytkit-main.js') && !group.all_frames);
    if (!isolatedGroup) throw new Error('could not locate the ISOLATED-world content-script group in manifest.json');
    const isolatedScripts = fallbackOnly
        ? isolatedGroup.js.filter((src) => src !== 'features/settings-panel/index.js')
        : isolatedGroup.js;
    const scriptTags = ['chrome-stub.js', ...isolatedScripts]
        .map((src) => `    <script src="${src}"></script>`)
        .join('\n');
    const html = `<!DOCTYPE html>
<html lang="en" dark>
<head>
<meta charset="utf-8">
<title>Astra Deck settings overlay smoke fixture</title>
<style>body{margin:0;background:#0f0f0f;font-family:Roboto,system-ui,sans-serif;}</style>
</head>
<body>
    <div id="fixture-note" style="color:#666;padding:16px;">settings overlay smoke fixture</div>
${scriptTags}
</body>
</html>
`;
    const fixturePath = path.join(stageDir, 'fixture.html');
    fs.writeFileSync(fixturePath, html, 'utf8');
    return fixturePath;
}

function httpGetJson(url, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
            });
        });
        req.on('timeout', () => req.destroy(new Error('devtools http timeout')));
        req.on('error', reject);
    });
}

class DevtoolsClient {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message || 'devtools error'));
                else resolve(msg.result);
            }
        });
    }
    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`devtools call timed out: ${method}`));
                }
            }, 15000);
        });
    }
    async evaluate(expression) {
        const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) {
            throw new Error(`page evaluate failed: ${result.exceptionDetails.text || 'exception'}`);
        }
        return result.result?.value;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs, label) {
    const start = Date.now();
    for (;;) {
        const value = await fn();
        if (value) return value;
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
        await sleep(300);
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const browserPath = findBrowser(opts.browser);
    if (!browserPath) {
        console.error('[settings-overlay-smoke] no Chromium-family browser found; set CHROME_PATH/EDGE_PATH or pass --browser');
        process.exit(2);
    }

    const stageDir = path.join(REPO_ROOT, 'build', 'settings-overlay-smoke-stage');
    fs.rmSync(stageDir, { recursive: true, force: true });
    const fixturePath = buildFixture(stageDir, opts);
    const outDir = opts.fallbackOnly ? path.join(OUT_DIR, 'fallback') : OUT_DIR;
    fs.rmSync(outDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    fs.mkdirSync(outDir, { recursive: true });

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-overlay-smoke-'));
    const fixtureUrl = 'file:///' + fixturePath.split(path.sep).join('/');
    const browser = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        '--allow-file-access-from-files',
        `--user-data-dir=${profileDir}`,
        fixtureUrl
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderrBuf = '';
    const devtoolsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('browser did not expose a DevTools endpoint')), opts.timeoutMs);
        browser.stderr.on('data', (chunk) => {
            stderrBuf += chunk;
            const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        browser.on('exit', (code) => { clearTimeout(timer); reject(new Error(`browser exited early (code ${code})`)); });
    });

    const failuresByState = {};
    try {
        const port = new URL(devtoolsUrl).port;
        const pages = await waitFor(async () => {
            const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
            return list.find((entry) => entry.type === 'page' && String(entry.url || '').includes('fixture.html')) || null;
        }, opts.timeoutMs, 'the fixture page target');

        const ws = new WebSocket(pages.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const client = new DevtoolsClient(ws);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        // Surface page-side warnings/errors — a blank overlay almost always
        // leaves its cause in the console.
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }
            if (msg.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(msg.params?.type)) {
                const text = (msg.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
                console.error(`[page-console:${msg.params.type}] ${text.slice(0, 400)}`);
            }
            if (msg.method === 'Runtime.exceptionThrown') {
                const detail = msg.params?.exceptionDetails;
                console.error(`[page-exception] ${detail?.text || ''} ${detail?.exception?.description?.slice(0, 400) || ''}`);
            }
        });

        await waitFor(
            () => client.evaluate('Boolean(globalThis.__ytkitSmoke && globalThis.__ytkitSmoke.listenerCount() > 0)'),
            opts.timeoutMs,
            'the content-script stack to register its message listener'
        );

        for (const state of STATES) {
            await client.send('Emulation.setDeviceMetricsOverride', {
                width: state.width,
                height: state.height,
                deviceScaleFactor: 1,
                mobile: state.mobile
            });
            await client.evaluate(`(() => {
                document.documentElement.toggleAttribute('dark', ${state.dark});
                document.documentElement.setAttribute('dir', '${state.dir}');
                return true;
            })()`);
            await client.evaluate('globalThis.__ytkitSmoke.openPanel()');
            try {
                await waitFor(
                    () => client.evaluate(`Boolean(document.querySelector(${JSON.stringify(PANEL_SELECTOR)}))`),
                    opts.timeoutMs,
                    `the settings overlay in state ${state.name}`
                );
            } catch (err) {
                const diag = await client.evaluate(`JSON.stringify({
                    bodyClasses: document.body.className,
                    panelById: Boolean(document.getElementById('ytkit-settings-panel')),
                    overlayById: Boolean(document.getElementById('ytkit-overlay')),
                    ytkitIds: Array.from(document.querySelectorAll('[id^="ytkit"]')).map(el => el.id).slice(0, 20),
                    ytkitClasses: Array.from(new Set(Array.from(document.querySelectorAll('[class*="ytkit"]')).flatMap(el => Array.from(el.classList)))).slice(0, 30),
                    listenerCount: globalThis.__ytkitSmoke.listenerCount()
                })`).catch(() => 'diagnostics unavailable');
                console.error(`[settings-overlay-smoke] diagnostics: ${diag}`);
                throw err;
            }
            await client.evaluate(`(() => {
                const panel = document.querySelector(${JSON.stringify(PANEL_SELECTOR)});
                if (panel) panel.setAttribute('dir', '${state.dir}');
                return panel?.getAttribute('dir') || '';
            })()`);
            await sleep(600); // let fonts/layout settle before measuring
            const report = JSON.parse(await client.evaluate(IN_PAGE_CHECKS));
            failuresByState[state.name] = report.failures || [];

            const shot = await client.send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(outDir, `${state.name}.png`), Buffer.from(shot.data, 'base64'));
            console.log(`[settings-overlay-smoke:${opts.fallbackOnly ? 'fallback' : 'module'}] ${state.name}: ${report.rect?.w}x${report.rect?.h}, ${report.controls} controls, ${report.failures.length} failure(s)`);
        }
        ws.close();
    } finally {
        const browserExit = browser.exitCode !== null
            ? Promise.resolve()
            : new Promise((resolve) => browser.once('exit', resolve));
        browser.kill();
        await Promise.race([browserExit, sleep(3000)]);
        if (!opts.keepStage) fs.rmSync(stageDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
    }

    let failed = false;
    for (const [state, failures] of Object.entries(failuresByState)) {
        for (const failure of failures) {
            failed = true;
            console.error(`[settings-overlay-smoke] ${state}: ${failure}`);
        }
    }
    console.log(`[settings-overlay-smoke] screenshots: ${path.relative(REPO_ROOT, outDir).replace(/\\/g, '/')}`);
    if (failed) process.exit(1);
    console.log('[settings-overlay-smoke] PASS — all states rendered with close/focus targets and readable primary controls');
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[settings-overlay-smoke] ' + err.message);
        process.exit(1);
    });
}

module.exports = { STATES, PANEL_SELECTOR };
