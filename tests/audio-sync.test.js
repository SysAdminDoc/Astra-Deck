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
            this.gains = [];
            this.filters = [];
            this.analysers = [];
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
            this.gains.push(node);
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

        createBiquadFilter() {
            const node = makeNode('highpass');
            node.type = 'lowpass';
            node.frequency = { value: 350 };
            node.Q = { value: 1 };
            node.gain = { value: 0 };
            this.filters.push(node);
            return node;
        }

        createAnalyser() {
            const node = makeNode('analyser');
            node.fftSize = 2048;
            node.smoothingTimeConstant = 0;
            node.getFloatTimeDomainData = (buffer) => {
                for (let index = 0; index < buffer.length; index++) buffer[index] = 0.05;
            };
            this.analysers.push(node);
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
                ATTRS: {
                    syncOffset: 'data-ytkit-audio-sync-offset',
                    autoGain: 'data-ytkit-audio-auto-gain',
                    highPass: 'data-ytkit-audio-high-pass',
                    equalizer: 'data-ytkit-audio-eq',
                    eqLow: 'data-ytkit-audio-eq-low',
                    eqMid: 'data-ytkit-audio-eq-mid',
                    eqHigh: 'data-ytkit-audio-eq-high'
                },
                normalizeAudioSyncOffset(value) {
                    const number = Number(value);
                    if (!Number.isFinite(number)) return 0;
                    return Math.max(-500, Math.min(500, Math.round(number)));
                },
                normalizeAudioEqGain(value) {
                    const number = Number(value);
                    if (!Number.isFinite(number)) return 0;
                    return Math.max(-12, Math.min(12, Math.round(number)));
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
        Float32Array,
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
    let nextIntervalId = 1;
    const intervalCallbacks = new Map();
    context.setInterval = (callback) => {
        const id = nextIntervalId++;
        intervalCallbacks.set(id, callback);
        return id;
    };
    context.clearInterval = (id) => {
        intervalCallbacks.delete(id);
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

    // The bridge reads only what the isolated world sealed. Seed the token
    // and hand the harness a publisher before ytkit-main.js runs.
    const bridge = installBridgeChannel(documentElement, context.YTKitCore);

    vm.createContext(context);
    vm.runInContext(source, context, { filename: 'extension/ytkit-main.js' });

    return {
        context,
        audioContexts,
        bridge,
        documentElement,
        setOffset(value) {
            bridge.publish('data-ytkit-audio-sync-offset', String(value));
        },
        setAutoGain(enabled) {
            if (enabled) bridge.publish('data-ytkit-audio-auto-gain', '1');
            else bridge.clear('data-ytkit-audio-auto-gain');
        },
        setHighPass(enabled) {
            if (enabled) bridge.publish('data-ytkit-audio-high-pass', '1');
            else bridge.clear('data-ytkit-audio-high-pass');
        },
        setEq(enabled) {
            if (enabled) bridge.publish('data-ytkit-audio-eq', '1');
            else bridge.clear('data-ytkit-audio-eq');
        },
        setEqBand(band, value) {
            bridge.publish(`data-ytkit-audio-eq-${band}`, String(value));
        },
        tickAutoGain() {
            for (const callback of intervalCallbacks.values()) callback();
        },
        navigateTo(video) {
            currentVideo = video;
            context.dispatchEvent(bridge.navigate());
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

test('auto-gain and high-pass apply independently and remain reconnect-safe', () => {
    const bridge = bootstrapAudioBridge();

    bridge.setAutoGain(true);
    const audioContext = bridge.audioContexts[0];
    assert.equal(audioContext.gains.length, 3,
        'the shared graph should expose mono, auto-gain, and boost gain nodes');
    assert.equal(audioContext.filters.length, 4);
    assert.equal(audioContext.filters[0].frequency.value, 10,
        'high-pass stays near-transparent while disabled');
    bridge.tickAutoGain();
    assert.ok(audioContext.gains[1].gain.value > 1,
        'quiet input should receive bounded adaptive makeup gain');

    bridge.setHighPass(true);
    assert.equal(audioContext.filters[0].type, 'highpass');
    assert.equal(audioContext.filters[0].frequency.value, 80);
    assert.equal(audioContext.gains[1].gain.value > 1, true,
        'enabling high-pass must not disable auto-gain');

    bridge.setAutoGain(false);
    assert.equal(audioContext.gains[1].gain.value, 1,
        'disabling auto-gain must restore unity gain');
    assert.equal(audioContext.filters[0].frequency.value, 80,
        'high-pass must remain active when auto-gain is disabled');

    bridge.navigateTo({
        id: 'video-2',
        classList: { contains: (name) => name === 'html5-main-video' }
    });
    assert.equal(audioContext.sources.length, 2);
    assert.equal(audioContext.filters.length, 8,
        'navigation should create one high-pass plus three EQ filters per processing chain');
    assert.equal(audioContext.sources[1].connections.length, 1,
        'the current source must have one processed branch');

    bridge.setHighPass(false);
    assert.equal(audioContext.sources[1].connections[0], audioContext.destination,
        'disabling the last audio node must restore source passthrough');
});

test('parametric EQ inserts three bands, updates live, and bypasses them when disabled', () => {
    const bridge = bootstrapAudioBridge();

    bridge.setHighPass(true);
    bridge.setEq(true);
    const audioContext = bridge.audioContexts[0];
    assert.equal(audioContext.filters.length, 4,
        'the shared graph should contain the high-pass node plus three EQ bands');
    const [highPass, low, mid, high] = audioContext.filters;
    assert.equal(low.type, 'lowshelf');
    assert.equal(mid.type, 'peaking');
    assert.equal(high.type, 'highshelf');
    assert.equal(low.frequency.value, 120);
    assert.equal(mid.frequency.value, 1000);
    assert.equal(high.frequency.value, 8000);
    assert.equal(highPass.connections[0], low,
        'enabled EQ must be in the live processing path');

    bridge.setEqBand('low', 20);
    bridge.setEqBand('mid', -20);
    bridge.setEqBand('high', 4.4);
    assert.equal(low.gain.value, 12);
    assert.equal(mid.gain.value, -12);
    assert.equal(high.gain.value, 4);

    bridge.setEq(false);
    assert.equal(low.connections.length, 0,
        'disabled EQ bands must be disconnected, not left as flat filters');
    assert.equal(mid.connections.length, 0);
    assert.equal(high.connections.length, 0);
    assert.equal(highPass.connections[0].kind, 'analyser',
        'the graph must route around the EQ bands when disabled');

    bridge.setEq(true);
    assert.equal(audioContext.sources.length, 1,
        'live EQ toggles must not recreate the media source');
    assert.equal(highPass.connections[0], low,
        're-enabling EQ must restore the three-band route');
});
