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
