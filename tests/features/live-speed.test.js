'use strict';

// A remembered speed stays off a live stream. A live stream plays at its edge,
// so a carried 2x runs straight into it and the stream stalls. These drive the
// real monolith code against a fake player whose LIVE badge shows or hides the
// way YouTube's does: visible on a live stream, hidden on a past one.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, loadDeclarations, fakeDocument, fakeNode } = require('../helpers/monolith');

const BADGE = '#movie_player .ytp-live-badge';

// One watch page. `live` shows the badge, `liveHead` marks it at the edge,
// `liveClass` is the old `ytp-live` player class, `payload` the hard-load
// player response.
function watchPage({ live = false, liveHead = false, liveClass = false, payload = null } = {}) {
    const page = { live, liveHead, liveClass, payload, styleThrows: false, owner: '@alpha', listeners: new Map() };
    const badge = fakeNode({ attributes: { class: 'ytp-live-badge' } });
    const player = fakeNode({ attributes: { class: 'html5-video-player ytp-live' } });
    const owner = () => Object.assign(fakeNode({ tag: 'a' }), { href: `https://www.youtube.com/${page.owner}` });
    page.document = fakeDocument((selector) => {
        if (selector === BADGE) {
            badge.classList.toggle('ytp-live-badge-is-livehead', page.liveHead);
            return badge;
        }
        if (selector === '#movie_player.ytp-live') return page.liveClass ? player : null;
        if (selector.includes('#owner a')) return page.owner ? owner() : null;
        return null;
    });
    page.document.addEventListener = (type, handler) => page.listeners.set(type, handler);
    page.document.removeEventListener = (type) => page.listeners.delete(type);
    const globals = {
        document: page.document,
        getComputedStyle: (node) => {
            if (page.styleThrows) throw new Error('detached');
            return { display: node === badge && page.live ? 'inline-flex' : 'none' };
        },
        _rw: { get ytInitialPlayerResponse() { return page.payload; } }
    };
    page.isLiveStreamPlaying = loadDeclarations(['isLiveStreamPlaying'], globals).isLiveStreamPlaying;
    return page;
}

function rateWriter(writes) {
    return (video, rate) => {
        writes.push(rate);
        video.playbackRate = rate;
    };
}

test('a live stream is told apart by its visible LIVE badge', () => {
    const page = watchPage();
    assert.equal(page.isLiveStreamPlaying(), false, 'a regular video has a hidden badge');

    page.live = true;
    assert.equal(page.isLiveStreamPlaying(), true, 'the watch player shows the badge only while live');

    page.live = false;
    page.liveClass = true;
    assert.equal(page.isLiveStreamPlaying(), true, 'the old player class still counts where it turns up');

    page.liveClass = false;
    page.styleThrows = true;
    page.payload = { videoDetails: { isLive: true } };
    assert.equal(page.isLiveStreamPlaying(), true, 'the hard-load payload answers before the badge renders');
    page.payload = { videoDetails: { isLive: false, isLiveContent: true } };
    assert.equal(page.isLiveStreamPlaying(), false, 'a past live stream is not live');
});

function persistentSpeed(page, video, writes, speed = '2') {
    return loadFeature('persistentSpeed', {
        document: page.document,
        appState: { settings: { persistentSpeedValue: speed } },
        getMainVideoElement: () => video,
        isLiveStreamPlaying: page.isLiveStreamPlaying,
        setProgrammaticPlaybackRate: rateWriter(writes)
    });
}

test('Persistent Speed leaves a live stream at 1x and picks up again on the next video', () => {
    const page = watchPage({ live: true });
    const video = { playbackRate: 1 };
    const writes = [];
    const feature = persistentSpeed(page, video, writes);

    assert.equal(feature._apply({ reason: 'loadedmetadata' }), true, 'a live stream settles the task');
    assert.equal(video.playbackRate, 1);
    assert.equal(feature._applied, false, 'a live stream never latches the apply');

    // An in-app move to a regular video reuses the same element.
    page.live = false;
    feature._apply({ reason: 'loadedmetadata' });
    assert.equal(video.playbackRate, 2, 'the remembered speed applies to the next regular video');
    assert.deepEqual(writes, []);
});

test('Persistent Speed takes back a speed it applied before the stream showed as live', () => {
    // A move applies on `navigate`, while the player still shows the last video.
    const page = watchPage();
    const video = { playbackRate: 1 };
    const writes = [];
    const feature = persistentSpeed(page, video, writes);
    feature._apply({ reason: 'navigate' });
    assert.equal(video.playbackRate, 2);

    page.live = true;
    feature._apply({ reason: 'loadedmetadata' });
    assert.deepEqual(writes, [1], 'the carried speed goes back to 1x through a tagged write');

    // The user then speeds the stream up on purpose. That is theirs to keep.
    video.playbackRate = 1.5;
    feature._apply({ reason: 'playing' });
    assert.deepEqual(writes, [1]);
    assert.equal(video.playbackRate, 1.5);
});

test('Persistent Speed keeps a speed the user changed before the stream showed as live', () => {
    const page = watchPage();
    const video = { playbackRate: 1 };
    const writes = [];
    const feature = persistentSpeed(page, video, writes);
    feature._apply({ reason: 'navigate' });
    video.playbackRate = 1.25;

    page.live = true;
    feature._apply({ reason: 'loadedmetadata' });
    assert.deepEqual(writes, []);
    assert.equal(video.playbackRate, 1.25);
});

test('a Player Dock speed pick holds on a live stream', () => {
    const page = watchPage();
    const video = { playbackRate: 1 };
    const writes = [];
    const feature = persistentSpeed(page, video, writes);
    feature._apply({ reason: 'navigate' });

    // The dock writes the element itself, then schedules an apply.
    page.live = true;
    video.playbackRate = 2;
    feature._apply({ reason: 'player-dock' });
    feature._apply({ reason: 'playing' });
    assert.deepEqual(writes, [], 'a speed picked in the dock is the user\'s choice');
    assert.equal(video.playbackRate, 2);
});

function perChannelSpeed(page, video, writes, store) {
    const tasks = [];
    const navRules = new Map();
    const feature = loadFeature('perChannelSpeed', {
        document: page.document,
        getMainVideoElement: () => video,
        isLiveStreamPlaying: page.isLiveStreamPlaying,
        isProgrammaticPlaybackRateChange: () => false,
        setProgrammaticPlaybackRate: rateWriter(writes),
        schedulePlayerTask: (_id, run) => tasks.push(run),
        cancelPlayerTask() {},
        addNavigateRule: (id, rule) => navRules.set(id, rule),
        removeNavigateRule: (id) => navRules.delete(id),
        StorageManager: {
            get: (key, fallback) => (store[key] ? { ...store[key] } : fallback),
            set: (key, value) => { store[key] = { ...value }; }
        }
    });
    feature.init();
    return { feature, runTask: () => tasks.at(-1)(), navigate: () => navRules.get('channelSpeed')() };
}

test('Per-Channel Speed does not apply, re-apply or save on a live stream', () => {
    const page = watchPage({ live: true });
    const video = { playbackRate: 1 };
    const writes = [];
    const store = { 'ytkit-channel-speeds': { '@alpha': 2 } };
    const { runTask, navigate } = perChannelSpeed(page, video, writes, store);
    const ratechange = page.listeners.get('ratechange');

    runTask();
    assert.equal(video.playbackRate, 1, 'the channel\'s speed stays off its live stream');

    // YouTube re-asserting 1x untagged used to be answered with the saved speed.
    ratechange();
    assert.deepEqual(writes, []);

    // A speed the user picks on the stream is not saved as the channel's.
    video.playbackRate = 1.5;
    ratechange();
    video.playbackRate = 1;
    navigate();
    assert.deepEqual(store['ytkit-channel-speeds'], { '@alpha': 2 },
        'leaving the stream at 1x must not delete the speed kept for the channel\'s videos');

    page.live = false;
    runTask();
    assert.equal(video.playbackRate, 2, 'the next regular video from the channel gets its speed');
});

test('Per-Channel Speed keeps the saved speed when a move leaves a live stream before the first apply', () => {
    // The data loss seen live: the navigate rule ran before any apply had
    // flagged the stream, and saved its 1x over the channel's speed.
    const page = watchPage({ live: true });
    const video = { playbackRate: 1 };
    const store = { 'ytkit-channel-speeds': { '@alpha': 2 } };
    const { navigate } = perChannelSpeed(page, video, [], store);
    navigate();
    assert.deepEqual(store['ytkit-channel-speeds'], { '@alpha': 2 });
});

test('Per-Channel Speed takes back a speed it applied before the stream showed as live', () => {
    const page = watchPage();
    const video = { playbackRate: 1 };
    const writes = [];
    const store = { 'ytkit-channel-speeds': { '@alpha': 2 } };
    const { runTask } = perChannelSpeed(page, video, writes, store);
    runTask();
    assert.deepEqual(writes, [2]);

    page.live = true;
    runTask();
    assert.deepEqual(writes, [2, 1]);

    video.playbackRate = 1.25;
    runTask();
    assert.deepEqual(writes, [2, 1], 'a speed the user picks afterwards is left alone');
});

test('Live Catch-Up Speed Reset finds the edge from the badge, not from seekable', () => {
    // `seekable` ends at the media source's duration, days past the edge, so
    // the latency it gives never drops under the reset threshold.
    const page = watchPage({ live: true, liveHead: true });
    const video = {
        currentTime: 46810,
        playbackRate: 2,
        seekable: { length: 1, end: () => 46810 + 86400 },
        addEventListener() {},
        removeEventListener() {}
    };
    const writes = [];
    const toasts = [];
    const feature = loadFeature('liveSpeedReset', {
        document: page.document,
        getMainVideoElement: () => video,
        getFeatureById: () => null,
        isLiveStreamPlaying: page.isLiveStreamPlaying,
        setProgrammaticPlaybackRate: rateWriter(writes),
        showToast: (message) => toasts.push(message)
    });
    feature.init();

    feature._tick();
    assert.deepEqual(writes, [1], 'reaching the edge above 1x resets to 1x');
    assert.equal(toasts.length, 1);
    feature._tick();
    assert.deepEqual(writes, [1], 'the reset happens once');

    // The user seeks back behind the edge: their speed comes back.
    page.liveHead = false;
    feature._tick();
    assert.deepEqual(writes, [1, 2]);

    // Behind the edge at 2x, nothing resets.
    feature._tick();
    assert.deepEqual(writes, [1, 2]);
    feature.destroy();
});
