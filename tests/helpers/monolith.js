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
function featureSourceFrom(source, id) {
    const needle = `\n        {\n            id: '${id}'`;
    const start = source.indexOf(needle);
    assert.ok(start > 0, `feature '${id}' must exist in ytkit.js`);
    const nextId = source.indexOf("\n            id: '", start + needle.length);
    assert.ok(nextId > start, `feature '${id}' must be followed by another feature`);
    const region = source.slice(start + 1, nextId);
    FEATURE_CLOSE.lastIndex = 0;
    let close = null;
    for (let match = FEATURE_CLOSE.exec(region); match; match = FEATURE_CLOSE.exec(region)) close = match;
    assert.ok(close, `feature '${id}' must close at the features-array indent`);
    return region.slice(0, close.index + close[0].length);
}

function featureSource(id) {
    return featureSourceFrom(sources.ytkit, id);
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
// The real overlay keyboard helpers, lifted out of the monolith.
//
// Four features call installMenuKeyboardModel / installDialogFocusContract when
// they open. Stubbing them here would let the wiring rot while the feature
// tests stayed green — the same reason markCardHidden records rather than
// no-ops. They depend on nothing but `document`, which every sandbox already
// supplies.
let _overlayHelpersCache = null;
// The real plural chooser, lifted out of the monolith. Seven features call it
// when they render a count. It depends on nothing but the sandbox's own `t`,
// so there is no reason to stub it and every reason not to: a stub would hide
// a call site that stopped choosing between singular and plural.
let _pluralChooserCache = null;
function pluralChooserSource() {
    if (_pluralChooserCache) return _pluralChooserCache;
    const source = sources.ytkit;
    const marker = '    function tCount(count, key, singular, plural) {';
    const start = source.indexOf(marker);
    if (start < 0) throw new Error('monolith helper: tCount not found');
    const closer = '\n    }';
    const end = source.indexOf(closer, start) + closer.length;
    _pluralChooserCache = source.slice(start, end);
    return _pluralChooserCache;
}

function overlayKeyboardHelpersSource() {
    if (_overlayHelpersCache) return _overlayHelpersCache;
    const source = sources.ytkit;
    const start = source.indexOf('    const MENU_ITEM_SELECTOR =');
    const marker = '    function showSpeedPopup(anchorEl, onChange) {';
    const end = source.indexOf(marker, start);
    if (start < 0 || end < 0) {
        throw new Error('monolith helper: overlay keyboard helpers not found');
    }
    _overlayHelpersCache = source.slice(start, end);
    return _overlayHelpersCache;
}

function loadFeatureFromSource(source, id, extraGlobals = {}) {
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
    if (!sandbox.tCount) {
        vm.runInNewContext(
            '(() => {' + pluralChooserSource() + 'globalThis.tCount = tCount;})()',
            sandbox
        );
    }
    if (!sandbox.installMenuKeyboardModel || !sandbox.installDialogFocusContract) {
        vm.runInNewContext(
            '(() => {' + overlayKeyboardHelpersSource()
            + 'globalThis.installMenuKeyboardModel = installMenuKeyboardModel;'
            + 'globalThis.installDialogFocusContract = installDialogFocusContract;'
            + '})()',
            sandbox
        );
    }
    const feature = vm.runInNewContext(`(${featureSourceFrom(source, id)})`, sandbox);
    feature._testHideAttributionCalls = sandbox.hideAttributionCalls;
    return feature;
}

/**
 * Slice ONE named top-level declaration out of a monolith source. Handles the
 * `function name(` and `const NAME =` shapes at the two indents these files
 * use, and ends each at the close that sits back at the declaration's own
 * indent — the same indentation anchor `featureSourceFrom` relies on, because
 * brace counting would have to survive template literals and regex literals.
 */
function declarationSourceFrom(source, name) {
    const attempts = [];
    // Column 0 first: popup.js and the side panel declare at the top level,
    // the monolith and the userscript nest theirs one or two levels in.
    for (const indent of ['', '    ', '        ']) {
        for (const keyword of ['function', 'async function', 'const', 'let']) {
            const needle = `\n${indent}${keyword} ${name}`;
            // EVERY hit, not the first: `function render` is preceded in
            // popup.js by `renderOptionalHostBanner`, and stopping at the first
            // hit made the real declaration unreachable.
            for (let start = source.indexOf(needle); start >= 0; start = source.indexOf(needle, start + 1)) {
                const next = source[start + needle.length];
                // `const VIDEO_ID` must not answer a request for `VIDEO`.
                if (next && /[A-Za-z0-9_$]/.test(next)) continue;
                const body = source.slice(start + 1);
                const candidates = keyword.endsWith('function')
                    ? sliceFunctionBody(body, indent)
                    : sliceBindingBody(body, indent);
                for (const slice of candidates) {
                    attempts.push(slice);
                    // The indentation anchor can land on a terminator that
                    // belongs to a LATER sibling, which both swallows unrelated
                    // declarations and produces unparseable slices. Take the
                    // shortest candidate that parses and holds no sibling.
                    if (parses(slice) && !swallowsSibling(slice, indent)) return slice;
                }
            }
        }
    }
    if (attempts.length) {
        // Loud refusal on purpose. Before this, a declaration the indentation
        // anchor could not bound came back over-sliced — one binding swallowed
        // 260 lines of unrelated code and still evaluated — so a caller could
        // not tell a good slice from a bad one.
        assert.fail(`declaration '${name}' could not be bounded at its own indent:`
            + ` every candidate slice was unparseable or ran into the next declaration`
            + ` (shortest attempt was ${attempts[0].split('\n').length} lines)`);
    }
    return assert.fail(`declaration '${name}' must exist in the source`);
}

/** A function declaration closes at a `}` back at its own indent. */
function sliceFunctionBody(body, indent) {
    const out = [];
    const terminator = `\n${indent}}`;
    for (let close = body.indexOf(terminator); close > 0 && out.length < SLICE_CANDIDATE_LIMIT;
        close = body.indexOf(terminator, close + 1)) {
        out.push(body.slice(0, close + indent.length + 2));
    }
    return out;
}

/**
 * A `const`/`let` binding ends at a statement terminator sitting at its own
 * indent. Candidates come back SHORTEST FIRST: taking the first terminator in a
 * fixed keyword order let `const X = {` run past its own `};` to a later `});`
 * and swallow 260 lines of unrelated declarations.
 */
function sliceBindingBody(body, indent) {
    const firstBreak = body.indexOf('\n');
    const firstLine = firstBreak === -1 ? body : body.slice(0, firstBreak);
    if (firstLine.trimEnd().endsWith(';')) return [firstLine];
    const ends = [];
    for (const terminator of [`\n${indent}});`, `\n${indent}]);`, `\n${indent}};`, `\n${indent}];`]) {
        for (let close = body.indexOf(terminator); close > 0 && ends.length < SLICE_CANDIDATE_LIMIT * 4;
            close = body.indexOf(terminator, close + 1)) {
            ends.push(close + terminator.length);
        }
    }
    return [...new Set(ends)].sort((a, b) => a - b)
        .slice(0, SLICE_CANDIDATE_LIMIT)
        .map((end) => body.slice(0, end));
}

const SLICE_CANDIDATE_LIMIT = 12;
const TOP_LEVEL_DECLARATION = /^\s*(?:async\s+)?(?:function|const|let)\s+[A-Za-z_$]/;

function parses(slice) {
    try {
        new vm.Script(`(() => {${slice}\n})`);
        return true;
    } catch (_) {
        return false;
    }
}

/** Does this slice run past its own declaration into the next one? */
function swallowsSibling(slice, indent) {
    return slice.split('\n').slice(1).some((line) =>
        TOP_LEVEL_DECLARATION.test(line) && /^\s*/.exec(line)[0] === indent);
}

/**
 * Evaluate named top-level declarations for real, so a test can call the
 * shipped function instead of pinning its text. Every name is evaluated in one
 * shared sandbox, so co-dependent helpers can be requested together and see
 * each other.
 */
function loadDeclarationsFrom(source, names, extraGlobals = {}) {
    const sandbox = { console, ...extraGlobals };
    sandbox.globalThis = sandbox;
    const body = names.map((name) => declarationSourceFrom(source, name)).join('\n');
    const exported = names.map((name) => `__out.${name} = ${name};`).join('');
    vm.runInNewContext(`var __out = {};(() => {${body}\n${exported}})();__out;`, sandbox);
    // Monolith code assigns module-level state to bare identifiers, which land
    // on the sandbox rather than in `__out`. Hand the sandbox back so a test
    // can read that state — a cleanup closure, a cached handle — after
    // driving the function that set it.
    sandbox.__out.globalThis = sandbox;
    return sandbox.__out;
}

/** `loadDeclarationsFrom` against the extension monolith. */
function loadDeclarations(names, extraGlobals = {}) {
    return loadDeclarationsFrom(sources.ytkit, names, extraGlobals);
}

/** `loadDeclarationsFrom` against the userscript runtime (core + main). */
function loadUserscriptDeclarations(names, extraGlobals = {}) {
    return loadDeclarationsFrom(sources.userscript, names, extraGlobals);
}

function loadFeature(id, extraGlobals = {}) {
    return loadFeatureFromSource(sources.ytkit, id, extraGlobals);
}

function loadUserscriptFeature(id, extraGlobals = {}) {
    return loadFeatureFromSource(sources.userscript, id, extraGlobals);
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

function attributeToDatasetKey(name) {
    return name.slice('data-'.length).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
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
        // `Object.keys(el.dataset)`, a spread and a for-in all have to see the
        // keys, or the next feature that iterates dataset gets an empty object
        // and its test passes on nothing.
        ownKeys() {
            return [...attrs.keys()]
                .filter((name) => name.startsWith('data-'))
                .map(attributeToDatasetKey);
        },
        getOwnPropertyDescriptor(_target, key) {
            if (typeof key !== 'string') return undefined;
            const name = datasetKeyToAttribute(key);
            if (!attrs.has(name)) return undefined;
            return { value: attrs.get(name), enumerable: true, configurable: true, writable: true };
        }
    });
}

// An inline style whose method half and property half share one store. A bare
// object made every setProperty() call throw, which aborted the whole render.
// Splitting the two halves was subtler and just as wrong: a feature that hides
// a row with `style.display = 'none'` and reveals it again with
// `style.removeProperty('display')` left the row hidden forever under test, so
// the reveal path could never be asserted.
function styleProxy() {
    const declarations = new Map();
    const priorities = new Map();
    const methods = {
        setProperty(name, value, priority = '') {
            const property = String(name);
            declarations.set(property, String(value));
            if (priority) priorities.set(property, String(priority));
            else priorities.delete(property);
        },
        getPropertyValue(name) { return declarations.get(String(name)) || ''; },
        getPropertyPriority(name) { return priorities.get(String(name)) || ''; },
        removeProperty(name) {
            const property = String(name);
            const previous = declarations.get(property) || '';
            declarations.delete(property);
            priorities.delete(property);
            return previous;
        }
    };
    return new Proxy(methods, {
        get(target, key) {
            if (key in target) return target[key];
            if (typeof key !== 'string') return undefined;
            // cssText is the whole declaration block, not a property named
            // "css-text". A feature that stamps its styling through cssText and
            // then reads or flips one property off it has to see the same
            // store, or the flip is invisible.
            if (key === 'cssText') {
                return [...declarations].map(([name, value]) => (
                    `${name}: ${value}${priorities.get(name) ? ` !${priorities.get(name)}` : ''};`
                )).join(' ');
            }
            // A real CSSStyleDeclaration reports '' for a property that is not
            // set, which is what a feature comparing against '' expects.
            return declarations.get(styleKeyToProperty(key)) ?? '';
        },
        set(target, key, value) {
            if (key === 'cssText') {
                declarations.clear();
                priorities.clear();
                for (const declaration of String(value ?? '').split(';')) {
                    const at = declaration.indexOf(':');
                    if (at === -1) continue;
                    const name = declaration.slice(0, at).trim();
                    if (!name) continue;
                    const rawValue = declaration.slice(at + 1).trim();
                    const important = rawValue.match(/\s*!important\s*$/i);
                    declarations.set(name, important ? rawValue.slice(0, important.index).trim() : rawValue);
                    if (important) priorities.set(name, 'important');
                }
                return true;
            }
            if (typeof key === 'string' && !(key in target)) {
                const property = styleKeyToProperty(key);
                declarations.set(property, String(value));
                priorities.delete(property);
            }
            return true;
        },
        has(target, key) {
            return key in target || (typeof key === 'string' && declarations.has(styleKeyToProperty(key)));
        },
        deleteProperty(_target, key) {
            if (typeof key === 'string') {
                const property = styleKeyToProperty(key);
                declarations.delete(property);
                priorities.delete(property);
            }
            return true;
        }
    });
}

function styleKeyToProperty(key) {
    return key.startsWith('--') ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
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
        // See styleProxy: the method half and the property half of an inline
        // style have to share one store, because features write one and read
        // or clear the other.
        style: styleProxy(),
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
        // Tree traversal. A feature that walks the DOM — the Element Zapper
        // picker does, to let the arrow keys choose a target — got undefined
        // from every one of these and looked like it had hit a dead end.
        get firstElementChild() { return this.children[0] || null; },
        get lastElementChild() { return this.children[this.children.length - 1] || null; },
        get nextElementSibling() {
            const siblings = this.parentElement?.children;
            if (!siblings) return null;
            return siblings[siblings.indexOf(this) + 1] || null;
        },
        get previousElementSibling() {
            const siblings = this.parentElement?.children;
            if (!siblings) return null;
            const index = siblings.indexOf(this);
            return index > 0 ? siblings[index - 1] : null;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        click() { this.clicked += 1; },
        // These used to be no-ops, so a feature could "build and attach" its
        // whole UI invisibly and any assertion on the result was impossible.
        appendChild(child) {
            if (child?.tagName === '#FRAGMENT') {
                for (const nested of [...child.children]) this.appendChild(nested);
                return child;
            }
            const previousSiblings = child?.parentElement?.children;
            if (Array.isArray(previousSiblings)) {
                const previousIndex = previousSiblings.indexOf(child);
                if (previousIndex !== -1) previousSiblings.splice(previousIndex, 1);
            }
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
        // A panel injected at the top of a sidebar reaches for prepend, and
        // without it the whole injection threw rather than no-oping.
        prepend(...next) {
            next.flat().reverse().forEach((child) => {
                if (!child) return;
                this.children.unshift(child);
                child.parentElement = this;
                child.isConnected = true;
            });
        },
        replaceChildren(...next) {
            for (const child of this.children) {
                if (child?.parentElement === this) child.parentElement = null;
                if (child) child.isConnected = false;
            }
            this.children.splice(0, this.children.length);
            next.flat().forEach((child) => this.appendChild(child));
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
    Object.defineProperty(node, 'childElementCount', {
        get() { return this.children.filter((child) => child?.tagName && child.tagName !== '#TEXT').length; },
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
            for (const child of this.children) {
                if (child?.parentElement === this) child.parentElement = null;
                if (child) child.isConnected = false;
            }
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
    // A real anchor recomposes its href when you assign one of its URL parts,
    // and this codebase builds link destinations that way
    // (`a.href = origin; a.pathname = …; a.search = …`). Without composition
    // those assignments land on dead expandos, and a test can assert on
    // `pathname` while the anchor a reader clicks is the bare origin.
    for (const part of ['protocol', 'host', 'hostname', 'pathname', 'search', 'hash']) {
        Object.defineProperty(node, part, {
            get() {
                const href = attrs.get('href');
                if (!href) return '';
                try { return new URL(href)[part]; } catch { return ''; }
            },
            set(value) {
                const href = attrs.get('href');
                if (!href) { attrs.set(part, String(value ?? '')); return; }
                try {
                    const url = new URL(href);
                    url[part] = String(value ?? '');
                    attrs.set('href', url.toString());
                } catch {
                    attrs.set(part, String(value ?? ''));
                }
            },
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

function simpleSelectorMatch(node, selector) {
    const candidate = String(selector || '').trim().split(/[\s>+~]+/).at(-1);
    if (!candidate || candidate === ':scope') return false;
    if (candidate === '*') return true;
    try { return node.matches(candidate); } catch { return false; }
}

function collectFakeTree(root, selector) {
    const found = [];
    (function walk(node) {
        for (const child of node?.children || []) {
            if (String(selector).split(',').some((part) => simpleSelectorMatch(child, part))) found.push(child);
            walk(child);
        }
    })(root);
    return found;
}

/**
 * A connected fake document for renderer tests. Unlike `fakeDocument`, this
 * answers queries from the tree that a renderer actually attached and records
 * event listeners so a test can drive the resulting controls.
 */
function fakeTreeDocument(resolve = () => null) {
    const listeners = new Map();
    const documentRef = {
        activeElement: null,
        listeners,
        createElement(tag) {
            const node = fakeNode({ tag });
            node.listeners = new Map();
            node.addEventListener = (type, handler) => {
                if (!node.listeners.has(type)) node.listeners.set(type, new Set());
                node.listeners.get(type).add(handler);
            };
            node.removeEventListener = (type, handler) => node.listeners.get(type)?.delete(handler);
            node.dispatchEvent = (event) => {
                if (event && !event.target) event.target = node;
                for (const handler of node.listeners.get(event?.type) || []) handler.call(node, event);
                return !event?.defaultPrevented;
            };
            node.querySelectorAll = (selector) => collectFakeTree(node, selector);
            node.querySelector = (selector) => node.querySelectorAll(selector)[0] || null;
            node.contains = (candidate) => candidate === node || collectFakeTree(node, '*').includes(candidate);
            node.focus = () => { documentRef.activeElement = node; };
            node.blur = () => { if (documentRef.activeElement === node) documentRef.activeElement = null; };
            node.toggleAttribute = (name, force) => {
                const next = force === undefined ? !node.hasAttribute(name) : !!force;
                if (next) node.setAttribute(name, '');
                else node.removeAttribute(name);
                return next;
            };
            Object.defineProperty(node, 'parentNode', {
                get() { return this.parentElement || null; },
                set(value) { this.parentElement = value; },
                configurable: true
            });
            return node;
        },
        createTextNode: (text) => fakeNode({ tag: '#text', text }),
        createElementNS(_namespace, tag) { return this.createElement(tag); },
        createDocumentFragment() { return this.createElement('#fragment'); },
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(handler);
        },
        removeEventListener(type, handler) { listeners.get(type)?.delete(handler); }
    };
    documentRef.documentElement = documentRef.createElement('html');
    documentRef.head = documentRef.createElement('head');
    documentRef.body = documentRef.createElement('body');
    documentRef.documentElement.append(documentRef.head, documentRef.body);
    documentRef.querySelectorAll = (selector) => {
        const supplied = resolve(selector);
        if (supplied) return Array.isArray(supplied) ? supplied : [supplied];
        return collectFakeTree(documentRef.documentElement, selector);
    };
    documentRef.querySelector = (selector) => documentRef.querySelectorAll(selector)[0] || null;
    documentRef.getElementById = (id) => documentRef.querySelector(`#${id}`);
    documentRef.contains = (node) => node === documentRef.documentElement
        || collectFakeTree(documentRef.documentElement, '*').includes(node);
    return documentRef;
}

module.exports = {
    featureSource,
    fallbackFeatureSource,
    declarationSourceFrom,
    loadDeclarations,
    loadDeclarationsFrom,
    loadUserscriptDeclarations,
    loadFeature,
    loadUserscriptFeature,
    loadFallbackFeature,
    fakeNode,
    fakeDocument,
    fakeTreeDocument,
    collectFakeTree
};
