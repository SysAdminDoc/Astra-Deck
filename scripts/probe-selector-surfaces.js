#!/usr/bin/env node
'use strict';

// Selector surfaces against what YouTube renders right now.
//
// An MHTML capture only holds what a resting page had drawn. The guide needs a
// wide window, the transcript and dialogs have to be opened, and a signed-out
// home page has no feed, so a surface can look dead in every capture and still
// be live. This opens those states in a headless browser with no extension
// loaded and counts every selector of every surface.
//
// Nothing here signs in. What only an account can see (the comment composer,
// notifications, the Subscriptions page) prints as unproven, which is honest.
//
//   npm run probe:selector-surfaces
//   npm run probe:selector-surfaces -- --surfaces feedCard,modals --chrome <path>

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { loadSurfaceSelectorMap } = require('./build-selector-fixtures.js');
const {
    chromeLaunchArgs,
    connect,
    fetchJson,
    findFreePort,
    ordinaryUserAgent,
    removeProfileDir,
    resolveChrome,
    sleep,
    stopChrome,
    waitForEndpoint,
} = require('./capture-watch-mhtml.js');

const WATCH_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const OPEN_TRANSCRIPT = `(async () => {
    document.querySelector('ytd-text-inline-expander #expand, tp-yt-paper-button#expand')?.click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    document.querySelector('ytd-video-description-transcript-section-renderer button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 3000));
})()`;

// YouTube's own popup action, so the dialog comes from its real renderer.
const OPEN_DIALOG = `(async () => {
    const app = document.querySelector('ytd-app');
    app.dispatchEvent(new CustomEvent('yt-action', {
        bubbles: true,
        composed: true,
        detail: {
            actionName: 'yt-open-popup-action',
            args: [{
                openPopupAction: {
                    popup: {
                        confirmDialogRenderer: {
                            title: { runs: [{ text: 'Selector probe' }] },
                            confirmButton: { buttonRenderer: { style: 'STYLE_BLUE_TEXT', size: 'SIZE_DEFAULT', text: { runs: [{ text: 'OK' }] } } },
                            primaryIsCancel: false,
                        },
                    },
                    popupType: 'DIALOG',
                },
            }, app],
            optionalAction: false,
            returnValue: [],
        },
    }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
})()`;

const STOPS = [
    { name: 'home', url: 'https://www.youtube.com/' },
    { name: 'channel videos', url: 'https://www.youtube.com/@PBSNewsHour/videos' },
    { name: 'channel home', url: 'https://www.youtube.com/@PBSNewsHour' },
    { name: 'live hub', url: 'https://www.youtube.com/channel/UC4R8DWoMoI7CAwX8_LjQHig' },
    { name: 'channel shorts', url: 'https://www.youtube.com/@PBSNewsHour/shorts' },
    { name: 'playables', url: 'https://www.youtube.com/playables' },
    { name: 'search', url: 'https://www.youtube.com/results?search_query=news' },
    { name: 'transcript', url: WATCH_URL, action: OPEN_TRANSCRIPT },
    { name: 'dialog', action: OPEN_DIALOG },
];

function parseArgs(argv) {
    const opts = { chrome: null, surfaces: null };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--chrome') opts.chrome = argv[++i];
        else if (argv[i] === '--surfaces') opts.surfaces = String(argv[++i] || '').split(',').filter(Boolean);
        else throw new Error(`Unknown option: ${argv[i]}`);
    }
    return opts;
}

function selectSurfaces(map, names) {
    const picked = {};
    for (const surface of names || Object.keys(map).sort()) {
        if (!map[surface]) throw new Error(`Unknown surface: ${surface}`);
        picked[surface] = { stable: [...map[surface].stable], fallback: [...map[surface].fallback] };
    }
    return picked;
}

function buildCountExpression(surfaces) {
    return `(() => {
        const surfaces = ${JSON.stringify(surfaces)};
        const counts = {};
        for (const [surface, lists] of Object.entries(surfaces)) {
            counts[surface] = {};
            for (const selector of [...lists.stable, ...lists.fallback]) {
                try { counts[surface][selector] = document.querySelectorAll(selector).length; }
                catch { counts[surface][selector] = -1; }
            }
        }
        return counts;
    })()`;
}

function recordCounts(seen, stop, counts) {
    for (const [surface, row] of Object.entries(counts)) {
        seen[surface] = seen[surface] || {};
        for (const [selector, count] of Object.entries(row)) {
            seen[surface][selector] = seen[surface][selector] || [];
            if (count > 0) seen[surface][selector].push(`${stop}:${count}`);
        }
    }
    return seen;
}

function summarizeSurface(lists, seenRow = {}) {
    const row = (selector) => ({ selector, seenOn: seenRow[selector] || [] });
    const stable = lists.stable.map(row);
    const fallback = lists.fallback.map(row);
    return {
        stable,
        fallback,
        proven: stable.filter((item) => item.seenOn.length > 0).length,
        total: stable.length,
    };
}

function formatSurface(surface, summary) {
    const line = (kind, item) => `  ${kind} ${item.seenOn.length ? 'yes' : ' - '} ${item.selector}${item.seenOn.length ? `  (${item.seenOn.slice(0, 3).join(', ')})` : ''}`;
    return [
        `${surface}: ${summary.proven}/${summary.total} stable selectors seen`,
        ...summary.stable.map((item) => line('stable  ', item)),
        ...summary.fallback.map((item) => line('fallback', item)),
    ].join('\n');
}

async function evaluate(cdp, expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, 45000);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'page script failed');
    return result.result?.value;
}

async function probe(opts) {
    const surfaces = selectSurfaces(loadSurfaceSelectorMap(), opts.surfaces);
    const countExpression = buildCountExpression(surfaces);
    const port = await findFreePort();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-deck-probe-'));
    const proc = spawn(resolveChrome(opts.chrome), chromeLaunchArgs({ port, userDataDir }), { stdio: 'ignore', windowsHide: true });
    let cdp = null;
    const seen = {};
    try {
        await waitForEndpoint(port);
        const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
        const page = pages.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
        if (!page) throw new Error('No debuggable page target');
        cdp = await connect(page.webSocketDebuggerUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Network.enable');
        const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
        await cdp.send('Network.setUserAgentOverride', { userAgent: ordinaryUserAgent(version['User-Agent']) });
        await cdp.send('Network.setBlockedURLs', { urls: ['*.googlevideo.com/*', '*stats/watchtime*'] });
        // Below about 1312 pixels YouTube never builds the full guide.
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
        for (const stop of STOPS) {
            if (stop.url) {
                await cdp.send('Page.navigate', { url: stop.url });
                await sleep(5000);
                await evaluate(cdp, 'window.scrollTo(0, 1600)');
                await sleep(1500);
            }
            if (stop.action) await evaluate(cdp, stop.action);
            recordCounts(seen, stop.name, await evaluate(cdp, countExpression));
        }
    } finally {
        if (cdp) cdp.close();
        await stopChrome(proc);
        await removeProfileDir(userDataDir);
    }
    for (const [surface, lists] of Object.entries(surfaces)) {
        console.log(formatSurface(surface, summarizeSurface(lists, seen[surface])));
    }
}

if (require.main === module) {
    probe(parseArgs(process.argv.slice(2))).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { buildCountExpression, parseArgs, recordCounts, selectSurfaces, summarizeSurface };
