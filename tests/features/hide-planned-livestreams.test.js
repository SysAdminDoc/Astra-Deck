'use strict';

// The false positive here is expensive: a card wrongly matched as "scheduled"
// is hidden permanently, so a published video disappears from the feed. The
// old version reconstructed the two regexes out of the source text with a
// regex of its own; this loads the feature and asks it about whole cards,
// which is the question the feed actually asks.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    loadFeature,
    featureSource,
    fakeNode,
    fakeTreeDocument,
    selectorMatches,
} = require('../helpers/monolith');

const feature = loadFeature('hidePlannedLivestreams', {
    document: fakeTreeDocument(() => null),
    appState: { settings: {} },
});

/** A feed card carrying the given metadata rows and action-button labels. */
function card({ metadata = [], buttons = [] } = {}) {
    const node = fakeNode({ tag: 'ytd-rich-item-renderer' });
    const metaNodes = metadata.map((text) => fakeNode({ tag: 'span', text }));
    const buttonNodes = buttons.map((text) =>
        fakeNode({ tag: 'button', text, attributes: { 'aria-label': text } }));
    // One node per SHAPE the shipped selector lists reach for, and the
    // selector has to actually match it.
    //
    // Two earlier versions of this fixture were bypassable. Substring routing
    // answered any selector merely mentioning "metadata" or "button", so the
    // whole list could be replaced with something YouTube never renders. A
    // single modelled shape was no better: it pinned one branch and left the
    // other three free to be narrowed to nothing.
    //
    // YouTube renders these lockups in several shapes at once, so a card
    // carrying all of them is the realistic case as well as the strict one.
    const BUTTON_SHAPES = [
        (label) => ({ tag: 'button', attrs: { 'aria-label': label }, ancestors: [{ tag: 'yt-flexible-actions-view-model' }] }),
        (label) => ({ tag: 'button', attrs: { 'aria-label': label }, ancestors: [{ tag: 'div', className: 'ytFlexibleActionsViewModelAction' }] }),
        (label) => ({ tag: 'ytd-toggle-button-renderer', attrs: { 'aria-label': label } }),
        (label) => ({ tag: 'button', attrs: { 'aria-label': label } }),
    ];
    const META_SHAPES = [
        () => ({ tag: 'span', className: 'ytContentMetadataViewModelMetadataText' }),
        () => ({ tag: 'yt-content-metadata-view-model' }),
        () => ({ tag: 'div', id: 'metadata-line' }),
        () => ({ tag: 'ytd-video-meta-block' }),
        () => ({ tag: 'ytd-thumbnail-overlay-time-status-renderer' }),
        () => ({ tag: 'div', className: 'ytThumbnailBadgeViewModelHost' }),
        () => ({ tag: 'ytd-badge-supported-renderer' }),
    ];

    const buttonEntries = buttons.flatMap((text, index) =>
        BUTTON_SHAPES.map((shape) => [shape(text), buttonNodes[index]]));
    const metaEntries = metadata.flatMap((text, index) =>
        META_SHAPES.map((shape) => [shape(text), metaNodes[index]]));
    const entries = buttonEntries.concat(metaEntries);

    node.querySelectorAll = (selector) => {
        const hits = [];
        for (const [descriptor, value] of entries) {
            if (selectorMatches(selector, descriptor) && !hits.includes(value)) hits.push(value);
        }
        return hits;
    };
    return node;
}

/** The two selector lists `_isNotifyCard` reads off a card, as shipped. */
function shippedCardSelectorLists() {
    const block = featureSource('hidePlannedLivestreams');
    // Only the lists read off a CARD. The teardown sweep runs its own
    // querySelectorAll against the document.
    const scan = block.slice(block.indexOf('_isNotifyCard(card)'), block.indexOf('_applyTo(card)'));
    assert.ok(scan.length > 100, 'anchor: the card scan must exist');
    const lists = [...scan.matchAll(/querySelectorAll\(\s*'([^']+)'/g)].map((m) => m[1]);
    assert.equal(lists.length, 2, 'the feature reads a button list and a metadata list');
    return lists;
}

test('every branch of every shipped selector list resolves against the fixture', () => {
    // Guarding the guard, per branch. Asserting only that the LIST resolves
    // lets three of its four branches be narrowed to tags YouTube never
    // renders while the fourth carries the test — the feature loses most of
    // its reach and nothing goes red. If this fails because a selector
    // legitimately changed, the fixture above learns the new shape; it does
    // not get loosened.
    const probe = card({ metadata: ['UPCOMING'], buttons: ['Notify me'] });
    for (const list of shippedCardSelectorLists()) {
        const branches = list.split(',').map((one) => one.trim()).filter(Boolean);
        assert.ok(branches.length >= 2, `expected a real list, got ${JSON.stringify(list)}`);
        const dead = branches.filter((branch) => probe.querySelectorAll(branch).length === 0);
        assert.deepEqual(dead, [],
            'these branches match nothing the fixture models, so nothing pins them: ' + dead.join(' | '));
    }
    assert.equal(probe.querySelectorAll('.ytkit-no-such-node').length, 0,
        'and a selector that matches nothing gets nothing back');
});

test('a card whose metadata anchors in the future is a planned livestream', () => {
    const futureRows = [
        'Scheduled for 7/23/26, 9:45 PM',
        'Premieres 10/31/26, 8:00 PM',
        'Waiting for the creator',
        'Starts in 2 hours',
        'Live in 45 minutes',
        'UPCOMING',
        'Programado para mañana',
        'Prévu pour demain',
        'Geplant für morgen',
    ];
    for (const text of futureRows) {
        assert.equal(feature._isNotifyCard(card({ metadata: [text] })), true,
            `"${text}" anchors in the future`);
    }
});

test('a published video is never hidden, however its metadata reads', () => {
    // Every one of these is a card the user asked to see. A false positive
    // here removes it from the feed for good.
    const publishedRows = [
        'Premiered 7 hours ago',
        '1,234 views · Premiered 2 days ago',
        'Streamed live 3 hours ago',
        'Premiere Gal',
        'Live in the Studio',
        '12K views · 3 days ago',
        'LIVE',
        'Live now',
    ];
    for (const text of publishedRows) {
        assert.equal(feature._isNotifyCard(card({ metadata: [text] })), false,
            `"${text}" is not a scheduled card`);
    }
});

test('a reminder button marks the card even with no scheduled metadata', () => {
    for (const label of ['Notify me', 'Set reminder', 'Benachrichtigen', '设置提醒', '알림 받기']) {
        assert.equal(feature._isNotifyCard(card({ buttons: [label] })), true,
            `"${label}" is a reminder control`);
    }
});

test('an ordinary action button is not a reminder', () => {
    for (const label of ['Watch now', 'Share', 'Save to Watch Later', 'Join', 'Subscribe']) {
        assert.equal(feature._isNotifyCard(card({ buttons: [label] })), false,
            `"${label}" is not a reminder control`);
    }
});

test('the scheduled fallback never reads the video title', () => {
    // A VOD titled "Premieres of 2026" must survive. The feature only reads
    // metadata rows and badges, so a title node must not reach it.
    const titled = fakeNode({ tag: 'ytd-rich-item-renderer' });
    const title = fakeNode({ tag: 'h3', text: 'Scheduled for demolition: the 2026 premieres' });
    // Case-insensitive on purpose. YouTube's lockup renderers name their title
    // node `.ytLockupMetadataViewModelTitle`, and the selector lists this
    // feature scans are already in that camelCase style
    // (.ytContentMetadataViewModelMetadataText). A case-sensitive 'title'
    // router would hand back nothing for the camelCase spelling, so the
    // feature could start reading titles with this test still green.
    titled.querySelectorAll = (selector) => {
        const text = String(selector).toLowerCase();
        return text.includes('title') || text.includes('h3') ? [title] : [];
    };
    assert.equal(feature._isNotifyCard(titled), false,
        'a title that reads like a schedule must not hide the video');
});

test('teardown removes the rules, the marker class and the stylesheet', () => {
    const hidden = fakeNode({ tag: 'ytd-rich-item-renderer' });
    hidden.classList.add('ytkit-planned-livestream-hidden');
    const removedRules = [];
    const styleEl = fakeNode({ tag: 'style' });

    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('planned-livestream-hidden') ? [hidden] : null));
    // The stylesheet is taken down by id, not through the injectStyle handle.
    documentRef.getElementById = (id) =>
        (id === 'yt-suite-style-planned-livestream-hidden' ? styleEl : null);

    const scoped = loadFeature('hidePlannedLivestreams', {
        document: documentRef,
        appState: { settings: {} },
        window: { location: { pathname: '/feed/subscriptions' } },
        HTMLElement: function HTMLElement() {},
        injectStyle: () => styleEl,
        addScopedMutationRule: () => {},
        removeScopedMutationRule: (id) => removedRules.push(`scoped:${id}`),
        addNavigateRule: () => {},
        removeNavigateRule: (id) => removedRules.push(`nav:${id}`),
    });

    scoped.init();
    scoped.destroy();

    assert.deepEqual(removedRules.sort(),
        ['nav:hidePlannedLivestreams', 'scoped:hidePlannedLivestreams'],
        'both rules must be deregistered or they keep firing on every feed');
    assert.equal(hidden.classList.contains('ytkit-planned-livestream-hidden'), false,
        'a card hidden by this feature must come back when it is turned off');
    assert.equal(styleEl.removed, 1, 'and its stylesheet must go with it');
});
