'use strict';

// The false positive here is expensive: a card wrongly matched as "scheduled"
// is hidden permanently, so a published video disappears from the feed. The
// old version reconstructed the two regexes out of the source text with a
// regex of its own; this loads the feature and asks it about whole cards,
// which is the question the feed actually asks.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFeature, fakeNode, fakeTreeDocument } = require('../helpers/monolith');

const feature = loadFeature('hidePlannedLivestreams', {
    document: fakeTreeDocument(() => null),
    appState: { settings: {} },
});

/** A feed card carrying the given metadata rows and action-button labels. */
function card({ metadata = [], buttons = [] } = {}) {
    const node = fakeNode({ tag: 'ytd-rich-item-renderer' });
    const metaNodes = metadata.map((text) => fakeNode({ tag: 'span', text }));
    const buttonNodes = buttons.map((text) => fakeNode({ tag: 'button', text }));
    node.querySelectorAll = (selector) => {
        if (String(selector).includes('button')) return buttonNodes;
        if (String(selector).includes('Metadata') || String(selector).includes('metadata')
            || String(selector).includes('badge') || String(selector).includes('Badge')) return metaNodes;
        return [];
    };
    return node;
}

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
