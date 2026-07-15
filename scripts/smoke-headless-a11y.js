#!/usr/bin/env node
'use strict';

// Isolated rendered accessibility smoke for Astra Deck's primary surfaces.
// Chromium runs headlessly with a temporary profile; this script never opens
// or reuses the user's browser. It exercises real popup/side-panel documents
// plus the real injected settings, transcript, and download UI stacks.

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const WebSocket = require('ws');
const {
    buildFixture,
    DevtoolsClient,
    findBrowser,
    PANEL_SELECTOR,
    sleep,
    waitFor,
} = require('./smoke-settings-overlay.js');

const REPO_ROOT = path.join(__dirname, '..');
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const SURFACES = Object.freeze([
    Object.freeze({
        name: 'popup',
        page: 'popup-a11y.html',
        selector: 'body',
        ready: 'document.querySelectorAll("button, input, select, textarea").length >= 20',
        width: 420,
        height: 800,
        settleMs: 2200,
        themes: Object.freeze(['dark']),
    }),
    Object.freeze({
        name: 'sidepanel',
        page: 'sidepanel-a11y.html',
        selector: 'body',
        ready: 'document.querySelectorAll("button, input, select, textarea, [tabindex]").length >= 4',
        width: 420,
        height: 800,
        settleMs: 1000,
        themes: Object.freeze(['dark']),
    }),
    Object.freeze({
        name: 'settings',
        page: 'fixture.html',
        selector: PANEL_SELECTOR,
        ready: `Boolean(document.querySelector(${JSON.stringify(PANEL_SELECTOR)}))`,
        prepare: 'globalThis.__ytkitSmoke.openPanel()',
        width: 1280,
        height: 860,
        settleMs: 500,
        themes: Object.freeze(['dark', 'light']),
    }),
    Object.freeze({
        name: 'transcript',
        page: 'fixture.html',
        selector: '#ytkit-transcript-panel',
        ready: 'Boolean(document.querySelector("#ytkit-transcript-panel"))',
        width: 960,
        height: 800,
        settleMs: 300,
        themes: Object.freeze(['dark', 'light']),
    }),
    Object.freeze({
        name: 'download',
        page: 'fixture.html',
        selector: '.ytkit-dl-popup',
        ready: 'Boolean(document.querySelector(".ytkit-dl-popup"))',
        prepare: 'globalThis.__ytkitA11y.openDownload()',
        reopenEachState: true,
        width: 900,
        height: 700,
        settleMs: 300,
        themes: Object.freeze(['dark', 'light']),
    }),
]);

function parseArgs(argv) {
    const options = { browser: '', keepStage: false, timeoutMs: 45000 };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--browser') {
            options.browser = path.resolve(argv[++index] || '');
        } else if (arg === '--keep-stage') {
            options.keepStage = true;
        } else if (arg === '--timeout') {
            options.timeoutMs = Number(argv[++index]) || options.timeoutMs;
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    return options;
}

function injectChromeStub(stageDir, sourceName, targetName) {
    const source = fs.readFileSync(path.join(stageDir, sourceName), 'utf8');
    const patched = source.replace(
        /(<body\b[^>]*>)/i,
        '$1\n  <script src="chrome-stub.js"></script>'
    );
    if (patched === source) throw new Error(`Could not inject chrome stub into ${sourceName}.`);
    fs.writeFileSync(path.join(stageDir, targetName), patched, 'utf8');
}

function createStage(stageDir) {
    const fixturePath = buildFixture(stageDir);
    injectChromeStub(stageDir, 'popup.html', 'popup-a11y.html');
    injectChromeStub(stageDir, 'sidepanel.html', 'sidepanel-a11y.html');
    return fixturePath;
}

function fileUrl(filePath) {
    return `file:///${filePath.split(path.sep).join('/')}`;
}

function httpGetJson(url, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, { timeout: timeoutMs }, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('DevTools HTTP timeout')));
        request.on('error', reject);
    });
}

async function dispatchTab(client, shift = false) {
    const modifiers = shift ? 8 : 0;
    await client.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
        modifiers,
    });
    await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
        modifiers,
    });
}

function collectFocusableExpression(selector) {
    return `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        if (!root) return { error: 'surface root missing', tokens: [] };
        const focusSelector = ${JSON.stringify(FOCUSABLE_SELECTOR)};
        const isVisible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const closedDetails = element.closest('details:not([open])');
            return !element.closest('[hidden], [inert], [aria-hidden="true"]')
                && (!closedDetails || Boolean(element.closest('summary')))
                && element.tabIndex >= 0
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && (element.offsetParent !== null || style.position === 'fixed')
                && element.getClientRects().length > 0
                && rect.width > 0
                && rect.height > 0;
        };
        const nodes = Array.from(root.querySelectorAll(focusSelector)).filter(isVisible);
        nodes.forEach((node, index) => { node.dataset.astraA11yFocusId = String(index); });
        return {
            tokens: nodes.map((node) => node.dataset.astraA11yFocusId),
            labels: nodes.map((node) => node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.id || node.tagName),
            items: nodes.map((node) => {
                const rect = node.getBoundingClientRect();
                return {
                    label: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.id || node.tagName,
                    rect: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round)
                };
            }),
            candidates: Array.from(root.querySelectorAll(focusSelector)).slice(0, 8).map((node) => {
                const rect = node.getBoundingClientRect();
                const style = getComputedStyle(node);
                return {
                    label: node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.id || node.tagName,
                    rect: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round),
                    display: style.display,
                    visibility: style.visibility,
                    tabIndex: node.tabIndex,
                    offset: node.offsetParent !== null
                };
            }),
            root: {
                clientWidth: root.clientWidth,
                scrollWidth: root.scrollWidth,
                clientHeight: root.clientHeight,
                scrollHeight: root.scrollHeight,
                display: getComputedStyle(root).display,
                rect: (() => { const rect = root.getBoundingClientRect(); return [rect.left, rect.top, rect.right, rect.bottom].map(Math.round); })(),
                ancestors: (() => {
                    const values = [];
                    let node = root.parentElement;
                    while (node && values.length < 6) {
                        const rect = node.getBoundingClientRect();
                        values.push({
                            tag: node.tagName,
                            id: node.id || '',
                            display: getComputedStyle(node).display,
                            rect: [rect.left, rect.top, rect.right, rect.bottom].map(Math.round)
                        });
                        node = node.parentElement;
                    }
                    return values;
                })()
            },
            document: {
                clientWidth: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth
            }
        };
    })()`;
}

function focusStateExpression(selector) {
    return `(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        const active = document.activeElement;
        if (!root || !active || !root.contains(active)) return { inside: false };
        const rect = active.getBoundingClientRect();
        const left = Math.max(0, rect.left);
        const right = Math.min(window.innerWidth, rect.right);
        const top = Math.max(0, rect.top);
        const bottom = Math.min(window.innerHeight, rect.bottom);
        const points = right > left && bottom > top ? [
            [(left + right) / 2, (top + bottom) / 2],
            [left + 1, top + 1],
            [right - 1, top + 1],
            [left + 1, bottom - 1],
            [right - 1, bottom - 1]
        ] : [];
        const unobscured = points.some(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit && (hit === active || active.contains(hit) || hit.contains(active));
        });
        const style = getComputedStyle(active);
        const outlineVisible = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const shadowVisible = style.boxShadow && style.boxShadow !== 'none';
        return {
            inside: true,
            token: active.dataset.astraA11yFocusId || '',
            label: active.getAttribute('aria-label') || active.textContent?.trim().slice(0, 60) || active.id || active.tagName,
            focusVisible: active.matches(':focus-visible'),
            indicatorVisible: Boolean(outlineVisible || shadowVisible),
            unobscured,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        };
    })()`;
}

async function auditKeyboardPath(client, surface, stateName) {
    const inventory = await client.evaluate(collectFocusableExpression(surface.selector));
    if (inventory.error) throw new Error(`${surface.name}/${stateName}: ${inventory.error}`);
    if (!inventory.tokens.length) {
        throw new Error(
            `${surface.name}/${stateName}: no visible keyboard controls found; `
            + JSON.stringify({ root: inventory.root, candidates: inventory.candidates })
        );
    }
    if (inventory.root.scrollWidth > inventory.root.clientWidth + 1) {
        throw new Error(
            `${surface.name}/${stateName}: root horizontal overflow `
            + `${inventory.root.scrollWidth} > ${inventory.root.clientWidth}.`
        );
    }
    if (inventory.document.scrollWidth > inventory.document.clientWidth + 1) {
        throw new Error(
            `${surface.name}/${stateName}: document horizontal overflow `
            + `${inventory.document.scrollWidth} > ${inventory.document.clientWidth}.`
        );
    }

    // Establish keyboard modality before focusing the first surface control so
    // :focus-visible is evaluated exactly as it is for a Tab user.
    await dispatchTab(client);
    await client.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(surface.selector)});
        root?.querySelector('[data-astra-a11y-focus-id="0"]')?.focus();
    })()`);

    const visited = new Set();
    const visitedLabels = [];
    const failures = [];
    for (let index = 0; index < inventory.tokens.length + 3; index += 1) {
        const state = await client.evaluate(focusStateExpression(surface.selector));
        if (!state.inside) {
            if (visited.size === inventory.tokens.length) break;
            failures.push(`focus left surface after ${visited.size}/${inventory.tokens.length} controls`);
            break;
        }
        if (state.token) {
            if (!visited.has(state.token)) visitedLabels.push(state.label);
            visited.add(state.token);
        }
        if (!state.focusVisible || !state.indicatorVisible) {
            failures.push(`no visible keyboard focus indicator on ${state.label}`);
        }
        if (!state.unobscured) {
            const rect = state.rect || {};
            failures.push(
                `focused control is fully obscured or offscreen: ${state.label} `
                + `(${Math.round(rect.left || 0)},${Math.round(rect.top || 0)}..`
                + `${Math.round(rect.right || 0)},${Math.round(rect.bottom || 0)})`
            );
        }
        if (visited.size === inventory.tokens.length) break;
        await dispatchTab(client);
    }

    const missing = inventory.tokens.filter((token) => !visited.has(token));
    if (missing.length) {
        const labels = missing.slice(0, 8).map((token) => inventory.labels[Number(token)]);
        const geometry = missing.slice(0, 8).map((token) => inventory.items[Number(token)]?.rect);
        failures.push(
            `keyboard path skipped ${missing.length} control(s): ${labels.join(', ')} `
            + `(rects: ${JSON.stringify(geometry)}; root: ${JSON.stringify(inventory.root.rect)}; `
            + `(visited: ${visitedLabels.join(' -> ')})`
        );
    }
    if (failures.length) {
        throw new Error(`${surface.name}/${stateName}: ${failures.join('; ')}`);
    }
    return visited.size;
}

async function configureRenderedState(client, surface, theme, mode) {
    const zoomed = mode === 'zoom-200';
    const width = zoomed ? Math.max(200, Math.floor(surface.width / 2)) : surface.width;
    const height = zoomed ? Math.max(320, Math.floor(surface.height / 2)) : surface.height;
    await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: zoomed ? 2 : 1,
        mobile: false,
    });
    await client.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [
            { name: 'forced-colors', value: mode === 'forced-colors' ? 'active' : 'none' },
            { name: 'prefers-color-scheme', value: theme },
            { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
    });
    await client.evaluate(`(() => {
        document.documentElement.toggleAttribute('dark', ${theme === 'dark'});
        document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
        return true;
    })()`);
    await sleep(120);
    if (mode === 'forced-colors') {
        const active = await client.evaluate("matchMedia('(forced-colors: active)').matches");
        if (!active) throw new Error(`${surface.name}: Chromium did not activate forced-colors emulation.`);
    }
    return { width, height };
}

async function navigateToSurface(client, stageDir, surface, timeoutMs) {
    await client.send('Page.navigate', { url: fileUrl(path.join(stageDir, surface.page)) });
    await waitFor(
        () => client.evaluate("document.readyState === 'complete'"),
        timeoutMs,
        `${surface.name} document load`
    );
    if (surface.page === 'fixture.html') {
        await waitFor(
            () => client.evaluate('Boolean(globalThis.__ytkitSmoke?.listenerCount() > 0 && globalThis.__ytkitA11y)'),
            timeoutMs,
            `${surface.name} content-script fixture boot`
        );
    }
    if (surface.prepare) await client.evaluate(surface.prepare);
    await waitFor(
        () => client.evaluate(surface.ready),
        timeoutMs,
        `${surface.name} rendered surface`
    );
    await sleep(surface.settleMs || 300);
}

async function auditSurface(client, stageDir, surface, timeoutMs) {
    if (!surface.reopenEachState) {
        await navigateToSurface(client, stageDir, surface, timeoutMs);
    }
    const reports = [];
    for (const theme of surface.themes) {
        for (const mode of ['normal', 'zoom-200']) {
            let viewport = await configureRenderedState(client, surface, theme, mode);
            if (surface.reopenEachState) {
                await navigateToSurface(client, stageDir, surface, timeoutMs);
                viewport = await configureRenderedState(client, surface, theme, mode);
            }
            const controls = await auditKeyboardPath(client, surface, `${theme}/${mode}`);
            reports.push({ controls, mode, theme, viewport });
        }
    }
    let forcedViewport = await configureRenderedState(
        client,
        surface,
        surface.themes[0],
        'forced-colors'
    );
    if (surface.reopenEachState) {
        await navigateToSurface(client, stageDir, surface, timeoutMs);
        forcedViewport = await configureRenderedState(
            client,
            surface,
            surface.themes[0],
            'forced-colors'
        );
    }
    const forcedControls = await auditKeyboardPath(
        client,
        surface,
        `${surface.themes[0]}/forced-colors`
    );
    reports.push({
        controls: forcedControls,
        mode: 'forced-colors',
        theme: surface.themes[0],
        viewport: forcedViewport,
    });
    return reports;
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const browserPath = findBrowser(options.browser);
    if (!browserPath) throw new Error('No Chromium-family browser found. Pass --browser <path>.');

    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-headless-a11y-stage-'));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-headless-a11y-profile-'));
    const fixturePath = createStage(stageDir);
    const browser = spawn(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        '--allow-file-access-from-files',
        `--user-data-dir=${profileDir}`,
        fileUrl(fixturePath),
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    let stderr = '';
    const devtoolsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('Browser did not expose a DevTools endpoint.')),
            options.timeoutMs
        );
        browser.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
            const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        browser.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`Browser exited before the smoke began (code ${code}).`));
        });
    });

    let socket;
    try {
        const port = new URL(devtoolsUrl).port;
        const page = await waitFor(async () => {
            const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
            return targets.find((target) => target.type === 'page') || null;
        }, options.timeoutMs, 'headless accessibility page target');
        socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => {
            socket.once('open', resolve);
            socket.once('error', reject);
        });
        const client = new DevtoolsClient(socket);
        await client.send('Page.enable');
        await client.send('Runtime.enable');

        for (const surface of SURFACES) {
            const reports = await auditSurface(client, stageDir, surface, options.timeoutMs);
            const total = reports.reduce((sum, report) => sum + report.controls, 0);
            console.log(
                `[headless-a11y] ${surface.name}: ${reports.length} state(s), `
                + `${total} keyboard focus visits, no obscuring/overflow failures`
            );
        }
        console.log('[headless-a11y] PASS — normal, 200% reflow, themes, and forced colors');
    } finally {
        if (socket) socket.close();
        const browserExit = browser.exitCode !== null
            ? Promise.resolve()
            : new Promise((resolve) => browser.once('exit', resolve));
        browser.kill();
        await Promise.race([browserExit, sleep(3000)]);
        if (browser.exitCode === null && browser.pid) {
            if (process.platform === 'win32') {
                try {
                    execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], {
                        stdio: 'ignore',
                        windowsHide: true,
                    });
                } catch (_) { /* reason: browser may exit between the state check and taskkill */ }
            } else {
                browser.kill('SIGKILL');
            }
        }
        if (!options.keepStage) fs.rmSync(stageDir, { recursive: true, force: true });
        fs.rmSync(profileDir, { recursive: true, force: true });
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`[headless-a11y] ${error.message || error}`);
        process.exit(1);
    });
}

module.exports = {
    auditKeyboardPath,
    collectFocusableExpression,
    configureRenderedState,
    createStage,
    FOCUSABLE_SELECTOR,
    focusStateExpression,
    parseArgs,
    SURFACES,
};
