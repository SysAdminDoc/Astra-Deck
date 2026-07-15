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

test('subscription layouts preserve native semantic content and actions', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'subscription-view', 'index.js'),
        'utf8'
    );
    assert.match(source, /aria-pressed/);
    assert.match(source, /role', 'toolbar'/);
    assert.match(source, /Newest first \(loaded only\)/);
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
