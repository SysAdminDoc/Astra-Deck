'use strict';

// The userscript's companion download path had drifted from the extension's in
// two ways that source pins alone could not have caught, because both are about
// what actually runs rather than what the file says:
//
//  1. `ytKitDownload` had no `_downloadInProgress` guard, so a double-click
//     queued two companion jobs for the same video.
//  2. `_mediaDLSendDownload` sent `{url, audioOnly}` only. The companion falls
//     back to its own defaults for anything the payload omits, so the
//     userscript's Download Quality setting reached the direct-stream fallback
//     and nothing else — and the video/audio container settings did not exist
//     in the userscript at all, despite being declared `vehicle: 'both'` in
//     extension/core/settings-schema.js.
//
// Both are exercised here by pulling the real function text out of the
// userscript with acorn (a brace matcher over-runs on regex literals) and
// running it in a vm against stubbed collaborators.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const acorn = require('acorn');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'extension/core/settings-schema.js'), 'utf8');

// One parse, shared by every test in the file.
const declarations = (() => {
    const found = new Map();
    const ast = acorn.parse(source, { ecmaVersion: 'latest', ranges: true });
    const walk = (node) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'FunctionDeclaration' && node.id) {
            found.set(node.id.name, source.slice(node.range[0], node.range[1]));
        }
        for (const key of Object.keys(node)) {
            const child = node[key];
            if (Array.isArray(child)) child.forEach(walk);
            else if (child && typeof child.type === 'string') walk(child);
        }
    };
    walk(ast);
    return found;
})();

function fnSource(name) {
    const text = declarations.get(name);
    assert.ok(text, `YTKit.user.js must declare function ${name}`);
    return text;
}

// ── 1. the in-progress guard ──────────────────────────────────────────────

// `ytKitDownload` is now a thin re-entrancy wrapper around the original body.
// Running it with a controllable inner is the only way to prove the flag is
// both set before the await and cleared on every exit path.
function loadGuard() {
    const toasts = [];
    const calls = [];
    let release = null;
    let fail = false;

    const sandbox = {
        showToast: (message, color, opts) => { toasts.push({ message, color, opts }); },
        _ytKitDownloadRun: (videoUrl, audioOnly) => {
            calls.push({ videoUrl, audioOnly });
            if (fail) return Promise.reject(new Error('boom'));
            return new Promise((resolve) => { release = resolve; });
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(`
        let _downloadInProgress = false;
        ${fnSource('ytKitDownload')}
        globalThis.__ytKitDownload = ytKitDownload;
        globalThis.__inFlight = () => _downloadInProgress;
    `, sandbox);

    return {
        toasts,
        calls,
        download: (...args) => sandbox.__ytKitDownload(...args),
        inFlight: () => sandbox.__inFlight(),
        finish: () => release(),
        failNext: () => { fail = true; }
    };
}

test('a second download while one is in flight is refused, not queued', async () => {
    const h = loadGuard();

    const first = h.download('https://youtu.be/abc', false);
    await Promise.resolve();
    assert.equal(h.calls.length, 1, 'the first click must start a download');
    assert.equal(h.inFlight(), true);

    await h.download('https://youtu.be/abc', false);
    assert.equal(h.calls.length, 1, 'the second click must NOT reach the download body');
    assert.equal(h.toasts.length, 1, 'the user must be told why nothing happened');
    assert.match(h.toasts[0].message, /already in progress/i);

    h.finish();
    await first;
});

test('the guard clears once the download settles, so the next click works', async () => {
    const h = loadGuard();

    const first = h.download('https://youtu.be/abc', false);
    await Promise.resolve();
    h.finish();
    await first;

    assert.equal(h.inFlight(), false, 'a settled download must not wedge the guard');
    const second = h.download('https://youtu.be/def', true);
    await Promise.resolve();
    assert.equal(h.calls.length, 2, 'a later click must be allowed through');
    h.finish();
    await second;
});

test('a download that throws still clears the guard', async () => {
    const h = loadGuard();
    h.failNext();

    await assert.rejects(h.download('https://youtu.be/abc', false), /boom/);
    assert.equal(h.inFlight(), false,
        'without a finally the first failure would block downloads for the page lifetime');
});

// ── 2. the companion payload ──────────────────────────────────────────────

function sendPayload(settings, audioOnly) {
    let sent = null;
    const sandbox = {
        appState: { settings },
        DebugManager: { log() {} },
        showToast() {},
        showDownloadProgress() {},
        showDownloaderFailure() {},
        _extractStreamingData: async () => null,
        MediaDLManager: {
            baseUrl: () => 'http://127.0.0.1:8765',
            _lastHealth: {},
            _SERVICE_ID: 'astra-downloader'
        },
        GM_xmlhttpRequest: (req) => { sent = JSON.parse(req.data); },
        globalThis: {}
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(`
        ${fnSource('_mediaDLSendDownload')}
        globalThis.__send = _mediaDLSendDownload;
    `, sandbox);

    return sandbox.__send('https://youtu.be/abc', audioOnly, 'tok')
        .then(() => sent);
}

test('the companion payload carries the chosen quality and video container', async () => {
    const payload = await sendPayload(
        { downloadQuality: '1080', downloadVideoFormat: 'mkv', downloadAudioFormat: 'flac' },
        false);

    assert.ok(payload, 'a download request must be sent');
    assert.equal(payload.quality, '1080');
    assert.equal(payload.format, 'mkv', 'a video download must use the video container setting');
});

test('an audio-only download uses the audio format, not the video container', async () => {
    const payload = await sendPayload(
        { downloadQuality: 'best', downloadVideoFormat: 'mkv', downloadAudioFormat: 'flac' },
        true);

    assert.equal(payload.audioOnly, true);
    assert.equal(payload.format, 'flac');
});

test('unset settings fall back to the extension\'s defaults rather than being omitted', async () => {
    const video = await sendPayload({}, false);
    assert.equal(video.quality, 'best');
    assert.equal(video.format, 'mp4');

    const audio = await sendPayload({}, true);
    assert.equal(audio.format, 'mp3');
});

// ── 3. the settings the payload reads must exist in the userscript ────────

test('the userscript declares the two container settings the schema says it ships', () => {
    // Both are `vehicle: 'both'` in the schema, but the userscript had neither a
    // default nor a settings row, so the payload would have read undefined
    // forever and the user had no way to change it.
    for (const key of ['downloadVideoFormat', 'downloadAudioFormat']) {
        assert.match(schemaSource, new RegExp(`key: "${key}"[^\\n]*vehicle: 'both'`),
            `${key} must still be declared for both vehicles`);
        assert.match(source, new RegExp(`^\\s+${key}: '`, 'm'),
            `YTKit.user.js must carry a default for ${key}`);
        assert.match(source, new RegExp(`id: '${key}'`),
            `YTKit.user.js must expose a settings row for ${key}`);
    }
});
