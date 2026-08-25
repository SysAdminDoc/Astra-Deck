#!/usr/bin/env node
'use strict';

// Computed-contrast proof for the surfaces the shared surface system repaints.
//
// `scripts/check-light-theme-lane.js` reads source text. It cannot resolve a
// cascade, so it cannot answer the only question that matters here: with every
// shipped stylesheet loaded and `html` in light theme, what colour does the
// browser actually paint, and against what. That gap is what let the Digital
// Wellbeing card ship at about 1.05:1 while the gate was green.
//
// This renders the real stylesheets in Chromium, builds one element per relit
// selector inside the surface that owns it, and reads getComputedStyle for
// both the foreground and the composited background, in dark AND light. Every
// row has to clear the WCAG AA floor for its size class in both themes.
//
// Usage: node scripts/probe-light-surfaces.js [--json]

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { DevtoolsClient, findBrowser, sleep, waitFor } = require('./smoke-settings-overlay.js');

const REPO_ROOT = path.join(__dirname, '..');
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

// [panel selector, child selector, label, isLargeText]
// The panel is the element the surface system forces its background onto; the
// child is what the relight had to fix. Rendering the child INSIDE the panel is
// the point: the bug was the pairing, not either rule alone.
const CASES = [
    ['ytkit-wellbeing-card', 'ytkit-wellbeing-title', 'Wellbeing title', true],
    ['ytkit-wellbeing-card', 'ytkit-wellbeing-msg', 'Wellbeing message', false],
    ['ytkit-wellbeing-card', 'ytkit-wellbeing-hint', 'Wellbeing hint', false],
    ['ytkit-wellbeing-card', 'ytkit-wellbeing-eyebrow', 'Wellbeing eyebrow', false],
    ['ytkit-wellbeing-card', 'ytkit-wellbeing-badge', 'Wellbeing badge', false],
    ['ytkit-transcript-search-panel', 'ytkit-transcript-search-panel__footer', 'Transcript search footer', false],
    ['ytkit-stream-links-panel', 'ytkit-stream-links-panel__warn', 'Stream links warning', false],
    ['ytkit-dl-popup', 'ytkit-dl-progress__title', 'Download progress title', false],
    ['ytkit-dl-popup', 'ytkit-dl-progress__stat', 'Download progress stat', false],
    ['ytkit-dl-popup', 'ytkit-dl-progress__status-copy', 'Download progress status', false],
    ['ytkit-bookmarks-container', 'ytkit-bookmarks-title', 'Bookmarks title', false],
    ['ytkit-bookmarks-container', 'ytkit-bookmarks-status', 'Bookmarks status', false],
    ['ytkit-bookmarks-container', 'ytkit-bookmark-note-label', 'Bookmark note label', false],
    ['ytkit-vvf-panel', 'ytkit-vvf-val', 'Video filter value', false],
    ['ytkit-rc-panel', 'ytkit-rc-head', 'Replay chat heading', false],
    ['ytkit-wha-card', 'ytkit-wha-lbl', 'Watch history label', false],
    ['ytkit-speed-popup', 'ytkit-speed-popup__header', 'Speed popup header', false],
    ['ytkit-speed-popup', 'ytkit-speed-popup__item', 'Speed popup item', false],
    ['ytkit-speed-popup', 'ytkit-speed-popup__sub', 'Speed popup sub', false],
    ['ytkit-blocked-watch-dialog', 'ytkit-blocked-watch-channel', 'Blocked watch channel', false],
    ['ytkit-transcript-batch-panel', 'ytkit-transcript-batch-meta', 'Transcript batch meta', false],
    ['ytkit-sub-group-dialog__card', 'ytkit-subs-load-banner__eyebrow', 'Subs banner eyebrow', false]
];

// Every stylesheet that contributes to these surfaces, in the order the
// extension loads them. Order matters: the surface system loads last and its
// !important rules are what removed the ground in the first place.
const STYLE_SOURCES = [
    ['extension/ytkit.js', null],
    ['extension/features/digital-wellbeing/index.js', null],
    ['extension/features/download-ui/index.js', null],
    ['extension/features/video-hider/index.js', null],
    ['extension/features/video-filters/index.js', null],
    ['extension/core/settings-visual-system.js', 'SURFACE_VISUAL_SYSTEM_CSS']
];

function httpGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 3000 }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

// Pull every CSS-looking template literal out of a runtime module. The rules
// live inside injectStyle(`…`) calls, so the alternative is executing the
// feature, which needs a whole YouTube page.
function extractCss(relative, exportName) {
    const abs = path.join(REPO_ROOT, relative);
    if (!fs.existsSync(abs)) return [];
    if (exportName) {
        delete require.cache[require.resolve(abs)];
        return [String(require(abs)[exportName] || '')];
    }
    const source = fs.readFileSync(abs, 'utf8');
    const chunks = [];
    for (const match of source.matchAll(/`([^`]{40,})`/g)) {
        const text = match[1];
        // A CSS block declares selectors and properties; a prose template does
        // not. Requiring both a brace pair and a property colon keeps message
        // templates and SQL-ish strings out.
        if (/\.[a-z-]+[^{}]*\{[^{}]*:[^{}]*\}/i.test(text) && text.includes('ytkit-')) {
            const cleaned = text.replace(/\$\{[^}]*\}/g, '0');
            // Balanced braces only. An unbalanced chunk poisons every rule the
            // browser parses after it, and these are extracted fragments, not
            // whole stylesheets.
            const opens = (cleaned.match(/\{/g) || []).length;
            const closes = (cleaned.match(/\}/g) || []).length;
            if (opens === closes) chunks.push(cleaned);
        }
    }
    return chunks;
}

function buildPage(stageDir) {
    fs.mkdirSync(stageDir, { recursive: true });
    const sheets = STYLE_SOURCES
        .flatMap(([rel, name]) => extractCss(rel, name))
        .map((chunk) => `<style>${chunk}</style>`)
        .join('\n');
    const markup = CASES.map(([panel, child], index) =>
        `<div class="${panel}" data-probe-panel="${index}">`
        + `<div class="${child}" data-probe="${index}">Sample text 123</div>`
        + `</div>`
    ).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff;color:#0f0f0f}
html[dark],html[dark] body{background:#0f0f0f;color:#fff}
[data-probe-panel]{display:block;margin:8px;padding:12px}</style>
${sheets}
</head><body>${markup}</body></html>`;
    const file = path.join(stageDir, 'light-surface-probe.html');
    fs.writeFileSync(file, html);
    return file;
}

const READ_ROWS = `(() => {
    const parse = (value) => {
        const m = String(value).match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const over = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1
    });
    const lum = (c) => {
        const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };
    // Walk up compositing every translucent background until an opaque one is
    // reached, which is what the browser paints against.
    const groundOf = (el) => {
        let node = el;
        let acc = null;
        while (node) {
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0) acc = acc ? over(acc, bg) : bg;
            if (acc && acc.a >= 0.999) return acc;
            node = node.parentElement;
        }
        const page = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
        return acc ? over(acc, page) : page;
    };
    const rows = [];
    for (const el of document.querySelectorAll('[data-probe]')) {
        const fg = parse(getComputedStyle(el).color);
        const ground = groundOf(el);
        if (!fg || !ground) { rows.push({ index: Number(el.dataset.probe), error: 'unreadable' }); continue; }
        rows.push({
            index: Number(el.dataset.probe),
            color: getComputedStyle(el).color,
            ground: 'rgb(' + Math.round(ground.r) + ', ' + Math.round(ground.g) + ', ' + Math.round(ground.b) + ')',
            ratio: Number(ratio(over(fg, ground), ground).toFixed(2))
        });
    }
    return rows;
})()`;

async function main() {
    const wantJson = process.argv.includes('--json');
    const browserPath = findBrowser('');
    if (!browserPath) {
        console.error('[light-surface-probe] no Chromium-family browser found');
        process.exit(2);
    }

    const stageDir = path.join(REPO_ROOT, 'build', 'light-surface-probe');
    fs.rmSync(stageDir, { recursive: true, force: true });
    const pagePath = buildPage(stageDir);
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-light-probe-'));

    const browser = spawn(browserPath, [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        '--window-size=1280,900', `file://${pagePath.replace(/\\/g, '/')}`
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    let stderrBuf = '';
    const devtoolsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no DevTools endpoint')), 45000);
        browser.stderr.on('data', (chunk) => {
            stderrBuf += chunk;
            const found = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (found) { clearTimeout(timer); resolve(found[1]); }
        });
        browser.on('exit', (code) => { clearTimeout(timer); reject(new Error(`browser exited (${code})`)); });
    });

    const failures = [];
    const report = { dark: [], light: [] };
    try {
        const port = new URL(devtoolsUrl).port;
        const page = await waitFor(async () => {
            const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
            return list.find((entry) => entry.type === 'page'
                && String(entry.url || '').includes('light-surface-probe.html')) || null;
        }, 45000, 'the probe page');

        const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
        await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
        const client = new DevtoolsClient(ws);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await sleep(400);

        for (const theme of ['dark', 'light']) {
            await client.evaluate(theme === 'dark'
                ? `document.documentElement.setAttribute('dark', ''); true`
                : `document.documentElement.removeAttribute('dark'); true`);
            await sleep(250);
            report[theme] = await client.evaluate(READ_ROWS);
        }
        ws.close();
    } finally {
        browser.kill();
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* reason: profile cleanup is best effort */ }
    }

    const lines = [];
    for (let index = 0; index < CASES.length; index += 1) {
        const [, , label, large] = CASES[index];
        const floor = large ? AA_LARGE : AA_NORMAL;
        for (const theme of ['dark', 'light']) {
            const row = report[theme].find((entry) => entry.index === index);
            if (!row || row.error) { failures.push(`${label} [${theme}] unreadable`); continue; }
            const ok = row.ratio >= floor;
            if (!ok) failures.push(`${label} [${theme}] ${row.ratio}:1 on ${row.ground} (floor ${floor}:1)`);
            lines.push(`  ${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(28)} ${theme.padEnd(6)}`
                + `${String(row.ratio).padStart(6)}:1   ${row.color} on ${row.ground}`);
        }
    }

    if (wantJson) console.log(JSON.stringify(report, null, 2));
    else lines.forEach((line) => console.log(line));

    if (failures.length) {
        console.error(`\n[light-surface-probe] FAIL — ${failures.length} surface(s) below the AA floor:`);
        failures.forEach((entry) => console.error('  ' + entry));
        process.exit(1);
    }
    console.log(`\n[light-surface-probe] PASS — ${CASES.length} surface(s) clear AA in dark and light`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[light-surface-probe] ' + (error && error.message ? error.message : error));
        process.exit(2);
    });
}

module.exports = { CASES, extractCss, buildPage };
