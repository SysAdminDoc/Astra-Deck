'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStickyChatFeature, sanitizeStickyChatLayout } = require('../../extension/features/sticky-chat/index.js');

class FakeClassList {
    constructor() { this.values = new Set(); }
    add(value) { this.values.add(value); }
    remove(value) { this.values.delete(value); }
    contains(value) { return this.values.has(value); }
}

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.parentNode = null;
        this.classList = new FakeClassList();
        this.attributes = new Map();
        this.listeners = new Map();
        this.styleValues = new Map();
        this.style = { setProperty: (key, value) => this.styleValues.set(key, value) };
        this.hidden = false;
        this.isConnected = true;
        this.value = '';
        this.type = '';
        this.textContent = '';
    }

    appendChild(child) { child.parentNode = this; child.isConnected = true; this.children.push(child); return child; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) || null; }
    hasAttribute(key) { return this.attributes.has(key); }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    dispatch(type, event = {}) { this.listeners.get(type)?.({ target: this, ...event }); }
    remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
        this.isConnected = false;
    }
    querySelector(selector) {
        if (selector === 'iframe') return this.children.find(child => child.tagName === 'IFRAME') || null;
        if (selector === 'input[type="range"]') return this.children.flatMap(child => [child, ...child.children]).find(child => child.tagName === 'INPUT' && child.type === 'range') || null;
        return null;
    }
    getBoundingClientRect() { return { left: 800, top: 24, width: 400, height: 500 }; }
}

class FakeDocument {
    constructor() {
        this.documentElement = new FakeElement('html', this);
        this.body = new FakeElement('body', this);
        this.fullscreenElement = null;
        this.listeners = new Map();
        this.chat = null;
    }
    createElement(tag) { return new FakeElement(tag, this); }
    querySelector(selector) { return selector.startsWith('ytd-live-chat-frame') ? this.chat : null; }
    addEventListener(type, handler, capture = false) { this.listeners.set(`${type}:${capture}`, handler); }
    removeEventListener(type, handler, capture = false) {
        const key = `${type}:${capture}`;
        if (this.listeners.get(key) === handler) this.listeners.delete(key);
    }
    dispatch(type, event = {}, capture = false) { this.listeners.get(`${type}:${capture}`)?.(event); }
}

function createHarness(saved = {}) {
    const documentRef = new FakeDocument();
    const windowListeners = new Map();
    const windowRef = {
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener: (type, handler) => windowListeners.set(type, handler),
        removeEventListener: (type, handler) => { if (windowListeners.get(type) === handler) windowListeners.delete(type); }
    };
    const frame = new FakeElement('ytd-live-chat-frame', documentRef);
    frame.appendChild(new FakeElement('iframe', documentRef));
    documentRef.chat = frame;
    const writes = [];
    let styleRemoved = false;
    let observerDisconnected = false;
    let navigateRule = null;
    const feature = createStickyChatFeature({
        documentRef,
        windowRef,
        MutationObserverCtor: class {
            constructor(callback) { this.callback = callback; }
            observe() {}
            disconnect() { observerDisconnected = true; }
        },
        storageReadJSON: () => saved,
        storageWriteJSON: (key, value) => writes.push({ key, value }),
        injectStyle: () => ({ remove: () => { styleRemoved = true; } }),
        addNavigateRule: (_id, callback) => { navigateRule = callback; },
        removeNavigateRule: () => { navigateRule = null; },
        setTimeoutFn: callback => { callback(); return 1; },
        clearTimeoutFn: () => {}
    });
    return {
        feature, documentRef, windowRef, windowListeners, frame, writes,
        getStyleRemoved: () => styleRemoved,
        getObserverDisconnected: () => observerDisconnected,
        getNavigateRule: () => navigateRule
    };
}

test('sticky chat layout sanitizer clamps position and opacity', () => {
    assert.deepEqual(sanitizeStickyChatLayout({ x: -10, y: 12000, opacity: 0.2 }), { x: 0, y: 10000, opacity: 0.45 });
    assert.deepEqual(sanitizeStickyChatLayout({ x: 23.6, y: 45.4, opacity: 0.93 }), { x: 24, y: 45, opacity: 0.95 });
    assert.deepEqual(sanitizeStickyChatLayout({}), { x: null, y: null, opacity: 0.9 });
});

test('fullscreen sticky chat mounts accessible drag and opacity controls', () => {
    const harness = createHarness({ x: 700, y: 20, opacity: 0.8 });
    harness.documentRef.fullscreenElement = harness.documentRef.documentElement;

    harness.feature.init();

    assert.ok(harness.frame.classList.contains('ytkit-floating-chat'));
    assert.equal(harness.feature._controls.getAttribute('role'), 'toolbar');
    assert.equal(harness.feature._controls.getAttribute('aria-label'), 'Floating chat controls');
    assert.equal(harness.feature._controls.children[0].getAttribute('aria-label'), 'Move floating chat');
    assert.equal(harness.feature._controls.children[1].getAttribute('aria-label'), 'Chat opacity');
    assert.equal(harness.frame.styleValues.get('--ytkit-floating-chat-opacity'), '0.8');
    assert.equal(typeof harness.getNavigateRule(), 'function');
});

test('opacity and drag changes persist a viewport-clamped layout', () => {
    const harness = createHarness({ x: 700, y: 20, opacity: 0.8 });
    harness.documentRef.fullscreenElement = harness.documentRef.documentElement;
    harness.feature.init();
    const [drag, opacity] = harness.feature._controls.children;

    opacity.value = '55';
    opacity.dispatch('input');
    opacity.dispatch('change');
    assert.equal(harness.frame.styleValues.get('--ytkit-floating-chat-opacity'), '0.55');

    drag.dispatch('pointerdown', { button: 0, pointerId: 7, clientX: 900, clientY: 100, preventDefault() {} });
    harness.documentRef.dispatch('pointermove', { pointerId: 7, clientX: 2000, clientY: 2000 }, true);
    harness.documentRef.dispatch('pointerup', { pointerId: 7 }, true);

    assert.deepEqual(harness.writes.at(-1), {
        key: 'ytkit-sticky-chat-layout',
        value: { x: 880, y: 220, opacity: 0.55 }
    });
});

test('chat stays native outside fullscreen and tears down without listeners', () => {
    const harness = createHarness();
    harness.feature.init();
    assert.equal(harness.frame.classList.contains('ytkit-floating-chat'), false);

    harness.documentRef.fullscreenElement = harness.documentRef.documentElement;
    harness.feature._sync();
    assert.ok(harness.frame.classList.contains('ytkit-floating-chat'));
    harness.documentRef.fullscreenElement = null;
    harness.feature._sync();
    assert.equal(harness.frame.classList.contains('ytkit-floating-chat'), false);
    assert.equal(harness.feature._controls, null);

    harness.feature.destroy();
    assert.equal(harness.getStyleRemoved(), true);
    assert.equal(harness.getObserverDisconnected(), true);
    assert.equal(harness.windowListeners.size, 0);
    assert.equal(harness.documentRef.listeners.size, 0);
    assert.equal(harness.getNavigateRule(), null);
});

test('sticky chat module is canonical in extension and generated userscript vehicles', () => {
    const root = path.join(__dirname, '..', '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
    for (const entry of manifest.content_scripts.filter(item => item.js?.includes('ytkit.js'))) {
        assert.ok(entry.js.indexOf('features/sticky-chat/index.js') > -1);
        assert.ok(entry.js.indexOf('features/sticky-chat/index.js') < entry.js.indexOf('ytkit.js'));
    }
    const ytkit = fs.readFileSync(path.join(root, 'extension', 'ytkit.js'), 'utf8');
    const userscript = fs.readFileSync(path.join(root, 'YTKit.user.js'), 'utf8');
    assert.match(ytkit, /YTKitFeatures\?\.stickyChat\?\.createStickyChatFeature/);
    assert.match(userscript, /bundled module: extension\/features\/sticky-chat\/index\.js/);
    assert.doesNotMatch(ytkit, /ytd-live-chat-frame \{ position: sticky/);
});
