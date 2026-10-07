#!/usr/bin/env node
'use strict';

// Installs the shipped split userscript through real, signed Firefox builds of
// Tampermonkey and Violentmonkey in disposable profiles. The local fixture is
// intentionally served over loopback: only @match/@require/@resource/update
// metadata is rewritten for isolation; the executable userscript and its
// libraries remain the repository artifacts. The smoke proves document-start shell suppression,
// SPA-style reinsertion suppression, and the deliberately narrower contract:
// an ordinary parser request still reaches the server because a userscript
// cannot promise browser-level pre-request interception.

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
    captureScreenshot,
    evaluateJson,
    reserveLoopbackPort,
    sleep,
    startFirefoxSession,
    waitForContext,
    waitForJson
} = require('./firefox-webdriver');
const {
    AD_SELECTORS,
    resolveFirefoxExecutable
} = (() => {
    const firefoxSmoke = require('./smoke-firefox-webext');
    const chromiumSmoke = require('./smoke-zero-ads-live');
    return {
        AD_SELECTORS: chromiumSmoke.AD_SELECTORS,
        resolveFirefoxExecutable: firefoxSmoke.resolveFirefoxExecutable
    };
})();

const REPO_ROOT = path.join(__dirname, '..');
const FIXTURES_PATH = path.join(__dirname, 'userscript-manager-fixtures.json');
const USERSCRIPT_PATH = path.join(REPO_ROOT, 'YTKit.user.js');
const { INTEGRITY_FRAGMENT_RE, LIBRARIES, integrityFragment, stripIntegrity } = require('../sync-userscript');
const LIBRARY_FILES = LIBRARIES.map((library) => library.file);
// The tamper lane serves this library with one comment line appended, which
// is still valid JavaScript, so only an SRI check can stop it.
const TAMPERED_LIBRARY = 'YTKit-app.user.js';
const TAMPER_SUFFIX = Buffer.from('\n// tampered by the manager smoke\n');
const TAMPER_RUN_WAIT_MS = 15000;
const OUT_DIR = path.join(REPO_ROOT, 'build', 'userscript-manager-smoke');
const CONTRACT = 'document-start-shells-only';
const MAX_MANAGER_BYTES = 4 * 1024 * 1024;
const TRANSPARENT_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    'base64'
);
// A signed-in masthead's avatar, minus the account: every other live smoke
// runs signed out, where YouTube shows "Sign in" instead (#51).
const AVATAR_SRC = `data:image/gif;base64,${TRANSPARENT_GIF.toString('base64')}`;

function parseArgs(argv) {
    const options = {
        firefox: '',
        geckodriver: '',
        headed: false,
        keepDownloads: false,
        managers: [],
        timeoutMs: 60000
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = () => {
            const value = argv[index + 1];
            if (!value) throw new Error(`${arg} requires a value`);
            index += 1;
            return value;
        };
        if (arg === '--firefox') options.firefox = next();
        else if (arg === '--geckodriver') options.geckodriver = next();
        else if (arg === '--headed') options.headed = true;
        else if (arg === '--keep-downloads') options.keepDownloads = true;
        else if (arg === '--manager') options.managers.push(next());
        else if (arg === '--timeout-ms') options.timeoutMs = Number(next());
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10000) {
        throw new Error('--timeout-ms must be at least 10000');
    }
    return options;
}

function readManagerFixtures(filePath = FIXTURES_PATH) {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (payload?.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(payload.verifiedAt || '')) {
        throw new Error('userscript-manager-fixtures.json has an unsupported schema or invalid verifiedAt date');
    }
    if (!Array.isArray(payload.managers) || payload.managers.length !== 2) {
        throw new Error('userscript-manager-fixtures.json must pin exactly Tampermonkey and Violentmonkey');
    }
    const seen = new Set();
    for (const manager of payload.managers) {
        if (!/^(?:tampermonkey|violentmonkey)$/.test(manager.id || '') || seen.has(manager.id)) {
            throw new Error(`Invalid or duplicate userscript manager id: ${manager.id}`);
        }
        seen.add(manager.id);
        const url = new URL(manager.downloadUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'addons.mozilla.org' || !url.pathname.endsWith('.xpi')) {
            throw new Error(`${manager.id} must use an HTTPS addons.mozilla.org XPI URL`);
        }
        if (!/^[a-f0-9]{64}$/.test(manager.sha256 || '')) {
            throw new Error(`${manager.id} has an invalid SHA-256 pin`);
        }
        if (!Number.isInteger(manager.size) || manager.size <= 0 || manager.size > MAX_MANAGER_BYTES) {
            throw new Error(`${manager.id} has an invalid XPI size pin`);
        }
        if (!manager.extensionId || !manager.installUrlPattern || !manager.installButton) {
            throw new Error(`${manager.id} is missing install automation metadata`);
        }
        if (typeof manager.enforcesSri !== 'boolean') {
            throw new Error(`${manager.id} must say whether it enforces @require SRI hashes (enforcesSri)`);
        }
    }
    return payload;
}

function selectManagers(payload, requested) {
    if (!requested.length) return payload.managers;
    const unique = [...new Set(requested)];
    const selected = unique.map((id) => payload.managers.find((manager) => manager.id === id));
    const missing = unique.filter((id, index) => !selected[index]);
    if (missing.length) throw new Error(`Unknown manager(s): ${missing.join(', ')}`);
    return selected;
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function downloadManager(manager, downloadDir, timeoutMs) {
    const response = await fetch(manager.downloadUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(timeoutMs, 30000)),
        headers: { Accept: 'application/x-xpinstall, application/zip' }
    });
    if (!response.ok) throw new Error(`${manager.name} download returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength !== manager.size) {
        throw new Error(`${manager.name} XPI size header drifted: expected ${manager.size}, got ${contentLength}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length !== manager.size) {
        throw new Error(`${manager.name} XPI size drifted: expected ${manager.size}, got ${buffer.length}`);
    }
    const actualHash = sha256(buffer);
    if (actualHash !== manager.sha256) {
        throw new Error(`${manager.name} XPI SHA-256 drifted: expected ${manager.sha256}, got ${actualHash}`);
    }
    const filePath = path.join(downloadDir, `${manager.id}-${manager.version}.xpi`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

// The libraries and locale resources are tag-pinned, and the tag for an
// unreleased version doesn't exist yet, so every one of them is served from
// the fixture server instead. The bytes are still the repository artifacts.
function buildIsolatedUserscript(port) {
    const source = fs.readFileSync(USERSCRIPT_PATH, 'utf8');
    const origin = `http://127.0.0.1:${port}`;
    const localMatch = `// @match        ${origin}/*`;
    const result = source
        .replace(/^\/\/ @match\s/m, `${localMatch}\n$&`)
        // Each #sha256= pin is re-taken from the tree this server sends: the
        // shipped pins name the last tag's bytes (check-userscript-drift
        // checks those), and this lane tests the managers' check itself.
        .replace(/^(\/\/ @require\s+)\S+\/(YTKit-[a-z]+\.user\.js)#sha256=[a-f0-9]{64}$/gm,
            (_, prefix, file) => `${prefix}${origin}/${file}${integrityFragment(fs.readFileSync(path.join(REPO_ROOT, file)))}`)
        .replace(/^(\/\/ @resource\s+\S+\s+)\S+\/(extension\/_locales\/[A-Za-z_]+\/messages\.json)#sha256=[a-f0-9]{64}$/gm,
            (_, prefix, file) => `${prefix}${origin}/${file}${integrityFragment(fs.readFileSync(path.join(REPO_ROOT, file)))}`)
        .replace(/^\/\/ @updateURL.*\r?\n/m, '')
        .replace(/^\/\/ @downloadURL.*\r?\n/m, '');
    const requires = [...result.matchAll(/^\/\/ @require\s+(\S+)$/gm)].map((match) => match[1]);
    const resources = [...result.matchAll(/^\/\/ @resource\s+\S+\s+(\S+)$/gm)].map((match) => match[1]);
    if (!result.includes(localMatch)
        || LIBRARY_FILES.some((file) => !requires.map(stripIntegrity).includes(`${origin}/${file}`))
        || requires.length !== LIBRARY_FILES.length
        || requires.some((url) => !INTEGRITY_FRAGMENT_RE.test(url))
        || resources.some((url) => !url.startsWith(`${origin}/`) || !INTEGRITY_FRAGMENT_RE.test(url))) {
        throw new Error('Could not isolate userscript @match/@require/@resource metadata for the manager smoke');
    }
    if (!result.includes(`'${CONTRACT}'`)) {
        throw new Error('Shipped userscript is missing the explicit shell-only ad contract marker');
    }
    return result;
}

function fixtureHtml(token) {
    const adSelectors = JSON.stringify(AD_SELECTORS);
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Astra Deck userscript manager smoke</title>
  <script>
    window.__astraManagerTimeline = {
      parserStartedAt: performance.now(),
      contractAtParserStart: document.documentElement.getAttribute('data-ytkit-userscript-ad-contract') || ''
    };
    const recordContract = () => {
      const value = document.documentElement.getAttribute('data-ytkit-userscript-ad-contract') || '';
      if (value && !window.__astraManagerTimeline.contractObservedAt) {
        window.__astraManagerTimeline.contractObservedAt = performance.now();
        window.__astraManagerTimeline.contract = value;
      }
    };
    recordContract();
    new MutationObserver(recordContract).observe(document.documentElement, { attributes: true });
    document.addEventListener('DOMContentLoaded', () => {
      window.__astraManagerTimeline.domContentLoadedAt = performance.now();
      window.__astraManagerTimeline.contractAtDomContentLoaded =
        document.documentElement.getAttribute('data-ytkit-userscript-ad-contract') || '';
      const reinserted = document.createElement('div');
      reinserted.id = 'player-ads';
      reinserted.textContent = 'SPA-reinserted ad shell';
      reinserted.style.cssText = 'display:block;width:320px;height:100px;min-height:100px';
      document.body.append(reinserted);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const style = getComputedStyle(reinserted);
        const rect = reinserted.getBoundingClientRect();
        window.__astraManagerTimeline.reinserted = {
          display: style.display,
          visibility: style.visibility,
          width: rect.width,
          height: rect.height
        };
        document.documentElement.setAttribute('data-astra-manager-fixture-ready', '1');
      }));
    }, { once: true });
  </script>
</head>
<body>
  <header id="masthead"><input id="search" aria-label="Search">
    <ytd-topbar-menu-button-renderer class="style-scope ytd-masthead"><button id="avatar-btn" aria-label="Account menu"><yt-img-shadow class="style-scope ytd-topbar-menu-button-renderer no-transition" loaded><img id="img" class="style-scope yt-img-shadow" alt="Avatar image" width="32" height="32" src="${AVATAR_SRC}"></yt-img-shadow></button></ytd-topbar-menu-button-renderer>
  </header>
  <main>
    <ytd-video-owner-renderer><yt-img-shadow class="style-scope ytd-video-owner-renderer"><img id="channel-avatar" class="style-scope yt-img-shadow" alt="" width="40" height="40" src="${AVATAR_SRC}"></yt-img-shadow></ytd-video-owner-renderer>
    <div id="masthead-ad" style="display:block;width:320px;height:100px;min-height:100px">Initial ad shell</div>
    <img id="pre-request-probe" src="/pre-request-probe.gif?token=${encodeURIComponent(token)}" alt="">
    <div id="movie_player"><video></video></div>
  </main>
  <script>
    window.__astraManagerTimeline.initialParserShell = (() => {
      const node = document.querySelector('#masthead-ad');
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { display: style.display, visibility: style.visibility, width: rect.width, height: rect.height };
    })();
    window.__astraManagerTimeline.knownSelectors = ${adSelectors};
  </script>
</body>
</html>`;
}

async function startFixtureServer({ tamper = '' } = {}) {
    const port = await reserveLoopbackPort();
    const requests = [];
    const userscript = buildIsolatedUserscript(port);
    const libraries = new Map(LIBRARY_FILES.map((file) => {
        const bytes = fs.readFileSync(path.join(REPO_ROOT, file));
        return [`/${file}`, file === tamper ? Buffer.concat([bytes, TAMPER_SUFFIX]) : bytes];
    }));
    const server = http.createServer((request, response) => {
        const receivedAt = Date.now();
        requests.push({ method: request.method, receivedAt, url: request.url || '' });
        const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
        if (url.pathname === '/YTKit-smoke.user.js') {
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Type': 'text/javascript; charset=utf-8'
            });
            response.end(userscript);
            return;
        }
        if (libraries.has(url.pathname)) {
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Type': 'text/javascript; charset=utf-8'
            });
            response.end(libraries.get(url.pathname));
            return;
        }
        const locale = /^\/extension\/_locales\/([A-Za-z_]+)\/messages\.json$/.exec(url.pathname);
        if (locale && fs.existsSync(path.join(REPO_ROOT, 'extension', '_locales', locale[1], 'messages.json'))) {
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Type': 'application/json; charset=utf-8'
            });
            response.end(fs.readFileSync(path.join(REPO_ROOT, 'extension', '_locales', locale[1], 'messages.json')));
            return;
        }
        if (url.pathname === '/fixture') {
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Type': 'text/html; charset=utf-8'
            });
            response.end(fixtureHtml(url.searchParams.get('token') || 'missing'));
            return;
        }
        if (url.pathname === '/pre-request-probe.gif') {
            response.writeHead(200, {
                'Cache-Control': 'no-store',
                'Content-Length': String(TRANSPARENT_GIF.length),
                'Content-Type': 'image/gif'
            });
            response.end(TRANSPARENT_GIF);
            return;
        }
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((resolve) => server.close(() => resolve()))
    };
}

async function installUserscript(client, baseContext, manager, baseUrl, timeoutMs) {
    await client.command('browsingContext.navigate', {
        context: baseContext,
        url: `${baseUrl}/YTKit-smoke.user.js`,
        // Managers intercept the userscript response and open their own
        // confirmation context. Waiting for the source document to reach
        // interactive can therefore hang on Tampermonkey even though the
        // install page is already being created.
        wait: 'none'
    }).catch((error) => {
        // Violentmonkey aborts the source navigation while it opens a separate
        // confirmation tab. That expected NS_ERROR_ABORT must not hide other
        // navigation failures.
        if (!/NS_ERROR_ABORT/.test(error.message)) throw error;
    });
    const installContext = await waitForContext(
        client,
        ({ url }) => String(url).includes(manager.installUrlPattern),
        { timeoutMs, label: `${manager.name} install page` }
    );
    const installPage = await waitForJson(
        client,
        installContext.context,
        `(() => {
            const button = document.querySelector(${JSON.stringify(manager.installButton)});
            const bodyText = document.body?.innerText || '';
            return {
                button: Boolean(button),
                disabled: Boolean(button?.disabled),
                nameVisible: /YTKit v\\d+\\.\\d+\\.\\d+/.test(bodyText),
                runAtDocumentStart: /@run-at\\s+document-start/.test(bodyText),
                text: bodyText.slice(0, 2000),
                title: document.title
            };
        })()`,
        (value) => value?.button && !value.disabled && value?.nameVisible && value?.runAtDocumentStart,
        { timeoutMs, label: `${manager.name} install confirmation` }
    );
    if (!installPage.runAtDocumentStart) {
        throw new Error(`${manager.name} install page did not expose @run-at document-start`);
    }
    const clicked = await evaluateJson(
        client,
        installContext.context,
        `(() => {
            const button = document.querySelector(${JSON.stringify(manager.installButton)});
            if (!button) return false;
            button.click();
            return true;
        })()`
    );
    if (!clicked) throw new Error(`${manager.name} install confirmation button disappeared`);

    if (manager.installedText) {
        await waitForJson(
            client,
            installContext.context,
            `(() => ({
                installed: (document.body?.innerText || '').includes(${JSON.stringify(manager.installedText)}),
                buttonDisabled: Boolean(document.querySelector('#confirm')?.disabled)
            }))()`,
            (value) => value?.installed && value?.buttonDisabled,
            { timeoutMs, label: `${manager.name} installed confirmation` }
        );
    } else {
        // Tampermonkey closes or retires its ask page after confirmation.
        // Either outcome is stable; the runtime fixture below is the
        // authoritative proof that installation persisted in the profile.
        await sleep(750);
    }
    return { installContext: installContext.context, installPageTitle: installPage.title };
}

function managerFixtureExpression() {
    return `(() => {
        const snapshot = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return { display: style.display, visibility: style.visibility, opacity: style.opacity,
                width: rect.width, height: rect.height, loaded: node.complete === true && node.naturalWidth > 0 };
        };
        return {
            contract: document.documentElement.getAttribute('data-ytkit-userscript-ad-contract') || '',
            ready: document.documentElement.getAttribute('data-astra-manager-fixture-ready') === '1',
            initial: snapshot('#masthead-ad'),
            reinserted: snapshot('#player-ads'),
            accountAvatar: snapshot('#avatar-btn img'),
            channelAvatar: snapshot('#channel-avatar'),
            timeline: window.__astraManagerTimeline || null,
            masthead: Boolean(document.querySelector('#masthead')),
            search: Boolean(document.querySelector('#search')),
            player: Boolean(document.querySelector('#movie_player')),
            video: Boolean(document.querySelector('video'))
        };
    })()`;
}

function assertManagerFixture(manager, state, parserRequestObserved) {
    const failures = [];
    if (state.contract !== CONTRACT) failures.push(`contract marker is ${JSON.stringify(state.contract)}`);
    if (!state.ready) failures.push('fixture never reached its post-DOMContentLoaded reinsertion check');
    if (!state.initial || state.initial.display !== 'none' || state.initial.height !== 0) {
        failures.push(`initial ad shell was not collapsed: ${JSON.stringify(state.initial)}`);
    }
    if (!state.reinserted || state.reinserted.display !== 'none' || state.reinserted.height !== 0) {
        failures.push(`SPA-reinserted ad shell was not collapsed: ${JSON.stringify(state.reinserted)}`);
    }
    if (state.timeline?.contract !== CONTRACT || !Number.isFinite(state.timeline?.contractObservedAt)) {
        failures.push('shell-only contract timing was not observed by the fixture');
    }
    const account = state.accountAvatar;
    if (!account?.loaded || account.display === 'none' || account.visibility !== 'visible'
        || !(account.width > 0 && account.height > 0) || !(Number(account.opacity) > 0)) {
        failures.push(`signed-in account avatar is not visible: ${JSON.stringify(account)}`);
    }
    // Without the default avatar hide in force, a visible account avatar proves nothing.
    if (!state.channelAvatar || state.channelAvatar.display !== 'none') {
        failures.push(`default channel avatar hide did not apply: ${JSON.stringify(state.channelAvatar)}`);
    }
    if (!state.masthead || !state.search || !state.player || !state.video) {
        failures.push('fixture masthead/search/player workflow was damaged');
    }
    if (!parserRequestObserved) {
        failures.push('parser request did not reach the fixture server, so the pre-request limitation was not proven');
    }
    if (failures.length) throw new Error(`${manager.name}: ${failures.join('; ')}`);
}

async function runManager(manager, options, firefox, xpiPath, dependencies = {}) {
    const openFixture = dependencies.startFixtureServer || startFixtureServer;
    const openFirefox = dependencies.startFirefoxSession || startFirefoxSession;
    const fixture = await openFixture();
    const token = `${manager.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let session = null;
    try {
        session = await openFirefox({
            cwd: REPO_ROOT,
            firefox,
            geckodriver: options.geckodriver,
            headed: options.headed,
            systemAccess: true,
            commandTimeoutMs: options.timeoutMs,
            startupTimeoutMs: Math.min(options.timeoutMs, 30000)
        });
        const { client } = session;
        const installed = await client.command('webExtension.install', {
            extensionData: { type: 'archivePath', path: xpiPath.split(path.sep).join('/') }
        });
        if (installed.extension !== manager.extensionId) {
            throw new Error(`${manager.name} installed unexpected extension id: ${installed.extension}`);
        }
        const tree = await client.command('browsingContext.getTree', {});
        const baseContext = tree.contexts?.[0]?.context;
        if (!baseContext) throw new Error(`${manager.name} Firefox session has no top-level context`);
        await client.command('browsingContext.setViewport', {
            context: baseContext,
            viewport: { width: 1440, height: 900 },
            devicePixelRatio: 1
        });
        const install = await installUserscript(
            client,
            baseContext,
            manager,
            fixture.baseUrl,
            options.timeoutMs
        );
        // The first post-install navigation lets the manager persist/cache the
        // @require graph. Measure document-start timing on the following cold
        // document so a one-time install compilation does not masquerade as
        // the manager's steady-state injection contract.
        await client.command('browsingContext.navigate', {
            context: baseContext,
            url: `${fixture.baseUrl}/fixture?token=${manager.id}-warmup-${Date.now()}`,
            wait: 'complete'
        });
        await waitForJson(
            client,
            baseContext,
            managerFixtureExpression(),
            (value) => value?.ready && value?.contract === CONTRACT,
            { timeoutMs: options.timeoutMs, label: `${manager.name} post-install userscript warmup` }
        );
        await client.command('browsingContext.navigate', {
            context: baseContext,
            url: `${fixture.baseUrl}/fixture?token=${encodeURIComponent(token)}`,
            wait: 'complete'
        });
        const state = await waitForJson(
            client,
            baseContext,
            managerFixtureExpression(),
            (value) => value?.ready && value?.contract === CONTRACT && value?.timeline?.reinserted,
            { timeoutMs: options.timeoutMs, label: `${manager.name} userscript runtime fixture` }
        );
        const parserRequest = fixture.requests.find(({ url }) =>
            url.startsWith('/pre-request-probe.gif') && url.includes(encodeURIComponent(token))
        );
        assertManagerFixture(manager, state, Boolean(parserRequest));
        const managerDir = path.join(OUT_DIR, manager.id);
        await captureScreenshot(client, baseContext, path.join(managerDir, 'fixture-1440x900.png'));

        const result = {
            browser: 'Firefox',
            browserVersion: session.browserVersion,
            contract: CONTRACT,
            desktopOnly: true,
            extensionId: installed.extension,
            generatedAt: new Date().toISOString(),
            installPageTitle: install.installPageTitle,
            manager: manager.name,
            managerId: manager.id,
            managerVersion: manager.version,
            parserRequestObserved: true,
            parserRequestReceivedAt: parserRequest.receivedAt,
            runAtDocumentStart: true,
            sha256: manager.sha256,
            shellSuppression: {
                initial: state.initial,
                reinserted: state.reinserted
            },
            timeline: state.timeline
        };
        fs.mkdirSync(managerDir, { recursive: true });
        fs.writeFileSync(path.join(managerDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        return result;
    } catch (error) {
        const logs = session?.logs().trim() || '';
        if (logs) error.message += `\n${logs.slice(-4000)}`;
        throw error;
    } finally {
        if (session) await session.close();
        await fixture.close();
    }
}

// The #sha256= pins, the other way round: a fresh profile, the same install,
// and TAMPERED_LIBRARY served with a byte change. A manager that enforces SRI
// must not run the script, whether it refuses at install or at page load. One
// that doesn't (Violentmonkey, its issue #1558) must still run it, so the
// smoke notices the day that changes and enforcesSri gets flipped.
async function runTamperedManager(manager, options, firefox, xpiPath, dependencies = {}) {
    const openFixture = dependencies.startFixtureServer || startFixtureServer;
    const openFirefox = dependencies.startFirefoxSession || startFirefoxSession;
    const fixture = await openFixture({ tamper: TAMPERED_LIBRARY });
    let session = null;
    try {
        session = await openFirefox({
            cwd: REPO_ROOT,
            firefox,
            geckodriver: options.geckodriver,
            headed: options.headed,
            systemAccess: true,
            commandTimeoutMs: options.timeoutMs,
            startupTimeoutMs: Math.min(options.timeoutMs, 30000)
        });
        const { client } = session;
        await client.command('webExtension.install', {
            extensionData: { type: 'archivePath', path: xpiPath.split(path.sep).join('/') }
        });
        const tree = await client.command('browsingContext.getTree', {});
        const baseContext = tree.contexts?.[0]?.context;
        if (!baseContext) throw new Error(`${manager.name} Firefox session has no top-level context`);
        let installError = null;
        try {
            await installUserscript(client, baseContext, manager, fixture.baseUrl, options.timeoutMs);
        } catch (error) {
            installError = error;
        }
        let ran = false;
        for (const lane of ['warmup', 'measured']) {
            await client.command('browsingContext.navigate', {
                context: baseContext,
                url: `${fixture.baseUrl}/fixture?token=${manager.id}-tamper-${lane}-${Date.now()}`,
                wait: 'complete'
            });
            await waitForJson(client, baseContext, managerFixtureExpression(), (value) => value?.ready,
                { timeoutMs: options.timeoutMs, label: `${manager.name} tamper fixture` });
            const state = await waitForJson(client, baseContext, managerFixtureExpression(),
                (value) => value?.contract === CONTRACT,
                { timeoutMs: TAMPER_RUN_WAIT_MS, label: `${manager.name} tampered userscript run` }).catch(() => null);
            ran = ran || Boolean(state);
        }
        if (!fixture.requests.some(({ url }) => url.startsWith(`/${TAMPERED_LIBRARY}`))) {
            throw new Error(`${manager.name} never fetched the tampered ${TAMPERED_LIBRARY}, so the lane proves nothing`
                + (installError ? ` (install: ${installError.message.split('\n')[0]})` : ''));
        }
        if (manager.enforcesSri && ran) {
            throw new Error(`${manager.name} ran the userscript with a tampered ${TAMPERED_LIBRARY} despite its #sha256= pin`);
        }
        if (!manager.enforcesSri && !ran) {
            throw new Error(`${manager.name} refused a tampered ${TAMPERED_LIBRARY}: it enforces SRI now, so set enforcesSri`);
        }
        return { enforced: manager.enforcesSri, refusedAt: ran ? '' : (installError ? 'install' : 'page load') };
    } catch (error) {
        const logs = session?.logs().trim() || '';
        if (logs) error.message += `\n${logs.slice(-4000)}`;
        throw error;
    } finally {
        if (session) await session.close();
        await fixture.close();
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    const payload = readManagerFixtures();
    const managers = selectManagers(payload, options.managers);
    const firefox = resolveFirefoxExecutable(options.firefox);
    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-userscript-managers-'));
    const results = [];
    try {
        for (const manager of managers) {
            const xpiPath = await downloadManager(manager, downloadDir, options.timeoutMs);
            const result = await runManager(manager, options, firefox, xpiPath);
            result.sri = await runTamperedManager(manager, options, firefox, xpiPath);
            results.push(result);
            console.log(
                `[smoke-userscript-managers] PASS — ${manager.name} ${manager.version}: `
                + `${CONTRACT}; initial + reinserted shells collapsed; signed-in avatar visible; parser request observed (no pre-request claim); `
                + (result.sri.enforced
                    ? `pinned libraries load, a tampered one is refused at ${result.sri.refusedAt}`
                    : 'pinned libraries load, SRI not enforced (a tampered library still runs)')
            );
        }
        const summary = {
            schemaVersion: 1,
            verifiedAt: payload.verifiedAt,
            generatedAt: new Date().toISOString(),
            desktopOnly: true,
            contract: CONTRACT,
            results
        };
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(path.join(OUT_DIR, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
        console.log(`[smoke-userscript-managers] evidence: ${OUT_DIR}`);
        return summary;
    } finally {
        if (!options.keepDownloads && fs.existsSync(downloadDir)) {
            fs.rmSync(downloadDir, { recursive: true, force: true });
        } else if (options.keepDownloads) {
            console.log(`[smoke-userscript-managers] retained manager XPIs: ${downloadDir}`);
        }
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[smoke-userscript-managers]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    CONTRACT,
    FIXTURES_PATH,
    MAX_MANAGER_BYTES,
    assertManagerFixture,
    buildIsolatedUserscript,
    downloadManager,
    fixtureHtml,
    managerFixtureExpression,
    parseArgs,
    readManagerFixtures,
    runManager,
    runTamperedManager,
    selectManagers,
    sha256,
    startFixtureServer
};
