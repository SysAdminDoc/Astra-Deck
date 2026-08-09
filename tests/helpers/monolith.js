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

/** Evaluate a monolith feature literal with a caller-supplied environment. */
function loadFeature(id, extraGlobals = {}) {
    const sandbox = {
        console,
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
    return vm.runInNewContext(`(${featureSource(id)})`, sandbox);
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
    const node = {
        tagName: tag.toUpperCase(),
        textContent: text,
        data,
        clicked: 0,
        dataset: {},
        style: {},
        children,
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
        matches: (selector) => selector.split(',').some(part => part.trim() === tag),
        closest(selector) {
            return this.matches(selector) ? this : (this.parentElement?.closest?.(selector) ?? null);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        click() { this.clicked += 1; },
        appendChild() {},
        replaceChildren() {}
    };
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
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
        querySelectorAll(selector) {
            const found = resolve(selector);
            return Array.isArray(found) ? found : (found ? [found] : []);
        }
    };
}

module.exports = { featureSource, loadFeature, fakeNode, fakeDocument };
