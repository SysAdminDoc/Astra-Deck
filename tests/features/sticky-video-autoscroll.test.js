'use strict';

// Theater Split's middle-button autoscroll, split out of features/sticky-video
// into its own part module. These drive the real handlers, merged onto a real
// feature object, with a fake document, window and animation frame.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const repoRoot = path.join(__dirname, '..', '..');
const PART_PATH = '../../extension/features/sticky-video-autoscroll/index.js';
const CONTROLLER_PATH = '../../extension/features/sticky-video/index.js';
const METHODS = [
    '_isSplitScrollable',
    '_isSplitCommentTextTarget',
    '_shouldIgnoreSplitAutoscroll',
    '_getSplitAutoscrollTarget',
    '_startSplitAutoscroll',
    '_stopSplitAutoscroll'
];

function loadPart() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(PART_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(PART_PATH);
    const registered = globalThis.YTKitFeatures.stickyVideoAutoscroll;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, registered };
}

class FakeElement {
    constructor({ matches = [], scrollHeight = 0, clientHeight = 0, contains = () => false } = {}) {
        this.matches = matches;
        this.scrollHeight = scrollHeight;
        this.clientHeight = clientHeight;
        this.scrollTop = 0;
        this._contains = contains;
    }
    // Answers with itself when any selector in the list is one it "matches".
    closest(selectorList) {
        return selectorList.split(',').some((selector) => this.matches.includes(selector.trim())) ? this : null;
    }
    contains(node) { return this._contains(node); }
}

function withFakeBrowser(run) {
    const saved = {};
    for (const key of ['Element', 'document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame']) {
        saved[key] = globalThis[key];
    }
    const listeners = { document: new Map(), window: new Map() };
    const target = (name) => ({
        addEventListener(type, handler) { listeners[name].set(type, handler); },
        removeEventListener(type, handler) {
            if (listeners[name].get(type) === handler) listeners[name].delete(type);
        }
    });
    const frames = [];
    const cancelled = [];
    globalThis.Element = FakeElement;
    globalThis.document = target('document');
    globalThis.window = target('window');
    globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    globalThis.cancelAnimationFrame = (id) => { cancelled.push(id); };
    try {
        return run({ listeners, frames, cancelled });
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[key];
            else globalThis[key] = value;
        }
    }
}

function splitFeature(pane) {
    delete require.cache[require.resolve(CONTROLLER_PATH)];
    const feature = require(CONTROLLER_PATH).createStickyVideoFeature({});
    feature._isActive = true;
    feature._isSplit = true;
    feature._positionedEls = [pane];
    return feature;
}

function middlePress(target, clientY, button = 1) {
    const calls = [];
    return {
        button,
        clientY,
        target,
        calls,
        preventDefault() { calls.push('preventDefault'); },
        stopPropagation() { calls.push('stopPropagation'); },
        stopImmediatePropagation() { calls.push('stopImmediatePropagation'); }
    };
}

test('the autoscroll part loads on its own and hands out fresh methods', () => {
    const { mod, registered } = loadPart();
    assert.equal(registered, mod);
    assert.ok(Object.isFrozen(mod));
    const first = mod.createStickyVideoAutoscrollMethods();
    assert.deepEqual(Object.keys(first).sort(), [...METHODS].sort());
    // Tests and callers replace methods per instance, so no two features may
    // share a function object.
    assert.notEqual(mod.createStickyVideoAutoscrollMethods()._startSplitAutoscroll, first._startSplitAutoscroll);
});

// Object.assign lets a part silently replace a controller method of the same
// name. Every part's method names have to stay clear of the controller's own.
test('every part method lands on the feature and shadows nothing the controller defines', () => {
    const controllerSource = fs.readFileSync(path.join(repoRoot, 'extension', 'features', 'sticky-video', 'index.js'), 'utf8');
    let controllerKeys = null;
    (function walk(node) {
        if (!node || typeof node.type !== 'string' || controllerKeys) return;
        if (node.type === 'VariableDeclarator' && node.id.name === 'feature' && node.init?.type === 'ObjectExpression') {
            controllerKeys = node.init.properties.map((property) => property.key.name || property.key.value);
            return;
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value.type === 'string') walk(value);
        }
    })(acorn.parse(controllerSource, { ecmaVersion: 'latest' }));
    assert.ok(controllerKeys?.length > 40, 'the controller must build its feature as `const feature = {...}`');

    delete require.cache[require.resolve(CONTROLLER_PATH)];
    const feature = require(CONTROLLER_PATH).createStickyVideoFeature({});
    const partDirs = fs.readdirSync(path.join(repoRoot, 'extension', 'features'))
        .filter((dir) => dir.startsWith('sticky-video-'));
    let merged = 0;
    for (const dir of partDirs) {
        const part = require(path.join(repoRoot, 'extension', 'features', dir, 'index.js'));
        for (const [factoryName, factory] of Object.entries(part)) {
            if (!/^create\w+Methods$/.test(factoryName)) continue;
            for (const name of Object.keys(factory({}))) {
                assert.ok(!controllerKeys.includes(name), `${dir} redefines the controller's ${name}`);
                assert.ok(Object.hasOwn(feature, name), `${dir}'s ${name} must be an own property of the feature`);
                merged += 1;
            }
        }
    }
    assert.ok(merged >= METHODS.length, `only ${merged} part methods found`);
});

test('a middle press over a scrollable pane scrolls toward the pointer until release', () => {
    withFakeBrowser(({ listeners, frames, cancelled }) => {
        const inside = new FakeElement();
        const pane = new FakeElement({ scrollHeight: 2000, clientHeight: 400, contains: (node) => node === inside });
        const feature = splitFeature(pane);

        const press = middlePress(inside, 100);
        feature._startSplitAutoscroll(press);
        assert.ok(feature._autoscrollState, 'a middle press over the pane starts autoscroll');
        assert.equal(feature._autoscrollState.scrollEl, pane);
        assert.deepEqual(press.calls, ['preventDefault', 'stopPropagation', 'stopImmediatePropagation'],
            'the press must not also reach the browser, which would open its own autoscroll');
        assert.deepEqual([...listeners.document.keys()].sort(), ['keydown', 'mousemove', 'mouseup']);
        assert.ok(listeners.window.has('blur'));

        // Inside the dead zone nothing moves; past it the pane scrolls toward the pointer.
        listeners.document.get('mousemove')({ clientY: 105 });
        frames.at(-1)(performance.now() + 16.67);
        assert.equal(pane.scrollTop, 0, 'a 5px nudge sits inside the dead zone');
        listeners.document.get('mousemove')({ clientY: 400 });
        frames.at(-1)(performance.now() + 33.34);
        assert.ok(pane.scrollTop > 0, 'pointing below the origin scrolls down');

        // A left-button release is not the end of it; the middle-button release is.
        const ignored = { button: 0, preventDefault() {}, stopPropagation() {} };
        listeners.document.get('mouseup')(ignored);
        assert.ok(feature._autoscrollState, 'only the middle button ends it');
        const state = feature._autoscrollState;
        listeners.document.get('mouseup')({ button: 1, preventDefault() {}, stopPropagation() {} });
        assert.equal(feature._autoscrollState, null);
        assert.deepEqual(cancelled, [state.rafId]);
        assert.equal(listeners.document.size, 0, 'every document listener comes off');
        assert.equal(listeners.window.size, 0, 'and the blur listener too');
    });
});

test('Escape stops autoscroll, and links or other buttons never start it', () => {
    withFakeBrowser(({ listeners }) => {
        const inside = new FakeElement();
        const link = new FakeElement({ matches: ['a[href]'] });
        const pane = new FakeElement({
            scrollHeight: 2000, clientHeight: 400, contains: (node) => node === inside || node === link
        });
        const feature = splitFeature(pane);

        feature._startSplitAutoscroll(middlePress(inside, 100, 0));
        assert.equal(feature._autoscrollState, null, 'a left press is not autoscroll');
        const onLink = middlePress(link, 100);
        feature._startSplitAutoscroll(onLink);
        assert.equal(feature._autoscrollState, null, 'a middle press on a link keeps its open-in-new-tab meaning');
        assert.deepEqual(onLink.calls, [], 'and is left entirely to the browser');

        feature._startSplitAutoscroll(middlePress(inside, 100));
        listeners.document.get('keydown')({ key: 'a', preventDefault() {} });
        assert.ok(feature._autoscrollState, 'other keys leave it running');
        listeners.document.get('keydown')({ key: 'Escape', preventDefault() {} });
        assert.equal(feature._autoscrollState, null);

        feature._isSplit = false;
        feature._startSplitAutoscroll(middlePress(inside, 100));
        assert.equal(feature._autoscrollState, null, 'nothing starts while the split is closed');
    });
});
