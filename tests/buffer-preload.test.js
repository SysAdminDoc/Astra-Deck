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
    context.dispatchEvent = (event) => {
        emit(windowListeners, event.type, event);
        // The sealed navigate carries its reason in the detail; the old page
        // events carried it in the type.
        const taskEvent = event.detail && event.detail.reason
            ? event.detail.reason
            : event.type === 'yt-navigate-finish'
                ? 'navigate'
                : event.type === 'yt-page-data-updated' ? 'page-data' : event.type;
        for (const task of schedules.values()) {
            if (task.settings.events.includes(taskEvent)) {
                task.callback({
                    id: 'event',
                    reason: taskEvent,
                    video: currentVideo,
                    player
                });
            }
        }
        return true;
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;

    vm.createContext(context);
    // Seed the token before the bridge builds its reader. `channel` rather
    // than `bridge`, because the harness already returns something by that
    // name to the tests.
    const channel = installBridgeChannel(documentElement, context.YTKitCore);

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
            context.dispatchEvent(channel.navigate());
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
