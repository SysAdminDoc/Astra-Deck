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

test('player task manager can leave YouTube\'s navigate events to its caller', () => {
    const core = loadPlayerCore();
    const env = createFakeEnv();
    env.state.video = env.video;
    const calls = [];
    const manager = core.createPlayerTaskManager({
        document: env.document,
        window: env.window,
        setTimeout: env.setTimeoutFake,
        clearTimeout: env.clearTimeoutFake,
        youtubeNavigation: false
    });

    manager.schedule('main:photosensitive', (ctx) => {
        calls.push(ctx.reason);
        return true;
    }, { events: ['navigate', 'page-data', 'player-state'] });

    env.dispatchWindow('yt-navigate-start');
    assert.equal(env.timers.size, 1, 'a page-dispatched yt-navigate-start must not cancel the pending task');
    env.flushOne();
    for (const type of ['yt-navigate-finish', 'yt-page-data-updated']) env.dispatchWindow(type);
    assert.equal(env.timers.size, 0, 'nor are the other two navigate events a navigation');
    env.dispatchWindow('yt-player-updated');
    env.flushOne();
    manager.bumpRoute('navigate');
    env.flushOne();
    assert.deepEqual(calls, ['manual', 'player-state', 'navigate']);
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

function createFakeFrameSource() {
    const pending = new Map();
    let nextId = 0;
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
    const deliver = () => {
        const callback = pending.values().next().value;
        pending.clear();
        callback(0, {});
    };
    return { pending, video, deliver };
}

test('video frame sampler fails closed once a window of samples costs more than its budget', () => {
    const core = loadPlayerCore();
    const source = createFakeFrameSource();
    let clock = 0;
    let budgetFailures = 0;
    let reported = null;
    const sampler = core.createVideoFrameSampler({
        getVideo: () => source.video,
        budgetMs: 1,
        now: () => clock,
        onFrame: () => { clock += 2; },
        onBudgetExceeded: (duration) => { budgetFailures += 1; reported = duration; }
    });
    // Frames arrive 33 ms apart, past the sampler's 25 ms spacing. Thirty
    // samples may cost 30 ms in all at a 1 ms budget; at 2 ms each, the
    // 16th sample takes the window past that.
    const deliver = () => { clock += 33; source.deliver(); };

    sampler.start();
    for (let i = 0; i < 15; i += 1) deliver();
    assert.equal(budgetFailures, 0, 'a window still inside its total keeps sampling');
    deliver();
    assert.equal(budgetFailures, 1);
    // The failure notice quotes this number. It used to be read after stop()
    // had cleared it, so every notice said 0.00ms.
    assert.equal(reported, 2, 'the handler gets the mean sample time of the window');
    assert.equal(sampler.isRunning(), false);
    assert.equal(source.pending.size, 0);
});

test('video frame sampler rides out a short burst of slow samples', () => {
    // Live 4K60 playback on 2026-10-06 had three samples over 8 ms in a row
    // within 45 seconds while the mean stayed near 3.5 ms. A rule that
    // tripped on that switched the guard off for the rest of the video.
    const core = loadPlayerCore();
    const source = createFakeFrameSource();
    const costs = [...Array(10).fill(3), 20, 20, 20, ...Array(30).fill(3)];
    let clock = 0;
    let budgetFailures = 0;
    const sampler = core.createVideoFrameSampler({
        getVideo: () => source.video,
        now: () => clock,
        onFrame: () => { clock += costs.shift(); },
        onBudgetExceeded: () => { budgetFailures += 1; }
    });

    sampler.start();
    while (costs.length) {
        clock += 33;
        source.deliver();
    }
    assert.equal(budgetFailures, 0);
    assert.equal(sampler.isRunning(), true);
});

test('video frame sampler spaces samples 25 ms apart and skipped frames do not water down the window', () => {
    const core = loadPlayerCore();
    const source = createFakeFrameSource();
    let clock = 0;
    let samples = 0;
    let budgetFailures = 0;
    const sampler = core.createVideoFrameSampler({
        getVideo: () => source.video,
        now: () => clock,
        // Every real sample costs 10 ms against the default 8 ms budget.
        onFrame: () => { samples += 1; clock += 10; },
        onBudgetExceeded: () => { budgetFailures += 1; }
    });
    // 60 fps: a frame every 16.7 ms, so every other frame is sampled.
    let frame = 0;
    const deliverNext = () => {
        clock = frame * 16.7;
        frame += 1;
        source.deliver();
    };

    sampler.start();
    for (let i = 0; i < 48; i += 1) deliverNext();
    assert.equal(samples, 24, 'every other 60 fps frame is sampled');
    assert.equal(sampler.getRecentSampleCount(), 24, 'skipped frames are not samples');
    assert.equal(budgetFailures, 0, '24 samples at 10 ms are 240 ms, exactly the window total');
    assert.equal(source.pending.size, 1, 'a skipped frame still asks for the next one');
    // If skipped frames counted as free samples, thirty of them would hold
    // only fifteen real ones (150 ms) and the sampler would never switch off.
    deliverNext();
    assert.equal(samples, 25);
    assert.equal(budgetFailures, 1);
    assert.equal(sampler.isRunning(), false);
});

function createFakeReadback(pixelsFor) {
    const bitmaps = [];
    const closed = [];
    const drawn = [];
    const context = {
        source: null,
        drawImage(source) { this.source = source; drawn.push(source); },
        getImageData() { return { data: pixelsFor(this.source) }; }
    };
    const document = {
        createElement: () => ({ width: 0, height: 0, getContext: () => context })
    };
    const window = {
        createImageBitmap(video, options) {
            let resolve;
            let reject;
            const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
            // Spread copies the options out of the vm realm for deepEqual.
            const bitmap = { video, options: { ...options }, close() { closed.push(bitmap); } };
            bitmaps.push({ bitmap, resolve: () => resolve(bitmap), reject });
            return promise;
        }
    };
    return { bitmaps, closed, drawn, document, window };
}

const WHITE = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255];
const BLACK = [0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255];

test('frame luminance reader reads a 2x2 bitmap one sample later, one bitmap in flight', async () => {
    const core = loadPlayerCore();
    const fake = createFakeReadback((source) => (source.video === 'white-frame' ? WHITE : BLACK));
    const reader = core.createFrameLuminanceReader({ document: fake.document, window: fake.window });

    assert.equal(reader.read('white-frame'), null, 'the first sample has nothing to read yet');
    assert.equal(fake.bitmaps.length, 1);
    assert.deepEqual(fake.bitmaps[0].bitmap.options, { resizeWidth: 2, resizeHeight: 2, resizeQuality: 'low' });
    assert.equal(reader.read('white-frame'), null);
    assert.equal(fake.bitmaps.length, 1, 'a second bitmap must wait for the first');

    fake.bitmaps[0].resolve();
    await Promise.resolve();
    assert.ok(Math.abs(reader.read('black-frame') - 1) < 1e-12, 'reads the white bitmap asked for earlier');
    assert.deepEqual(fake.closed, [fake.bitmaps[0].bitmap], 'a read bitmap is closed');
    assert.equal(fake.bitmaps.length, 2);
    assert.equal(fake.drawn.includes('white-frame'), false, 'the video itself is never drawn');

    fake.bitmaps[1].resolve();
    await Promise.resolve();
    assert.equal(reader.read('black-frame'), 0);
});

test('frame luminance reader drops late bitmaps after reset and only reports real failures', async () => {
    const core = loadPlayerCore();
    const errors = [];
    const fake = createFakeReadback(() => WHITE);
    const reader = core.createFrameLuminanceReader({
        document: fake.document,
        window: fake.window,
        onError: (error) => errors.push(error)
    });

    reader.read('a');
    reader.reset();
    fake.bitmaps[0].resolve();
    await Promise.resolve();
    assert.deepEqual(fake.closed, [fake.bitmaps[0].bitmap], 'a bitmap for the old video is closed unread');
    assert.equal(reader.read('b'), null, 'nothing from before the reset is read');

    const gone = new Error('frame gone');
    gone.name = 'InvalidStateError';
    fake.bitmaps[1].reject(gone);
    await Promise.resolve();
    assert.deepEqual(errors, [], 'a frame that went away is not a failure');
    reader.read('b');
    assert.equal(fake.bitmaps.length, 3, 'the next sample asks again');

    const broken = new Error('decoder lost');
    fake.bitmaps[2].reject(broken);
    await Promise.resolve();
    assert.deepEqual(errors, [broken]);
});

test('frame luminance reader draws the video directly without createImageBitmap', () => {
    const core = loadPlayerCore();
    const fake = createFakeReadback(() => WHITE);
    const reader = core.createFrameLuminanceReader({ document: fake.document, window: {} });
    assert.ok(Math.abs(reader.read('frame') - 1) < 1e-12);
    assert.deepEqual(fake.drawn, ['frame']);
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
