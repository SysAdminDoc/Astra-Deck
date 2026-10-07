#!/usr/bin/env node
'use strict';

// Live, isolated Chromium smoke for the sealed MAIN-world bridge.
//
// Unit tests build both worlds by hand, so they can't see how Chrome actually
// injects the content scripts. That gap hid a real outage: the channel module
// was listed in two content_scripts entries, Chrome ran it only in the first
// (ISOLATED) one, and every MAIN-world feature read nothing on real pages
// while the whole suite passed. This loads the staged extension into a
// disposable headless profile, opens public YouTube (so it needs a network),
// and checks the handoff from the page's side:
//
//   - the MAIN world has the channel module, the token is off <html>, and no
//     reader is reachable from page script;
//   - Force H.264, a MAIN-world feature, really changes what MediaSource
//     reports, and a page write to the plain attribute doesn't undo it;
//   - a navigate a page listener overhears carries a sealed sequence number
//     and no token, and YouTube's own in-app navigation is admitted;
//   - the token is set and gone again before the page's first script runs;
//   - no object on window, or one level inside one, looks like a reader.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
    browserCandidates,
    chromiumArgs,
    connectCdp,
    createChromiumStage,
    evaluate,
    extensionIdFromTarget,
    hasLoadExtensionPolicyBlock,
    killProcessTree,
    removeDirWithRetries,
    reserveLoopbackPort,
    sleep,
    waitForBackgroundTarget,
    waitForDevTools,
} = require('./smoke-chromium-optional-hosts');

const REPO_ROOT = path.join(__dirname, '..');
// Long-lived public videos: "Me at the zoo", then Gangnam Style.
const FIRST_VIDEO_ID = 'jNQXAC9IVRw';
const SECOND_VIDEO_ID = '9bZkp7q19f0';

function parseArgs(argv) {
    const options = { browser: '', keepStage: false, timeoutMs: 45000 };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--browser') options.browser = path.resolve(argv[++i] || '');
        else if (arg === '--keep-stage') options.keepStage = true;
        else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++i]) || options.timeoutMs;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function waitForExpression(client, expression, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            if (await evaluate(client, expression)) return;
        } catch (error) {
            lastError = error;
        }
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ''}`);
}

// Installed before the document exists, so it sees the token arrive and
// leave. The parser runs pending microtasks before it runs a parser-inserted
// script, so the first batch holding a <script> is read before that script.
const TOKEN_PROBE_SOURCE = `(() => {
    const probe = window.__astraTokenProbe = { tokenSet: false, tokenRemoved: false, sawScript: false, tokenAtFirstScript: null };
    new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === 'attributes' && record.attributeName === 'data-ytkit-bridge-token') {
                if (record.target.hasAttribute('data-ytkit-bridge-token')) probe.tokenSet = true;
                else probe.tokenRemoved = true;
            }
            if (!probe.sawScript && record.type === 'childList'
                && Array.from(record.addedNodes).some((node) => node.nodeName === 'SCRIPT')) {
                probe.sawScript = true;
                probe.tokenAtFirstScript = document.documentElement.hasAttribute('data-ytkit-bridge-token');
            }
        }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ytkit-bridge-token'] });
})();`;

function tokenProbeFailures(probe) {
    if (!probe) return ['token probe: the document_start probe never ran'];
    const failures = [];
    if (!probe.sawScript) failures.push('token probe: no page script was seen, so the timing went unchecked');
    if (!probe.tokenSet || !probe.tokenRemoved) {
        failures.push('token probe: the token was never set and taken, so the probe saw no handoff');
    }
    if (probe.tokenAtFirstScript) failures.push("token probe: the token was still on <html> when the page's first script ran");
    return failures;
}

function admissionFailures(before, after) {
    if (!Number.isSafeInteger(after) || after <= (Number.isSafeInteger(before) ? before : 0)) {
        return ['navigate: YouTube\'s own in-app navigation was never admitted as a sealed navigate'];
    }
    return [];
}

const PAGE_STATE_EXPRESSION = `(() => {
    const core = window.YTKitCore || {};
    const readerLike = Object.keys(core).filter((key) => {
        const value = core[key];
        return value && typeof value === 'object'
            && ('token' in value || 'admitNavigate' in value || 'isOwnNavigate' in value);
    });
    // Narrower than the YTKitCore check: plenty of page objects carry a
    // "token", but only a reader has the navigate pair or hasToken with sync.
    const looksLikeReader = (value) => {
        try {
            return !!value && (typeof value === 'object' || typeof value === 'function')
                && ('admitNavigate' in value || 'isOwnNavigate' in value || ('hasToken' in value && 'sync' in value));
        } catch (_) { return false; }
    };
    const windowReaders = [];
    for (const name of Object.getOwnPropertyNames(window)) {
        let value;
        try { value = window[name]; } catch (_) { continue; }
        if (looksLikeReader(value)) windowReaders.push(name);
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || value === window) continue;
        let inner = [];
        try { inner = Object.getOwnPropertyNames(value); } catch (_) { continue; }
        for (const key of inner) {
            let child;
            try { child = value[key]; } catch (_) { continue; }
            if (looksLikeReader(child)) windowReaders.push(name + '.' + key);
        }
    }
    return {
        windowReaders,
        navigatesAdmitted: (window.__ytkitMainRuntime || {}).navigatesAdmitted,
        channelModule: typeof core.createBridgeReader === 'function',
        publishedReader: core.mainBridgeReader !== undefined,
        readerLike,
        tokenOnHtml: document.documentElement.hasAttribute('data-ytkit-bridge-token'),
        codecAttr: document.documentElement.getAttribute('data-ytkit-codec'),
        vp9: MediaSource.isTypeSupported('video/webm; codecs="vp9"'),
        av1: MediaSource.isTypeSupported('video/mp4; codecs="av01.0.05M.08"'),
        h264: MediaSource.isTypeSupported('video/mp4; codecs="avc1.4d401f"'),
    };
})()`;

function pageStateFailures(state, label) {
    const failures = [];
    if (!state.channelModule) failures.push(`${label}: the MAIN world has no bridge channel module`);
    if (state.publishedReader) failures.push(`${label}: YTKitCore.mainBridgeReader is reachable from the page`);
    if (state.readerLike.length) failures.push(`${label}: reader-like objects on YTKitCore: ${state.readerLike.join(', ')}`);
    if (state.windowReaders?.length) {
        failures.push(`${label}: reader-like objects reachable from window: ${state.windowReaders.join(', ')}`);
    }
    if (state.tokenOnHtml) failures.push(`${label}: the bridge token is still on <html>, so the MAIN world never took it`);
    if (state.vp9 || state.av1) failures.push(`${label}: Force H.264 is on but MediaSource still offers VP9/AV1`);
    if (!state.h264) failures.push(`${label}: MediaSource refuses H.264`);
    return failures;
}

async function runCandidate(candidate, stageDir, options) {
    const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-main-bridge-profile-'));
    const port = await reserveLoopbackPort();
    const args = chromiumArgs(browserProfile, stageDir, { headed: false }, port);
    args.splice(args.length - 1, 0, '--mute-audio');
    const proc = spawn(candidate.path, args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    let client = null;
    let backgroundClient = null;
    try {
        await waitForDevTools(port, options.timeoutMs);
        const backgroundTarget = await waitForBackgroundTarget(port, options.timeoutMs);
        const extensionId = extensionIdFromTarget(backgroundTarget);
        backgroundClient = await connectCdp(backgroundTarget.webSocketDebuggerUrl);
        await backgroundClient.send('Runtime.enable');
        await evaluate(backgroundClient, `(async () => {
            const stored = await chrome.storage.local.get('ytSuiteSettings');
            const settings = stored.ytSuiteSettings && typeof stored.ytSuiteSettings === 'object'
                ? stored.ytSuiteSettings : {};
            await chrome.storage.local.set({ ytSuiteSettings: { ...settings, forceH264: true } });
            return true;
        })()`);

        // A blank tab first, so the token probe is in place before YouTube's
        // document exists.
        const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
            .then((response) => response.json());
        client = await connectCdp(created.webSocketDebuggerUrl);
        await client.send('Runtime.enable');
        await client.send('Page.enable');
        await client.send('Page.addScriptToEvaluateOnNewDocument', { source: TOKEN_PROBE_SOURCE });
        await client.send('Page.navigate', { url: `https://www.youtube.com/watch?v=${FIRST_VIDEO_ID}` });
        await waitForExpression(client,
            "document.documentElement.getAttribute('data-ytkit-codec') === 'h264'",
            options.timeoutMs, 'the isolated world to publish Force H.264');
        await sleep(500);

        const failures = [];
        const initial = await evaluate(client, PAGE_STATE_EXPRESSION);
        failures.push(...pageStateFailures(initial, 'first load'));
        failures.push(...tokenProbeFailures(await evaluate(client, 'window.__astraTokenProbe || null')));

        // A page script rewriting the plain attribute changes nothing the
        // bridge does; only the sealed copy counts.
        const forged = await evaluate(client, `new Promise((resolve) => {
            document.documentElement.setAttribute('data-ytkit-codec', 'auto');
            setTimeout(() => resolve({
                vp9: MediaSource.isTypeSupported('video/webm; codecs="vp9"'),
                av1: MediaSource.isTypeSupported('video/mp4; codecs="av01.0.05M.08"'),
            }), 500);
        })`);
        if (forged.vp9 || forged.av1) {
            failures.push('forged attribute: a page write to data-ytkit-codec turned VP9/AV1 back on');
        }

        // Overhear the next navigate from an ordinary page listener, then
        // take YouTube's own in-app route to the second video.
        await evaluate(client, `(() => {
            window.__astraBridgeSmokeHeard = [];
            window.addEventListener('ytkit-bridge-navigate', (event) => {
                const detail = event.detail;
                window.__astraBridgeSmokeHeard.push({
                    keys: Object.keys(detail || {}).sort(),
                    seq: detail && detail.seq,
                    hasToken: !!detail && Object.values(detail).some((value) =>
                        typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)),
                });
            });
            document.querySelector('ytd-app').dispatchEvent(new CustomEvent('yt-navigate', {
                bubbles: true,
                composed: true,
                detail: { endpoint: {
                    commandMetadata: { webCommandMetadata: {
                        url: '/watch?v=${SECOND_VIDEO_ID}',
                        webPageType: 'WEB_PAGE_TYPE_WATCH',
                        rootVe: 3832
                    } },
                    watchEndpoint: { videoId: '${SECOND_VIDEO_ID}' }
                } }
            }));
            return true;
        })()`);
        await waitForExpression(client,
            `location.search.includes('${SECOND_VIDEO_ID}') && window.__astraBridgeSmokeHeard.length > 0`,
            options.timeoutMs, 'an in-app navigation to the second video');
        await sleep(1500);
        const heard = await evaluate(client, 'window.__astraBridgeSmokeHeard');
        for (const entry of heard) {
            if (entry.hasToken) failures.push('navigate: a page listener read a token off the event');
            if (entry.keys.join(',') !== 'reason,seal,seq') {
                failures.push(`navigate: unexpected detail fields ${entry.keys.join(',')}`);
            }
            if (!Number.isSafeInteger(entry.seq)) failures.push('navigate: the event carries no sequence number');
        }

        const afterNavigate = await evaluate(client, PAGE_STATE_EXPRESSION);
        failures.push(...pageStateFailures(afterNavigate, 'after in-app navigation'));
        failures.push(...admissionFailures(initial.navigatesAdmitted, afterNavigate.navigatesAdmitted));

        if (failures.length) throw new Error(failures.join('\n'));
        return {
            browser: candidate.label,
            extensionId,
            navigates: heard.length,
            admitted: afterNavigate.navigatesAdmitted - (initial.navigatesAdmitted || 0)
        };
    } catch (error) {
        if (hasLoadExtensionPolicyBlock(stderr)) error.code = 'LOAD_EXTENSION_BLOCKED';
        throw error;
    } finally {
        client?.close();
        backgroundClient?.close();
        killProcessTree(proc);
        await removeDirWithRetries(browserProfile);
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const candidates = browserCandidates(options.browser);
    if (!candidates.length) throw new Error('No Chromium-family browser is available');
    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-main-bridge-stage-'));
    const { stageDir } = createChromiumStage(stageRoot);
    try {
        let lastError = null;
        for (const candidate of candidates) {
            try {
                const result = await runCandidate(candidate, stageDir, options);
                console.log(
                    `[smoke-main-bridge-live] PASS: ${result.browser} loaded ${result.extensionId}; `
                    + 'the MAIN world took the token, Force H.264 reached MediaSource, a forged attribute '
                    + `changed nothing, ${result.navigates} overheard navigate(s) carried no token, `
                    + `${result.admitted} were admitted, and the token was gone before the page's first script`
                );
                return result;
            } catch (error) {
                lastError = error;
                if (error.code === 'LOAD_EXTENSION_BLOCKED') continue;
                throw error;
            }
        }
        throw lastError || new Error('Every Chromium candidate rejected --load-extension');
    } finally {
        if (!options.keepStage) await removeDirWithRetries(stageRoot);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[smoke-main-bridge-live]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { admissionFailures, main, pageStateFailures, parseArgs, tokenProbeFailures };
