'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sources, extractFeatureBlock } = require('../helpers/source');
const {
    collectSearchResults,
    createSearchWhileWatchingFeature,
    extractBalancedJson,
    extractInitialData,
    safeYouTubePath
} = require('../../extension/features/search-while-watching/index.js');
const { collectFakeTree, fakeTreeDocument } = require('../helpers/monolith');

const SEARCH_DATA = {
    contents: [
        {
            videoRenderer: {
                videoId: 'dQw4w9WgXcQ',
                title: { runs: [{ text: 'A title with } braces' }] },
                ownerText: { runs: [{ text: 'Creator' }] },
                publishedTimeText: { simpleText: '3 days ago' },
                lengthText: { simpleText: '3:32' },
                thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }] }
            }
        },
        {
            videoRenderer: {
                videoId: 'dQw4w9WgXcQ',
                title: { simpleText: 'Duplicate video' }
            }
        },
        {
            playlistRenderer: {
                playlistId: 'PL1234567890',
                title: { simpleText: 'Playlist result' },
                videoCountText: { simpleText: '12 videos' }
            }
        },
        {
            channelRenderer: {
                title: { simpleText: 'Channel result' },
                navigationEndpoint: {
                    commandMetadata: { webCommandMetadata: { url: '/@channel-result' } }
                }
            }
        },
        {
            channelRenderer: {
                title: { simpleText: 'Unsafe channel' },
                navigationEndpoint: {
                    commandMetadata: { webCommandMetadata: { url: 'javascript:alert(1)' } }
                }
            }
        }
    ]
};

function searchHtml(data = SEARCH_DATA) {
    return `<script>var ytInitialData = ${JSON.stringify(data)};</script>`;
}

test('search-while-watching feature is registered from the peeled module', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'searchWhileWatching');
    assert.match(block, /name:\s*(?:t\(['"]feature_searchWhileWatching_name['"],\s*)?['"]Search While Watching['"]/,
        'Search While Watching feature block must carry the localized name fallback');
    assert.match(sources.ytkit, /createSearchWhileWatchingFeature/);
    assert.match(sources.ytkit, /extensionFetchText/);
});

test('balanced initial-data extraction survives braces and escaped quotes inside titles', () => {
    const payload = { title: 'brace } and quote " stay data', nested: { ok: true } };
    const html = `<script>window["ytInitialData"] = ${JSON.stringify(payload)};</script>`;
    const objectStart = html.indexOf('{');
    assert.deepEqual(JSON.parse(extractBalancedJson(html, objectStart)), payload);
    assert.deepEqual(extractInitialData(html), payload);
    assert.equal(extractInitialData('<html>no data</html>'), null);
});

test('search renderer collection deduplicates videos and rejects unsafe navigation', () => {
    const results = collectSearchResults(SEARCH_DATA);
    assert.deepEqual(results.map((result) => result.kind).sort(), ['channel', 'playlist', 'video']);
    const video = results.find((result) => result.kind === 'video');
    assert.equal(video.title, 'A title with } braces');
    assert.equal(video.duration, '3:32');
    assert.match(video.thumbnail, /^https:\/\/i\.ytimg\.com\//);
    assert.equal(results.filter((result) => result.kind === 'video').length, 1);
    assert.ok(!results.some((result) => result.title === 'Unsafe channel'));
});

test('safe YouTube result paths stay same-origin and reject executable or foreign URLs', () => {
    assert.equal(safeYouTubePath('/@astra?sub_confirmation=1'), '/@astra?sub_confirmation=1');
    assert.equal(safeYouTubePath('https://www.youtube.com/channel/UC123'), '/channel/UC123');
    assert.equal(safeYouTubePath('https://example.com/watch?v=dQw4w9WgXcQ'), '');
    assert.equal(safeYouTubePath('javascript:alert(1)'), '');
});

function fakeDocumentRef() {
    const makeElement = () => ({
        className: '',
        classList: { add() {}, remove() {}, toggle() {} },
        children: [],
        dataset: {},
        style: {},
        setAttribute() {},
        addEventListener() {},
        appendChild(child) { this.children.push(child); },
        append(...nodes) { this.children.push(...nodes); },
        remove() {}
    });
    return {
        addEventListener() {},
        removeEventListener() {},
        createElement: makeElement,
        body: null
    };
}

test('search responses are cached and stale async results cannot replace a newer query', async () => {
    const requests = [];
    let resolveFirst;
    const documentRef = fakeDocumentRef();
    const feature = createSearchWhileWatchingFeature({
        documentRef,
        isWatchPagePath: () => true,
        injectStyle: () => ({ remove() {} }),
        extensionFetchText: ({ url }) => {
            requests.push(url);
            if (url.includes('first')) {
                return new Promise((resolve) => { resolveFirst = resolve; });
            }
            if (url.includes('empty')) {
                return Promise.resolve({ text: searchHtml({}) });
            }
            return Promise.resolve({ text: searchHtml(SEARCH_DATA) });
        }
    });
    feature.init();
    const first = feature._search('first');
    await feature._search('second');
    resolveFirst({ text: searchHtml(SEARCH_DATA) });
    await first;

    assert.equal(feature._getState().activeQuery, 'second');
    assert.equal(feature._getState().cachedQueries, 1, 'only the current response may enter the cache');
    await feature._search('second');
    assert.equal(requests.length, 2, 'a repeated query must use the five-minute cache');

    // Empty result sets are rendered but never cached — a transient degraded
    // response must not pin "no results" for the TTL.
    await feature._search('empty');
    assert.equal(feature._getState().cachedQueries, 1, 'empty result sets must not enter the cache');
    await feature._search('empty');
    assert.equal(requests.length, 4, 'repeating an empty query retries the network');
    feature.destroy();
});

test('a cache hit invalidates an in-flight network search for the previous query', async () => {
    let resolveSlow;
    const documentRef = fakeDocumentRef();
    const feature = createSearchWhileWatchingFeature({
        documentRef,
        isWatchPagePath: () => true,
        injectStyle: () => ({ remove() {} }),
        extensionFetchText: ({ url }) => {
            if (url.includes('slow')) {
                return new Promise((resolve) => { resolveSlow = resolve; });
            }
            return Promise.resolve({ text: searchHtml(SEARCH_DATA) });
        }
    });
    feature.init();
    await feature._search('warm');            // populates the cache
    const slow = feature._search('slow');     // network, left pending
    await feature._search('warm');            // cache hit — must invalidate slow
    resolveSlow({ text: searchHtml(SEARCH_DATA) });
    await slow;
    assert.equal(feature._getState().activeQuery, 'warm');
    assert.equal(feature._getState().cachedQueries, 1,
        'the stale slow response must not render or cache over the cache-hit query');
    feature.destroy();
});

test('search panel renders loading, results, keyboard close, and teardown in the page tree', async () => {
    let finishSearch;
    const request = new Promise((resolve) => { finishSearch = resolve; });
    const documentRef = fakeTreeDocument();
    const feature = createSearchWhileWatchingFeature({
        documentRef,
        windowRef: { location: { assign() {} } },
        appState: { settings: { openInNewTab: false } },
        isWatchPagePath: () => true,
        extensionFetchText: () => request,
        injectStyle: () => ({ remove() {} })
    });
    feature.init();

    feature._open('engineering');

    const panel = documentRef.body.querySelector('.ytkit-search-watch-panel');
    assert.ok(panel, 'the panel must attach to the document body');
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(panel.getAttribute('aria-modal'), 'false');
    assert.equal(panel.getAttribute('aria-labelledby'), 'ytkit-search-watch-title');
    assert.equal(panel.hidden, false);
    assert.equal(panel.querySelector('.ytkit-search-watch-status').dataset.state, 'loading');
    assert.match(panel.querySelector('.ytkit-search-watch-status').textContent, /Searching/);
    assert.equal(panel.querySelector('.ytkit-search-watch-status').getAttribute('aria-live'), 'polite');
    assert.match(panel.querySelector('.ytkit-search-watch-hint').textContent, /current video/);

    finishSearch({ text: searchHtml(SEARCH_DATA) });
    await new Promise((resolve) => setImmediate(resolve));

    const list = panel.querySelector('.ytkit-search-watch-results');
    const rows = collectFakeTree(list, '.ytkit-search-watch-item');
    assert.equal(rows.length, 3);
    assert.equal(panel.querySelector('.ytkit-search-watch-status').dataset.state, 'ready');
    assert.match(panel.querySelector('.ytkit-search-watch-status').textContent, /3 results/);
    assert.equal(rows[0].querySelector('.ytkit-search-watch-result-title').textContent, 'A title with } braces');
    assert.equal(rows[0].querySelector('.ytkit-search-watch-duration').textContent, '3:32');
    assert.equal(rows[0].querySelector('.ytkit-search-watch-link').getAttribute('rel'), 'noopener noreferrer');

    const escape = [...documentRef.listeners.get('keydown')][0];
    let prevented = false;
    escape({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(panel.hidden, true);

    feature.destroy();
    assert.equal(documentRef.body.querySelector('.ytkit-search-watch-panel'), null);
});
