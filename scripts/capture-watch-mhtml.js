#!/usr/bin/env node
'use strict';

// Capture YouTube surfaces as MHTML through Chrome stable.
//
// Full watch pages can keep media/ad/chat requests open long enough for
// Page.captureSnapshot to hang. This helper waits for surface-specific
// selectors, pauses/stops page loading, then captures the MHTML fixture used
// by scripts/build-selector-fixtures.js.

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = fs.realpathSync.native(path.join(__dirname, '..'));
const DEFAULT_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const DEFAULT_OUT = path.join(REPO_ROOT, 'mhtml', 'WatchPage.mhtml');
const SURFACE_PROFILES = Object.freeze({
    watch: Object.freeze({
        url: DEFAULT_URL,
        out: DEFAULT_OUT,
        waitSelectors: Object.freeze(['ytd-app', 'ytd-watch-flexy', '#movie_player']),
        requiredTokens: Object.freeze(['ytd-watch-flexy', 'movie_player']),
        requireDelhi: true,
        subject: 'YouTube watch DOM fixture',
    }),
    search: Object.freeze({
        url: 'https://www.youtube.com/results?search_query=Astra%20Deck',
        out: path.join(REPO_ROOT, 'mhtml', 'SearchResults.mhtml'),
        waitSelectors: Object.freeze(['ytd-app', 'ytd-search', 'ytd-video-renderer, yt-lockup-view-model']),
        requiredTokens: Object.freeze(['ytd-search']),
        requireDelhi: false,
        subject: 'YouTube search results DOM fixture',
    }),
    shorts: Object.freeze({
        url: 'https://www.youtube.com/shorts',
        out: path.join(REPO_ROOT, 'mhtml', 'Shorts.mhtml'),
        waitSelectors: Object.freeze(['ytd-app', 'ytd-reel-video-renderer']),
        requiredTokens: Object.freeze(['ytd-reel-video-renderer']),
        requireDelhi: false,
        subject: 'YouTube Shorts DOM fixture',
    }),
    channel: Object.freeze({
        url: 'https://www.youtube.com/@YouTube',
        out: path.join(REPO_ROOT, 'mhtml', 'Channel.mhtml'),
        waitSelectors: Object.freeze(['ytd-app', 'ytd-browse', 'ytd-page-header-renderer, ytd-c4-tabbed-header-renderer, page-header-view-model, yt-page-header-renderer']),
        requiredTokens: Object.freeze(['ytd-browse']),
        requireDelhi: false,
        subject: 'YouTube channel DOM fixture',
    }),
    embed: Object.freeze({
        url: 'https://www.youtube.com/embed/jNQXAC9IVRw',
        out: path.join(REPO_ROOT, 'mhtml', 'EmbedPlayer.mhtml'),
        waitSelectors: Object.freeze(['#movie_player', '.html5-video-player']),
        requiredTokens: Object.freeze(['movie_player']),
        requireDelhi: false,
        subject: 'YouTube embed player DOM fixture',
    }),
    history: Object.freeze({
        url: 'https://www.youtube.com/feed/history',
        out: path.join(REPO_ROOT, 'mhtml', 'History.mhtml'),
        waitSelectors: Object.freeze([
            'ytd-app',
            'ytd-browse',
            'ytd-rich-grid-renderer, ytd-video-renderer, yt-lockup-view-model, ytd-item-section-renderer',
        ]),
        requiredTokens: Object.freeze(['ytd-browse']),
        requireDelhi: false,
        authRequired: true,
        contentCheck: 'history',
        subject: 'YouTube History DOM fixture',
    }),
    'watch-later': Object.freeze({
        url: 'https://www.youtube.com/playlist?list=WL',
        out: path.join(REPO_ROOT, 'mhtml', 'WatchLater.mhtml'),
        waitSelectors: Object.freeze([
            'ytd-app',
            'ytd-browse, ytd-playlist-video-list-renderer',
            'ytd-playlist-video-renderer, ytd-video-renderer, yt-lockup-view-model',
        ]),
        requiredTokens: Object.freeze(['ytd-browse']),
        requireDelhi: false,
        authRequired: true,
        contentCheck: 'watch-later',
        subject: 'YouTube Watch Later DOM fixture',
    }),
    notifications: Object.freeze({
        url: 'https://www.youtube.com/',
        out: path.join(REPO_ROOT, 'mhtml', 'NotificationsMenu.mhtml'),
        waitSelectors: Object.freeze(['ytd-app', 'ytd-notification-topbar-button-renderer']),
        requiredTokens: Object.freeze([
            'ytd-notification-topbar-button-renderer',
            'ytd-multi-page-menu-renderer',
            'ytd-notification-renderer',
        ]),
        requireDelhi: false,
        authRequired: true,
        contentCheck: 'notifications-menu',
        preCaptureAction: 'open-notifications-menu',
        subject: 'YouTube notifications menu DOM fixture',
    }),
});

function parseArgs(argv) {
    const raw = {
        surface: 'watch',
        url: null,
        out: null,
        chrome: process.env.CHROME_PATH || '',
        timeoutMs: 70000,
        requireDelhi: null,
        domFallback: true,
        keepProfile: false,
        userDataDir: process.env.ASTRA_CAPTURE_PROFILE_DIR || '',
        waitSelectors: [],
        requiredTokens: [],
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[i + 1];
            if (!value) throw new Error(`${arg} requires a value`);
            i += 1;
            return value;
        };
        if (arg === '--surface') raw.surface = next();
        else if (arg === '--url') raw.url = next();
        else if (arg === '--out') raw.out = path.resolve(next());
        else if (arg === '--chrome') raw.chrome = next();
        else if (arg === '--user-data-dir') raw.userDataDir = next();
        else if (arg === '--timeout-ms') raw.timeoutMs = Number(next()) || raw.timeoutMs;
        else if (arg === '--wait-selector') raw.waitSelectors.push(next());
        else if (arg === '--require-token') raw.requiredTokens.push(next());
        else if (arg === '--no-require-delhi') raw.requireDelhi = false;
        else if (arg === '--require-delhi') raw.requireDelhi = true;
        else if (arg === '--no-dom-fallback') raw.domFallback = false;
        else if (arg === '--keep-profile') raw.keepProfile = true;
        else if (arg === '-h' || arg === '--help') {
            console.log([
                'Usage: npm run capture:watch -- [options]',
                '       npm run capture:surface -- --surface <name> [options]',
                '',
                'Options:',
                `  --surface <name>       Capture profile: ${Object.keys(SURFACE_PROFILES).join(', ')}`,
                '  --url <url>            YouTube URL to capture',
                '  --out <path>           Output MHTML path',
                '  --chrome <path>        Chrome/Edge executable path',
                '  --user-data-dir <path> External Chrome profile path for authenticated captures',
                '  --timeout-ms <n>       Page.captureSnapshot timeout',
                '  --wait-selector <css>  Required selector before capture; repeatable',
                '  --require-token <text> Required text in captured MHTML; repeatable',
                '  --require-delhi        Require .ytp-delhi-modern in the rendered page',
                '  --no-require-delhi     Do not require .ytp-delhi-modern in the rendered page',
                '  --no-dom-fallback      Fail instead of writing rendered-DOM MHTML on snapshot timeout',
                '  --keep-profile         Keep the temporary Chrome profile for debugging',
            ].join('\n'));
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    const profile = SURFACE_PROFILES[raw.surface];
    if (!profile) {
        throw new Error(`Unknown --surface "${raw.surface}". Expected one of: ${Object.keys(SURFACE_PROFILES).join(', ')}`);
    }
    const userDataDir = resolveUserDataDir(raw.userDataDir, raw.surface);
    if (profile.authRequired && !userDataDir) {
        throw new Error(`--surface ${raw.surface} requires --user-data-dir <absolute external profile path> or ASTRA_CAPTURE_PROFILE_DIR`);
    }
    if (userDataDir && raw.keepProfile) {
        throw new Error('--keep-profile is only valid with temporary profiles; external --user-data-dir profiles are never deleted by this helper');
    }

    const opts = {
        surface: raw.surface,
        url: raw.url || profile.url,
        out: raw.out || profile.out,
        chrome: raw.chrome,
        timeoutMs: raw.timeoutMs,
        requireDelhi: raw.requireDelhi ?? profile.requireDelhi,
        domFallback: raw.domFallback,
        keepProfile: raw.keepProfile,
        userDataDir,
        authRequired: Boolean(profile.authRequired),
        contentCheck: profile.contentCheck || null,
        preCaptureAction: profile.preCaptureAction || null,
        waitSelectors: raw.waitSelectors.length ? raw.waitSelectors : [...profile.waitSelectors],
        requiredTokens: raw.requiredTokens.length ? raw.requiredTokens : [...profile.requiredTokens],
        subject: profile.subject,
    };

    const parsed = new URL(opts.url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'youtu.be' && host !== 'youtube.com' && !host.endsWith('.youtube.com'))) {
        throw new Error('--url must be an https YouTube URL');
    }
    return opts;
}

function normalizeForCompare(value) {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathWithin(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveUserDataDir(rawValue, surface) {
    if (!rawValue) return null;
    if (!path.isAbsolute(rawValue)) {
        throw new Error(`--user-data-dir for ${surface} must be an absolute external path outside the repository`);
    }

    const resolved = path.resolve(rawValue);
    const comparableRepo = normalizeForCompare(REPO_ROOT);
    const comparableResolved = normalizeForCompare(resolved);
    if (isPathWithin(comparableRepo, comparableResolved)) {
        throw new Error(`--user-data-dir for ${surface} must be outside the repository worktree; do not use .git, mhtml, tests/fixtures, playwright/.auth, or .auth`);
    }
    return resolved;
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

async function waitForSurface(cdp, opts) {
    let latest = {};
    for (let i = 0; i < 40; i += 1) {
        await sleep(500);
        const probe = await cdp.send('Runtime.evaluate', {
            expression: `(() => ({
                href: location.href,
                host: location.hostname,
                title: document.title,
                surface: ${JSON.stringify(opts.surface)},
                selectors: ${JSON.stringify(opts.waitSelectors)}.map((selector) => ({
                    selector,
                    matched: !!document.querySelector(selector)
                })),
                signInLink: !!document.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]'),
                signInPrompt: /\\bsign in\\b/i.test((document.body && document.body.innerText || '').slice(0, 20000)),
                historyContent: !!document.querySelector('ytd-rich-grid-renderer, ytd-video-renderer, yt-lockup-view-model'),
                watchLaterContent: !!document.querySelector('ytd-playlist-video-list-renderer ytd-playlist-video-renderer, ytd-playlist-video-renderer, ytd-video-renderer, yt-lockup-view-model'),
                notificationTopbar: !!document.querySelector('ytd-notification-topbar-button-renderer'),
                notificationMenu: !!document.querySelector('ytd-multi-page-menu-renderer'),
                notificationRows: !!document.querySelector('ytd-notification-renderer'),
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
        const missing = (latest.selectors || []).filter((row) => !row.matched);
        if (missing.length === 0 && (!opts.requireDelhi || latest.delhi)) {
            if (!opts.preCaptureAction) assertSurfaceContent(latest, opts);
            return latest;
        }
    }
    assertSurfaceContent(latest, opts);
    throw new Error(`${opts.surface} page did not settle with required selectors: ${JSON.stringify(latest)}`);
}

function isAccountRedirect(probe) {
    const host = String(probe?.host || '').toLowerCase();
    if (host === 'accounts.google.com' || host.endsWith('.accounts.google.com')) return true;
    try {
        const parsed = new URL(probe?.href || '');
        const parsedHost = parsed.hostname.toLowerCase();
        return parsedHost === 'accounts.google.com' || parsedHost.endsWith('.accounts.google.com');
    } catch {
        return false;
    }
}

function assertSignedIn(probe, opts) {
    if (!opts.authRequired) return;
    if (isAccountRedirect(probe) || probe?.signInLink || probe?.signInPrompt) {
        throw new Error(`auth required for ${opts.surface} capture`);
    }
}

function assertSurfaceContent(probe, opts) {
    assertSignedIn(probe, opts);
    if (opts.contentCheck === 'history' && !probe?.historyContent) {
        throw new Error('auth required for history capture: no feed or video-card selectors found');
    }
    if (opts.contentCheck === 'watch-later' && !probe?.watchLaterContent) {
        throw new Error('watch-later capture requires a populated list');
    }
    if (opts.contentCheck === 'notifications-menu') {
        if (!probe?.notificationMenu) {
            throw new Error('notifications capture requires the notifications menu to open');
        }
        if (!probe?.notificationRows) {
            throw new Error('notifications capture requires at least one notification row');
        }
    }
}

async function openNotificationsMenu(cdp, opts) {
    if (opts.preCaptureAction !== 'open-notifications-menu') return null;

    const clickResult = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
            const button = document.querySelector(
                'ytd-notification-topbar-button-renderer button, ' +
                'ytd-notification-topbar-button-renderer [role="button"], ' +
                'button[aria-label*="Notifications" i], ' +
                'ytd-notification-topbar-button-renderer'
            );
            if (!button) {
                return {
                    clicked: false,
                    reason: 'notification topbar button not found',
                    signInLink: !!document.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]'),
                    signInPrompt: /\\bsign in\\b/i.test((document.body && document.body.innerText || '').slice(0, 20000)),
                    host: location.hostname,
                    href: location.href
                };
            }
            button.click();
            return { clicked: true, host: location.hostname, href: location.href };
        })()`,
        returnByValue: true,
    }, 5000);
    const clicked = clickResult.result?.value || {};
    assertSignedIn(clicked, opts);
    if (!clicked.clicked) {
        throw new Error(`notifications capture requires the notifications menu to open: ${clicked.reason || 'button not found'}`);
    }

    let latest = {};
    for (let i = 0; i < 30; i += 1) {
        await sleep(400);
        const probe = await cdp.send('Runtime.evaluate', {
            expression: `(() => ({
                href: location.href,
                host: location.hostname,
                signInLink: !!document.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]'),
                signInPrompt: /\\bsign in\\b/i.test((document.body && document.body.innerText || '').slice(0, 20000)),
                notificationTopbar: !!document.querySelector('ytd-notification-topbar-button-renderer'),
                notificationMenu: !!document.querySelector('ytd-multi-page-menu-renderer'),
                notificationRows: !!document.querySelector('ytd-notification-renderer')
            }))()`,
            returnByValue: true,
        }, 5000);
        latest = probe.result?.value || {};
        if (latest.notificationMenu && latest.notificationRows) {
            assertSurfaceContent(latest, opts);
            return latest;
        }
    }
    assertSurfaceContent(latest, opts);
    return latest;
}

function escapeMhtmlHeaderValue(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function buildSinglePartMhtml(url, html, subject) {
    const boundary = '----astra-deck-dom-' + Date.now().toString(36);
    return [
        'From: <Saved by Astra Deck>',
        'Snapshot-Content-Location: ' + escapeMhtmlHeaderValue(url),
        'Subject: ' + escapeMhtmlHeaderValue(subject || 'YouTube DOM fixture'),
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
    const tempProfileDir = opts.userDataDir ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'astra-deck-cdp-'));
    const userDataDir = opts.userDataDir || tempProfileDir;
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
        const initialProbe = await waitForSurface(cdp, opts);
        const actionProbe = await openNotificationsMenu(cdp, opts);
        const probe = actionProbe || initialProbe;
        assertSurfaceContent(probe, opts);

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
            data = buildSinglePartMhtml(opts.url, renderedHtml, opts.subject);
        }
        for (const token of opts.requiredTokens) {
            if (!data.includes(token)) {
                throw new Error(`Captured MHTML does not contain required token: ${token}`);
            }
        }
        if (opts.requireDelhi && !data.includes('ytp-delhi-modern')) {
            throw new Error('Captured MHTML does not contain ytp-delhi-modern');
        }

        fs.mkdirSync(path.dirname(opts.out), { recursive: true });
        fs.writeFileSync(opts.out, data, 'utf8');
        return {
            surface: opts.surface,
            out: opts.out,
            bytes: Buffer.byteLength(data),
            captureMode,
            probe,
            waitSelectors: opts.waitSelectors,
            requiredTokens: opts.requiredTokens,
            hasDelhi: data.includes('ytp-delhi-modern'),
            hasOverflow: data.includes('ytp-overflow-panel'),
            hasTimeWrapperDelhi: data.includes('ytp-time-wrapper-delhi'),
        };
    } finally {
        if (cdp) cdp.close();
        await stopChrome(proc);
        if (tempProfileDir && !opts.keepProfile) await removeProfileDir(tempProfileDir);
    }
}

Promise.resolve()
    .then(() => capture(parseArgs(process.argv.slice(2))))
    .then((result) => {
        console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
