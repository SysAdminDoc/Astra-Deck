#!/usr/bin/env node
'use strict';

// Capture a YouTube watch page as MHTML through Chrome stable.
//
// Full watch pages can keep media/ad/chat requests open long enough for
// Page.captureSnapshot to hang. This helper waits for the rendered player,
// pauses/stops page loading, then captures the MHTML fixture used by
// scripts/build-selector-fixtures.js.

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const DEFAULT_OUT = path.join(REPO_ROOT, 'mhtml', 'WatchPage.mhtml');

function parseArgs(argv) {
    const opts = {
        url: DEFAULT_URL,
        out: DEFAULT_OUT,
        chrome: process.env.CHROME_PATH || '',
        timeoutMs: 70000,
        requireDelhi: true,
        domFallback: true,
        keepProfile: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[i + 1];
            if (!value) throw new Error(`${arg} requires a value`);
            i += 1;
            return value;
        };
        if (arg === '--url') opts.url = next();
        else if (arg === '--out') opts.out = path.resolve(next());
        else if (arg === '--chrome') opts.chrome = next();
        else if (arg === '--timeout-ms') opts.timeoutMs = Number(next()) || opts.timeoutMs;
        else if (arg === '--no-require-delhi') opts.requireDelhi = false;
        else if (arg === '--no-dom-fallback') opts.domFallback = false;
        else if (arg === '--keep-profile') opts.keepProfile = true;
        else if (arg === '-h' || arg === '--help') {
            console.log([
                'Usage: npm run capture:watch -- [options]',
                '',
                'Options:',
                '  --url <url>          YouTube watch URL to capture',
                '  --out <path>         Output MHTML path (default: mhtml/WatchPage.mhtml)',
                '  --chrome <path>      Chrome/Edge executable path',
                '  --timeout-ms <n>     Page.captureSnapshot timeout',
                '  --no-require-delhi   Do not require .ytp-delhi-modern in the rendered page',
                '  --no-dom-fallback    Fail instead of writing rendered-DOM MHTML on snapshot timeout',
                '  --keep-profile       Keep the temporary Chrome profile for debugging',
            ].join('\n'));
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!/^https:\/\/(www\.)?youtube\.com\/watch\?/.test(opts.url)) {
        throw new Error('--url must be a youtube.com/watch URL');
    }
    return opts;
}

function chromeCandidates() {
    const candidates = [];
    if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
    if (process.platform === 'win32') {
        const pf = process.env.ProgramFiles || 'C:\\Program Files';
        const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const local = process.env.LOCALAPPDATA || '';
        candidates.push(
            path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        );
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    } else {
        candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium');
    }
    return candidates;
}

function resolveChrome(cliPath) {
    const candidates = cliPath ? [cliPath, ...chromeCandidates()] : chromeCandidates();
    const resolved = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (!resolved) {
        throw new Error('Chrome executable not found. Set CHROME_PATH or pass --chrome <path>.');
    }
    return resolved;
}

function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopChrome(proc) {
    if (!proc || proc.exitCode !== null || proc.signalCode) return;
    proc.kill();
    await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        proc.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
    });
}

async function removeProfileDir(profileDir) {
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            fs.rmSync(profileDir, { recursive: true, force: true });
            return;
        } catch (err) {
            lastError = err;
            await sleep(250 * (attempt + 1));
        }
    }
    console.warn(`Warning: could not remove temporary Chrome profile ${profileDir}: ${lastError.message}`);
}

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.json();
}

async function waitForEndpoint(port) {
    for (let i = 0; i < 80; i += 1) {
        try {
            await fetchJson(`http://127.0.0.1:${port}/json/version`);
            return;
        } catch {
            await sleep(250);
        }
    }
    throw new Error(`Chrome CDP endpoint did not open on ${port}`);
}

function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const pending = new Map();
        let seq = 0;

        ws.addEventListener('open', () => {
            resolve({
                send(method, params = {}, timeoutMs = 30000) {
                    const id = ++seq;
                    ws.send(JSON.stringify({ id, method, params }));
                    return new Promise((res, rej) => {
                        const timer = setTimeout(() => {
                            pending.delete(id);
                            rej(new Error(`${method} timed out after ${timeoutMs}ms`));
                        }, timeoutMs);
                        pending.set(id, { res, rej, timer, method });
                    });
                },
                close() {
                    ws.close();
                },
            });
        });

        ws.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            if (!msg.id || !pending.has(msg.id)) return;
            const item = pending.get(msg.id);
            pending.delete(msg.id);
            clearTimeout(item.timer);
            if (msg.error) item.rej(new Error(`${item.method}: ${msg.error.message}`));
            else item.res(msg.result || {});
        });

        ws.addEventListener('error', reject);
    });
}

async function waitForWatchPage(cdp, requireDelhi) {
    let latest = {};
    for (let i = 0; i < 40; i += 1) {
        await sleep(500);
        const probe = await cdp.send('Runtime.evaluate', {
            expression: `(() => ({
                href: location.href,
                title: document.title,
                ytdApp: !!document.querySelector('ytd-app'),
                watchFlexy: !!document.querySelector('ytd-watch-flexy'),
                movie: !!document.querySelector('#movie_player'),
                delhi: !!document.querySelector('.ytp-delhi-modern'),
                overflow: !!document.querySelector('.ytp-overflow-panel'),
                timeWrapperDelhi: !!document.querySelector('.ytp-time-wrapper-delhi')
            }))()`,
            returnByValue: true,
        }, 5000);
        latest = probe.result?.value || {};
        if (latest.ytdApp && latest.watchFlexy && latest.movie && (!requireDelhi || latest.delhi)) {
            return latest;
        }
    }
    throw new Error(`Watch page did not settle with required selectors: ${JSON.stringify(latest)}`);
}

function escapeMhtmlHeaderValue(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function buildSinglePartMhtml(url, html) {
    const boundary = '----astra-deck-watch-dom-' + Date.now().toString(36);
    return [
        'From: <Saved by Astra Deck>',
        'Snapshot-Content-Location: ' + escapeMhtmlHeaderValue(url),
        'Subject: YouTube watch DOM fixture',
        'MIME-Version: 1.0',
        `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: 8bit',
        'Content-Location: ' + escapeMhtmlHeaderValue(url),
        '',
        html,
        '',
        `--${boundary}--`,
        '',
    ].join('\r\n');
}

async function capture(opts) {
    const chrome = resolveChrome(opts.chrome);
    const port = await findFreePort();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-deck-cdp-'));
    const chromeArgs = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--disable-extensions',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1280,900',
        '--new-window',
        'about:blank',
    ];
    const proc = spawn(chrome, chromeArgs, {
        stdio: 'ignore',
        windowsHide: true,
    });
    let cdp = null;

    try {
        await waitForEndpoint(port);
        await fetchJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
            .catch(() => null);
        const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
        const page = pages.find((candidate) =>
            candidate.type === 'page' && candidate.webSocketDebuggerUrl
        );
        if (!page) throw new Error('No debuggable page target');

        cdp = await connect(page.webSocketDebuggerUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Network.enable');
        await cdp.send('Network.setBlockedURLs', {
            urls: [
                '*.googlevideo.com/*',
                '*.doubleclick.net/*',
                '*.googlesyndication.com/*',
                '*googleads*',
                '*stats/watchtime*',
            ],
        });
        await cdp.send('Page.navigate', { url: opts.url });
        const probe = await waitForWatchPage(cdp, opts.requireDelhi);

        await cdp.send('Runtime.evaluate', {
            expression: `(() => {
                try { document.querySelector('video')?.pause(); } catch {}
                try { window.stop(); } catch {}
                return true;
            })()`,
            returnByValue: true,
        }, 5000).catch(() => null);
        await cdp.send('Page.stopLoading', {}, 5000).catch(() => null);
        await sleep(1000);
        const renderedDom = await cdp.send('Runtime.evaluate', {
            expression: 'document.documentElement.outerHTML',
            returnByValue: true,
        }, 10000);
        const renderedHtml = renderedDom.result?.value || '';

        let captureMode = 'cdp-mhtml';
        let data = '';
        try {
            const snap = await cdp.send('Page.captureSnapshot', { format: 'mhtml' }, opts.timeoutMs);
            data = snap.data || '';
        } catch (err) {
            if (!opts.domFallback || !String(err.message || '').includes('Page.captureSnapshot timed out')) {
                throw err;
            }
            captureMode = 'dom-mhtml-fallback';
            data = buildSinglePartMhtml(opts.url, renderedHtml);
        }
        if (!data.includes('ytd-watch-flexy') || !data.includes('movie_player')) {
            throw new Error('Captured MHTML does not contain watch-page player markers');
        }
        if (opts.requireDelhi && !data.includes('ytp-delhi-modern')) {
            throw new Error('Captured MHTML does not contain ytp-delhi-modern');
        }

        fs.mkdirSync(path.dirname(opts.out), { recursive: true });
        fs.writeFileSync(opts.out, data, 'utf8');
        return {
            out: opts.out,
            bytes: Buffer.byteLength(data),
            captureMode,
            probe,
            hasDelhi: data.includes('ytp-delhi-modern'),
            hasOverflow: data.includes('ytp-overflow-panel'),
            hasTimeWrapperDelhi: data.includes('ytp-time-wrapper-delhi'),
        };
    } finally {
        if (cdp) cdp.close();
        await stopChrome(proc);
        if (!opts.keepProfile) await removeProfileDir(userDataDir);
    }
}

capture(parseArgs(process.argv.slice(2)))
    .then((result) => {
        console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
