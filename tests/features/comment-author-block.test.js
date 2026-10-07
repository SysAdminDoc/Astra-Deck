'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createCommentAuthorBlockFeatures,
    normalizeBlockedAuthor,
    parseBlockedAuthors,
    serializeBlockedAuthors,
    readCommentAuthor,
    buildBlockedAuthorsCss,
    findOpenMenu
} = require('../../extension/features/comment-author-block/index.js');

const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';

function fakeComment({ href = '/@BreakingTheSystems', text = ' @BreakingTheSystems ', thumbLabel = '' } = {}) {
    const link = href === null ? null : { textContent: text, getAttribute: (name) => (name === 'href' ? href : null) };
    const thumb = thumbLabel ? { getAttribute: (name) => (name === 'aria-label' ? thumbLabel : null) } : null;
    return {
        querySelector(selector) {
            if (selector === '#author-text') return link;
            if (selector === '#author-thumbnail-button') return thumb;
            return null;
        }
    };
}

test('normalizeBlockedAuthor accepts handles, channel ids and YouTube channel links only', () => {
    assert.equal(normalizeBlockedAuthor('@BreakingTheSystems'), '@BreakingTheSystems');
    assert.equal(normalizeBlockedAuthor('BreakingTheSystems'), '@BreakingTheSystems');
    assert.equal(normalizeBlockedAuthor('  @BreakingTheSystems   spams every upload'), '@BreakingTheSystems');
    assert.equal(normalizeBlockedAuthor('https://www.youtube.com/@BreakingTheSystems/videos'), '@BreakingTheSystems');
    assert.equal(normalizeBlockedAuthor('https://m.youtube.com/channel/' + CHANNEL_ID), CHANNEL_ID);
    assert.equal(normalizeBlockedAuthor('/channel/' + CHANNEL_ID + '/about'), CHANNEL_ID);
    assert.equal(normalizeBlockedAuthor(CHANNEL_ID), CHANNEL_ID);
    assert.equal(normalizeBlockedAuthor('https://www.youtube.com/@%E6%97%A5%E6%9C%AC'), '@日本');
    assert.equal(normalizeBlockedAuthor('# a note line'), '');
    assert.equal(normalizeBlockedAuthor(''), '');
    assert.equal(normalizeBlockedAuthor('https://evil.example/@BreakingTheSystems'), '');
    assert.equal(normalizeBlockedAuthor('@bad"quote'), '');
    assert.equal(normalizeBlockedAuthor('@x"]{}body{display:none}'), '');
    assert.equal(normalizeBlockedAuthor('@a\\b'), '');
});

test('parseBlockedAuthors dedupes handles case-insensitively and keeps the first spelling', () => {
    const keys = parseBlockedAuthors([
        '@BreakingTheSystems',
        '@breakingthesystems',
        '"]{ not a handle',
        '',
        '# comment',
        CHANNEL_ID,
        CHANNEL_ID
    ].join('\r\n'));
    assert.deepEqual(keys, ['@BreakingTheSystems', CHANNEL_ID]);
});

test('serializeBlockedAuthors drops the oldest entries to stay under the setting length cap', () => {
    const keys = Array.from({ length: 1500 }, (_, index) => '@spammer' + String(index).padStart(20, '0'));
    const text = serializeBlockedAuthors(keys);
    assert.ok(text.length <= 20000, 'serialized list fits the schema maxLength');
    const kept = text.split('\n');
    assert.equal(kept[kept.length - 1], keys[keys.length - 1], 'the newest block is kept');
    assert.ok(!kept.includes(keys[0]), 'the oldest block is dropped first');
});

test('readCommentAuthor reads the handle from the comment author link', () => {
    assert.deepEqual(readCommentAuthor(fakeComment()), { key: '@BreakingTheSystems', label: '@BreakingTheSystems' });
    assert.deepEqual(readCommentAuthor(fakeComment({ href: 'https://www.youtube.com/channel/' + CHANNEL_ID, text: 'Old Name' })),
        { key: CHANNEL_ID, label: 'Old Name' });
    assert.deepEqual(readCommentAuthor(fakeComment({ href: null, thumbLabel: '@FromThumbnail' })),
        { key: '@FromThumbnail', label: '@FromThumbnail' });
    assert.equal(readCommentAuthor(fakeComment({ href: '/watch?v=x', text: 'No handle' })), null);
});

test('buildBlockedAuthorsCss hides top-level threads and single replies by author link', () => {
    assert.equal(buildBlockedAuthorsCss([]), '');
    const css = buildBlockedAuthorsCss(['@BreakingTheSystems', CHANNEL_ID]);
    assert.match(css, /ytd-comment-thread-renderer:has\(> #comment-container > #comment > #body #author-text:is\(/);
    assert.match(css, /ytd-comment-thread-renderer:has\(> #comment > #body #author-text:is\(/);
    assert.match(css, /:is\(ytd-comment-view-model, ytd-comment-renderer\):has\(> #body #author-text:is\(/);
    assert.ok(css.includes('[href$="/@BreakingTheSystems" i]'), 'handles match case-insensitively');
    assert.ok(css.includes('[href$="/channel/' + CHANNEL_ID + '"]'), 'channel ids match exactly');
    assert.match(css, /display: none !important;/);
});

test('buildBlockedAuthorsCss also matches the percent-encoded href of a non-Latin handle', () => {
    const css = buildBlockedAuthorsCss(['@日本']);
    assert.ok(css.includes('[href$="/@日本" i]'));
    assert.ok(css.includes('[href$="/@%E6%97%A5%E6%9C%AC" i]'));
});

test('buildBlockedAuthorsCss never emits an entry that fails validation', () => {
    const css = buildBlockedAuthorsCss(['@ok', '@x"]{}body{display:none}', 'nonsense value']);
    assert.ok(css.includes('/@ok'));
    assert.ok(!css.includes('body{display:none}'));
    assert.ok(!css.includes('nonsense'));
});

function harness(initial = '') {
    const settings = { commentBlockedAuthors: initial };
    const writes = [];
    const toasts = [];
    const styles = new Map();
    const dispatched = [];
    const listeners = new Map();
    const documentRef = {
        defaultView: { KeyboardEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } } },
        querySelectorAll: () => [],
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: (type) => listeners.delete(type),
        dispatchEvent: (event) => dispatched.push(event)
    };
    const [feature, list] = createCommentAuthorBlockFeatures({
        documentRef,
        injectStyle: (css, id) => {
            const el = { css, remove() { styles.delete(id); } };
            styles.set(id, el);
            return el;
        },
        readSetting: (key) => settings[key],
        writeSetting: (key, value) => { settings[key] = value; writes.push([key, value]); },
        showToast: (message, color, options) => toasts.push({ message, options }),
        setTimeoutFn: () => 1,
        clearTimeoutFn: () => {}
    });
    return { feature, list, settings, writes, toasts, styles, dispatched, listeners };
}

test('the feature and its list are separate descriptors linked as parent and sub-setting', () => {
    const { feature, list } = harness();
    assert.equal(feature.id, 'commentAuthorBlock');
    assert.equal(list.id, 'commentBlockedAuthors');
    assert.equal(list.type, 'textarea');
    assert.equal(list.settingKey, 'commentBlockedAuthors');
    assert.equal(list.parentId, 'commentAuthorBlock');
    assert.equal(list.dependsOn, 'commentAuthorBlock');
});

test('choosing Block saves the author, hides their comments, closes the menu and offers Undo', () => {
    const h = harness('@Earlier');
    h.feature.init();
    assert.ok(h.styles.has('commentAuthorBlock'));
    assert.ok(h.styles.has('commentAuthorBlock-menu'));
    const dropdown = { dispatchEvent: (event) => h.dispatched.push(event) };
    h.feature._activate({ key: '@BreakingTheSystems', label: '@BreakingTheSystems' }, dropdown);
    assert.equal(h.settings.commentBlockedAuthors, '@Earlier\n@BreakingTheSystems');
    assert.ok(h.styles.get('commentAuthorBlock').css.includes('[href$="/@BreakingTheSystems" i]'));
    const escape = h.dispatched.find((event) => event.type === 'keydown');
    assert.equal(escape?.key, 'Escape', 'the menu is closed with Escape');
    assert.equal(h.toasts.length, 1);
    assert.match(h.toasts[0].message, /Blocked @BreakingTheSystems/);
    const undo = h.toasts[0].options.action;
    assert.equal(undo.text, 'Undo');
    undo.onClick();
    assert.equal(h.settings.commentBlockedAuthors, '@Earlier');
    assert.ok(!h.styles.get('commentAuthorBlock').css.includes('BreakingTheSystems'));
    assert.match(h.toasts[1].message, /Unblocked @BreakingTheSystems/);
});

test('blocking an author already on the list writes nothing and says so', () => {
    const h = harness('@breakingthesystems');
    h.feature.init();
    h.feature._activate({ key: '@BreakingTheSystems', label: '@BreakingTheSystems' }, null);
    assert.equal(h.writes.length, 0);
    assert.match(h.toasts[0].message, /already blocked/);
});

test('the author label is inserted literally, even with $ patterns in it', () => {
    const h = harness('');
    h.feature.init();
    h.feature._activate({ key: CHANNEL_ID, label: 'Pay $$ now $&' }, null);
    assert.equal(h.toasts[0].message, 'Blocked Pay $$ now $&. Their comments are hidden.');
});

test('a click on a comment action menu waits for the popup with that comment author', () => {
    const h = harness('');
    h.feature.init();
    let pending = null;
    h.feature._injectWhenOpen = (author) => { pending = author; };
    const comment = fakeComment();
    const menuButton = { closest: (selector) => (selector === 'ytd-comment-view-model, ytd-comment-renderer' ? comment : null) };
    const target = { closest: (selector) => (selector === '#action-menu' ? menuButton : null) };
    h.listeners.get('click')({ target });
    assert.deepEqual(pending, { key: '@BreakingTheSystems', label: '@BreakingTheSystems' });

    pending = null;
    const unrelated = { closest: () => null };
    h.listeners.get('click')({ target: unrelated });
    assert.equal(pending, null, 'other clicks never open a block item');
});

test('editing the list in settings re-applies the hide rules, and destroy removes everything', () => {
    const h = harness('');
    h.feature.init();
    assert.ok(!h.styles.has('commentAuthorBlock'), 'an empty list injects no hide rule');
    h.settings.commentBlockedAuthors = '@NewSpammer';
    h.listeners.get('ytkit-settings-changed')({ detail: { key: 'commentBlockedAuthors' } });
    assert.ok(h.styles.get('commentAuthorBlock').css.includes('/@NewSpammer'));
    h.feature.destroy();
    assert.equal(h.styles.size, 0);
    assert.ok(!h.listeners.has('click'));
    assert.ok(!h.listeners.has('ytkit-settings-changed'));
});

test('findOpenMenu picks the visible YouTube menu popup and skips hidden dropdowns', () => {
    const listbox = { querySelector: (selector) => (selector.includes('ytd-menu-service-item-renderer') ? {} : null) };
    const popup = { querySelector: (selector) => (selector.includes('tp-yt-paper-listbox') ? listbox : null) };
    const makeDropdown = (attrs, style = {}) => ({
        hidden: false,
        style,
        getAttribute: (name) => attrs[name] ?? null,
        querySelector: (selector) => (selector === 'ytd-menu-popup-renderer' ? popup : null)
    });
    const hidden = makeDropdown({ 'aria-hidden': 'true' });
    const closed = makeDropdown({}, { display: 'none' });
    const open = makeDropdown({});
    const doc = { querySelectorAll: () => [hidden, closed, open] };
    const menu = findOpenMenu(doc);
    assert.equal(menu.dropdown, open);
    assert.equal(menu.host, popup);
    assert.equal(menu.after, listbox);
    assert.equal(findOpenMenu({ querySelectorAll: () => [hidden, closed] }), null);
});

// Signed out, YouTube renders the comment menu empty at zero size, and Studio
// Comments can hide it. Those comments get a Block button of their own when
// the pointer or keyboard focus enters them.

const { isMenuUsable } = require('../../extension/features/comment-author-block/index.js');

function fakeElement(tag) {
    const attrs = new Map();
    const listeners = new Map();
    const el = {
        tagName: tag.toUpperCase(),
        children: [],
        parent: null,
        className: '',
        setAttribute: (name, value) => attrs.set(name, String(value)),
        getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
        removeAttribute: (name) => attrs.delete(name),
        hasAttribute: (name) => attrs.has(name),
        appendChild(child) { child.parent = el; el.children.push(child); return child; },
        remove() {
            if (!el.parent) return;
            el.parent.children = el.parent.children.filter((node) => node !== el);
            el.parent = null;
        },
        addEventListener: (type, fn) => listeners.set(type, fn),
        click: () => listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }),
        closest(selector) {
            for (let node = el; node; node = node.parent) {
                if (selector.split(',').map((part) => part.trim().toUpperCase()).includes(node.tagName)) return node;
            }
            return null;
        }
    };
    return el;
}

function inlineHarness({ menu = 'zero', handle = '@SignedOutSpammer' } = {}) {
    const settings = { commentBlockedAuthors: '' };
    const listeners = new Map();
    const dispatched = [];
    const toasts = [];
    const buttons = [];
    const toolbar = fakeElement('div');
    const author = { textContent: handle, getAttribute: (name) => (name === 'href' ? `/${handle}` : null) };
    const menuEl = {
        querySelector: () => null,
        getBoundingClientRect: () => (menu === 'zero' ? { width: 0, height: 0 } : { width: 40, height: 40 })
    };
    const comment = fakeElement('ytd-comment-view-model');
    comment.appendChild(toolbar);
    comment.querySelector = (selector) => {
        if (selector === '#author-text') return author;
        if (selector === '#action-menu, #inline-action-menu') return menu === 'missing' ? null : menuEl;
        if (selector === '#toolbar') return toolbar;
        if (selector === '.ytkit-comment-block-inline') return toolbar.children[0] || null;
        return null;
    };
    const documentRef = {
        defaultView: {
            getComputedStyle: () => ({ display: menu === 'hidden' ? 'none' : 'inline-flex', visibility: 'visible' }),
            KeyboardEvent: class { constructor(type) { this.type = type; } }
        },
        createElement: (tag) => { const el = fakeElement(tag); buttons.push(el); return el; },
        createElementNS: (_ns, tag) => fakeElement(tag),
        querySelectorAll: (selector) => (selector === '.ytkit-comment-block-inline' ? buttons.filter((b) => b.parent)
            : selector === '[data-ytkit-block-checked]' ? [comment].filter((c) => c.hasAttribute('data-ytkit-block-checked')) : []),
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: (type) => listeners.delete(type),
        dispatchEvent: (event) => dispatched.push(event)
    };
    const [feature] = createCommentAuthorBlockFeatures({
        documentRef,
        readSetting: (key) => settings[key],
        writeSetting: (key, value) => { settings[key] = value; },
        showToast: (message) => toasts.push(message),
        setTimeoutFn: () => 1,
        clearTimeoutFn: () => {}
    });
    feature.init();
    const enter = (type = 'focusin') => listeners.get(type)({ target: comment });
    return { feature, settings, listeners, dispatched, toasts, toolbar, comment, author, enter };
}

test('isMenuUsable is false for a missing, hidden or zero-size comment menu', () => {
    const view = (display) => ({ getComputedStyle: () => ({ display, visibility: 'visible' }) });
    const comment = (menu) => ({ querySelector: () => menu });
    const sized = (width) => ({ querySelector: () => null, getBoundingClientRect: () => ({ width, height: width }) });
    assert.equal(isMenuUsable(comment(null), view('inline-flex')), false);
    assert.equal(isMenuUsable(comment(sized(40)), view('none')), false);
    assert.equal(isMenuUsable(comment(sized(0)), view('inline-flex')), false, 'signed out: rendered empty at zero size');
    assert.equal(isMenuUsable(comment(sized(40)), view('inline-flex')), true);
});

test('a comment whose menu is unusable gets a keyboard-reachable Block button', () => {
    for (const menu of ['zero', 'hidden', 'missing']) {
        const h = inlineHarness({ menu });
        h.enter('focusin');
        const [button] = h.toolbar.children;
        assert.ok(button, `${menu}: a button is offered`);
        assert.equal(button.tagName, 'BUTTON', 'a real button, so Tab and Enter reach it');
        assert.equal(button.getAttribute('aria-label'), 'Block @SignedOutSpammer');
        h.enter('mouseover');
        assert.equal(h.toolbar.children.length, 1, 'entering again adds no second button');

        button.click();
        assert.equal(h.settings.commentBlockedAuthors, '@SignedOutSpammer');
        assert.equal(h.dispatched.length, 0, 'no menu is open, so no Escape goes out');
        assert.match(h.toasts[0], /Blocked @SignedOutSpammer/);
    }
});

test('a comment with a working menu gets no extra button', () => {
    const h = inlineHarness({ menu: 'sized' });
    h.enter('mouseover');
    assert.equal(h.toolbar.children.length, 0);
});

test('a recycled comment element is checked again for its new author', () => {
    const h = inlineHarness();
    h.enter();
    h.author.textContent = '@SomeoneElse';
    h.author.getAttribute = (name) => (name === 'href' ? '/@SomeoneElse' : null);
    h.enter();
    const [button] = h.toolbar.children;
    assert.equal(h.toolbar.children.length, 1, 'the old button is replaced, not stacked');
    assert.equal(button.getAttribute('aria-label'), 'Block @SomeoneElse');
    button.click();
    assert.equal(h.settings.commentBlockedAuthors, '@SomeoneElse', 'the click reads the author the element holds now');
});

test('teardown and a menu-affecting setting change drop the offered buttons', () => {
    const h = inlineHarness();
    h.enter();
    h.listeners.get('ytkit-settings-changed')({ detail: { key: 'chatStyleComments' } });
    assert.equal(h.toolbar.children.length, 0);
    assert.equal(h.comment.hasAttribute('data-ytkit-block-checked'), false, 'the comment is checked again next time');
    h.enter();
    assert.equal(h.toolbar.children.length, 1);
    h.feature.destroy();
    assert.equal(h.toolbar.children.length, 0);
    assert.ok(!h.listeners.has('focusin') && !h.listeners.has('mouseover'));
});
