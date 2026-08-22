'use strict';

// Render assertions for the UI-building monolith features whose tests only
// ever exercised their pure helpers. A source pin cannot tell a working
// renderer from a broken one, and the shared fake DOM grew real attach
// semantics in v4.79.0 precisely so these could be written: build the tree,
// then read `children`, `textContent` and class state off it.
//
// Every assertion here is bait-verified — the shipped source was mutated and
// the test confirmed to fail — so a silent renderer regression cannot pass.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

function collect(node, className) {
    const found = [];
    (function walk(current) {
        if (!current) return;
        if (current.classList?.contains?.(className)) found.push(current);
        (current.children || []).forEach(walk);
    })(node);
    return found;
}

function textOf(node, className) {
    return collect(node, className).map((element) => element.textContent);
}


// A document whose elements answer descendant queries and can take focus.
// Several renderers read a node back out of the tree they just built
// (`chip.querySelector('.sleep-time')`) or move focus into it, and the shared
// fake stops short of both.
function renderDocument(resolve = () => []) {
    const doc = fakeDocument(resolve);
    const create = doc.createElement.bind(doc);
    doc.activeElement = null;
    // Renderers that own a dismiss-on-outside-click listener bind it on the
    // document; record the handlers so a test can drive them.
    doc.listeners = new Map();
    doc.addEventListener = (type, handler) => {
        if (!doc.listeners.has(type)) doc.listeners.set(type, new Set());
        doc.listeners.get(type).add(handler);
    };
    doc.removeEventListener = (type, handler) => { doc.listeners.get(type)?.delete(handler); };
    doc.createElement = (tag) => {
        const node = create(tag);
        node.focus = () => { doc.activeElement = node; };
        node.blur = () => { if (doc.activeElement === node) doc.activeElement = null; };
        node.querySelectorAll = (selector) => collectMatching(node, selector);
        node.querySelector = (selector) => collectMatching(node, selector)[0] || null;
        return node;
    };
    // SVG icons are built through createElementNS, which the shared fake does
    // not carry; the nodes behave the same for every assertion made here.
    doc.createElementNS = (_namespace, tag) => doc.createElement(tag);
    doc.body.appendChild = doc.body.appendChild.bind(doc.body);
    return doc;
}

function collectMatching(root, selector) {
    const found = [];
    (function walk(node) {
        for (const child of node.children || []) {
            let matched = false;
            try { matched = child.matches?.(selector); } catch (_) { matched = false; }
            if (matched) found.push(child);
            walk(child);
        }
    })(root);
    return found;
}

// ── timestampBookmarks ─────────────────────────────────────────────────
function bookmarksFixture({ bookmarks = {}, videoId = 'abc12345678' } = {}) {
    const store = new Map([['ytkit-bookmarks', bookmarks]]);
    const toasts = [];
    const panel = fakeNode({ tag: 'div', attributes: { class: 'ytkit-bookmarks-body' } });
    const countEl = fakeNode({ tag: 'span' });
    const statusEl = fakeNode({ tag: 'p' });
    const feature = loadFeature('timestampBookmarks', {
        document: fakeDocument(() => []),
        getVideoId: () => videoId,
        showToast: (message, _colour, options) => toasts.push({ message, options }),
        StorageManager: {
            get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
            set: (key, value) => store.set(key, value)
        },
        // The monolith's shared sanitiser caps counts and note length. The
        // renderer is what is under test here, so pass the records through.
        sanitizeTimestampBookmarks: (value) => (value && typeof value === 'object' ? value : {})
    });
    feature._panel = panel;
    feature._countEl = countEl;
    feature._statusEl = statusEl;
    return { feature, panel, countEl, statusEl, store, toasts };
}

test('timestampBookmarks renders the empty state with its own copy, not a bare list', () => {
    const { feature, panel, countEl, statusEl } = bookmarksFixture();

    feature._renderPanel();

    assert.equal(countEl.textContent, '0 Saved');
    assert.match(statusEl.textContent, /Save important moments here/);
    assert.equal(panel.getAttribute('aria-label'), '0 bookmarks for this video');
    assert.equal(panel.children.length, 1);
    const empty = panel.children[0];
    assert.equal(empty.className, 'ytkit-bookmarks-empty');
    assert.deepEqual(
        Array.from(empty.children, (child) => child.className),
        ['ytkit-bookmarks-empty-title', 'ytkit-bookmarks-empty-copy']
    );
    assert.equal(empty.children[0].textContent, 'No bookmarks yet');
    assert.equal(collect(panel, 'ytkit-bookmarks-list').length, 0);
});

test('timestampBookmarks renders one row per bookmark, in time order, with its note', () => {
    const { feature, panel, countEl, statusEl } = bookmarksFixture({
        bookmarks: {
            abc12345678: [
                { t: 62, n: 'the good bit', d: 1 },
                { t: 3725, n: '', d: 2 }
            ]
        }
    });

    feature._renderPanel();

    assert.equal(countEl.textContent, '2 Saved');
    assert.match(statusEl.textContent, /Jump back to saved moments/);
    assert.equal(panel.getAttribute('aria-label'), '2 bookmarks for this video');
    const list = collect(panel, 'ytkit-bookmarks-list');
    assert.equal(list.length, 1);
    assert.equal(list[0].getAttribute('role'), 'list');

    const rows = collect(panel, 'ytkit-bookmark-row');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].getAttribute('role'), 'listitem');

    // The stamp is formatted, not raw seconds, and rolls into hours.
    assert.deepEqual(textOf(panel, 'ytkit-bookmark-ts'), ['1:02', '1:02:05']);

    // The meta line tells the two states apart, which is the only visible
    // difference between a bookmark with a note and one without.
    assert.deepEqual(textOf(panel, 'ytkit-bookmark-jump-meta'), [
        'Saved note included',
        'Add a note to remember why it matters'
    ]);

    const notes = collect(panel, 'ytkit-bookmark-note');
    assert.deepEqual(Array.from(notes, (input) => input.value), ['the good bit', '']);
    assert.equal(notes[0].getAttribute('aria-label'), 'Note for bookmark at 1:02');
});

test('timestampBookmarks re-renders in place rather than stacking a second list', () => {
    const { feature, panel } = bookmarksFixture({
        bookmarks: { abc12345678: [{ t: 10, n: '', d: 1 }] }
    });

    feature._renderPanel();
    feature._renderPanel();
    feature._renderPanel();

    assert.equal(collect(panel, 'ytkit-bookmarks-list').length, 1);
    assert.equal(collect(panel, 'ytkit-bookmark-row').length, 1);
});

test('timestampBookmarks writes an edited note back and re-renders it', () => {
    const { feature, panel, store } = bookmarksFixture({
        bookmarks: { abc12345678: [{ t: 10, n: '', d: 1 }] }
    });

    feature._renderPanel();
    const note = collect(panel, 'ytkit-bookmark-note')[0];
    assert.equal(note.getAttribute('aria-label'), 'Note for bookmark at 0:10');

    note.value = 'why it matters';
    note.onchange();

    assert.equal(store.get('ytkit-bookmarks').abc12345678[0].n, 'why it matters');
    assert.equal(collect(panel, 'ytkit-bookmark-note')[0].value, 'why it matters');
    assert.equal(textOf(panel, 'ytkit-bookmark-jump-meta')[0], 'Saved note included',
        'the meta line must follow the note that was just saved');
});

test('timestampBookmarks deleting the last bookmark falls back to the empty state, and Undo restores the row', () => {
    const { feature, panel, toasts } = bookmarksFixture({
        bookmarks: { abc12345678: [{ t: 45, n: 'keep me', d: 1 }] }
    });

    feature._renderPanel();
    assert.equal(collect(panel, 'ytkit-bookmark-row').length, 1);

    feature._deleteBookmark('abc12345678', 0);

    assert.equal(collect(panel, 'ytkit-bookmark-row').length, 0);
    assert.equal(collect(panel, 'ytkit-bookmarks-empty').length, 1,
        'an emptied panel shows the empty state, not a blank list');

    const undo = toasts.at(-1)?.options?.action;
    assert.equal(typeof undo?.onClick, 'function', 'a delete must offer Undo');
    undo.onClick();

    assert.equal(collect(panel, 'ytkit-bookmark-row').length, 1);
    assert.equal(textOf(panel, 'ytkit-bookmark-ts')[0], '0:45');
    assert.equal(collect(panel, 'ytkit-bookmark-note')[0].value, 'keep me',
        'Undo must restore the note as well as the timestamp');
});

// ── sleepTimer ─────────────────────────────────────────────────────────
function sleepTimerFixture() {
    const player = fakeNode({ tag: 'div', attributes: { class: 'ytp-chrome-bottom' } });
    const announced = [];
    const toasts = [];
    const video = { paused: false, pause() { this.paused = true; } };
    const doc = renderDocument((selector) => (selector === '.ytp-chrome-bottom' ? player : []));
    const feature = loadFeature('sleepTimer', {
        document: doc,
        announceA11y: (message) => announced.push(message),
        showToast: (message) => toasts.push(message),
        getMainVideoElement: () => video,
        setInterval: () => 1,
        clearInterval: () => {}
    });
    return { feature, player, announced, toasts, video, doc };
}

test('sleepTimer renders a countdown chip with the controls that drive it', () => {
    const { feature, player, announced } = sleepTimerFixture();

    feature._start(30);

    assert.equal(player.children.length, 1);
    const chip = player.children[0];
    assert.equal(chip.className, 'ytkit-sleep-timer-chip');
    assert.equal(chip.getAttribute('role'), 'status');
    assert.equal(chip.getAttribute('aria-live'), 'polite');
    assert.deepEqual(Array.from(chip.children, (child) => child.textContent),
        ['Sleep:', '30:00', '+5', 'Cancel']);
    assert.equal(chip.children[2].getAttribute('aria-label'), 'Add 5 minutes to sleep timer');
    assert.equal(chip.children[3].getAttribute('aria-label'), 'Cancel sleep timer');
    assert.ok(announced.some((message) => /set for 30 minutes/i.test(message)));
});

test('sleepTimer ticks the chip down and never renders a second one', () => {
    const { feature, player } = sleepTimerFixture();

    feature._start(2);
    feature._endsAt = Date.now() + 65_000;
    feature._tick();

    assert.equal(player.children.length, 1, 'the chip is replaced, not stacked');
    assert.equal(player.children[0].querySelector('.sleep-time').textContent, '1:05');

    feature._start(5);
    assert.equal(player.children.length, 1, 'restarting removes the previous chip');

    // The renderer carries its own guard, and it has to: a re-render outside
    // _start() (a player rebuild after an SPA navigation) would otherwise
    // leave one dead chip per pass.
    feature._renderChip();
    feature._renderChip();
    assert.equal(player.children.length, 1, 'a bare re-render replaces the chip in place');
});

test('sleepTimer elapsing pauses the video and takes its chip off the player', () => {
    const { feature, player, video, announced, toasts } = sleepTimerFixture();

    feature._start(1);
    feature._endsAt = Date.now() - 1;
    feature._tick();

    assert.equal(video.paused, true);
    assert.equal(player.children.length, 0, 'an elapsed timer leaves no chip behind');
    assert.equal(feature._chip, null);
    assert.ok(announced.some((message) => /elapsed/i.test(message)));
    assert.ok(toasts.some((message) => /elapsed/i.test(message)));
});

test('sleepTimer rejects an out-of-range value in the popover instead of starting', () => {
    const { feature, player } = sleepTimerFixture();

    feature._showTimerPopover(null);
    assert.equal(player.children.length, 1);
    const popover = player.children[0];
    assert.equal(popover.className, 'ytkit-sleep-popover');
    assert.equal(popover.getAttribute('role'), 'dialog');

    const input = popover.querySelector('input');
    assert.equal(input.value, '30', 'the popover opens on a usable default');
    const error = popover.querySelector('[role="alert"]');
    assert.equal(error.textContent, '');

    input.value = '900';
    assert.equal(feature._startFromInput(input, error), false);
    assert.match(error.textContent, /1 to 180 minutes/);
    assert.equal(feature._interval, null, 'a rejected value must not start the timer');

    input.value = '45';
    assert.equal(feature._startFromInput(input, error), true);
    assert.equal(player.children.length, 1, 'the popover gives way to the chip');
    assert.equal(player.children[0].className, 'ytkit-sleep-timer-chip');
    assert.equal(player.children[0].querySelector('.sleep-time').textContent, '45:00');
});

// ── watchHistoryAnalytics ──────────────────────────────────────────────
function analyticsFixture(stats) {
    const doc = renderDocument(() => []);
    const feature = loadFeature('watchHistoryAnalytics', {
        document: doc,
        HTMLElement: function HTMLElement() {},
        STORAGE_KEYS: { watchTime: 'ytkit-watch-time' },
        StorageManager: { get: (_key, fallback) => stats || fallback, set() {} },
        sanitizeWatchTimeStats: (value) => ({ days: value?.days || {}, total: value?.total || 0 })
    });
    return { feature, doc };
}

function dayKey(offset) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

test('watchHistoryAnalytics renders an empty state rather than thirty zero-height bars', () => {
    const { feature, doc } = analyticsFixture({ days: {}, total: 0 });

    feature._open();

    assert.equal(doc.body.children.length, 1);
    const card = doc.body.children[0].children[0];
    assert.equal(card.getAttribute('role'), 'dialog');
    assert.equal(card.getAttribute('aria-modal'), 'true');
    assert.equal(card.getAttribute('aria-labelledby'), 'ytkit-wha-title');
    assert.equal(collect(card, 'ytkit-wha-chart').length, 0, 'no chart is drawn with no data');
    assert.equal(collect(card, 'ytkit-wha-stats').length, 0);
    const empty = collect(card, 'ytkit-wha-empty');
    assert.equal(empty.length, 1);
    assert.equal(textOf(card, 'ytkit-wha-empty-title')[0], 'No watch time tracked yet');
    assert.equal(doc.activeElement, card, 'the dialog takes focus when it opens');
});

test('watchHistoryAnalytics draws one column per day and totals only the tracked ones', () => {
    const { feature, doc } = analyticsFixture({
        days: { [dayKey(0)]: 3600, [dayKey(3)]: 1800 },
        total: 7200
    });

    feature._open();

    const card = doc.body.children[0].children[0];
    assert.equal(collect(card, 'ytkit-wha-empty').length, 0);
    assert.equal(collect(card, 'ytkit-wha-col').length, 30, 'the window is thirty days wide');

    // Total 1h30m over 30 days, 2 of them active, and the all-time figure is
    // the stored one rather than the windowed sum.
    assert.deepEqual(textOf(card, 'ytkit-wha-stat-v'), ['1h 30m', '3m', '2/30', '2h 0m']);
    assert.deepEqual(textOf(card, 'ytkit-wha-stat-l'),
        ['Total (30d)', 'Daily avg', 'Active days', 'All time']);

    // The tallest tracked day is the 100% bar and the untracked ones are flat,
    // which is what makes the chart readable at all.
    const bars = collect(card, 'ytkit-wha-bar');
    assert.equal(bars.length, 30);
    assert.equal(bars.at(-1).style.height, '100%', 'today holds the largest value');
    assert.equal(bars.at(-4).style.height, '50%');
    assert.equal(bars[0].style.height, '0%');
    assert.match(bars.at(-1).title, /: 1h 0m$/);
});

test('watchHistoryAnalytics closes the dialog it opened instead of stacking a second one', () => {
    const { feature, doc } = analyticsFixture({ days: { [dayKey(1)]: 600 }, total: 600 });

    feature._open();
    assert.equal(doc.body.children.length, 1);

    feature._open();
    assert.equal(doc.body.children.length, 0, 'a second call closes rather than duplicating');
    assert.equal(feature._modal, null);
});

// ── quickLinkMenu ──────────────────────────────────────────────────────
function quickLinksFixture(quickLinkItems) {
    const doc = renderDocument(() => []);
    const settings = { quickLinkItems, logoToSubscriptions: false };
    const saved = [];
    const toasts = [];
    const feature = loadFeature('quickLinkMenu', {
        document: doc,
        window: { location: { origin: 'https://www.youtube.com' } },
        URL,
        isYouTubeHostname: (host) => /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(String(host || '')),
        VIDEO_ID_PATTERN: /^[A-Za-z0-9_-]{11}$/,
        appState: { settings },
        settingsManager: { save: (next) => saved.push(next.quickLinkItems) },
        showToast: (message) => toasts.push(message),
        ICONS: new Proxy({}, { get: () => () => doc.createElement('svg') }),
        // The bottom-row buttons stamp their glyphs through the trusted-types
        // wrapper. It is not what these tests are about, so record the target
        // rather than parse the markup.
        TrustedHTML: { setHTML: (node, html) => { node._trustedHtml = html; } },
        BRAND: { name: 'Astra Deck' }
    });
    const parent = doc.createElement('div');
    return { feature, parent, settings, saved, toasts, doc };
}

function quickLinkLabels(menu) {
    return collect(menu, 'ytkit-ql-item')
        .filter((node) => !node.classList.contains('ytkit-ql-bottom-btn'))
        .map((node) => node.textContent);
}

test('quickLinkMenu renders its own empty state when nothing is configured', () => {
    const { feature, parent } = quickLinksFixture('');

    feature._buildMenu(parent, 'ytkit-ql-drop-1');

    const menu = parent.querySelector('#ytkit-ql-drop-1') || collect(parent, 'ytkit-ql-drop')[0];
    assert.ok(menu, 'the dropdown must be built');
    assert.equal(menu.getAttribute('role'), 'group');
    assert.equal(collect(menu, 'ytkit-ql-row').length, 0);
    const empty = collect(menu, 'ytkit-ql-empty');
    assert.equal(empty.length, 1);
    assert.equal(textOf(menu, 'ytkit-ql-empty-title')[0], 'No quick links yet');
});

test('quickLinkMenu renders one row per valid line and drops the ones it cannot resolve', () => {
    const { feature, parent } = quickLinksFixture([
        'History|/feed/history',
        'no separator here',
        '|/feed/trending',
        'Blocked|javascript:alert(1)',
        'Offsite|https://example.test/x',
        'Short|https://youtu.be/abcdefghijk'
    ].join('\n'));

    feature._buildMenu(parent, 'drop');

    const menu = collect(parent, 'ytkit-ql-drop')[0];
    assert.deepEqual(quickLinkLabels(menu), ['History', 'Short']);
    assert.equal(collect(menu, 'ytkit-ql-empty').length, 0);

    // A youtu.be short link is rewritten to the watch path rather than kept
    // as an off-site host.
    const rows = collect(menu, 'ytkit-ql-item').filter((n) => !n.classList.contains('ytkit-ql-bottom-btn'));
    assert.equal(rows[1].pathname, '/watch');
    assert.equal(rows[1].search, '?v=abcdefghijk');

    // Every row carries an icon path, and an unknown destination falls back to
    // the default glyph rather than rendering an empty <path>.
    const paths = collect(menu, 'ytkit-ql-icon').map((svg) => svg.children[0].getAttribute('d'));
    assert.equal(paths.length, 2);
    assert.ok(paths.every((d) => /^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s]+$/.test(d)));
    assert.notEqual(paths[0], paths[1], 'a known destination gets its own glyph');
});

test('quickLinkMenu stops rendering at its ten-slot cap', () => {
    const lines = Array.from({ length: 14 }, (_value, index) => `Link ${index}|/feed/history`);
    const { feature, parent } = quickLinksFixture(lines.join('\n'));

    feature._buildMenu(parent, 'drop');

    const menu = collect(parent, 'ytkit-ql-drop')[0];
    assert.equal(quickLinkLabels(menu).length, 10);
    assert.deepEqual(quickLinkLabels(menu).at(-1), 'Link 9');
});

test('quickLinkMenu deleting a row splices the stored line, keeping entries past the cap intact', () => {
    const lines = Array.from({ length: 12 }, (_value, index) => `Link ${index}|https://www.youtube.com/feed/history?n=${index}`);
    const { feature, parent, settings, saved, toasts } = quickLinksFixture(lines.join('\n'));

    feature.rebuildMenus = () => {};
    feature._buildMenu(parent, 'drop');

    const menu = collect(parent, 'ytkit-ql-drop')[0];
    collect(menu, 'ytkit-ql-del')[1].onclick({ preventDefault() {}, stopPropagation() {} });

    const remaining = settings.quickLinkItems.split('\n');
    assert.equal(remaining.length, 11, 'exactly one stored line is removed');
    assert.ok(!remaining.some((line) => line.startsWith('Link 1|')));
    // The rendered list is capped at ten, so rebuilding the setting from it
    // used to destroy entries 10 and 11 outright.
    assert.ok(remaining.some((line) => line.startsWith('Link 11|')),
        'entries past the render cap must survive a delete');
    // Rebuilding from the parsed view also normalised full URLs into paths.
    assert.ok(remaining.every((line) => line.includes('https://www.youtube.com/feed/history')),
        'stored lines keep the form the user typed');
    assert.deepEqual(saved, [settings.quickLinkItems]);
    assert.deepEqual(toasts, ['Removed "Link 1"']);
});
