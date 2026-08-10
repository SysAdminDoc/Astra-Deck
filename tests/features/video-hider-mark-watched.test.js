'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHideVideosFromHomeFeature } = require('../../extension/features/video-hider/index.js');
const { SETTINGS_SCHEMA, buildDefaultsFromSchema } = require('../../extension/core/settings-schema');

const VIDEO_A = 'A1234567890';
const VIDEO_B = 'B1234567890';
const VIDEO_C = 'C1234567890';

function sanitizeVideoIds(value, limit = 5000) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id)))].slice(0, limit);
}

function createHarness({ settings = {}, initial = [], limit = 5000 } = {}) {
    let stored = initial.slice();
    const writes = [];
    const toasts = [];
    const feature = createHideVideosFromHomeFeature({
        appState: {
            settings: {
                markWatchedVideos: false,
                hideVideosRemoveHiddenCards: false,
                ...settings
            }
        },
        IMPORT_LIMITS: {
            hiddenVideos: 5000,
            allowedVideos: 5000,
            markedWatchedVideos: limit,
            blockedChannels: 2000
        },
        storageRead: (key, fallback) => key === 'ytkit-marked-watched-videos' ? stored : fallback,
        storageWrite: (key, value) => {
            writes.push({ key, value });
            if (key === 'ytkit-marked-watched-videos') stored = value.slice();
        },
        sanitizeImportedVideoIdList: sanitizeVideoIds,
        showToast: (message, color, options) => toasts.push({ message, color, options }),
        t: (_key, fallback) => fallback
    });
    feature._processAllVideos = () => {};
    return {
        feature,
        writes,
        toasts,
        getStored: () => stored.slice()
    };
}

function fakeCard() {
    const classes = new Set();
    return {
        dataset: {},
        hiddenState: null,
        classList: {
            toggle(name, force) {
                if (force) classes.add(name);
                else classes.delete(name);
            },
            contains(name) {
                return classes.has(name);
            }
        }
    };
}

function isolateFiltering(feature) {
    feature._extractVideoId = () => VIDEO_A;
    feature._isVideoAllowed = () => false;
    feature._isVideoIdHidden = () => false;
    feature._extractChannelInfo = () => null;
    feature._isChannelBlocked = () => false;
    feature._matchesMetadataFilters = () => ({ hide: false, reason: '' });
    feature._isScopeEnabledForPath = () => true;
    feature._syncQuickHideButton = () => {};
    feature._syncMarkWatchedButton = () => {};
    feature._applyVideoHiddenState = (element, hidden) => { element.hiddenState = hidden; };
}

test('mark-watched setting is opt-in and represented in schema defaults', () => {
    const entry = SETTINGS_SCHEMA.find((item) => item.key === 'markWatchedVideos');
    assert.ok(entry);
    assert.equal(entry.defaultValue, false);
    assert.equal(buildDefaultsFromSchema().markWatchedVideos, false);
});

test('marked-watched IDs use bounded LRU ordering and deduplicate refreshes', () => {
    const harness = createHarness({ initial: [VIDEO_A, VIDEO_B, VIDEO_C], limit: 2 });
    const { feature } = harness;

    assert.deepEqual(feature._getMarkedWatchedVideos(), [VIDEO_B, VIDEO_C]);
    assert.deepEqual(harness.getStored(), [VIDEO_B, VIDEO_C]);

    assert.equal(feature._addMarkedWatchedVideo(VIDEO_A), true);
    assert.deepEqual(harness.getStored(), [VIDEO_C, VIDEO_A]);
    assert.equal(feature._addMarkedWatchedVideo(VIDEO_C), true);
    assert.deepEqual(harness.getStored(), [VIDEO_A, VIDEO_C]);
    assert.equal(feature._isVideoMarkedWatched(VIDEO_C), true);
    assert.equal(feature._addMarkedWatchedVideo('invalid'), false);
});

test('mark and unmark actions expose an Undo toast that reverses either direction', () => {
    const harness = createHarness();
    const { feature, toasts } = harness;
    const element = fakeCard();

    assert.equal(feature._markWatchedVideo(VIDEO_A, element), true);
    assert.deepEqual(harness.getStored(), [VIDEO_A]);
    assert.equal(toasts.at(-1).message, 'Marked as watched');
    assert.equal(toasts.at(-1).options.actions[0].text, 'Undo');
    toasts.at(-1).options.actions[0].onClick();
    assert.deepEqual(harness.getStored(), []);

    assert.equal(feature._addMarkedWatchedVideo(VIDEO_A), true);
    assert.equal(feature._unmarkWatchedVideo(VIDEO_A, element), true);
    assert.deepEqual(harness.getStored(), []);
    assert.equal(toasts.at(-1).message, 'Watched mark removed');
    toasts.at(-1).options.actions[0].onClick();
    assert.deepEqual(harness.getStored(), [VIDEO_A]);
});

test('marked cards dim by default and follow Remove hidden cards when enabled', () => {
    const dimHarness = createHarness({
        settings: { markWatchedVideos: true, hideVideosRemoveHiddenCards: false }
    });
    isolateFiltering(dimHarness.feature);
    dimHarness.feature._setMarkedWatchedVideos([VIDEO_A]);
    const dimCard = fakeCard();
    dimHarness.feature._processVideoElement(dimCard);
    assert.equal(dimCard.hiddenState, false);
    assert.equal(dimCard.classList.contains('ytkit-video-marked-watched'), true);

    const hiddenHarness = createHarness({
        settings: { markWatchedVideos: true, hideVideosRemoveHiddenCards: true }
    });
    isolateFiltering(hiddenHarness.feature);
    hiddenHarness.feature._setMarkedWatchedVideos([VIDEO_A]);
    const hiddenCard = fakeCard();
    hiddenHarness.feature._processVideoElement(hiddenCard);
    assert.equal(hiddenCard.hiddenState, true);
    assert.equal(hiddenCard.dataset.ytkitFilterReason, 'marked-watched');
    assert.equal(hiddenCard.classList.contains('ytkit-video-marked-watched'), true);
});

test('turning the setting off removes the visual marker even when the store remains', () => {
    const harness = createHarness({ settings: { markWatchedVideos: false } });
    isolateFiltering(harness.feature);
    harness.feature._setMarkedWatchedVideos([VIDEO_A]);
    const card = fakeCard();
    harness.feature._processVideoElement(card);
    assert.equal(card.classList.contains('ytkit-video-marked-watched'), false);
    assert.equal(card.dataset.ytkitMarkedWatched, undefined);
    assert.deepEqual(harness.getStored(), [VIDEO_A]);
});
