'use strict';

// The repo's own invariant, from the v4.53.0 note: any state keyed to a DOM
// node must re-evaluate per pass or track the element it was bound to.
//
// YouTube recycles nodes aggressively. ytd-watch-metadata survives every SPA
// navigation, feed cards are reused by continuations, and live chat reuses a
// small pool of renderers for the whole stream. Four features stamped a
// "judged" marker and never looked again, so the first verdict froze onto
// every later occupant: bot messages inherited an innocent pass, innocent
// messages inherited display:none, an ex-Shorts card stayed invisible as a
// regular video, and the precise view count went inert after one navigation.
//
// hideWatchedVideos was already fixed for exactly this class. These are the
// remaining four — and each is now proved by recycling a real node and asking
// the code again, which is the only way to catch a verdict that froze.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createSubscriptionGroupsFeature } = require('../extension/features/subscription-groups');
const {
    loadFeature,
    loadDeclarationsFrom,
    fakeNode,
    fakeTreeDocument,
} = require('./helpers/monolith');
const { sources } = require('./helpers/source');

// ── (a) preciseViewCounts ───────────────────────────────────────────────────

test('a navigation clears the precise-view markers off the recycled metadata element', () => {
    // ytd-watch-metadata survives SPA navigation, so its markers survive with it.
    const stamped = fakeNode({ tag: 'span', text: '1,234,567 views' });
    stamped.dataset.ytkitPrecise = '1';
    stamped.dataset.ytkitPreciseOriginal = '1.2M views';

    const rules = new Map();
    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('data-ytkit-precise') ? [stamped] : null));

    const feature = loadFeature('preciseViewCounts', {
        document: documentRef,
        appState: { settings: {} },
        addNavigateRule: (id, rule) => rules.set(id, rule),
        removeNavigateRule: (id) => rules.delete(id),
        addMutationRule: () => {},
        removeMutationRule: () => {},
        getPlayerResponseGlobal: () => null,
        setTimeout: () => 1,
        clearTimeout: () => {},
    });
    feature.init();

    const rule = rules.get('preciseViews');
    assert.ok(rule, 'the feature must register a navigate rule');
    rule();

    assert.equal(stamped.dataset.ytkitPrecise, undefined,
        'a marker that survives the navigation makes the element look already-done');
    assert.equal(stamped.dataset.ytkitPreciseOriginal, undefined,
        'leaving the saved original behind makes destroy() write video A text onto video B');
    assert.equal(stamped.textContent, '1,234,567 views',
        'the saved text belongs to the previous video; YouTube re-renders this element itself');
});

test('teardown still restores the text the feature replaced', () => {
    const stamped = fakeNode({ tag: 'span', text: '1,234,567 views' });
    stamped.dataset.ytkitPrecise = '1';
    stamped.dataset.ytkitPreciseOriginal = '1.2M views';

    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('data-ytkit-precise') ? [stamped] : null));
    const feature = loadFeature('preciseViewCounts', {
        document: documentRef,
        appState: { settings: {} },
        addNavigateRule: () => {},
        removeNavigateRule: () => {},
        addMutationRule: () => {},
        removeMutationRule: () => {},
        getPlayerResponseGlobal: () => null,
        setTimeout: () => 1,
        clearTimeout: () => {},
    });

    feature.destroy();
    assert.equal(stamped.textContent, '1.2M views',
        'with the navigate fix the stored original always belongs to the video on screen');
});

// ── (b) live chat ───────────────────────────────────────────────────────────

/** A live-chat renderer whose author and message can be swapped, as YouTube does. */
function chatMessage(author, text) {
    const node = fakeNode({ tag: 'yt-live-chat-text-message-renderer' });
    node.author = author;
    node.text = text;
    node.querySelector = (selector) => {
        if (String(selector).includes('author-name')) return { textContent: node.author };
        if (String(selector).includes('message')) return { textContent: node.text };
        return null;
    };
    node.style = { display: '' };
    return node;
}

function liveChat(messages, { keywords = '' } = {}) {
    const documentRef = fakeTreeDocument((selector) => {
        if (!String(selector).includes('yt-live-chat-text-message-renderer')) return null;
        if (String(selector).includes('[data-ytkit-kw-checked]')) {
            return messages.filter((node) => node.dataset.ytkitKwChecked !== undefined);
        }
        return messages;
    });
    return {
        document: documentRef,
        window: { location: { pathname: '/live_chat' } },
        isLiveChatPath: () => true,
        appState: { settings: { chatKeywordFilter: keywords } },
    };
}

for (const [label, source] of [['extension', sources.ytkit], ['userscript', sources.userscript]]) {
    test(`${label}: a recycled node holding a new message is judged again`, () => {
        const message = chatMessage('SomeBot', 'buy followers');
        const api = loadDeclarationsFrom(source,
            ['liveChatMessageFingerprint', 'applyBotFilter'], liveChat([message]));

        api.applyBotFilter();
        assert.equal(message.style.display, 'none', 'a bot message is hidden');
        assert.equal(message.classList.contains('yt-suite-hidden-bot'), true);

        // YouTube reuses the node for someone else entirely.
        message.author = 'RealPerson';
        message.text = 'hello everyone';
        api.applyBotFilter();

        assert.equal(message.style.display, '',
            'an innocent message must not inherit a bot message display:none');
        assert.equal(message.classList.contains('yt-suite-hidden-bot'), false);
    });

    test(`${label}: a recycled node holding a bot message does not inherit an innocent pass`, () => {
        const message = chatMessage('RealPerson', 'hello everyone');
        const api = loadDeclarationsFrom(source,
            ['liveChatMessageFingerprint', 'applyBotFilter'], liveChat([message]));

        api.applyBotFilter();
        assert.equal(message.style.display, '', 'an innocent message is left alone');

        message.author = 'SpamBot';
        message.text = 'buy followers';
        api.applyBotFilter();
        assert.equal(message.style.display, 'none',
            'the node was judged once; the message in it is new and must be judged again');
    });

    test(`${label}: the fingerprint distinguishes two messages from the same author`, () => {
        const api = loadDeclarationsFrom(source, ['liveChatMessageFingerprint'], {});
        const first = chatMessage('Someone', 'first message');
        const second = chatMessage('Someone', 'second message');
        assert.notEqual(api.liveChatMessageFingerprint(first), api.liveChatMessageFingerprint(second),
            'author alone is not enough: one author posts many messages through one recycled node');

        const same = chatMessage('Someone', 'first message');
        assert.equal(api.liveChatMessageFingerprint(first), api.liveChatMessageFingerprint(same),
            'and an unchanged message must not be re-judged on every pass');
    });
}

test('the keyword filter un-hides a recycled node whose verdict flipped', () => {
    const message = chatMessage('Someone', 'spoiler ahead');
    const api = loadDeclarationsFrom(sources.ytkit,
        ['_lastKeywordHash', 'liveChatMessageFingerprint', 'applyKeywordFilter'],
        liveChat([message], { keywords: 'spoiler' }));

    api.applyKeywordFilter();
    assert.equal(message.style.display, 'none', 'a matching message is hidden');
    assert.equal(message.classList.contains('yt-suite-hidden-keyword'), true);

    message.text = 'nothing to see here';
    api.applyKeywordFilter();
    assert.equal(message.style.display, '',
        'the non-empty-keyword path also needs an un-hide, not only the cleared-keywords path');
    assert.equal(message.classList.contains('yt-suite-hidden-keyword'), false);
});

test('clearing the keyword list reveals everything it had hidden', () => {
    const message = chatMessage('Someone', 'spoiler ahead');
    const globals = liveChat([message], { keywords: 'spoiler' });
    const api = loadDeclarationsFrom(sources.ytkit,
        ['_lastKeywordHash', 'liveChatMessageFingerprint', 'applyKeywordFilter'], globals);

    api.applyKeywordFilter();
    assert.equal(message.style.display, 'none');

    globals.appState.settings.chatKeywordFilter = '';
    api.applyKeywordFilter();
    assert.equal(message.style.display, '', 'turning the filter off must give the messages back');
});

// ── (c) removeAllShorts ─────────────────────────────────────────────────────

test('a card recycled out of Shorts is made visible again', () => {
    const card = fakeNode({ tag: 'ytd-rich-item-renderer' });
    card.dataset.ytkitShortsHidden = '1';
    card.style = { display: 'none' };
    let isShorts = false;
    card.querySelector = (selector) => (String(selector).includes('/shorts') && isShorts
        ? fakeNode({ tag: 'a' })
        : null);

    const attributions = [];
    const documentRef = fakeTreeDocument((selector) => {
        if (String(selector).includes('data-ytkit-shorts-hidden')) return [card];
        return [];
    });

    const feature = loadFeature('removeAllShorts', {
        document: documentRef,
        appState: { settings: { removeAllShorts: true } },
        window: { location: { pathname: '/feed/subscriptions' } },
        location: { pathname: '/feed/subscriptions' },
        addMutationRule: () => {},
        removeMutationRule: () => {},
        addNavigateRule: () => {},
        removeNavigateRule: () => {},
        injectStyle: () => ({ remove() {} }),
        applyHideAttribution: (element, options) => attributions.push({ element, ...options }),
        setTimeout: () => 1,
        clearTimeout: () => {},
    });
    feature.init();

    assert.equal(card.dataset.ytkitShortsHidden, undefined,
        'a hidden card with no Shorts link must be re-checked and released');
    assert.ok(attributions.some((entry) => entry.element === card && entry.hidden === false),
        'un-hiding without clearing attribution leaves the card counted as hidden');
});

// ── (d) subscription groups ─────────────────────────────────────────────────

test('the original-order stamp names the video it describes', () => {
    const feature = createSubscriptionGroupsFeature({
        addNavigateRule: () => {},
        removeNavigateRule: () => {},
        addScopedMutationRule: () => {},
        removeScopedMutationRule: () => {},
        injectStyle: () => ({ remove() {} }),
        storageReadJSON: (_key, fallback) => fallback,
        storageWriteJSON: () => {},
        appState: { settings: {} },
    });

    const card = fakeNode({ tag: 'ytd-rich-item-renderer' });
    let href = 'https://www.youtube.com/watch?v=AAAAAAAAAAA';
    card.querySelector = () => ({ href, getAttribute: () => href });

    assert.equal(feature._cardVideoId(card), 'AAAAAAAAAAA', 'the id must be parsed, not guessed');
    href = 'https://www.youtube.com/watch?v=BBBBBBBBBBB&list=PL1';
    assert.equal(feature._cardVideoId(card), 'BBBBBBBBBBB',
        'a card recycled into a different video reports the new id');

    href = 'https://www.youtube.com/feed/subscriptions';
    assert.equal(feature._cardVideoId(card) || '', '',
        'a card with no watch link has no id to stamp');
});
