#!/usr/bin/env node
'use strict';

// Live Chromium coverage for the all_frames live-chat content-script lane.
// A disposable profile discovers a currently live YouTube result, opens its
// watch page, and proves the real chat iframe received Astra's runtime.

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
    fetchJsonFromDevTools,
    hasLoadExtensionPolicyBlock,
    removeDirWithRetries,
    reserveLoopbackPort,
    shutdownChromiumProcess,
    sleep,
    waitForBackgroundTarget,
    waitForDevTools,
} = require('./smoke-chromium-optional-hosts');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'live-chat-smoke');
const RUNTIME_ATTRIBUTE = 'data-ytkit-live-chat-runtime';
const LIVE_SEARCH_URL = 'https://www.youtube.com/results?search_query=live+news&sp=EgJAAQ%3D%3D';

function parseArgs(argv) {
    const options = { browser: '', keepStage: false, mutateRuntime: false, timeoutMs: 60000 };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--browser') options.browser = path.resolve(argv[++index] || '');
        else if (arg === '--keep-stage') options.keepStage = true;
        else if (arg === '--mutate-runtime') options.mutateRuntime = true;
        else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]) || options.timeoutMs;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

async function waitForValue(read, timeoutMs, label, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs;
    let lastValue = null;
    while (Date.now() < deadline) {
        lastValue = await read().catch(() => null);
        if (lastValue) return lastValue;
        await sleep(intervalMs);
    }
    throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(lastValue)}`);
}

async function waitForYoutubePage(port, timeoutMs) {
    return waitForValue(async () => {
        const targets = await fetchJsonFromDevTools(port, '/json/list');
        return targets.find(({ type, url }) => type === 'page'
            && /^https:\/\/(?:www\.)?youtube\.com\//.test(String(url))) || null;
    }, timeoutMs, 'the YouTube live-search page target');
}

function validateLiveChatSnapshot(snapshot) {
    const failures = [];
    if (!snapshot?.framePresent) failures.push('watch page has no live-chat iframe');
    if (!/^https:\/\/(?:www\.)?youtube\.com\/live_chat/.test(snapshot?.frameUrl || '')) {
        failures.push(`chat frame URL is ${JSON.stringify(snapshot?.frameUrl || '')}`);
    }
    if (!snapshot?.sameOrigin) failures.push('chat frame document is not reachable from the watch page');
    if (!snapshot?.chatRootPresent) failures.push('live-chat document has no chat application root');
    if (snapshot?.runtimeState !== 'active') {
        failures.push(`Astra live-chat runtime marker is ${JSON.stringify(snapshot?.runtimeState || '')}`);
    }
    if (failures.length) throw new Error(failures.join('; '));
    return true;
}

function liveResultExpression() {
    return `(() => {
        const links = [];
        const seen = new Set();
        const filteredToLive = new URL(location.href).searchParams.get('sp') === 'EgJAAQ==';
        for (const link of document.querySelectorAll(
            'ytd-video-renderer a[href*="/watch?v="], '
                + 'ytd-rich-item-renderer a[href*="/watch?v="], '
                + 'yt-lockup-view-model a[href*="/watch?v="]'
        )) {
            const card = link.closest('ytd-video-renderer, ytd-rich-item-renderer, yt-lockup-view-model');
            if (!card) continue;
            const structuralLive = card.querySelector(
                '.badge-style-type-live-now, [class*="badge-style-type-live-now"], '
                    + 'yt-badge-view-model[is-live], [aria-label*="live" i]'
            );
            const visibleLive = /(^|\\s)live(\\s|$)/i.test(card.textContent || '');
            if (!filteredToLive && !structuralLive && !visibleLive) continue;
            const href = new URL(link.getAttribute('href'), location.href).href;
            if (seen.has(href)) continue;
            seen.add(href);
            links.push(href);
            if (links.length === 8) break;
        }
        return links;
    })()`;
}

function liveChatSnapshotExpression() {
    return `(() => {
        const frame = Array.from(document.querySelectorAll(
            'ytd-live-chat-frame iframe#chatframe, iframe#chatframe[src*="/live_chat"], #astra-live-chat-smoke-frame'
        )).find((candidate) => (candidate.src || '').includes('/live_chat')) || null;
        const frameUrl = frame?.src || '';
        let doc = null;
        let sameOrigin = false;
        try {
            doc = frame?.contentDocument || null;
            sameOrigin = Boolean(doc?.documentElement);
        } catch (_) {
            sameOrigin = false;
        }
        return {
            chatRootPresent: Boolean(doc?.querySelector('yt-live-chat-app, yt-live-chat-renderer')),
            framePresent: Boolean(frame?.isConnected),
            frameMode: frame?.id === 'astra-live-chat-smoke-frame' ? 'probe' : 'native',
            frameUrl,
            readyState: doc?.readyState || '',
            runtimeState: doc?.documentElement?.getAttribute(${JSON.stringify(RUNTIME_ATTRIBUTE)}) || '',
            sameOrigin,
            watchUrl: location.href,
        };
    })()`;
}

async function ensureLiveChatFrame(client, candidateUrl) {
    const videoId = new URL(candidateUrl).searchParams.get('v') || '';
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
        throw new Error(`Live result has no valid video id: ${candidateUrl}`);
    }
    return evaluate(client, `(() => {
        const nativeFrame = Array.from(document.querySelectorAll(
            'ytd-live-chat-frame iframe#chatframe, iframe#chatframe[src*="/live_chat"]'
        )).find((frame) => (frame.src || '').includes('/live_chat'));
        if (nativeFrame) return 'native';
        document.getElementById('astra-live-chat-smoke-frame')?.remove();
        const frame = document.createElement('iframe');
        frame.id = 'astra-live-chat-smoke-frame';
        frame.title = 'Astra live chat smoke';
        frame.src = new URL('/live_chat?v=${videoId}&is_popout=1', location.origin).href;
        Object.assign(frame.style, {
            position: 'fixed',
            inset: '80px 24px 24px auto',
            width: '420px',
            height: '720px',
            zIndex: '2147483647',
            border: '2px solid #ff5d4a',
            background: '#07090d'
        });
        document.body.appendChild(frame);
        return 'probe';
    })()`);
}

async function discoverLiveCandidates(client, timeoutMs) {
    await client.send('Page.navigate', { url: `${LIVE_SEARCH_URL}&astra_live_chat=${Date.now()}` });
    await waitForValue(
        () => evaluate(client, "document.readyState === 'complete' || Boolean(document.querySelector('ytd-app'))"),
        timeoutMs,
        'the live-search YouTube shell'
    );
    try {
        return await waitForValue(
            () => evaluate(client, liveResultExpression()).then((links) => links?.length ? links : null),
            timeoutMs,
            'a structurally live YouTube search result'
        );
    } catch (error) {
        const diagnostic = await evaluate(client, `(() => ({
            href: location.href,
            title: document.title,
            text: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 500),
            renderers: document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer, yt-lockup-view-model').length,
            watchLinks: document.querySelectorAll('a[href*="/watch?v="]').length
        }))()`).catch(() => null);
        throw new Error(`${error.message}; page diagnostic: ${JSON.stringify(diagnostic)}`);
    }
}

async function openLiveChatFrame(client, candidates, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastSnapshot = null;
    for (const candidateUrl of candidates) {
        if (Date.now() >= deadline) break;
        await client.send('Page.navigate', { url: candidateUrl });
        const candidateBudget = Math.min(12000, Math.max(2500, deadline - Date.now()));
        try {
            await waitForValue(
                () => evaluate(client, "Boolean(document.querySelector('ytd-app'))"),
                Math.min(8000, candidateBudget),
                `the watch shell for ${candidateUrl}`
            );
            await ensureLiveChatFrame(client, candidateUrl);
            lastSnapshot = await waitForValue(async () => {
                const snapshot = await evaluate(client, liveChatSnapshotExpression());
                lastSnapshot = snapshot;
                try {
                    validateLiveChatSnapshot(snapshot);
                    return snapshot;
                } catch (_) {
                    // reason: polling continues until the frame and runtime are both ready.
                    return null;
                }
            }, candidateBudget, `Astra attachment in ${candidateUrl}`);
            return lastSnapshot;
        } catch (_) {
            // reason: some live streams disable chat. Try the next live result while
            // preserving the last observed frame state for the final error.
        }
    }
    validateLiveChatSnapshot(lastSnapshot);
    throw new Error('No live result exposed an attachable chat frame');
}

async function capture(client) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const image = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(OUT_DIR, 'live-chat-frame.png'), Buffer.from(image.data, 'base64'));
}

async function runCandidate(candidate, stageDir, options) {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-live-chat-profile-'));
    const port = await reserveLoopbackPort();
    const args = chromiumArgs(profileDir, stageDir, { headed: false }, port);
    args[args.length - 1] = LIVE_SEARCH_URL;
    const browser = spawn(candidate.path, args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    let stderr = '';
    browser.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    let client = null;
    let browserClient = null;
    try {
        await waitForDevTools(port, options.timeoutMs);
        const version = await fetchJsonFromDevTools(port, '/json/version');
        browserClient = await connectCdp(version.webSocketDebuggerUrl);
        const backgroundTarget = await waitForBackgroundTarget(port, options.timeoutMs);
        const extensionId = extensionIdFromTarget(backgroundTarget);
        const page = await waitForYoutubePage(port, options.timeoutMs);
        client = await connectCdp(page.webSocketDebuggerUrl);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
        });
        const candidates = await discoverLiveCandidates(client, options.timeoutMs);
        const snapshot = await openLiveChatFrame(client, candidates, options.timeoutMs);
        await capture(client);
        return { browser: candidate.label, extensionId, snapshot };
    } catch (error) {
        if (hasLoadExtensionPolicyBlock(stderr)) error.code = 'LOAD_EXTENSION_BLOCKED';
        error.stderr = stderr;
        throw error;
    } finally {
        client?.close();
        await shutdownChromiumProcess(browser, browserClient);
        browserClient?.close();
        await sleep(750);
        await removeDirWithRetries(profileDir);
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const candidates = browserCandidates(options.browser);
    if (!candidates.length) throw new Error('No Chromium-family browser is available');
    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-live-chat-stage-'));
    const { stageDir } = createChromiumStage(stageRoot);
    if (options.mutateRuntime) {
        fs.writeFileSync(path.join(stageDir, 'live-chat.js'), `'use strict';\n`, 'utf8');
    }
    try {
        let lastError = null;
        for (const candidate of candidates) {
            try {
                const result = await runCandidate(candidate, stageDir, options);
                console.log(
                    `[smoke-live-chat] PASS — ${result.browser} loaded ${result.extensionId}; `
                    + `runtime attached inside ${result.snapshot.frameUrl}`
                );
                console.log(`[smoke-live-chat] screenshot: ${OUT_DIR}`);
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
        console.error('[smoke-live-chat]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    LIVE_SEARCH_URL,
    RUNTIME_ATTRIBUTE,
    liveChatSnapshotExpression,
    liveResultExpression,
    main,
    parseArgs,
    validateLiveChatSnapshot,
};
