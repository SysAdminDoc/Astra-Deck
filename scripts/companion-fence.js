'use strict';

// Keeps browser smokes away from the Astra Downloader installed on this PC.
//
// The live smokes stage the extension in a fresh temp folder, so every run is
// a new extension ID. Opening the settings panel builds the Downloads pane,
// which runs MediaDLManager.check(): it probes every companion port and POSTs
// /pair-extension. The real companion paired each throwaway ID it was sent
// (about 25 of them on 2026-11-23), and a download click could also fire
// mediadl://start and launch it.
//
// Three layers, so one that a Chromium build ignores still leaves the others:
//   1. chromiumArgs() maps every companion host:port to ~NOTFOUND through
//      --host-resolver-rules. Chromium resolves IP literals through the same
//      mapped resolver, and a MAP rule matches host:port, so nothing else on
//      127.0.0.1 is touched (DevTools and the smokes' own fixture servers use
//      ephemeral ports).
//   2. fenceCompanion() blocks the same URLs over CDP on the extension's
//      service worker and the page, which also covers --port attach runs that
//      did not launch the browser, and cancels any mediadl: anchor click in
//      the page before the browser hands it to the OS.
//   3. assertCompanionUnreachable() fetches /health on every port from the
//      worker and stops the smoke if anything answers.

// The catalogue extension/core/companion-ports.js is generated from, read
// without that module's global side effect.
const { loadCompanionPortCatalogue } = require('./companion-port-catalogue');

const COMPANION_PORTS = Object.freeze([...loadCompanionPortCatalogue().ports]);
const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '[::1]']);
const COMPANION_PROTOCOLS = Object.freeze(['mediadl:']);

function companionEndpoints(ports = COMPANION_PORTS) {
    return LOOPBACK_HOSTS.flatMap((host) => ports.map((port) => `${host}:${port}`));
}

function companionHostResolverRules(ports = COMPANION_PORTS) {
    return companionEndpoints(ports).map((endpoint) => `MAP ${endpoint} ~NOTFOUND`).join(', ');
}

function companionFenceArgs(ports = COMPANION_PORTS) {
    return [`--host-resolver-rules=${companionHostResolverRules(ports)}`];
}

function companionBlockedUrls(ports = COMPANION_PORTS) {
    return companionEndpoints(ports).map((endpoint) => `*://${endpoint}/*`);
}

// Runs in the page's main world. The extension launches the companion with
// a hidden <a href="mediadl://start"> it clicks from its isolated world; the
// DOM and its event listeners are shared between worlds, so a capturing
// listener here sees that click and cancels the navigation.
const COMPANION_PROTOCOL_GUARD = `(() => {
    if (window.__astraCompanionProtocolGuard) return;
    const schemes = ${JSON.stringify(COMPANION_PROTOCOLS)};
    const guard = { blocked: [] };
    Object.defineProperty(window, '__astraCompanionProtocolGuard', { value: guard });
    window.addEventListener('click', (event) => {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
        for (const node of path) {
            const href = node && node.tagName === 'A' && typeof node.getAttribute === 'function'
                ? String(node.getAttribute('href') || '').trim().toLowerCase()
                : '';
            if (href && schemes.some((scheme) => href.startsWith(scheme))) {
                event.preventDefault();
                guard.blocked.push(href);
                return;
            }
        }
    }, true);
})();`;

// The worker's own fetch, so it goes out exactly the way the extension's
// companion requests do. no-cors: a companion that answers resolves even
// without CORS headers; only a refused or blocked connection rejects.
const REACHABILITY_PROBE = (ports) => `Promise.all(${JSON.stringify(ports)}.map((port) =>
    fetch('http://127.0.0.1:' + port + '/health', { mode: 'no-cors', cache: 'no-store' })
        .then(() => port, () => null)
)).then((answered) => answered.filter((port) => port !== null))`;

async function evaluateValue(client, expression) {
    const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
}

async function assertCompanionUnreachable(background, ports = COMPANION_PORTS) {
    const answered = await evaluateValue(background, REACHABILITY_PROBE(ports));
    if (Array.isArray(answered) && answered.length) {
        throw new Error(`The companion fence is open: port ${answered.join(', ')} answered from the extension worker. `
            + 'Stopping before the extension can pair this throwaway ID with the installed Astra Downloader.');
    }
    return true;
}

async function blockCompanionUrls(client, extraUrls = []) {
    await client.send('Network.enable');
    await client.send('Network.setBlockedURLs', { urls: [...extraUrls, ...companionBlockedUrls()] });
}

async function fenceCompanion({ background, page }) {
    const notes = [];
    if (background) {
        try {
            await blockCompanionUrls(background);
        } catch (error) {
            // The launch flag and the reachability check below still hold.
            notes.push(`worker URL block unavailable: ${error.message}`);
        }
    }
    if (page) {
        await blockCompanionUrls(page);
        await page.send('Page.enable');
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: COMPANION_PROTOCOL_GUARD });
        await evaluateValue(page, COMPANION_PROTOCOL_GUARD);
    }
    if (background) await assertCompanionUnreachable(background);
    return notes;
}

module.exports = {
    COMPANION_PORTS,
    COMPANION_PROTOCOLS,
    COMPANION_PROTOCOL_GUARD,
    assertCompanionUnreachable,
    blockCompanionUrls,
    companionBlockedUrls,
    companionEndpoints,
    companionFenceArgs,
    companionHostResolverRules,
    fenceCompanion,
};
