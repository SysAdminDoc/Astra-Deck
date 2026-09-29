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
// There is no second download path any more. The userscript is generated from
// extension/ and runs features/download-ui itself, so parity holds by
// construction. What still needs proving is that the one path behaves: these
// drive the real module's guard and payload through its public factory, with
// the companion faked at the fetch boundary.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { sources, userscriptBundles } = require('./helpers/source');
const { createDownloadUIFeature } = require('../extension/features/download-ui');

const repoRoot = path.join(__dirname, '..');
const schemaSource = fs.readFileSync(
    path.join(repoRoot, 'extension/core/settings-schema.js'), 'utf8');

test('the userscript runs the extension download module, not a copy of its own', () => {
    assert.ok(userscriptBundles('features/download-ui/index.js'),
        'the guard and payload below are the userscript\'s only if it ships this module');
});

/**
 * The download UI with a running companion and a /download endpoint the test
 * answers. Nothing here stubs the guard or the payload builder: both run as
 * shipped.
 */
function downloadHarness({ settings = {}, answer } = {}) {
    const toasts = [];
    const posts = [];
    const feature = createDownloadUIFeature({
        appState: { settings },
        showToast: (message) => { toasts.push(String(message)); },
        extensionFetchJson: (request) => {
            posts.push(request);
            return answer ? answer(request) : Promise.resolve({ response: { status: 200 }, data: {} });
        },
    });
    // Status and the repair prompt are the companion probe's business, tested
    // in download-health-boundary and download-ui. Here the companion is up.
    feature.MediaDLManager.check = async () => ({ ok: true, token: 'tok', port: 9751 });
    feature.MediaDLManager.showInstallPrompt = () => {};
    return { feature, toasts, posts };
}

// ── 1. the in-progress guard ──────────────────────────────────────────────

test('a second download while one is in flight is refused, not queued', async () => {
    // Every held request is answered at the end, pass or fail, so a guard that
    // lets the second click through fails the assertions instead of hanging.
    const pending = [];
    const h = downloadHarness({
        answer: () => new Promise((resolve) => { pending.push(() => resolve({ response: { status: 200 }, data: {} })); }),
    });

    const first = h.feature.ytKitDownload('https://youtu.be/abc', false);
    const toastsBefore = h.toasts.length;
    let second = null;
    try {
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(h.posts.length, 1, 'the first click must start a download');

        second = h.feature.ytKitDownload('https://youtu.be/abc', false);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(h.posts.length, 1, 'the second click must NOT reach the companion');
        assert.equal(h.toasts.length, toastsBefore + 1, 'the user must be told why nothing happened');
        assert.match(h.toasts.at(-1), /already in progress/i);
    } finally {
        pending.forEach((release) => release());
        await Promise.all([first, second]);
    }
});

test('the guard clears once the download settles, so the next click works', async () => {
    const h = downloadHarness();

    await h.feature.ytKitDownload('https://youtu.be/abc', false);
    await h.feature.ytKitDownload('https://youtu.be/def', true);
    assert.equal(h.posts.length, 2, 'a settled download must not wedge the guard');
    assert.ok(!h.toasts.some((message) => /already in progress/i.test(message)));
});

test('a download that throws still clears the guard', async () => {
    let fail = true;
    const h = downloadHarness({
        answer: () => (fail
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ response: { status: 200 }, data: {} })),
    });

    await h.feature.ytKitDownload('https://youtu.be/abc', false);
    assert.ok(h.toasts.some((message) => /request failed/i.test(message)),
        'the failure itself is reported');

    fail = false;
    await h.feature.ytKitDownload('https://youtu.be/abc', false);
    assert.equal(h.posts.length, 2,
        'without a finally the first failure would block downloads for the page lifetime');
});

// ── 2. the companion payload ──────────────────────────────────────────────

async function sendPayload(settings, audioOnly) {
    const h = downloadHarness({ settings });
    await h.feature._mediaDLSendDownload('https://youtu.be/abc', audioOnly, 'tok');
    const download = h.posts.find((request) => /\/download$/.test(request.url));
    assert.ok(download, 'a download request must be sent');
    return JSON.parse(download.data);
}

test('the companion payload carries the chosen quality and video container', async () => {
    const payload = await sendPayload(
        { downloadQuality: '1080', downloadVideoFormat: 'mkv', downloadAudioFormat: 'flac' },
        false);

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

// ── 3. the settings the payload reads must exist where the userscript runs ──

test('the two container settings the schema ships to both vehicles have a default and a settings row', () => {
    // Both are `vehicle: 'both'` in the schema. The hand-written userscript had
    // neither a default nor a settings row, so the payload read undefined
    // forever and the user had no way to change it. Its defaults and rows are
    // ytkit.js's now, which the first test above and this one tie together.
    assert.ok(userscriptBundles('ytkit.js'), 'the userscript takes its defaults and settings rows from ytkit.js');
    for (const key of ['downloadVideoFormat', 'downloadAudioFormat']) {
        assert.match(schemaSource, new RegExp(`key: "${key}"[^\\n]*vehicle: 'both'`),
            `${key} must still be declared for both vehicles`);
        assert.match(sources.ytkit, new RegExp(`^\\s+${key}: '`, 'm'),
            `ytkit.js must carry a default for ${key}`);
        assert.match(sources.ytkit, new RegExp(`id: '${key}'`),
            `ytkit.js must expose a settings row for ${key}`);
    }
});
