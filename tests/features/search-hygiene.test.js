'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
    HIDDEN_ATTRIBUTE,
    createSearchHygieneFeatures,
    isWatchedOrRecommended
} = require('../../extension/features/search-hygiene/index.js');

class FakeNode {
    constructor(kind = '') {
        this.kind = kind;
        this.attributes = new Map();
        this.textContent = '';
        this.closestNode = null;
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    closest() { return this.closestNode; }

    querySelector(selector) {
        if (this.kind === 'related-shelf' && selector === 'yt-related-chip-cloud-renderer') return RELATED;
        if (this.kind === 'watched' && selector.includes('resume-playback')) return WATCHED_MARKER;
        return null;
    }

    querySelectorAll(selector) {
        if (selector.includes('recommendation-reason') && this.kind === 'reason-result') return [REASON];
        return [];
    }
}

const WATCHED_MARKER = new FakeNode('watched-marker');
const REASON = Object.assign(new FakeNode('reason'), { textContent: 'Recommended for you' });
const RELATED = new FakeNode('related');

function harness() {
    const unrelatedShelf = new FakeNode('unrelated-shelf');
    const relatedShelf = new FakeNode('related-shelf');
    const watched = new FakeNode('watched');
    const reasonResult = new FakeNode('reason-result');
    const plainResult = new FakeNode('plain-result');
    const recommendation = new FakeNode('recommendation');
    const correction = new FakeNode('correction');
    RELATED.closestNode = relatedShelf;

    const all = [unrelatedShelf, relatedShelf, watched, reasonResult, plainResult, recommendation, correction, RELATED];
    const root = {
        querySelectorAll(selector) {
            if (selector === 'yt-related-chip-cloud-renderer') return [RELATED];
            if (selector.includes('ytd-shelf-renderer')) return [unrelatedShelf, relatedShelf];
            if (selector.includes('ytd-compact-channel-recommendation-card-renderer')) return [recommendation];
            if (selector === 'ytd-video-renderer, yt-lockup-view-model') return [watched, reasonResult, plainResult];
            return [];
        }
    };
    let searchPage = true;
    const documentRef = {
        querySelectorAll(selector) {
            if (selector === 'search-root') return [root];
            if (selector === `[${HIDDEN_ATTRIBUTE}]`) return all.filter((node) => node.hasAttribute(HIDDEN_ATTRIBUTE));
            return [];
        }
    };
    const lifecycle = [];
    const features = createSearchHygieneFeatures({
        documentRef,
        isSearchPagePath: () => searchPage,
        getSurfaceSelectorChain: () => ['search-root'],
        addMutationRule: (id) => lifecycle.push(`add-mutation:${id}`),
        removeMutationRule: (id) => lifecycle.push(`remove-mutation:${id}`),
        addNavigateRule: (id) => lifecycle.push(`add-navigate:${id}`),
        removeNavigateRule: (id) => lifecycle.push(`remove-navigate:${id}`),
        injectStyle: () => ({ remove: () => lifecycle.push('remove-style') }),
        schedule: (callback) => callback()
    });
    return {
        features,
        nodes: { unrelatedShelf, relatedShelf, watched, reasonResult, plainResult, recommendation, correction },
        lifecycle,
        leaveSearch: () => { searchPage = false; features._controller.scan(); }
    };
}

test('watched and recommendation classification uses structural markers and bounded reason text', () => {
    assert.equal(isWatchedOrRecommended(new FakeNode('watched')), true);
    assert.equal(isWatchedOrRecommended(new FakeNode('reason-result')), true);
    assert.equal(isWatchedOrRecommended(new FakeNode('plain-result')), false);
});

test('three independent toggles share one scanner and preserve direct/correction states', () => {
    const { features, nodes, lifecycle } = harness();
    const byId = Object.fromEntries(features.map((feature) => [feature.id, feature]));

    byId.searchHideUnrelatedShelves.init();
    assert.equal(nodes.unrelatedShelf.getAttribute(HIDDEN_ATTRIBUTE), 'shelves');
    assert.equal(nodes.relatedShelf.hasAttribute(HIDDEN_ATTRIBUTE), false, 'related blocks stay independent');
    assert.equal(nodes.plainResult.hasAttribute(HIDDEN_ATTRIBUTE), false);
    assert.equal(nodes.correction.hasAttribute(HIDDEN_ATTRIBUTE), false);

    byId.searchHideRelatedSearches.init();
    assert.equal(nodes.relatedShelf.getAttribute(HIDDEN_ATTRIBUTE), 'related');
    byId.searchHideWatchedRecommended.init();
    assert.equal(nodes.watched.getAttribute(HIDDEN_ATTRIBUTE), 'interleaves');
    assert.equal(nodes.reasonResult.getAttribute(HIDDEN_ATTRIBUTE), 'interleaves');
    assert.equal(nodes.recommendation.getAttribute(HIDDEN_ATTRIBUTE), 'interleaves');
    assert.equal(lifecycle.filter((entry) => entry === 'add-mutation:searchHygiene').length, 1);

    byId.searchHideRelatedSearches.destroy();
    assert.equal(nodes.relatedShelf.hasAttribute(HIDDEN_ATTRIBUTE), false);
    assert.equal(nodes.unrelatedShelf.getAttribute(HIDDEN_ATTRIBUTE), 'shelves');
    byId.searchHideUnrelatedShelves.destroy();
    byId.searchHideWatchedRecommended.destroy();
    assert.ok(Object.values(nodes).every((node) => !node.hasAttribute(HIDDEN_ATTRIBUTE)));
    assert.ok(lifecycle.includes('remove-mutation:searchHygiene'));
    assert.ok(lifecycle.includes('remove-navigate:searchHygiene'));
});

test('leaving search restores every marked node without deleting YouTube DOM', () => {
    const { features, nodes, leaveSearch } = harness();
    for (const feature of features) feature.init();
    assert.ok(Object.values(nodes).some((node) => node.hasAttribute(HIDDEN_ATTRIBUTE)));
    leaveSearch();
    assert.ok(Object.values(nodes).every((node) => !node.hasAttribute(HIDDEN_ATTRIBUTE)));

    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'search-hygiene', 'index.js'),
        'utf8'
    );
    assert.match(source, /data-ytkit-search-hygiene-hidden/);
    assert.match(source, /yt-showing-results-for-renderer|ROOT_FALLBACK/);
    assert.doesNotMatch(source, /\.remove\(\)/, 'the scanner must never delete YouTube-owned nodes');
});

test('search-results selector pack is capture-backed and preserves semantic states by policy', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'core', 'selector-packs', 'searchResults.js'),
        'utf8'
    );
    assert.match(source, /mhtml\/SearchResults\.mhtml/);
    assert.match(source, /filters, spelling corrections, and no-results renderers/);
    assert.match(source, /ytd-search\[page-subtype="search"\]/);
});
