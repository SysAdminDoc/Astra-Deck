#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const WebSocket = require('ws');
const {
    patchManifestForBuildProfile,
} = require('../build-extension.js');

const REPO_ROOT = path.join(__dirname, '..');
const EXT_DIR = path.join(REPO_ROOT, 'extension');
const SETTINGS_STORAGE_KEY = 'ytSuiteSettings';
const POPUP_BOOT_SETTINGS = Object.freeze({
    sponsorBlock: true,
    returnDislike: true,
    redditComments: true,
    thumbnailQualityUpgrade: true,
    downloadThumbnail: true,
    privacyDataFlowPanel: true,
});

const STAGE_SKIP_NAMES = new Set([
    '.git',
    '.DS_Store',
    'Thumbs.db',
    'node_modules',
    '.claude-octopus',
]);

const STAGE_SKIP_SUFFIXES = [
    '.map',
    '.tmp',
    '.bak',
    '.orig',
    '.rej',
];

function shouldStageEntry(entryName) {
    if (STAGE_SKIP_NAMES.has(entryName)) return false;
    return !STAGE_SKIP_SUFFIXES.some((suffix) => entryName.endsWith(suffix));
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (!shouldStageEntry(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

function createChromiumStage(stageRoot) {
    const stageDir = path.join(stageRoot, 'store-safe-chromium-stage');
    fs.rmSync(stageDir, { recursive: true, force: true });
    copyDir(EXT_DIR, stageDir);

    const manifestPath = path.join(stageDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    patchManifestForBuildProfile(manifest, 'store-safe');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { manifest, stageDir };
}

function pushIfFile(candidates, label, filePath) {
    if (filePath) candidates.push({ label, path: filePath });
}

function browserCandidates(cliPath) {
    const candidates = [];
    pushIfFile(candidates, 'custom Chromium', cliPath);
    pushIfFile(candidates, 'env CHROMIUM_PATH', process.env.CHROMIUM_PATH);
    pushIfFile(candidates, 'env CHROME_PATH', process.env.CHROME_PATH);
    pushIfFile(candidates, 'env EDGE_PATH', process.env.EDGE_PATH);

    if (process.platform === 'win32') {
        const pf = process.env.ProgramFiles || 'C:\\Program Files';
        const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        pushIfFile(candidates, 'Google Chrome', path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        pushIfFile(candidates, 'Microsoft Edge', path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        pushIfFile(candidates, 'Microsoft Edge (x86)', path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    } else if (process.platform === 'darwin') {
        pushIfFile(candidates, 'Google Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
        pushIfFile(candidates, 'Microsoft Edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
        pushIfFile(candidates, 'Chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium');
    } else {
        pushIfFile(candidates, 'google-chrome', '/usr/bin/google-chrome');
        pushIfFile(candidates, 'chromium', '/usr/bin/chromium');
        pushIfFile(candidates, 'chromium-browser', '/usr/bin/chromium-browser');
        pushIfFile(candidates, 'microsoft-edge', '/usr/bin/microsoft-edge');
    }

    const seen = new Set();
    return candidates.filter((candidate) => {
        if (!candidate.path || seen.has(candidate.path)) return false;
        seen.add(candidate.path);
        return fs.existsSync(candidate.path);
    });
}

function parseArgs(argv) {
    const opts = {
        attemptGrant: false,
        browser: '',
        grantTimeoutMs: 5000,
        headed: false,
        keepStage: false,
        stageRoot: '',
        timeoutMs: 12000,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[i + 1];
            if (!value) throw new Error(`${arg} requires a value`);
            i += 1;
            return value;
        };

        if (arg === '--attempt-grant') opts.attemptGrant = true;
        else if (arg === '--browser') opts.browser = path.resolve(next());
        else if (arg === '--grant-timeout-ms') opts.grantTimeoutMs = Number(next()) || opts.grantTimeoutMs;
        else if (arg === '--headed') opts.headed = true;
        else if (arg === '--keep-stage') opts.keepStage = true;
        else if (arg === '--stage-root') opts.stageRoot = path.resolve(next());
        else if (arg === '--timeout-ms') opts.timeoutMs = Number(next()) || opts.timeoutMs;
        else throw new Error(`Unknown argument: ${arg}`);
    }

    return opts;
}

function chromiumArgs(browserProfile, stageDir, opts) {
    const args = [
        `--user-data-dir=${browserProfile}`,
        `--load-extension=${stageDir}`,
        '--remote-debugging-port=0',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--enable-logging=stderr',
        'about:blank',
    ];
    if (!opts.headed) {
        args.splice(args.length - 1, 0, '--headless=new', '--disable-gpu');
    }
    return args;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function readDevToolsPort(profileDir, timeoutMs) {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const poll = () => {
            if (fs.existsSync(portFile)) {
                const [port] = fs.readFileSync(portFile, 'utf8').split(/\r?\n/);
                resolve(port);
                return;
            }
            if (Date.now() >= deadline) {
                reject(new Error('Timed out waiting for Chromium DevToolsActivePort.'));
                return;
            }
            setTimeout(poll, 100);
        };
        poll();
    });
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.json();
}

async function waitForBackgroundTarget(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastTargets = [];
    while (Date.now() < deadline) {
        lastTargets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
        const target = lastTargets.find((entry) =>
            entry.type === 'service_worker'
            && /^chrome-extension:\/\//.test(entry.url)
            && /\/background\.js$/.test(entry.url));
        if (target) return target;
        await sleep(200);
    }
    const targetSummary = lastTargets.map((target) => `${target.type}:${target.url}`).join(', ');
    throw new Error(`Timed out waiting for staged extension background.js target. Saw: ${targetSummary}`);
}

function connectCdp(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let sequence = 0;
        const pending = new Map();
        const events = [];

        ws.on('open', () => {
            resolve({
                events,
                send(method, params = {}) {
                    const id = sequence += 1;
                    ws.send(JSON.stringify({ id, method, params }));
                    return new Promise((res, rej) => {
                        pending.set(id, { method, res, rej });
                    });
                },
                close() {
                    ws.close();
                },
            });
        });

        ws.on('message', (raw) => {
            const message = JSON.parse(raw.toString());
            if (message.id && pending.has(message.id)) {
                const entry = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) entry.rej(new Error(`${entry.method}: ${JSON.stringify(message.error)}`));
                else entry.res(message.result);
                return;
            }
            events.push(message);
        });

        ws.on('error', reject);
    });
}

async function evaluate(client, expression) {
    const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
}

function extensionIdFromTarget(target) {
    const match = String(target.url).match(/^chrome-extension:\/\/([^/]+)\//);
    if (!match) throw new Error(`Could not read extension id from target ${target.url}`);
    return match[1];
}

async function openPopupTarget(port, extensionId) {
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const target = await fetchJson(`http://127.0.0.1:${port}/json/new?${popupUrl}`, { method: 'PUT' });
    const client = await connectCdp(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    return { client, popupUrl };
}

async function seedPopupSettings(client) {
    const settingsJson = JSON.stringify({ [SETTINGS_STORAGE_KEY]: POPUP_BOOT_SETTINGS });
    return evaluate(client, `new Promise((resolve) => {
        chrome.storage.local.set(${settingsJson}, () => resolve({
            lastError: chrome.runtime.lastError?.message || '',
            hasPermissions: Boolean(chrome.permissions),
            hasStorage: Boolean(chrome.storage?.local),
            optional: chrome.runtime.getManifest().optional_host_permissions || []
        }));
    })`);
}

function popupStateExpression() {
    return `new Promise((resolve) => chrome.permissions.getAll((permissions) => resolve({
        href: location.href,
        hasPermissions: Boolean(chrome.permissions),
        hasStorage: Boolean(chrome.storage?.local),
        optional: chrome.runtime.getManifest().optional_host_permissions || [],
        required: chrome.runtime.getManifest().host_permissions || [],
        currentOrigins: permissions.origins || [],
        bannerHidden: document.getElementById('optional-host-banner')?.hidden,
        bannerText: document.getElementById('optional-host-banner-detail')?.textContent || '',
        buttonDisabled: document.getElementById('optional-host-grant-btn')?.disabled,
        buttonBusy: document.getElementById('optional-host-grant-btn')?.getAttribute('aria-busy') || '',
        missingBadges: document.querySelectorAll('.toggle-risk-permission,.so-key-permission-missing').length,
        status: document.getElementById('status')?.textContent || ''
    })))`;
}

async function readPopupState(client) {
    return evaluate(client, popupStateExpression());
}

async function waitForPromptReady(client, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let state = null;
    while (Date.now() < deadline) {
        state = await readPopupState(client);
        if (state.hasStorage && state.hasPermissions && state.bannerHidden === false) return state;
        await sleep(200);
    }
    return state || await readPopupState(client);
}

function sorted(values) {
    return values.slice().sort();
}

function missingValues(expected, actual) {
    const actualSet = new Set(actual);
    return expected.filter((value) => !actualSet.has(value));
}

function validatePromptReady(state, expectedOptionalOrigins, popupUrl) {
    if (!state.href.startsWith(popupUrl)) {
        throw new Error(`Popup did not load expected extension page. href=${state.href}`);
    }
    if (!state.hasStorage || !state.hasPermissions) {
        throw new Error('Popup extension APIs are unavailable.');
    }
    const missingDeclared = missingValues(expectedOptionalOrigins, state.optional || []);
    if (missingDeclared.length) {
        throw new Error(`Popup manifest is missing optional hosts: ${missingDeclared.join(', ')}`);
    }
    const alreadyGranted = expectedOptionalOrigins.filter((origin) =>
        (state.currentOrigins || []).includes(origin));
    if (alreadyGranted.length) {
        throw new Error(`Fresh profile already granted optional hosts: ${alreadyGranted.join(', ')}`);
    }
    if (state.bannerHidden !== false || state.buttonDisabled) {
        throw new Error('Optional-host Grant access banner is not ready for enabled missing hosts.');
    }
    const missingInBanner = expectedOptionalOrigins.filter((origin) => !state.bannerText.includes(origin));
    if (missingInBanner.length) {
        throw new Error(`Optional-host banner does not list: ${missingInBanner.join(', ')}`);
    }
    if (!state.missingBadges) {
        throw new Error('Popup did not render any permission-needed badge for missing optional hosts.');
    }
}

async function clickGrantButton(client) {
    const rect = await evaluate(client, `(() => {
        const button = document.getElementById('optional-host-grant-btn');
        const rect = button?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`);
    if (!rect) throw new Error('Grant access button not found.');
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await client.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: rect.x,
        y: rect.y,
        button: 'left',
        clickCount: 1,
    });
    await client.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: rect.x,
        y: rect.y,
        button: 'left',
        clickCount: 1,
    });
}

async function waitForGrantCompletion(client, expectedOptionalOrigins, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let state = null;
    while (Date.now() < deadline) {
        state = await readPopupState(client);
        if (missingValues(expectedOptionalOrigins, state.currentOrigins || []).length === 0) return state;
        await sleep(250);
    }
    return state || await readPopupState(client);
}

function hasLoadExtensionPolicyBlock(stderr) {
    return /--load-extension is not allowed in Google Chrome, ignoring/i.test(stderr || '');
}

function isGoogleChromeCandidate(candidate) {
    return /google chrome|google-chrome|chrome\.exe$/i.test(`${candidate.label} ${candidate.path}`);
}

function killProcessTree(proc) {
    if (!proc || proc.exitCode !== null) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        proc.kill('SIGTERM');
    }
}

async function removeDirWithRetries(dir) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
            return true;
        } catch (error) {
            if (attempt === 5) {
                console.warn(`[smoke-chromium-optional-hosts] cleanup warning: ${error.message}`);
                return false;
            }
            await sleep(250);
        }
    }
    return false;
}

async function runWithBrowser(candidate, manifest, stageDir, opts) {
    const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-chromium-profile-'));
    const args = chromiumArgs(browserProfile, stageDir, opts);
    const proc = spawn(candidate.path, args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
    });

    let client = null;
    try {
        const port = await readDevToolsPort(browserProfile, opts.timeoutMs);
        const backgroundTarget = await waitForBackgroundTarget(port, opts.timeoutMs);
        const extensionId = extensionIdFromTarget(backgroundTarget);
        const popup = await openPopupTarget(port, extensionId);
        client = popup.client;
        await sleep(1000);

        const seedResult = await seedPopupSettings(client);
        if (seedResult.lastError) throw new Error(seedResult.lastError);
        await evaluate(client, 'location.reload(); true');
        await sleep(500);
        const promptState = await waitForPromptReady(client, opts.timeoutMs);
        const expectedOptionalOrigins = sorted(manifest.optional_host_permissions || []);
        validatePromptReady(promptState, expectedOptionalOrigins, popup.popupUrl);

        let grantState = null;
        if (opts.attemptGrant) {
            await clickGrantButton(client);
            grantState = await waitForGrantCompletion(client, expectedOptionalOrigins, opts.grantTimeoutMs);
            const stillMissing = missingValues(expectedOptionalOrigins, grantState.currentOrigins || []);
            if (stillMissing.length) {
                throw new Error(
                    'Optional-host grant prompt did not complete. '
                    + 'Run with --headed --attempt-grant and accept the browser prompt. '
                    + `Still missing: ${stillMissing.join(', ')}`
                );
            }
        }

        return {
            browser: candidate.label,
            browserPath: candidate.path,
            extensionId,
            expectedOptionalOrigins,
            grantState,
            promptState,
            stageDir,
            stderr,
        };
    } catch (error) {
        if (
            hasLoadExtensionPolicyBlock(stderr)
            || (isGoogleChromeCandidate(candidate)
                && /Timed out waiting for staged extension background\.js target/i.test(error.message || ''))
        ) {
            error.code = 'LOAD_EXTENSION_BLOCKED';
        }
        error.stderr = stderr;
        throw error;
    } finally {
        if (client) client.close();
        killProcessTree(proc);
        await removeDirWithRetries(browserProfile);
    }
}

async function runChromiumOptionalHostSmoke(opts) {
    const candidates = browserCandidates(opts.browser);
    if (!candidates.length) {
        throw new Error('No Chromium-family browser found. Pass --browser <chrome-or-edge-path>.');
    }

    const stageRoot = opts.stageRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'astra-chromium-optional-hosts-'));
    fs.mkdirSync(stageRoot, { recursive: true });
    const { manifest, stageDir } = createChromiumStage(stageRoot);

    const blocked = [];
    try {
        let lastError = null;
        for (const candidate of candidates) {
            try {
                const result = await runWithBrowser(candidate, manifest, stageDir, opts);
                result.blockedBrowsers = blocked;
                return result;
            } catch (error) {
                lastError = error;
                if (error.code === 'LOAD_EXTENSION_BLOCKED') {
                    blocked.push(candidate);
                    continue;
                }
                throw error;
            }
        }
        const blockedLabels = blocked.map((candidate) => candidate.label).join(', ');
        throw lastError || new Error(`All browser candidates rejected --load-extension: ${blockedLabels}`);
    } finally {
        if (!opts.keepStage && fs.existsSync(stageRoot)) {
            await removeDirWithRetries(stageRoot);
        }
    }
}

async function main(argv = process.argv.slice(2)) {
    const opts = parseArgs(argv);
    const result = await runChromiumOptionalHostSmoke(opts);
    for (const blocked of result.blockedBrowsers || []) {
        console.log(`[smoke-chromium-optional-hosts] ${blocked.label}: --load-extension blocked by local Chrome policy; tried next browser`);
    }
    console.log(`[smoke-chromium-optional-hosts] ${result.browser}: loaded store-safe MV3 ${result.extensionId}`);
    console.log(`[smoke-chromium-optional-hosts] optional hosts before grant: ${result.expectedOptionalOrigins.length} missing`);
    console.log(`[smoke-chromium-optional-hosts] banner: ${result.promptState.bannerText}`);
    if (opts.attemptGrant) {
        console.log('[smoke-chromium-optional-hosts] optional host grant completed');
    } else {
        console.log('[smoke-chromium-optional-hosts] grant not attempted; use --headed --attempt-grant for manual prompt acceptance');
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[smoke-chromium-optional-hosts]', err.message || err);
        process.exit(1);
    });
}

module.exports = {
    POPUP_BOOT_SETTINGS,
    browserCandidates,
    chromiumArgs,
    createChromiumStage,
    hasLoadExtensionPolicyBlock,
    missingValues,
    parseArgs,
    shouldStageEntry,
    validatePromptReady,
};
