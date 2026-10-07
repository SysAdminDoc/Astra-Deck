'use strict';

// YouTube's "Made with AI" label is only in watch-page data, never on a card.
// Stage one learns it from watch pages the user opens and sends nothing;
// stage two (opt-in) asks YouTube about each card with a masked lookup.

const test = require('node:test');
const assert = require('node:assert/strict');

require('../../extension/core/text-metrics.js');
require('../../extension/core/date-time.js');
require('../../extension/core/predicate-sandbox.js');
require('../../extension/core/persisted-domains.js');

const MODULE_PATH = '../../extension/features/video-hider/index.js';
const LABELED = 'hKGihnLGvPQ';
const CLEAN = 'dQw4w9WgXcQ';
const DAY = 86400000;

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    globalThis.YTKitFeatures = {};
    delete require.cache[require.resolve(MODULE_PATH)];
    const mod = require(MODULE_PATH);
    globalThis.YTKitFeatures = originalFeatures;
    return mod;
}

// Trimmed from a live /youtubei/v1/next response, 2026-10-06 (tracking
// params dropped). The masked lookup returns the same primary-info shape.
const AI_BADGE = {
    metadataBadgeRenderer: {
        icon: { iconType: 'INFO' },
        style: 'BADGE_STYLE_TYPE_SIMPLE',
        label: 'AI',
        accessibilityData: { label: 'AI: Content was made with AI' }
    }
};
const AUTO_DUBBED_BADGE = {
    metadataBadgeRenderer: { icon: { iconType: 'PERSON_RADAR_FILLED' }, style: 'BADGE_STYLE_TYPE_SIMPLE', label: 'Auto-dubbed' }
};

function watchResponse(videoId, badges) {
    const primary = badges ? { badges } : {};
    return {
        currentVideoEndpoint: { watchEndpoint: { videoId } },
        contents: { twoColumnWatchNextResults: { results: { results: { contents: [
            { videoPrimaryInfoRenderer: primary }, {}, {}
        ] } } } }
    };
}

function card(videoId) {
    return { dataset: { ytkitVideoId: videoId }, querySelector: () => null, querySelectorAll: () => [] };
}

function harness({ settings = {}, stored = undefined, initialData = null, fetchImpl = null, now = 1760000000000 } = {}) {
    const writes = [];
    const listeners = new Map();
    const timers = [];
    const fetches = [];
    const clock = { now };
    const feature = loadModule().createHideVideosFromHomeFeature({
        appState: {
            settings: {
                hideVideosMadeWithAiFilter: true,
                hideVideosMadeWithAiLookups: false,
                hideVideosSyntheticNarrationFilter: false,
                hideVideosLowViewFilter: false,
                hideVideosLowSignalFilter: false,
                hideVideosUploadCadenceFilter: false,
                ...settings
            }
        },
        storageRead: (key, fallback) => (key === 'ytkit-ai-label-verdicts' && stored !== undefined ? stored : fallback),
        storageWrite: (key, value) => writes.push({ key, value }),
        getInitialDataGlobal: () => initialData,
        getInnertubeClientVersion: () => '2.20261001.00.00',
        extensionFetchJson: (request) => {
            fetches.push(request);
            return fetchImpl ? fetchImpl(request) : Promise.resolve({ data: watchResponse(JSON.parse(request.data).videoId) });
        },
        nowFn: () => clock.now,
        setTimeoutFn: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
        clearTimeoutFn: () => {},
        documentRef: {
            addEventListener: (type, fn) => listeners.set(type, fn),
            removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
            querySelectorAll: () => []
        },
        PredicateSandbox: globalThis.YTKitCore.createPredicateSandbox()
    });
    feature._installAiLabelCapture();
    return { feature, writes, listeners, timers, fetches, clock };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('readMadeWithAiLabel reads the INFO badge YouTube puts on labeled watch pages', () => {
    const { readMadeWithAiLabel } = loadModule();
    assert.equal(readMadeWithAiLabel(watchResponse(LABELED, [AI_BADGE])), true);
    assert.equal(readMadeWithAiLabel(watchResponse(CLEAN)), false, 'no badges is a clean video');
    assert.equal(readMadeWithAiLabel(watchResponse(CLEAN, [AUTO_DUBBED_BADGE])), false,
        'Auto-dubbed is a primary badge too, with another icon');
    assert.equal(readMadeWithAiLabel({ contents: { twoColumnWatchNextResults: { results: { results: { contents: [{}] } } } } }), null,
        'a removed video has no primary info and stays unknown');
    assert.equal(readMadeWithAiLabel(null), null);
});

test('stage one: a labeled watch page hides that video everywhere, and nothing is sent', async () => {
    const { feature, writes, fetches } = harness({ initialData: watchResponse(LABELED, [AI_BADGE]) });
    assert.deepEqual(feature._matchesMetadataFilters(card(LABELED), {}), { hide: true, reason: 'made-with-ai' });
    assert.deepEqual(feature._matchesMetadataFilters(card(CLEAN), {}), { hide: false, reason: '' });
    assert.equal(writes.at(-1).key, 'ytkit-ai-label-verdicts');
    assert.deepEqual(writes.at(-1).value[LABELED][0], 1);
    await settle();
    assert.equal(fetches.length, 0, 'with lookups off, an unknown card asks nothing');
});

test('stage one: an in-app navigation to a labeled video is captured during the dispatch', () => {
    const { feature, listeners } = harness();
    assert.equal(feature._aiVerdict(LABELED), undefined);
    listeners.get('yt-navigate-finish')({ detail: { response: { response: watchResponse(LABELED, [AI_BADGE]) } } });
    assert.equal(feature._aiVerdict(LABELED), true);
    listeners.get('yt-navigate-finish')({ detail: { response: { response: watchResponse(CLEAN) } } });
    assert.equal(feature._aiVerdict(CLEAN), false);
    listeners.get('yt-navigate-finish')({ detail: null });
    feature._resetAiLabelState();
    assert.equal(listeners.has('yt-navigate-finish'), false, 'the listener is removed on teardown');
});

test('with the filter off, nothing is captured and nothing hides', () => {
    const { feature, writes } = harness({
        settings: { hideVideosMadeWithAiFilter: false },
        stored: { [LABELED]: [1, 20000] },
        initialData: watchResponse(CLEAN)
    });
    assert.equal(writes.length, 0);
    assert.deepEqual(feature._matchesMetadataFilters(card(LABELED), {}), { hide: false, reason: '' });
});

test('stored verdicts load, and expire on their own clocks', () => {
    const now = 1760000000000;
    const today = Math.floor(now / DAY);
    const { feature } = harness({
        now,
        stored: {
            [LABELED]: [1, today - 179],
            aaaaaaaaaaa: [1, today - 181],
            [CLEAN]: [0, today - 29],
            bbbbbbbbbbb: [0, today - 31],
            'not-an-id': [1, today],
            ccccccccccc: ['yes', today]
        }
    });
    assert.equal(feature._aiVerdict(LABELED), true);
    assert.equal(feature._aiVerdict('aaaaaaaaaaa'), undefined, 'a label is re-checked after 180 days');
    assert.equal(feature._aiVerdict(CLEAN), false);
    assert.equal(feature._aiVerdict('bbbbbbbbbbb'), undefined, 'a clean verdict is re-checked after 30 days');
    assert.equal(feature._aiVerdict('ccccccccccc'), undefined, 'a malformed entry is dropped');
});

test('stage two: unknown cards are looked up masked, four at a time, without cookies', async () => {
    const pending = [];
    const { feature, fetches } = harness({
        settings: { hideVideosMadeWithAiLookups: true },
        fetchImpl: (request) => new Promise((resolve) => pending.push(() => resolve({
            data: watchResponse(JSON.parse(request.data).videoId, JSON.parse(request.data).videoId === LABELED ? [AI_BADGE] : null)
        })))
    });
    const ids = [LABELED, CLEAN, 'aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'];
    for (const id of ids) feature._matchesMetadataFilters(card(id), {});
    feature._matchesMetadataFilters(card(LABELED), {});
    assert.equal(fetches.length, 4, 'the concurrency cap holds');
    const request = fetches[0];
    assert.equal(request.method, 'POST');
    assert.match(request.url, /^https:\/\/www\.youtube\.com\/youtubei\/v1\/next\?prettyPrint=false&fields=contents\.twoColumnWatchNextResults/);
    assert.equal(request.credentials, undefined, 'the proxy omits cookies unless a caller asks for them');
    assert.equal(request.retry, false);
    assert.equal(JSON.parse(request.data).videoId, LABELED);

    pending.shift()();
    await settle();
    assert.equal(fetches.length, 5, 'a finished lookup frees a slot');
    assert.deepEqual(feature._matchesMetadataFilters(card(LABELED), {}), { hide: true, reason: 'made-with-ai' });
    while (pending.length) { pending.shift()(); await settle(); }
    assert.equal(fetches.length, ids.length, 'each video is asked about once');
    assert.equal(feature._aiVerdict(CLEAN), false);
});

test('stage two: a throttled lookup pauses the queue and retries once', async () => {
    let calls = 0;
    const { feature, fetches, timers, clock } = harness({
        settings: { hideVideosMadeWithAiLookups: true },
        fetchImpl: () => {
            calls += 1;
            if (calls === 1) {
                const error = new Error('HTTP 429');
                error.response = { status: 429 };
                return Promise.reject(error);
            }
            return Promise.resolve({ data: watchResponse(LABELED, [AI_BADGE]) });
        }
    });
    feature._matchesMetadataFilters(card(LABELED), {});
    await settle();
    await settle();
    assert.equal(fetches.length, 1, 'nothing more goes out while paused');
    assert.equal(timers.at(-1).delay, 60000);
    clock.now += 60000;
    timers.at(-1).fn();
    await settle();
    assert.equal(fetches.length, 2);
    assert.equal(feature._aiVerdict(LABELED), true);
});
