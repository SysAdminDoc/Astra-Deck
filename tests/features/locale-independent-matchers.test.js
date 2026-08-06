'use strict';

// The five features that used to identify YouTube's own UI by matching
// English words. Each one is driven here against a NON-English fixture, so
// deleting the structural branch and leaving only the text test fails the
// test rather than silently making the feature inert on 10 of 11 locales.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

// The real shared parser — the structural view-count gate delegates to it.
require('../../extension/core/text-metrics.js');
const YTKitCore = globalThis.YTKitCore;

const flush = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── notInterestedButton ────────────────────────────────────────────────
test('notInterestedButton sends native feedback on a Japanese menu', async () => {
    // The item YouTube renders as "興味なし" carries iconType NOT_INTERESTED.
    const target = fakeNode({
        tag: 'ytd-menu-service-item-renderer',
        text: '興味なし',
        data: { icon: { iconType: 'NOT_INTERESTED' } }
    });
    const other = fakeNode({
        tag: 'ytd-menu-service-item-renderer',
        text: 'チャンネルをおすすめに表示しない',
        data: { icon: { iconType: 'REMOVE' } }
    });
    const menuBtn = fakeNode({ tag: 'button' });
    let menuRendered = false;

    const document = fakeDocument((selector) => {
        if (selector.includes('ytd-menu-renderer')) return menuBtn;
        if (selector === 'ytd-menu-service-item-renderer') return menuRendered ? [target, other] : [];
        return [];
    });
    const feature = loadFeature('notInterestedButton', { document });
    feature._feedbackTimers = new Set();

    const card = fakeNode({ tag: 'ytd-rich-item-renderer' });
    card.querySelector = (selector) => (selector.includes('ytd-menu-renderer') ? menuBtn : null);

    feature._applyNativeFeedback(card);
    assert.equal(menuBtn.clicked, 1, 'the card menu must be opened');
    // Menu contents arrive after the click — the old single-rAF read looked
    // before this point and found nothing even on an English UI.
    menuRendered = true;
    await flush(400);

    assert.equal(target.clicked, 1, 'the NOT_INTERESTED item must be clicked');
    assert.equal(other.clicked, 0, 'the "don\'t recommend channel" item must not be clicked');
    feature._feedbackTimers.forEach(clearTimeout);
});

test('notInterestedButton closes the menu it opened when no item matches', async () => {
    const menuBtn = fakeNode({ tag: 'button' });
    const dropdown = fakeNode({ tag: 'tp-yt-iron-dropdown' });
    const document = fakeDocument((selector) => {
        if (selector.includes('ytd-menu-renderer')) return menuBtn;
        if (selector.includes('tp-yt-iron-dropdown')) return dropdown;
        return [];
    });
    const feature = loadFeature('notInterestedButton', { document });
    feature._feedbackTimers = new Set();

    const card = fakeNode({ tag: 'ytd-rich-item-renderer' });
    card.querySelector = (selector) => (selector.includes('ytd-menu-renderer') ? menuBtn : null);

    feature._applyNativeFeedback(card);
    await flush(1000);
    assert.equal(document.body.clicked, 1, 'a dangling dropdown must be dismissed');
    feature._feedbackTimers.forEach(clearTimeout);
});

// ── sortCommentsNewest ─────────────────────────────────────────────────
test('sortCommentsNewest reads the active sort from renderer data, not English text', () => {
    const subMenu = (selectedIndex) => fakeNode({
        tag: 'yt-sort-filter-sub-menu-renderer',
        data: {
            subMenuItems: [
                { title: 'Kommentar-Highlights', selected: selectedIndex === 0 },
                { title: 'Neueste zuerst', selected: selectedIndex === 1 }
            ]
        }
    });

    const already = loadFeature('sortCommentsNewest', {
        document: fakeDocument(sel => (sel.includes('sub-menu-renderer') ? subMenu(1) : []))
    });
    assert.equal(already._isAlreadyNewest(fakeNode({ text: 'Neueste zuerst' })), true,
        'a German UI already on "Neueste zuerst" must not re-open the sort menu');

    const notYet = loadFeature('sortCommentsNewest', {
        document: fakeDocument(sel => (sel.includes('sub-menu-renderer') ? subMenu(0) : []))
    });
    assert.equal(notYet._isAlreadyNewest(fakeNode({ text: 'Top-Kommentare' })), false);
});

test('sortCommentsNewest picks the newest option positionally on a non-English UI', () => {
    const top = fakeNode({ tag: 'tp-yt-paper-item', text: 'Top-Kommentare' });
    const newest = fakeNode({ tag: 'tp-yt-paper-item', text: 'Neueste zuerst' });
    const dropdown = fakeNode({ tag: 'tp-yt-iron-dropdown' });
    dropdown.querySelectorAll = () => [top, newest];
    const subMenu = fakeNode({
        tag: 'yt-sort-filter-sub-menu-renderer',
        data: { subMenuItems: [{ selected: true }, { selected: false }] }
    });

    const feature = loadFeature('sortCommentsNewest', {
        document: fakeDocument((selector) => {
            if (selector.includes('tp-yt-iron-dropdown')) return dropdown;
            if (selector.includes('sub-menu-renderer')) return subMenu;
            return [];
        })
    });

    assert.equal(feature._pickNewestOption(), newest,
        'the second option is "newest first" regardless of the UI language');
});

test('sortCommentsNewest refuses to click an unrelated dropdown', () => {
    // Three items means the open dropdown is not the two-item sort menu.
    const items = ['Teilen', 'Melden', 'Transkript'].map(text =>
        fakeNode({ tag: 'tp-yt-paper-item', text }));
    const dropdown = fakeNode({ tag: 'tp-yt-iron-dropdown' });
    dropdown.querySelectorAll = () => items;
    const subMenu = fakeNode({
        tag: 'yt-sort-filter-sub-menu-renderer',
        data: { subMenuItems: [{ selected: true }, { selected: false }] }
    });

    const feature = loadFeature('sortCommentsNewest', {
        document: fakeDocument((selector) => {
            if (selector.includes('tp-yt-iron-dropdown')) return dropdown;
            if (selector.includes('sub-menu-renderer')) return subMenu;
            return [];
        })
    });

    assert.equal(feature._pickNewestOption(), null,
        'a dropdown that is not the sort menu must never be clicked positionally');
});

// ── autoLikeSubscribed ─────────────────────────────────────────────────
test('autoLikeSubscribed reads subscription state structurally', () => {
    const subscribedRenderer = fakeNode({
        tag: 'ytd-subscribe-button-renderer',
        text: '登録済み',
        data: { subscribed: true }
    });
    const subscribed = loadFeature('autoLikeSubscribed', {
        document: fakeDocument(sel => (sel.includes('subscribe-button') ? subscribedRenderer : []))
    });
    assert.equal(subscribed._isSubscribed(), true,
        'renderer data must be trusted on a Japanese UI where "subscribed" never appears');

    const pressedButton = fakeNode({ tag: 'button', attributes: { 'aria-pressed': 'true' } });
    const viaAria = loadFeature('autoLikeSubscribed', {
        document: fakeDocument((selector) => {
            if (selector.includes('ytd-subscribe-button-renderer button')) return pressedButton;
            return [];
        })
    });
    assert.equal(viaAria._isSubscribed(), true, 'aria-pressed is the modern button-view-model signal');

    const notSubscribed = fakeNode({
        tag: 'ytd-subscribe-button-renderer',
        text: 'チャンネル登録',
        data: { subscribed: false }
    });
    const off = loadFeature('autoLikeSubscribed', {
        document: fakeDocument(sel => (sel.includes('subscribe-button') ? notSubscribed : []))
    });
    assert.equal(off._isSubscribed(), false, 'an unsubscribed channel must stay unsubscribed');
});

// ── watchLaterQuickAdd ─────────────────────────────────────────────────
test('watchLaterQuickAdd finds the Watch Later item by its playlist endpoint', () => {
    const share = fakeNode({
        tag: 'ytd-menu-service-item-renderer',
        text: 'Partager',
        data: { serviceEndpoint: {} }
    });
    const watchLater = fakeNode({
        tag: 'ytd-menu-service-item-renderer',
        text: 'Enregistrer dans À regarder plus tard',
        data: { serviceEndpoint: { playlistEditEndpoint: { playlistId: 'WL' } } }
    });
    const queue = fakeNode({
        tag: 'ytd-menu-service-item-renderer',
        text: 'Ajouter à la file d’attente',
        data: { serviceEndpoint: { playlistEditEndpoint: { playlistId: 'PL123' } } }
    });

    const feature = loadFeature('watchLaterQuickAdd', {
        document: fakeDocument(() => [share, watchLater, queue])
    });

    assert.equal(feature._findWatchLaterMenuItem(), watchLater,
        'the WL playlist endpoint identifies the item in any language');
});

test('watchLaterQuickAdd still matches English text when no endpoint is exposed', () => {
    const items = [
        fakeNode({ tag: 'ytd-menu-service-item-renderer', text: 'Add to queue' }),
        fakeNode({ tag: 'ytd-menu-service-item-renderer', text: 'Save to Watch later' })
    ];
    const feature = loadFeature('watchLaterQuickAdd', { document: fakeDocument(() => items) });
    assert.equal(feature._findWatchLaterMenuItem(), items[1]);

    const noMatch = loadFeature('watchLaterQuickAdd', {
        document: fakeDocument(() => [items[0]])
    });
    assert.equal(noMatch._findWatchLaterMenuItem(), null);
});

// ── preciseViewCounts ──────────────────────────────────────────────────
test('preciseViewCounts replaces a localized truncated count', () => {
    const infoEl = fakeNode({ tag: 'yt-formatted-string', text: '12.3万 回視聴' });
    const feature = loadFeature('preciseViewCounts', {
        document: fakeDocument(sel => (sel.includes('info') || sel.includes('view-count') ? infoEl : [])),
        _rw: { ytInitialPlayerResponse: { videoDetails: { viewCount: '1234567' } } },
        YTKitCore
    });
    // Only the count branch is under test here.
    feature._renderExactUploadDate = () => {};
    feature._process();

    assert.equal(infoEl.dataset.ytkitPrecise, '1',
        'a Japanese view-count line must be recognised as a view count');
    assert.match(infoEl.textContent, /1,234,567/);
    assert.equal(infoEl.dataset.ytkitPreciseOriginal, '12.3万 回視聴');
});

test('preciseViewCounts leaves a line that carries no count alone', () => {
    const infoEl = fakeNode({ tag: 'yt-formatted-string', text: 'Streamed 3 years ago' });
    const feature = loadFeature('preciseViewCounts', {
        document: fakeDocument(sel => (sel.includes('info') || sel.includes('view-count') ? infoEl : [])),
        _rw: { ytInitialPlayerResponse: { videoDetails: { viewCount: '1234567' } } },
        YTKitCore
    });
    feature._renderExactUploadDate = () => {};
    feature._process();

    assert.equal(infoEl.dataset.ytkitPrecise, undefined);
    assert.equal(infoEl.textContent, 'Streamed 3 years ago');
});
