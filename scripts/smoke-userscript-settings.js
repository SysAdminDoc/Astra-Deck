#!/usr/bin/env node
'use strict';

// Render the distributable userscript and its @require core in an isolated
// Chromium page. This is manager-neutral on purpose: it proves the generated
// artifacts build and render the desktop settings contract, while manager
// grants remain covered by their source gates.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
    browserCandidates,
    connectCdp,
    evaluate,
    fetchJsonFromDevTools,
    killProcessTree,
    removeDirWithRetries,
    reserveLoopbackPort,
    sleep,
    waitForDevTools
} = require('./smoke-chromium-optional-hosts');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'userscript-settings-smoke');
const STATES = Object.freeze([
    { name: 'desktop-dark', width: 1440, height: 900, dark: true },
    { name: 'desktop-light', width: 1440, height: 900, dark: false },
    { name: 'desktop-wide', width: 1920, height: 1080, dark: true }
]);

function parseArgs(argv) {
    const options = { browser: '', keepStage: false, timeoutMs: 45000 };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--browser') options.browser = path.resolve(argv[++index] || '');
        else if (arg === '--keep-stage') options.keepStage = true;
        else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]) || options.timeoutMs;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

function buildFixture(stageDir) {
    fs.copyFileSync(path.join(REPO_ROOT, 'YTKit-core.user.js'), path.join(stageDir, 'YTKit-core.user.js'));
    fs.copyFileSync(path.join(REPO_ROOT, 'YTKit.user.js'), path.join(stageDir, 'YTKit.user.js'));
    const fixture = `<!doctype html>
<html lang="en" dark>
<head>
<meta charset="utf-8">
<title>Astra Deck userscript settings smoke</title>
<style>html,body{margin:0;min-height:100%;background:#0f0f0f;color:#fff;font-family:Arial,sans-serif}</style>
<script>
(() => {
    const store = new Map([['ytkit_safe_mode', true]]);
    globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
    globalThis.GM_setValue = (key, value) => { store.set(key, value); };
    globalThis.GM_deleteValue = (key) => { store.delete(key); };
    globalThis.GM_addStyle = (css) => {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    };
    globalThis.GM_xmlhttpRequest = (options = {}) => {
        queueMicrotask(() => options.onerror?.({ status: 0, error: 'disabled in isolated visual smoke' }));
        return { abort() {} };
    };
})();
</script>
<script src="YTKit-core.user.js"></script>
<script src="YTKit.user.js"></script>
</head>
<body>
<ytd-app>
  <ytd-masthead><div id="end"></div></ytd-masthead>
  <ytd-page-manager></ytd-page-manager>
</ytd-app>
</body>
</html>`;
    const fixturePath = path.join(stageDir, 'fixture.html');
    fs.writeFileSync(fixturePath, fixture, 'utf8');
    return fixturePath;
}

async function waitForExpression(client, expression, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(client, expression).catch(() => false)) return;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

async function capture(client, name) {
    const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
    });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
}

async function auditState(client, state) {
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: state.width,
        height: state.height,
        deviceScaleFactor: 1,
        mobile: false
    });
    await evaluate(client, `(() => {
        document.documentElement.toggleAttribute('dark', ${state.dark});
        document.body.classList.add('ytkit-panel-open');
    })()`);
    await sleep(150);
    const categories = await evaluate(client, `Array.from(document.querySelectorAll('.ytkit-nav-btn'))
        .map((button) => ({ id: button.dataset.tab, label: button.querySelector('.ytkit-nav-label')?.textContent.trim() || '' }))`);
    if (categories.length !== 11) {
        throw new Error(`${state.name}: expected 11 userscript settings categories, found ${categories.length}`);
    }

    const pages = [];
    for (const category of categories) {
        const selected = await evaluate(client, `(() => {
            const button = document.querySelector('.ytkit-nav-btn[data-tab=${JSON.stringify(category.id)}]');
            if (!button) return false;
            button.click();
            return true;
        })()`);
        if (!selected) throw new Error(`${state.name}: could not select ${category.label}`);
        await sleep(50);
        const snapshot = await evaluate(client, `(() => {
            const panel = document.querySelector('#ytkit-settings-panel');
            const pane = document.querySelector('#ytkit-pane-${category.id}');
            const panelRect = panel.getBoundingClientRect();
            const clipped = Array.from(panel.querySelectorAll('.ytkit-nav-label, .ytkit-feature-name, .ytkit-feature-desc'))
                .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
                .map((node) => node.textContent.trim());
            return {
                active: pane?.classList.contains('active') === true,
                heading: pane?.querySelector('h2')?.textContent.trim() || '',
                controls: pane?.querySelectorAll('button, input, select, textarea, a[href]').length || 0,
                horizontalOverflow: panel.scrollWidth > panel.clientWidth + 1,
                outsideViewport: panelRect.left < -1 || panelRect.top < -1
                    || panelRect.right > innerWidth + 1 || panelRect.bottom > innerHeight + 1,
                panelRect: {
                    left: panelRect.left,
                    top: panelRect.top,
                    right: panelRect.right,
                    bottom: panelRect.bottom,
                    width: panelRect.width,
                    height: panelRect.height
                },
                transform: getComputedStyle(panel).transform,
                clipped,
                summaryCards: pane?.querySelectorAll('.ytkit-vh-summary-card').length || 0,
                missionIcon: Boolean(pane?.querySelector('.ytkit-pane-lead .ytkit-pane-icon svg')),
                invalidSelectLabels: Array.from(pane?.querySelectorAll('option') || [])
                    .map((option) => option.textContent.trim())
                    .filter((label) => label === '[object Object]')
            };
        })()`);
        if (!snapshot.active || !snapshot.heading) throw new Error(`${state.name}/${category.label}: pane is blank or inactive`);
        if (snapshot.horizontalOverflow || snapshot.outsideViewport) {
            throw new Error(`${state.name}/${category.label}: panel overflows the desktop viewport (${JSON.stringify(snapshot.panelRect)}, transform ${snapshot.transform})`);
        }
        if (snapshot.clipped.length) throw new Error(`${state.name}/${category.label}: clipped labels: ${snapshot.clipped.join(', ')}`);
        if (snapshot.invalidSelectLabels.length) throw new Error(`${state.name}/${category.label}: a select rendered [object Object]`);
        if (category.id === 'Video-Hider' && (snapshot.summaryCards !== 3 || !snapshot.missionIcon)) {
            throw new Error(`${state.name}/Video Hider: mission header or summary dashboard is missing`);
        }
        pages.push({ ...category, ...snapshot });
        const slug = category.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await capture(client, `${state.name}-category-${slug}`);
    }
    return pages;
}

async function runCandidate(candidate, fixturePath, timeoutMs) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-userscript-settings-profile-'));
    const port = await reserveLoopbackPort();
    const fixtureUrl = `file:///${fixturePath.split(path.sep).join('/')}`;
    const proc = spawn(candidate.path, [
        `--user-data-dir=${profile}`,
        `--remote-debugging-port=${port}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--allow-file-access-from-files',
        '--headless=new',
        '--disable-gpu',
        fixtureUrl
    ], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let client = null;
    try {
        await waitForDevTools(port, timeoutMs);
        const deadline = Date.now() + timeoutMs;
        let page;
        while (Date.now() < deadline && !page) {
            page = (await fetchJsonFromDevTools(port, '/json/list')).find((target) =>
                target.type === 'page' && String(target.url).includes('fixture.html'));
            if (!page) await sleep(100);
        }
        if (!page) throw new Error('Could not find the userscript fixture page');
        client = await connectCdp(page.webSocketDebuggerUrl);
        await client.send('Runtime.enable');
        await client.send('Page.enable');
        try {
            await waitForExpression(
                client,
                "Boolean(window.ytkit && document.querySelector('#ytkit-settings-panel'))",
                timeoutMs,
                'userscript settings initialization'
            );
        } catch (error) {
            const diagnostics = await evaluate(client, `({
                readyState: document.readyState,
                coreLoaded: Boolean(globalThis.YTKitCore),
                userscriptLoaded: Boolean(window.ytkit),
                panel: Boolean(document.querySelector('#ytkit-settings-panel')),
                bodyClass: document.body?.className || '',
                scripts: Array.from(document.scripts).map((script) => script.src || 'inline')
            })()`).catch(() => ({}));
            const exceptions = (client.events || [])
                .filter((event) => event.method === 'Runtime.exceptionThrown')
                .map((event) => event.params?.exceptionDetails?.exception?.description
                    || event.params?.exceptionDetails?.text)
                .filter(Boolean);
            throw new Error(`${error.message}; diagnostics=${JSON.stringify(diagnostics)}; exceptions=${exceptions.join(' | ')}`);
        }
        const states = {};
        for (const state of STATES) states[state.name] = await auditState(client, state);
        return { browser: candidate.label, states };
    } finally {
        client?.close();
        killProcessTree(proc);
        await removeDirWithRetries(profile);
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const candidates = browserCandidates(options.browser);
    if (!candidates.length) throw new Error('No Chromium-family browser is available');
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-userscript-settings-stage-'));
    try {
        const fixturePath = buildFixture(stageDir);
        let lastError;
        for (const candidate of candidates) {
            try {
                const result = await runCandidate(candidate, fixturePath, options.timeoutMs);
                console.log(
                    `[smoke-userscript-settings] PASS — ${result.browser}; `
                    + '11 pages rendered at 1440x900 dark/light and 1920x1080 dark without clipping or overflow'
                );
                console.log(`[smoke-userscript-settings] screenshots: ${OUT_DIR}`);
                return result;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('Every Chromium candidate failed');
    } finally {
        if (!options.keepStage) await removeDirWithRetries(stageDir);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[smoke-userscript-settings]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { STATES, auditState, main, parseArgs };
