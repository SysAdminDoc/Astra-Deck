'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'ytkit-main.js'),
    'utf8'
);

function bootstrapAudioBridge() {
    const attributes = new Map();
    const observers = new Set();
    const documentListeners = new Map();
    const windowListeners = new Map();
    const pendingTimers = [];
    const audioContexts = [];
    let currentVideo = makeVideo('video-1');

    function addListener(registry, type, callback) {
        if (!registry.has(type)) registry.set(type, []);
        registry.get(type).push(callback);
    }

    function emit(registry, type, event = { type }) {
        for (const callback of registry.get(type) || []) callback(event);
    }

    function makeNode(kind) {
        return {
            kind,
            connections: [],
            disconnected: false,
            connect(target) {
                this.connections.push(target);
                this.disconnected = false;
                return target;
            },
            disconnect() {
                this.connections = [];
                this.disconnected = true;
            }
        };
    }

    function makeVideo(id) {
        return {
            id,
            classList: { contains: (name) => name === 'html5-main-video' },
            addEventListener() {},
            removeEventListener() {}
        };
    }

    class FakeAudioContext {
        constructor() {
            this.state = 'running';
            this.destination = makeNode('destination');
            this.sources = [];
            this.delays = [];
            audioContexts.push(this);
        }

        resume() { return Promise.resolve(); }

        createMediaElementSource(video) {
            const node = makeNode('source');
            node.video = video;
            this.sources.push(node);
            return node;
        }

        createGain() {
            const node = makeNode('gain');
            node.gain = { value: 1 };
            return node;
        }

        createDynamicsCompressor() {
            const node = makeNode('compressor');
            node.threshold = { value: 0 };
            node.knee = { value: 0 };
            node.ratio = { value: 1 };
            node.attack = { value: 0 };
            node.release = { value: 0 };
            return node;
        }

        createStereoPanner() {
            const node = makeNode('panner');
            node.pan = { value: 0 };
            return node;
        }

        createDelay(maxDelay) {
            const node = makeNode('delay');
            node.maxDelay = maxDelay;
            node.delayTime = { value: 0 };
            this.delays.push(node);
            return node;
        }
    }

    const documentElement = {
        getAttribute(name) {
            return attributes.has(name) ? attributes.get(name) : null;
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
            for (const observer of observers) {
                if (observer.active) observer.callback([{ type: 'attributes', attributeName: name }]);
            }
        },
        removeAttribute(name) {
            attributes.delete(name);
            for (const observer of observers) {
                if (observer.active) observer.callback([{ type: 'attributes', attributeName: name }]);
            }
        },
        classList: { add() {}, remove() {}, contains() {} },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } }
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

    const context = {
        AudioContext: FakeAudioContext,
        MutationObserver: FakeMutationObserver,
        HTMLVideoElement: function HTMLVideoElement() {},
        MediaSource: { isTypeSupported: () => true },
        YTKitCore: {
            audioTrackSelection: {
                ATTRS: { syncOffset: 'data-ytkit-audio-sync-offset' },
                normalizeAudioSyncOffset(value) {
                    const number = Number(value);
                    if (!Number.isFinite(number)) return 0;
                    return Math.max(-500, Math.min(500, Math.round(number)));
                }
            }
        },
        document: {
            documentElement,
            readyState: 'complete',
            querySelector(selector) {
                return selector === '.html5-main-video' ? currentVideo : null;
            },
            querySelectorAll() { return []; },
            getElementById() { return null; },
            addEventListener(type, callback) { addListener(documentListeners, type, callback); },
            removeEventListener() {},
            createElement() {
                return { style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} } };
            },
            head: { appendChild() {} },
            body: { appendChild() {} }
        },
        location: { href: 'https://www.youtube.com/watch?v=audio-sync', pathname: '/watch' },
        console,
        Promise,
        Math,
        Number,
        Set,
        Map,
        WeakMap,
        JSON,
        Date,
        queueMicrotask,
        setTimeout(callback) {
            pendingTimers.push(callback);
            return pendingTimers.length;
        },
        clearTimeout() {}
    };
    context.HTMLVideoElement.prototype = { canPlayType() { return 'probably'; } };
    context.addEventListener = (type, callback) => addListener(windowListeners, type, callback);
    context.removeEventListener = () => {};
    context.dispatchEvent = (event) => {
        emit(windowListeners, event.type, event);
        return true;
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/ytkit-main.js' });

    return {
        context,
        audioContexts,
        setOffset(value) {
            documentElement.setAttribute('data-ytkit-audio-sync-offset', String(value));
        },
        navigateTo(video) {
            currentVideo = video;
            context.dispatchEvent({ type: 'yt-navigate-finish' });
            while (pendingTimers.length) pendingTimers.shift()();
        }
    };
}

test('audio sync offset applies live and returns to a dry path at zero', () => {
    const bridge = bootstrapAudioBridge();

    bridge.setOffset(240);
    const audioContext = bridge.audioContexts[0];
    assert.ok(audioContext, 'positive offset should create the shared audio context');
    assert.equal(audioContext.sources.length, 1);
    assert.equal(audioContext.delays.length, 1);
    const delay = audioContext.delays[0];
    assert.equal(delay.delayTime.value, 0.24);

    bridge.setOffset(120);
    assert.equal(audioContext.sources.length, 1, 'live updates must not recreate the media source');
    assert.equal(delay.delayTime.value, 0.12);

    bridge.setOffset(0);
    assert.equal(delay.disconnected, true, 'zero must disconnect the added delay path');
    assert.equal(audioContext.sources[0].connections[0], audioContext.destination,
        'zero must restore source passthrough without added latency');
});

test('audio sync offset survives two SPA navigations without duplicate source creation', () => {
    const bridge = bootstrapAudioBridge();
    bridge.setOffset(180);
    const audioContext = bridge.audioContexts[0];

    bridge.navigateTo({ id: 'video-2', classList: { contains: (name) => name === 'html5-main-video' } });
    bridge.navigateTo({ id: 'video-3', classList: { contains: (name) => name === 'html5-main-video' } });

    assert.equal(audioContext.sources.length, 3, 'each new video gets one cached media source');
    assert.equal(audioContext.delays.length, 3, 'each navigation gets one processing chain');
    assert.equal(audioContext.delays[2].delayTime.value, 0.18);
    assert.equal(audioContext.sources[2].connections.length, 1,
        'the current source must have one processed connection, not duplicate graph branches');
});

test('negative audio sync requests remain bounded at zero Web Audio delay', () => {
    const bridge = bootstrapAudioBridge();
    bridge.setOffset(-500);

    assert.equal(bridge.audioContexts.length, 0,
        'a negative lead request must not introduce an unnecessary processing graph');
});
