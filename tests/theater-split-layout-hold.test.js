'use strict';

// Theater Split and Classic Watch Layout share the page-world classic layout
// switch (ytkit.js holdClassicWatchLayout). Theater Split's pane is #below,
// and YouTube's side-panel watch page moves comments, the description and
// live chat out of it, so the split needs that layout off while it's on.
// The switch stays on while either feature holds it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ytkit = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

function slice(startMarker, endMarker) {
    const start = ytkit.indexOf(startMarker);
    assert.ok(start > -1, startMarker);
    const end = ytkit.indexOf(endMarker, start);
    assert.ok(end > start, endMarker);
    return ytkit.slice(start, end);
}

const HOLD_BLOCK = slice('function publishBridgeAttribute(name, value) {', 'const STORAGE_KEYS = Object.freeze({');
const SYNC_BLOCK = slice('let _theaterSplitLayoutHoldReady = false;', '// Always deferred, never called straight from a feature lifecycle hook.');

function loadHold() {
    const attributes = new Map();
    const sealed = [];
    const context = {
        document: {
            documentElement: {
                getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
                setAttribute: (name, value) => attributes.set(name, String(value)),
                removeAttribute: (name) => attributes.delete(name),
            },
        },
        YTKitCore: {
            getBridgeWriter: () => ({
                set: (name, value) => { sealed.push(`set ${name}=${value}`); return true; },
                clear: (name) => { sealed.push(`clear ${name}`); return true; },
            }),
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(`${HOLD_BLOCK}
        globalThis.api = { holdClassicWatchLayout, releaseClassicWatchLayout, classicWatchLayoutHolders };`, context);
    return { api: context.api, attributes, sealed };
}

test('the switch stays on while either feature holds it and goes once neither does', () => {
    const { api, attributes, sealed } = loadHold();
    api.holdClassicWatchLayout('stickyVideo');
    api.holdClassicWatchLayout('restoreClassicWatchLayout');
    assert.equal(attributes.get('data-ytkit-classic-watch-layout'), 'on');
    sealed.length = 0;

    // Classic Watch Layout turned off with Theater Split still on.
    api.releaseClassicWatchLayout('restoreClassicWatchLayout');
    assert.deepEqual(sealed, [], 'the split still holds it');
    assert.equal(attributes.get('data-ytkit-classic-watch-layout'), 'on');

    api.releaseClassicWatchLayout('stickyVideo');
    assert.deepEqual(sealed, ['clear data-ytkit-classic-watch-layout']);
    assert.equal(attributes.has('data-ytkit-classic-watch-layout'), false);

    api.releaseClassicWatchLayout('stickyVideo');
    assert.deepEqual(sealed, ['clear data-ytkit-classic-watch-layout', 'clear data-ytkit-classic-watch-layout'],
        'a release with no holders still clears, the way the feature\'s destroy() always did');
});

test('a repeat hold by the same owner writes nothing, and a page-written plain attribute is no hold', () => {
    const { api, attributes, sealed } = loadHold();
    // A page script can write the plain attribute; the page world reads only
    // the sealed copy, so the hold must still go through the writer.
    attributes.set('data-ytkit-classic-watch-layout', 'on');
    api.holdClassicWatchLayout('stickyVideo');
    assert.deepEqual(sealed, ['set data-ytkit-classic-watch-layout=on']);
    api.holdClassicWatchLayout('stickyVideo');
    assert.deepEqual(sealed, ['set data-ytkit-classic-watch-layout=on'], 'settings applies call it every time');
});

function loadSync({ split, active = true }) {
    const holds = [];
    const context = {
        appState: { settings: { stickyVideo: true } },
        PageTypes: { WATCH: 'watch' },
        getFeatureById: (id) => (id === 'stickyVideo' ? split : null),
        shouldFeatureBeActive: (feature, settings, page) => { holds.push(`check ${page}`); return active; },
        holdClassicWatchLayout: (owner) => holds.push(`hold ${owner}`),
        releaseClassicWatchLayout: (owner) => holds.push(`release ${owner}`),
    };
    vm.createContext(context);
    vm.runInContext(`${SYNC_BLOCK}
        globalThis.sync = syncTheaterSplitLayoutHold;
        globalThis.ready = () => { _theaterSplitLayoutHoldReady = true; };`, context);
    return { context, holds };
}

test('Theater Split holds the layout from its setting, judged as if on a watch page', () => {
    const before = loadSync({ split: { id: 'stickyVideo' } });
    assert.equal(before.context.sync(), false);
    assert.deepEqual(before.holds, [], 'nothing before the first init pass, so safe mode never holds');

    const on = loadSync({ split: { id: 'stickyVideo' } });
    on.context.ready();
    assert.equal(on.context.sync(), true);
    assert.deepEqual(on.holds, ['check watch', 'hold stickyVideo'], 'held on Home too, so the next watch page is classic');

    const off = loadSync({ split: { id: 'stickyVideo' }, active: false });
    off.context.ready();
    assert.equal(off.context.sync(), false);
    assert.deepEqual(off.holds, ['check watch', 'release stickyVideo']);

    const stub = loadSync({ split: { id: 'stickyVideo', _moduleUnavailable: true } });
    stub.context.ready();
    assert.equal(stub.context.sync(), false);
    assert.deepEqual(stub.holds, ['release stickyVideo'], 'an inert split holds nothing');
});

test('ytkit.js wires the hold where it has to run', () => {
    const apply = slice('// Before the features: a Classic Watch Layout teardown below','liveFeatureList.forEach(feature => {');
    assert.ok(apply.includes('syncTheaterSplitLayoutHold(resolvedSettings);'),
        'settings applies sync the hold before any Classic Watch Layout teardown');

    const deps = slice('...(globalThis.YTKitFeatures?.classicWatchLayout?.createClassicWatchLayoutFeatures?.({', 'readSetting:');
    assert.ok(deps.includes("? holdClassicWatchLayout('restoreClassicWatchLayout')"));
    assert.ok(deps.includes("? releaseClassicWatchLayout('restoreClassicWatchLayout')"));

    // Past the safe-mode branch and before any tier or settle: a settings
    // apply in the startup window must already find the split's hold.
    const boot = slice('if (isSafeMode) {\n', '// Tier 1: after first paint');
    const order = ['} else {', '_theaterSplitLayoutHoldReady = true;', 'syncTheaterSplitLayoutHold();', 'initFeature(f)',
        'earlyBridgeSwitches?.settle?.((featureId)', 'if (classicWatchLayoutHolders.has(featureId)) return true;']
        .map((marker) => boot.indexOf(marker));
    assert.ok(order.every((at) => at > -1), JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'the split holds before any feature starts or settle() runs');
    assert.ok(!boot.slice(0, order[0]).includes('_theaterSplitLayoutHoldReady'), 'safe mode never holds');

    const crash = slice('if (count >= MAX_FEATURE_CRASHES) {', 'return count;');
    assert.ok(crash.indexOf('syncTheaterSplitLayoutHold();') > crash.indexOf('appState.settings[featureId] = false;'),
        'an auto-disabled split lets go at once');
});
