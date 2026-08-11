'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFeature, fakeDocument, fakeNode } = require('../helpers/monolith');

const repoRoot = path.join(__dirname, '..', '..');
const playerSource = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'player.js'), 'utf8');

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

function liveVideo({ latency = 30, buffer = 12, playbackRate = 1 } = {}) {
    return {
        currentTime: 100,
        duration: Infinity,
        latency,
        buffer,
        playbackRate,
        addEventListener() {},
        removeEventListener() {}
    };
}

function loadLiveFeature(video, writes) {
    const livePlayer = fakeNode({ tag: 'div' });
    const document = fakeDocument((selector) => (
        selector === '#movie_player.ytp-live' ? livePlayer : []
    ));
    const feature = loadFeature('liveLatencyCatchup', {
        document,
        appState: {
            settings: {
                liveLatencyTargetSeconds: 8,
                liveLatencyMaxRate: 1.25
            }
        },
        getMainVideoElement: () => video,
        getLivePlaybackMetrics: (current) => ({
            latencySeconds: current.latency,
            bufferSeconds: current.buffer
        }),
        isProgrammaticPlaybackRateChange: () => false,
        setProgrammaticPlaybackRate: (current, rate) => {
            writes.push(rate);
            current.playbackRate = rate;
        }
    });
    feature._videoRef = video;
    feature._readout = fakeNode();
    return feature;
}

test('player core reports live-edge latency and contiguous buffered-ahead time', () => {
    const core = loadPlayerCore();
    const video = {
        currentTime: 100,
        seekable: { length: 1, end: () => 124 },
        buffered: { length: 2, start: (index) => (index === 0 ? 80 : 100), end: (index) => (index === 0 ? 90 : 112) }
    };

    const metrics = core.getLivePlaybackMetrics(video);
    assert.equal(metrics.latencySeconds, 24);
    assert.equal(metrics.bufferSeconds, 12);
    assert.equal(core.getLivePlaybackMetrics({ currentTime: 100 }), null,
        'a non-media element must not fabricate a timing readout');
});

test('live latency catch-up boosts within the configured bound and restores the base rate', () => {
    const writes = [];
    const video = liveVideo({ latency: 30, buffer: 12 });
    const feature = loadLiveFeature(video, writes);

    feature._tick();
    assert.equal(writes.length, 1);
    assert.ok(writes[0] > 1, 'latency above target should raise playback rate');
    assert.ok(writes[0] <= 1.25, 'catch-up must honor the configured maximum');
    assert.match(feature._readout.textContent, /Live 30s · buffer 12s/);
    assert.equal(feature._readout.getAttribute('aria-label'), feature._readout.textContent,
        'the player-chrome readout must be announced accessibly');

    video.latency = 8;
    feature._tick();
    assert.equal(writes.at(-1), 1, 'reaching the target must restore the saved base rate');
    assert.equal(feature._baseRate, null);
    assert.equal(feature._appliedRate, null);
});

test('live latency catch-up never slows a saved channel speed', () => {
    const writes = [];
    const video = liveVideo({ latency: 45, buffer: 15, playbackRate: 1.5 });
    const feature = loadLiveFeature(video, writes);

    feature._tick();
    assert.deepEqual(writes, [], 'a saved rate above the catch-up ceiling must remain untouched');
    video.latency = 8;
    feature._tick();
    assert.equal(video.playbackRate, 1.5);
});

test('disabling live latency catch-up tears down its listener state and restores speed', () => {
    const writes = [];
    const video = liveVideo({ latency: 30, buffer: 10 });
    const feature = loadLiveFeature(video, writes);
    feature._tick();
    assert.ok(feature._appliedRate != null);

    feature._detachVideo();
    assert.equal(feature._videoRef, null);
    assert.equal(writes.at(-1), 1, 'teardown must restore the pre-catch-up rate');
});
