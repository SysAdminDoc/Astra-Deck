#!/usr/bin/env node
'use strict';

// Render the distributable userscript and its @require libraries in an
// isolated Chromium page. This is manager-neutral on purpose: it proves the
// generated artifacts start and render the desktop settings contract, while
// real managers are covered by smoke-userscript-managers.js.

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

const { LIBRARIES } = require('../sync-userscript');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'userscript-settings-smoke');
const SECRET_TOKEN = 'SENTINEL-settings-smoke-token';
const SECRET_PREDICATE = 'title.includes("SENTINEL-settings-smoke-predicate")';
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

// The records load as plain scripts, libraries first, the order a manager
// runs them in, over GM_* stubs. The menu command the host registers is kept,
// so the smoke opens settings the way a userscript user does.
function buildFixture(stageDir) {
    const records = [...LIBRARIES.map((library) => library.file), 'YTKit.user.js'];
    for (const file of records) fs.copyFileSync(path.join(REPO_ROOT, file), path.join(stageDir, file));
    const fixture = `<!doctype html>
<html lang="en" dark>
<head>
<meta charset="utf-8">
<title>Astra Deck userscript settings smoke</title>
<style>html,body{margin:0;min-height:100%;background:#0f0f0f;color:#fff;font-family:Arial,sans-serif}</style>
<script>
(() => {
    // authToken is no setting: it stands in for a secret the diagnostics
    // bundle must redact. The predicate is a real schema setting, so it
    // also travels through the settings diff.
    const store = new Map([['ytkit_safe_mode', true], ['ytSuiteSettings', {
        authToken: '${SECRET_TOKEN}',
        advancedLocalPredicateCode: ${JSON.stringify(SECRET_PREDICATE)}
    }]]);
    globalThis.__astraSmokeMenu = [];
    globalThis.__astraSmokeClipboard = [];
    globalThis.GM_info = { scriptHandler: 'settings-smoke', version: '0' };
    globalThis.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
    globalThis.GM_setValue = (key, value) => { store.set(key, value); };
    globalThis.GM_deleteValue = (key) => { store.delete(key); };
    globalThis.GM_listValues = () => [...store.keys()];
    globalThis.GM_addValueChangeListener = () => 1;
    globalThis.GM_addStyle = (css) => {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    };
    // A manager runs the MAIN-world bundle in the page and everything else in
    // its sandbox. Here both would share one realm, so the page-world script
    // is created and never attached; the manager smoke covers that world.
    globalThis.GM_addElement = (parent, tag, attributes = {}) => {
        const node = document.createElement(tag);
        for (const [name, value] of Object.entries(attributes)) {
            if (name === 'textContent') node.textContent = value;
            else node.setAttribute(name, value);
        }
        if (tag !== 'script') parent.appendChild(node);
        return node;
    };
    globalThis.GM_xmlhttpRequest = (options = {}) => {
        queueMicrotask(() => options.onerror?.({ status: 0, error: 'disabled in isolated visual smoke' }));
        return { abort() {} };
    };
    globalThis.GM_download = () => {};
    globalThis.GM_openInTab = () => ({ close() {} });
    globalThis.GM_getResourceText = () => null;
    globalThis.GM_cookie = { list: (details, done) => done([]) };
    globalThis.GM_registerMenuCommand = (label, run) => { globalThis.__astraSmokeMenu.push({ label, run }); return label; };
    globalThis.GM_setClipboard = (text) => { globalThis.__astraSmokeClipboard.push(String(text)); };
})();
</script>
${records.map((file) => `<script src="${file}"></script>`).join('\n')}
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

// A computed rgb()/rgba() background is a light surface when it is mostly
// opaque and its relative luminance sits in the top third.
function isLightSurface(color) {
    const match = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(String(color || '').trim());
    if (!match) return false;
    const [red, green, blue] = match.slice(1, 4).map(Number);
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return alpha >= 0.8 && luminance >= 0.66;
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
        // The pane uses a 250ms entrance animation. Capturing at 50ms made a
        // healthy empty state look almost invisible because the whole pane was
        // still near the start of its opacity ramp.
        await sleep(300);
        const snapshot = await evaluate(client, `(() => {
            const panel = document.querySelector('#ytkit-settings-panel');
            const pane = document.querySelector('#ytkit-pane-${category.id}');
            const panelRect = panel.getBoundingClientRect();
            const panelStyle = getComputedStyle(panel);
            const videoHiderEmpty = pane?.querySelector('.ytkit-vh-hero.is-empty');
            const videoHiderEmptyTitle = videoHiderEmpty?.querySelector('.ytkit-vh-hero__title');
            const videoHiderEmptyCopy = videoHiderEmpty?.querySelector('.ytkit-vh-hero__copy');
            const mediaDlBanner = pane?.querySelector('#ytkit-mediadl-banner');
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
                videoHiderTabs: pane?.querySelectorAll('.ytkit-vh-tab').length || 0,
                legacySurfaceToken: panelStyle.getPropertyValue('--ytkit-bg-surface').trim(),
                sharedSurfaceToken: panelStyle.getPropertyValue('--ytkit-v3-surface').trim(),
                videoHiderEmpty: videoHiderEmpty && videoHiderEmptyTitle && videoHiderEmptyCopy ? {
                    background: panelStyle.backgroundColor,
                    copyColor: getComputedStyle(videoHiderEmptyCopy).color,
                    copyOpacity: getComputedStyle(videoHiderEmptyCopy).opacity,
                    titleColor: getComputedStyle(videoHiderEmptyTitle).color,
                    text: (videoHiderEmptyTitle.textContent + videoHiderEmptyCopy.textContent).trim(),
                } : null,
                mediaDlBannerBackground: mediaDlBanner ? getComputedStyle(mediaDlBanner).backgroundColor : '',
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
        if (!snapshot.legacySurfaceToken || snapshot.legacySurfaceToken !== snapshot.sharedSurfaceToken) {
            throw new Error(`${state.name}/${category.label}: legacy surface token drifted from the shared visual system`);
        }
        if (category.id === 'Video-Hider' && snapshot.videoHiderTabs < 4) {
            throw new Error(`${state.name}/Video Hider: expected its list tabs, found ${snapshot.videoHiderTabs}`);
        }
        if (category.id === 'Video-Hider' && (!snapshot.videoHiderEmpty
            || !snapshot.videoHiderEmpty.text
            || Number(snapshot.videoHiderEmpty.copyOpacity) < 0.6
            || snapshot.videoHiderEmpty.copyColor === snapshot.videoHiderEmpty.background
            || snapshot.videoHiderEmpty.titleColor === snapshot.videoHiderEmpty.background)) {
            throw new Error(`${state.name}/Video Hider: empty state is not legible (${JSON.stringify(snapshot.videoHiderEmpty)})`);
        }
        if (category.id === 'Downloads' && !state.dark && !isLightSurface(snapshot.mediaDlBannerBackground)) {
            throw new Error(`${state.name}/Downloads: MediaDL banner retained a dark surface (${snapshot.mediaDlBannerBackground})`);
        }
        pages.push({ ...category, ...snapshot });
        const slug = category.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await capture(client, `${state.name}-category-${slug}`);
    }
    return pages;
}

// Both userscript routes to the diagnostics bundle: the manager menu command
// (GM_setClipboard) and the settings panel's bug button (page clipboard). A
// file:// page in headless Chromium has no clipboard permission, so the
// button's write is recorded instead of performed.
async function checkDiagnostics(client, timeoutMs) {
    const ran = await evaluate(client, `(() => {
        const command = globalThis.__astraSmokeMenu.find((entry) => entry.label === 'Copy Astra Deck diagnostics');
        if (!command) return false;
        command.run();
        return true;
    })()`);
    if (!ran) throw new Error('the userscript menu has no "Copy Astra Deck diagnostics" command');
    await waitForExpression(client, 'globalThis.__astraSmokeClipboard.length > 0', timeoutMs,
        'the diagnostics menu command to copy');
    await evaluate(client, `(() => {
        globalThis.__astraSmokePanelCopy = null;
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: async (text) => { globalThis.__astraSmokePanelCopy = String(text); } }
        });
        document.querySelector('#ytkit-copy-diagnostics').click();
    })()`);
    await waitForExpression(client, "typeof globalThis.__astraSmokePanelCopy === 'string'", timeoutMs,
        'the settings panel bug button to copy');
    const result = await evaluate(client, `(() => {
        const menuText = globalThis.__astraSmokeClipboard[0];
        const panelText = globalThis.__astraSmokePanelCopy;
        const menu = JSON.parse(menuText);
        const panel = JSON.parse(panelText);
        const button = document.querySelector('#ytkit-copy-diagnostics');
        const rect = button.getBoundingClientRect();
        return {
            marker: menu.astraDeckBugReport === true && panel.astraDeckBugReport === true,
            runtime: menu.runtime,
            token: menu.settings.authToken,
            predicateDiff: (menu.settingsDiff || []).find((change) => change.key === 'advancedLocalPredicateCode') || null,
            sameRedaction: JSON.stringify([menu.settings, menu.settingsDiff, menu.errors])
                === JSON.stringify([panel.settings, panel.settingsDiff, panel.errors]),
            leaked: [menuText, panelText].some((text) => text.includes('SENTINEL')),
            status: document.querySelector('#ytkit-panel-status')?.textContent.trim() || '',
            button: { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') || '' }
        };
    })()`);
    const failures = [];
    if (!result.marker) failures.push('a bundle lacks the astraDeckBugReport marker');
    if (result.runtime?.kind !== 'userscript' || !String(result.runtime?.manager || '').startsWith('settings-smoke')) {
        failures.push(`runtime is ${JSON.stringify(result.runtime)}`);
    }
    if (result.token !== `[redacted, ${SECRET_TOKEN.length} chars]`) failures.push(`authToken came through as ${JSON.stringify(result.token)}`);
    if (result.predicateDiff?.current !== `[redacted, ${SECRET_PREDICATE.length} chars]`) {
        failures.push(`the settings diff carried the predicate as ${JSON.stringify(result.predicateDiff)}`);
    }
    if (result.leaked) failures.push('a secret reached the clipboard');
    if (!result.sameRedaction) failures.push('the menu and the panel redacted differently');
    if (result.status !== 'Diagnostic copied to clipboard.') failures.push(`panel status reads ${JSON.stringify(result.status)}`);
    if (!(result.button.width > 0 && result.button.height > 0) || !result.button.label) {
        failures.push(`bug button is not a labelled, visible control: ${JSON.stringify(result.button)}`);
    }
    if (failures.length) throw new Error(`diagnostics: ${failures.join('; ')}`);
    return result;
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
            await waitForExpression(client, 'Boolean(window.ytkit && globalThis.__astraSmokeMenu?.length)',
                timeoutMs, 'userscript runtime startup');
            await evaluate(client, 'globalThis.__astraSmokeMenu[0].run()');
            await waitForExpression(client, "Boolean(document.querySelector('#ytkit-settings-panel'))",
                timeoutMs, 'the settings panel opened from the userscript menu command');
        } catch (error) {
            const diagnostics = await evaluate(client, `({
                readyState: document.readyState,
                host: globalThis.__astraDeckUserscript || null,
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
        const diagnostics = await checkDiagnostics(client, timeoutMs);
        await capture(client, 'diagnostics-copied');
        return { browser: candidate.label, states, diagnostics };
    } finally {
        client?.close();
        killProcessTree(proc);
        await removeDirWithRetries(profile);
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    // A browser named on the command line is the only one tried: falling back
    // past it hid its failure behind whichever installed browser passed.
    const candidates = browserCandidates(options.browser).slice(0, options.browser ? 1 : undefined);
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
                    + '11 pages rendered at 1440x900 dark/light and 1920x1080 dark without clipping or overflow; '
                    + 'menu and panel diagnostics copied with the same redaction'
                );
                console.log(`[smoke-userscript-settings] screenshots: ${OUT_DIR}`);
                return result;
            } catch (error) {
                console.warn(`[smoke-userscript-settings] ${candidate.label} failed: ${error.message || error}`);
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
