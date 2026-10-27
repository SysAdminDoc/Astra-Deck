'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFeature, fakeDocument, fakeNode } = require('../helpers/monolith');

const repoRoot = path.join(__dirname, '..', '..');
const playerSource = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'player.js'), 'utf8');
const VIDEO_ID = 'abc12345678';
const STATE_ATTR = 'data-ytkit-live-edge-state';

function loadPlayerCore() {
    const context = {
        console,
        globalThis: null,
        setTimeout() { return 0; },
        clearTimeout() {}
    };
    context.globalThis = context;
    vm.runInNewContext(playerSource, context, { filename: 'extension/core/player.js' });
    return context.YTKitCore;
}

const core = loadPlayerCore();

/** What the watch player's MAIN-world API answers, shaped like the 2026-10-26 live stream. */
function livePlayer({ isLive = true, current = 565638, seekableEnd = 565700, atHead = false, ingestionTime = 1793070147 } = {}) {
    return {
        getVideoData: () => ({ video_id: VIDEO_ID, isLive }),
        getProgressState: () => ({
            current, seekableEnd, isAtLiveHead: atHead, ingestionTime,
            duration: 569230, seekableStart: 522450, offset: 518840
        })
    };
}

function liveVideo({ buffer = 12, playbackRate = 1 } = {}) {
    return {
        currentTime: 100,
        duration: 50390,
        playbackRate,
        buffered: { length: 1, start: () => 95, end: () => 100 + buffer },
        addEventListener() {},
        removeEventListener() {}
    };
}

/** Publish what ytkit-main.js would for this player, the way it does. */
function publish(document, player, nowMs = Date.now()) {
    const text = core.formatLiveEdgeState(core.readLiveEdgeState(player, nowMs / 1000), nowMs);
    if (text) document.documentElement.setAttribute(STATE_ATTR, text);
    else document.documentElement.removeAttribute(STATE_ATTR);
}

function loadLiveFeature(video, writes, { ad = false } = {}) {
    const document = fakeDocument(() => []);
    const timers = [];
    const feature = loadFeature('liveLatencyCatchup', {
        document,
        setTimeout: (fn, ms) => timers.push({ fn, ms, cleared: false }),
        clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
        appState: {
            settings: {
                liveLatencyTargetSeconds: 8,
                liveLatencyMaxRate: 1.25
            }
        },
        getMainVideoElement: () => video,
        getVideoId: () => VIDEO_ID,
        getLivePlaybackMetrics: core.getLivePlaybackMetrics,
        parseLiveEdgeState: core.parseLiveEdgeState,
        isAdShowingIn: () => ad,
        isProgrammaticPlaybackRateChange: () => false,
        setProgrammaticPlaybackRate: (current, rate) => {
            writes.push(rate);
            current.playbackRate = rate;
        }
    });
    feature._videoRef = video;
    feature._readout = fakeNode();
    const pending = () => timers.filter(timer => !timer.cleared);
    return { feature, document, pending };
}

test('player core reports contiguous buffered-ahead time', () => {
    const video = {
        currentTime: 100,
        seekable: { length: 1, end: () => 124 },
        buffered: { length: 2, start: (index) => (index === 0 ? 80 : 100), end: (index) => (index === 0 ? 90 : 112) }
    };

    const metrics = core.getLivePlaybackMetrics(video);
    assert.equal(metrics.bufferSeconds, 12);
    assert.equal(core.getLivePlaybackMetrics({ currentTime: 100 }), null,
        'a non-media element must not fabricate a timing readout');
});

test('player core reads the live edge from the player, not the <video>', () => {
    const behind = core.readLiveEdgeState(livePlayer(), 1793070225);
    assert.equal(behind.videoId, VIDEO_ID);
    assert.equal(behind.atHead, false);
    assert.equal(behind.behindSeconds, 62);
    assert.equal(behind.latencySeconds, 78);

    const head = core.readLiveEdgeState(livePlayer({ current: 565700, atHead: true }), 1793070225);
    assert.equal(head.atHead, true);
    assert.equal(head.behindSeconds, 0);

    assert.equal(core.readLiveEdgeState(livePlayer({ isLive: false }), 1), null, 'a VOD has no live edge');
    assert.equal(core.readLiveEdgeState({}, 1), null, 'no player API, no state');
    assert.equal(core.readLiveEdgeState({ getVideoData: () => ({ isLive: true }), getProgressState() { throw new Error('torn down'); } }, 1), null);
});

test('the published live-edge state round-trips and refuses anything off', () => {
    const now = 1793070225000;
    const text = core.formatLiveEdgeState(core.readLiveEdgeState(livePlayer(), now / 1000), now);
    const state = core.parseLiveEdgeState(text, { videoId: VIDEO_ID, nowMs: now + 500 });
    assert.equal(state.behindSeconds, 62);
    assert.equal(state.atHead, false);
    assert.equal(state.latencySeconds, 78);

    assert.equal(core.parseLiveEdgeState(text, { videoId: 'zzzzzzzzzzz', nowMs: now }), null, 'another video');
    assert.equal(core.parseLiveEdgeState(text, { videoId: VIDEO_ID, nowMs: now + 3500 }), null, 'a stale state');
    for (const forged of [
        `v1|${VIDEO_ID}|0|-5|1|${now}`,
        `v1|${VIDEO_ID}|0|999999|1|${now}`,
        `v1|${VIDEO_ID}|2|5|1|${now}`,
        `v1|${VIDEO_ID}|0|NaN|1|${now}`,
        `v2|${VIDEO_ID}|0|5|1|${now}`,
        `v1|${VIDEO_ID}|0|5|1`,
        null
    ]) {
        assert.equal(core.parseLiveEdgeState(forged, { videoId: VIDEO_ID, nowMs: now }), null, String(forged));
    }
});

test('live latency catch-up boosts within the configured bound and restores the base rate', () => {
    const writes = [];
    const video = liveVideo({ buffer: 12 });
    const { feature, document } = loadLiveFeature(video, writes);

    publish(document, livePlayer({ current: 565670, seekableEnd: 565700 }));
    feature._tick();
    assert.equal(writes.length, 1);
    assert.ok(writes[0] > 1, 'playing 30 s behind the edge should raise the rate');
    assert.ok(writes[0] <= 1.25, 'catch-up must honor the configured maximum');
    assert.match(feature._readout.textContent, /Live 30s · buffer 12s/);
    assert.equal(feature._readout.getAttribute('aria-label'), feature._readout.textContent,
        'the player-chrome readout must be announced accessibly');

    publish(document, livePlayer({ current: 565692, seekableEnd: 565700 }));
    feature._tick();
    assert.equal(writes.at(-1), 1, 'reaching the target must restore the saved base rate');
    assert.equal(feature._baseRate, null);
    assert.equal(feature._appliedRate, null);
});

test('live latency catch-up never pushes past the live head', () => {
    // The player's edge estimate trails while behind it, so the head can come
    // while the estimate still reads above the target. At the head, stop.
    const writes = [];
    const video = liveVideo();
    const { feature, document } = loadLiveFeature(video, writes);
    publish(document, livePlayer({ current: 565600, seekableEnd: 565700 }));
    feature._tick();
    assert.ok(video.playbackRate > 1);

    publish(document, livePlayer({ current: 565690, seekableEnd: 565700, atHead: true }));
    feature._tick();
    assert.equal(video.playbackRate, 1, 'the boost ends at the head');
    assert.match(feature._readout.textContent, /Live 10s/);
});

test('live latency catch-up stays off without a live state, for an ad, or on a stale one', () => {
    const writes = [];
    const video = liveVideo();
    const { feature, document } = loadLiveFeature(video, writes);

    // video.seekable a day past the edge used to read as a day behind.
    video.seekable = { length: 1, end: () => 50390 };
    feature._tick();
    assert.deepEqual(writes, [], 'no published state, no boost');
    assert.equal(feature._readout.hidden, true);

    publish(document, livePlayer({ current: 565600 }), Date.now() - 10000);
    feature._tick();
    assert.deepEqual(writes, [], 'a state from ten seconds ago does not count');

    const adWrites = [];
    const adRun = loadLiveFeature(liveVideo(), adWrites, { ad: true });
    publish(adRun.document, livePlayer({ current: 565600 }));
    adRun.feature._tick();
    assert.deepEqual(adWrites, [], 'an ad keeps its own rate');
    assert.equal(adRun.feature._readout.hidden, true);
});

test('a paused or stalled stream hides the readout and hands the rate back', () => {
    // No media events fire then, so nothing else would notice the state aging.
    const writes = [];
    const video = liveVideo();
    const { feature, document, pending } = loadLiveFeature(video, writes);
    publish(document, livePlayer({ current: 565670 }));
    feature._tick();
    feature._tick();
    assert.ok(video.playbackRate > 1);
    assert.equal(pending().length, 1, 'one re-check at a time');
    assert.ok(pending()[0].ms > 3000, 'set just past the state\'s freshness window');

    publish(document, livePlayer({ current: 565670 }), Date.now() - 3200);
    const [recheck] = pending();
    recheck.cleared = true;
    recheck.fn();
    assert.equal(feature._readout.hidden, true, 'a stale readout does not stay up');
    assert.equal(video.playbackRate, 1, 'and the boost ends with it');
    assert.equal(pending().length, 0, 'nothing more to wait for until playback moves');
});

test('live latency catch-up never slows a saved channel speed', () => {
    const writes = [];
    const video = liveVideo({ buffer: 15, playbackRate: 1.5 });
    const { feature, document } = loadLiveFeature(video, writes);

    publish(document, livePlayer({ current: 565655, seekableEnd: 565700 }));
    feature._tick();
    assert.deepEqual(writes, [], 'a saved rate above the catch-up ceiling must remain untouched');
    publish(document, livePlayer({ current: 565695, seekableEnd: 565700 }));
    feature._tick();
    assert.equal(video.playbackRate, 1.5);
});

test('live latency catch-up switches the MAIN-world reader on and off with itself', () => {
    const writes = [];
    const video = liveVideo();
    const { feature, document } = loadLiveFeature(video, writes);
    feature.init();
    assert.equal(document.documentElement.getAttribute('data-ytkit-live-edge'), 'on');

    publish(document, livePlayer({ current: 565670 }));
    feature._tick();
    assert.ok(feature._appliedRate != null);

    feature.destroy();
    assert.equal(document.documentElement.getAttribute('data-ytkit-live-edge'), null);
    assert.equal(document.documentElement.getAttribute(STATE_ATTR), null, 'its last state goes with it');
    assert.equal(feature._videoRef, null);
    assert.equal(writes.at(-1), 1, 'teardown must restore the pre-catch-up rate');
});
