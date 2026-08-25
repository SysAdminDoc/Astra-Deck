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
    ['ytkit-sub-group-dialog__card', 'ytkit-subs-load-banner__eyebrow', 'Subs banner eyebrow', false],
    // The quick-link menu. It joined the repainted panel list without any of
    // its own children being relit, and it ships on by default, so a light
    // theme user opening it saw #f1f1f1 items on a white panel.
    ['ytkit-ql-drop', 'ytkit-ql-item', 'Quick link item', false],
    ['ytkit-ql-drop', 'ytkit-ql-empty-title', 'Quick link empty title', false],
    ['ytkit-ql-drop', 'ytkit-ql-empty-copy', 'Quick link empty copy', false],
    ['ytkit-ql-drop', 'ytkit-ql-form-note', 'Quick link form note', false],
    ['ytkit-ql-drop', 'ytkit-ql-bottom-btn', 'Quick link bottom button', false],
    // Descendants of surfaces the system has been repainting all along. The
    // acceptance for the relight was "each surface the system repaints gets a
    // light lane for its own descendants", and these were missed.
    ['ytkit-context-menu', 'ytkit-context-menu-item', 'Context menu item', false],
    ['ytkit-bookmarks-container', 'ytkit-bookmarks-empty-title', 'Bookmarks empty title', false],
    ['ytkit-search-container', 'ytkit-search-hint', 'Search hint', false],
    ['ytkit-subs-load-banner', 'ytkit-subs-load-banner__btn', 'Subs banner button', false],
    ['ytkit-mediadl-banner', 'ytkit-mediadl-banner__status', 'Media banner status', false],
    // Siblings of surfaces the previous pass fixed. It relit
    // .ytkit-subs-load-banner__btn and left the three beside it white on white;
    // it relit .ytkit-context-menu-item and left the header above it at 3.5:1.
    // Picking ten cases is not the same as covering the acceptance.
    ['ytkit-subs-load-banner', 'ytkit-subs-load-banner__stat-value', 'Subs banner stat value', false],
    ['ytkit-subs-load-banner', 'ytkit-subs-load-banner__stat-label', 'Subs banner stat label', false],
    ['ytkit-subs-load-banner', 'ytkit-subs-load-banner__btn--quiet', 'Subs banner quiet button', false],
    ['ytkit-context-menu', 'ytkit-context-menu-header', 'Context menu header', false],
    ['ytkit-dl-history-panel', 'ytkit-dl-history-panel__empty', 'DL history empty', false],
    ['ytkit-dl-history-panel', 'ytkit-dl-history-panel__count', 'DL history count', false],
    ['ytkit-speed-presets', 'ytkit-speed-presets__status', 'Speed presets status', false],
    // Activated this pass: they were named as classes in the surface system
    // but only ever exist as ids, so they received none of its treatment.
    ['ytkit-mediadl-install-prompt', 'ytkit-install-prompt__title', 'Install prompt title', false],
    ['ytkit-mediadl-install-prompt', 'ytkit-install-prompt__desc', 'Install prompt desc', false],
    ['ytkit-mediadl-install-prompt', 'ytkit-install-prompt__steps', 'Install prompt steps', false],
    ['ytkit-mediadl-install-prompt', 'ytkit-install-prompt__note', 'Install prompt note', false],
    ['ytkit-mediadl-install-prompt', 'ytkit-install-prompt__eyebrow', 'Install prompt eyebrow', false],
    ['ytkit-mediadl-install-prompt', 'ytkit-install-prompt__close', 'Install prompt close', false]
];

// Every descendant that sets its own colour, discovered rather than listed.
//
// The list above was hand-picked, twice, and both times the pass that wrote it
// relit some children of a panel and left their siblings white on white: the
// subs banner got its button and not its stat rows, the context menu got its
// items and not its header. Picking ten cases is not the same as covering the
// stated acceptance, which is that EVERY surface the system repaints gets a
// light lane for its own descendants.
//
// So the roots come from the surface system's own chrome blocks, and the
// children come from any rule in extension/ that sets a colour on a class
// starting with that root's name. Naming here is consistently BEM-ish, so the
// prefix is a usable stand-in for containment — the same assumption
// scripts/check-light-theme-lane.js already makes.
const NOT_RENDERED_INSIDE = new Set([
    // Trigger buttons that live in the page chrome, not in the panel they open.
    'ytkit-dl-history-btn',
    'ytkit-queue-pill',
    'ytkit-aisum-btn',
    // The panel roots themselves; they are the ground, not a descendant.
    'ytkit-dl-progress__announcer'
]);

function derivedCases(css, sources) {
    const roots = new Set();
    for (const block of css.matchAll(/html :is\(([^)]*)\)\s*\{[^}]*background:\s*var\(--ytkit-premium-panel\)\s*!important/g)) {
        for (const raw of block[1].split(',')) {
            const selector = raw.trim();
            if (/^[.#]ytkit-[\w-]+$/.test(selector)) roots.add(selector.slice(1));
        }
    }
    if (!roots.size) return [];

    // Which classes set a colour anywhere under extension/.
    const coloured = new Map();
    for (const text of sources) {
        const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
        const RULE = /([^{}`;]{3,2000})\{([^{}`]{0,4000})\}/g;
        let match;
        while ((match = RULE.exec(withoutComments)) !== null) {
            const selector = match[1].trim().replace(/\s+/g, ' ');
            const body = match[2];
            if (!/(^|[^-])color\s*:/.test(body)) continue;
            if (/=>|function|return |if \(|for \(|catch|typeof |await /.test(selector)) continue;
            // Only a bare class chain; a descendant or state selector is a
            // variation of something we already cover.
            for (const name of selector.matchAll(/(?:^|[\s,])\.(ytkit-[\w-]+)(?=[\s,:{]|$)/g)) {
                if (!coloured.has(name[1])) coloured.set(name[1], true);
            }
        }
    }

    const cases = [];
    const seen = new Set();
    for (const root of [...roots].sort()) {
        for (const child of [...coloured.keys()].sort()) {
            if (child === root) continue;
            if (NOT_RENDERED_INSIDE.has(child)) continue;
            if (!child.startsWith(root + '-') && !child.startsWith(root + '__')) continue;
            const key = root + '>' + child;
            if (seen.has(key)) continue;
            seen.add(key);
            cases.push([root, child, child.replace(/^ytkit-/, ''), false]);
        }
    }
    return cases;
}

// Every stylesheet that contributes to these surfaces, in the order the
// extension actually loads them.
//
// This list used to run the other way, on the assumption that the surface
// system loads last. It does not. RUNTIME_MODULES in extension/runtime-bootstrap.js
// puts core/settings-visual-system.js at index 5 and it injects its <style> at
// module evaluation, while the feature modules come later and ytkit.js is
// awaited last of all. So every feature sheet is AFTER the surface sheet at
// runtime, and where both sides carry !important at the same specificity the
// feature wins. Modelling it backwards made the probe report the surface
// system winning grounds it never wins, which is how a relight that left the
// speed popup at 1.02:1 read as 12.75:1 here.
const STYLE_SOURCES = [
    ['extension/core/settings-visual-system.js', 'SURFACE_VISUAL_SYSTEM_CSS'],
    ['extension/features/video-filters/index.js', null],
    ['extension/features/video-hider/index.js', null],
    ['extension/features/digital-wellbeing/index.js', null],
    ['extension/features/download-ui/index.js', null],
    ['extension/ytkit.js', null]
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

// Collect CSS rules out of a runtime module by matching the rules themselves.
//
// Parsing template-literal boundaries was the wrong tool: ytkit.js nests
// templates and interpolations, so a backtick scan dropped 85 of 129 candidate
// chunks including every install-prompt rule. Missing rules do not fail loudly
// here; the child simply inherits the panel colour and the row reads as a pass.
// A rule is self-delimiting, so nesting elsewhere cannot corrupt it. Same
// approach scripts/check-light-theme-lane.js uses.
// Remove at-rule blocks whole, condition and body together.
//
// The rule matcher below takes any prelude{body} pair with no nested braces,
// which means the INNER rules of an at-rule survive while the condition that
// gates them is discarded. ytkit.js ships a @media (forced-colors: active)
// block that repaints .ytkit-speed-popup, .ytkit-stream-links-panel and
// .ytkit-dl-history-panel with Canvas/CanvasText, so hoisting it applied the
// forced-colors palette to every render in the probe page and the measured
// grounds were not the shipped ones at all.
//
// Dropping these blocks means the probe does not cover them. That is the
// honest default: it models a normal render, and a surface whose only lane is
// inside a media query has no lane in a normal render either.
function stripAtRuleBlocks(source) {
    const AT = /@(?:media|supports|keyframes|-webkit-keyframes|container|layer|scope)\b[^{;]{0,300}\{/g;
    const cuts = [];
    let match;
    while ((match = AT.exec(source)) !== null) {
        let depth = 0;
        let index = match.index + match[0].length - 1;
        const limit = Math.min(source.length, index + 60000);
        for (; index < limit; index += 1) {
            const ch = source[index];
            if (ch === '{') depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) break;
            }
        }
        // Unbalanced inside the window means this was not an at-rule after all
        // (a stray @ in JS, an interpolation). Leave it to the rule matcher.
        if (depth !== 0) continue;
        cuts.push([match.index, index + 1]);
        AT.lastIndex = index + 1;
    }
    if (!cuts.length) return source;
    let out = '';
    let cursor = 0;
    for (const [start, end] of cuts) {
        out += source.slice(cursor, start);
        cursor = end;
    }
    return out + source.slice(cursor);
}

function extractCss(relative, exportName) {
    const abs = path.join(REPO_ROOT, relative);
    if (!fs.existsSync(abs)) return [];
    const source = exportName
        ? (delete require.cache[require.resolve(abs)], String(require(abs)[exportName] || ''))
        : fs.readFileSync(abs, 'utf8');

    // Comments first. A comment body is not brace-delimited, so the rule
    // matcher below happily reads its tail as a selector prelude and emits an
    // invalid rule. CSS error recovery then skips to the next `}` and eats the
    // real rule that followed, which is how the primary-text lane went missing
    // while the muted and subtle lanes survived.
    const withoutComments = stripAtRuleBlocks(source.replace(/\/\*[\s\S]*?\*\//g, ''));

    const rules = [];
    // <prelude>{<body>} with no nested braces and no backtick or semicolon in
    // the prelude, which excludes JS statements by shape.
    const RULE = /([^{}`;]{3,2000})\{([^{}`]{0,4000})\}/g;
    let match;
    while ((match = RULE.exec(withoutComments)) !== null) {
        const selector = match[1].trim().replace(/\s+/g, ' ');
        const body = match[2];
        // Keep the token-definition blocks too. They are `:root {` and
        // `html:not([dark]) {`, which name no ytkit class, so a selector-only
        // filter dropped them and every `var(--ytkit-premium-*)` in the page
        // resolved to nothing. The declaration then falls back to the inherited
        // page colour, which is exactly what a missing lane looks like.
        const definesTokens = /--ytkit-[a-z0-9-]+\s*:/i.test(body);
        if (!/[.#]ytkit-/.test(selector) && !definesTokens) continue;
        if (/=>|function|return |if \(|for \(|catch|typeof |await /.test(selector)) continue;
        // A declaration block has at least one property.
        if (!/[a-z-]+\s*:/i.test(body)) continue;
        rules.push(selector.replace(/\$\{[^}]*\}/g, '0')
            + '{' + body.replace(/\$\{[^}]*\}/g, '0') + '}');
    }
    // One <style> per rule would be thousands of elements; batch them, and a
    // batch is safe because each rule is already balanced.
    const batches = [];
    for (let i = 0; i < rules.length; i += 200) batches.push(rules.slice(i, i + 200).join('\n'));
    return batches;
}

function allCases() {
    const surfaceCss = String(require(path.join(REPO_ROOT, 'extension/core/settings-visual-system.js'))
        .SURFACE_VISUAL_SYSTEM_CSS || '');
    const sources = STYLE_SOURCES
        .filter(([, name]) => !name)
        .map(([rel]) => path.join(REPO_ROOT, rel))
        .filter((abs) => fs.existsSync(abs))
        .map((abs) => fs.readFileSync(abs, 'utf8'));
    const listed = new Set(CASES.map(([panel, child]) => panel + '>' + child));
    const extra = derivedCases(surfaceCss, sources)
        .filter(([panel, child]) => !listed.has(panel + '>' + child));
    return [...CASES, ...extra];
}

function buildPage(stageDir) {
    fs.mkdirSync(stageDir, { recursive: true });
    const sheets = STYLE_SOURCES
        .flatMap(([rel, name]) => extractCss(rel, name))
        .map((chunk) => `<style>${chunk}</style>`)
        .join('\n');
    const markup = allCases().map(([panel, child], index) =>
        `<div ${panel.startsWith('ytkit-mediadl-install-prompt') || panel.startsWith('ytkit-reaction-spammer-panel')
            ? `id="${panel}"` : `class="${panel}"`} data-probe-panel="${index}">`
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
    // Every colour a gradient paints, so the worst one can be measured.
    //
    // A gradient ground reports backgroundColor as rgba(0,0,0,0). Reading only
    // backgroundColor therefore walked straight past it to whatever opaque
    // colour sat behind, which is how .ytkit-speed-popup measured 15.81:1 for
    // text that actually sits on a near-black gradient at 1.02:1.
    const stopsOf = (node) => {
        const image = getComputedStyle(node).backgroundImage;
        if (!image || image === 'none') return [];
        const out = [];
        // Escaped twice: this block is a template literal that becomes page
        // script. A single backslash is eaten here and the regex degrades to
        // rgba?(([^)]+)) — which captures "(20, 24, 32, 0.96" and parses the
        // red channel as NaN.
        const RGB = /rgba?\\(([^)]+)\\)/g;
        let m;
        while ((m = RGB.exec(image)) !== null) {
            const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
            out.push({ r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 });
        }
        return out;
    };
    // Walk up compositing every translucent background until an opaque one is
    // reached, which is what the browser paints against. Returns every ground
    // the element can sit on: one per gradient stop where a gradient is
    // involved, otherwise a single colour.
    const groundsOf = (el) => {
        let node = el;
        let accs = [null];
        const layer = (paint) => {
            accs = accs.map((acc) => (acc ? over(acc, paint) : paint));
        };
        while (node) {
            const stops = stopsOf(node);
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (bg && bg.a > 0) layer(bg);
            if (stops.length) {
                // The image paints over the colour. Fan out: one branch per stop.
                const next = [];
                for (const acc of accs) {
                    for (const stop of stops) next.push(acc ? over(acc, stop) : stop);
                }
                accs = next;
            }
            if (accs.every((acc) => acc && acc.a >= 0.999)) return accs;
            node = node.parentElement;
        }
        const page = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
        return accs.map((acc) => (acc ? over(acc, page) : page));
    };
    const rows = [];
    for (const el of document.querySelectorAll('[data-probe]')) {
        const fg = parse(getComputedStyle(el).color);
        const grounds = groundsOf(el);
        if (!fg || !grounds.length) { rows.push({ index: Number(el.dataset.probe), error: 'unreadable' }); continue; }
        // The worst stop is the one a reader has to cope with.
        let ground = grounds[0];
        let worst = ratio(over(fg, ground), ground);
        for (const candidate of grounds) {
            const value = ratio(over(fg, candidate), candidate);
            if (value < worst) { worst = value; ground = candidate; }
        }
        // Did any stylesheet actually reach this element? A probe that loads
        // no rules still computes a perfectly comfortable ratio against the
        // page defaults, which is how three separate extraction bugs in this
        // script read as passes. Compare against a bare sibling with the same
        // theme: identical colour AND identical ground means nothing matched.
        const bare = document.createElement('div');
        bare.textContent = 'x';
        document.body.appendChild(bare);
        const bareColor = getComputedStyle(bare).color;
        const bareGround = groundsOf(bare)[0];
        bare.remove();
        const sameColor = getComputedStyle(el).color === bareColor;
        const sameGround = Math.round(ground.r) === Math.round(bareGround.r)
            && Math.round(ground.g) === Math.round(bareGround.g)
            && Math.round(ground.b) === Math.round(bareGround.b);
        rows.push({
            index: Number(el.dataset.probe),
            color: getComputedStyle(el).color,
            ground: 'rgb(' + Math.round(ground.r) + ', ' + Math.round(ground.g) + ', ' + Math.round(ground.b) + ')',
            ratio: Number(worst.toFixed(2)),
            unstyled: sameColor && sameGround
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
    const cases = allCases();
    for (let index = 0; index < cases.length; index += 1) {
        const [, , label, large] = cases[index];
        const floor = large ? AA_LARGE : AA_NORMAL;
        for (const theme of ['dark', 'light']) {
            const row = report[theme].find((entry) => entry.index === index);
            if (!row || row.error) { failures.push(`${label} [${theme}] unreadable`); continue; }
            if (row.unstyled) {
                failures.push(`${label} [${theme}] matched no rule; the probe is measuring the page, not the surface`);
                lines.push(`  DEAD ${label.padEnd(28)} ${theme.padEnd(6)}` + '   no rule matched');
                continue;
            }
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
    console.log(`\n[light-surface-probe] PASS — ${allCases().length} surface(s) clear AA in dark and light`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[light-surface-probe] ' + (error && error.message ? error.message : error));
        process.exit(2);
    });
}

module.exports = { CASES, allCases, derivedCases, extractCss, buildPage };
