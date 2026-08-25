'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    extractLoadedAgeMs,
    normalizeLocalizedDigits,
    normalizeOrderMode,
    normalizeViewMode,
    parseRelativeAgeMs,
    sortLoadedCards
} = require('../../extension/features/subscription-view/index.js');
const { collectFakeTree, fakeNode, fakeTreeDocument } = require('../helpers/monolith');

class FakeCard {
    constructor(label, metadata) {
        this.label = label;
        this.metadata = metadata;
        this.attributes = new Map();
        this.dataset = {};
    }

    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    querySelector() { return null; }
    querySelectorAll() { return [{ textContent: this.metadata }]; }
}

function sortableHarness(cards, continuation = null) {
    const container = {
        cards: [...cards],
        continuation,
        insertBeforeAnchors: [],
        querySelectorAll(selector) {
            if (String(selector).includes('continuation')) {
                return this.continuation ? [this.continuation] : [];
            }
            return [...this.cards];
        },
        appendChild(fragment) { this.cards = [...fragment.children]; },
        insertBefore(fragment, anchor) {
            this.insertBeforeAnchors.push(anchor);
            this.cards = [...fragment.children];
        }
    };
    const documentRef = {
        createDocumentFragment() {
            return {
                children: [],
                appendChild(card) { this.children.push(card); }
            };
        }
    };
    return { container, documentRef };
}

test('relative upload ages parse across every supported locale family', () => {
    const cases = [
        ['5 minutes ago', 5 * 60_000],
        ['vor 2 Tagen', 2 * 86_400_000],
        ['hace 3 semanas', 3 * 604_800_000],
        ['il y a 4 heures', 4 * 3_600_000],
        ['2 mesi fa', 2 * 2_629_746_000],
        ['há 6 dias', 6 * 86_400_000],
        ['7 дней назад', 7 * 86_400_000],
        ['8日前', 8 * 86_400_000],
        ['9일 전', 9 * 86_400_000],
        ['10天前', 10 * 86_400_000],
        ['قبل ٣ ساعات', 3 * 3_600_000],
        ['111K views · 5 days ago', 5 * 86_400_000]
    ];
    for (const [value, expected] of cases) assert.equal(parseRelativeAgeMs(value), expected, value);
    assert.equal(normalizeLocalizedDigits('١٢۳'), '123');
    assert.equal(parseRelativeAgeMs('Premiered live'), null);
});

test('newest-loaded sorting is stable, deterministic, and reverses to the stamped native order', () => {
    const old = new FakeCard('old', '2 days ago');
    const newestA = new FakeCard('new-a', '5 minutes ago');
    const unknown = new FakeCard('unknown', 'Premiere');
    const newestB = new FakeCard('new-b', '5 minutes ago');
    const original = [old, newestA, unknown, newestB];
    const { container, documentRef } = sortableHarness(original);

    assert.equal(sortLoadedCards(container, 'newest-loaded', documentRef), 4);
    assert.deepEqual(container.cards.map((card) => card.label), ['new-a', 'new-b', 'old', 'unknown']);
    assert.equal(sortLoadedCards(container, 'newest-loaded', documentRef), 4, 'already-sorted cards remain stable');
    assert.deepEqual(container.cards.map((card) => card.label), ['new-a', 'new-b', 'old', 'unknown']);

    sortLoadedCards(container, 'native', documentRef);
    assert.deepEqual(container.cards, original);
});

test('sorting keeps the infinite-scroll continuation renderer after the cards', () => {
    // Regression: the sorted fragment was appended past the continuation
    // renderer, pinning a permanently-intersecting spinner at the top of
    // the feed and misplacing YouTube's continuation inserts.
    const continuation = { label: 'continuation' };
    const { container, documentRef } = sortableHarness([
        new FakeCard('old', '2 days ago'),
        new FakeCard('new', '5 minutes ago')
    ], continuation);
    assert.equal(sortLoadedCards(container, 'newest-loaded', documentRef), 2);
    assert.deepEqual(container.cards.map((card) => card.label), ['new', 'old']);
    assert.deepEqual(container.insertBeforeAnchors, [continuation],
        'the sorted cards must be inserted before the continuation renderer');
});

test('exact datetime metadata takes priority over relative card text', () => {
    const card = new FakeCard('exact', '3 years ago');
    card.dataset.publishedAt = '2026-07-14T10:00:00.000Z';
    const now = Date.parse('2026-07-14T11:00:00.000Z');
    assert.equal(extractLoadedAgeMs(card, now), 3_600_000);
});

test('view and order settings fail closed to their persisted defaults', () => {
    assert.equal(normalizeViewMode('list'), 'list');
    assert.equal(normalizeViewMode('unexpected'), 'grid');
    assert.equal(normalizeOrderMode('newest-loaded'), 'newest-loaded');
    assert.equal(normalizeOrderMode('unexpected'), 'native');
});

function controlsHarness({ groupToolbar = null } = {}) {
    const browse = fakeNode({ tag: 'ytd-browse' });
    const feed = fakeNode({ tag: 'ytd-rich-grid-renderer' });
    const host = fakeNode({ tag: 'div', children: groupToolbar ? [groupToolbar, feed] : [feed] });
    for (const node of [host, groupToolbar].filter(Boolean)) {
        node.querySelectorAll = (selector) => collectFakeTree(node, selector);
        node.querySelector = (selector) => node.querySelectorAll(selector)[0] || null;
    }
    const documentRef = fakeTreeDocument((selector) => {
        if (selector.includes('ytd-browse')) return browse;
        if (selector === 'ytd-rich-grid-renderer, ytd-section-list-renderer') return feed;
        if (selector === '.ytkit-sub-toolbar') return groupToolbar;
        if (selector.includes('ytd-rich-grid-renderer #contents')) return [];
        if (selector.includes('data-ytkit-sub-view-original-index')) return [];
        return null;
    });
    documentRef.body.appendChild(browse);
    browse.appendChild(host);
    const saves = [];
    const feature = require('../../extension/features/subscription-view/index.js').createSubscriptionViewFeature({
        appState: { settings: { subscriptionViewMode: 'list', subscriptionOrderMode: 'newest-loaded' } },
        settingsManager: { save: (settings) => saves.push({ ...settings }) },
        documentRef,
        windowRef: { location: { pathname: '/feed/subscriptions' } },
        getSurfaceSelectorChain: () => ['ytd-browse'],
        injectStyle: () => ({ remove() {} }),
        schedule: () => 1,
        cancelSchedule() {}
    });
    feature.init();
    feature._mountControls();
    return { browse, documentRef, feature, feed, groupToolbar, host, saves };
}

test('subscription layouts render one labelled toolbar with persistent view state', () => {
    const { browse, feature, feed, host, saves } = controlsHarness();

    assert.equal(host.children.length, 2);
    const toolbar = host.children[0];
    assert.equal(host.children[1], feed, 'the controls attach before the native feed');
    assert.equal(toolbar.className, 'ytkit-sub-view-toolbar');
    assert.equal(toolbar.getAttribute('role'), 'toolbar');
    assert.equal(toolbar.getAttribute('aria-label'), 'Subscription view controls');
    const controls = toolbar.querySelector('.ytkit-sub-view-controls');
    assert.equal(controls.getAttribute('role'), 'group');
    const buttons = controls.querySelectorAll('button[data-view-mode]');
    assert.equal(buttons.length, 3);
    assert.deepEqual(buttons.map((button) => button.textContent), ['Grid', 'List', 'Compact']);
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
    const select = controls.querySelector('#ytkit-sub-view-order');
    assert.ok(select);
    assert.equal(select.children.length, 2);
    assert.equal(select.children[1].textContent, 'Newest first (loaded only)');

    const compactClick = [...buttons[2].listeners.get('click')][0];
    compactClick();
    assert.equal(buttons[2].getAttribute('aria-pressed'), 'true');
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
    assert.equal(browse.getAttribute('data-ytkit-subscription-view'), 'compact');
    assert.equal(saves.at(-1).subscriptionViewMode, 'compact');

    feature.destroy();
    assert.equal(host.querySelector('.ytkit-sub-view-toolbar'), null);
    assert.equal(browse.hasAttribute('data-ytkit-subscription-view'), false);
});

test('subscription layout stylesheet preserves native lockup semantics and actions', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'subscription-view', 'index.js'),
        'utf8'
    );
    assert.match(source, /ytLockupMetadataViewModelDescription/);
    assert.match(source, /ytLockupViewModelMetadata/);
    assert.match(source, /forced-colors:active/);
    assert.match(source, /prefers-reduced-motion:reduce/);
    assert.doesNotMatch(source, /innerHTML|replaceChildren/);
    assert.doesNotMatch(source, /querySelectorAll[^\n]*button[^\n]*\.remove/);
});

test('subscriptions selector pack is backed by the captured modern lockup feed', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'core', 'selector-packs', 'subscriptions.js'),
        'utf8'
    );
    assert.match(source, /Subscriptions - YouTube\.mhtml/);
    assert.match(source, /ytd-rich-grid-renderer ytd-rich-item-renderer\[lockup\]/);
    assert.match(source, /never replace native card semantics or actions/);
});

test('subscription order defers to the group toolbar with an on-screen explanation', () => {
    const groupToolbar = fakeNode({ tag: 'div', attributes: { class: 'ytkit-sub-toolbar' } });
    const { feature } = controlsHarness({ groupToolbar });

    const controls = groupToolbar.querySelector('.ytkit-sub-view-controls');
    assert.ok(controls, 'view controls attach inside the group toolbar');
    assert.equal(controls.querySelector('#ytkit-sub-view-order'), null,
        'the group toolbar keeps ownership of ordering');
    const status = controls.querySelector('.ytkit-sub-view-hint');
    assert.equal(status.getAttribute('role'), 'status');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.match(status.textContent, /group toolbar orders this feed/i);

    feature.destroy();
    assert.equal(groupToolbar.querySelector('.ytkit-sub-view-controls'), null);
});
