#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const WebSocket = require('ws');

const DEFAULT_COMMAND_TIMEOUT_MS = 30000;
const DEFAULT_STARTUP_TIMEOUT_MS = 20000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempTree(target, label = 'temporary tree', options = {}) {
    const attempts = Math.max(1, Number(options.attempts) || 12);
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 250);
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (!fs.existsSync(target)) return;
        try {
            fs.rmSync(target, {
                recursive: true,
                force: true,
                maxRetries: 2,
                retryDelay: retryDelayMs
            });
            if (!fs.existsSync(target)) return;
        } catch (error) {
            lastError = error;
        }
        if (attempt + 1 < attempts) await sleep(retryDelayMs);
    }
    throw new Error(
        `${label} cleanup failed: ${lastError?.message || 'target still exists'} (${target})`
    );
}

function reserveLoopbackPort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close((error) => {
                if (error) reject(error);
                else if (!port) reject(new Error('Could not reserve a loopback port'));
                else resolve(port);
            });
        });
    });
}

function executableCandidates(cliPath, executableName, {
    env = process.env,
    platform = process.platform
} = {}) {
    const candidates = [];
    if (cliPath) candidates.push(cliPath);
    const envKey = executableName === 'geckodriver' ? 'GECKODRIVER_PATH' : 'FIREFOX_PATH';
    if (env[envKey]) candidates.push(env[envKey]);
    if (executableName === 'geckodriver') {
        if (platform === 'win32') {
            const localAppData = env.LOCALAPPDATA || '';
            if (localAppData) {
                candidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'geckodriver.exe'));
            }
        }
        candidates.push(platform === 'win32' ? 'geckodriver.exe' : 'geckodriver');
    }
    return candidates;
}

function commandPath(candidate) {
    if (!candidate) return '';
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    const probe = spawnSync(
        process.platform === 'win32' ? 'where.exe' : 'which',
        [candidate],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    );
    if (probe.status !== 0) return '';
    return String(probe.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

function resolveGeckodriverExecutable(cliPath = '') {
    for (const candidate of executableCandidates(cliPath, 'geckodriver')) {
        const resolved = commandPath(candidate);
        if (resolved) return resolved;
    }
    throw new Error(
        'geckodriver was not found. Install it from Mozilla, set GECKODRIVER_PATH, '
        + 'or pass --geckodriver <path>.'
    );
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

async function requestJson(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_COMMAND_TIMEOUT_MS;
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    let payload;
    try {
        payload = text ? JSON.parse(text) : {};
    } catch (_) {
        throw new Error(`WebDriver returned HTTP ${response.status} with non-JSON content: ${text.slice(0, 500)}`);
    }
    if (!response.ok || payload?.value?.error) {
        const value = payload?.value || payload;
        throw new Error(
            `WebDriver HTTP ${response.status}: ${value?.error || 'request failed'}: `
            + `${value?.message || JSON.stringify(value)}`
        );
    }
    return payload?.value;
}

class BidiClient {
    constructor(socket, commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
        this.socket = socket;
        this.commandTimeoutMs = commandTimeoutMs;
        this.events = [];
        this.pending = new Map();
        this.nextId = 0;
        socket.on('message', (raw) => this._onMessage(raw));
        socket.on('close', () => this._failPending(new Error('Firefox WebDriver BiDi connection closed')));
        socket.on('error', (error) => this._failPending(error));
    }

    static async connect(url, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
        const socket = new WebSocket(url);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.terminate();
                reject(new Error(`Timed out connecting to Firefox WebDriver BiDi at ${url}`));
            }, timeoutMs);
            socket.once('open', () => {
                clearTimeout(timer);
                resolve();
            });
            socket.once('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
        return new BidiClient(socket, timeoutMs);
    }

    _onMessage(raw) {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch (_) {
            return;
        }
        if (message.type === 'event') {
            this.events.push(message);
            return;
        }
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.type === 'error') {
            pending.reject(new Error(
                `${message.error || 'BiDi command failed'}: ${message.message || ''}`
            ));
            return;
        }
        pending.resolve(message.result);
    }

    _failPending(error) {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }

    command(method, params = {}, timeoutMs = this.commandTimeoutMs) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error(`Cannot send ${method}; Firefox WebDriver BiDi is not open`));
        }
        return new Promise((resolve, reject) => {
            const id = ++this.nextId;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Timed out waiting for Firefox BiDi command ${method}`));
            }, timeoutMs);
            this.pending.set(id, { reject, resolve, timer });
            this.socket.send(JSON.stringify({ id, method, params }), (error) => {
                if (!error) return;
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error);
            });
        });
    }

    close() {
        this._failPending(new Error('Firefox WebDriver BiDi client closed'));
        if (this.socket.readyState === WebSocket.OPEN
                || this.socket.readyState === WebSocket.CONNECTING) {
            this.socket.close();
        }
    }
}

async function waitForWebDriver(port, timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            const status = await requestJson(`http://127.0.0.1:${port}/status`, { timeoutMs: 1000 });
            if (status?.ready !== false) return status;
        } catch (error) {
            lastError = error;
        }
        await sleep(100);
    }
    throw new Error(`Timed out waiting for geckodriver${lastError ? `: ${lastError.message}` : ''}`);
}

async function startFirefoxSession(options) {
    const geckodriver = resolveGeckodriverExecutable(options.geckodriver || '');
    const port = await reserveLoopbackPort();
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-firefox-webdriver-'));
    const args = [
        '--host', '127.0.0.1',
        '--port', String(port),
        '--profile-root', profileRoot,
        '--log', options.driverLog || 'error'
    ];
    if (options.systemAccess) args.push('--allow-system-access');
    const proc = spawn(geckodriver, args, {
        cwd: options.cwd || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let logs = '';
    const appendLog = (chunk) => {
        logs = (logs + chunk.toString()).slice(-50000);
    };
    proc.stdout.on('data', appendLog);
    proc.stderr.on('data', appendLog);

    let sessionId = '';
    let client = null;
    try {
        await waitForWebDriver(port, options.startupTimeoutMs || DEFAULT_STARTUP_TIMEOUT_MS);
        const firefoxArgs = options.headed ? [] : ['-headless'];
        const value = await requestJson(`http://127.0.0.1:${port}/session`, {
            method: 'POST',
            timeoutMs: options.startupTimeoutMs || DEFAULT_STARTUP_TIMEOUT_MS,
            body: {
                capabilities: {
                    alwaysMatch: {
                        browserName: 'firefox',
                        webSocketUrl: true,
                        acceptInsecureCerts: false,
                        pageLoadStrategy: 'normal',
                        'moz:firefoxOptions': {
                            binary: options.firefox,
                            args: firefoxArgs,
                            prefs: {
                                'browser.shell.checkDefaultBrowser': false,
                                'browser.startup.homepage_override.mstone': 'ignore',
                                'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
                                ...options.prefs
                            }
                        }
                    }
                }
            }
        });
        sessionId = value?.sessionId || '';
        const capabilities = value?.capabilities || {};
        if (!sessionId || !capabilities.webSocketUrl) {
            throw new Error('geckodriver did not return a BiDi-enabled Firefox session');
        }
        client = await BidiClient.connect(
            capabilities.webSocketUrl,
            options.commandTimeoutMs || DEFAULT_COMMAND_TIMEOUT_MS
        );
        return {
            browserVersion: capabilities.browserVersion || '',
            client,
            geckodriver,
            logs: () => logs,
            profile: capabilities['moz:profile'] || '',
            sessionId,
            async close() {
                if (sessionId) {
                    await requestJson(`http://127.0.0.1:${port}/session/${sessionId}`, {
                        method: 'DELETE',
                        timeoutMs: 5000
                    }).catch(() => undefined);
                }
                client?.close();
                killProcessTree(proc);
                await sleep(300);
                await removeTempTree(profileRoot, 'Firefox WebDriver profile');
            }
        };
    } catch (error) {
        client?.close();
        if (sessionId) {
            await requestJson(`http://127.0.0.1:${port}/session/${sessionId}`, {
                method: 'DELETE',
                timeoutMs: 3000
            }).catch(() => undefined);
        }
        killProcessTree(proc);
        try {
            await removeTempTree(profileRoot, 'Firefox WebDriver profile');
        } catch (cleanupError) {
            error.message += `; ${cleanupError.message}`;
        }
        const suffix = logs.trim() ? `\n${logs.trim().slice(-4000)}` : '';
        throw new Error(`${error.message}${suffix}`);
    }
}

function remotePrimitive(evaluation) {
    const remote = evaluation?.result;
    if (!remote || remote.type === 'undefined' || remote.type === 'null') return null;
    if (Object.hasOwn(remote, 'value')) return remote.value;
    throw new Error(`Firefox returned a non-primitive script result: ${JSON.stringify(remote)}`);
}

async function evaluateJson(client, context, expression, options = {}) {
    const evaluation = await client.command('script.evaluate', {
        expression: `JSON.stringify(${expression})`,
        target: { context },
        awaitPromise: options.awaitPromise !== false,
        resultOwnership: 'none'
    }, options.timeoutMs);
    const value = remotePrimitive(evaluation);
    return value === null ? null : JSON.parse(value);
}

async function waitForJson(client, context, expression, predicate, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_COMMAND_TIMEOUT_MS;
    const intervalMs = Number(options.intervalMs) || 250;
    const deadline = Date.now() + timeoutMs;
    let lastValue = null;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            lastValue = await evaluateJson(client, context, expression, { timeoutMs: Math.min(timeoutMs, 5000) });
            if (predicate(lastValue)) return lastValue;
        } catch (error) {
            lastError = error;
        }
        await sleep(intervalMs);
    }
    throw new Error(
        `Timed out waiting for ${options.label || 'Firefox page state'}; last value: `
        + `${JSON.stringify(lastValue)}${lastError ? `; last error: ${lastError.message}` : ''}`
    );
}

async function clickElementExpression(client, context, elementExpression) {
    await client.command('browsingContext.activate', { context });
    const transientInputError = /(?:NS_ERROR_FAILURE|synthesizeMouseAtPoint|WeakMap key null)/i;
    let lastInputError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const point = await waitForJson(client, context, `(() => {
            const node = ${elementExpression};
            if (!node) return null;
            node.scrollIntoView({ block: 'center', inline: 'nearest' });
            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            const fractions = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]];
            for (const [fx, fy] of fractions) {
                const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width * fx));
                const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height * fy));
                const hit = document.elementFromPoint(x, y);
                if (hit === node || node.contains(hit)) return { x, y, owned: true };
            }
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, owned: false };
        })()`, (value) => value?.owned === true, {
            timeoutMs: 5000,
            label: 'an unobscured Firefox click target'
        });
        try {
            await client.command('input.performActions', {
                context,
                actions: [{
                    type: 'pointer',
                    id: 'astra-smoke-mouse',
                    parameters: { pointerType: 'mouse' },
                    actions: [
                        { type: 'pointerMove', x: Math.round(point.x), y: Math.round(point.y), duration: 100, origin: 'viewport' },
                        { type: 'pause', duration: 50 },
                        { type: 'pointerDown', button: 0 },
                        { type: 'pause', duration: 50 },
                        { type: 'pointerUp', button: 0 }
                    ]
                }]
            });
            await client.command('input.releaseActions', { context }).catch(() => undefined);
            return { attempts: attempt, method: 'pointer' };
        } catch (error) {
            if (!transientInputError.test(error.message)) throw error;
            lastInputError = error;
            await client.command('input.releaseActions', { context }).catch(() => undefined);
            await sleep(250);
        }
    }
    const clicked = await evaluateJson(client, context, `(() => {
        const node = ${elementExpression};
        if (!node) return false;
        node.click();
        return true;
    })()`);
    if (!clicked) throw lastInputError || new Error('Could not find a visible element to click');
    return { attempts: 3, method: 'dom-fallback' };
}

async function pressEnterElementExpression(client, context, elementExpression) {
    await client.command('browsingContext.activate', { context });
    await waitForJson(client, context, `(() => {
        const node = ${elementExpression};
        if (!node) return { focused: false };
        node.scrollIntoView({ block: 'center', inline: 'nearest' });
        node.focus({ preventScroll: true });
        return { focused: document.activeElement === node };
    })()`, (value) => value?.focused === true, {
        timeoutMs: 5000,
        label: 'a focusable Firefox activation target'
    });
    await client.command('input.performActions', {
        context,
        actions: [{
            type: 'key',
            id: 'astra-smoke-keyboard',
            actions: [
                { type: 'keyDown', value: '\uE007' },
                { type: 'pause', duration: 50 },
                { type: 'keyUp', value: '\uE007' }
            ]
        }]
    });
    await client.command('input.releaseActions', { context }).catch(() => undefined);
    return { method: 'keyboard' };
}

async function waitForContext(client, predicate, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_COMMAND_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    let contexts = [];
    while (Date.now() < deadline) {
        const tree = await client.command('browsingContext.getTree', {});
        contexts = tree?.contexts || [];
        const match = contexts.find(predicate);
        if (match) return match;
        await sleep(200);
    }
    throw new Error(
        `Timed out waiting for ${options.label || 'Firefox browsing context'}; saw `
        + contexts.map(({ url }) => url).join(', ')
    );
}

async function captureScreenshot(client, context, filePath) {
    const result = await client.command('browsingContext.captureScreenshot', {
        context,
        origin: 'viewport',
        format: { type: 'png' }
    });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
}

module.exports = {
    BidiClient,
    DEFAULT_COMMAND_TIMEOUT_MS,
    DEFAULT_STARTUP_TIMEOUT_MS,
    captureScreenshot,
    clickElementExpression,
    evaluateJson,
    executableCandidates,
    killProcessTree,
    pressEnterElementExpression,
    remotePrimitive,
    requestJson,
    reserveLoopbackPort,
    resolveGeckodriverExecutable,
    removeTempTree,
    sleep,
    startFirefoxSession,
    waitForContext,
    waitForJson,
    waitForWebDriver
};
