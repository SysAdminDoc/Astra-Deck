'use strict';

// The original-title lookup boundary behind antiTranslate: what an oEmbed or
// player answer has to look like before its title is trusted, and the bounds
// that keep a long feed from turning into a request flood
// (yt-anti-translate#193).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadCore() {
    globalThis.YTKitCore = {};
    (0, eval)(fs.readFileSync(path.join(repoRoot, 'extension/core/original-titles.js'), 'utf8'));
    return globalThis.YTKitCore;
}

const VIDEO = 'dQw4w9WgXcQ';
const CHANNEL = 'UCuAXFkgsw1L7xaCfnd5JJOw';

function response(status, body = '', headers = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (name) => headers[name.toLowerCase()] ?? null },
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    };
}

function oEmbed(title, authorUrl = `https://www.youtube.com/channel/${CHANNEL}`) {
    return { title, author_name: 'Rick Astley', author_url: authorUrl, thumbnail_url: `https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg` };
}

test('an oEmbed answer counts only with a title and a YouTube channel URL', () => {
    const core = loadCore();
    assert.equal(core.parseOEmbedTitle(oEmbed('Never Gonna Give You Up')).title, 'Never Gonna Give You Up');
    assert.equal(core.parseOEmbedTitle(oEmbed('Original')).channelId, CHANNEL);
    const handle = core.parseOEmbedTitle(oEmbed('Original', 'https://www.youtube.com/@RickAstleyYT'));
    assert.equal(handle.channelId, null);
    assert.equal(handle.handle, '@rickastleyyt');

    assert.equal(core.parseOEmbedTitle(oEmbed('Original', 'https://evil.example/@x')), null, 'off-site author_url');
    assert.equal(core.parseOEmbedTitle(oEmbed('Original', 'javascript:alert(1)')), null);
    assert.equal(core.parseOEmbedTitle(oEmbed('Original', 'https://www.youtube.com/watch?v=x')), null, 'not a channel URL');
    assert.equal(core.parseOEmbedTitle({ title: 'Original' }), null, 'no author_url');
    assert.equal(core.parseOEmbedTitle(oEmbed('   ')), null, 'blank title');
    assert.equal(core.parseOEmbedTitle(oEmbed('x'.repeat(501))), null, 'oversized title');
    assert.equal(core.parseOEmbedTitle(JSON.stringify(oEmbed('x'.repeat(9000)))), null, 'oversized body');
    assert.equal(core.parseOEmbedTitle('not json'), null);
    assert.equal(core.parseOEmbedTitle([]), null);
});

test('a player answer counts only for the same video', () => {
    const core = loadCore();
    const good = core.parsePlayerTitle({ videoDetails: { videoId: VIDEO, title: ' Original\n title ', channelId: CHANNEL } }, VIDEO);
    assert.equal(good.title, 'Original title');
    assert.equal(good.channelId, CHANNEL);
    assert.equal(core.parsePlayerTitle({ videoDetails: { videoId: 'aaaaaaaaaaa', title: 'Other' } }, VIDEO), null);
    assert.equal(core.parsePlayerTitle({ videoDetails: { videoId: VIDEO, title: '' } }, VIDEO), null);
    assert.equal(core.parsePlayerTitle({ videoDetails: { videoId: VIDEO, title: 'T', channelId: 'nope' } }, VIDEO).channelId, null);
    assert.equal(core.parsePlayerTitle(null, VIDEO), null);
});

test('channel exceptions keep canonical ids only', () => {
    const core = loadCore();
    const list = core.parseChannelExceptions(
        `${CHANNEL}\nhttps://www.youtube.com/channel/UCaF7r2AiXRzA-yuq0B3ZDcA, @someone\n${CHANNEL}\nUCshort\n https://youtube.com/@handle `
    );
    assert.deepEqual(list, [CHANNEL, 'UCaF7r2AiXRzA-yuq0B3ZDcA']);
    assert.deepEqual(core.parseChannelExceptions(''), []);
    assert.deepEqual(core.parseChannelExceptions(null), []);
});

test('titlesDiffer ignores spacing and Unicode normalization', () => {
    const core = loadCore();
    assert.equal(core.titlesDiffer('Café  time', 'Café time'), false);
    assert.equal(core.titlesDiffer('Hola', 'Hello'), true);
    assert.equal(core.titlesDiffer('', 'Hello'), false);
});

function resolverWith(fetchImpl, options = {}) {
    const core = loadCore();
    let clock = 0;
    const resolver = core.createOriginalTitleResolver({
        fetch: fetchImpl,
        now: () => clock,
        retryDelayMs: 1000,
        ...options
    });
    return { resolver, advance: (ms) => { clock += ms; } };
}

test('one request per video, answered from the cache after that', async () => {
    const calls = [];
    const { resolver } = resolverWith(async (url, init) => {
        calls.push({ url, init });
        return response(200, oEmbed('Original'));
    });
    const [first, second] = await Promise.all([resolver.request(VIDEO), resolver.request(VIDEO)]);
    assert.equal(first.title, 'Original');
    assert.equal(second.title, 'Original');
    assert.equal((await resolver.request(VIDEO)).source, 'oembed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${VIDEO}`)}&format=json`);
    assert.equal(calls[0].init.credentials, 'omit', 'never an identified request');
    assert.equal(resolver.peek(VIDEO).title, 'Original');
});

test('concurrency, queue and cache stay inside their bounds', async () => {
    const releases = [];
    let peak = 0;
    let open = 0;
    const { resolver } = resolverWith((url) => new Promise((resolve) => {
        open += 1;
        peak = Math.max(peak, open);
        releases.push(() => { open -= 1; resolve(response(200, oEmbed(`T ${url.slice(-20)}`))); });
    }), { maxConcurrent: 2, maxQueue: 3, maxCache: 2 });

    const ids = ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3', 'aaaaaaaaaa4', 'aaaaaaaaaa5', 'aaaaaaaaaa6'];
    const pending = ids.map((id) => resolver.request(id));
    assert.equal(resolver.stats().active, 2);
    assert.equal(resolver.stats().queued, 3);
    assert.equal(await pending[5], null, 'a full queue answers nothing rather than growing');
    while (releases.length) {
        releases.shift()();
        await new Promise((resolve) => setImmediate(resolve));
    }
    await Promise.all(pending);
    assert.equal(peak, 2);
    assert.equal(resolver.stats().cached, 2, 'the cache evicts the oldest');
    assert.equal(resolver.peek('aaaaaaaaaa1'), undefined);
});

test('401 falls back to the player, capped per session', async () => {
    const calls = [];
    const { resolver } = resolverWith(async (url, init) => {
        calls.push(url);
        if (url.includes('/oembed')) return response(401, 'Unauthorized');
        const videoId = JSON.parse(init.body).videoId;
        return response(200, { videoDetails: { videoId, title: `Original ${videoId}`, channelId: CHANNEL } });
    }, {
        maxPlayerFallbacks: 1,
        buildPlayerRequest: (videoId) => ({
            url: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
            init: { method: 'POST', credentials: 'omit', body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20261020.01.00' } }, videoId }) }
        })
    });
    const first = await resolver.request(VIDEO);
    assert.equal(first.title, `Original ${VIDEO}`);
    assert.equal(first.source, 'player');
    assert.equal(first.channelId, CHANNEL);
    assert.equal(await resolver.request('bbbbbbbbbbb'), null, 'the second fallback is over the cap');
    assert.equal(calls.filter((url) => url.includes('/player')).length, 1);
});

test('no client version, no player request', async () => {
    const calls = [];
    const { resolver } = resolverWith(async (url) => { calls.push(url); return response(401); }, { buildPlayerRequest: () => null });
    assert.equal(await resolver.request(VIDEO), null);
    assert.deepEqual(calls.map((url) => url.includes('/oembed')), [true]);
    assert.equal(resolver.stats().playerFallbacks, 0);
});

test('offline: one retry after the delay, then the miss sticks', async () => {
    let calls = 0;
    const { resolver, advance } = resolverWith(async () => {
        calls += 1;
        throw new TypeError('Failed to fetch');
    }, { maxAttempts: 2 });
    assert.equal(await resolver.request(VIDEO), null);
    assert.equal(await resolver.request(VIDEO), null, 'not retried before the delay');
    assert.equal(calls, 1);
    advance(1000);
    assert.equal(await resolver.request(VIDEO), null);
    assert.equal(calls, 2);
    advance(60000);
    assert.equal(await resolver.request(VIDEO), null);
    assert.equal(calls, 2, 'the second failure settles it');
    assert.equal(resolver.peek(VIDEO), null);
});

test('a 429 is transient, a 404 is settled at once', async () => {
    const statuses = { aaaaaaaaaaa: [429, 200], bbbbbbbbbbb: [404] };
    const { resolver, advance } = resolverWith(async (url) => {
        const id = decodeURIComponent(url).match(/v=([\w-]{11})/)[1];
        const status = statuses[id].shift();
        return response(status, status === 200 ? oEmbed('Back') : '');
    });
    assert.equal(await resolver.request('aaaaaaaaaaa'), null);
    advance(1000);
    assert.equal((await resolver.request('aaaaaaaaaaa')).title, 'Back');
    assert.equal(await resolver.request('bbbbbbbbbbb'), null);
    assert.equal(resolver.peek('bbbbbbbbbbb'), null);
});

test('a navigation drops queued work without caching it', async () => {
    const releases = [];
    const { resolver } = resolverWith(() => new Promise((resolve) => releases.push(() => resolve(response(200, oEmbed('A'))))),
        { maxConcurrent: 1 });
    const started = resolver.request('aaaaaaaaaaa');
    const queued = resolver.request('bbbbbbbbbbb');
    assert.equal(resolver.cancelPending(), 1);
    assert.equal(await queued, null);
    assert.equal(resolver.peek('bbbbbbbbbbb'), undefined, 'dropped, not remembered as a miss');
    releases.shift()();
    assert.equal((await started).title, 'A');
    assert.equal(releases.length, 0, 'the dropped video never went out');
});

test('close aborts what is in flight and refuses new work', async () => {
    let signal = null;
    const { resolver } = resolverWith((url, init) => new Promise((resolve, reject) => {
        signal = init.signal;
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pending = resolver.request(VIDEO);
    await Promise.resolve();
    resolver.close();
    assert.equal(signal.aborted, true);
    assert.equal(await pending, null);
    let fetched = false;
    const closedResolver = resolver;
    assert.equal(await closedResolver.request('bbbbbbbbbbb'), null);
    assert.equal(fetched, false);
    assert.equal(resolver.stats().cached, 0);
});

test('a hung request times out', async () => {
    const { resolver } = resolverWith((url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })));
    }), { timeoutMs: 5 });
    assert.equal(await resolver.request(VIDEO), null);
    assert.equal(resolver.stats().active, 0);
});

test('a timeout counts as a failed attempt, so a hung endpoint is not asked on every pass', async () => {
    let calls = 0;
    const { resolver, advance } = resolverWith((url, init) => new Promise((resolve, reject) => {
        calls += 1;
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }), { timeoutMs: 5, maxAttempts: 2 });
    assert.equal(await resolver.request(VIDEO), null);
    assert.equal(await resolver.request(VIDEO), null, 'not retried before the delay');
    assert.equal(calls, 1);
    advance(1000);
    assert.equal(await resolver.request(VIDEO), null);
    advance(60000);
    assert.equal(await resolver.request(VIDEO), null);
    assert.equal(calls, 2, 'the second timeout settles it');
    assert.equal(resolver.peek(VIDEO), null);
});

test('a body that never finishes is cut off by the same timeout', async () => {
    const { resolver } = resolverWith((url, init) => Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: () => new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })
    }), { timeoutMs: 5 });
    assert.equal(await resolver.request(VIDEO), null);
    assert.equal(resolver.stats().active, 0, 'the slot is free again');
});
