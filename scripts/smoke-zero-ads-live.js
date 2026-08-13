#!/usr/bin/env node
'use strict';

// Live, isolated Chromium smoke for the always-on zero-ad contract.
//
// This is intentionally outside `npm run check`: it opens public YouTube in a
// disposable browser profile and therefore needs a working network. It proves
// the packaged MV3 ruleset is enabled, captures cold-load network evidence,
// follows a real YouTube SPA link, verifies that known ad shells remain
// collapsed while search/player workflows survive, and opens the real settings
// surface to guard the desktop command-deck contract on a live host page.

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
    killProcessTree,
    removeDirWithRetries,
    reserveLoopbackPort,
    sleep,
    waitForBackgroundTarget,
    waitForDevTools,
} = require('./smoke-chromium-optional-hosts');

const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'zero-ad-live-smoke');
const AD_URL_RE = /(?:^|\.)doubleclick\.net\/|(?:^|\.)(?:googlesyndication|googleadservices|googletagservices|2mdn)\.com\/|(?:^|\.)google\.com\/pagead\/|(?:^|\.)youtube\.com\/(?:api\/stats\/ads|ptracking|get_midroll_info)/i;
const AD_SELECTORS = Object.freeze([
    '#masthead-ad',
    '#player-ads',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-ad-slot-renderer',
    'ytd-page-top-ad-layout-renderer',
    'ytd-promoted-video-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytm-promoted-sparkles-web-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-companion-slot-renderer',
    'ytd-player-legacy-desktop-watch-ads-renderer',
    '.video-ads',
    '.ytp-ad-module',
    '.ytp-ad-overlay-container',
    '.ytp-ad-player-overlay'
]);

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

async function waitForYoutubePage(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let targets = [];
    while (Date.now() < deadline) {
        targets = await fetchJsonFromDevTools(port, '/json/list');
        const page = targets.find(({ type, url }) =>
            type === 'page' && /^https:\/\/(?:www\.)?youtube\.com\//.test(String(url)));
        if (page) return page;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for YouTube page target; saw ${targets.map(({ type, url }) => `${type}:${url}`).join(', ')}`);
}

async function waitForExpression(client, expression, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(client, expression).catch(() => false)) return;
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

function adEvents(events, startIndex = 0) {
    const requests = new Map();
    const responses = [];
    const failures = [];
    for (const event of events.slice(startIndex)) {
        const params = event.params || {};
        if (event.method === 'Network.requestWillBeSent') {
            const url = params.request?.url || '';
            if (AD_URL_RE.test(new URL(url).hostname + new URL(url).pathname)) {
                requests.set(params.requestId, { url, type: params.type || '' });
            }
        } else if (event.method === 'Network.responseReceived') {
            const request = requests.get(params.requestId);
            if (request) responses.push({ ...request, status: params.response?.status || 0 });
        } else if (event.method === 'Network.loadingFailed') {
            const request = requests.get(params.requestId);
            if (request) {
                failures.push({
                    ...request,
                    blockedReason: params.blockedReason || '',
                    errorText: params.errorText || ''
                });
            }
        }
    }
    return { requests: [...requests.values()], responses, failures };
}

async function pageSnapshot(client, routeName) {
    const snapshot = await evaluate(client, `(() => {
        const selectors = ${JSON.stringify(AD_SELECTORS)};
        const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity || 1) > 0
                && rect.width > 0
                && rect.height > 0;
        };
        const shells = selectors.map((selector) => {
            const nodes = Array.from(document.querySelectorAll(selector));
            return {
                selector,
                count: nodes.length,
                visible: nodes.filter(visible).length,
                nonCollapsed: nodes.filter((node) => node.getBoundingClientRect().height > 0).length
            };
        }).filter(({ count }) => count > 0);
        return {
            href: location.href,
            title: document.title,
            route: document.querySelector('ytd-page-manager > *.style-scope:not([hidden])')?.tagName || '',
            astraTrigger: Boolean(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn')),
            masthead: Boolean(document.querySelector('ytd-masthead, #masthead')),
            search: Boolean(document.querySelector('yt-searchbox input, input#search')),
            feedCards: document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length,
            player: Boolean(document.querySelector('#movie_player, ytd-player')),
            video: Boolean(document.querySelector('video.html5-main-video')),
            shells
        };
    })()`);
    const failures = [];
    if (!snapshot.astraTrigger) failures.push(`${routeName}: Astra content runtime did not create its settings trigger`);
    if (!snapshot.masthead || !snapshot.search) failures.push(`${routeName}: core masthead/search workflow is unavailable`);
    for (const shell of snapshot.shells) {
        if (shell.visible || shell.nonCollapsed) {
            failures.push(`${routeName}: ${shell.selector} retained visible or non-collapsed ad space`);
        }
    }
    if (routeName === 'watch' && (!snapshot.player || !snapshot.video)) {
        failures.push('watch: player/video workflow is unavailable after SPA navigation');
    }
    return { failures, snapshot };
}

async function capture(client, name) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(shot.data, 'base64'));
}

async function verifyLiveSettings(client, timeoutMs) {
    const opened = await evaluate(client, `(() => {
        const trigger = document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn');
        if (!trigger) return false;
        trigger.click();
        return true;
    })()`);
    if (!opened) throw new Error('Could not open Astra settings from its live YouTube trigger');
    await waitForExpression(
        client,
        "Boolean(document.querySelector('#ytkit-settings-panel'))",
        timeoutMs,
        'Astra settings panel'
    );
    const selectedVideoHider = await evaluate(client, `(() => {
        const tab = document.querySelector('#ytkit-tab-Video-Hider');
        if (!tab) return false;
        tab.click();
        return true;
    })()`);
    if (!selectedVideoHider) throw new Error('Live settings panel is missing the Video Hider category');
    await waitForExpression(
        client,
        "document.querySelector('#ytkit-tab-Video-Hider')?.classList.contains('active')",
        timeoutMs,
        'Video Hider settings category'
    );
    const snapshot = await evaluate(client, `(() => {
        const panel = document.querySelector('#ytkit-settings-panel');
        const pane = document.querySelector('#ytkit-pane-Video-Hider');
        const visible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const clippedLabels = Array.from(panel?.querySelectorAll('.ytkit-nav-label, .ytkit-nav-meta, .ytkit-pane-context-value') || [])
            .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
            .map((node) => node.textContent.trim());
        const summaryCards = Array.from(pane?.querySelectorAll('.ytkit-vh-summary-card') || []);
        return {
            panelVisible: Boolean(panel && visible(panel)),
            width: panel?.getBoundingClientRect().width || 0,
            height: panel?.getBoundingClientRect().height || 0,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            paneVisible: Boolean(pane && visible(pane)),
            missionIcon: Boolean(pane?.querySelector('.ytkit-pane-lead .ytkit-pane-icon svg')),
            summaryCount: summaryCards.length,
            summaryLabels: summaryCards.map((card) => card.querySelector('.ytkit-vh-summary-card__label')?.textContent.trim() || ''),
            summaryValues: summaryCards.map((card) => card.querySelector('.ytkit-vh-summary-card__value')?.textContent.trim() || ''),
            clippedLabels
        };
    })()`);
    const failures = [];
    if (!snapshot.panelVisible || !snapshot.paneVisible) failures.push('live settings: panel or Video Hider pane is not visible');
    if (!snapshot.missionIcon) failures.push('live settings: Video Hider mission icon is missing');
    if (snapshot.summaryCount !== 3) failures.push(`live settings: expected 3 summary cards, found ${snapshot.summaryCount}`);
    if (snapshot.summaryLabels.some((label) => !label)) failures.push('live settings: a summary card has no label');
    if (snapshot.summaryValues.some((value) => !value)) failures.push('live settings: a summary card has no value');
    if (snapshot.clippedLabels.length) failures.push(`live settings: clipped labels: ${snapshot.clippedLabels.join(', ')}`);
    if (snapshot.width > snapshot.viewportWidth || snapshot.height > snapshot.viewportHeight) {
        failures.push('live settings: command deck exceeds the desktop viewport');
    }
    await capture(client, 'settings-video-hider-1440x900');
    await evaluate(client, "document.querySelector('#ytkit-settings-panel .ytkit-close, #ytkit-close-footer')?.click()")
        .catch(() => undefined);
    if (failures.length) throw new Error(failures.join('\n'));
    return snapshot;
}

async function runCandidate(candidate, stageDir, options) {
    const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-zero-ad-profile-'));
    const port = await reserveLoopbackPort();
    const browserOptions = { headed: false };
    const args = chromiumArgs(browserProfile, stageDir, browserOptions, port);
    args[args.length - 1] = `https://www.youtube.com/?astra_zero_ad_smoke=${Date.now()}`;
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
        const enabledRulesets = await evaluate(
            backgroundClient,
            'chrome.declarativeNetRequest.getEnabledRulesets()'
        );
        if (!enabledRulesets.includes('astra_zero_ads')) {
            throw new Error(`MV3 zero-ad ruleset is not enabled: ${JSON.stringify(enabledRulesets)}`);
        }

        const pageTarget = await waitForYoutubePage(port, options.timeoutMs);
        client = await connectCdp(pageTarget.webSocketDebuggerUrl);
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Network.enable');
        await client.send('Network.setCacheDisabled', { cacheDisabled: true });
        await client.send('Emulation.setDeviceMetricsOverride', {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false
        });

        const coldStart = client.events.length;
        await client.send('Network.clearBrowserCache');
        await client.send('Page.navigate', {
            url: `https://www.youtube.com/?astra_zero_ad_cold=${Date.now()}`
        });
        await waitForExpression(
            client,
            "Boolean(document.querySelector('ytd-app') && document.querySelector('ytd-masthead, #masthead'))",
            options.timeoutMs,
            'cold YouTube home shell'
        );
        await waitForExpression(
            client,
            "Boolean(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn'))",
            options.timeoutMs,
            'Astra content runtime'
        );
        const liveSettings = await verifyLiveSettings(client, options.timeoutMs);
        await sleep(5000);
        const home = await pageSnapshot(client, 'home');
        await capture(client, 'home-1440x900');
        const coldNetwork = adEvents(client.events, coldStart);

        // A logged-out fresh profile may show an intentionally empty home.
        // Search is read-only and reliably supplies a native watch link, which
        // lets the smoke exercise YouTube's real client-side route transition.
        await client.send('Page.navigate', {
            url: 'https://www.youtube.com/results?search_query=open+source+browser+extensions'
        });
        await waitForExpression(
            client,
            "Boolean(document.querySelector('a[href*=" + JSON.stringify('/watch?v=') + "]'))",
            options.timeoutMs,
            'a search-result watch link'
        );
        const spaStart = client.events.length;
        const clicked = await evaluate(client, `(() => {
            const link = Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
                .find((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
            if (!link) return false;
            link.click();
            return true;
        })()`);
        if (!clicked) throw new Error('Could not click a visible native watch link for SPA verification');
        await waitForExpression(
            client,
            "location.pathname === '/watch' && Boolean(document.querySelector('video.html5-main-video'))",
            options.timeoutMs,
            'SPA watch navigation and player'
        );
        await sleep(5000);
        const watch = await pageSnapshot(client, 'watch');
        await capture(client, 'watch-1440x900');
        const spaNetwork = adEvents(client.events, spaStart);

        const allResponses = [...coldNetwork.responses, ...spaNetwork.responses];
        const failures = [...home.failures, ...watch.failures];
        if (allResponses.length) {
            failures.push(`ad request received a response: ${allResponses.map(({ url, status }) => `${status} ${url}`).join(', ')}`);
        }
        const allBlocked = [...coldNetwork.failures, ...spaNetwork.failures].filter(({ errorText, blockedReason }) =>
            /BLOCKED_BY_CLIENT/i.test(errorText) || /(?:other|inspector)/i.test(blockedReason));
        if (!allBlocked.length) {
            failures.push('no captured ad request reported a browser-level blocked outcome');
        }
        if (failures.length) throw new Error(failures.join('\n'));

        return {
            browser: candidate.label,
            extensionId,
            enabledRulesets,
            home: home.snapshot,
            watch: watch.snapshot,
            liveSettings,
            blockedRequests: allBlocked,
            coldAdRequests: coldNetwork.requests.length,
            spaAdRequests: spaNetwork.requests.length
        };
    } catch (error) {
        if (hasLoadExtensionPolicyBlock(stderr)) error.code = 'LOAD_EXTENSION_BLOCKED';
        error.stderr = stderr;
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
    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-zero-ad-stage-'));
    const { stageDir } = createChromiumStage(stageRoot);
    try {
        let lastError = null;
        for (const candidate of candidates) {
            try {
                const result = await runCandidate(candidate, stageDir, options);
                console.log(
                    `[smoke-zero-ads-live] PASS — ${result.browser} loaded ${result.extensionId}; `
                    + `${result.enabledRulesets.join(', ')} enabled; ${result.blockedRequests.length} ad request(s) blocked; `
                    + 'home + SPA watch shells collapsed; live settings + masthead/search/player intact'
                );
                console.log(`[smoke-zero-ads-live] screenshots: ${OUT_DIR}`);
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
        console.error('[smoke-zero-ads-live]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { AD_SELECTORS, AD_URL_RE, adEvents, main, pageSnapshot, parseArgs, verifyLiveSettings };
