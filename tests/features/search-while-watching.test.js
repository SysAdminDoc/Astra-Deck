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
    assert.match(block, /name:\s*['"]Search While Watching['"]/);
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

test('search responses are cached and stale async results cannot replace a newer query', async () => {
    const requests = [];
    let resolveFirst;
    const documentRef = {
        addEventListener() {},
        removeEventListener() {},
        body: null
    };
    const feature = createSearchWhileWatchingFeature({
        documentRef,
        isWatchPagePath: () => true,
        injectStyle: () => ({ remove() {} }),
        extensionFetchText: ({ url }) => {
            requests.push(url);
            if (url.includes('first')) {
                return new Promise((resolve) => { resolveFirst = resolve; });
            }
            return Promise.resolve({ text: searchHtml({}) });
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
    feature.destroy();
});

test('search panel source preserves playback and covers keyboard, loading, and accessibility states', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'search-while-watching', 'index.js'), 'utf8');
    assert.match(source, /isWatchPagePath\(\)/);
    assert.match(source, /addEventListener\?\.\('submit', _onSubmit, true\)/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /aria-modal', 'false'/);
    assert.match(source, /aria-live', 'polite'/);
    assert.match(source, /openInNewTab/);
    assert.match(source, /location\?\.assign\?\./);
    assert.match(source, /timeout: 12_000/);
    assert.match(source, /prefers-reduced-motion:reduce/);
    assert.match(source, /forced-colors:active/);
    assert.doesNotMatch(source, /\.pause\(|backdrop-filter/);
});
