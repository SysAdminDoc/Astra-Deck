#!/usr/bin/env node
'use strict';

// Private-window fence, in real private windows.
//
// tests/private-context.test.js and the private cases in background.test.js
// prove the fence against mocks. This lane opens a private window in Chrome
// for Testing and in Firefox with the extension allowed there and checks the
// browser's own behavior:
//   - play a video, add it to the Watch Feed and save a bookmark in the
//     private tab: regular chrome.storage.local stays byte-identical, the
//     private tab reads its own copy, and a fresh private window after the
//     first one closes reads none of it
//   - with distinct regular and private sentinel cookies seeded, the cookie
//     handoff from the private tab returns only the private store's, and a
//     regular tab's returns only the regular store's
//   - a transcript-style EXT_FETCH from the private tab goes out without
//     cookies, while the same request from a regular tab carries them
//
// The messages go out from the extension's own isolated world in the real
// tab, so the background sees a genuine private sender. Chrome reaches that
// world over CDP. Firefox has no remote access to content-script realms, so
// its stage adds `scripting` (smoke stage only, never the shipped manifest)
// and the lane injects from a regular extension page.
//
// The capability is minted by the background's own
// issueCookieHandoffCapability() for the connecting port's sender, which
// stands in for the companion's NATIVE_MSG_GET_TOKEN reply. This machine's
// real companion is a registered native host, and the lane never talks to it.
//
// Chrome gets "Allow in Incognito" through chrome://extensions'
// developerPrivate call, which disables the unpacked extension, so the lane
// enables it again. Firefox installs the stage with private browsing allowed.
//
// The violentmonkey and tampermonkey lanes repeat the storage half with the
// shipped split userscript under each signed manager build, reading the
// manager's own GM value store before and after.
//
// Usage: node scripts/smoke-private-window.js
//   [--browser chrome|firefox|violentmonkey|tampermonkey|managers|all]
//   [--chrome <chrome.exe>] [--firefox <firefox.exe>] [--geckodriver <path>]
//   [--headed] [--timeout-ms N] [--out <dir>]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const chromium = require('./smoke-chromium-optional-hosts');
const firefoxDriver = require('./firefox-webdriver');
const { createFirefoxStage } = require('./check-firefox-webext');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'build', 'private-window-smoke');
const VIDEO_ID = 'jNQXAC9IVRw';
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const FIREFOX_GECKO_ID = 'ytkit@sysadmindoc.github.io';
const FIREFOX_UUID = '6d0f7c2a-4b8e-4f3a-9c1d-2e5b7a9f0c34';
const SMOKE_PORT_NAME = 'astra-private-window-smoke';
// The handoff only hands over a complete set: LOGIN_INFO plus a SAPISID.
const COOKIE_NAMES = Object.freeze(['LOGIN_INFO', 'SAPISID']);
const SENTINELS = Object.freeze({ regular: 'astra-regular-sentinel', private: 'astra-private-sentinel' });
const PROBE_PARAM = 'astraPrivateProbe';

// Bookmarks are off by default. Theater Split is turned off so the bookmark
// panel and the Watch Feed button sit in the classic watch layout.
const SEED_SETTINGS = Object.freeze({ timestampBookmarks: true, persistentQueue: true, stickyVideo: false });
// A regular Watch Feed entry the private tab must still see: its copy is the
// regular values plus its own writes.
const SEED_QUEUE = Object.freeze({
    v: 2,
    items: [{ id: 'dQw4w9WgXcQ', title: 'Regular Watch Feed sentinel', channel: 'Astra Deck smoke', addedAt: 1767225600000 }],
    updatedAt: 1767225600000
});

const ALL_LANES = Object.freeze(['chrome', 'firefox', 'violentmonkey', 'tampermonkey']);
const BROWSER_CHOICES = Object.freeze([...ALL_LANES, 'managers', 'all']);

function selectLanes(browser) {
    if (browser === 'all') return [...ALL_LANES];
    if (browser === 'managers') return ['violentmonkey', 'tampermonkey'];
    return [browser];
}

function parseArgs(argv) {
    const opts = {
        browser: 'all',
        chrome: process.env.CHROME_FOR_TESTING_PATH || '',
        firefox: process.env.FIREFOX_PATH || '',
        geckodriver: process.env.GECKODRIVER_PATH || '',
        headed: false,
        timeoutMs: 60000,
        outDir: DEFAULT_OUT_DIR
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
            i += 1;
            return value;
        };
        if (arg === '--browser') opts.browser = next();
        else if (arg === '--chrome') opts.chrome = next();
        else if (arg === '--firefox') opts.firefox = next();
        else if (arg === '--geckodriver') opts.geckodriver = next();
        else if (arg === '--headed') opts.headed = true;
        else if (arg === '--timeout-ms') opts.timeoutMs = Number(next());
        else if (arg === '--out') opts.outDir = path.resolve(next());
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!BROWSER_CHOICES.includes(opts.browser)) throw new Error(`--browser must be one of ${BROWSER_CHOICES.join(', ')}, not ${opts.browser}`);
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 5000) throw new Error('--timeout-ms must be at least 5000');
    return opts;
}

// Key order is not part of what storage holds, so the snapshot sorts it.
function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
}

function changedKeys(before, after) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    return [...keys].filter((key) => stableStringify(before?.[key]) !== stableStringify(after?.[key])).sort();
}

// A manager keeps every GM value of a script under one storage key, so a
// failure names the paths inside it, JSON strings included.
function changedPaths(before, after, prefix = '') {
    const a = parseStored(before);
    const b = parseStored(after);
    const objects = a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b);
    if (!objects) return stableStringify(a) === stableStringify(b) ? [] : [prefix || '(root)'];
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
        .flatMap((key) => changedPaths(a[key], b[key], prefix ? `${prefix}.${key}` : key));
}

function parseStored(value) {
    if (typeof value !== 'string') return value ?? null;
    try {
        return JSON.parse(value);
    } catch (_) {
        return value;
    }
}

function queueIds(value) {
    const queue = parseStored(value);
    return Array.isArray(queue?.items) ? queue.items.map((item) => item?.id).filter(Boolean) : [];
}

function bookmarkCount(value, videoId = VIDEO_ID) {
    const bookmarks = parseStored(value);
    return Array.isArray(bookmarks?.[videoId]) ? bookmarks[videoId].length : 0;
}

// The storage half. `regularBefore`/`regularAfter` are whole chrome.storage.local
// snapshots; `privateCopy` is what the private tab read back; `reopened` is a
// fresh private window after the first closed.
function assertStorageFence({ regularBefore, regularAfter, privateCopy, reopened }) {
    const failures = [];
    const changed = changedKeys(regularBefore, regularAfter);
    if (changed.length) failures.push(`regular storage changed: ${changedPaths(regularBefore, regularAfter).join(', ')}`);
    if (!queueIds(privateCopy?.queue).includes(VIDEO_ID)) failures.push('the private tab does not read its own Watch Feed add');
    if (!queueIds(privateCopy?.queue).includes(SEED_QUEUE.items[0].id)) failures.push('the private copy lost the regular Watch Feed entry');
    if (bookmarkCount(privateCopy?.bookmarks) < 1) failures.push('the private tab does not read its own bookmark');
    if (!(privateCopy?.watchFeedPressed === true)) failures.push('the private tab\'s Watch Feed button does not show the add');
    if (queueIds(reopened?.queue).includes(VIDEO_ID)) failures.push('a fresh private window still reads the closed window\'s Watch Feed add');
    if (bookmarkCount(reopened?.bookmarks) > 0) failures.push('a fresh private window still reads the closed window\'s bookmark');
    if (!queueIds(reopened?.queue).includes(SEED_QUEUE.items[0].id)) failures.push('a fresh private window does not read the regular Watch Feed');
    if (failures.length) throw new Error(`Storage fence: ${failures.join('; ')}`);
    return { changedKeys: changed };
}

// The storage half under a userscript manager. `regular*` are the manager's
// GM value stores for the script, read from its own extension page; the
// copies are what the private page shows: the Watch Feed pill's count, the
// bookmark panel's count and the Watch Feed button's pressed state.
function assertManagerFence({ manager, regularBefore, regularAfter, privateCopy, reopened }) {
    const failures = [];
    const seed = SEED_QUEUE.items[0].id;
    // Astra treats an unknown context as private, so a seed that never
    // reached the store means the regular window was not regular either.
    if (!JSON.stringify(regularBefore || {}).includes(seed)) failures.push(`the regular Watch Feed add never reached ${manager}'s storage`);
    const changed = changedPaths(regularBefore, regularAfter);
    if (changed.length) failures.push(`regular GM values changed: ${changed.join(', ')}`);
    if (!(privateCopy?.pressed === true)) failures.push('the private page\'s Watch Feed button does not show the add');
    if (privateCopy?.queue !== 2) failures.push(`the private Watch Feed holds ${privateCopy?.queue}, not the regular entry plus its own add`);
    if (!(privateCopy?.bookmarks >= 1)) failures.push('the private page does not read its own bookmark');
    if (reopened?.pressed !== false) failures.push('a fresh private window still shows the closed window\'s Watch Feed add');
    if (reopened?.queue !== 1) failures.push(`a fresh private window's Watch Feed holds ${reopened?.queue}, not just the regular entry`);
    if (reopened?.bookmarks !== 0) failures.push('a fresh private window still reads the closed window\'s bookmark');
    if (failures.length) throw new Error(`${manager} storage fence: ${failures.join('; ')}`);
    return { changedKeys: changed, privateCopy, reopened };
}

function sentinelValues(response) {
    return (Array.isArray(response?.cookies) ? response.cookies : [])
        .map((cookie) => `${cookie?.name}=${cookie?.value}`)
        .sort();
}

function expectedCookies(value) {
    return COOKIE_NAMES.map((name) => `${name}=${value}`).sort();
}

function assertCookieHandoff({ privateTab, regularTab }) {
    const failures = [];
    const priv = sentinelValues(privateTab);
    const reg = sentinelValues(regularTab);
    if (privateTab?.ok !== true) failures.push(`private handoff failed: ${JSON.stringify(privateTab)}`);
    if (regularTab?.ok !== true) failures.push(`regular handoff failed: ${JSON.stringify(regularTab)}`);
    if (stableStringify(priv) !== stableStringify(expectedCookies(SENTINELS.private))) failures.push(`private handoff returned ${JSON.stringify(priv)} (${JSON.stringify(privateTab?.diagnostics ?? null)})`);
    if (stableStringify(reg) !== stableStringify(expectedCookies(SENTINELS.regular))) failures.push(`regular handoff returned ${JSON.stringify(reg)} (${JSON.stringify(regularTab?.diagnostics ?? null)})`);
    if (failures.length) throw new Error(`Cookie handoff: ${failures.join('; ')}`);
    return { private: priv, regular: reg };
}

// `seen` maps each probe label to the Cookie header the request went out with
// ('' when none). The regular control proves the capture can see cookies.
function assertAnonymousPrivateFetch(seen) {
    const failures = [];
    if (!Object.hasOwn(seen || {}, 'private')) failures.push('the private request was never observed');
    else if (seen.private) failures.push(`the private request sent cookies: ${seen.private}`);
    if (!String(seen?.regular || '').includes(SENTINELS.regular)) {
        failures.push(`the regular control did not carry the regular sentinel (${JSON.stringify(seen?.regular)}), so the capture proves nothing`);
    }
    if (failures.length) throw new Error(`Private fetch: ${failures.join('; ')}`);
    return seen;
}

function probeUrl(label) {
    return `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en&fmt=json3&${PROBE_PARAM}=${label}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(read, predicate, label, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let last;
    let lastError;
    while (Date.now() < deadline) {
        try {
            last = await read();
            if (predicate(last)) return last;
        } catch (error) {
            lastError = error;
        }
        await sleep(300);
    }
    throw new Error(`Timed out waiting for ${label}; last ${JSON.stringify(last)}${lastError ? `; ${lastError.message}` : ''}`);
}

// A baseline taken while the background is still writing would blame the
// private session for it.
async function settledSnapshot(snapshot, timeoutMs) {
    let previous = stableStringify(await snapshot());
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await sleep(1500);
        const current = await snapshot();
        const text = stableStringify(current);
        if (text === previous) return current;
        previous = text;
    }
    throw new Error('Regular storage never settled before the private session');
}

const HOME_URL = 'https://www.youtube.com/';

// Page-world expressions, shared by both browsers.
const PAGE = Object.freeze({
    ready: `(() => ({
        runtime: !!document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn'),
        feed: !!document.querySelector('.ytkit-watch-feed-btn'),
        bookmarks: [...document.querySelectorAll('.ytkit-bookmarks-add')].some((b) => !b.dataset.action),
        video: (document.querySelector('video.html5-main-video')?.readyState || 0) >= 1
    }))()`,
    play: `(() => { const v = document.querySelector('video.html5-main-video'); if (!v) return 0; v.muted = true; v.play().catch(() => {}); return v.currentTime; })()`,
    time: `(document.querySelector('video.html5-main-video')?.currentTime || 0)`,
    pressed: `([...document.querySelectorAll('.ytkit-watch-feed-btn')].find((b) => b.getClientRects().length)?.getAttribute('aria-pressed') === 'true')`,
    feedButton: `[...document.querySelectorAll('.ytkit-watch-feed-btn')].find((b) => b.getClientRects().length)`,
    saveButton: `[...document.querySelectorAll('.ytkit-bookmarks-add')].find((b) => !b.dataset.action && b.getClientRects().length)`,
    // What a userscript page shows of its own storage.
    copy: `(() => {
        const count = (selector) => Number((document.querySelector(selector)?.textContent || '').match(/\\d+/)?.[0] || 0);
        const feed = [...document.querySelectorAll('.ytkit-watch-feed-btn')].find((b) => b.getClientRects().length);
        return { queue: count('.ytkit-queue-pill'), bookmarks: count('.ytkit-bookmarks-count'), pressed: feed?.getAttribute('aria-pressed') === 'true' };
    })()`,
    // What a failure screenshot can't show.
    layout: `[...document.querySelectorAll('.ytkit-watch-feed-btn, .ytkit-bookmarks-add')].map((b) => ({ cls: b.className, action: b.dataset.action || '', rect: [...b.getClientRects()].length, parent: b.parentElement?.id || b.parentElement?.className || '' }))`
});

const pageReady = (value) => value?.runtime && value?.feed && value?.bookmarks && value?.video;

// Runs in the extension's isolated world of a YouTube tab: mint a capability
// over a port (the background's own issuer, for this port's sender), then
// spend it on the real YTKIT_COOKIE_HANDOFF message.
function isolatedHandoffSource(api) {
    return `new Promise((resolve) => {
        const port = ${api}.runtime.connect({ name: ${JSON.stringify(SMOKE_PORT_NAME)} });
        port.onMessage.addListener((capability) => {
            port.disconnect();
            if (!capability?.token) { resolve({ ok: false, error: 'no capability', capability }); return; }
            Promise.resolve(${api}.runtime.sendMessage({ type: 'YTKIT_COOKIE_HANDOFF', capability: capability.token, protocolVersion: capability.protocolVersion }))
                .then(resolve, (error) => resolve({ ok: false, error: String(error) }));
        });
        port.postMessage('issue');
    })`;
}

function isolatedFetchSource(api, label) {
    return `Promise.resolve(${api}.runtime.sendMessage({ type: 'EXT_FETCH', details: { method: 'GET', url: ${JSON.stringify(probeUrl(label))}, timeout: 15000 } }))
        .then((r) => ({ status: r?.status ?? null, error: r?.error ?? null }), (error) => ({ error: String(error) }))`;
}

const isolatedCopySource = `({
    queue: globalThis.YTKitCore?.storageRead?.('ytkit-queue', null) ?? null,
    bookmarks: globalThis.YTKitCore?.storageRead?.('ytkit-bookmarks', null) ?? null,
    incognito: chrome.extension?.inIncognitoContext ?? null
})`;

// ---------------------------------------------------------------- Chrome

function resolveChromeForTesting(cliPath) {
    if (cliPath) {
        if (!fs.existsSync(cliPath)) throw new Error(`Chrome for Testing not found at ${cliPath}`);
        return cliPath;
    }
    // Playwright's Chromium builds are Chrome for Testing builds. Branded
    // Chrome ignores --load-extension, so it is never a fallback.
    const root = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
    const builds = fs.existsSync(root)
        ? fs.readdirSync(root).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
        : [];
    for (const build of builds) {
        const candidate = path.join(root, build, 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('Chrome for Testing was not found. Pass --chrome or set CHROME_FOR_TESTING_PATH.');
}

async function listTargets(port) {
    return chromium.fetchJsonFromDevTools(port, '/json/list');
}

async function attachTab(port, predicate, extensionId, timeoutMs) {
    const target = await until(async () => (await listTargets(port)).find(predicate), Boolean, 'a YouTube tab target', timeoutMs);
    const client = await chromium.connectCdp(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const isolated = async () => {
        const created = client.events.filter((event) => event.method === 'Runtime.executionContextCreated'
            && event.params.context.auxData?.type === 'isolated'
            && event.params.context.origin === `chrome-extension://${extensionId}`
            && event.params.context.auxData?.isDefault === false
            && event.params.context.auxData?.frameId === target.id);
        const destroyed = new Set(client.events.filter((event) => event.method === 'Runtime.executionContextDestroyed')
            .map((event) => event.params.executionContextId));
        const live = created.filter((event) => !destroyed.has(event.params.context.id));
        return live.length ? live[live.length - 1].params.context.id : null;
    };
    const evaluate = async (expression, contextId) => {
        const result = await client.send('Runtime.evaluate', {
            expression, awaitPromise: true, returnByValue: true, userGesture: true, ...(contextId ? { contextId } : {})
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result?.value;
    };
    return {
        client,
        target,
        page: (expression) => evaluate(expression),
        async extension(expression) {
            const contextId = await until(isolated, Boolean, 'the extension isolated world', timeoutMs);
            return evaluate(expression, contextId);
        },
        async click(nodeExpression) {
            const point = await until(() => evaluate(`(() => {
                const node = ${nodeExpression};
                if (!node) return null;
                node.scrollIntoView({ block: 'center' });
                const r = node.getBoundingClientRect();
                return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
            })()`), Boolean, `a visible ${nodeExpression}`, timeoutMs);
            for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
                await client.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
            }
        },
        async screenshot(file) {
            const shot = await client.send('Page.captureScreenshot', { format: 'png' });
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
        },
        close: () => client.close()
    };
}

async function allowChromeIncognito(port, extensionId, timeoutMs) {
    const page = (await listTargets(port)).find((target) => target.type === 'page');
    const client = await chromium.connectCdp(page.webSocketDebuggerUrl);
    try {
        await client.send('Page.enable');
        await client.send('Page.navigate', { url: 'chrome://extensions' });
        await until(() => chromium.evaluate(client, 'typeof chrome.developerPrivate?.updateExtensionConfiguration'), (v) => v === 'function', 'chrome://extensions', timeoutMs);
        await chromium.evaluate(client, `chrome.developerPrivate.updateExtensionConfiguration({ extensionId: '${extensionId}', incognitoAccess: true })`);
        // Allowing an unpacked extension in Incognito disables it with
        // unsupportedDeveloperExtension; enabling it again keeps the grant.
        // The disable lands on its own schedule, and an enable sent before
        // it is a no-op, so wait for it and keep enabling until it sticks.
        const read = () => chromium.evaluate(client, `chrome.developerPrivate.getExtensionInfo('${extensionId}').then((i) => ({ incognito: i.incognitoAccess?.isActive ?? i.incognitoAccess, state: i.state }))`);
        await until(read, (v) => v?.state !== 'ENABLED', 'the Incognito toggle to disable the extension', 5000).catch(() => undefined);
        const info = await until(async () => {
            const current = await read();
            if (current?.state !== 'ENABLED') await chromium.evaluate(client, `chrome.management.setEnabled('${extensionId}', true)`);
            return current;
        }, (v) => v?.state === 'ENABLED' && v?.incognito === true, 'the extension enabled with Incognito allowed', timeoutMs);
        return info;
    } finally {
        client.close();
    }
}

async function runChrome(opts) {
    const binary = resolveChromeForTesting(opts.chrome);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-private-window-chrome-'));
    const outDir = path.join(opts.outDir, 'chrome');
    const { stageDir } = chromium.createChromiumStage(temp);
    const port = await chromium.reserveLoopbackPort();
    const proc = spawn(binary, [...chromium.chromiumArgs(path.join(temp, 'profile'), stageDir, { headed: opts.headed }, port), '--window-size=1280,900', '--autoplay-policy=no-user-gesture-required'],
        { windowsHide: true, stdio: 'ignore' });
    const clients = [];
    try {
        await chromium.waitForDevTools(port, opts.timeoutMs);
        let bgTarget = await chromium.waitForBackgroundTarget(port, opts.timeoutMs);
        const extensionId = chromium.extensionIdFromTarget(bgTarget);
        const grant = await allowChromeIncognito(port, extensionId, opts.timeoutMs);
        bgTarget = await chromium.waitForBackgroundTarget(port, opts.timeoutMs);
        const bg = await chromium.connectCdp(bgTarget.webSocketDebuggerUrl);
        clients.push(bg);
        await bg.send('Runtime.enable');
        const sw = (expression) => chromium.evaluate(bg, expression);
        if (await sw('chrome.extension.isAllowedIncognitoAccess()') !== true) throw new Error('Chrome did not allow the extension in Incognito');

        await sw(`chrome.storage.local.get('ytSuiteSettings').then((r) => chrome.storage.local.set({
            ytSuiteSettings: { ...(r.ytSuiteSettings || {}), ...${JSON.stringify(SEED_SETTINGS)} },
            'ytkit-queue': ${JSON.stringify(SEED_QUEUE)}
        }))`);
        // The background has no onConnect listener of its own.
        await sw(`chrome.runtime.onConnect.addListener((port) => {
            if (port.name !== ${JSON.stringify(SMOKE_PORT_NAME)}) return;
            port.onMessage.addListener(() => port.postMessage(issueCookieHandoffCapability(port.sender)));
        }); true`);

        const watchTab = (exclude) => (t) => t.type === 'page' && t.url.includes(`watch?v=${VIDEO_ID}`) && !exclude.has(t.id);
        const pageIds = async () => new Set((await listTargets(port)).filter((t) => t.type === 'page').map((t) => t.id));
        const openPrivate = async () => {
            const known = await pageIds();
            const win = await sw(`chrome.windows.create({ incognito: true, url: ${JSON.stringify(WATCH_URL)} }).then((w) => ({ id: w.id, tab: w.tabs[0].id, incognito: w.incognito }))`);
            if (win?.incognito !== true) throw new Error(`Chrome did not open an Incognito window: ${JSON.stringify(win)}`);
            const tab = await attachTab(port, watchTab(known), extensionId, opts.timeoutMs);
            clients.push(tab.client);
            await until(() => tab.page(PAGE.ready), pageReady, 'Astra on the private watch page', opts.timeoutMs);
            const incognito = (await tab.extension(isolatedCopySource)).incognito;
            if (incognito !== true) throw new Error(`The private tab's isolated world reports inIncognitoContext ${incognito}`);
            return { win, tab };
        };
        const snapshot = async () => sw('chrome.storage.local.get(null)');
        const readCopy = async (tab) => ({ ...(await tab.extension(isolatedCopySource)), watchFeedPressed: await tab.page(PAGE.pressed) });

        // A profile that has run Astra before: the first boot migrates the
        // seeded settings and the background caches the feature-disable feed,
        // both ordinary regular-window writes, so they land before the
        // baseline. The home page, so the seed Watch Feed entry stays unwatched.
        const homeKnown = await pageIds();
        const homeTabId = await sw(`chrome.tabs.create({ url: ${JSON.stringify(HOME_URL)} }).then((t) => t.id)`);
        const home = await attachTab(port, (t) => t.type === 'page' && t.url.startsWith(HOME_URL) && !homeKnown.has(t.id), extensionId, opts.timeoutMs);
        await until(() => home.page(PAGE.ready), (v) => v?.runtime, 'Astra on the regular home page', opts.timeoutMs);
        await sleep(3000);
        await sw(`chrome.tabs.remove(${homeTabId})`);
        home.client.close();

        // Storage half. The baseline comes before the private window: a
        // private boot's own writes count too.
        const regularBefore = await settledSnapshot(snapshot, opts.timeoutMs);
        let first = await openPrivate();
        await until(() => first.tab.page(PAGE.play), () => true, 'play', 5000);
        await until(() => first.tab.page(PAGE.time), (t) => t >= 3, 'three seconds of private playback', opts.timeoutMs);
        await first.tab.click(PAGE.feedButton);
        await until(() => first.tab.page(PAGE.pressed), (v) => v === true, 'the Watch Feed add in the private tab', 10000);
        await first.tab.click(PAGE.saveButton);
        await until(() => first.tab.extension(isolatedCopySource), (v) => bookmarkCount(v?.bookmarks) > 0, 'the private bookmark', 10000);
        // Past the storage layer's write debounce, so a leak would have landed.
        await sleep(1500);
        const privateCopy = await readCopy(first.tab);
        const regularAfter = await snapshot();
        await first.tab.screenshot(path.join(outDir, 'private-watch.png'));

        // Close the private window and open a fresh one. All of it runs
        // before the cookie half opens a regular tab, whose own boot writes
        // regular storage.
        await sw(`chrome.windows.remove(${first.win.id})`);
        first.tab.close();
        await sleep(1500);
        const second = await openPrivate();
        await sleep(1500);
        const reopened = await readCopy(second.tab);
        const regularFinal = await snapshot();
        const storage = assertStorageFence({ regularBefore, regularAfter: regularFinal, privateCopy, reopened });
        const midRun = changedKeys(regularBefore, regularAfter);
        if (midRun.length) throw new Error(`Storage fence: regular storage changed during the private session: ${midRun.join(', ')}`);
        await second.tab.screenshot(path.join(outDir, 'private-reopened.png'));

        // Cookie half, in the fresh private window.
        const known = await pageIds();
        // Without a windowId the tab opens in the last focused window, the
        // Incognito one.
        const regularTabId = await sw(`chrome.windows.getAll().then((ws) => chrome.tabs.create({ windowId: ws.find((w) => !w.incognito).id, url: ${JSON.stringify(WATCH_URL)}, active: false })).then((t) => t.id)`);
        const regular = await attachTab(port, watchTab(known), extensionId, opts.timeoutMs);
        clients.push(regular.client);
        await until(() => regular.page(PAGE.ready), (v) => v?.runtime, 'Astra on the regular watch page', opts.timeoutMs);
        if ((await regular.extension(isolatedCopySource)).incognito !== false) throw new Error('The regular tab does not report a regular context');
        // Seeded after both pages load: a signed-out YouTube load clears
        // login cookies it doesn't recognize.
        const stores = await sw('chrome.cookies.getAllCookieStores().then((s) => s.map((x) => ({ id: x.id, tabIds: x.tabIds })))');
        const privateStore = stores.find((store) => store.tabIds.includes(second.win.tab));
        const regularStore = stores.find((store) => store.tabIds.includes(regularTabId));
        if (!privateStore || !regularStore || privateStore === regularStore) throw new Error(`Could not tell the cookie stores apart: ${JSON.stringify(stores)}`);
        for (const [storeId, value] of [[regularStore.id, SENTINELS.regular], [privateStore.id, SENTINELS.private]]) {
            for (const name of COOKIE_NAMES) {
                await sw(`chrome.cookies.set({ url: 'https://www.youtube.com/', domain: '.youtube.com', path: '/', name: '${name}', value: '${value}', secure: true, sameSite: 'no_restriction', storeId: '${storeId}' })`);
            }
        }
        const handoff = assertCookieHandoff({
            privateTab: await second.tab.extension(isolatedHandoffSource('chrome')),
            regularTab: await regular.extension(isolatedHandoffSource('chrome'))
        });

        await bg.send('Network.enable');
        const fetches = {
            private: await second.tab.extension(isolatedFetchSource('chrome', 'private')),
            regular: await regular.extension(isolatedFetchSource('chrome', 'regular'))
        };
        await sleep(500);
        const urls = new Map(bg.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => [e.params.requestId, e.params.request.url]));
        const seen = {};
        for (const event of bg.events.filter((e) => e.method === 'Network.requestWillBeSentExtraInfo')) {
            const label = new URL(urls.get(event.params.requestId) || 'about:blank').searchParams.get(PROBE_PARAM);
            if (!label) continue;
            const headers = Object.fromEntries(Object.entries(event.params.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
            seen[label] = headers.cookie || '';
        }
        assertAnonymousPrivateFetch(seen);
        await sw(`chrome.tabs.remove(${regularTabId})`);

        return {
            browser: 'Chrome for Testing',
            binary,
            grant,
            storage: { ...storage, privateQueue: queueIds(privateCopy.queue), privateBookmarks: bookmarkCount(privateCopy.bookmarks), reopenedQueue: queueIds(reopened.queue), reopenedBookmarks: bookmarkCount(reopened.bookmarks) },
            handoff,
            fetch: { seen, responses: fetches }
        };
    } finally {
        for (const client of clients) {
            try { client.close(); } catch (_) { /* reason: already closed */ }
        }
        chromium.killProcessTree(proc);
        await sleep(1000);
        await chromium.removeDirWithRetries(temp).catch(() => undefined);
    }
}

// ---------------------------------------------------------------- Firefox

function resolveFirefox(cliPath) {
    const candidates = [cliPath, path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Mozilla Firefox', 'firefox.exe')].filter(Boolean);
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) throw new Error('Firefox was not found. Pass --firefox or set FIREFOX_PATH.');
    return found;
}

// Marionette's chrome context: what BiDi cannot do (open a private window,
// watch the parent process's HTTP channels).
async function chromeScript(session, script, args = []) {
    const call = (route, body) => firefoxDriver.requestJson(`${session.baseUrl}${route}`, { method: 'POST', body, timeoutMs: 30000 });
    await call('/moz/context', { context: 'chrome' });
    try {
        return await call('/execute/sync', { script, args });
    } finally {
        await call('/moz/context', { context: 'content' });
    }
}

// Opens a private window on the watch page and waits for Astra there.
// `track` gets the context as soon as it exists, for failure screenshots.
async function openFirefoxPrivateWatch(session, timeoutMs, track) {
    const { client } = session;
    const before = new Set((await client.command('browsingContext.getTree', {})).contexts.map((c) => c.context));
    await chromeScript(session, 'OpenBrowserWindow({ private: true }); return true;');
    const { context } = await firefoxDriver.waitForContext(client, (c) => !before.has(c.context), { timeoutMs, label: 'the private window' });
    track(context);
    // A new window opens narrow enough that YouTube hides the action
    // row's Watch Feed button, so give it the desktop size.
    await client.command('browsingContext.setViewport', { context, viewport: { width: 1440, height: 900 }, devicePixelRatio: 1 });
    await client.command('browsingContext.navigate', { context, url: WATCH_URL, wait: 'interactive' });
    await firefoxDriver.waitForJson(client, context, PAGE.ready, pageReady, { timeoutMs, label: 'Astra on the private watch page' });
    // The remote agent owns the BiDi context ids (NavigableManager in current
    // Firefox, TabManager before it); ask it which browser this is, and prove
    // the tab sits in a private window before anything counts on it. It
    // waits for the watch page: the window opens on about:privatebrowsing,
    // and once that loads BiDi treats the tab as privileged.
    const isPrivate = await chromeScript(session, `let idFor;
        try {
            const { NavigableManager } = ChromeUtils.importESModule('chrome://remote/content/shared/NavigableManager.sys.mjs');
            idFor = (browser) => NavigableManager.getIdForBrowser(browser);
        } catch (_) {
            const { TabManager } = ChromeUtils.importESModule('chrome://remote/content/shared/TabManager.sys.mjs');
            idFor = (browser) => TabManager.getIdForBrowser(browser);
        }
        for (const win of Services.wm.getEnumerator('navigator:browser')) {
            for (const browser of win.gBrowser?.browsers || []) {
                if (idFor(browser) === arguments[0]) return PrivateBrowsingUtils.isWindowPrivate(win) && browser.browsingContext.usePrivateBrowsing;
            }
        }
        return null;`, [context]);
    if (isPrivate !== true) throw new Error(`The new window is not private (isWindowPrivate: ${JSON.stringify(isPrivate)})`);
    return context;
}

async function closeFirefoxPrivateWindows(session) {
    await chromeScript(session, `for (const win of Services.wm.getEnumerator('navigator:browser')) {
            if (PrivateBrowsingUtils.isWindowPrivate(win)) win.close();
        }
        return true;`);
    await sleep(1500);
}

// Where each manager keeps a script's GM values, and one of its extension
// pages to read them from.
const MANAGER_STORES = Object.freeze({
    violentmonkey: { page: 'options/index.html', prefix: 'val:' },
    tampermonkey: { page: 'options.html', prefix: '!extdb.@st#' }
});
const MANAGER_UUID = '3a9d6e1f-5b2c-4c8d-9e7f-1a2b3c4d5e6f';
const MANAGER_LANES = Object.freeze(Object.keys(MANAGER_STORES));

// The shipped split userscript, installed through the signed manager build
// from scripts/userscript-manager-fixtures.json with private browsing
// allowed. The regular window turns bookmarks on and adds the seed video to
// the Watch Feed through Astra's own UI, so the GM values are the manager's
// real ones; the private window then repeats the storage half.
async function runManager(managerId, opts) {
    const managerSmoke = require('./smoke-userscript-managers');
    const manager = managerSmoke.selectManagers(managerSmoke.readManagerFixtures(), [managerId])[0];
    const store = MANAGER_STORES[managerId];
    const firefox = resolveFirefox(opts.firefox);
    const outDir = path.join(opts.outDir, managerId);
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), `astra-private-window-${managerId}-`));
    const fixture = await managerSmoke.startFixtureServer();
    let session = null;
    let lastContext = null;
    try {
        const xpiPath = await managerSmoke.downloadManager(manager, downloadDir, opts.timeoutMs);
        session = await firefoxDriver.startFirefoxSession({
            cwd: REPO_ROOT,
            firefox,
            geckodriver: opts.geckodriver,
            headed: opts.headed,
            systemAccess: true,
            commandTimeoutMs: opts.timeoutMs,
            startupTimeoutMs: Math.min(opts.timeoutMs, 30000),
            prefs: {
                'extensions.webextensions.uuids': JSON.stringify({ [manager.extensionId]: MANAGER_UUID }),
                'media.autoplay.default': 0
            }
        });
        const { client } = session;
        const installed = await firefoxDriver.requestJson(`${session.baseUrl}/moz/addon/install`, {
            method: 'POST', timeoutMs: 30000, body: { path: xpiPath, temporary: true, allowPrivateBrowsing: true }
        });
        if (installed !== manager.extensionId) throw new Error(`${manager.name} installed as ${JSON.stringify(installed)}`);
        const base = (await client.command('browsingContext.getTree', {})).contexts[0].context;
        await client.command('browsingContext.setViewport', { context: base, viewport: { width: 1440, height: 900 }, devicePixelRatio: 1 });
        await managerSmoke.installUserscript(client, base, manager, fixture.baseUrl, opts.timeoutMs);
        const page = (context, expression) => firefoxDriver.evaluateJson(client, context, expression);

        // Regular window: settings and the seed Watch Feed entry, through the UI.
        lastContext = base;
        await client.command('browsingContext.navigate', { context: base, url: `https://www.youtube.com/watch?v=${SEED_QUEUE.items[0].id}`, wait: 'interactive' });
        await firefoxDriver.waitForJson(client, base, PAGE.ready, (v) => v?.runtime && v?.feed, { timeoutMs: opts.timeoutMs, label: `Astra under ${manager.name} on the regular watch page` });
        await page(base, `(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn')?.click(), true)`);
        const toggles = await until(() => page(base, `(() => {
                const out = {};
                for (const [key, want] of Object.entries(${JSON.stringify(SEED_SETTINGS)})) {
                    const toggle = document.querySelector('#ytkit-toggle-' + key);
                    if (!toggle) return null;
                    if (toggle.checked !== want) toggle.click();
                    out[key] = toggle.checked;
                }
                return out;
            })()`), (v) => v && stableStringify(v) === stableStringify(SEED_SETTINGS), 'the seed settings in the settings panel', opts.timeoutMs);
        await page(base, `(document.querySelector('#ytkit-settings-panel .ytkit-close, #ytkit-close-footer')?.click(), true)`);
        await firefoxDriver.clickElementExpression(client, base, PAGE.feedButton);
        await until(() => page(base, PAGE.pressed), (v) => v === true, 'the regular Watch Feed add', 10000);
        // Leave the page so no regular tab writes during the private session.
        await sleep(1500);
        await client.command('browsingContext.navigate', { context: base, url: 'about:blank', wait: 'complete' });
        lastContext = null;

        const control = (await client.command('browsingContext.create', { type: 'tab', background: false })).context;
        await client.command('browsingContext.navigate', { context: control, url: `moz-extension://${MANAGER_UUID}/${store.page}`, wait: 'complete' });
        const values = async () => {
            const result = await client.command('script.evaluate', {
                target: { context: control }, awaitPromise: true, resultOwnership: 'none',
                expression: `(async () => JSON.stringify(Object.fromEntries(Object.entries(await browser.storage.local.get(null))
                    .filter(([key]) => key.startsWith(${JSON.stringify(store.prefix)})))))()`
            });
            return JSON.parse(firefoxDriver.remotePrimitive(result));
        };
        // The manager persists GM writes on its own schedule. A seed that
        // never lands is the fence's to report; the baseline still has to
        // settle so a late write isn't blamed on the private window.
        await until(values, (v) => JSON.stringify(v).includes(SEED_QUEUE.items[0].id), `the seed in ${manager.name}'s storage`, opts.timeoutMs)
            .catch(() => undefined);
        const regularBefore = await settledSnapshot(values, opts.timeoutMs);

        // Private window: the same steps as the extension lanes.
        const first = await openFirefoxPrivateWatch(session, opts.timeoutMs, (context) => { lastContext = context; });
        await page(first, PAGE.play);
        await until(() => page(first, PAGE.time), (t) => t >= 3, 'three seconds of private playback', opts.timeoutMs);
        await firefoxDriver.clickElementExpression(client, first, PAGE.feedButton);
        await until(() => page(first, PAGE.pressed), (v) => v === true, 'the Watch Feed add in the private window', 10000);
        await firefoxDriver.clickElementExpression(client, first, PAGE.saveButton);
        await until(() => page(first, PAGE.copy), (v) => v?.bookmarks > 0, 'the private bookmark', 10000);
        await sleep(1500);
        const privateCopy = await page(first, PAGE.copy);
        await firefoxDriver.captureScreenshot(client, first, path.join(outDir, 'private-watch.png'));

        await closeFirefoxPrivateWindows(session);
        const second = await openFirefoxPrivateWatch(session, opts.timeoutMs, (context) => { lastContext = context; });
        await sleep(1500);
        const reopened = await page(second, PAGE.copy);
        const regularAfter = await values();
        await firefoxDriver.captureScreenshot(client, second, path.join(outDir, 'private-reopened.png'));
        fs.writeFileSync(path.join(outDir, 'gm-values.json'), `${JSON.stringify({ regularBefore, regularAfter }, null, 2)}\n`, 'utf8');
        const storage = assertManagerFence({ manager: manager.name, regularBefore, regularAfter, privateCopy, reopened });
        return { browser: 'Firefox', browserVersion: session.browserVersion, manager: manager.name, managerVersion: manager.version, settings: toggles, storage };
    } catch (error) {
        if (session && lastContext) {
            await firefoxDriver.captureScreenshot(session.client, lastContext, path.join(outDir, 'failure.png')).catch(() => undefined);
            const layout = await firefoxDriver.evaluateJson(session.client, lastContext, PAGE.layout).catch(() => null);
            error.message += `\nAstra buttons: ${JSON.stringify(layout)}`;
        }
        const logs = session?.logs().trim() || '';
        if (logs) error.message += `\n${logs.slice(-3000)}`;
        throw error;
    } finally {
        if (session) await session.close().catch(() => undefined);
        await fixture.close();
        fs.rmSync(downloadDir, { recursive: true, force: true });
    }
}

async function runFirefox(opts) {
    const firefox = resolveFirefox(opts.firefox);
    const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-private-window-firefox-'));
    const outDir = path.join(opts.outDir, 'firefox');
    const stageDir = createFirefoxStage('store-safe', stageRoot);
    const manifestPath = path.join(stageDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.permissions = [...new Set([...(manifest.permissions || []), 'scripting'])];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const session = await firefoxDriver.startFirefoxSession({
        cwd: REPO_ROOT,
        firefox,
        geckodriver: opts.geckodriver,
        headed: opts.headed,
        systemAccess: true,
        commandTimeoutMs: opts.timeoutMs,
        startupTimeoutMs: Math.min(opts.timeoutMs, 30000),
        prefs: {
            'extensions.webextensions.uuids': JSON.stringify({ [FIREFOX_GECKO_ID]: FIREFOX_UUID }),
            'media.autoplay.default': 0
        }
    });
    const { client } = session;
    let lastPrivateContext = null;
    try {
        const installed = await firefoxDriver.requestJson(`${session.baseUrl}/moz/addon/install`, {
            method: 'POST', timeoutMs: 30000, body: { path: stageDir, temporary: true, allowPrivateBrowsing: true }
        });
        if (installed !== FIREFOX_GECKO_ID) throw new Error(`Firefox installed ${JSON.stringify(installed)}`);
        const control = (await client.command('browsingContext.getTree', {})).contexts[0].context;
        await client.command('browsingContext.navigate', { context: control, url: `moz-extension://${FIREFOX_UUID}/popup.html`, wait: 'complete' });
        const ext = async (body) => {
            const result = await client.command('script.evaluate', {
                target: { context: control }, awaitPromise: true, resultOwnership: 'none',
                expression: `(async () => JSON.stringify(await (async () => { ${body} })()))()`
            });
            const value = firefoxDriver.remotePrimitive(result);
            return value === null ? null : JSON.parse(value);
        };
        // Runs `source` in the extension's content-script world of `tabId`,
        // the same sandbox as Astra's content scripts.
        // A function literal, not eval: MV3 content scripts can't eval.
        const inTab = (tabId, expression) => ext(`const [r] = await browser.scripting.executeScript({ target: { tabId: ${tabId} }, func: () => (${expression}) });
            if (r?.error) return { injectError: String(r.error) };
            return r?.result ?? { noResult: r ? 'undefined' : 'no frame' };`);
        if (await ext('return browser.extension.isAllowedIncognitoAccess();') !== true) throw new Error('Firefox did not allow the extension in private windows');
        await ext(`const r = await browser.storage.local.get('ytSuiteSettings');
            await browser.storage.local.set({ ytSuiteSettings: { ...(r.ytSuiteSettings || {}), ...${JSON.stringify(SEED_SETTINGS)} }, 'ytkit-queue': ${JSON.stringify(SEED_QUEUE)} });
            const bg = await browser.runtime.getBackgroundPage();
            browser.runtime.onConnect.addListener((port) => {
                if (port.name !== ${JSON.stringify(SMOKE_PORT_NAME)}) return;
                port.onMessage.addListener(() => port.postMessage(bg.issueCookieHandoffCapability(port.sender)));
            });
            return true;`);

        const tabIdFor = async (incognito) => until(() => ext(`return (await browser.tabs.query({})).filter((t) => t.incognito === ${incognito} && t.url.includes('watch?v=${VIDEO_ID}')).map((t) => ({ id: t.id, store: t.cookieStoreId }))[0] || null;`),
            Boolean, `the ${incognito ? 'private' : 'regular'} watch tab`, opts.timeoutMs);
        const openPrivate = async () => {
            const context = await openFirefoxPrivateWatch(session, opts.timeoutMs, (c) => { lastPrivateContext = c; });
            const tab = await tabIdFor(true);
            const flag = (await inTab(tab.id, isolatedCopySource))?.incognito;
            if (flag !== true || tab.store !== 'firefox-private') throw new Error(`The private tab reports incognito ${flag} in store ${tab.store}`);
            return { context, tab };
        };
        const page = (context, expression) => firefoxDriver.evaluateJson(client, context, expression);
        const snapshot = () => ext('return browser.storage.local.get(null);');
        const readCopy = async (win) => ({ ...(await inTab(win.tab.id, isolatedCopySource)), watchFeedPressed: await page(win.context, PAGE.pressed) });

        // A profile that has run Astra before (see the Chrome lane).
        const home = (await client.command('browsingContext.create', { type: 'tab', referenceContext: control, background: false })).context;
        await client.command('browsingContext.navigate', { context: home, url: HOME_URL, wait: 'interactive' });
        await firefoxDriver.waitForJson(client, home, PAGE.ready, (v) => v?.runtime, { timeoutMs: opts.timeoutMs, label: 'Astra on the regular home page' });
        await sleep(3000);
        await client.command('browsingContext.close', { context: home });

        // Storage half. The baseline comes before the private window: a
        // private boot's own writes count too.
        const regularBefore = await settledSnapshot(snapshot, opts.timeoutMs);
        const first = await openPrivate();
        await page(first.context, PAGE.play);
        await until(() => page(first.context, PAGE.time), (t) => t >= 3, 'three seconds of private playback', opts.timeoutMs);
        await firefoxDriver.clickElementExpression(client, first.context, PAGE.feedButton);
        await until(() => page(first.context, PAGE.pressed), (v) => v === true, 'the Watch Feed add in the private tab', 10000);
        await firefoxDriver.clickElementExpression(client, first.context, PAGE.saveButton);
        await until(() => inTab(first.tab.id, isolatedCopySource), (v) => bookmarkCount(v?.bookmarks) > 0, 'the private bookmark', 10000);
        await sleep(1500);
        const privateCopy = await readCopy(first);
        const regularAfter = await snapshot();
        await firefoxDriver.captureScreenshot(client, first.context, path.join(outDir, 'private-watch.png'));

        // Close the private window and open a fresh one, before the cookie
        // half's regular tab boots and writes regular storage.
        await closeFirefoxPrivateWindows(session);
        const second = await openPrivate();
        await sleep(1500);
        const reopened = await readCopy(second);
        const regularFinal = await snapshot();
        const storage = assertStorageFence({ regularBefore, regularAfter: regularFinal, privateCopy, reopened });
        const midRun = changedKeys(regularBefore, regularAfter);
        if (midRun.length) throw new Error(`Storage fence: regular storage changed during the private session: ${midRun.join(', ')}`);
        await firefoxDriver.captureScreenshot(client, second.context, path.join(outDir, 'private-reopened.png'));

        // Cookie half, in the fresh private window. Foreground: Astra's boot
        // waits for a visible tab, and every click is already done.
        const regularContext = (await client.command('browsingContext.create', { type: 'tab', referenceContext: control, background: false })).context;
        await client.command('browsingContext.navigate', { context: regularContext, url: WATCH_URL, wait: 'interactive' });
        await firefoxDriver.waitForJson(client, regularContext, PAGE.ready, (v) => v?.runtime, { timeoutMs: opts.timeoutMs, label: 'Astra on the regular watch page' });
        const regularTab = await tabIdFor(false);
        // Seeded after both pages load: a signed-out YouTube load clears
        // login cookies it doesn't recognize.
        await ext(`for (const [storeId, value] of [['firefox-default', '${SENTINELS.regular}'], ['firefox-private', '${SENTINELS.private}']]) {
                for (const name of ${JSON.stringify(COOKIE_NAMES)}) {
                    await browser.cookies.set({ url: 'https://www.youtube.com/', domain: '.youtube.com', path: '/', name, value, secure: true, sameSite: 'no_restriction', storeId });
                }
            }
            return true;`);
        const handoff = assertCookieHandoff({
            privateTab: await inTab(second.tab.id, isolatedHandoffSource('browser')),
            regularTab: await inTab(regularTab.id, isolatedHandoffSource('browser'))
        });

        // The parent process sees every channel, the background's included.
        await chromeScript(session, `const seen = {};
            const observer = { observe(subject) {
                const channel = subject.QueryInterface(Ci.nsIHttpChannel);
                const label = new URL(channel.URI.spec).searchParams.get('${PROBE_PARAM}');
                if (!label) return;
                let cookie = '';
                try { cookie = channel.getRequestHeader('Cookie'); } catch (_) { cookie = ''; }
                seen[label] = cookie;
            } };
            Services.obs.addObserver(observer, 'http-on-stop-request');
            Services.astraPrivateWindowSmoke = { seen, observer };
            return true;`);
        const fetches = {
            private: await inTab(second.tab.id, isolatedFetchSource('browser', 'private')),
            regular: await inTab(regularTab.id, isolatedFetchSource('browser', 'regular'))
        };
        await sleep(500);
        const seen = await chromeScript(session, `const state = Services.astraPrivateWindowSmoke;
            Services.obs.removeObserver(state.observer, 'http-on-stop-request');
            return JSON.stringify(state.seen);`).then(JSON.parse);
        assertAnonymousPrivateFetch(seen);
        await client.command('browsingContext.close', { context: regularContext });

        return {
            browser: 'Firefox',
            browserVersion: session.browserVersion,
            storage: { ...storage, privateQueue: queueIds(privateCopy.queue), privateBookmarks: bookmarkCount(privateCopy.bookmarks), reopenedQueue: queueIds(reopened.queue), reopenedBookmarks: bookmarkCount(reopened.bookmarks) },
            handoff,
            fetch: { seen, responses: fetches }
        };
    } catch (error) {
        if (lastPrivateContext) {
            await firefoxDriver.captureScreenshot(client, lastPrivateContext, path.join(outDir, 'failure.png')).catch(() => undefined);
            const layout = await firefoxDriver.evaluateJson(client, lastPrivateContext, PAGE.layout).catch(() => null);
            error.message += `\nAstra buttons: ${JSON.stringify(layout)}`;
        }
        const logs = session.logs().trim();
        if (logs) error.message += `\n${logs.slice(-3000)}`;
        throw error;
    } finally {
        await session.close().catch(() => undefined);
        await firefoxDriver.removeTempTree(stageRoot, 'private-window stage').catch(() => undefined);
    }
}

async function main(argv = process.argv.slice(2)) {
    const opts = parseArgs(argv);
    fs.mkdirSync(opts.outDir, { recursive: true });
    const report = { generatedAt: new Date().toISOString(), video: VIDEO_ID, results: {}, failures: {} };
    for (const lane of selectLanes(opts.browser)) {
        try {
            if (lane === 'chrome') report.results[lane] = await runChrome(opts);
            else if (lane === 'firefox') report.results[lane] = await runFirefox(opts);
            else report.results[lane] = await runManager(lane, opts);
            console.log(`[private-window] PASS ${lane}`);
        } catch (error) {
            report.failures[lane] = error.stack || String(error);
            console.error(`[private-window] FAIL ${lane}: ${error.message}`);
        }
    }
    fs.writeFileSync(path.join(opts.outDir, 'private-window-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[private-window] report: ${path.join(opts.outDir, 'private-window-report.json')}`);
    return Object.keys(report.failures).length ? 1 : 0;
}

if (require.main === module) {
    main().then((code) => process.exit(code), (error) => {
        console.error(error.stack || String(error));
        process.exit(1);
    });
}

module.exports = {
    ALL_LANES,
    MANAGER_LANES,
    SEED_QUEUE,
    SENTINELS,
    VIDEO_ID,
    assertAnonymousPrivateFetch,
    assertCookieHandoff,
    assertManagerFence,
    assertStorageFence,
    bookmarkCount,
    changedKeys,
    changedPaths,
    parseArgs,
    probeUrl,
    queueIds,
    selectLanes,
    stableStringify
};
