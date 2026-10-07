'use strict';

// Hide All on Subscriptions.
//
// Hiding every card on screen collapses the grid, so YouTube's load trigger
// comes into view and the next page arrives. That page used to arrive
// unhidden and the user had to press Hide All again, page after page. The
// sweep keeps hiding pages as they land, stops at the first page that comes
// in already hidden (where the last clear ended), and pauses loading.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHideVideosFromHomeFeature } = require('../../extension/features/video-hider/index.js');

const id = (n) => `vid${String(n).padStart(8, '0')}`;
const range = (start, count) => Array.from({ length: count }, (_, i) => id(start + i));

function createFeed({ path = '/feed/subscriptions', stored = [], settings = {} } = {}) {
    const cards = [];
    const toasts = [];
    const timers = new Map();
    let nextTimer = 1;
    let hiddenList = stored.slice();
    const calls = { block: 0, resume: 0, unblock: 0 };

    const previous = { window: globalThis.window, document: globalThis.document };
    globalThis.window = { location: { pathname: path } };
    globalThis.document = { querySelectorAll: () => cards.map((card) => card.element) };

    const feature = createHideVideosFromHomeFeature({
        appState: { settings },
        IMPORT_LIMITS: { hiddenVideos: 5000, allowedVideos: 5000, markedWatchedVideos: 5000, blockedChannels: 2000 },
        showToast: (message, color, options) => toasts.push({ message, actions: (options?.actions || []).map((a) => a.text), options }),
        t: (_key, fallback) => fallback,
        setTimeoutFn: (fn, ms) => { const handle = nextTimer++; timers.set(handle, { fn, ms }); return handle; },
        clearTimeoutFn: (handle) => timers.delete(handle)
    });
    feature._getHiddenVideos = () => hiddenList.slice();
    feature._setHiddenVideos = (list) => { hiddenList = list.slice(); };
    feature._removeAllowedVideos = () => [];
    feature._addAllowedVideos = () => [];
    feature._isScopeEnabledForPath = () => true;
    feature._extractVideoId = (el) => el.videoId;
    feature._applyVideoHiddenState = (el, hidden) => { el.hidden = hidden; };
    feature._updatePageActionButtons = () => {};
    feature._restoreRemovedVideoNodes = () => {};
    feature._showManager = () => {};
    feature._blockSubsLoading = () => { calls.block += 1; feature._subsLoadState.loadingBlocked = true; };
    feature._resumeSubsLoading = () => { calls.resume += 1; feature._subsLoadState.loadingBlocked = false; };
    feature._removeLoadBlocker = () => { calls.unblock += 1; feature._subsLoadState.loadingBlocked = false; };
    feature._getVisibleVideos = () => cards
        .filter((card) => !card.element.hidden)
        .map((card) => ({ id: card.element.videoId, element: card.element }));

    /** YouTube appends a page; cards on the user's hidden list arrive hidden. */
    const loadPage = (ids) => {
        const added = ids.map((videoId) => {
            const element = {
                videoId,
                hidden: hiddenList.includes(videoId),
                classList: { remove(name) { if (name === 'ytkit-video-hidden') element.hidden = false; } }
            };
            cards.push({ element });
            return element;
        });
        return added.map((element) => ({ element, hidden: element.hidden }));
    };
    const fireIdle = () => {
        const pending = [...timers.values()];
        timers.clear();
        pending.forEach((timer) => timer.fn());
    };
    const restore = () => {
        globalThis.window = previous.window;
        globalThis.document = previous.document;
    };
    return { feature, cards, toasts, calls, loadPage, fireIdle, restore, hidden: () => hiddenList.slice() };
}

test('Hide All keeps hiding pages as they load and stops where the last clear ended', (t) => {
    const older = range(90, 24);
    const feed = createFeed({ stored: older });
    t.after(feed.restore);

    feed.loadPage([id(1), id(2), id(3)]);
    feed.feature._hideAllVideos();
    assert.ok(feed.feature._hideAllSweep, 'the sweep keeps running after the first page');
    assert.equal(feed.toasts.at(-1).message, 'Hidden 3 videos. Hiding the rest as they load.');
    assert.deepEqual(feed.toasts.at(-1).actions, ['Stop']);

    // The grid collapsed and YouTube loaded the next page.
    feed.feature._continueHideAllSweep(feed.loadPage([id(4), id(5), id(6), id(7)]));
    assert.ok(feed.cards.every((card) => card.element.hidden), 'the lazy-loaded page is hidden too');
    assert.ok(feed.feature._hideAllSweep, 'a page that needed hiding keeps the sweep going');

    // Lockups get re-queued when their channel data lands. Cards the sweep
    // already judged are not a new page, however many of them there are.
    feed.feature._continueHideAllSweep(feed.cards.map((card) => ({ element: card.element, hidden: true })));
    assert.ok(feed.feature._hideAllSweep, 're-queued cards must not read as "caught up"');

    // The next page is the one the user cleared last time: a long run of
    // cards that arrive already hidden.
    feed.feature._continueHideAllSweep(feed.loadPage(older));
    assert.equal(feed.feature._hideAllSweep, null, 'a page that arrives already hidden ends the sweep');
    assert.equal(feed.calls.block, 1, 'and loading pauses, so the empty feed stops fetching');
    assert.equal(feed.toasts.at(-1).message, 'Hidden 7 videos');
    assert.deepEqual(feed.toasts.at(-1).actions, ['Undo All', 'Manage']);
    for (let n = 1; n <= 7; n += 1) assert.ok(feed.hidden().includes(id(n)), `${id(n)} is on the hidden list`);
});

test('Undo All brings back every card the sweep hid and lifts the pause', (t) => {
    const older = range(90, 24);
    const feed = createFeed({ stored: older });
    t.after(feed.restore);

    feed.loadPage([id(1), id(2)]);
    feed.feature._hideAllVideos();
    feed.feature._continueHideAllSweep(feed.loadPage([id(3), id(4), id(5)]));
    feed.feature._continueHideAllSweep(feed.loadPage(older));
    assert.equal(feed.calls.block, 1);

    feed.toasts.at(-1).options.actions.find((action) => action.text === 'Undo All').onClick();
    assert.deepEqual(feed.hidden(), older, 'only the sweep\'s ids come off the list');
    assert.ok([1, 2, 3, 4, 5].every((n) => !feed.cards.find((card) => card.element.videoId === id(n)).element.hidden));
    assert.equal(feed.calls.unblock, 1, 'the restored cards fill the feed, so loading resumes');
});

test('one batch can hold new cards, the earlier clear and more after it', (t) => {
    // Measured live: with the grid collapsed, YouTube loaded pages back to
    // back, faster than batches flush, so a batch with nothing left to hide
    // never came and the sweep ran on to its cap.
    const older = range(90, 24);
    const feed = createFeed({ stored: older });
    t.after(feed.restore);

    feed.loadPage(range(1, 3));
    feed.feature._hideAllVideos();
    feed.feature._continueHideAllSweep(feed.loadPage([...range(10, 6), ...older, ...range(200, 5)]));
    assert.equal(feed.feature._hideAllSweep, null, 'the run of already-hidden cards is the earlier clear');
    assert.equal(feed.calls.block, 1);
    assert.ok(feed.cards.every((card) => card.element.hidden),
        'cards past the earlier clear are hidden too, not left under an empty feed');
});

test('a short or broken run of hidden cards keeps the sweep going', (t) => {
    const shelf = range(300, 8);
    const scattered = [...range(400, 16), ...range(420, 16)];
    const feed = createFeed({ stored: [...shelf, ...scattered] });
    t.after(feed.restore);

    feed.loadPage(range(1, 3));
    feed.feature._hideAllVideos();
    feed.feature._continueHideAllSweep(feed.loadPage([...range(10, 4), ...shelf, ...range(20, 4)]));
    assert.ok(feed.feature._hideAllSweep, 'eight hidden cards, like a Shorts shelf, are not the earlier clear');
    // 16 hidden, one the user never hid, 16 more: no unbroken run of 20.
    feed.feature._continueHideAllSweep(feed.loadPage([...range(400, 16), id(500), ...range(420, 16)]));
    assert.ok(feed.feature._hideAllSweep);
    assert.equal(feed.calls.block, 0);
});

test('the sweep pauses loading after its page cap, and Hide All again picks up from there', (t) => {
    const feed = createFeed();
    t.after(feed.restore);
    feed.feature._HIDE_ALL_SWEEP_MAX_PAGES = 2;

    feed.loadPage([id(1), id(2), id(3)]);
    feed.feature._hideAllVideos();
    feed.feature._continueHideAllSweep(feed.loadPage([id(4), id(5), id(6)]));
    assert.ok(feed.feature._hideAllSweep);
    feed.feature._continueHideAllSweep(feed.loadPage([id(7), id(8), id(9)]));
    assert.equal(feed.feature._hideAllSweep, null, 'a feed with no earlier clear stops at the cap');
    assert.equal(feed.calls.block, 1);
    assert.equal(feed.toasts.at(-1).message, 'Hidden 9 videos');

    // Nothing is visible now, but on Subscriptions the next press resumes
    // the paused feed and sweeps on.
    feed.feature._hideAllVideos();
    assert.ok(feed.feature._hideAllSweep);
    assert.equal(feed.calls.resume, 1);
});

test('Stop and a quiet feed both end the sweep without pausing loading', (t) => {
    const stopped = createFeed();
    t.after(stopped.restore);
    stopped.loadPage([id(1), id(2), id(3)]);
    stopped.feature._hideAllVideos();
    stopped.toasts.at(-1).options.actions.find((action) => action.text === 'Stop').onClick();
    assert.equal(stopped.feature._hideAllSweep, null);
    assert.equal(stopped.calls.block, 0, 'Stop leaves loading alone');
    assert.equal(stopped.toasts.at(-1).message, 'Hidden 3 videos');

    const quiet = createFeed();
    t.after(quiet.restore);
    quiet.loadPage([id(1), id(2), id(3)]);
    quiet.feature._hideAllVideos();
    quiet.fireIdle();
    assert.equal(quiet.feature._hideAllSweep, null, 'no page for a while ends the sweep');
    assert.equal(quiet.calls.block, 0, 'the feed ran out or its trigger is off screen; nothing to pause');
    assert.equal(quiet.toasts.at(-1).message, 'Hidden 3 videos');
});

test('leaving Subscriptions ends the sweep quietly', (t) => {
    const feed = createFeed();
    t.after(feed.restore);
    feed.loadPage([id(1), id(2), id(3)]);
    feed.feature._hideAllVideos();
    const toastCount = feed.toasts.length;

    globalThis.window.location.pathname = '/watch';
    feed.feature._continueHideAllSweep(feed.loadPage([id(4), id(5), id(6)]));
    assert.equal(feed.feature._hideAllSweep, null);
    assert.equal(feed.calls.block, 0);
    assert.equal(feed.toasts.length, toastCount, 'no result toast on another page');
    assert.ok(!feed.hidden().includes(id(4)), 'cards on the new page are left alone');
});

test('Hide All on Home still hides only what is on screen', (t) => {
    const feed = createFeed({ path: '/' });
    t.after(feed.restore);
    feed.loadPage([id(1), id(2), id(3)]);
    feed.feature._hideAllVideos();
    assert.equal(feed.feature._hideAllSweep, null, 'Home recommendations never run out, so there is no sweep');
    assert.equal(feed.toasts.at(-1).message, 'Hidden 3 videos');
    assert.deepEqual(feed.toasts.at(-1).actions, ['Undo All', 'Manage']);
});

// A 2026-09 card is ytd-rich-item-renderer > yt-lockup-view-model, and both
// match the card selector. The outer one carries the verdict; the inner one
// always reported "not hidden".
function lockupPair(hidden) {
    const outer = { parentElement: null };
    const inner = { parentElement: { closest: () => outer } };
    return [{ element: outer, hidden }, { element: inner, hidden: false }];
}

test('a lockup pair is one card in the load statistics', (t) => {
    const feed = createFeed();
    t.after(feed.restore);
    const [outer, inner] = lockupPair(true);
    assert.deepEqual(feed.feature._loadBatchEntry(outer.element, true), { element: outer.element, hidden: true });
    assert.equal(feed.feature._loadBatchEntry(inner.element, false), null, 'the inner card has no verdict of its own');
});

test('the Subscriptions guard pauses on fully hidden 2026-09 pages', (t) => {
    // Every batch used to read as half hidden at most, under the 80% cutoff,
    // so a feed of hidden pages loaded forever.
    const feed = createFeed({ settings: { hideVideosSubsLoadLimit: true, hideVideosSubsLoadThreshold: 3 } });
    t.after(feed.restore);
    const page = () => Array.from({ length: 10 }, () => lockupPair(true)).flat()
        .map((entry) => feed.feature._loadBatchEntry(entry.element, entry.hidden))
        .filter(Boolean);
    feed.feature._trackSubsLoadBatch(page());
    feed.feature._trackSubsLoadBatch(page());
    assert.equal(feed.calls.block, 0);
    feed.feature._trackSubsLoadBatch(page());
    assert.equal(feed.calls.block, 1, 'three hidden pages in a row pause loading');
});

test('hidden pages that land in one batch each count toward the pause', (t) => {
    // Measured live: a reload of a fully hidden feed loaded 23 pages in
    // about two batches, so the three-batch streak never formed.
    const settings = { hideVideosSubsLoadLimit: true, hideVideosSubsLoadThreshold: 3 };
    const entries = (hidden, shown) => [
        ...Array.from({ length: hidden }, () => ({ element: {}, hidden: true })),
        ...Array.from({ length: shown }, () => ({ element: {}, hidden: false }))
    ];

    const merged = createFeed({ settings });
    t.after(merged.restore);
    merged.feature._trackSubsLoadBatch(entries(90, 0), 3);
    assert.equal(merged.calls.block, 1, 'three hidden pages in one batch pause loading');

    const fresh = createFeed({ settings });
    t.after(fresh.restore);
    fresh.feature._trackSubsLoadBatch(entries(40, 20), 2);
    assert.equal(fresh.feature._subsLoadState.consecutiveHiddenBatches, 0, 'pages with new videos still reset the streak');
    fresh.feature._trackSubsLoadBatch(entries(60, 0), 2);
    assert.equal(fresh.calls.block, 0, 'two hidden pages are under the threshold');
    fresh.feature._trackSubsLoadBatch(entries(30, 0));
    assert.equal(fresh.calls.block, 1, 'a batch without a page count is one page');
});
