#!/usr/bin/env node
'use strict';

// Ground-truth probe for the settings-panel palette.
//
// The panel's CSS is spread across five appendStyleSheet() layers, two of them
// injected lazily on first panel build. Source order in ytkit.js is therefore
// NOT cascade order at runtime, and reading the file tells you nothing about
// which declaration actually wins. This opens the real panel in a headless
// Chromium and reports the computed background of each surface plus the
// stylesheet that supplied it.
//
// Usage: node scripts/probe-panel-colors.js

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const {
    buildFixture, DevtoolsClient, findBrowser, PANEL_SELECTOR, sleep, waitFor
} = require('./smoke-settings-overlay.js');

const REPO_ROOT = path.join(__dirname, '..');

const TARGETS = [
    ['panel shell', '#ytkit-settings-panel'],
    ['sidebar', '.ytkit-sidebar'],
    ['content column', '.ytkit-content'],
    ['feature card', '.ytkit-feature-card'],
    ['enabled card', '.ytkit-feature-card.ytkit-card-enabled'],
    ['sub card', '.ytkit-sub-card'],
    ['nav button (active)', '.ytkit-nav-btn.active'],
];

function httpGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 3000 }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

async function main() {
    const browserPath = findBrowser('');
    if (!browserPath) { console.error('no Chromium-family browser found'); process.exit(2); }

    const stageDir = path.join(REPO_ROOT, 'build', 'panel-color-probe-stage');
    fs.rmSync(stageDir, { recursive: true, force: true });
    const fixturePath = buildFixture(stageDir, {});
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-panel-probe-'));

    const browser = spawn(browserPath, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        // runtime-bootstrap.js pulls the runtime module graph in by URL. Without
        // this the imports are cross-origin against a file:// page, every module
        // fails silently, and __ytkitSmoke never appears. The overlay smoke has
        // always passed it; this copy did not.
        '--allow-file-access-from-files',
        // Three slashes, not two. `file://C:/...` parses `C:` as the URL's HOST,
        // so Chrome opened a page whose entry still matched 'fixture.html' while
        // nothing on it ever executed, and the probe died 45s later at "timed out
        // waiting for the content-script stack". The overlay smoke has always
        // built this correctly; this is the copy that drifted.
        '--window-size=1356,920', `file:///${fixturePath.split(path.sep).join('/')}`
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    let stderrBuf = '';
    const devtoolsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no DevTools endpoint')), 45000);
        browser.stderr.on('data', (chunk) => {
            stderrBuf += chunk;
            const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (m) { clearTimeout(timer); resolve(m[1]); }
        });
        browser.on('exit', (code) => { clearTimeout(timer); reject(new Error(`browser exited (${code})`)); });
    });

    try {
        const port = new URL(devtoolsUrl).port;
        const page = await waitFor(async () => {
            const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
            return list.find((e) => e.type === 'page' && String(e.url || '').includes('fixture.html')) || null;
        }, 45000, 'the fixture page');

        const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
        const client = new DevtoolsClient(ws);
        await client.send('Page.enable');
        await client.send('Runtime.enable');

        await waitFor(
            () => client.evaluate('Boolean(globalThis.__ytkitSmoke && globalThis.__ytkitSmoke.listenerCount() > 0)'),
            45000, 'the content-script stack'
        );
        await client.evaluate('globalThis.__ytkitSmoke.openPanel()');
        await waitFor(
            () => client.evaluate(`Boolean(document.querySelector(${JSON.stringify(PANEL_SELECTOR)}))`),
            45000, 'the panel'
        );
        await sleep(600);

        const report = await client.evaluate(`(() => {
            const targets = ${JSON.stringify(TARGETS)};
            const sheets = Array.from(document.querySelectorAll('style'));
            const out = { sheetCount: sheets.length, rows: [] };
            for (const [label, selector] of targets) {
                const el = document.querySelector(selector);
                if (!el) { out.rows.push({ label, selector, missing: true }); continue; }
                const cs = getComputedStyle(el);
                // Walk every <style> in document order and record which ones
                // carry a background declaration for this selector — the LAST
                // matching sheet is the one that wins on equal specificity.
                const carriers = [];
                sheets.forEach((s, i) => {
                    let rules;
                    try { rules = Array.from(s.sheet ? s.sheet.cssRules : []); } catch { return; }
                    const scan = (list, media) => {
                        for (const r of list) {
                            if (r.cssRules && r.conditionText !== undefined) { scan(Array.from(r.cssRules), r.conditionText); continue; }
                            if (!r.selectorText || !r.style) continue;
                            if (!r.style.background && !r.style.backgroundColor && !r.style.backgroundImage) continue;
                            if (r.selectorText.split(',').some((sel) => sel.trim() === selector)) {
                                carriers.push({ sheet: i, media: media || null, value: (r.style.background || r.style.backgroundColor || r.style.backgroundImage).slice(0, 90) });
                            }
                        }
                    };
                    scan(rules, null);
                });
                out.rows.push({
                    label, selector,
                    backgroundColor: cs.backgroundColor,
                    borderColor: cs.borderTopColor,
                    boxShadow: cs.boxShadow.slice(0, 80),
                    carriers
                });
            }
            out.bgBaseToken = getComputedStyle(document.documentElement).getPropertyValue('--ytkit-bg-base').trim();
            out.mutedToken = getComputedStyle(document.documentElement).getPropertyValue('--ytkit-text-muted').trim();
            return out;
        })()`);

        console.log(`stylesheets in document: ${report.sheetCount}`);
        console.log(`--ytkit-bg-base = ${report.bgBaseToken || '(unset)'}`);
        console.log(`--ytkit-text-muted = ${report.mutedToken || '(unset)'}\n`);
        for (const row of report.rows) {
            if (row.missing) { console.log(`${row.label.padEnd(20)} MISSING (${row.selector})`); continue; }
            console.log(`${row.label.padEnd(20)} bg=${row.backgroundColor}  border=${row.borderColor}`);
            if (row.boxShadow && row.boxShadow !== 'none') console.log(`${''.padEnd(20)} shadow=${row.boxShadow}`);
            for (const c of row.carriers) {
                console.log(`${''.padEnd(22)}sheet#${c.sheet}${c.media ? ` @${c.media}` : ''}: ${c.value}`);
            }
            console.log('');
        }
    } finally {
        browser.kill();
        await sleep(300);
        // A cleanup failure must not replace the error that got us here. Chrome's
        // children can still hold the profile directory on Windows, and an EPERM
        // thrown from this finally block overwrote the real diagnostic with a
        // temp-path permission error that pointed nowhere.
        for (const [label, dir] of [['stage', stageDir], ['profile', profileDir]]) {
            try {
                fs.rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
            } catch (error) {
                console.warn(`[panel-color-probe] could not remove the disposable ${label} directory ${dir}: ${error.message}`);
            }
        }
    }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
