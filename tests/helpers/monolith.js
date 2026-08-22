'use strict';

// Run a feature object out of the `ytkit.js` monolith for real, instead of
// regex-pinning its source. Source pins cannot tell a working feature from a
// broken one — the comment-filter dispatcher bug shipped past a pin that
// matched the broken code exactly — so per-feature behaviour tests slice the
// literal out and evaluate it against fake DOM fixtures.

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { sources } = require('./source');

// A feature literal closes at the array indent and is followed by a comma or
// the array end — never by `)`, which belongs to a factory-built neighbour.
const FEATURE_CLOSE = /\n {8}\}(?=,|\s*\]|\s*$|\n)/g;

/**
 * Slice one feature object literal out of the monolith. Brace counting would
 * have to survive template literals and regex literals, so instead the slice
 * runs to the NEXT feature's `id:` line and then back to the last close brace
 * before it — which is this feature's own.
 */
function featureSource(id) {
    const needle = `\n        {\n            id: '${id}'`;
    const start = sources.ytkit.indexOf(needle);
    assert.ok(start > 0, `feature '${id}' must exist in ytkit.js`);
    const nextId = sources.ytkit.indexOf("\n            id: '", start + needle.length);
    assert.ok(nextId > start, `feature '${id}' must be followed by another feature`);
    const region = sources.ytkit.slice(start + 1, nextId);
    FEATURE_CLOSE.lastIndex = 0;
    let close = null;
    for (let match = FEATURE_CLOSE.exec(region); match; match = FEATURE_CLOSE.exec(region)) close = match;
    assert.ok(close, `feature '${id}' must close at the features-array indent`);
    return region.slice(0, close.index + close[0].length);
}

/**
 * Slice the inline fallback literal of a FACTORY-BUILT feature — the
 * `createXFeature({...}) || { id: 'x', … }` shape. The fallback no longer wins
 * in the extension now that route gating is gone from the bootstrap, but it is
 * still what userscript users run wherever the bundle does not carry the
 * module, and it is still live code that drifts. A behaviour proved only
 * against the peeled module proves nothing about this copy. The literal closes
 * at the array indent followed by `)`, which is the wrapping factory call's
 * own close.
 */
function fallbackFeatureSource(id) {
    const needle = `|| {\n            id: '${id}'`;
    const start = sources.ytkit.indexOf(needle);
    assert.ok(start > 0, `factory fallback for '${id}' must exist in ytkit.js`);
    const open = start + needle.indexOf('{');
    const close = sources.ytkit.indexOf('\n        })', open);
    assert.ok(close > open, `factory fallback for '${id}' must close at the array indent`);
    return sources.ytkit.slice(open, close + '\n        }'.length);
}

/** Evaluate a monolith feature literal with a caller-supplied environment. */
function loadFeature(id, extraGlobals = {}) {
    const sandbox = {
        console,
        AbortController,
        setTimeout,
        clearTimeout,
        t: (_key, fallback) => fallback,
        PageTypes: new Proxy({}, { get: (_target, prop) => String(prop) }),
        Z: new Proxy({}, { get: () => 1 }),
        ICONS: new Proxy({}, { get: () => () => fakeNode() }),
        IMPORT_LIMITS: new Proxy({}, { get: () => 100 }),
        createSVG: () => fakeNode(),
        DebugManager: { log() {} },
        showToast() {},
        getVideoId: () => 'abc12345678',
        assertCurrentTranscriptRequest(videoId, signal) {
            if (signal?.aborted || sandbox.getVideoId() !== videoId) {
                throw Object.assign(new Error('Operation cancelled'), { name: 'AbortError' });
            }
        },
        appState: { settings: {} },
        addMutationRule() {},
        removeMutationRule() {},
        addNavigateRule() {},
        removeNavigateRule() {},
        addScopedMutationRule() {},
        removeScopedMutationRule() {},
        injectStyle: () => fakeNode(),
        // v4.68.0: every feed-hiding feature stamps the shared hide marker.
        // The stub RECORDS rather than no-ops so a test can assert the feature
        // attributed the right cards to the right rule — a silent no-op here
        // would let the wiring rot while the feature tests stayed green.
        getFeatureName: (feature) => feature?.name || feature?.id || '',
        markCardHidden() {},
        unmarkCardHidden() {},
        syncHiddenNote() {},
        ...extraGlobals
    };
    sandbox.hideAttributionCalls = [];
    if (!sandbox.applyHideAttribution) {
        sandbox.applyHideAttribution = (element, options) => {
            sandbox.hideAttributionCalls.push({ element, ...options });
        };
    }
    sandbox.globalThis = sandbox;
    const feature = vm.runInNewContext(`(${featureSource(id)})`, sandbox);
    feature._testHideAttributionCalls = sandbox.hideAttributionCalls;
    return feature;
}

/** Evaluate the inline fallback literal of a factory-built monolith feature. */
function loadFallbackFeature(id, extraGlobals = {}) {
    const sandbox = {
        console,
        AbortController,
        setTimeout,
        clearTimeout,
        t: (_key, fallback) => fallback,
        PageTypes: new Proxy({}, { get: (_target, prop) => String(prop) }),
        Z: new Proxy({}, { get: () => 1 }),
        ICONS: new Proxy({}, { get: () => () => fakeNode() }),
        IMPORT_LIMITS: new Proxy({}, { get: () => 100 }),
        createSVG: () => fakeNode(),
        DebugManager: { log() {} },
        showToast() {},
        getVideoId: () => 'abc12345678',
        appState: { settings: {} },
        settingsManager: { save() {} },
        isSafeObjectKey: (key) => !['__proto__', 'constructor', 'prototype'].includes(key),
        addMutationRule() {},
        removeMutationRule() {},
        addNavigateRule() {},
        removeNavigateRule() {},
        addScopedMutationRule() {},
        removeScopedMutationRule() {},
        injectStyle: () => fakeNode(),
        ...extraGlobals
    };
    sandbox.globalThis = sandbox;
    return vm.runInNewContext(`(${fallbackFeatureSource(id)})`, sandbox);
}

/**
 * Match one compound selector (no combinators) against a fake node.
 * Descendant/child combinators cannot be evaluated against a fixture that only
 * models one hop, so they throw rather than silently reporting "no match" —
 * a false negative here makes `closest()` return null and skips whole feature
 * bodies while the test still passes.
 */
function matchesCompound(node, selector, classes, attrs) {
    if (/[\s>+~]/.test(selector)) {
        throw new Error(`fakeNode.matches cannot evaluate combinator selector '${selector}'`);
    }
    const parts = selector.match(/^[a-zA-Z][\w-]*|\.[\w-]+|#[\w-]+|\[[^\]]+\]|:[\w-]+/g);
    if (!parts || parts.join('') !== selector) {
        throw new Error(`fakeNode.matches cannot evaluate selector '${selector}'`);
    }
    return parts.every((part) => {
        if (part.startsWith('.')) return classes.has(part.slice(1));
        if (part.startsWith('#')) return attrs.get('id') === part.slice(1);
        if (part.startsWith('[')) {
            const body = part.slice(1, -1);
            const eq = body.indexOf('=');
            if (eq === -1) return attrs.has(body);
            const name = body.slice(0, eq).replace(/[$^*~|]$/, '');
            const value = body.slice(eq + 1).replace(/^["']|["']$/g, '');
            return attrs.has(name) && attrs.get(name) === value;
        }
        if (part.startsWith(':')) {
            throw new Error(`fakeNode.matches cannot evaluate pseudo-class '${part}'`);
        }
        return part.toUpperCase() === node.tagName;
    });
}

function datasetKeyToAttribute(key) {
    return `data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function datasetProxy(attrs) {
    return new Proxy({}, {
        get(_target, key) {
            if (typeof key !== 'string') return undefined;
            const name = datasetKeyToAttribute(key);
            return attrs.has(name) ? attrs.get(name) : undefined;
        },
        set(_target, key, value) {
            if (typeof key === 'string') attrs.set(datasetKeyToAttribute(key), String(value));
            return true;
        },
        has(_target, key) {
            return typeof key === 'string' && attrs.has(datasetKeyToAttribute(key));
        },
        deleteProperty(_target, key) {
            if (typeof key === 'string') attrs.delete(datasetKeyToAttribute(key));
            return true;
        },
        ownKeys() {
            return [];
        },
        getOwnPropertyDescriptor() {
            return undefined;
        }
    });
}

/** A DOM-ish node: enough surface for feature code, nothing more. */
function fakeNode(options = {}) {
    const {
        tag = 'div',
        text = '',
        attributes = {},
        data = undefined,
        children = []
    } = options;
    const attrs = new Map(Object.entries(attributes));
    const classes = new Set();
    if (typeof attributes.class === 'string') {
        attributes.class.split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
    }
    const node = {
        tagName: tag.toUpperCase(),
        _text: text,
        data,
        clicked: 0,
        removed: 0,
        // A real DOM reflects dataset writes to `data-*` attributes, and this
        // codebase both writes `el.dataset.x = '1'` and matches on
        // `[data-x="1"]`. A plain object made those two halves invisible to
        // each other, so a toolbar could set its count and then fail to find
        // the element it had just marked.
        dataset: datasetProxy(attrs),
        // A bare object made every setProperty() call throw, which is not a
        // no-op the way the other gaps in this helper were — it aborted the
        // whole render and read as a test-authoring mistake rather than a
        // missing affordance. Custom properties are how every feature colour
        // reaches a card, so they have to round-trip.
        style: (() => {
            const custom = new Map();
            return {
                setProperty(name, value) { custom.set(String(name), String(value)); },
                getPropertyValue(name) { return custom.get(String(name)) || ''; },
                removeProperty(name) { custom.delete(String(name)); }
            };
        })(),
        children,
        // Real nodes are attached until something detaches them. A falsy
        // default made every `if (!el.isConnected) return` guard skip its whole
        // body under test, so a broken feature passed silently.
        isConnected: true,
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name),
            // Features toggle hide-classes both ways so a card can be revealed
            // again; a fake without `toggle` silently no-ops that whole path.
            toggle: (name, force) => {
                const next = force === undefined ? !classes.has(name) : !!force;
                if (next) classes.add(name);
                else classes.delete(name);
                return next;
            }
        },
        hasAttribute: (name) => attrs.has(name),
        getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
        setAttribute: (name, value) => attrs.set(name, String(value)),
        removeAttribute: (name) => attrs.delete(name),
        matches(selector) {
            return String(selector).split(',')
                .some(part => matchesCompound(this, part.trim(), classes, attrs));
        },
        closest(selector) {
            return this.matches(selector) ? this : (this.parentElement?.closest?.(selector) ?? null);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        click() { this.clicked += 1; },
        // These used to be no-ops, so a feature could "build and attach" its
        // whole UI invisibly and any assertion on the result was impossible.
        appendChild(child) {
            this.children.push(child);
            if (child) {
                child.parentElement = this;
                child.isConnected = true;
            }
            return child;
        },
        append(...next) {
            next.flat().forEach((child) => this.appendChild(child));
        },
        replaceChildren(...next) {
            this.children.splice(0, this.children.length, ...next);
            next.forEach((child) => {
                if (!child) return;
                child.parentElement = this;
                child.isConnected = true;
            });
        },
        insertBefore(child, reference) {
            const at = reference ? this.children.indexOf(reference) : -1;
            if (at === -1) this.children.push(child);
            else this.children.splice(at, 0, child);
            if (child) {
                child.parentElement = this;
                child.isConnected = true;
            }
            return child;
        },
        // Features that place a notice next to an existing element reach for
        // this rather than appendChild; without it the notice vanished and the
        // render looked like a no-op.
        insertAdjacentElement(position, element) {
            if (!element) return null;
            const siblings = this.parentElement?.children;
            const at = Array.isArray(siblings) ? siblings.indexOf(this) : -1;
            if (position === 'beforebegin' || position === 'afterend') {
                if (at === -1) return null;
                siblings.splice(position === 'afterend' ? at + 1 : at, 0, element);
                element.parentElement = this.parentElement;
            } else if (position === 'afterbegin') {
                this.children.unshift(element);
                element.parentElement = this;
            } else {
                this.children.push(element);
                element.parentElement = this;
            }
            element.isConnected = true;
            return element;
        },
        remove() {
            this.removed += 1;
            this.isConnected = false;
            const siblings = this.parentElement?.children;
            if (Array.isArray(siblings)) {
                const at = siblings.indexOf(this);
                if (at !== -1) siblings.splice(at, 1);
            }
            this.parentElement = null;
        }
    };
    Object.defineProperty(node, 'firstChild', {
        get() { return this.children[0] || null; },
        configurable: true
    });
    // `el.textContent = ''` is the idiomatic "empty this node" and a real DOM
    // drops every child when you write it. A plain string property let a
    // feature clear and re-render while the fake kept the old subtree, so a
    // renderer that stacks duplicates looked correct.
    //
    // Reading concatenates descendants, as the real DOM does. Returning only
    // this node's own text was the third silent falsification in this helper:
    // any copy assembled from createTextNode() plus child elements — which is
    // how every notice, badge, and link-bearing line in this codebase is built
    // — read as the empty string, so `textContent` assertions on a container
    // could only ever be written to expect nothing. A leaf node has no
    // children, so leaf assertions are unchanged.
    Object.defineProperty(node, 'textContent', {
        get() {
            return this.children.reduce(
                (text, child) => text + (child?.textContent ?? ''),
                this._text
            );
        },
        set(value) {
            const next = value == null ? '' : String(value);
            this._text = next;
            this.children.splice(0, this.children.length);
        },
        configurable: true,
        enumerable: true
    });
    // Features assign `el.className = 'x y'` as often as they call
    // classList.add. Without reflection the classes are invisible to
    // matches()/closest()/contains(), so a mounted element looks unmounted.
    Object.defineProperty(node, 'className', {
        get() { return [...classes].join(' '); },
        set(value) {
            classes.clear();
            String(value ?? '').split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
        },
        configurable: true,
        enumerable: true
    });
    // IDL attributes that reflect to the content attribute in a real DOM. The
    // codebase assigns `link.href = url` rather than setAttribute (see every
    // link builder in extension/features/), and without reflection those
    // assignments landed on a plain expando: getAttribute('href') returned
    // null and an `[href]` selector matched nothing, so a correctly built link
    // was indistinguishable from a missing one.
    for (const name of ['href', 'src', 'rel', 'target', 'id', 'title', 'alt']) {
        Object.defineProperty(node, name, {
            get() { return attrs.has(name) ? attrs.get(name) : ''; },
            set(value) { attrs.set(name, String(value ?? '')); },
            configurable: true,
            enumerable: true
        });
    }
    children.forEach((child) => { child.parentElement = node; });
    return node;
}

/**
 * A document whose queries are answered by a caller-supplied resolver, so a
 * fixture can model "this selector matches these nodes" without a real DOM.
 */
function fakeDocument(resolve) {
    return {
        body: fakeNode({ tag: 'body' }),
        documentElement: fakeNode({ tag: 'html' }),
        createElement: (tag) => fakeNode({ tag }),
        createTextNode: (text) => fakeNode({ tag: '#text', text }),
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
        querySelectorAll(selector) {
            const found = resolve(selector);
            return Array.isArray(found) ? found : (found ? [found] : []);
        }
    };
}

module.exports = {
    featureSource,
    fallbackFeatureSource,
    loadFeature,
    loadFallbackFeature,
    fakeNode,
    fakeDocument
};
