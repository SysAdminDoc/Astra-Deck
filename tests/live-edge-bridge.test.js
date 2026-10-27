'use strict';

// The MAIN-world half of Live Latency Catch-up, driven against the real
// `ytkit-main.js` and `core/player.js`. The isolated feature can't call the
// player's methods, so this half reads the player's progress state and
// publishes it on `<html>` while the feature has switched it on.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { installBridgeChannel } = require('./helpers/main-bridge');

const repoRoot = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(repoRoot, 'extension', file), 'utf8');
const mainSource = read('ytkit-main.js');
const guardSource = read('core/injection-guard.js');
const playerSource = read('core/player.js');

const ENABLE_ATTR = 'data-ytkit-live-edge';
const STATE_ATTR = 'data-ytkit-live-edge-state';
const VIDEO_ID = 'abc12345678';

function mainWorld() {
    const attributes = new Map();
    const observers = new Set();
    const windowListeners = new Map();
    const documentListeners = new Map();
    const fire = (name) => {
        for (const observer of [...observers]) {
            if (observer.active) observer.callback([{ type: 'attributes', attributeName: name }]);
        }
    };
    const documentElement = {
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute(name, value) { attributes.set(name, String(value)); fire(name); },
        removeAttribute(name) { if (attributes.delete(name)) fire(name); },
        classList: { add() {}, remove() {}, contains() { return false; } },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    };
    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.active = false; observers.add(this); }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    }
    const addListener = (registry, type, callback) => {
        if (!registry.has(type)) registry.set(type, []);
        registry.get(type).push(callback);
    };

    const clock = { ms: 1793070225000 };
    class FakeDate extends Date {
        static now() { return clock.ms; }
    }
    const progress = { current: 565638, seekableEnd: 565700, isAtLiveHead: false, ingestionTime: 1793070147 };
    const player = {
        getVideoData: () => ({ video_id: VIDEO_ID, isLive: true }),
        getProgressState: () => ({ ...progress }),
    };

    const context = {
        MutationObserver: FakeMutationObserver,
        MediaSource: { isTypeSupported: () => true },
        HTMLVideoElement: function HTMLVideoElement() {},
        YTKitCore: {},
        document: {
            documentElement,
            readyState: 'complete',
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: (id) => (id === 'movie_player' ? player : null),
            addEventListener: (type, callback) => addListener(documentListeners, type, callback),
            removeEventListener() {},
        },
        location: { href: `https://www.youtube.com/watch?v=${VIDEO_ID}`, pathname: '/watch' },
        console, Promise, Math, Number, Set, Map, WeakMap, Infinity, Array, Object, String,
        Date: FakeDate,
        setTimeout(callback) { callback(); return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
    };
    context.HTMLVideoElement.prototype = { canPlayType() { return 'probably'; } };
    context.addEventListener = (type, callback) => addListener(windowListeners, type, callback);
    context.removeEventListener = () => {};
    context.dispatchEvent = () => true;
    context.window = context;
    context.self = context;
    context.globalThis = context;
    context.JSON = { parse: JSON.parse, stringify: JSON.stringify };
    vm.createContext(context);
    vm.runInContext(guardSource, context, { filename: 'extension/core/injection-guard.js' });
    const channel = installBridgeChannel(documentElement, context.YTKitCore,
        { windowListeners, documentListeners });
    vm.runInContext(playerSource, context, { filename: 'extension/core/player.js' });
    vm.runInContext(mainSource, context, { filename: 'extension/ytkit-main.js' });

    const mainVideo = { classList: { contains: (name) => name === 'html5-main-video' } };
    const otherVideo = { classList: { contains: () => false } };
    const timeupdate = (target = mainVideo) => {
        for (const callback of documentListeners.get('timeupdate') || []) callback({ type: 'timeupdate', target });
    };
    return {
        attributes, channel, clock, progress, timeupdate, otherVideo,
        state: () => attributes.get(STATE_ATTR) ?? null,
        parsed: () => context.YTKitCore.parseLiveEdgeState(attributes.get(STATE_ATTR),
            { videoId: VIDEO_ID, nowMs: clock.ms }),
    };
}

test('nothing is read or published until the feature switches it on', () => {
    const world = mainWorld();
    world.timeupdate();
    assert.equal(world.state(), null);
});

test('switching it on publishes the player\'s live edge at once', () => {
    const world = mainWorld();
    world.channel.publish(ENABLE_ATTR, 'on');
    const state = world.parsed();
    assert.ok(state, 'a state the isolated side accepts');
    assert.equal(state.behindSeconds, 62);
    assert.equal(state.latencySeconds, 78);
    assert.equal(state.atHead, false);
});

test('it follows the main video\'s timeupdate, at most once a second', () => {
    const world = mainWorld();
    world.channel.publish(ENABLE_ATTR, 'on');
    world.progress.current = 565690;
    world.clock.ms += 400;
    world.timeupdate();
    assert.equal(world.parsed().behindSeconds, 62, 'too soon after the last one');

    world.clock.ms += 700;
    world.timeupdate(world.otherVideo);
    assert.equal(world.parsed().behindSeconds, 62, 'a preview or ad video is not the watch player');

    world.timeupdate();
    assert.equal(world.parsed().behindSeconds, 10);
});

test('a page forging the switch does not turn the reader on', () => {
    const world = mainWorld();
    world.channel.forge(ENABLE_ATTR, 'on');
    world.timeupdate();
    assert.equal(world.state(), null);
});

test('switching it off withdraws the state and stops reading', () => {
    const world = mainWorld();
    world.channel.publish(ENABLE_ATTR, 'on');
    assert.ok(world.state());
    world.channel.clear(ENABLE_ATTR);
    assert.equal(world.state(), null);
    world.clock.ms += 5000;
    world.timeupdate();
    assert.equal(world.state(), null);
});
