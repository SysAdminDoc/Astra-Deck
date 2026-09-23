'use strict';

// Every companion call goes through extensionFetchJson, which retried any
// thrown error and any 429/5xx three more times regardless of method. A
// POST /download that timed out while the companion probed the video was
// therefore sent up to four times, then once more by the download flow's own
// restart path: one click, eight queued jobs. And a stopped companion cost
// 1+2+4 s of backoff on each of six health ports, so every recovery button
// spun for minutes. These drive the real wrapper and the real download flow.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDeclarations, fakeTreeDocument } = require('../helpers/monolith');
const { createDownloadUIFeature } = require('../../extension/features/download-ui');

const WRAPPER = [
    '_createRequestAbortError', '_throwIfRequestAborted', 'IDEMPOTENT_REQUEST_METHODS', 'RETRY_AFTER_MAX_MS',
    '_parseRetryAfter', '_findRetryAfter', '_waitForRequestRetry', 'extensionRequestWithRetry', 'extensionFetchJson'
];

function wrapper(extensionRequestAsync) {
    return loadDeclarations(WRAPPER, {
        appState: { settings: {} },
        extensionRequestAsync,
        JSON,
        Date,
        Math,
        // Backoff waits resolve on the next microtask.
        setTimeout: (fn) => { queueMicrotask(fn); return 1; },
        clearTimeout: () => {}
    });
}

function timeout() {
    const error = new Error('Extension request timed out');
    error.isTimeout = true;
    return error;
}

test('only an idempotent request is repeated after an outcome nobody saw', async () => {
    for (const [method, expected] of [['POST', 1], ['GET', 4]]) {
        let calls = 0;
        const fx = wrapper(async () => { calls += 1; throw timeout(); });
        await assert.rejects(fx.extensionRequestWithRetry({ method, url: 'http://127.0.0.1:9751/x' }), /timed out/);
        assert.equal(calls, expected, `${method} after a timeout`);
    }
});

test('a non-idempotent request is retried only when the server says it did nothing', async () => {
    const run = async (method, status) => {
        let calls = 0;
        const fx = wrapper(async () => { calls += 1; return { status, responseText: '{}' }; });
        await fx.extensionRequestWithRetry({ method, url: 'http://127.0.0.1:9751/x' });
        return calls;
    };
    assert.equal(await run('POST', 503), 4, '503 means the request was not processed');
    assert.equal(await run('POST', 429), 4, '429 means the request was not processed');
    assert.equal(await run('POST', 500), 1, 'a 500 may have done half the work');
    assert.equal(await run('GET', 500), 4, 'reads keep their retries');
});

test('retry: false opts one request out of backoff and is not forwarded', async () => {
    const seen = [];
    const fx = wrapper(async (req) => { seen.push(req); throw new Error('Extension request failed'); });
    await assert.rejects(fx.extensionFetchJson({ method: 'GET', url: 'http://127.0.0.1:9751/health', retry: false }));
    assert.equal(seen.length, 1);
    assert.equal('retry' in seen[0], false);
});

function downloadFeature(extensionRequestAsync, toasts) {
    const fx = wrapper(extensionRequestAsync);
    globalThis.document = fakeTreeDocument(() => null);
    globalThis.document.getElementById = () => null;
    return createDownloadUIFeature({
        getVideoId: () => 'dQw4w9WgXcQ',
        isWatchPagePath: () => true,
        supportsPopover: () => false,
        showToast: (message) => toasts.push(String(message)),
        requestNativeDownloaderToken: async () => ({ token: null, error: 'Specified native messaging host not found.' }),
        extensionFetchJson: fx.extensionFetchJson,
        openProtocol: () => {},
        setTimeoutFn: (fn) => { queueMicrotask(fn); return 1; },
        clearTimeoutFn: () => {},
        t: (_key, fallback) => fallback
    });
}

test('one click sends one download, even when the companion answers too late', async () => {
    const HEALTH = { service: 'astra-downloader', api: 2, token: 'tok', token_required: true, port: 9751, version: '2.13.0' };
    const posts = [];
    const toasts = [];
    const feature = downloadFeature(async (req) => {
        const path = new URL(req.url).pathname;
        if (path === '/health') return { status: 200, responseText: JSON.stringify(HEALTH) };
        if (path === '/download') { posts.push(req); throw timeout(); }
        return { status: 404, responseText: '' };
    }, toasts);
    const realTimeout = globalThis.setTimeout;
    const originalDocument = globalThis.document;
    globalThis.setTimeout = (fn) => { queueMicrotask(fn); return 0; };
    try {
        await feature.ytKitDownload('https://www.youtube.com/watch?v=dQw4w9WgXcQ', false, {});
    } finally {
        globalThis.setTimeout = realTimeout;
        globalThis.document = originalDocument;
    }
    assert.equal(posts.length, 1, 'the companion may already have queued it');
    assert.ok(posts[0].timeout >= 30000, 'the size probe inside the request needs time');
    assert.ok(toasts.some((message) => /may already be queued/.test(message)), JSON.stringify(toasts));
    assert.ok(!toasts.some((message) => /Starting it again/.test(message)), 'a late answer is not a stopped service');
});

test('a stopped companion is probed once per port, not four times with backoff', async () => {
    const probes = [];
    const feature = downloadFeature(async (req) => {
        probes.push(new URL(req.url).port);
        throw new Error('Extension request failed');
    }, []);
    const originalDocument = globalThis.document;
    try {
        const status = await feature.MediaDLManager.check(true);
        assert.equal(status.ok, false);
    } finally {
        globalThis.document = originalDocument;
    }
    assert.equal(probes.length, new Set(probes).size, `each port once: ${probes.join(',')}`);
    assert.ok(probes.length >= 6);
});

// A refusal is an answer. The companion sends every /download refusal as a
// non-2xx with an error_code; the wrapper throws on non-2xx, and the throw
// went to the connection handler: restart the service, send the download
// again, then "cannot reach the downloader". The mapped copy never showed.
test('a companion refusal shows its own failure, once, without a restart', async () => {
    const HEALTH = { service: 'astra-downloader', api: 2, token: 'tok', token_required: true, port: 9751, version: '2.13.0' };
    const posts = [];
    const toasts = [];
    const feature = downloadFeature(async (req) => {
        const path = new URL(req.url).pathname;
        if (path === '/health') return { status: 200, responseText: JSON.stringify(HEALTH) };
        if (path === '/download') {
            posts.push(req);
            return { status: 422, responseText: JSON.stringify({ error: 'Deno is not installed', error_code: 'deno-runtime-missing' }) };
        }
        return { status: 404, responseText: '' };
    }, toasts);
    const realTimeout = globalThis.setTimeout;
    const originalDocument = globalThis.document;
    globalThis.setTimeout = (fn) => { queueMicrotask(fn); return 0; };
    try {
        await feature.ytKitDownload('https://www.youtube.com/watch?v=dQw4w9WgXcQ', false, {});
    } finally {
        globalThis.setTimeout = realTimeout;
        globalThis.document = originalDocument;
    }
    assert.equal(posts.length, 1);
    assert.ok(!toasts.some((message) => /Starting it again|request failed/.test(message)), JSON.stringify(toasts));
    assert.ok(toasts.some((message) => /^Astra Downloader: /.test(message) && !/Deno is not installed/.test(message)),
        `the mapped copy, not the companion's raw text: ${JSON.stringify(toasts)}`);
});

// A failed job used to open the "cannot reach the downloader" repair prompt
// whenever the companion's English message mentioned cookies, yt-dlp or its
// own name, which its sign-in, network and EJS runtime messages all do.
test('a failed download opens the repair prompt only for a repairable cause', async () => {
    const run = async (statusBody) => {
        const toasts = [];
        const prompts = [];
        globalThis.document = fakeTreeDocument(() => null);
        const feature = createDownloadUIFeature({
            getVideoId: () => 'dQw4w9WgXcQ',
            isWatchPagePath: () => true,
            supportsPopover: () => false,
            showToast: (message) => toasts.push(String(message)),
            extensionFetchJson: async () => ({ data: statusBody }),
            t: (_key, fallback) => fallback
        });
        feature.MediaDLManager.showInstallPrompt = (mode) => prompts.push(mode);
        const originalDocument = globalThis.document;
        try {
            feature.showDownloadProgress('job1', 'tok', false);
            for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
        } finally {
            globalThis.document = originalDocument;
        }
        return { toasts, prompts };
    };
    const signIn = await run({ status: 'failed', error: 'Astra Downloader needs your YouTube cookies. Grant browser cookies.', error_code: 'sign-in-required' });
    assert.deepEqual(signIn.prompts, [], 'a sign-in failure is not a broken downloader');
    assert.ok(!signIn.toasts.some((message) => /Grant browser cookies/.test(message)), 'the mapped copy replaces raw text');

    const native = await run({ status: 'failed', error: 'native host missing', error_code: 'native-channel-required' });
    assert.deepEqual(native.prompts, ['retry'], 'a native-channel failure is what the repair prompt fixes');

    const legacy = await run({ status: 'failed', error: 'Local downloader crashed' });
    assert.deepEqual(legacy.prompts, ['retry'], 'a companion with no error_code keeps the old reading');
});

// The clip track reads the video for its playhead and for a duration when the
// player response has not landed, but ytkit.js never handed the download UI
// the element, so both were dead in production while tests injected it.
test('ytkit.js hands the download UI the main video element', () => {
    const { sources } = require('../helpers/source');
    const start = sources.ytkit.indexOf('createDownloadUIFeature(');
    assert.ok(start > -1);
    const call = sources.ytkit.slice(start, sources.ytkit.indexOf('\n        })', start));
    assert.match(call, /\bgetMainVideoElement\b/);
});
