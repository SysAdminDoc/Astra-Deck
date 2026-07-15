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
const { execFileSync, spawn } = require('child_process');
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
    { name: 'tablet-dark', width: 760, height: 900, dark: true, dir: 'ltr', mobile: false },
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
    store.ytSuiteSettings = { transcriptViewer: true };
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
    const settle = (value, cb) => {
        if (typeof cb === 'function') { cb(value); return undefined; }
        return Promise.resolve(value);
    };
    const storageArea = {
        get: (keys, cb) => settle(readOut(keys), cb),
        set: (items, cb) => { Object.assign(store, items); return settle(undefined, cb); },
        remove: (keys, cb) => {
            for (const key of normalizeKeys(keys)) delete store[key];
            return settle(undefined, cb);
        },
        clear: (cb) => {
            for (const key of Object.keys(store)) delete store[key];
            return settle(undefined, cb);
        },
        getBytesInUse: (_keys, cb) => settle(JSON.stringify(store).length, cb)
    };
    const noOpEvent = { addListener() {}, removeListener() {} };
    globalThis.chrome = {
        runtime: {
            id: 'ytkit-smoke-fixture',
            getURL: (p) => p,
            getManifest: () => ({ version: '0.0.0-smoke' }),
            sendMessage: (_msg, cb) => settle({}, cb),
            onMessage: {
                addListener: (fn) => messageListeners.push(fn),
                removeListener: (fn) => {
                    const index = messageListeners.indexOf(fn);
                    if (index >= 0) messageListeners.splice(index, 1);
                }
            },
            lastError: null
        },
        storage: {
            local: storageArea,
            session: storageArea,
            onChanged: { addListener: (fn) => changeListeners.push(fn) }
        },
        i18n: {
            getMessage: () => '',
            getUILanguage: () => document.documentElement.dir === 'rtl' ? 'ar' : 'en'
        },
        permissions: {
            contains: (_p, cb) => settle(false, cb),
            getAll: (cb) => settle({ origins: [], permissions: [] }, cb),
            request: (_p, cb) => settle(false, cb),
            remove: (_p, cb) => settle(true, cb),
            onAdded: noOpEvent,
            onRemoved: noOpEvent
        },
        tabs: {
            query: (_q, cb) => settle([], cb),
            sendMessage: (_id, _msg, cb) => settle({}, cb),
            create: (_opts, cb) => settle({ id: 1 }, cb)
        },
        sidePanel: { open: (_opts, cb) => settle(undefined, cb) },
        downloads: { download: (_opts, cb) => settle(1, cb) },
        action: { openPopup: (cb) => settle(undefined, cb) },
        extension: { inIncognitoContext: false }
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
    const headerSearch = panel.querySelector('.ytkit-header > .ytkit-command-search #ytkit-search');
    const liveBadge = panel.querySelector('.ytkit-header-live');
    const sidebarFooter = panel.querySelector('.ytkit-sidebar > .ytkit-sidebar-footer');
    const footerActions = panel.querySelectorAll('.ytkit-footer-actions > button');
    const historyImport = panel.querySelector('.ytkit-insights #ytkit-import-history');
    const obsoleteVersionBadge = panel.querySelector('#ytkit-whats-new-badge');
    if (!headerSearch) failures.push('command search is not mounted in the header');
    if (!liveBadge || getComputedStyle(liveBadge).display === 'none') failures.push('live connection badge is not visible');
    if (!sidebarFooter) failures.push('version and project tools are not mounted in the sidebar footer');
    if (footerActions.length !== 4) failures.push('footer action parity expected 4 buttons, found ' + footerActions.length);
    if (!historyImport) failures.push('history import action is not mounted in the insights rail');
    if (obsoleteVersionBadge) failures.push('obsolete version notification badge is visible');
    if (panel.getAttribute('dir') === 'rtl' && headerSearch) {
        const searchIcon = panel.querySelector('.ytkit-command-search .ytkit-search-icon');
        const searchActions = panel.querySelector('.ytkit-command-search .ytkit-search-actions');
        const inputRect = headerSearch.getBoundingClientRect();
        const iconRect = searchIcon?.getBoundingClientRect();
        const actionsRect = searchActions?.getBoundingClientRect();
        if (!iconRect || iconRect.left < inputRect.left + (inputRect.width / 2)) {
            failures.push('RTL search icon is not anchored to the input start edge');
        }
        if (!actionsRect || actionsRect.right > inputRect.left + (inputRect.width / 2)) {
            failures.push('RTL search actions are not anchored to the input end edge');
        }
        if (iconRect && actionsRect && iconRect.left < actionsRect.right && iconRect.right > actionsRect.left) {
            failures.push('RTL search icon overlaps its actions');
        }
    }
    for (const id of ['ytkit-export', 'ytkit-import', 'ytkit-import-history', 'ytkit-reset-active-section', 'ytkit-close-footer']) {
        if (panel.querySelectorAll('#' + id).length !== 1) failures.push(id + ' must render exactly once');
    }
    const blueLightToggle = panel.querySelector('#ytkit-toggle-blueLightFilter');
    const blueLightIntensity = panel.querySelector('#ytkit-range-blueLightIntensity');
    const blueLightSubFeatures = blueLightIntensity?.closest('.ytkit-sub-features');
    if (!blueLightToggle) failures.push('Blue Light Filter master toggle is missing from the main settings overlay');
    if (!blueLightIntensity) failures.push('Blue Light Intensity range is missing from the main settings overlay');
    if (blueLightToggle?.checked) failures.push('Blue Light Filter must render disabled by default');
    if (blueLightSubFeatures?.dataset.parentId !== 'blueLightFilter') {
        failures.push('Blue Light Intensity must be nested under the Blue Light Filter toggle');
    }
    if (blueLightIntensity && !blueLightIntensity.disabled) {
        failures.push('Blue Light Intensity must stay disabled while the master toggle is off');
    }
    const activeTab = panel.querySelector('.ytkit-nav-btn.active');
    const activePane = activeTab ? panel.querySelector('#ytkit-pane-' + activeTab.dataset.tab) : null;
    if (!activeTab || activeTab.getAttribute('role') !== 'tab' || activeTab.getAttribute('aria-selected') !== 'true') {
        failures.push('active category does not expose selected tab semantics');
    }
    if (!activePane || activePane.getAttribute('role') !== 'tabpanel' || activePane.getAttribute('aria-hidden') !== 'false') {
        failures.push('active settings pane does not expose visible tabpanel semantics');
    }
    const disabledSubFeatures = panel.querySelector('.ytkit-sub-features[aria-disabled="true"]');
    if (!disabledSubFeatures || !disabledSubFeatures.hasAttribute('inert')) {
        failures.push('disabled sub-features are not removed from keyboard interaction');
    } else if (Array.from(disabledSubFeatures.querySelectorAll('input, select, textarea, button')).some((control) => !control.disabled)) {
        failures.push('disabled sub-feature controls remain operable');
    }
    if (window.innerWidth <= 560) {
        const sidebarRect = panel.querySelector('.ytkit-sidebar')?.getBoundingClientRect();
        const navListRect = panel.querySelector('.ytkit-nav-list')?.getBoundingClientRect();
        const footerRect = panel.querySelector('.ytkit-footer')?.getBoundingClientRect();
        const firstNavRect = panel.querySelector('.ytkit-nav-btn')?.getBoundingClientRect();
        if (sidebarRect && sidebarRect.height > 96) failures.push('mobile navigation consumes ' + Math.round(sidebarRect.height) + 'px (>96px)');
        if (navListRect && navListRect.width < Math.min(320, panel.clientWidth - 24)) {
            failures.push('mobile navigation viewport collapses to ' + Math.round(navListRect.width) + 'px');
        }
        if (footerRect && footerRect.height > 180) failures.push('mobile footer consumes ' + Math.round(footerRect.height) + 'px (>180px)');
        if (firstNavRect && (firstNavRect.width < 140 || firstNavRect.height < 44 || firstNavRect.right <= 96)) {
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

const SCROLLED_HEADER_CHECKS = `(() => {
    const failures = [];
    const content = document.querySelector('#ytkit-settings-panel .ytkit-content');
    const header = document.querySelector('#ytkit-settings-panel .ytkit-pane.active .ytkit-pane-header');
    if (!content || !header) {
        return JSON.stringify({ failures: ['could not stage sticky section header scroll check'] });
    }
    const style = getComputedStyle(header);
    const color = String(style.backgroundColor || '');
    const rgba = color.match(/rgba?\\(([^)]+)\\)/);
    const alpha = rgba && rgba[1].split(',').length >= 4
        ? Number(rgba[1].split(',')[3])
        : (rgba ? 1 : 0);
    if (style.position !== 'sticky') {
        failures.push('section header is not sticky after scrolling');
    }
    if (!Number.isFinite(alpha) || alpha < 0.98) {
        failures.push('sticky section header background is not opaque after scrolling (' + color + ')');
    }
    if (Number(style.zIndex) < 2) {
        failures.push('sticky section header does not stack above scrolling controls');
    }
    const contentRect = content.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    if (headerRect.top < contentRect.top - 1 || headerRect.top > contentRect.top + 32) {
        failures.push('sticky section header escaped its scroll viewport (header ' + Math.round(headerRect.top) + ', content ' + Math.round(contentRect.top) + ')');
    }
    return JSON.stringify({ failures });
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
    const scriptTags = ['chrome-stub.js', ...isolatedScripts, 'a11y-fixture-driver.js']
        .map((src) => `    <script src="${src}"></script>`)
        .join('\n');
    fs.writeFileSync(path.join(stageDir, 'a11y-fixture-driver.js'), `'use strict';
(() => {
    const anchor = document.getElementById('fixture-download-anchor');
    const factory = globalThis.YTKitFeatures?.createDownloadUIFeature;
    const downloadUi = typeof factory === 'function' ? factory({
        appState: { settings: {} },
        extensionFetchJson: async () => ({ data: null }),
        t: (_key, fallback) => fallback
    }) : null;
    globalThis.__ytkitA11y = {
        openDownload() {
            if (!downloadUi) return false;
            downloadUi.showDownloadPopup(anchor);
            return Boolean(document.querySelector('.ytkit-dl-popup'));
        }
    };
})();
`, 'utf8');
    const html = `<!DOCTYPE html>
<html lang="en" dark>
<head>
<meta charset="utf-8">
<title>Astra Deck settings overlay smoke fixture</title>
<script>
if (new URLSearchParams(location.search).get('theme') === 'light') {
    document.documentElement.removeAttribute('dark');
}
</script>
<style>
body{margin:0;background:#0f0f0f;color:#e5e7eb;font-family:Roboto,system-ui,sans-serif;}
html:not([dark]) body{background:#f7f8fa;color:#17202b;}
</style>
</head>
<body>
    <div id="fixture-note" style="color:#666;padding:16px;">settings overlay smoke fixture</div>
    <ytd-watch-flexy>
        <div id="top-level-buttons-computed"></div>
        <div id="secondary"></div>
    </ytd-watch-flexy>
    <button id="fixture-download-anchor" type="button">Download fixture</button>
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
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

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
                document.querySelector(${JSON.stringify(PANEL_SELECTOR)})?.remove();
                document.getElementById('ytkit-overlay')?.remove();
                document.body.classList.remove('ytkit-panel-open');
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
            const renderedDir = await client.evaluate(`document.querySelector(${JSON.stringify(PANEL_SELECTOR)})?.getAttribute('dir') || ''`);
            const directionFailures = renderedDir === state.dir
                ? []
                : [`panel direction ${renderedDir || 'missing'} != ${state.dir}`];
            await sleep(600); // let fonts/layout settle before measuring
            const report = JSON.parse(await client.evaluate(IN_PAGE_CHECKS));
            failuresByState[state.name] = [...directionFailures, ...(report.failures || [])];

            const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            fs.writeFileSync(path.join(outDir, `${state.name}.png`), Buffer.from(shot.data, 'base64'));
            if (['desktop-dark', 'desktop-light'].includes(state.name)) {
                const categoryIds = await client.evaluate(`Array.from(
                    document.querySelectorAll('.ytkit-nav-btn[data-tab]'),
                    (tab) => tab.dataset.tab
                )`);
                for (const categoryId of categoryIds) {
                    const staged = await client.evaluate(`(() => {
                        const tab = document.querySelector('.ytkit-nav-btn[data-tab=${JSON.stringify(categoryId)}]');
                        if (!tab) return false;
                        tab.click();
                        window.scrollTo(0, 0);
                        const content = document.querySelector('.ytkit-content');
                        if (content) content.scrollTop = 0;
                        return true;
                    })()`);
                    if (!staged) {
                        failuresByState[state.name].push(`could not stage category ${categoryId}`);
                        continue;
                    }
                    await sleep(120);
                    const categorySlug = String(categoryId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    if (!opts.fallbackOnly) {
                        await client.evaluate('window.scrollTo(0, 0)');
                        const categoryShot = await client.send('Page.captureScreenshot', {
                            format: 'png',
                            captureBeyondViewport: false
                        });
                        fs.writeFileSync(
                            path.join(outDir, `${state.name}-category-${categorySlug}.png`),
                            Buffer.from(categoryShot.data, 'base64')
                        );
                    }

                    const scrollState = await client.evaluate(`(() => {
                        const content = document.querySelector('#ytkit-settings-panel .ytkit-content');
                        if (!content) return { found: false, scrollable: false, scrollTop: 0 };
                        const maxScroll = Math.max(0, content.scrollHeight - content.clientHeight);
                        content.scrollTop = Math.min(220, maxScroll);
                        return {
                            found: true,
                            scrollable: maxScroll > 0,
                            scrollTop: content.scrollTop
                        };
                    })()`);
                    if (!scrollState?.found) {
                        failuresByState[state.name].push(`could not find scroll viewport for category ${categoryId}`);
                        continue;
                    }
                    if (scrollState.scrollable && scrollState.scrollTop <= 0) {
                        failuresByState[state.name].push(`could not scroll category ${categoryId} for sticky header proof`);
                        continue;
                    }
                    await sleep(120);
                    const scrolledReport = JSON.parse(await client.evaluate(SCROLLED_HEADER_CHECKS));
                    failuresByState[state.name].push(
                        ...(scrolledReport.failures || []).map((failure) => `${categoryId}: ${failure}`)
                    );
                    const scrolledShot = await client.send('Page.captureScreenshot', {
                        format: 'png',
                        captureBeyondViewport: false
                    });
                    fs.writeFileSync(
                        path.join(outDir, `${state.name}-category-${categorySlug}-scrolled-header.png`),
                        Buffer.from(scrolledShot.data, 'base64')
                    );
                }
            }
            if (state.name === 'desktop-dark' && !opts.fallbackOnly) {
                const featureReady = await client.evaluate(`(() => {
                    const toggle = document.getElementById('ytkit-toggle-blueLightFilter');
                    const intensity = document.getElementById('ytkit-range-blueLightIntensity');
                    const pane = toggle?.closest('.ytkit-pane');
                    const tab = pane ? document.querySelector('.ytkit-nav-btn[data-tab="' + pane.id.replace('ytkit-pane-', '') + '"]') : null;
                    if (!toggle || !intensity || !tab) return false;
                    tab.click();
                    toggle.closest('.ytkit-feature-card')?.scrollIntoView({ block: 'center' });
                    return true;
                })()`);
                if (!featureReady) failuresByState[state.name].push('could not stage the Blue Light Filter visual proof');
                await sleep(300);
                const featureShot = await client.send('Page.captureScreenshot', {
                    format: 'png',
                    captureBeyondViewport: false
                });
                fs.writeFileSync(path.join(outDir, 'blue-light-default.png'), Buffer.from(featureShot.data, 'base64'));
            }
            console.log(`[settings-overlay-smoke:${opts.fallbackOnly ? 'fallback' : 'module'}] ${state.name}: ${report.rect?.w}x${report.rect?.h}, ${report.controls} controls, ${failuresByState[state.name].length} failure(s)`);
        }
        ws.close();
    } finally {
        const browserExit = browser.exitCode !== null
            ? Promise.resolve()
            : new Promise((resolve) => browser.once('exit', resolve));
        browser.kill();
        await Promise.race([browserExit, sleep(3000)]);
        if (browser.exitCode === null && browser.pid) {
            if (process.platform === 'win32') {
                try {
                    execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
                } catch (_) { /* reason: browser may have exited between the state check and taskkill */ }
            } else {
                browser.kill('SIGKILL');
            }
            await Promise.race([browserExit, sleep(2000)]);
        }
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

module.exports = {
    buildFixture,
    CHROME_STUB,
    SCROLLED_HEADER_CHECKS,
    DevtoolsClient,
    findBrowser,
    PANEL_SELECTOR,
    sleep,
    STATES,
    waitFor,
};
