'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installBridgeChannel } = require('./helpers/main-bridge');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'ytkit-main.js'),
    'utf8'
);

function bootstrapBufferBridge(options = {}) {
    const attributes = new Map();
    const observers = new Set();
    const documentListeners = new Map();
    const windowListeners = new Map();
    const schedules = new Map();
    const calls = [];
    const player = options.player || {
        getVideoData: () => ({ isLive: false }),
        setBufferingGoal: (seconds) => calls.push(seconds)
    };
    let currentVideo = options.video || { duration: 120 };

    function addListener(registry, type, callback) {
        if (!registry.has(type)) registry.set(type, []);
        registry.get(type).push(callback);
    }

    function emit(registry, type, event = { type }) {
        for (const callback of registry.get(type) || []) callback(event);
    }

    const documentElement = {
        getAttribute(name) {
            return attributes.has(name) ? attributes.get(name) : null;
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
            for (const observer of [...observers]) {
                if (observer.active) observer.callback([{ type: 'attributes', attributeName: name }]);
            }
        },
        removeAttribute(name) {
            const existed = attributes.delete(name);
            if (!existed) return;
            for (const observer of [...observers]) {
                if (observer.active) observer.callback([{ type: 'attributes', attributeName: name }]);
            }
        }
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.active = false;
            observers.add(this);
        }

        observe() { this.active = true; }
        disconnect() { this.active = false; }
    }

    const taskManager = {
        schedule(id, callback, settings) {
            const task = { callback, settings };
            schedules.set(id, task);
            callback({
                id,
                reason: settings.reason,
                video: currentVideo,
                player
            });
        },
        cancel(id) { schedules.delete(id); }
    };

    const context = {
        MutationObserver: FakeMutationObserver,
        HTMLVideoElement: function HTMLVideoElement() {},
        MediaSource: { isTypeSupported: () => true },
        YTKitCore: { playerTaskManager: taskManager },
        document: {
            documentElement,
            readyState: 'complete',
            querySelector(selector) {
                if (selector === '.html5-main-video') return currentVideo;
                if (selector === '.html5-video-player') return player;
                return null;
            },
            querySelectorAll() { return []; },
            getElementById(id) { return id === 'movie_player' ? player : null; },
            addEventListener(type, callback) { addListener(documentListeners, type, callback); },
            removeEventListener() {}
        },
        location: { href: 'https://www.youtube.com/watch?v=buffer-test', pathname: '/watch' },
        console,
        Promise,
        Math,
        Number,
        Set,
        Map,
        WeakMap,
        JSON,
        Date,
        Infinity,
        setTimeout(callback) { callback(); return 1; },
        clearTimeout() {}
    };
    context.HTMLVideoElement.prototype = { canPlayType() { return 'probably'; } };
    context.addEventListener = (type, callback) => addListener(windowListeners, type, callback);
    context.removeEventListener = () => {};
    // The player task manager is its own collaborator: it watches navigation
    // and fires the tasks the bridge registered with it. Keeping it separate
    // from event delivery matters, because the navigate event now travels the
    // path a browser would take it (document, then window if it bubbles) and
    // the harness must not quietly stand in for that.
    const fireTasks = (taskEvent) => {
        for (const task of schedules.values()) {
            if (task.settings.events.includes(taskEvent)) {
                task.callback({ id: 'event', reason: taskEvent, video: currentVideo, player });
            }
        }
    };

    context.dispatchEvent = (event) => {
        emit(windowListeners, event.type, event);
        const taskEvent = event.type === 'yt-navigate-finish'
            ? 'navigate'
            : event.type === 'yt-page-data-updated' ? 'page-data' : event.type;
        fireTasks(taskEvent);
        return true;
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;

    vm.createContext(context);
    // Seed the token before the bridge builds its reader. `channel` rather
    // than `bridge`, because the harness already returns something by that
    // name to the tests.
    const channel = installBridgeChannel(documentElement, context.YTKitCore,
        { windowListeners, documentListeners });

    vm.runInContext(source, context, { filename: 'extension/ytkit-main.js' });

    return {
        context,
        calls,
        player,
        channel,
        documentElement,
        setEnabled(enabled) {
            if (enabled) channel.publish('data-ytkit-buffer-preload', 'on');
            else channel.clear('data-ytkit-buffer-preload');
        },
        status() {
            return {
                status: documentElement.getAttribute('data-ytkit-buffer-status'),
                reason: documentElement.getAttribute('data-ytkit-buffer-reason')
            };
        },
        navigate(video) {
            currentVideo = video;
            // Both halves of a real navigation: the sealed event the bridge
            // listens for, and the player task manager firing its own tasks.
            const delivered = channel.navigate();
            fireTasks('navigate');
            return delivered;
        }
    };
}

test('buffer preload is off by default and applies the bounded VOD target when supported', () => {
    const bridge = bootstrapBufferBridge();

    assert.deepEqual(bridge.calls, []);
    assert.equal(bridge.status().status, null);

    bridge.setEnabled(true);

    assert.deepEqual(bridge.calls, [20]);
    assert.deepEqual(bridge.status(), { status: 'applied', reason: 'setBufferingGoal:20' });
});

test('buffer preload records a degradation reason when the player API is absent', () => {
    const bridge = bootstrapBufferBridge({
        player: { getVideoData: () => ({ isLive: false }) }
    });

    bridge.setEnabled(true);

    assert.deepEqual(bridge.calls, []);
    assert.deepEqual(bridge.status(), { status: 'degraded', reason: 'player-api-missing' });
});

test('buffer preload never calls the player for a live stream', () => {
    const bridge = bootstrapBufferBridge({
        player: {
            getVideoData: () => ({ isLive: true }),
            setBufferingGoal: (seconds) => bridgeCalls.push(seconds)
        }
    });
    const bridgeCalls = [];

    bridge.setEnabled(true);

    assert.deepEqual(bridge.calls, []);
    assert.deepEqual(bridge.status(), { status: 'skipped', reason: 'live-stream' });
    assert.deepEqual(bridgeCalls, []);
});

test('buffer preload reapplies once for the next VOD after SPA navigation', () => {
    const bridge = bootstrapBufferBridge();
    bridge.setEnabled(true);
    bridge.navigate({ duration: 240 });

    assert.deepEqual(bridge.calls, [20, 20]);
});

test('an unchanged status is not rewritten on every retry', () => {
    // `-status` and `-reason` are outputs: the bridge writes them for the
    // isolated world to read. It reads them back only to avoid rewriting an
    // unchanged value, and that read has to use the attribute — routing it
    // through the sealed channel (which nothing publishes these into) made
    // the guard always true, so the retry ladder rewrote the attribute six
    // times per video and woke both worlds' observers for nothing.
    const writes = [];
    const bridge = bootstrapBufferBridge();
    const element = bridge.documentElement;
    const nativeSet = element.setAttribute.bind(element);
    element.setAttribute = (name, value) => {
        // Only the two OUTPUTS. `-preload` is the input the harness publishes,
        // and republishing that is the test driving the feature, not the
        // feature rewriting itself.
        if (name === 'data-ytkit-buffer-status' || name === 'data-ytkit-buffer-reason') {
            writes.push(`${name}=${value}`);
        }
        return nativeSet(name, value);
    };

    bridge.setEnabled(true);
    const afterFirst = writes.length;
    assert.ok(afterFirst > 0, 'the first apply has to publish its status');

    // Same state again. Nothing about it changed, so nothing should be written.
    bridge.setEnabled(true);
    assert.deepEqual(writes.slice(afterFirst), [],
        'an unchanged status must not be written again');
});
