'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const playerCoreSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'core', 'player.js'), 'utf8'
);

function loadPlayerCore() {
    const context = {
        console,
        globalThis: null,
        setTimeout() { return 0; },
        clearTimeout() {}
    };
    context.globalThis = context;
    vm.runInNewContext(playerCoreSource, context, { filename: 'extension/core/player.js' });
    return context.YTKitCore;
}

function createFakeEnv() {
    const docListeners = new Map();
    const winListeners = new Map();
    const timers = new Map();
    let nextTimerId = 1;
    const state = {
        video: null,
        player: null
    };
    const video = {
        classList: {
            contains(name) { return name === 'html5-main-video'; }
        }
    };
    const player = { id: 'movie_player' };

    function addListener(map, type, handler) {
        const list = map.get(type) || [];
        list.push(handler);
        map.set(type, list);
    }

    function removeListener(map, type, handler) {
        const list = map.get(type) || [];
        map.set(type, list.filter(fn => fn !== handler));
    }

    function dispatch(map, type, event = {}) {
        for (const handler of map.get(type) || []) handler({ type, ...event });
    }

    const document = {
        querySelector(selector) {
            if (selector === 'video.html5-main-video' || selector === '#movie_player video') return state.video;
            if (selector === '#movie_player') return state.player;
            return null;
        },
        getElementById(id) {
            return id === 'movie_player' ? state.player : null;
        },
        addEventListener(type, handler) { addListener(docListeners, type, handler); },
        removeEventListener(type, handler) { removeListener(docListeners, type, handler); }
    };
    const window = {
        addEventListener(type, handler) { addListener(winListeners, type, handler); },
        removeEventListener(type, handler) { removeListener(winListeners, type, handler); }
    };

    function setTimeoutFake(callback, delay) {
        const id = nextTimerId++;
        timers.set(id, { callback, delay });
        return id;
    }

    function clearTimeoutFake(id) {
        timers.delete(id);
    }

    function flushOne() {
        const first = timers.entries().next();
        assert.equal(first.done, false, 'expected a scheduled timer');
        const [id, timer] = first.value;
        timers.delete(id);
        timer.callback();
        return timer.delay;
    }

    return {
        document,
        window,
        state,
        video,
        player,
        timers,
        flushOne,
        setTimeoutFake,
        clearTimeoutFake,
        dispatchDocument(type, target = state.video) { dispatch(docListeners, type, { target }); },
        dispatchWindow(type) { dispatch(winListeners, type); }
    };
}

test('player task manager waits for video readiness before running a task', () => {
    const core = loadPlayerCore();
    const env = createFakeEnv();
    const calls = [];
    const manager = core.createPlayerTaskManager({
        document: env.document,
        window: env.window,
        setTimeout: env.setTimeoutFake,
        clearTimeout: env.clearTimeoutFake
    });

    manager.schedule('feature:persistentSpeed', (ctx) => {
        calls.push(ctx);
        return true;
    }, {
        owner: 'persistentSpeed',
        needsVideo: true,
        retryDelays: [0, 20],
        maxAttempts: 2
    });

    env.flushOne();
    assert.equal(calls.length, 0, 'task must not run before a video exists');
    env.state.video = env.video;
    env.flushOne();
    assert.equal(calls.length, 1, 'task should run once the retry sees a video');
    assert.equal(calls[0].video, env.video);
});

test('player task manager cancels stale retries across SPA navigation', () => {
    const core = loadPlayerCore();
    const env = createFakeEnv();
    const calls = [];
    const manager = core.createPlayerTaskManager({
        document: env.document,
        window: env.window,
        setTimeout: env.setTimeoutFake,
        clearTimeout: env.clearTimeoutFake
    });

    manager.schedule('main:autoMaxResolution', (ctx) => {
        calls.push(ctx.reason);
        return true;
    }, {
        owner: 'ytkit-main',
        needsVideo: true,
        events: ['navigate'],
        retryDelays: [0, 20],
        maxAttempts: 2
    });

    assert.equal(env.timers.size, 1);
    env.dispatchWindow('yt-navigate-start');
    assert.equal(env.timers.size, 0, 'pending pre-navigation retry must be cancelled');
    env.state.video = env.video;
    env.dispatchWindow('yt-navigate-finish');
    env.flushOne();
    assert.deepEqual(calls, ['navigate']);
    manager.destroy();
});

test('player task manager reapplies registered tasks on media and player-state events', () => {
    const core = loadPlayerCore();
    const env = createFakeEnv();
    env.state.video = env.video;
    env.state.player = env.player;
    const calls = [];
    const manager = core.createPlayerTaskManager({
        document: env.document,
        window: env.window,
        setTimeout: env.setTimeoutFake,
        clearTimeout: env.clearTimeoutFake
    });

    manager.schedule('initial-player-state', (ctx) => {
        calls.push(ctx.reason);
        return true;
    }, {
        needsVideo: true,
        needsPlayer: true,
        events: ['loadedmetadata', 'player-state']
    });
    env.flushOne();
    env.dispatchDocument('loadedmetadata', env.video);
    env.flushOne();
    env.dispatchWindow('yt-player-state-change');
    env.flushOne();

    assert.deepEqual(calls, ['manual', 'loadedmetadata', 'player-state']);
    manager.destroy();
});

test('video frame sampler follows requestVideoFrameCallback and rebinds on stop', () => {
    const core = loadPlayerCore();
    const pending = new Map();
    let nextId = 0;
    let frameCalls = 0;
    const video = {
        requestVideoFrameCallback(callback) {
            const id = ++nextId;
            pending.set(id, callback);
            return id;
        },
        cancelVideoFrameCallback(id) {
            pending.delete(id);
        }
    };
    const sampler = core.createVideoFrameSampler({
        getVideo: () => video,
        now: () => 0,
        onFrame: () => { frameCalls += 1; }
    });

    assert.equal(sampler.start(), true);
    assert.equal(pending.size, 1);
    const first = pending.values().next().value;
    pending.clear();
    first(0, { presentedFrames: 1 });
    assert.equal(frameCalls, 1);
    assert.equal(pending.size, 1, 'a successful frame must schedule the next frame');
    sampler.stop();
    assert.equal(pending.size, 0, 'stop must cancel the pending frame callback');
    assert.equal(sampler.isRunning(), false);
});

test('video frame sampler fails closed after three consecutive over-budget callbacks', () => {
    const core = loadPlayerCore();
    const pending = new Map();
    let nextId = 0;
    let clock = 0;
    let budgetFailures = 0;
    const video = {
        requestVideoFrameCallback(callback) {
            const id = ++nextId;
            pending.set(id, callback);
            return id;
        },
        cancelVideoFrameCallback(id) {
            pending.delete(id);
        }
    };
    const sampler = core.createVideoFrameSampler({
        getVideo: () => video,
        budgetMs: 1,
        now: () => clock,
        onFrame: () => { clock += 2; },
        onBudgetExceeded: () => { budgetFailures += 1; }
    });
    const deliver = () => {
        const callback = pending.values().next().value;
        pending.clear();
        callback(0, {});
    };

    sampler.start();
    deliver();
    deliver();
    deliver();
    assert.equal(budgetFailures, 1);
    assert.equal(sampler.isRunning(), false);
    assert.equal(pending.size, 0);
});

test('volume curve maps slider positions through dB space and round-trips', () => {
    const core = loadPlayerCore();
    const { sliderToGain, gainToSlider } = core.volumeCurve;

    assert.equal(sliderToGain(0), 0);
    assert.equal(sliderToGain(1), 1);
    assert.ok(sliderToGain(0.5) < 0.5, 'midpoint should be quieter than linear gain');
    for (const position of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        assert.ok(Math.abs(gainToSlider(sliderToGain(position)) - position) < 1e-9);
    }
});

test('volume curve preserves logical volume across native changes and disable', () => {
    const core = loadPlayerCore();
    const video = { volume: 0.5, muted: false };
    const player = {
        reported: null,
        setVolume(value) { this.reported = value; },
        unMute() { video.muted = false; }
    };
    const controller = core.createVolumeCurveController({
        getVideo: () => video,
        getPlayer: () => player
    });

    controller.setEnabled(true);
    assert.ok(Math.abs(video.volume - controller.sliderToGain(0.5)) < 1e-9);
    assert.equal(controller.readLogicalVolume(video), 0.5);
    assert.equal(controller.handleVolumeChange(video).internal, true);

    video.volume = 0.75;
    const changed = controller.handleVolumeChange(video);
    assert.equal(changed.remapped, true);
    assert.equal(controller.readLogicalVolume(video), 0.75);
    assert.ok(Math.abs(video.volume - controller.sliderToGain(0.75)) < 1e-9);
    assert.equal(player.reported, Math.round(controller.sliderToGain(0.75) * 100));

    controller.setEnabled(false);
    assert.ok(Math.abs(video.volume - 0.75) < 1e-9);
    assert.equal(controller.readLogicalVolume(video), 0.75);
});
