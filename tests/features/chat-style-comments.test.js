'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, config, extractFeatureBlock } = require('../helpers/source');

const MODULE_PATH = '../../extension/features/chat-style-comments/index.js';

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    const exported = globalThis.YTKitFeatures.chatStyleComments;
    globalThis.YTKitFeatures = originalFeatures;
    return { mod, exported };
}

function extractTemplate(block, name) {
    const tick = String.fromCharCode(96);
    const needle = 'const ' + name + ' = ';
    const start = block.indexOf(needle);
    assert.ok(start > -1, 'chatStyleComments block must declare ' + name);
    const open = block.indexOf(tick, start + needle.length);
    assert.ok(open > -1, name + ' must be a template literal');
    for (let i = open + 1; i < block.length; i++) {
        if (block[i] === tick && block[i - 1] !== '\\') return block.slice(open + 1, i);
    }
    throw new Error('unterminated template literal: ' + name);
}

test('chatStyleComments module exports the style builder surface', () => {
    const { mod, exported } = loadModule();
    assert.equal(typeof mod.buildCommentRestyleCss, 'function');
    assert.equal(typeof mod.buildPremiumCommentsCss, 'function');
    assert.equal(typeof mod.buildPremiumInteractionCss, 'function');
    assert.equal(typeof mod.buildSelectorSupportFallbackCss, 'function');
    assert.equal(typeof mod.processComment, 'function');
    assert.equal(typeof mod.processAllComments, 'function');
    assert.equal(typeof mod.createChatStyleCommentsRuntime, 'function');
    assert.deepEqual(mod.STYLE_IDS, {
        base: 'chatStyleComments',
        premium: 'chatStyleComments-premium',
        interaction: 'chatStyleComments-premium-2'
    });
    assert.equal(typeof exported.buildCommentRestyleCss, 'function');
});

test('chatStyleComments style builders preserve the monolith fallback CSS', () => {
    const { mod } = loadModule();
    const [block] = extractFeatureBlock(sources.ytkit, 'chatStyleComments');
    const interpolation = String.fromCharCode(36, 123) + 'Z.TOAST + 2}';

    assert.equal(mod.buildCommentRestyleCss(), extractTemplate(block, 'css'));
    assert.equal(mod.buildPremiumCommentsCss(), extractTemplate(block, 'premiumCss'));
    assert.equal(
        mod.buildPremiumInteractionCss({ tooltipZ: 70002 }),
        extractTemplate(block, 'premiumInteractionCss').replace(interpolation, '70002')
    );
    assert.equal(mod.buildSelectorSupportFallbackCss(), extractTemplate(block, 'selectorSupportFallbackCss'));
});

test('chatStyleComments preserves the YouTube split-thread line', () => {
    const { mod } = loadModule();
    const css = mod.buildCommentRestyleCss();
    const [block] = extractFeatureBlock(sources.ytkit, 'chatStyleComments');

    assert.doesNotMatch(css, /\.ytSubThreadThreadline/);
    assert.match(
        css,
        /\.ytSubThreadConnection,\.ytSubThreadContinuation,\.ytSubThreadShadow\{display:none !important\}/,
        'the other decorative sub-thread elements should remain hidden'
    );
    assert.doesNotMatch(block, /\.ytSubThreadThreadline/,
        'the monolith fallback must preserve the thread line too');
    assert.doesNotMatch(sources.userscript, /\.ytSubThreadThreadline/,
        'the userscript comments payload must preserve the thread line too');
});

test('chatStyleComments hides the current YouTube paper-input underline', () => {
    const { mod } = loadModule();
    assert.match(
        mod.buildPremiumCommentsCss(),
        /#comments \.tp-yt-paper-input-container\.style-scope\.underline\s*\{\s*display: none !important;/,
        'comment restyling must hide YouTube paper-input underline nodes without affecting non-comment inputs'
    );
});

test('chatStyleComments monolith delegates CSS payloads through the feature module', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'chatStyleComments');
    assert.match(block, /globalThis\.YTKitFeatures && globalThis\.YTKitFeatures\.chatStyleComments/,
        'ytkit.js must read the chatStyleComments feature namespace');
    for (const builder of [
        'buildCommentRestyleCss',
        'buildPremiumCommentsCss',
        'buildPremiumInteractionCss',
        'buildSelectorSupportFallbackCss'
    ]) {
        assert.match(block, new RegExp('chatStyleFeatures\\.' + builder),
            'ytkit.js must delegate to ' + builder + ' when the module is loaded');
    }
    assert.match(block, /buildPremiumInteractionCss\(\{ tooltipZ: Z\.TOAST \+ 2 \}\)/,
        'tooltip z-index must remain tied to the monolith Z table');
    assert.match(block, /createChatStyleCommentsRuntime/,
        'ytkit.js must delegate comment runtime ownership to the feature module');
    assert.match(block, /this\._runtime\.init\(\);[\s\S]*?return;/,
        'ytkit.js must skip inline observer/listener setup after module runtime init');
    assert.match(block, /this\._runtime\.destroy\(\);/,
        'ytkit.js destroy must delegate runtime teardown when the module owns it');
});

test('chatStyleComments module loads before ytkit.js in content scripts', () => {
    for (const scriptGroup of config.manifest.content_scripts) {
        const scripts = scriptGroup.js || [];
        const ytkitIndex = scripts.indexOf('ytkit.js');
        if (ytkitIndex === -1) continue;
        const moduleIndex = scripts.indexOf('features/chat-style-comments/index.js');
        assert.ok(moduleIndex > -1, 'manifest content script must include chat-style-comments module');
        assert.ok(moduleIndex < ytkitIndex, 'chat-style-comments module must load before ytkit.js');
    }
});

test('chatStyleComments runtime registers and tears down mutation + selection handlers', () => {
    const { mod } = loadModule();
    const calls = [];
    let mutationHandler = null;
    const doc = { querySelectorAll() { return []; } };
    const win = {
        addEventListener(type, handler, capture) {
            calls.push(['add', type, capture]);
            assert.equal(typeof handler, 'function');
        },
        removeEventListener(type, handler, capture) {
            calls.push(['remove', type, capture]);
            assert.equal(typeof handler, 'function');
        }
    };
    const runtime = mod.createChatStyleCommentsRuntime({
        document: doc,
        window: win,
        requestAnimationFrame(fn) { fn(); },
        addMutationRule(id, handler) {
            calls.push(['addRule', id]);
            mutationHandler = handler;
        },
        removeMutationRule(id) {
            calls.push(['removeRule', id]);
        },
        featureId: 'chatStyleComments'
    });

    runtime.init();
    assert.deepEqual(calls.slice(0, 2), [
        ['add', 'selectstart', true],
        ['addRule', 'chatStyleComments']
    ]);
    assert.equal(typeof mutationHandler, 'function');
    mutationHandler();
    runtime.destroy();
    assert.deepEqual(calls.slice(-2), [
        ['remove', 'selectstart', true],
        ['removeRule', 'chatStyleComments']
    ]);
});

test('premium interaction CSS targets the kebab-case attributes the dataset flags create', () => {
    const { mod } = loadModule();
    const css = mod.buildPremiumInteractionCss();
    // dataset.ytkitPinned creates data-ytkit-pinned; camelCase attribute
    // selectors case-fold and never match, which silently killed the
    // pinned/hearted/linked styling and hid badges on ALL comments.
    for (const attr of ['data-ytkit-pinned="1"', 'data-ytkit-heart="1"', 'data-ytkit-linked="1"']) {
        assert.ok(css.includes(attr), `CSS must select [${attr}]`);
    }
    assert.ok(!/data-ytkit(?:Pinned|Heart|Linked)/.test(css),
        'no camelCase data-attribute selectors may remain');
});

test('premium comments finish with one flat tokenized theme in normal watch mode', () => {
    const { mod } = loadModule();
    const css = mod.buildPremiumInteractionCss();
    const normalLane = css.slice(css.indexOf('/* Final normal-watch theme layer.'));

    assert.match(normalLane, /html\.ytkit-watch-restyle:not\(\.ytkit-split-active\):not\(\.ytkit-split-open\)/);
    assert.match(normalLane, /background: var\(--ytkit-premium-panel\) !important/);
    assert.match(normalLane, /color: var\(--ytkit-premium-text\) !important/);
    assert.match(normalLane, /\[disabled\][\s\S]*opacity: 0\.46 !important/);
    assert.match(normalLane, /:focus-visible[\s\S]*outline: 2px solid var\(--ytkit-premium-accent\)/);
    assert.match(normalLane, /ytd-comment-engagement-bar :is\(svg, path\)[\s\S]*fill: currentColor !important/);
    assert.match(normalLane, /ytd-comment-engagement-bar[\s\S]*background: transparent !important/);
});

test('hearted flag requires is-hearted, not merely a visible heart button', () => {
    const moduleSource = require('fs').readFileSync(
        require.resolve(MODULE_PATH), 'utf8');
    assert.ok(moduleSource.includes("#creator-heart-button[is-hearted]:not([hidden])"),
        'ytkitHeart must gate on is-hearted');
    assert.ok(!moduleSource.includes("#creator-heart-button[is-hearted], #creator-heart-button:not([hidden])"),
        'over-broad visible-button alternative must be gone');
});

test('processComment skips restyling a comment that is already normalized', () => {
    // Every mutation batch re-ran ~30 inline style writes per comment across
    // the whole thread, so adding 20 comments restyled all 500.
    const { mod } = loadModule();

    class FakeStyle {
        constructor(owner) { this._values = new Map(); this._owner = owner; }
        setProperty(key, value) { this._owner.writes += 1; this._values.set(key, value); }
        getPropertyValue(key) { return this._values.get(key) || ''; }
        removeProperty(key) { this._values.delete(key); }
    }
    class FakeNode {
        constructor(counter, selectors = {}) {
            this.counter = counter;
            this.dataset = {};
            this.selectors = selectors;
            this.style = new FakeStyle(counter);
        }
        get writes() { return this.counter.writes; }
        // The normalize passes record which inline properties they set so
        // teardown can remove exactly those; a fake without the attribute API
        // no longer stands in for an Element.
        getAttribute(name) { return this._attrs?.get(name) ?? null; }
        setAttribute(name, value) {
            if (!this._attrs) this._attrs = new Map();
            this._attrs.set(name, String(value));
        }
        removeAttribute(name) { this._attrs?.delete(name); }
        matches() { return false; }
        closest() { return null; }
        _match(selector) {
            // Selector groups are passed as one string; match any mapped key
            // that appears in the group.
            for (const [key, node] of Object.entries(this.selectors)) {
                if (selector === key || selector.split(',').some(part => part.trim() === key)) return node;
            }
            return null;
        }
        querySelector(selector) { return this._match(selector); }
        querySelectorAll(selector) { const node = this._match(selector); return node ? [node] : []; }
    }
    const counter = { writes: 0 };
    const main = new FakeNode(counter);
    const content = new FakeNode(counter);
    const comment = new FakeNode(counter, {
        ':scope > #body > #main': main,
        '#content-text': content,
    });
    const originalElement = globalThis.Element;
    globalThis.Element = FakeNode;
    try {
        mod.processComment(comment);
        const afterFirst = counter.writes;
        assert.ok(afterFirst > 0, 'the first pass must normalize the comment');
        assert.equal(comment.dataset.ytkitChat, '1');

        mod.processComment(comment);
        assert.equal(counter.writes, afterFirst,
            'a second pass over an unchanged comment must write no styles');

        // Polymer re-renders replace children while keeping the host, so a
        // host-only marker is not enough — a stripped child must re-normalize.
        main.style.removeProperty('display');
        mod.processComment(comment);
        assert.ok(counter.writes > afterFirst,
            'a comment whose subtree lost its stamps must be normalized again');
    } finally {
        if (originalElement === undefined) delete globalThis.Element;
        else globalThis.Element = originalElement;
    }
});

test('teardown removes the inline styles the normalize passes wrote', () => {
    // The normalize passes write ~30 !important inline properties per comment.
    // Neither cleanupRuntimeDom nor the monolith destroy removed them, so
    // toggling the feature off left native comments with 24px avatars and
    // forced flex layout until Polymer re-rendered or the page reloaded.
    const src = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', '..', 'extension', 'features', 'chat-style-comments', 'index.js'),
        'utf8'
    );
    assert.match(src, /function setManagedStyle\(node, key, value\)/,
        'inline writes must be recorded as they are made');
    assert.match(src, /node\.setAttribute\(MANAGED_STYLE_ATTR, recorded\.join\(','\)\)/,
        'the property names must be recorded on the element itself, not a hand-kept list');
    assert.match(src, /function cleanupRuntimeDom\(doc\) \{\s*clearManagedStyles\(doc\);/,
        'teardown must strip the recorded properties first');
    assert.match(src, /forEach\(\(key\) => node\.style\.removeProperty\(key\)\)/,
        'exactly the recorded properties must be removed');
    assert.ok(!/\bcomment\.style\.setProperty\(/.test(src),
        'no normalize write may bypass the recorder');

    // The monolith twin must strip them too, from a destroy() that cannot see
    // init()'s locals.
    const mono = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');
    assert.match(mono, /document\.querySelectorAll\('\[data-ytkit-chat-styled\]'\)[\s\S]{0,260}?removeProperty\(key\)/,
        'the monolith destroy must remove the recorded inline properties');
});

test('chat-style comments are legible on YouTube light theme', () => {
    const src = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', '..', 'extension', 'features', 'chat-style-comments', 'index.js'),
        'utf8'
    );
    for (const selector of [
        'ytd-comment-view-model #content-text',
        'ytd-comment-view-model .published-time-text',
        'ytd-commentbox #contenteditable-root',
    ]) {
        assert.ok(src.includes(`html:not([dark]) ${selector}`),
            `${selector} must have a light-theme override (it paints white-alpha text on the page background)`);
    }
});

// ── Vote badge ──────────────────────────────────────────────────────────
//
// The restyle hides YouTube's own #like-button and #vote-count-middle. The
// badge is the replacement, and it was lost when this feature was peeled out
// of the monolith: the CSS and all three removal paths came across, the
// constructor did not. These drive the real constructor against a fixture that
// implements exactly what it touches, so a second loss fails here rather than
// silently shipping a comment section with no like affordance.

function fakeElement(doc, tag) {
    const classes = new Set();
    const attrs = new Map();
    const listeners = new Map();
    const el = {
        tagName: String(tag).toUpperCase(),
        ownerDocument: doc,
        children: [],
        textContent: '',
        title: '',
        dataset: {},
        style: { setProperty() {}, getPropertyValue: () => '' },
        matches: () => false,
        querySelectorAll: () => [],
        classList: {
            add: (n) => classes.add(n),
            remove: (n) => classes.delete(n),
            contains: (n) => classes.has(n),
            toggle: (n, force) => {
                const next = force === undefined ? !classes.has(n) : !!force;
                if (next) classes.add(n); else classes.delete(n);
                return next;
            }
        },
        get className() { return [...classes].join(' '); },
        set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
        setAttribute: (n, v) => attrs.set(n, String(v)),
        getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
        removeAttribute: (n) => attrs.delete(n),
        hasAttribute: (n) => attrs.has(n),
        closest: () => null,
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        after(node) {
            const parent = this.parentNode;
            if (!parent) return;
            parent.children.splice(parent.children.indexOf(this) + 1, 0, node);
            node.parentNode = parent;
        },
        remove() {
            const parent = this.parentNode;
            if (!parent) return;
            parent.children.splice(parent.children.indexOf(this), 1);
            this.parentNode = null;
        },
        addEventListener(type, fn) { listeners.set(type, fn); },
        dispatch(type, event = {}) {
            const fn = listeners.get(type);
            if (!fn) return false;
            fn({ stopPropagation() {}, preventDefault() {}, ...event });
            return true;
        },
        hasListener: (type) => listeners.has(type),
        querySelector() { return null; }
    };
    return el;
}

function fakeDoc() {
    const doc = {};
    doc.createElement = (tag) => fakeElement(doc, tag);
    doc.createElementNS = (_ns, tag) => fakeElement(doc, tag);
    return doc;
}

// A comment host that answers only the selectors the constructor asks for.
// Anything else returns null, so a constructor that starts depending on a new
// selector shows up as a null rather than a silent pass.
function fakeComment({ vote = '', liked = false, hasLikeButton = true } = {}) {
    const doc = fakeDoc();
    const authorText = fakeElement(doc, 'a');
    const host = fakeElement(doc, 'ytd-comment-view-model');
    host.appendChild(authorText);
    const likeButton = fakeElement(doc, 'button');
    likeButton.clicks = 0;
    likeButton.click = () => { likeButton.clicks += 1; };
    const voteEl = fakeElement(doc, 'span');
    voteEl.textContent = vote;

    host.querySelector = (selector) => {
        if (selector === '#author-text') return authorText;
        if (selector === '#vote-count-middle') return vote ? voteEl : null;
        if (selector === '#like-button button[aria-pressed="true"]') return liked ? likeButton : null;
        if (selector.startsWith('#like-button button')) return hasLikeButton ? likeButton : null;
        if (selector === '.ytkit-vote-badge') return host.children.find(c => c.classList.contains('ytkit-vote-badge')) || null;
        return null;
    };
    return { host, authorText, likeButton, doc };
}

test('the vote badge is actually built, next to the author name', () => {
    const { mod } = loadModule();
    const { host, authorText } = fakeComment({ vote: '412' });
    const badge = mod.buildVoteBadge(host, (_k, fallback) => fallback);

    assert.ok(badge, 'buildVoteBadge must return the badge it created');
    assert.equal(badge.className, 'ytkit-vote-badge');
    assert.equal(host.children[host.children.indexOf(authorText) + 1], badge,
        'the badge must sit immediately after the author name');
    assert.equal(badge.children.map(c => c.textContent).join(''), '412',
        'the badge must show the comment vote count');
    assert.ok(badge.children.some(c => c.tagName === 'SVG'), 'the badge must carry the thumb icon');
});

test('the vote badge reflects and toggles the like state', () => {
    const { mod } = loadModule();
    const { host, likeButton } = fakeComment({ vote: '5', liked: true });
    const badge = mod.buildVoteBadge(host, (_k, fallback) => fallback);

    assert.equal(badge.classList.contains('ytkit-liked'), true,
        'an already-liked comment must render the badge in its liked state');
    assert.equal(badge.getAttribute('aria-pressed'), 'true');

    badge.dispatch('click');
    assert.equal(likeButton.clicks, 1, 'clicking the badge must click YouTube\'s own like button');
    assert.equal(badge.classList.contains('ytkit-liked'), false, 'the badge must un-toggle on the second state');
    assert.equal(badge.getAttribute('aria-pressed'), 'false');
});

test('the vote badge is keyboard operable', () => {
    const { mod } = loadModule();
    const { host, likeButton } = fakeComment({ vote: '1' });
    const badge = mod.buildVoteBadge(host, (_k, fallback) => fallback);

    assert.equal(badge.getAttribute('role'), 'button');
    assert.equal(badge.getAttribute('tabindex'), '0');
    badge.dispatch('keydown', { key: 'Enter' });
    assert.equal(likeButton.clicks, 1, 'Enter must activate the badge');
    badge.dispatch('keydown', { key: ' ' });
    assert.equal(likeButton.clicks, 2, 'Space must activate the badge');
    badge.dispatch('keydown', { key: 'a' });
    assert.equal(likeButton.clicks, 2, 'an unrelated key must not activate the badge');
});

test('the vote badge hides a zero count and routes its labels through t()', () => {
    const { mod } = loadModule();
    const seen = [];
    const translate = (key, fallback) => { seen.push(key); return fallback; };

    const zero = fakeComment({ vote: '0' });
    const zeroBadge = mod.buildVoteBadge(zero.host, translate);
    assert.equal(zeroBadge.children.map(c => c.textContent).join(''), '',
        'a zero vote count must render as an icon with no number');

    const counted = fakeComment({ vote: '9' });
    mod.buildVoteBadge(counted.host, translate);
    assert.ok(seen.includes('ui_commentLikeBadge'),
        'the badge label must come from a locale key, not a hardcoded literal');
    assert.ok(seen.includes('ui_commentLikeBadgeCountAriaTpl'),
        'the counted accessible name must come from a locale key');
});

test('a comment with no author anchor yields no badge instead of throwing', () => {
    const { mod } = loadModule();
    const doc = fakeDoc();
    const host = fakeElement(doc, 'ytd-comment-view-model');
    assert.equal(mod.buildVoteBadge(host, (_k, f) => f), null);
});

test('processComment rebuilds the badge on a recycled comment host', () => {
    const { mod } = loadModule();
    // YouTube reuses comment hosts as you scroll. A badge left in place would
    // keep the previous comment's count and its click handler.
    const first = fakeComment({ vote: '100' });
    // processComment also runs the two normalize passes, which walk a much
    // wider slice of the comment subtree than the badge does. Hand those a
    // throwaway element so this test stays about the badge; the strict
    // fixture above is what pins the constructor's own selector list.
    const strict = first.host.querySelector;
    first.host.querySelector = (selector) => strict(selector) || fakeElement(first.doc, 'div');
    const priorElement = globalThis.Element;
    globalThis.Element = function Element() {};
    Object.defineProperty(globalThis.Element, Symbol.hasInstance, { value: () => true });
    try {
        mod.processComment(first.host, { t: (_k, f) => f });
        const badges = first.host.children.filter(c => c.classList.contains('ytkit-vote-badge'));
        assert.equal(badges.length, 1, 'the first pass must leave exactly one badge');
        assert.equal(badges[0].children.map(c => c.textContent).join(''), '100');

        mod.processComment(first.host, { t: (_k, f) => f });
        const after = first.host.children.filter(c => c.classList.contains('ytkit-vote-badge'));
        assert.equal(after.length, 1, 'a second pass must not stack a second badge');
        assert.notEqual(after[0], badges[0],
            'the badge must be rebuilt, not reused, so a recycled host cannot keep a stale count');
    } finally {
        if (priorElement === undefined) delete globalThis.Element;
        else globalThis.Element = priorElement;
    }
});

test('the restyle hides YouTube\'s own like affordance, so the badge is load-bearing', () => {
    // If this CSS ever stops hiding the native controls the badge becomes
    // redundant rather than essential. Pin the dependency so the two move
    // together.
    const { mod } = loadModule();
    const css = mod.buildCommentRestyleCss();
    assert.match(css, /ytd-comment-engagement-bar #like-button[^}]*display:none/,
        'the restyle must hide the native like button');
    assert.match(css, /ytd-comment-engagement-bar #vote-count-middle|#vote-count-middle[^}]*display:none/,
        'the restyle must hide the native vote count');
    assert.match(css, /\.ytkit-vote-badge\{/, 'the replacement badge must be styled');
});
