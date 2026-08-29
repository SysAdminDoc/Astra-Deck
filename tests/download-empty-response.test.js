'use strict';

// An empty or non-JSON 2xx body from the companion's /download yields a null
// response object. Reading `.id` off it threw a TypeError, which the enclosing
// catch rethrew into ytKitDownload's CONNECTION-error handler — so the user
// was told "Astra Downloader stopped. Starting it again…" and shown a repair
// prompt for a companion that was running fine and had simply answered with
// nothing.
//
// The correct branch (showDownloaderFailure) was already written. It was just
// unreachable. This used to be four regex pins on the guard; it now sends a
// real download through a companion that answers with nothing and watches
// which of the two paths the user ends up on.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDownloadUIFeature } = require('../extension/features/download-ui');
const { fakeTreeDocument } = require('./helpers/monolith');

const RUNNING_COMPANION = {
    service: 'astra-downloader',
    token: 'test-token',
    token_required: true,
    port: 9751,
    version: '2.0.0',
    downloads: 0,
};

/**
 * A companion that is up, and whose /download answers with `downloadBody`.
 * Returns everything the user would see afterwards.
 */
function downloadWith(downloadBody) {
    const documentRef = fakeTreeDocument(() => null);
    documentRef.getElementById = () => null;
    globalThis.document = documentRef;
    globalThis.window = {
        location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        innerWidth: 1280,
        innerHeight: 900,
        addEventListener() {}, removeEventListener() {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    };

    const toasts = [];
    const diagnostics = [];
    const requests = [];
    const feature = createDownloadUIFeature({
        getVideoId: () => 'dQw4w9WgXcQ',
        isWatchPagePath: () => true,
        supportsPopover: () => false,
        showToast: (message, tone, options) => toasts.push({ message, tone, options }),
        DiagnosticLog: { record: (channel, detail) => diagnostics.push({ channel, detail }) },
        requestNativeDownloaderToken: async () => ({ token: 'test-token' }),
        extensionFetchJson: async ({ url }) => {
            requests.push(url);
            if (url.endsWith('/download')) {
                return { response: { status: 200, responseText: '' }, data: downloadBody };
            }
            return { response: { status: 200, responseText: '{}' }, data: RUNNING_COMPANION };
        },
        // Resolve immediately: a stub that never calls back leaves every
        // awaited delay pending forever.
        setTimeoutFn: (fn) => { queueMicrotask(fn); return 1; },
        clearTimeoutFn: () => {},
        setIntervalFn: () => 0,
        clearIntervalFn: () => {},
        t: (_key, fallback) => fallback,
    });

    // The progress poller schedules itself on the AMBIENT setTimeout, which
    // would outlive the test and keep the runner alive. Capture it instead.
    const download = async (url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') => {
        const realSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = () => 0;
        try {
            await feature.ytKitDownload(url, false, {});
        } finally {
            globalThis.setTimeout = realSetTimeout;
        }
    };

    return { feature, toasts, diagnostics, requests, documentRef, download };
}

test('an empty 2xx body reaches the download-failure path, not the restart prompt', async () => {
    const session = downloadWith(null);
    await session.download();

    assert.ok(session.requests.some((url) => url.endsWith('/download')),
        'the download must actually be sent');

    const failures = session.diagnostics.filter((entry) => entry.channel === 'download-failure');
    assert.equal(failures.length, 1,
        'an empty body is a download failure, and must be recorded as one');

    // The restart flow is what this bug produced. It must not appear.
    const restartToasts = session.toasts.filter((toast) =>
        /stopped|starting it again|restart/i.test(String(toast.message)));
    assert.deepEqual(restartToasts, [],
        'the companion answered; telling the user it stopped is the bug this guards');
    assert.equal(session.documentRef.body.children.length, 0,
        'and no repair prompt may be mounted for a companion that is running');
});

test('a non-JSON 2xx body is handled the same way', async () => {
    // Whatever the companion sends, only an object carrying an id is a
    // started download.
    for (const body of [undefined, '', 'not json', 0, {}, { error: 'disk full' }]) {
        const session = downloadWith(body);
        await session.download();

        assert.equal(
            session.diagnostics.filter((entry) => entry.channel === 'download-failure').length,
            1,
            `a ${JSON.stringify(body)} body must reach the failure path`
        );
        assert.deepEqual(
            session.toasts.filter((toast) => /stopped|starting it again/i.test(String(toast.message))),
            [],
            `a ${JSON.stringify(body)} body must not raise the restart prompt`
        );
    }
});

test('a real download id still starts progress rather than reporting failure', async () => {
    const session = downloadWith({ id: 'job-42' });
    await session.download();

    assert.deepEqual(
        session.diagnostics.filter((entry) => entry.channel === 'download-failure'),
        [],
        'the guard must not reject the normal case'
    );
});
