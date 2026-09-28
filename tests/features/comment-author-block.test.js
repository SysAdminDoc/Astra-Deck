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
