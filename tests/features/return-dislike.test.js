'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, extractFeatureBlock } = require('../helpers/source');
const fs = require('fs');
const path = require('path');
const {
    calculateLikeRatio,
    createReturnDislikeCardsFeature
} = require('../../extension/features/return-dislike/index.js');

function makeCard(videoId) {
    const link = {
        href: `https://www.youtube.com/watch?v=${videoId}`,
        getAttribute: () => `/watch?v=${videoId}`
    };
    return {
        isConnected: true,
        dataset: {},
        matches: () => false,
        querySelector: () => null,
        querySelectorAll(selector) {
            return selector === 'a[href]' ? [link] : [];
        }
    };
}

function makeCardsHarness(cards, provider, extra = {}) {
    const observed = [];
    class FakeIntersectionObserver {
        constructor(callback) { this.callback = callback; }
        observe(card) { observed.push(card); }
        unobserve() {}
        disconnect() {}
    }
    const documentRef = {
        querySelectorAll(selector) {
            return selector.includes('ytd-rich-item-renderer') ? cards : [];
        }
    };
    const feature = createReturnDislikeCardsFeature({
        getProvider: () => provider,
        extractVideoIdFromUrl(value) {
            return new URL(value, 'https://www.youtube.com').searchParams.get('v');
        },
        documentRef,
        IntersectionObserverCtor: FakeIntersectionObserver,
        injectStyle: () => ({ remove() {} }),
        setTimeoutFn: () => 1,
        clearTimeoutFn() {},
        ...extra
    });
    return { feature, observed };
}

function flushPromises() {
    return new Promise((resolve) => setImmediate(resolve));
}

test('Return Dislike feature block is reachable via the shared helper', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    assert.ok(block.length > 100,
        'returnDislike feature block must contain non-trivial source');
    assert.match(block, /name:\s*['"]Return YouTube Dislike['"]/,
        'returnDislike feature block must carry the user-facing name');
});

test('Return Dislike peeled module exports a factory function', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'return-dislike', 'index.js'), 'utf8');
    assert.match(modSrc, /createReturnDislikeFeature/,
        'Module must export a createReturnDislikeFeature factory');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
    assert.equal(typeof createReturnDislikeCardsFeature, 'function',
        'Module must export the thumbnail-card factory');
});

test('thumbnail ratio calculation rejects malformed totals and clamps valid percentages', () => {
    assert.equal(calculateLikeRatio({ likes: 9, dislikes: 1 }), 90);
    assert.equal(calculateLikeRatio({ likes: 1, dislikes: 2 }), 33);
    assert.equal(calculateLikeRatio({ likes: 0, dislikes: 0 }), null);
    assert.equal(calculateLikeRatio({ likes: -1, dislikes: 2 }), null);
    assert.equal(calculateLikeRatio({ likes: 'unknown', dislikes: 2 }), null);
});

test('thumbnail ratios observe cards without fetching until they become visible', async () => {
    const card = makeCard('dQw4w9WgXcQ');
    let fetchCount = 0;
    const provider = {
        _readCache: () => null,
        _fetch: async () => { fetchCount += 1; return { likes: 9, dislikes: 1 }; }
    };
    const { feature, observed } = makeCardsHarness([card], provider);

    feature.init();
    assert.deepEqual(observed, [card]);
    assert.equal(fetchCount, 0, 'offscreen cards must not spend the RYD request budget');

    feature._handleIntersections([{ target: card, isIntersecting: true }]);
    await flushPromises();
    assert.equal(fetchCount, 1);
    feature.destroy();
});

test('duplicate visible cards share one RYD request and cached cards spend no budget', async () => {
    const first = makeCard('dQw4w9WgXcQ');
    const duplicate = makeCard('dQw4w9WgXcQ');
    let fetchCount = 0;
    let resolveFetch;
    const provider = {
        _readCache: () => null,
        _fetch: () => {
            fetchCount += 1;
            return new Promise((resolve) => { resolveFetch = resolve; });
        }
    };
    const { feature } = makeCardsHarness([first, duplicate], provider);
    feature.init();
    feature._handleIntersections([
        { target: first, isIntersecting: true },
        { target: duplicate, isIntersecting: true }
    ]);
    assert.equal(fetchCount, 1, 'duplicate cards for one video must coalesce in flight');
    resolveFetch({ likes: 9, dislikes: 1 });
    await flushPromises();
    feature.destroy();

    const cachedCard = makeCard('9bZkp7q19f0');
    const cachedProvider = {
        _readCache: () => ({ ts: Date.now(), likes: 8, dislikes: 2 }),
        _fetch: async () => { throw new Error('cache hit must not fetch'); }
    };
    const cachedHarness = makeCardsHarness([cachedCard], cachedProvider);
    cachedHarness.feature.init();
    cachedHarness.feature._handleIntersections([{ target: cachedCard, isIntersecting: true }]);
    assert.equal(cachedHarness.feature._getQueueSnapshot().budget.used, 0);
    cachedHarness.feature.destroy();
});

test('thumbnail ratios cap concurrent work and hold excess cards at the 24/min budget', async () => {
    const cards = Array.from({ length: 25 }, (_, index) => makeCard(`videoid${String(index).padStart(4, '0')}`));
    const pending = [];
    let fetchCount = 0;
    const provider = {
        _readCache: () => null,
        _fetch: () => {
            fetchCount += 1;
            return new Promise((resolve) => pending.push(resolve));
        }
    };
    const { feature } = makeCardsHarness(cards, provider);
    feature.init();
    feature._handleIntersections(cards.map((card) => ({ target: card, isIntersecting: true })));
    assert.equal(feature._getQueueSnapshot().active, 4);
    assert.equal(fetchCount, 4, 'only four thumbnail requests may run concurrently');

    while (fetchCount < 24) {
        const batch = pending.splice(0);
        for (const resolve of batch) resolve({ likes: 9, dislikes: 1 });
        await flushPromises();
    }
    assert.equal(fetchCount, 24);
    assert.equal(feature._getQueueSnapshot().budget.used, 24);
    assert.equal(feature._getQueueSnapshot().queued, 1,
        'the 25th visible video must wait for the card budget window to reset');

    for (const resolve of pending.splice(0)) resolve({ likes: 9, dislikes: 1 });
    await flushPromises();
    feature.destroy();
});

test('thumbnail ratio queue drops cards that leave the viewport before a request slot opens', async () => {
    const cards = Array.from({ length: 6 }, (_, index) => makeCard(`visible${String(index).padStart(4, '0')}`));
    const pending = [];
    const fetched = [];
    const provider = {
        _readCache: () => null,
        _fetch: (videoId) => {
            fetched.push(videoId);
            return new Promise((resolve) => pending.push(resolve));
        }
    };
    const { feature } = makeCardsHarness(cards, provider);
    feature.init();
    feature._handleIntersections(cards.map((card) => ({ target: card, isIntersecting: true })));
    assert.equal(fetched.length, 4);

    feature._handleIntersections([{ target: cards[5], isIntersecting: false }]);
    for (const resolve of pending.splice(0)) resolve({ likes: 9, dislikes: 1 });
    await flushPromises();
    assert.equal(fetched.length, 5);
    assert.ok(!fetched.includes('visible0005'), 'an offscreen queued card must not trigger a late fetch');

    for (const resolve of pending.splice(0)) resolve({ likes: 9, dislikes: 1 });
    await flushPromises();
    feature.destroy();
});

test('thumbnail ratio bars expose text equivalents and reduced-motion styling', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'return-dislike', 'index.js'), 'utf8');
    assert.match(modSrc, /setAttribute\('role', 'img'\)/);
    assert.match(modSrc, /setAttribute\('aria-label', label\)/);
    assert.match(modSrc, /prefers-reduced-motion:reduce/);
    assert.match(modSrc, /forced-colors:active/);
});

test('Return Dislike uses the RYD API with rate-limit budget', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    assert.match(block, /returnyoutubedislikeapi\.com/,
        'returnDislike must query the RYD API');
    assert.match(block, /_budgetWindow|_BUDGET_PER_MIN/,
        'returnDislike must enforce a per-minute request budget');
});

test('Return Dislike renders the est. caveat disclosure', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    assert.match(block, /est\.|estimate/i,
        'returnDislike must surface the estimate caveat');
});

test('Return Dislike cancels the pending render timer on teardown (both copies)', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'return-dislike', 'index.js'), 'utf8');
    const [monolith] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    for (const [label, src] of [['module', modSrc], ['monolith', monolith]]) {
        assert.match(src, /_renderTimer/,
            `${label} must track the nav-render timer so it can be cancelled`);
        assert.match(src, /clearTimeout\(\s*(?:this\.)?_renderTimer\s*\)/,
            `${label} destroy must clearTimeout the pending render so no zombie pill is injected after disable`);
    }
});

test('Return Dislike guards against a stale video after the fetch await (both copies)', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'return-dislike', 'index.js'), 'utf8');
    const [monolith] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    for (const [label, src] of [['module', modSrc], ['monolith', monolith]]) {
        assert.match(src, /getVideoId\??\.?\(\)\s*!==\s*videoId/,
            `${label} _render must bail if the active video changed during the fetch await`);
    }
});
