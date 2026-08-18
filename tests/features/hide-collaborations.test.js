'use strict';

// The retired implementation scraped /feed/channels for the subscription list
// and hid every feed card whose byline was missing from it. That list is
// paginated and it read only the first shelf of the first section, so on a real
// account it hid 32 of 102 cards across 21 subscribed channels — while leaving
// both genuine collaborations visible, because a collaboration byline carries
// no /@handle link and so failed open. These tests pin the replacement: the
// structural avatar-stack marker, and a ratio guard that fails open.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadFeature, fakeNode, fakeDocument, featureSource } = require('../helpers/monolith');

const FIXTURE = fs.readFileSync(
    path.join(__dirname, '..', 'fixtures', 'subs-collaboration-cards.html'), 'utf8');

// Card counts taken from the capture the fixture was trimmed from.
const REAL_FEED_CARDS = 102;
const REAL_COLLABORATIONS = 2;

/** Build the feature with its own document, since it runs in a vm sandbox. */
function buildFeature(cards = []) {
    let feature = null;
    const doc = fakeDocument((selector) =>
        (feature && selector === feature._CARD_SELECTOR ? cards : []));
    feature = loadFeature('hideCollaborations', {
        document: doc,
        window: { location: { pathname: '/feed/subscriptions' } },
        DiagnosticLog: { record() {} }
    });
    return feature;
}

/** Comments describe the retired scrape by name; gate on code only. */
function codeOnly(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('//'))
        .join(' ');
}

/** A card whose querySelector answers only for the collaboration marker. */
function card(isCollaboration) {
    const node = fakeNode({ tag: 'ytd-rich-item-renderer' });
    node.querySelector = (selector) =>
        (isCollaboration && selector.includes('avatar-stack') ? fakeNode() : null);
    return node;
}

test('the collaboration marker matches real captured markup and nothing else on an ordinary card', () => {
    const feature = buildFeature();
    const selectorParts = feature._COLLAB_SELECTOR.split(',').map(s => s.trim());
    assert.ok(selectorParts.includes('yt-avatar-stack-view-model'),
        'the element name is the primary structural signal');
    assert.ok(selectorParts.some(part => part === '.ytAvatarStackViewModelHost'),
        'the host class is kept as a fallback for the element-name rename');

    const sections = FIXTURE.split(/<!-- (?=collaboration card|ordinary upload)/);
    const collaborations = sections.filter(s => s.startsWith('collaboration card'));
    const ordinary = sections.filter(s => s.startsWith('ordinary upload'));
    assert.equal(collaborations.length, 2, 'fixture carries both captured collaboration cards');
    assert.equal(ordinary.length, 2, 'fixture carries two wrongly-hidden ordinary uploads');

    for (const block of collaborations) {
        assert.match(block, /yt-avatar-stack-view-model|ytAvatarStackViewModelHost/,
            'a real collaboration card carries the stacked-avatar cluster');
    }
    for (const block of ordinary) {
        assert.doesNotMatch(block, /yt-avatar-stack-view-model|ytAvatarStackViewModelHost/,
            'an ordinary upload must not carry the collaboration marker');
        assert.match(block, /yt-decorated-avatar-view-model/,
            'the ordinary card still has its single-creator avatar — the two are distinguishable');
    }
});

test('a real-shaped feed hides only the collaboration cards', () => {
    const cards = Array.from({ length: REAL_FEED_CARDS },
        (_unused, index) => card(index < REAL_COLLABORATIONS));
    const feature = buildFeature(cards);
    feature._processVisibleCards();

    const hidden = cards.filter(c => c.classList.contains(feature._HIDDEN_CLASS));
    assert.equal(hidden.length, REAL_COLLABORATIONS,
        'exactly the two collaboration cards are hidden');
    for (let i = 0; i < REAL_COLLABORATIONS; i += 1) {
        assert.ok(cards[i].classList.contains(feature._HIDDEN_CLASS));
    }
    for (let i = REAL_COLLABORATIONS; i < cards.length; i += 1) {
        assert.equal(cards[i].classList.contains(feature._HIDDEN_CLASS), false,
            `ordinary upload ${i} must stay visible`);
    }

    // v4.68.0: hiding a card without saying who hid it is the v4.58.1 failure.
    // The attribution must agree with the CSS class exactly — every hidden card
    // attributed, no visible card attributed.
    const attributed = feature._testHideAttributionCalls.filter(call => call.hidden);
    assert.equal(attributed.length, REAL_COLLABORATIONS,
        'each hidden card must name the feature that hid it');
    for (const call of attributed) {
        assert.equal(call.featureId, 'hideCollaborations');
        assert.equal(call.rule, 'collaboration');
        assert.ok(cards.slice(0, REAL_COLLABORATIONS).includes(call.element),
            'attribution must land on the cards that were actually hidden');
    }
    const cleared = feature._testHideAttributionCalls.filter(call => !call.hidden);
    assert.equal(cleared.length, cards.length - REAL_COLLABORATIONS,
        'every card left visible must have its attribution explicitly cleared');
});

test('a pass that wants to hide a large share of the feed fails open instead', () => {
    // 32/102 is the share the retired subscription scrape actually hid.
    const cards = Array.from({ length: 102 }, (_unused, index) => card(index < 32));
    const feature = buildFeature(cards);
    cards.forEach(c => c.classList.add(feature._HIDDEN_CLASS));
    feature._processVisibleCards();

    const hidden = cards.filter(c => c.classList.contains(feature._HIDDEN_CLASS));
    assert.equal(hidden.length, 0,
        'over the ratio guard the feature reveals everything rather than hiding a third of the feed');
    // The bail restores every card, so it must retract the attribution too —
    // otherwise the popup would keep reporting 32 hides that were just undone.
    assert.equal(feature._testHideAttributionCalls.filter(call => call.hidden).length, 0,
        'a failing-open pass must not leave any card attributed as hidden');
    assert.equal(feature._testHideAttributionCalls.length, cards.length,
        'the bail must clear attribution on every card it restored');
});

test('the ratio guard does not fire on a small feed or a plausible collaboration share', () => {
    // Below the card floor: a 4-card feed where every card is a collaboration
    // is a real state, not a misfire.
    const tiny = Array.from({ length: 4 }, () => card(true));
    const tinyFeature = buildFeature(tiny);
    tinyFeature._processVisibleCards();
    assert.equal(tiny.filter(c => c.classList.contains(tinyFeature._HIDDEN_CLASS)).length, 4,
        'the guard must not swallow a genuinely collaboration-heavy short feed');

    // At the ratio boundary the feature still works.
    const atLimit = Array.from({ length: 100 }, (_unused, i) => card(i < 25));
    const limitFeature = buildFeature(atLimit);
    limitFeature._processVisibleCards();
    assert.equal(atLimit.filter(c => c.classList.contains(limitFeature._HIDDEN_CLASS)).length, 25,
        'exactly at the limit the pass is still trusted');
});

test('the subscription-list scrape is gone from both copies', () => {
    const source = codeOnly(featureSource('hideCollaborations'));
    for (const banned of ['/feed/channels', '_fetchSubscriptions', '_isSubscribed', 'ytInitialData']) {
        assert.ok(!source.includes(banned),
            `hideCollaborations must not reintroduce ${banned} — the paginated scrape is the defect`);
    }
    assert.ok(!source.includes('ytd-item-section-renderer'),
        'a whole feed section must never be a hide target');
    // The userscript copy used to call cardNode.remove(), which is
    // unrecoverable — turning the feature off could not bring the video back.
    for (const removal of ['cardNode.remove()', 'card.remove()', 'node.remove()']) {
        assert.ok(!source.includes(removal),
            `cards are class-toggled, never removed (${removal})`);
    }

    const userscript = fs.readFileSync(
        path.join(__dirname, '..', '..', 'YTKit.user.js'), 'utf8');
    const start = userscript.indexOf("id: 'hideCollaborations'");
    assert.ok(start > 0, 'the userscript carries the feature too');
    const block = codeOnly(userscript.slice(start, start + 6000));
    assert.ok(!block.includes('/feed/channels'),
        'the userscript copy must not keep the scrape');
    assert.ok(block.includes('_COLLAB_SELECTOR'),
        'the userscript copy uses the structural marker');
});
