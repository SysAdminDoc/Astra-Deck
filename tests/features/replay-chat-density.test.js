'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    addDensitySample,
    createDensityBins,
    createReplayChatDensityFeature,
    messageSample,
    parseChatTimestamp,
    parseTimestampValue
} = require('../../extension/features/replay-chat-density');

function makeMessage({ timestampUsec, timestampText = '', author = 'Viewer', text = 'hello' } = {}) {
    const timestampNode = {
        textContent: timestampText,
        getAttribute(name) {
            if (name === 'aria-label') return timestampText;
            return null;
        }
    };
    return {
        nodeType: 1,
        textContent: `${timestampText} ${text}`,
        getAttribute(name) {
            if (name === 'timestamp-usec') return timestampUsec == null ? null : String(timestampUsec);
            return null;
        },
        querySelector(selector) {
            if (selector.includes('#timestamp') || selector.includes('[id="timestamp"]')) return timestampNode;
            if (selector.includes('#author-name') || selector.includes('#author-text')) return { textContent: author };
            if (selector.includes('#message') || selector.includes('#content')) return { textContent: text };
            return null;
        }
    };
}

function makeElement(tagName = 'div', context = null) {
    const listeners = new Map();
    const element = {
        nodeType: 1,
        tagName: tagName.toUpperCase(),
        className: '',
        style: {},
        children: [],
        parentNode: null,
        parentElement: null,
        classList: {
            values: new Set(),
            add(value) { this.values.add(value); },
            remove(value) { this.values.delete(value); }
        },
        appendChild(child) {
            child.parentNode = this;
            child.parentElement = this;
            this.children.push(child);
            return child;
        },
        remove() {
            if (!this.parentNode) return;
            this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            this.parentNode = null;
            this.parentElement = null;
        },
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
        setAttribute(name, value) { this[name] = String(value); },
        getBoundingClientRect() { return { left: 0, width: 100, height: 24 }; },
        clientWidth: 100,
        clientHeight: 24,
        closest(selector) {
            return selector.includes('ytp-progress-bar-container') ? this.parentElement : null;
        },
        querySelectorAll() { return []; },
        getContext() { return context; },
        _listeners: listeners
    };
    return element;
}

function makeFactoryHarness() {
    const drawContext = {
        globalAlpha: 1,
        fillRectCalls: [],
        setTransform() {},
        clearRect() {},
        fillRect(...args) { this.fillRectCalls.push(args); }
    };
    const progressHost = makeElement('div');
    const progressBar = makeElement('div');
    progressHost.appendChild(progressBar);
    const player = {
        seeks: [],
        seekTo(seconds, allowSeekAhead) { this.seeks.push({ seconds, allowSeekAhead }); }
    };
    const video = {
        duration: 120,
        addEventListener() {},
        removeEventListener() {}
    };
    const documentRef = {
        body: makeElement('body'),
        documentElement: makeElement('html'),
        querySelector(selector) {
            if (selector === '#movie_player.ytp-live') return null;
            if (selector === '#movie_player') return player;
            return null;
        },
        querySelectorAll() { return []; },
        createElement(tagName) {
            return makeElement(tagName, tagName === 'canvas' ? drawContext : null);
        }
    };
    const timers = new Map();
    let nextTimer = 0;
    const navigationRules = new Map();
    const windowRef = {
        devicePixelRatio: 1,
        setTimeout(callback) {
            const id = ++nextTimer;
            timers.set(id, callback);
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        requestAnimationFrame(callback) { callback(); return 1; },
        cancelAnimationFrame() {}
    };
    const feature = createReplayChatDensityFeature({
        PageTypes: { WATCH: 'watch' },
        appState: { settings: { replayChatDensity: true } },
        addNavigateRule(id, rule) { navigationRules.set(id, rule); },
        removeNavigateRule(id) { navigationRules.delete(id); },
        getMainVideoElement: () => video,
        getPlayerProgressBar: () => progressBar,
        getPlayerResponse: () => ({ videoDetails: { videoId: 'dQw4w9WgXcQ', lengthSeconds: '120' } }),
        getVideoId: () => 'dQw4w9WgXcQ',
        injectStyle: () => ({ remove() {} }),
        isWatchPagePath: () => true,
        documentRef,
        windowRef,
        t: (_key, fallback) => fallback
    });
    return { drawContext, feature, navigationRules, player, timers };
}

test('replay chat timestamps accept clock text and renderer microseconds', () => {
    assert.equal(parseTimestampValue('1:23', 'timestamp'), 83);
    assert.equal(parseTimestampValue('123000000', 'timestamp-usec'), 123);
    assert.equal(parseChatTimestamp(makeMessage({ timestampUsec: 456000000 })), 456);
    assert.equal(parseChatTimestamp(makeMessage({ timestampText: '12:34' })), 754);
});

test('density bins clamp boundary samples and preserve quiet spikes', () => {
    const bins = createDensityBins(4);
    assert.equal(addDensitySample(bins, 0, 120), true);
    assert.equal(addDensitySample(bins, 60, 120), true);
    assert.equal(addDensitySample(bins, 120, 120), true);
    assert.equal(addDensitySample(bins, 122, 120), false);
    assert.deepEqual(bins, [1, 0, 1, 1]);
});

test('message sampling keys a renderer by timestamp, author, and text', () => {
    const sample = messageSample(makeMessage({ timestampUsec: 1500000, author: 'A', text: 'hello' }), 10);
    assert.equal(sample.timestamp, 1.5);
    assert.match(sample.key, /^1500\|A\|hello$/);
});

test('replay density renders above the progress bar and click-seeks', () => {
    const { drawContext, feature, player, navigationRules } = makeFactoryHarness();
    feature.init();
    assert.equal(navigationRules.has('replayChatDensity'), true);

    assert.equal(feature._recordMessage(makeMessage({ timestampUsec: 60000000 }), 120), true);
    const snapshot = feature._getSnapshot();
    assert.equal(snapshot.sampleCount, 1);
    assert.equal(snapshot.chartVisible, true);
    assert.ok(drawContext.fillRectCalls.length > 0, 'chart drawing should render a non-empty activity bin');

    const chartCanvas = feature._chartCanvas;
    assert.ok(chartCanvas, 'chart canvas should be mounted above the progress bar');
    chartCanvas._listeners.get('click')({
        clientX: 50,
        preventDefault() {},
        stopPropagation() {}
    });
    assert.deepEqual(player.seeks, [{ seconds: 60, allowSeekAhead: true }]);

    navigationRules.get('replayChatDensity')();
    assert.equal(feature._getSnapshot().sampleCount, 0, 'navigation must cancel and clear route-scoped samples');
    assert.equal(feature._getSnapshot().chartVisible, false);
    feature.destroy();
    assert.equal(navigationRules.has('replayChatDensity'), false);
});
