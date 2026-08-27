#!/usr/bin/env node
'use strict';

// Focused browser proof for two host-CSS collisions that are easy to miss in
// source review: YouTube repainting Quick Links footer icons black, and the
// native comment count drawing a separator after its text. The fixture loads
// the shipped CSS and shared icons, adds hostile host rules after them, then
// captures both controls in dark and light themes.

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const { extractCss } = require('./probe-light-surfaces.js');
const { DevtoolsClient, findBrowser, sleep, waitFor } = require('./smoke-settings-overlay.js');

const REPO_ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
    const options = {
        browser: '',
        outDir: path.join(REPO_ROOT, 'build', 'theme-control-probe')
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--browser') options.browser = path.resolve(argv[++index] || '');
        else if (arg === '--out-dir') options.outDir = path.resolve(argv[++index] || '');
        else throw new Error(`unknown argument: ${arg}`);
    }
    return options;
}

function httpGetJson(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, { timeout: 3000 }, (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
        });
        request.on('timeout', () => request.destroy(new Error('timeout')));
        request.on('error', reject);
    });
}

function inlineScript(source) {
    return String(source).replace(/<\/script/gi, '<\\/script');
}

function buildFixture(outDir) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    const sheets = [
        ...extractCss('extension/core/settings-visual-system.js', 'SURFACE_VISUAL_SYSTEM_CSS'),
        ...extractCss('extension/features/player-dock/index.js', null),
        ...extractCss('extension/features/sticky-video/index.js', null),
        ...extractCss('extension/ytkit.js', null)
    ].map((css) => `<style>${css}</style>`).join('\n');
    const iconLibrary = inlineScript(fs.readFileSync(
        path.join(REPO_ROOT, 'extension', 'core', 'icons.js'), 'utf8'));
    const html = `<!doctype html>
<html class="ytkit-split-active" dark>
<head>
<meta charset="utf-8">
<style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font: 14px Arial, sans-serif; }
    body { display: flex; align-items: flex-start; gap: 44px; padding: 42px; background: #0b111a; color: #eef4fc; }
    html:not([dark]) body { background: #eef2f7; color: #172033; }
    #ytkit-ql-menu { position: relative !important; inset: auto !important; min-width: 214px !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; transform: none !important; }
    #ytkit-ql-menu .ytkit-ql-divider { margin-top: 0 !important; }
    #engagementCapture { display: inline-flex; padding: 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; background: #0d1928; }
    html:not([dark]) #engagementCapture { border-color: rgba(15,23,42,.12); background: #f8fafc; }
    #engagementCapture #below, #engagementCapture #comments { width: auto !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; }
    #engagementCapture ytd-comment-view-model { min-height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; }
    #engagementCapture ytd-comment-engagement-bar { display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; }
    #engagementCapture #toolbar { display: inline-flex !important; }
</style>
${sheets}
<style>
    /* Loaded after Astra on purpose. These model late YouTube paint rules. */
    html body button.ytkit-ql-bottom-btn { color: #05070a !important; }
    html body button.ytkit-ql-bottom-btn svg :is(path, circle, rect, line, polyline, polygon) { fill: #05070a !important; stroke: #05070a !important; }
    html body #vote-count-middle::after { content: "" !important; display: block !important; width: 1px !important; height: 30px !important; border: 0 !important; background: #fff !important; box-shadow: none !important; }
</style>
</head>
<body>
    <div id="ytkit-ql-menu" class="ytkit-ql-drop ytkit-ql-visible" aria-label="Quick Links footer fixture">
        <div class="ytkit-ql-divider"></div>
        <div class="ytkit-ql-bottom">
            <button type="button" class="ytkit-ql-item ytkit-ql-bottom-btn" data-icon="edit" aria-label="Edit launcher links"><span>Edit</span></button>
            <button type="button" class="ytkit-ql-item ytkit-ql-bottom-btn" data-icon="settings" aria-label="Open Astra Deck settings"><span>Settings</span></button>
        </div>
    </div>
    <div id="engagementCapture">
        <div id="below" class="ytkit-split-scroll-surface">
            <div id="comments">
                <ytd-comment-view-model>
                    <ytd-comment-engagement-bar>
                        <div id="toolbar"><span id="vote-count-middle">1.4K</span></div>
                    </ytd-comment-engagement-bar>
                </ytd-comment-view-model>
            </div>
        </div>
    </div>
<script>${iconLibrary}</script>
<script>
    for (const button of document.querySelectorAll('.ytkit-ql-bottom-btn[data-icon]')) {
        button.style.setProperty('color', 'light-dark(#334155, rgba(226, 232, 240, 0.86))', 'important');
        const icon = YTKitCore.hardenOutlineIcon(YTKitCore.ICONS[button.dataset.icon]());
        icon.classList.add('ytkit-ql-icon');
        icon.setAttribute('aria-hidden', 'true');
        button.prepend(icon);
        const label = button.querySelector('span');
        label.setAttribute('aria-hidden', 'true');
        label.style.setProperty('display', 'none', 'important');
    }
</script>
</body>
</html>`;
    const file = path.join(outDir, 'theme-control-probe.html');
    fs.writeFileSync(file, html, 'utf8');
    return file;
}

const READ_STATE = `(() => {
    const parse = (value) => {
        const match = String(value).match(/rgba?\\(([^)]+)\\)/);
        if (!match) return null;
        const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const over = (front, back) => ({
        r: front.r * front.a + back.r * (1 - front.a),
        g: front.g * front.a + back.g * (1 - front.a),
        b: front.b * front.a + back.b * (1 - front.a),
        a: 1
    });
    const luminance = (color) => {
        const channel = (value) => {
            const scaled = value / 255;
            return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const ratio = (one, two) => {
        const high = Math.max(luminance(one), luminance(two));
        const low = Math.min(luminance(one), luminance(two));
        return (high + 0.05) / (low + 0.05);
    };
    const panel = document.querySelector('#ytkit-ql-menu');
    const panelPaint = parse(getComputedStyle(panel).backgroundColor);
    const pagePaint = parse(getComputedStyle(document.body).backgroundColor);
    const ground = panelPaint && pagePaint ? over(panelPaint, pagePaint) : pagePaint;
    const icons = [...document.querySelectorAll('.ytkit-ql-bottom-btn')].map((button) => {
        const icon = button.querySelector('.ytkit-ql-icon');
        const part = icon.querySelector('path, circle, rect, line, polyline, polygon');
        const buttonStyle = getComputedStyle(button);
        const iconStyle = getComputedStyle(icon);
        const partStyle = getComputedStyle(part);
        const labelStyle = getComputedStyle(button.querySelector('span'));
        const stroke = parse(partStyle.stroke) || parse(iconStyle.stroke) || parse(buttonStyle.color);
        return {
            label: button.getAttribute('aria-label'),
            buttonColor: buttonStyle.color,
            rootFill: iconStyle.fill,
            rootStroke: iconStyle.stroke,
            partFill: partStyle.fill,
            partStroke: partStyle.stroke,
            labelDisplay: labelStyle.display,
            contrast: stroke && ground ? Number(ratio(over(stroke, ground), ground).toFixed(2)) : 0,
            width: icon.getBoundingClientRect().width,
            height: icon.getBoundingClientRect().height
        };
    });
    const count = document.querySelector('#vote-count-middle');
    const describePseudo = (pseudo) => {
        const style = getComputedStyle(count, pseudo);
        return {
            content: style.content,
            display: style.display,
            width: style.width,
            height: style.height,
            background: style.backgroundColor,
            borderRightWidth: style.borderRightWidth,
            boxShadow: style.boxShadow
        };
    };
    return {
        theme: document.documentElement.hasAttribute('dark') ? 'dark' : 'light',
        icons,
        count: {
            text: count.textContent.trim(),
            color: getComputedStyle(count).color,
            before: describePseudo('::before'),
            after: describePseudo('::after')
        }
    };
})()`;

async function captureElement(client, selector, file) {
    const clip = await client.evaluate(`(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const pad = 10;
        return {
            x: Math.max(0, rect.x - pad),
            y: Math.max(0, rect.y - pad),
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            scale: 1
        };
    })()`);
    if (!clip) throw new Error(`missing screenshot target: ${selector}`);
    const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        clip
    });
    fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
}

function stateFailures(state) {
    const failures = [];
    if (state.icons.length !== 2) failures.push(`${state.theme}: expected two footer icons`);
    for (const icon of state.icons) {
        if (icon.contrast < 3) failures.push(`${state.theme} ${icon.label}: icon contrast is ${icon.contrast}:1`);
        if (icon.partFill !== 'none' && icon.partFill !== 'rgba(0, 0, 0, 0)') {
            failures.push(`${state.theme} ${icon.label}: outline part is filled ${icon.partFill}`);
        }
        if (icon.width < 11 || icon.height < 11) failures.push(`${state.theme} ${icon.label}: icon is too small`);
        if (icon.labelDisplay !== 'none') failures.push(`${state.theme} ${icon.label}: hidden label is visible`);
    }
    for (const [side, pseudo] of [['before', state.count.before], ['after', state.count.after]]) {
        if (pseudo.display !== 'none' || !['none', 'normal'].includes(pseudo.content)) {
            failures.push(`${state.theme}: like count ${side} decoration is still visible`);
        }
    }
    return failures;
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const browserPath = findBrowser(options.browser);
    if (!browserPath) throw new Error('Chrome is unavailable');
    const fixturePath = buildFixture(options.outDir);
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-theme-control-probe-'));
    const browser = spawn(browserPath, [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--force-device-scale-factor=1',
        '--window-size=900,600',
        `file://${fixturePath.replace(/\\/g, '/')}`
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    let stderr = '';
    const devtoolsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chrome did not expose DevTools')), 45000);
        browser.stderr.on('data', (chunk) => {
            stderr += chunk;
            const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        browser.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code})`)); });
    });

    const report = { browser: browserPath, dark: null, light: null };
    try {
        const port = new URL(devtoolsUrl).port;
        const page = await waitFor(async () => {
            const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
            return targets.find((target) => target.type === 'page'
                && String(target.url || '').includes('theme-control-probe.html')) || null;
        }, 45000, 'theme control fixture');
        const socket = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 32 * 1024 * 1024 });
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        const client = new DevtoolsClient(socket);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await sleep(300);

        for (const theme of ['dark', 'light']) {
            await client.evaluate(theme === 'dark'
                ? "document.documentElement.setAttribute('dark', ''); document.documentElement.style.colorScheme = 'dark'; true"
                : "document.documentElement.removeAttribute('dark'); document.documentElement.style.colorScheme = 'light'; true");
            await sleep(180);
            report[theme] = await client.evaluate(READ_STATE);
            await captureElement(client, '#ytkit-ql-menu', path.join(options.outDir, `quick-links-${theme}.png`));
            await captureElement(client, '#engagementCapture', path.join(options.outDir, `like-count-${theme}.png`));
        }
        socket.close();
    } finally {
        browser.kill();
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* reason: temporary Chrome profile cleanup is best effort */ }
    }

    const failures = [...stateFailures(report.dark), ...stateFailures(report.light)];
    fs.writeFileSync(path.join(options.outDir, 'theme-control-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (failures.length) throw new Error(failures.join('\n'));
    console.log(`[theme-control-probe] PASS: footer icons and like-count decoration are clean in dark and light (${browserPath})`);
    console.log(`[theme-control-probe] screenshots: ${options.outDir}`);
    return report;
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[theme-control-probe]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { READ_STATE, buildFixture, main, parseArgs, stateFailures };
