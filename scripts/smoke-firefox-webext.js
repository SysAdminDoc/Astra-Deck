#!/usr/bin/env node
'use strict';

// Live Firefox smoke for the always-on zero-ad contract. The default lane
// installs the staged store-safe extension through WebDriver BiDi in a fresh
// profile, proves the static ruleset handshake, captures an actual blocked
// matching request, and checks live YouTube's desktop shell and SPA player.
// The headed --manual-optional-hosts lane intentionally remains on web-ext so
// an operator can interact with Firefox's browser-owned permission prompt.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { createFirefoxStage } = require('./check-firefox-webext');
const {
    captureScreenshot,
    clickElementExpression,
    evaluateJson,
    resolveGeckodriverExecutable,
    sleep,
    startFirefoxSession,
    waitForJson
} = require('./firefox-webdriver');
const { AD_SELECTORS, AD_URL_RE } = require('./smoke-zero-ads-live');

const REPO_ROOT = path.join(__dirname, '..');
const WEB_EXT_BIN = path.join(REPO_ROOT, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const OUT_DIR = path.join(REPO_ROOT, 'build', 'firefox-zero-ad-smoke');
const DEFAULT_START_URL = 'https://www.youtube.com/';
const FIREFOX_GECKO_ID = 'ytkit@sysadmindoc.github.io';
const FIREFOX_OPTIONAL_HOST_UUID = '2f88b30c-68f9-4f4d-8c0e-e71f33a58a01';
const ZERO_AD_RULESET_ID = 'astra_zero_ads';
const MANUAL_OPTIONAL_HOST_TIMEOUT_MS = 180000;

function isFirefoxExtensionUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function firefoxExtensionUrl(uuid, filePath = 'popup.html') {
    if (!isFirefoxExtensionUuid(uuid)) {
        throw new Error(`Invalid Firefox extension UUID: ${uuid}`);
    }
    const normalizedPath = String(filePath || 'popup.html').replace(/^\/+/, '');
    return `moz-extension://${uuid}/${normalizedPath}`;
}

function firefoxUuidPreference(uuid) {
    if (!isFirefoxExtensionUuid(uuid)) {
        throw new Error(`Invalid Firefox extension UUID: ${uuid}`);
    }
    return `extensions.webextensions.uuids=${JSON.stringify({ [FIREFOX_GECKO_ID]: uuid })}`;
}

function firefoxCandidates(cliPath, { env = process.env, platform = process.platform } = {}) {
    const candidates = [];
    if (cliPath) candidates.push(cliPath);
    if (env.FIREFOX_PATH) candidates.push(env.FIREFOX_PATH);
    if (platform === 'win32') {
        const pf = env.ProgramFiles || 'C:\\Program Files';
        const pfx86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        candidates.push(
            path.join(pf, 'Mozilla Firefox', 'firefox.exe'),
            path.join(pfx86, 'Mozilla Firefox', 'firefox.exe'),
            path.join(pf, 'Firefox Developer Edition', 'firefox.exe'),
            path.join(pfx86, 'Firefox Developer Edition', 'firefox.exe'),
            path.join(pf, 'Firefox Nightly', 'firefox.exe'),
            path.join(pfx86, 'Firefox Nightly', 'firefox.exe')
        );
    } else if (platform === 'darwin') {
        candidates.push('/Applications/Firefox.app/Contents/MacOS/firefox');
    } else {
        candidates.push('/usr/bin/firefox', '/usr/local/bin/firefox');
    }
    return candidates;
}

function resolveFirefoxExecutable(cliPath = '') {
    const found = firefoxCandidates(cliPath).find((candidate) =>
        candidate && fs.existsSync(candidate)
    );
    if (!found) {
        throw new Error('Firefox executable not found. Install Firefox or pass --firefox <path>.');
    }
    return found;
}

function parseArgs(argv) {
    const opts = {
        extensionUuid: FIREFOX_OPTIONAL_HOST_UUID,
        firefox: '',
        geckodriver: '',
        headed: false,
        keepStage: false,
        manualOptionalHosts: false,
        stageRoot: '',
        startUrl: DEFAULT_START_URL,
        timeoutMs: 60000
    };
    let timeoutProvided = false;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[i + 1];
            if (!value) throw new Error(`${arg} requires a value`);
            i += 1;
            return value;
        };
        if (arg === '--extension-uuid') opts.extensionUuid = next();
        else if (arg === '--firefox') opts.firefox = next();
        else if (arg === '--geckodriver') opts.geckodriver = next();
        else if (arg === '--headed') opts.headed = true;
        else if (arg === '--keep-stage') opts.keepStage = true;
        else if (arg === '--manual-optional-hosts') opts.manualOptionalHosts = true;
        else if (arg === '--stage-root') opts.stageRoot = path.resolve(next());
        else if (arg === '--start-url') opts.startUrl = next();
        else if (arg === '--timeout-ms') {
            opts.timeoutMs = Number(next()) || opts.timeoutMs;
            timeoutProvided = true;
        } else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!isFirefoxExtensionUuid(opts.extensionUuid)) {
        throw new Error('--extension-uuid must be a UUID such as 2f88b30c-68f9-4f4d-8c0e-e71f33a58a01');
    }
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 5000) {
        throw new Error('--timeout-ms must be at least 5000');
    }
    if (opts.manualOptionalHosts && !opts.headed) {
        throw new Error('--manual-optional-hosts requires --headed');
    }
    if (opts.manualOptionalHosts && !timeoutProvided) {
        opts.timeoutMs = MANUAL_OPTIONAL_HOST_TIMEOUT_MS;
    }
    return opts;
}

function firefoxStartUrls(opts) {
    const urls = [];
    if (opts.manualOptionalHosts) {
        urls.push(firefoxExtensionUrl(opts.extensionUuid, 'popup.html'));
    }
    if (opts.startUrl) urls.push(opts.startUrl);
    return urls;
}

function buildWebExtRunArgs(stageDir, firefox, opts) {
    const args = [
        WEB_EXT_BIN,
        'run',
        '--source-dir',
        stageDir,
        '--target',
        'firefox-desktop'
    ];
    for (const startUrl of firefoxStartUrls(opts)) {
        args.push('--start-url', startUrl);
    }
    args.push('--no-reload', '--firefox', firefox);
    if (opts.manualOptionalHosts) {
        args.push('--pref', firefoxUuidPreference(opts.extensionUuid));
    }
    if (!opts.headed) args.push('--arg=-headless');
    return args;
}

function killProcessTree(proc) {
    if (!proc || proc.exitCode !== null) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true
        });
    } else {
        proc.kill('SIGTERM');
    }
}

function hasStartupFailure(output) {
    return /WebExtError|ExtensionError|Failed to start Firefox|Error:|TypeError:|ReferenceError:/i.test(output);
}

function runManualFirefoxSmoke(opts, firefox, stageRoot, stageDir, manifest) {
    if (!fs.existsSync(WEB_EXT_BIN)) {
        throw new Error('web-ext is not installed. Run `npm ci` before the manual Firefox smoke.');
    }
    return new Promise((resolve, reject) => {
        const args = buildWebExtRunArgs(stageDir, firefox, opts);
        const startedAt = Date.now();
        const proc = spawn(process.execPath, args, {
            cwd: REPO_ROOT,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        let stdout = '';
        let stderr = '';
        let settled = false;

        function finish(error, timedOut = false, code = proc.exitCode) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            killProcessTree(proc);
            if (!opts.keepStage && fs.existsSync(stageRoot)) {
                fs.rmSync(stageRoot, { recursive: true, force: true });
            }
            if (error) reject(error);
            else resolve({
                firefox,
                geckoId: manifest.browser_specific_settings?.gecko?.id || '',
                expectedOptionalOrigins: manifest.optional_host_permissions || [],
                manualOptionalHosts: true,
                manifestVersion: manifest.manifest_version,
                popupUrl: firefoxExtensionUrl(opts.extensionUuid, 'popup.html'),
                profile: 'store-safe',
                startUrl: opts.startUrl,
                timedOut,
                code,
                durationMs: Date.now() - startedAt,
                stdout,
                stderr
            });
        }

        const timer = setTimeout(() => {
            const combined = `${stdout}\n${stderr}`;
            if (hasStartupFailure(combined)) {
                finish(new Error(`Firefox smoke saw startup errors:\n${combined.trim()}`), true);
            } else {
                finish(null, true);
            }
        }, opts.timeoutMs);
        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.once('error', (error) => finish(error));
        proc.once('exit', (code) => {
            const combined = `${stdout}\n${stderr}`;
            if (code !== 0 || hasStartupFailure(combined)) {
                finish(new Error(`Firefox smoke exited with ${code}:\n${combined.trim()}`), false, code);
            } else {
                finish(null, false, code);
            }
        });
    });
}

function pageSnapshotExpression() {
    return `(() => {
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
            rulesetState: document.documentElement.getAttribute('data-ytkit-zero-ad-ruleset') || '',
            astraTrigger: Boolean(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn')),
            masthead: Boolean(document.querySelector('ytd-masthead, #masthead')),
            search: Boolean(document.querySelector('yt-searchbox input, input#search')),
            feedCards: document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length,
            player: Boolean(document.querySelector('#movie_player, ytd-player')),
            video: Boolean(document.querySelector('video.html5-main-video')),
            shells
        };
    })()`;
}

function assertPageSnapshot(snapshot, routeName) {
    const failures = [];
    if (snapshot.rulesetState !== 'enabled') {
        failures.push(`${routeName}: Firefox did not report ${ZERO_AD_RULESET_ID} enabled`);
    }
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
    if (failures.length) throw new Error(failures.join('\n'));
}

function networkEventsForToken(events, startIndex, token) {
    return events.slice(startIndex).filter((event) => {
        const url = event?.params?.request?.url || '';
        return url.includes(token);
    });
}

async function proveMatchingRequestBlocked(client, context, timeoutMs) {
    const token = `astra-firefox-dnr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const startIndex = client.events.length;
    await evaluateJson(client, context, `(() => {
        const image = new Image();
        image.id = ${JSON.stringify(token)};
        image.src = ${JSON.stringify(`https://doubleclick.net/${token}.gif`)};
        document.documentElement.append(image);
        return { url: image.src };
    })()`);
    const deadline = Date.now() + timeoutMs;
    let events = [];
    while (Date.now() < deadline) {
        events = networkEventsForToken(client.events, startIndex, token);
        if (events.some(({ method }) => method === 'network.fetchError')) break;
        await sleep(100);
    }
    const request = events.find(({ method }) => method === 'network.beforeRequestSent');
    const response = events.find(({ method }) => method === 'network.responseStarted');
    const failure = events.find(({ method }) => method === 'network.fetchError');
    if (!request) throw new Error('Firefox emitted no request event for the deterministic DNR probe');
    if (response) throw new Error(`Firefox DNR probe received a response: ${response.params?.request?.url || ''}`);
    if (!failure || !/(?:ABORT|BLOCK)/i.test(failure.params?.errorText || '')) {
        throw new Error(`Firefox did not report a browser-level block for the DNR probe: ${JSON.stringify(events)}`);
    }
    const probeUrl = request.params?.request?.url || '';
    const parsed = new URL(probeUrl);
    if (!AD_URL_RE.test(`${parsed.hostname}${parsed.pathname}`)) {
        throw new Error(`Firefox DNR probe URL is outside the zero-ad contract: ${probeUrl}`);
    }
    return {
        errorText: failure.params.errorText,
        requestId: request.params?.request?.request || '',
        url: probeUrl
    };
}

async function injectDeterministicAdShell(client, context) {
    return evaluateJson(client, context, `(() => {
        document.querySelector('#astra-firefox-ad-shell')?.remove();
        const shell = document.createElement('ytd-ad-slot-renderer');
        shell.id = 'astra-firefox-ad-shell';
        shell.textContent = 'Astra Deck deterministic ad-shell probe';
        shell.style.cssText = 'display:block;width:320px;height:100px;min-height:100px';
        document.body.append(shell);
        const style = getComputedStyle(shell);
        const rect = shell.getBoundingClientRect();
        return { display: style.display, visibility: style.visibility, width: rect.width, height: rect.height };
    })()`);
}

async function runAutomatedFirefoxSmoke(opts, firefox, stageRoot, stageDir, manifest) {
    resolveGeckodriverExecutable(opts.geckodriver);
    const session = await startFirefoxSession({
        cwd: REPO_ROOT,
        firefox,
        geckodriver: opts.geckodriver,
        headed: opts.headed,
        commandTimeoutMs: opts.timeoutMs,
        startupTimeoutMs: Math.min(opts.timeoutMs, 30000),
        prefs: {
            'extensions.dnr.feedback': true,
            'extensions.webextensions.uuids': JSON.stringify({
                [FIREFOX_GECKO_ID]: opts.extensionUuid
            })
        }
    });
    const { client } = session;
    try {
        await client.command('session.subscribe', {
            events: [
                'network.beforeRequestSent',
                'network.responseStarted',
                'network.fetchError',
                'log.entryAdded'
            ]
        });
        const installed = await client.command('webExtension.install', {
            extensionData: { type: 'path', path: stageDir.split(path.sep).join('/') }
        });
        if (installed.extension !== FIREFOX_GECKO_ID) {
            throw new Error(`Firefox installed unexpected extension id: ${installed.extension}`);
        }
        const tree = await client.command('browsingContext.getTree', {});
        const context = tree.contexts?.[0]?.context;
        if (!context) throw new Error('Firefox WebDriver session has no top-level browsing context');
        await client.command('browsingContext.setViewport', {
            context,
            viewport: { width: 1440, height: 900 },
            devicePixelRatio: 1
        });
        await client.command('browsingContext.navigate', {
            context,
            url: opts.startUrl,
            wait: 'interactive'
        });
        await waitForJson(
            client,
            context,
            `(() => ({
                app: Boolean(document.querySelector('ytd-app')),
                masthead: Boolean(document.querySelector('ytd-masthead, #masthead')),
                trigger: Boolean(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn')),
                ruleset: document.documentElement.getAttribute('data-ytkit-zero-ad-ruleset') || ''
            }))()`,
            (value) => value?.app && value?.masthead && value?.trigger && value?.ruleset === 'enabled',
            { timeoutMs: opts.timeoutMs, label: 'YouTube shell, Astra runtime, and enabled Firefox ruleset' }
        );

        const deterministicShell = await injectDeterministicAdShell(client, context);
        if (deterministicShell.display !== 'none' || deterministicShell.height !== 0) {
            throw new Error(`Firefox did not collapse the deterministic ad shell: ${JSON.stringify(deterministicShell)}`);
        }
        const dnrProbe = await proveMatchingRequestBlocked(client, context, Math.min(opts.timeoutMs, 15000));
        const home = await evaluateJson(client, context, pageSnapshotExpression());
        assertPageSnapshot(home, 'home');
        await captureScreenshot(client, context, path.join(OUT_DIR, 'home-1440x900.png'));

        await client.command('browsingContext.navigate', {
            context,
            url: 'https://www.youtube.com/results?search_query=open+source+browser+extensions',
            wait: 'interactive'
        });
        await waitForJson(
            client,
            context,
            `(() => {
                const link = Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
                    .find((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
                return { href: link?.href || '', search: Boolean(document.querySelector('yt-searchbox input, input#search')) };
            })()`,
            (value) => value?.search && /\/watch\?v=/.test(value.href || ''),
            { timeoutMs: opts.timeoutMs, label: 'a visible Firefox YouTube search-result watch link' }
        );
        await clickElementExpression(
            client,
            context,
            `Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
                .find((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)`
        );
        await waitForJson(
            client,
            context,
            `(() => ({
                watch: location.pathname === '/watch',
                video: Boolean(document.querySelector('video.html5-main-video')),
                trigger: Boolean(document.querySelector('#ytkit-masthead-btn, #ytkit-watch-btn'))
            }))()`,
            (value) => value?.watch && value?.video && value?.trigger,
            { timeoutMs: opts.timeoutMs, label: 'Firefox YouTube SPA watch route and player' }
        );
        await sleep(1500);
        const watch = await evaluateJson(client, context, pageSnapshotExpression());
        assertPageSnapshot(watch, 'watch');
        await captureScreenshot(client, context, path.join(OUT_DIR, 'watch-1440x900.png'));

        const naturalBlocked = client.events.filter((event) => {
            if (event.method !== 'network.fetchError') return false;
            const url = event.params?.request?.url || '';
            try {
                const parsed = new URL(url);
                return AD_URL_RE.test(`${parsed.hostname}${parsed.pathname}`);
            } catch (_) {
                return false;
            }
        });
        const result = {
            browser: 'Firefox',
            browserVersion: session.browserVersion,
            desktopOnly: true,
            dnrProbe,
            enabledRulesets: [ZERO_AD_RULESET_ID],
            extensionId: installed.extension,
            firefox,
            generatedAt: new Date().toISOString(),
            geckodriver: session.geckodriver,
            home,
            manifestVersion: manifest.manifest_version,
            naturalBlockedAdRequests: naturalBlocked.length,
            profile: 'store-safe',
            startUrl: opts.startUrl,
            watch
        };
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(path.join(OUT_DIR, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
        return result;
    } catch (error) {
        const logs = session.logs().trim();
        if (logs) error.message += `\n${logs.slice(-4000)}`;
        throw error;
    } finally {
        await session.close();
        if (!opts.keepStage && fs.existsSync(stageRoot)) {
            fs.rmSync(stageRoot, { recursive: true, force: true });
        }
    }
}

async function runFirefoxSmoke(opts) {
    const firefox = resolveFirefoxExecutable(opts.firefox);
    const stageRoot = opts.stageRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'astra-firefox-smoke-'));
    fs.mkdirSync(stageRoot, { recursive: true });
    const stageDir = createFirefoxStage('store-safe', stageRoot);
    const manifest = JSON.parse(fs.readFileSync(path.join(stageDir, 'manifest.json'), 'utf8'));
    if (opts.manualOptionalHosts) {
        return runManualFirefoxSmoke(opts, firefox, stageRoot, stageDir, manifest);
    }
    return runAutomatedFirefoxSmoke(opts, firefox, stageRoot, stageDir, manifest);
}

async function main(argv = process.argv.slice(2)) {
    const result = await runFirefoxSmoke(parseArgs(argv));
    if (result.manualOptionalHosts) {
        const status = result.timedOut ? 'observed clean startup window' : `exited ${result.code}`;
        console.log(`[smoke-firefox-webext] ${result.profile}: ${status} in ${result.durationMs}ms`);
        console.log(`[smoke-firefox-webext] manifest: mv${result.manifestVersion}, gecko=${result.geckoId}`);
        console.log(`[smoke-firefox-webext] firefox: ${result.firefox}`);
        console.log(`[smoke-firefox-webext] optional-host popup: ${result.popupUrl}`);
        console.log(`[smoke-firefox-webext] optional hosts expected: ${result.expectedOptionalOrigins.join(', ')}`);
        console.log('[smoke-firefox-webext] operator check: grant, deny, and revoke the exact host in fresh profiles.');
        return result;
    }
    console.log(
        `[smoke-firefox-webext] PASS — Firefox ${result.browserVersion} loaded ${result.extensionId}; `
        + `${result.enabledRulesets.join(', ')} enabled; matching request blocked (${result.dnrProbe.errorText}); `
        + 'ad shells collapsed; home/search/SPA player intact'
    );
    console.log(`[smoke-firefox-webext] evidence: ${OUT_DIR}`);
    return result;
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[smoke-firefox-webext]', error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_START_URL,
    FIREFOX_GECKO_ID,
    FIREFOX_OPTIONAL_HOST_UUID,
    MANUAL_OPTIONAL_HOST_TIMEOUT_MS,
    ZERO_AD_RULESET_ID,
    assertPageSnapshot,
    buildWebExtRunArgs,
    firefoxCandidates,
    firefoxExtensionUrl,
    firefoxStartUrls,
    firefoxUuidPreference,
    hasStartupFailure,
    injectDeterministicAdShell,
    isFirefoxExtensionUuid,
    networkEventsForToken,
    pageSnapshotExpression,
    parseArgs,
    proveMatchingRequestBlocked,
    resolveFirefoxExecutable,
    runFirefoxSmoke
};
