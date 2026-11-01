'use strict';

// YouTube keeps every rollout's transcript panel in the page from the start, hidden,
// and a content script can't see an element's player data. Measured 2026-11-01.
// These are the monolith's own readers of that panel.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFeature } = require('../helpers/monolith');

const SERVICE = fs.readFileSync(path.join(__dirname, '../../extension/core/transcript-service.js'), 'utf8');
const MONOLITH = fs.readFileSync(path.join(__dirname, '../../extension/ytkit.js'), 'utf8');

function realCore() {
    const context = { console, globalThis: null };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(SERVICE, context, { filename: 'core/transcript-service.js' });
    return context.YTKitCore;
}

// The service's options are an inline object inside a ternary, too deep for the
// declaration loader, so the shipped arrow function is cut out and evaluated.
function isForVideoReader(flexies) {
    const label = 'isDomTranscriptForVideo: ';
    const start = MONOLITH.indexOf(`${label}(videoId, panel) => {`);
    const end = MONOLITH.indexOf(',\n            extensionFetchJson:', start);
    assert.ok(start > 0 && end > start, 'the service must still take this reader as an inline option');
    return vm.runInNewContext(`(${MONOLITH.slice(start + label.length, end)})`, {
        document: { querySelectorAll: (selector) => (selector === 'ytd-watch-flexy' ? flexies : []) },
        getComputedStyle: (node) => node.computed || { display: 'block', visibility: 'visible' },
    });
}

function flexy({ videoId = 'abc12345678', rects = 1, contains = true, computed, isConnected = true } = {}) {
    return {
        isConnected,
        computed,
        getClientRects: () => new Array(rects).fill({}),
        getAttribute: (name) => (name === 'video-id' ? videoId : null),
        contains: () => contains,
    };
}

test('a panel belongs to the video named on the watch element, the one thing an isolated world can read', () => {
    const panel = {};
    assert.equal(isForVideoReader([flexy()])('abc12345678', panel), true);
    assert.equal(isForVideoReader([flexy({ videoId: 'zzzzzzzzzzz' })])('abc12345678', panel), false);
});

test('a watch element off screen or not holding the panel does not count', () => {
    const panel = {};
    const rows = [
        flexy({ rects: 0 }),
        flexy({ contains: false }),
        flexy({ isConnected: false }),
        flexy({ computed: { display: 'none', visibility: 'visible' } }),
        flexy({ computed: { display: 'block', visibility: 'hidden' } }),
    ];
    for (const row of rows) assert.equal(isForVideoReader([row])('abc12345678', panel), false);
});

function fakePage({ open = false } = {}) {
    const state = { open, opens: 0, closes: 0 };
    const closeButton = { click() { state.closes += 1; state.open = false; } };
    const panel = {
        isConnected: true,
        hidden: false,
        style: {},
        getAttribute: () => null,
        getClientRects: () => (state.open ? [{}] : []),
        querySelector: (selector) => (selector === '#visibility-button button' ? closeButton : null),
    };
    const button = { click() { state.opens += 1; state.open = true; } };
    const below = { querySelector: () => null };
    const document = {
        querySelector: (selector) => {
            if (selector === 'ytd-video-description-transcript-section-renderer button') return button;
            if (selector === '#below.ytd-watch-flexy') return below;
            return null;
        },
        querySelectorAll: (selector) => (selector.includes('PAmodern_transcript_view') ? [panel] : []),
    };
    return { document, panel, state };
}

function autoOpen(page) {
    return loadFeature('autoOpenTranscript', {
        document: page.document,
        YTKitCore: realCore(),
        isWatchPagePath: () => true,
        addNavigateRule() {},
        removeNavigateRule() {},
        setTimeout: (fn) => { fn(); return 1; },
        clearTimeout() {},
    });
}

test('Auto-Open Transcript opens the panel even though it already sits hidden in the page', () => {
    const page = fakePage();
    autoOpen(page)._scheduleOpen(0);
    assert.equal(page.state.opens, 1);
});

test('Auto-Open Transcript leaves an open panel alone', () => {
    const page = fakePage({ open: true });
    autoOpen(page)._scheduleOpen(0);
    assert.equal(page.state.opens, 0);
});

function tabs(page) {
    const feature = loadFeature('watchPageTabs', { document: page.document, YTKitCore: realCore() });
    const buttons = ['desc', 'comments', 'chapters', 'transcript'].map((key) => {
        const button = { dataset: { wtab: key }, active: false };
        button.classList = { toggle: (_name, on) => { button.active = on; } };
        return button;
    });
    feature._tabsEl = {
        querySelector: () => buttons.find((button) => button.active) || null,
        querySelectorAll: () => buttons,
    };
    return feature;
}

test('the Transcript tab opens YouTube\'s panel and leaving the tab closes it', () => {
    const page = fakePage();
    const feature = tabs(page);
    feature._activate('transcript');
    assert.equal(page.state.opens, 1);
    assert.equal(page.state.open, true);
    feature._activate('comments');
    assert.equal(page.state.closes, 1);
    assert.equal(page.state.open, false);
    assert.equal(page.panel.style.display, undefined, 'an inline display would outlive the next open');
});

test('switching between other tabs leaves a panel the viewer opened themselves', () => {
    const page = fakePage({ open: true });
    const feature = tabs(page);
    feature._activate('desc');
    feature._activate('comments');
    assert.equal(page.state.closes, 0);
    assert.equal(page.state.open, true);
});
