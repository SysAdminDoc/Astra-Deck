'use strict';

// YouTube answers an InnerTube POST carrying an extension's Origin with a 403
// "Sorry..." page, on every endpoint and client (measured 2026-11-01: the same
// background call succeeds once the header is set to the page's or removed).
// So every such POST, whichever feature sends it, has to leave from the content
// script. These drive the real request layer.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDeclarations } = require('../helpers/monolith');

const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

function harness({ answer, globals = {} } = {}) {
    const fetches = [];
    const messages = [];
    const fx = loadDeclarations([
        '_createRequestAbortError', '_throwIfRequestAborted',
        'INNERTUBE_POST_URL', 'INNERTUBE_POST_TIMEOUT_MS', 'sendInnertubePost',
        'extensionRequest', 'extensionRequestAsync'
    ], {
        AbortController,
        ArrayBuffer,
        Blob,
        FormData,
        URLSearchParams,
        Object,
        String,
        hasExtensionContext: () => true,
        setTimeout,
        clearTimeout,
        fetch: async (url, init) => {
            fetches.push({ url, init });
            return (answer || (async () => ({
                status: 200,
                statusText: 'OK',
                url,
                headers: [['content-type', 'application/json']],
                text: async () => '{"ok":true}'
            })))(url, init);
        },
        sendRuntimeMessage: async (message) => {
            messages.push(message);
            return { status: 200, statusText: 'OK', responseText: '{"bg":true}', responseHeaders: '', finalUrl: message.details.url };
        },
        ...globals
    });
    return { fx, fetches, messages };
}

test('an InnerTube POST leaves from the content script, never the background', async () => {
    const { fx, fetches, messages } = harness();
    const response = await fx.extensionRequestAsync({
        method: 'POST',
        url: PLAYER,
        headers: { 'Content-Type': 'application/json' },
        data: '{"videoId":"abc"}'
    });
    assert.equal(messages.length, 0, 'the background gets a 403 for this');
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].url, PLAYER);
    assert.equal(fetches[0].init.method, 'POST');
    assert.equal(fetches[0].init.body, '{"videoId":"abc"}');
    assert.equal(fetches[0].init.headers['Content-Type'], 'application/json');
    assert.equal(fetches[0].init.redirect, 'manual');
    assert.equal(response.status, 200);
    assert.equal(response.responseText, '{"ok":true}');
    assert.equal(response.response, '{"ok":true}');
    assert.equal(response.statusText, 'OK');
    assert.equal(response.finalUrl, PLAYER);
    assert.equal(response.responseHeaders, 'content-type: application/json');
});

test('every other request still goes through the background', async () => {
    const rows = [
        { method: 'GET', url: PLAYER },
        { method: 'POST', url: 'https://returnyoutubedislikeapi.com/votes' },
        { method: 'POST', url: 'https://www.youtube.com.example.test/youtubei/v1/player' },
        { method: 'POST', url: 'https://www.youtube.com/watch?v=abc' },
        { url: PLAYER }
    ];
    for (const row of rows) {
        const { fx, fetches, messages } = harness();
        const response = await fx.extensionRequestAsync(row);
        assert.equal(fetches.length, 0, `${row.method} ${row.url} must not use the page fetch`);
        assert.equal(messages.length, 1, `${row.method} ${row.url} goes to the background`);
        assert.equal(response.responseText, '{"bg":true}');
    }
});

test('a caller asking for an anonymous request gets one, and the rest carry the account as before', async () => {
    const anonymous = harness();
    await anonymous.fx.extensionRequestAsync({ method: 'POST', url: PLAYER, credentials: 'omit', data: '{}' });
    assert.equal(anonymous.fetches[0].init.credentials, 'omit');

    const account = harness();
    await account.fx.extensionRequestAsync({ method: 'POST', url: PLAYER, data: '{}' });
    assert.equal(account.fetches[0].init.credentials, 'include');
});

test('a refusal reaches the caller as its status, for the caller to read', async () => {
    const { fx } = harness({
        answer: async (url) => ({
            status: 429,
            statusText: 'Too Many Requests',
            url,
            headers: [['retry-after', '30'], ['content-type', 'text/html']],
            text: async () => 'Sorry...'
        })
    });
    const response = await fx.extensionRequestAsync({ method: 'POST', url: PLAYER, data: '{}' });
    assert.equal(response.status, 429);
    assert.equal(response.responseText, 'Sorry...');
    assert.equal(response.responseHeaders, 'retry-after: 30\r\ncontent-type: text/html', 'the retry layer reads Retry-After from here');
});

test('a network failure is an error with its message', async () => {
    const { fx } = harness({ answer: async () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(
        fx.extensionRequestAsync({ method: 'POST', url: PLAYER, data: '{}' }),
        (error) => error.message === 'Failed to fetch' && !error.isTimeout && error.name !== 'AbortError'
    );
});

function hangUntilAborted() {
    return (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        }, { once: true });
    });
}

test('the caller can cancel, which stops the request itself', async () => {
    const { fx, fetches } = harness({ answer: hangUntilAborted() });
    const controller = new AbortController();
    const seen = new Promise((resolve) => {
        fx.extensionRequest({
            method: 'POST',
            url: PLAYER,
            data: '{}',
            signal: controller.signal,
            onerror: resolve,
            ontimeout: () => resolve({ error: 'timed out instead' }),
            onload: () => resolve({ error: 'loaded instead' })
        });
    });
    await Promise.resolve();
    controller.abort();
    const detail = await seen;
    assert.equal(detail.name, 'AbortError');
    assert.equal(detail.error, 'Operation cancelled');
    assert.equal(fetches[0].init.signal.aborted, true, 'the fetch itself has to stop');
});

test('a request already cancelled never goes out', async () => {
    const { fx, fetches } = harness();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        async () => fx.extensionRequestAsync({ method: 'POST', url: PLAYER, data: '{}', signal: controller.signal }),
        (error) => error.name === 'AbortError'
    );
    const direct = await new Promise((resolve) => {
        fx.extensionRequest({ method: 'POST', url: PLAYER, data: '{}', signal: controller.signal, onerror: resolve, onload: resolve });
    });
    assert.equal(direct.name, 'AbortError');
    assert.equal(fetches.length, 0);
});

test('a slow answer times out at the caller\'s limit, or a default so it can never hang', async () => {
    const delays = [];
    const timers = [];
    const run = async (details) => {
        const { fx, fetches } = harness({
            answer: hangUntilAborted(),
            globals: {
                setTimeout: (fn, delay) => { delays.push(delay); timers.push(fn); return timers.length; },
                clearTimeout: () => {}
            }
        });
        const seen = new Promise((resolve) => {
            fx.extensionRequest({
                method: 'POST',
                url: PLAYER,
                data: '{}',
                ...details,
                ontimeout: () => resolve('timeout'),
                onerror: () => resolve('error'),
                onload: () => resolve('load')
            });
        });
        await Promise.resolve();
        timers[timers.length - 1]();
        assert.equal(await seen, 'timeout');
        assert.equal(fetches[0].init.signal.aborted, true);
    };
    await run({ timeout: 10000 });
    await run({});
    assert.equal(delays[0], 10000);
    assert.equal(delays[1], 30000);
});

test('a finished request lets go of its timer and the caller\'s signal', async () => {
    const cleared = [];
    const added = [];
    const removed = [];
    const { fx } = harness({
        globals: {
            setTimeout: () => 77,
            clearTimeout: (id) => cleared.push(id)
        }
    });
    const signal = {
        aborted: false,
        addEventListener: (name) => added.push(name),
        removeEventListener: (name) => removed.push(name)
    };
    await new Promise((resolve, reject) => {
        fx.sendInnertubePost({ method: 'POST', url: PLAYER, signal, onload: resolve, onerror: reject }, '{}');
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([...cleared], [77]);
    assert.deepEqual([...added], ['abort']);
    assert.deepEqual([...removed], ['abort']);
});
