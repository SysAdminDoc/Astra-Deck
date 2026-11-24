'use strict';

// Live check of the extension against the Astra Downloader installed on this
// machine: the Download button on a real watch page, pairing, the token over
// native messaging, the format probe and one short download followed to
// Complete.
//
//   node scripts/smoke-companion-live.js                 press Download on a 19 second video
//   node scripts/smoke-companion-live.js --no-download   stop once the popup has read the formats
//   node scripts/smoke-companion-live.js --extension <dir> --browser <chrome.exe> --video <url>
//
// This is the one smoke that is meant to reach the real downloader, so it does
// not launch through chromiumArgs(): scripts/companion-fence.js exists to keep
// every other smoke away from it. It loads the refreshed unpacked copy from its
// own folder instead of staging a temp copy, so the extension ID is the one a
// browser reload of that folder has, and the pairing it leaves behind is one a
// real first use creates anyway. The profile is a throwaway and the browser is
// headless.
//
// The downloader has to be installed and running. The check reads its token
// from config.json to compare the history list before and after; the token is
// never printed. The downloaded test file is deleted afterwards (--keep-file
// leaves it); the history row stays.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
    connectCdp,
    evaluate,
    extensionIdFromTarget,
    fetchJsonFromDevTools,
    removeDirWithRetries,
    reserveLoopbackPort,
    shutdownChromiumProcess,
    sleep,
    waitForBackgroundTarget,
    waitForDevTools,
} = require('./smoke-chromium-optional-hosts');
const companionPorts = require('../extension/core/companion-ports');

const args = process.argv.slice(2);
const option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const EXTENSION_DIR = path.resolve(option('--extension',
    process.env.ASTRA_UNPACKED_DIR || path.join(LOCAL_APP_DATA, 'Astra-Deck', 'unpacked', 'chrome')));
const DOWNLOADER_DIR = path.resolve(option('--downloader-dir', path.join(LOCAL_APP_DATA, 'AstraDownloader')));
const VIDEO_URL = option('--video', 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
const DOWNLOAD = !args.includes('--no-download');
const KEEP_FILE = args.includes('--keep-file');
const BASE = `http://${companionPorts.host}:${companionPorts.primaryPort}`;
const NATIVE_HOST = 'com.astra.deck.downloader';

const results = [];
function note(label, ok, detail = '') {
    results.push({ label, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`);
}
function info(label, detail) {
    console.log(`INFO ${label}: ${detail}`);
}

// Newest Playwright Chromium on this machine. Branded Chrome 137+ refuses
// --load-extension, so the system browser is never a candidate here.
function defaultBrowser() {
    const root = path.join(LOCAL_APP_DATA, 'ms-playwright');
    if (!fs.existsSync(root)) return '';
    const builds = fs.readdirSync(root)
        .map((name) => /^chromium-(\d+)$/.exec(name))
        .filter(Boolean)
        .sort((a, b) => Number(b[1]) - Number(a[1]));
    for (const build of builds) {
        const binary = path.join(root, build[0], 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(binary)) return binary;
    }
    return '';
}

function downloaderConfig() {
    return JSON.parse(fs.readFileSync(path.join(DOWNLOADER_DIR, 'config.json'), 'utf8'));
}

async function downloaderHistory() {
    const response = await fetch(`${BASE}/history?limit=5`, {
        headers: { 'X-MDL-Client': 'MediaDL', 'X-Auth-Token': downloaderConfig().ServerToken || '' },
    });
    if (!response.ok) throw new Error(`/history answered HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body.history) ? body.history : [];
}

async function waitFor(client, expression, timeoutMs, everyMs = 500) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
        try {
            last = await evaluate(client, expression);
        } catch (_) {
            // reason: the page is mid-navigation and has no context to evaluate in yet
            last = null;
        }
        if (last) return last;
        await sleep(everyMs);
    }
    return last;
}

const UI_STATE = `(() => {
    const text = (selector) => {
        const el = document.querySelector(selector);
        return el ? (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400) : null;
    };
    return {
        popup: text('.ytkit-dl-popup'),
        progressState: text('.ytkit-dl-progress__state'),
        progressTitle: text('.ytkit-dl-progress__title'),
        progressCopy: text('.ytkit-dl-progress__status-copy'),
        prompt: text('#ytkit-install-prompt-desc'),
    };
})()`;

// Asked from the worker itself, the way background.js asks. Reports whether a
// token came back, never the token.
const NATIVE_PROBE = `new Promise((resolve) => {
    let done = false;
    const finish = (value) => { if (!done) { done = true; resolve(value); } };
    try {
        const port = chrome.runtime.connectNative(${JSON.stringify(NATIVE_HOST)});
        const timer = setTimeout(() => {
            try { port.disconnect(); } catch (_) { /* reason: already disconnected */ }
            finish({ ok: false, error: 'timeout' });
        }, 12000);
        port.onMessage.addListener((reply) => {
            clearTimeout(timer);
            try { port.disconnect(); } catch (_) { /* reason: already disconnected */ }
            finish({
                ok: Boolean(reply && reply.ok),
                hasToken: typeof (reply && reply.token) === 'string' && reply.token.length > 0,
                service: (reply && reply.service) || null,
                api: reply && reply.api != null ? reply.api : null,
                error: (reply && reply.error) || null,
            });
        });
        port.onDisconnect.addListener(() => {
            clearTimeout(timer);
            finish({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'disconnected' });
        });
        port.postMessage({ type: 'get-token' });
    } catch (error) {
        finish({ ok: false, error: String((error && error.message) || error) });
    }
})`;

async function followDownload(pageClient) {
    const seen = new Set();
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
        let state = null;
        try {
            state = await evaluate(pageClient, UI_STATE);
        } catch (_) {
            // reason: a navigation between polls leaves one poll without a context
            state = null;
        }
        if (state) {
            const line = JSON.stringify({ state: state.progressState, copy: state.progressCopy, prompt: state.prompt });
            if (!seen.has(line)) {
                seen.add(line);
                info('progress', line);
            }
            if (state.prompt) return state;
            if (/complete|needs attention|nothing downloaded|unknown|lost/i.test(state.progressState || '')) return state;
        }
        await sleep(1000);
    }
    return null;
}

async function run(browserBinary, profileDir) {
    const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
    info('extension', `${EXTENSION_DIR} v${manifest.version}`);
    const health = await fetch(`${BASE}/health`, { headers: { 'X-MDL-Client': 'MediaDL' } }).then((response) => response.json());
    info('downloader', `v${health.version} api ${health.api}, accepts clients from api ${health.minimumClientApi}`);
    const historyBefore = await downloaderHistory();

    const port = await reserveLoopbackPort();
    const proc = spawn(browserBinary, [
        `--user-data-dir=${profileDir}`,
        `--load-extension=${EXTENSION_DIR}`,
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--remote-debugging-port=${port}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--mute-audio',
        '--window-size=1400,900',
        '--headless=new',
        '--disable-gpu',
        '--renderer-process-limit=3',
        'about:blank',
    ], { windowsHide: true, stdio: 'ignore' });
    os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    let browserClient = null;
    let pageClient = null;
    let workerClient = null;
    try {
        await waitForDevTools(port, 30000);
        const version = await fetchJsonFromDevTools(port, '/json/version');
        info('browser', version.Browser);
        browserClient = await connectCdp(version.webSocketDebuggerUrl);
        const background = await waitForBackgroundTarget(port, 30000);
        const extensionId = extensionIdFromTarget(background);
        info('extension id', extensionId);
        workerClient = await connectCdp(background.webSocketDebuggerUrl);
        await workerClient.send('Runtime.enable');
        info('native host before the popup', JSON.stringify(await evaluate(workerClient, NATIVE_PROBE)));

        const created = await browserClient.send('Target.createTarget', { url: VIDEO_URL });
        const targets = await fetchJsonFromDevTools(port, '/json/list');
        pageClient = await connectCdp(targets.find((entry) => entry.id === created.targetId).webSocketDebuggerUrl);
        await pageClient.send('Page.enable');
        await pageClient.send('Runtime.enable');

        const hasButton = await waitFor(pageClient, 'Boolean(document.querySelector(".ytkit-local-dl-btn, .ytkit-download-btn"))', 60000);
        note('the Download button is on the watch page', Boolean(hasButton), await evaluate(pageClient, 'document.title'));
        if (!hasButton) return;

        await evaluate(pageClient, 'document.querySelector(".ytkit-local-dl-btn, .ytkit-download-btn").click(); true');
        const hasPopup = await waitFor(pageClient, 'Boolean(document.querySelector(".ytkit-dl-popup .ytkit-dl-popup__go"))', 15000);
        note('the download popup opens', Boolean(hasPopup));
        if (!hasPopup) return;
        // The quality row fills in only after /formats answered a request that
        // carried the token, so it proves detection, pairing and auth together.
        const formats = await waitFor(pageClient, `(() => {
            const popup = document.querySelector('.ytkit-dl-popup');
            const match = /(\\d+) formats/.exec(popup ? popup.innerText : '');
            return match ? match[0] : '';
        })()`, 30000);
        const afterProbe = await evaluate(pageClient, UI_STATE);
        note('the popup reads the format list through the downloader', Boolean(formats), formats || afterProbe.prompt || (afterProbe.popup || '').slice(0, 160));

        if (DOWNLOAD) {
            await evaluate(pageClient, 'document.querySelector(".ytkit-dl-popup .ytkit-dl-popup__go").click(); true');
            const final = await followDownload(pageClient);
            note('the progress card reaches Complete', Boolean(final && /complete/i.test(final.progressState || '')),
                final ? `${final.progressState}: ${final.progressCopy || final.prompt || ''}` : 'timed out after 4 minutes');
            const known = new Set(historyBefore.map((entry) => entry.id));
            const fresh = (await downloaderHistory()).filter((entry) => !known.has(entry.id));
            note('the downloader recorded the download', fresh.length >= 1, fresh.map((entry) => `${entry.status} | ${entry.title}`).join(' ;; '));
            for (const entry of fresh) {
                const file = String(entry.filename || '');
                if (!file) continue;
                const onDisk = fs.existsSync(file);
                note('the file is on disk', onDisk, onDisk ? `${fs.statSync(file).size} bytes` : file);
                if (onDisk && !KEEP_FILE) fs.rmSync(file, { force: true });
            }
        }

        const native = await evaluate(workerClient, NATIVE_PROBE);
        note('the native host hands this copy a token', Boolean(native.ok && native.hasToken), JSON.stringify(native));
        const saved = String(downloaderConfig().NativeChromeExtensionIds || '');
        note('the downloader has this copy in its pairing list', saved.includes(extensionId));
    } finally {
        for (const client of [pageClient, workerClient]) {
            try {
                if (client) client.close();
            } catch (_) {
                // reason: the socket is already closed when the browser went first
            }
        }
        await shutdownChromiumProcess(proc, browserClient, 5000).catch((error) => info('shutdown', error.message));
        try {
            if (browserClient) browserClient.close();
        } catch (_) {
            // reason: the socket is already closed when the browser went first
        }
    }
}

async function main() {
    const browserBinary = option('--browser', defaultBrowser());
    if (!browserBinary || !fs.existsSync(browserBinary)) {
        throw new Error('Pass --browser with a Chromium binary that allows unpacked extensions');
    }
    if (!fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
        throw new Error(`no extension at ${EXTENSION_DIR}; run npm run refresh:extension or pass --extension`);
    }
    if (!fs.existsSync(path.join(DOWNLOADER_DIR, 'config.json'))) {
        throw new Error(`Astra Downloader isn't installed at ${DOWNLOADER_DIR}`);
    }
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-companion-live-'));
    try {
        await run(browserBinary, path.join(temp, 'profile'));
    } finally {
        await removeDirWithRetries(temp).catch((error) => info('cleanup', error.message));
    }
    if (!results.length) throw new Error('no check ran');
    const failed = results.filter((entry) => !entry.ok);
    console.log(failed.length ? `FAILED: ${failed.map((entry) => entry.label).join('; ')}` : `all ${results.length} checks passed`);
    return failed.length ? 1 : 0;
}

if (require.main === module) {
    main().then((code) => process.exit(code)).catch((error) => {
        console.error(`ERROR ${(error && error.stack) || error}`);
        process.exit(2);
    });
}

module.exports = { defaultBrowser };
