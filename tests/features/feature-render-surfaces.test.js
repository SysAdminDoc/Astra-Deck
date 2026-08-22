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
    // Every element this document makes reports this box until a test says
    // otherwise, so a renderer that rebuilds its node still measures something.
    doc.elementRect = { width: 0, height: 0 };
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
        // Legacy clipboard fallbacks stage a textarea and select it.
        node.select = () => {};
        node.setSelectionRange = () => {};
        node.querySelectorAll = (selector) => collectMatching(node, selector);
        node.querySelector = (selector) => collectMatching(node, selector)[0] || null;
        // Positioned surfaces clamp themselves against their own measured box.
        node.rect = { ...doc.elementRect };
        node.getBoundingClientRect = () => node.rect;
        node.handlers = new Map();
        node.addEventListener = (type, handler) => node.handlers.set(type, handler);
        node.removeEventListener = (type) => node.handlers.delete(type);
        node.contains = (other) => other === node || collectMatching(node, '*').includes(other);
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

// ── videoContextMenu ───────────────────────────────────────────────────
function contextMenuFixture({ downloaderRunning = true } = {}) {
    const doc = renderDocument(() => []);
    const downloads = [];
    const prompts = [];
    const feature = loadFeature('videoContextMenu', {
        document: doc,
        window: { location: { href: 'https://www.youtube.com/watch?v=abcdefghijk' }, innerWidth: 1000, innerHeight: 800 },
        ytKitDownload: (url, audioOnly, options) => downloads.push({ url, audioOnly, options }),
        showDownloadPopup: () => {},
        MediaDLManager: {
            isRunning: downloaderRunning,
            showInstallPrompt: (mode) => prompts.push(mode)
        }
    });
    return { feature, doc, downloads, prompts };
}

test('videoContextMenu offers the download actions and hides the installer while the companion runs', () => {
    const { feature, doc, downloads } = contextMenuFixture({ downloaderRunning: true });

    const menu = feature._createMenu();

    assert.equal(doc.body.children.length, 1, 'the menu is attached');
    assert.equal(menu.className, 'ytkit-context-menu');
    assert.equal(menu.style.display, 'none', 'it is built hidden');
    assert.equal(textOf(menu, 'ytkit-context-menu-header')[0], 'Local Downloads');

    const items = collect(menu, 'ytkit-context-menu-item');
    assert.deepEqual(Array.from(items, (item) => item.dataset.action),
        ['download-video', 'download-audio', 'download-options']);
    assert.deepEqual(Array.from(items, (item) => item.textContent), [
        'Download Video (MP4)',
        'Download Audio (MP3)',
        'Download Options…'
    ]);
    assert.equal(collect(menu, 'ytkit-context-menu-divider').length, 1);

    // Every row carries its glyph, so a missing icon is a visible defect.
    assert.ok(items.every((item) => item.children[0].tagName === 'SVG'));

    items[1].handlers.get('click')({ stopPropagation() {} });
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].url, 'https://www.youtube.com/watch?v=abcdefghijk');
    assert.equal(downloads[0].audioOnly, true);
    assert.equal(downloads[0].options.format, 'mp3');
    assert.equal(menu.style.display, 'none', 'acting on a row closes the menu');
});

test('videoContextMenu adds the installer row only while the companion is missing', () => {
    const { feature, prompts } = contextMenuFixture({ downloaderRunning: false });

    const menu = feature._createMenu();
    const items = collect(menu, 'ytkit-context-menu-item');
    assert.deepEqual(Array.from(items, (item) => item.dataset.action),
        ['download-video', 'download-audio', 'download-options', 'setup-mediadl']);
    assert.equal(collect(menu, 'ytkit-context-menu-divider').length, 2);

    items[3].handlers.get('click')({ stopPropagation() {} });
    assert.deepEqual(prompts, ['install']);
});

test('videoContextMenu rebuilds on each open and clamps itself inside the viewport', () => {
    const { feature, doc } = contextMenuFixture();

    feature._showMenu(100, 120);
    assert.equal(doc.body.children.length, 1);
    const first = feature._menu;
    assert.equal(first.style.display, 'block');
    assert.equal(first.style.left, '100px');
    assert.equal(first.style.top, '120px');

    // A menu opened near the edge is pulled back rather than clipped.
    doc.elementRect = { width: 240, height: 200 };
    feature._showMenu(990, 790);
    assert.notEqual(feature._menu, first, 'the menu is rebuilt so it reflects the current companion state');
    assert.equal(doc.body.children.length, 1, 'the previous menu is removed, not left behind');
    assert.equal(feature._menu.style.left, '750px');
    assert.equal(feature._menu.style.top, '590px');

    feature._hideMenu();
    assert.equal(feature._menu.style.display, 'none');
});

// ── commentNavigator ───────────────────────────────────────────────────
// _getThreads() rejects anything that is not an HTMLElement, so the fixture
// nodes have to satisfy the instanceof. Re-parenting keeps every own property
// the shared fake defines.
class FakeHTMLElement {}

function navigatorFixture(threads = []) {
    const doc = renderDocument((selector) => {
        if (selector.includes('ytd-comments#comments')) return fakeNode({ tag: 'ytd-comments' });
        if (selector.includes('data-ytkit-comment-current')) {
            return threads.filter((thread) => thread.dataset.ytkitCommentCurrent === '1');
        }
        if (selector.includes('ytd-comment-thread-renderer')) return threads;
        return [];
    });
    const feature = loadFeature('commentNavigator', {
        document: doc,
        window: { location: { pathname: '/watch' } },
        Intl,
        HTMLElement: FakeHTMLElement,
        getComputedStyle: () => ({ display: 'block' })
    });
    return { feature, doc };
}

function thread(visible = true) {
    const node = fakeNode({ tag: 'ytd-comment-thread-renderer' });
    Object.setPrototypeOf(node, FakeHTMLElement.prototype);
    node.offsetParent = visible ? fakeNode({ tag: 'div' }) : null;
    node.scrollIntoView = () => {};
    return node;
}

test('commentNavigator builds one navigator with its live-region counters', () => {
    const { feature, doc } = navigatorFixture();

    feature._ensureNav();
    feature._ensureNav();

    assert.equal(doc.body.children.length, 1, 'the navigator is built once');
    const nav = doc.body.children[0];
    assert.equal(nav.id, 'ytkit-comment-nav');
    assert.equal(nav.getAttribute('role'), 'navigation');
    assert.equal(nav.getAttribute('aria-label'), 'Comment thread navigator');
    assert.equal(nav.dataset.filtered, '0');

    assert.equal(textOf(nav, 'ytkit-comment-nav-label')[0], 'Thread Navigator');
    assert.equal(textOf(nav, 'ytkit-comment-nav-count')[0], '0');
    assert.equal(collect(nav, 'ytkit-comment-nav-count')[0].getAttribute('aria-live'), 'polite');
    assert.equal(textOf(nav, 'ytkit-comment-nav-status')[0], 'Waiting for comments to load…');
    assert.equal(collect(nav, 'ytkit-comment-nav-filter')[0].hidden, true);

    const buttons = collect(nav, 'ytkit-comment-nav-btn');
    assert.equal(buttons.length, 2);
    assert.deepEqual(Array.from(buttons, (button) => button.getAttribute('aria-label')), [
        'Jump to previous visible comment thread',
        'Jump to next visible comment thread'
    ]);
    assert.deepEqual(Array.from(buttons, (button) => button.textContent), ['↑Previous', '↓Next']);
});

test('commentNavigator counts only the threads that are actually visible', () => {
    const visible = [thread(), thread(), thread()];
    const hidden = thread(false);
    const { feature, doc } = navigatorFixture([visible[0], hidden, visible[1], visible[2]]);

    feature._ensureNav();
    feature._updateState();

    const nav = doc.body.children[0];
    assert.equal(textOf(nav, 'ytkit-comment-nav-count')[0], '3',
        'a collapsed thread must not be counted as navigable');
    assert.equal(textOf(nav, 'ytkit-comment-nav-status')[0], 'Visible threads ready');
});

test('commentNavigator shows the search filter it is navigating within', () => {
    const threads = [thread(), thread()];
    const { feature, doc } = navigatorFixture(threads);

    feature._ensureNav();
    feature._filterState = { query: 'a very long search phrase indeed', total: 40 };
    feature._updateState();

    const nav = doc.body.children[0];
    assert.equal(nav.dataset.filtered, '1');
    assert.equal(textOf(nav, 'ytkit-comment-nav-count')[0], '2/40',
        'a filtered view reports matches against the whole thread count');
    const badge = collect(nav, 'ytkit-comment-nav-filter')[0];
    assert.equal(badge.hidden, false);
    assert.equal(badge.textContent, '“a very long search ph…”', 'a long query is elided, not wrapped');
    assert.equal(badge.title, 'Search filter: a very long search phrase indeed');

    feature._filterState = { query: '', total: 0 };
    feature._updateState();
    assert.equal(nav.dataset.filtered, '0');
    assert.equal(collect(nav, 'ytkit-comment-nav-filter')[0].hidden, true);
    assert.equal(collect(nav, 'ytkit-comment-nav-filter')[0].getAttribute('title'), null);
});

test('commentNavigator says no matches only once the filter has settled', () => {
    const { feature, doc } = navigatorFixture([]);

    feature._ensureNav();
    feature._filterState = { query: 'nothing', total: 12, isPending: true };
    feature._updateState();
    assert.equal(textOf(doc.body.children[0], 'ytkit-comment-nav-status')[0], 'Waiting for comments to load…',
        'a filter still running must not claim there are no matches');

    feature._filterState = { query: 'nothing', total: 12, isPending: false };
    feature._updateState();
    assert.equal(textOf(doc.body.children[0], 'ytkit-comment-nav-status')[0], 'No matching threads');
});

// ── commentSearch ──────────────────────────────────────────────────────
function commentSearchFixture(threadTexts = []) {
    const comments = fakeNode({ tag: 'ytd-comments', attributes: { id: 'comments' } });
    const threads = threadTexts.map((text) => {
        const node = fakeNode({ tag: 'ytd-comment-thread-renderer', text });
        Object.setPrototypeOf(node, FakeHTMLElement.prototype);
        // A real element reports '' for an unset inline display, and the
        // restore path writes that value back.
        node.style.display = '';
        return node;
    });
    comments.querySelectorAll = (selector) => (
        selector.includes('ytd-comment-thread-renderer') ? threads : collectMatching(comments, selector)
    );
    comments.querySelector = (selector) => (comments.querySelectorAll(selector)[0] || null);

    const events = [];
    const doc = renderDocument((selector) => (selector.includes('ytd-comments#comments') ? comments : []));
    doc.dispatchEvent = (event) => events.push(event);
    const feature = loadFeature('commentSearch', {
        document: doc,
        isWatchPagePath: () => true,
        Intl,
        HTMLElement: FakeHTMLElement,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        ICONS: new Proxy({}, { get: () => () => doc.createElement('svg') })
    });
    return { feature, comments, threads, events, doc };
}

test('commentSearch builds one search bar and waits before claiming a count', () => {
    const { feature, comments } = commentSearchFixture();

    feature._create();
    feature._create();

    assert.equal(comments.children.length, 1, 'the bar is built once per comments section');
    const bar = comments.children[0];
    assert.equal(bar.className, 'ytkit-comment-search');
    assert.equal(bar.getAttribute('role'), 'search');
    assert.equal(textOf(bar, 'ytkit-comment-search-eyebrow')[0], 'Find in Comments');
    assert.equal(textOf(bar, 'ytkit-comment-search-summary')[0], 'Waiting for comments to load…');
    assert.equal(collect(bar, 'ytkit-comment-search-summary')[0].getAttribute('aria-live'), 'polite');
    assert.equal(textOf(bar, 'ytkit-search-count')[0], '0 threads');

    const clear = collect(bar, 'ytkit-comment-search-clear')[0];
    assert.equal(clear.hidden, true, 'nothing to clear before a query is typed');
    assert.equal(clear.disabled, true);
    assert.equal(collect(bar, 'ytkit-comment-search-empty')[0].hidden, true);
});

test('commentSearch hides the threads that do not match and restores them on clear', () => {
    const { feature, comments, threads, events } = commentSearchFixture([
        'a comment about cooking',
        'a comment about cycling',
        'another cooking thread'
    ]);

    feature._create();
    const bar = comments.children[0];
    const input = collect(bar, 'ytkit-comment-search-input')[0];

    input.value = 'cooking';
    feature._applyFilter();

    assert.deepEqual(Array.from(threads, (thread) => thread.style.display), ['', 'none', '']);
    assert.equal(bar.dataset.searchActive, '1');
    assert.equal(bar.dataset.searchEmpty, '0');
    assert.equal(textOf(bar, 'ytkit-search-count')[0], '2 matches');
    assert.match(textOf(bar, 'ytkit-comment-search-summary')[0], /Showing 2 of 3/);

    const clear = collect(bar, 'ytkit-comment-search-clear')[0];
    assert.equal(clear.hidden, false, 'a live query offers a way out of it');
    assert.equal(clear.disabled, false);

    // The navigator listens on this event, so its payload is a contract.
    assert.equal(events.at(-1).type, 'ytkit-comment-filter');
    assert.equal(events.at(-1).detail.visible, 2);
    assert.equal(events.at(-1).detail.total, 3);
    assert.equal(events.at(-1).detail.hasMatches, true);

    feature._clearSearch();
    assert.deepEqual(Array.from(threads, (thread) => thread.style.display), ['', '', '']);
    assert.equal(bar.dataset.searchActive, '0');
    assert.equal(textOf(bar, 'ytkit-search-count')[0], '3 threads');
    assert.equal(collect(bar, 'ytkit-comment-search-clear')[0].hidden, true);
});

test('commentSearch shows its empty state only when a query matched nothing', () => {
    const { feature, comments, events } = commentSearchFixture(['a comment about cooking']);

    feature._create();
    const bar = comments.children[0];
    const input = collect(bar, 'ytkit-comment-search-input')[0];

    input.value = 'nothing here';
    feature._applyFilter();

    assert.equal(bar.dataset.searchEmpty, '1');
    assert.equal(textOf(bar, 'ytkit-search-count')[0], 'No matches');
    const empty = collect(bar, 'ytkit-comment-search-empty')[0];
    assert.equal(empty.hidden, false);
    assert.equal(textOf(bar, 'ytkit-comment-search-empty-title')[0], 'No matching comments');
    assert.equal(events.at(-1).detail.hasMatches, false);
    assert.equal(events.at(-1).detail.isPending, false);
});

test('commentSearch leaves a thread another feature hid alone', () => {
    const { feature, comments, threads } = commentSearchFixture(['pinned thread', 'ordinary thread']);
    threads[0].dataset.ytkitPinnedCommentHidden = '1';
    threads[0].style.display = 'none';

    feature._create();
    const bar = comments.children[0];
    const input = collect(bar, 'ytkit-comment-search-input')[0];

    input.value = 'thread';
    feature._applyFilter();

    // Both threads match, but the pinned-comment feature already hid one, and
    // restoring it here would undo that feature behind its back.
    assert.equal(threads[0].style.display, 'none');
    assert.equal(threads[1].style.display, '');
    assert.equal(textOf(bar, 'ytkit-search-count')[0], '1 match',
        'a thread another feature hid is not counted as a visible match');
});

// ── aiVideoSummary ─────────────────────────────────────────────────────
// The panel renders a real artifact through the shipped sanitiser, so a
// citation that the sanitiser drops must not reach the DOM either.
const aiSummaryArtifacts = require('../../extension/core/ai-summary-artifacts.js');

function aiSummaryFixture(store = {}) {
    const doc = renderDocument(() => []);
    const toasts = [];
    const saved = [];
    const feature = loadFeature('aiVideoSummary', {
        document: doc,
        // The feature reaches the artifact service off the shared core
        // namespace, and a sandbox has its own globalThis.
        YTKitCore: { aiSummaryArtifacts },
        Intl,
        navigator: { clipboard: { writeText: async () => {} } },
        showToast: (message, _colour, options) => toasts.push({ message, options }),
        DiagnosticLog: { record() {} },
        getVideoId: () => 'abcdefghijk',
        StorageManager: {
            get: (_key, fallback) => store || fallback,
            set: (_key, value) => saved.push(value)
        },
        storageReadJSON: (_key, fallback) => store || fallback,
        storageWriteJSON: (_key, value) => saved.push(value)
    });
    // The feature reads the artifact service off the shared core namespace.
    feature._readArtifacts = () => store;
    feature._writeArtifacts = (next) => { saved.push(next); Object.assign(store, next); };
    return { feature, doc, toasts, saved };
}

function artifactInput(overrides = {}) {
    return {
        videoId: 'abcdefghijk',
        title: 'A talk about caching',
        transcriptLanguage: 'en',
        provider: 'ollama',
        model: 'llama3',
        generatedAt: '2026-08-01T12:00:00.000Z',
        summary: 'The speaker explains why caching is hard.',
        bullets: [
            { text: 'Invalidation is the hard part', citations: ['C0001'] },
            { text: 'Naming is the other hard part', citations: ['C0002', 'C9999'] },
            { text: 'A bullet with no valid citation', citations: ['C9999'] }
        ],
        tldr: { text: 'Caching is hard.', citations: ['C0001'] },
        citations: {
            C0001: { startSeconds: 62, text: 'first cue' },
            C0002: { startSeconds: 3725, text: 'second cue' }
        },
        ...overrides
    };
}

test('aiVideoSummary builds one dialog and replaces its content rather than appending', () => {
    const { feature, doc } = aiSummaryFixture();

    feature._showStatus('Working…');
    feature._showStatus('Still working…');

    assert.equal(doc.body.children.length, 1, 'the panel is built once');
    const panel = doc.body.children[0];
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(textOf(panel, 'ytkit-aisum-status').length, 1, 'the status replaces, it does not stack');
    assert.equal(textOf(panel, 'ytkit-aisum-status')[0], 'Still working…');
    assert.equal(collect(panel, 'ytkit-aisum-status')[0].getAttribute('role'), 'status');

    feature._showStatus('It broke', 'error');
    const status = collect(panel, 'ytkit-aisum-status')[0];
    assert.equal(status.getAttribute('role'), 'alert', 'an error is announced assertively');
    assert.ok(status.classList.contains('ytkit-aisum-status--error'));
});

test('aiVideoSummary closing the panel abandons the run behind it', () => {
    const { feature, doc } = aiSummaryFixture();
    let aborted = false;
    feature._showStatus('Working…');
    feature._runController = { abort: () => { aborted = true; } };
    const before = feature._runToken;

    const close = collect(doc.body.children[0], 'ytkit-aisum-close')[0];
    close.handlers.get('click')();

    assert.equal(aborted, true, 'closing must not leave a request running against a dead panel');
    assert.equal(feature._runToken, before + 1, 'the token moves so a late response is discarded');
    assert.equal(doc.body.children.length, 0);
    assert.equal(feature._panel, null);
});

test('aiVideoSummary renders a bullet per citation-bearing point, with seekable timestamps', () => {
    const { feature, doc } = aiSummaryFixture();

    feature._renderArtifact(artifactInput());

    const panel = doc.body.children[0];
    // The third bullet cites only an id the sanitiser drops, so it carries no
    // citations and must not be rendered as a bare claim.
    const bullets = collect(panel, 'ytkit-aisum-bullets')[0].children;
    assert.equal(bullets.length, 2);
    assert.equal(bullets[0].children[0].textContent, 'Invalidation is the hard part');

    const links = collect(panel, 'ytkit-aisum-citation');
    assert.deepEqual(Array.from(links, (link) => link.textContent), ['1:02', '1:02:05', '1:02']);
    assert.equal(links[0].href, 'https://www.youtube.com/watch?v=abcdefghijk&t=62s');
    assert.equal(links[1].href, 'https://www.youtube.com/watch?v=abcdefghijk&t=3725s');
    assert.match(links[0].getAttribute('aria-label'), /Transcript citation 1:02/);

    assert.equal(textOf(panel, 'ytkit-aisum-overview')[0], 'The speaker explains why caching is hard.');
    assert.match(textOf(panel, 'ytkit-aisum-meta')[0], /en · ollama\/llama3$/);
    const tldr = collect(panel, 'ytkit-aisum-tldr')[0];
    assert.equal(tldr.hidden, false);
    assert.match(tldr.textContent, /^TL;DR: Caching is hard\./);
});

test('aiVideoSummary hides the TL;DR line when the model gave none it could cite', () => {
    const { feature, doc } = aiSummaryFixture();

    feature._renderArtifact(artifactInput({ tldr: { text: 'Uncited claim', citations: ['C9999'] } }));

    const tldr = collect(doc.body.children[0], 'ytkit-aisum-tldr')[0];
    assert.equal(tldr.hidden, true, 'an uncited TL;DR is dropped rather than shown unsourced');
});

test('aiVideoSummary refuses to display an artifact the sanitiser rejects', () => {
    const { feature, doc } = aiSummaryFixture();

    feature._renderArtifact({ videoId: 'not-an-id', summary: 'x' });

    const panel = doc.body.children[0];
    assert.equal(collect(panel, 'ytkit-aisum-bullets').length, 0);
    const status = collect(panel, 'ytkit-aisum-status')[0];
    assert.equal(status.getAttribute('role'), 'alert');
    assert.match(status.textContent, /invalid and cannot be displayed/);
});

test('aiVideoSummary library lists saved summaries and answers its own search', () => {
    const clean = aiSummaryArtifacts.sanitizeArtifact(artifactInput());
    const other = aiSummaryArtifacts.sanitizeArtifact(artifactInput({
        artifactId: 'second_one_x',
        title: 'A talk about naming',
        generatedAt: '2026-07-01T12:00:00.000Z'
    }));
    const store = { [clean.artifactId]: clean, [other.artifactId]: other };
    const { feature, doc } = aiSummaryFixture(store);

    const container = doc.createElement('div');
    feature._appendLibrary(container);

    const rows = collect(container, 'ytkit-aisum-library-row');
    assert.equal(rows.length, 2);
    assert.match(textOf(container, 'ytkit-aisum-library-open')[0], /A talk about/);
    assert.match(collect(container, 'ytkit-aisum-library')[0].children[0].textContent, /Saved summaries \(2\)/);

    const search = collect(container, 'ytkit-aisum-search')[0];
    // Both artifacts share a bullet mentioning naming, so the query has to be
    // one only the second one's title carries.
    search.value = 'about naming';
    search.handlers.get('input')();
    assert.deepEqual(
        Array.from(collect(container, 'ytkit-aisum-library-open'), (button) => button.textContent.split(' · ')[0]),
        ['A talk about naming']
    );

    search.value = 'nothing at all';
    search.handlers.get('input')();
    assert.equal(collect(container, 'ytkit-aisum-library-row').length, 0);
    assert.match(textOf(container, 'ytkit-aisum-empty')[0], /No saved summaries match/);
});

// ── customSpeedButtons ─────────────────────────────────────────────────
function speedPresetsFixture(video) {
    const below = fakeNode({ tag: 'div', attributes: { id: 'below' } });
    const doc = renderDocument((selector) => {
        if (selector.includes('.ytkit-speed-presets')) return collectMatching(below, '.ytkit-speed-presets');
        if (selector.includes('#below')) return below;
        if (selector === 'video') return video ? [video] : [];
        return [];
    });
    const feature = loadFeature('customSpeedButtons', {
        document: doc,
        Intl,
        isWatchPagePath: () => true,
        getMainVideoElement: () => video
    });
    return { feature, below, doc };
}

function fakeVideo(playbackRate = 1) {
    return {
        playbackRate,
        addEventListener() {},
        removeEventListener() {}
    };
}

test('customSpeedButtons renders every preset once and marks the active one', () => {
    const video = fakeVideo(1);
    const { feature, below } = speedPresetsFixture(video);

    feature._create();
    feature._create();

    assert.equal(below.children.length, 1, 'the preset row is built once');
    const container = below.children[0];
    assert.equal(container.getAttribute('role'), 'group');
    assert.equal(container.getAttribute('aria-label'), 'Playback speed presets');
    assert.equal(textOf(container, 'ytkit-speed-presets__title')[0], 'Speed Presets');

    const buttons = collect(container, 'ytkit-speed-btn');
    assert.deepEqual(Array.from(buttons, (button) => button.textContent),
        ['0.5x', '0.75x', '1x', '1.25x', '1.5x', '1.75x', '2x', '2.5x', '3x']);
    assert.deepEqual(Array.from(buttons, (button) => button.getAttribute('aria-pressed')),
        ['false', 'false', 'true', 'false', 'false', 'false', 'false', 'false', 'false']);
    assert.ok(buttons[2].classList.contains('ytkit-speed-btn-active'));

    const status = collect(container, 'ytkit-speed-presets__status')[0];
    assert.equal(status.textContent, '1x');
    assert.equal(status.dataset.state, 'default');
    assert.equal(status.getAttribute('aria-live'), 'polite');
});

test('customSpeedButtons applies the speed it was clicked for and follows the player', () => {
    const video = fakeVideo(1);
    const { feature, below } = speedPresetsFixture(video);

    feature._create();
    const container = below.children[0];
    const buttons = collect(container, 'ytkit-speed-btn');

    buttons[4].handlers.get('click')();

    assert.equal(video.playbackRate, 1.5);
    assert.equal(buttons[4].getAttribute('aria-pressed'), 'true');
    assert.equal(buttons[2].getAttribute('aria-pressed'), 'false');
    const status = collect(container, 'ytkit-speed-presets__status')[0];
    assert.equal(status.textContent, '1.50x');
    assert.equal(status.dataset.state, 'active');
    assert.equal(status.getAttribute('aria-label'), 'Current playback speed 1.50x');

    // A rate the player picked up elsewhere still lands on the row.
    video.playbackRate = 2;
    feature._syncState();
    assert.equal(collect(container, 'ytkit-speed-btn')[6].getAttribute('aria-pressed'), 'true');
    assert.equal(collect(container, 'ytkit-speed-presets__status')[0].textContent, '2x');

    // An off-preset rate leaves every button unpressed rather than guessing.
    video.playbackRate = 1.1;
    feature._syncState();
    assert.deepEqual(
        Array.from(collect(container, 'ytkit-speed-btn'), (button) => button.getAttribute('aria-pressed')),
        Array(9).fill('false')
    );
    assert.equal(collect(container, 'ytkit-speed-presets__status')[0].textContent, '1.10x');
});

// ── copyVideoTitle ─────────────────────────────────────────────────────
function copyTitleFixture({ title = 'A video title', clipboardWorks = true } = {}) {
    const titleContainer = fakeNode({ tag: 'h1', attributes: { class: 'ytd-watch-metadata' } });
    titleContainer.querySelector = (selector) => collectMatching(titleContainer, selector)[0] || null;
    const titleNode = fakeNode({ tag: 'yt-formatted-string', text: title });
    titleContainer.appendChild(titleNode);

    const toasts = [];
    const doc = renderDocument((selector) => (
        selector.includes('h1') ? titleContainer : []
    ));
    const feature = loadFeature('copyVideoTitle', {
        document: doc,
        isWatchPagePath: () => true,
        showToast: (message) => toasts.push(message),
        navigator: {
            clipboard: {
                writeText: async (value) => {
                    if (!clipboardWorks) throw new Error('denied');
                    copied.push(value);
                }
            }
        },
        ICONS: new Proxy({}, { get: () => () => doc.createElement('svg') }),
        createSVG: () => doc.createElement('svg'),
        HTMLElement: FakeHTMLElement
    });
    const copied = [];
    feature._getTitleText = () => title;
    return { feature, titleContainer, toasts, copied, doc };
}

test('copyVideoTitle builds one button that starts in its idle state', () => {
    const { feature, titleContainer } = copyTitleFixture();

    feature._create();
    feature._create();

    assert.equal(titleContainer.children.length, 2, 'the button joins the title, once');
    const button = titleContainer.children[1];
    assert.equal(button.className, 'ytkit-copy-title-btn');
    assert.equal(button.getAttribute('aria-live'), 'polite');
    assert.equal(button.dataset.state, 'idle');
    assert.equal(button.getAttribute('aria-label'), 'Copy video title');
    assert.equal(button.disabled, false);
    assert.equal(collect(button, 'ytkit-copy-title-btn__label')[0].textContent, 'Copy');
    assert.equal(collect(button, 'ytkit-copy-title-btn__icon')[0].children.length, 1,
        'the idle glyph is mounted');
});

test('copyVideoTitle swaps state and glyph without stacking icons', () => {
    const { feature } = copyTitleFixture();
    feature._create();
    const button = feature._btn;
    const iconWrap = collect(button, 'ytkit-copy-title-btn__icon')[0];

    feature._setState('copying');
    assert.equal(button.dataset.state, 'copying');
    assert.equal(button.disabled, true, 'a copy in flight cannot be started again');
    assert.equal(collect(button, 'ytkit-copy-title-btn__label')[0].textContent, 'Copying…');
    assert.equal(iconWrap.children.length, 1, 'the glyph is replaced, not appended');

    feature._setState('error');
    assert.equal(button.dataset.state, 'error');
    assert.equal(button.disabled, false);
    assert.equal(collect(button, 'ytkit-copy-title-btn__label')[0].textContent, 'Retry');
    assert.match(button.getAttribute('aria-label'), /Copy failed/);
    assert.equal(iconWrap.children.length, 1);

    feature._setState('idle');
    assert.equal(collect(button, 'ytkit-copy-title-btn__label')[0].textContent, 'Copy');
    assert.equal(iconWrap.children.length, 1);
});

test('copyVideoTitle reports a blocked clipboard on the button instead of failing silently', async () => {
    const { feature, toasts, doc } = copyTitleFixture({ clipboardWorks: false });
    // The legacy fallback stages a textarea and asks execCommand to copy it.
    // Refusing there is the case under test: both routes failed.
    doc.execCommand = () => false;
    doc.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
    doc.createRange = () => ({ selectNodeContents() {} });

    feature._create();
    const button = feature._btn;
    await button.handlers.get('click')({ stopPropagation() {} });

    assert.equal(button.dataset.state, 'error');
    assert.equal(collect(button, 'ytkit-copy-title-btn__label')[0].textContent, 'Retry');
    assert.ok(toasts.some((message) => /Clipboard access was blocked/.test(message)));
});

test('copyVideoTitle refuses to copy a title that has not loaded yet', async () => {
    const { feature, toasts, copied } = copyTitleFixture({ title: '' });

    feature._create();
    const button = feature._btn;
    await button.handlers.get('click')({ stopPropagation() {} });

    assert.deepEqual(copied, []);
    assert.equal(button.dataset.state, 'error');
    assert.ok(toasts.some((message) => /still loading/.test(message)));
});

// ── researchSpacedReview (transcript study pack) ────────────────────────
function studyPackFixture() {
    const host = fakeNode({ tag: 'ytd-watch-metadata' });
    const doc = renderDocument((selector) => (selector.includes('ytd-watch-metadata') ? host : []));
    doc.head = fakeNode({ tag: 'head' });
    const feature = loadFeature('researchSpacedReview', {
        document: doc,
        window: { location: { pathname: '/watch' } },
        isWatchPagePath: () => true
    });
    return { feature, host, doc };
}

test('researchSpacedReview builds one queue panel, hidden until it has rows', () => {
    const { feature, host } = studyPackFixture();

    const panel = feature._ensureBatchPanel(null);
    assert.equal(feature._ensureBatchPanel(null), panel, 'the panel is reused, not rebuilt');
    assert.equal(host.children.length, 1);
    assert.equal(panel.hidden, true, 'an empty study pack stays out of the way');
    assert.equal(panel.getAttribute('aria-live'), 'polite');
    assert.equal(textOf(panel, 'ytkit-transcript-batch-title')[0], 'Transcript study pack');
    assert.equal(textOf(panel, 'ytkit-transcript-batch-summary')[0],
        'Queue cap 20, one recovery pass per video');
});

test('researchSpacedReview renders one queue row per video and replaces the previous queue', () => {
    const { feature } = studyPackFixture();

    feature._renderBatchQueue([
        { videoId: 'aaaaaaaaaaa', title: 'First video', source: 'playlist' },
        { videoId: 'bbbbbbbbbbb', title: '', source: 'feed' }
    ], null);

    const panel = feature._batchPanel;
    assert.equal(panel.hidden, false, 'a queued pack shows itself');
    const rows = collect(panel, 'ytkit-transcript-batch-row');
    assert.equal(rows.length, 2);
    assert.deepEqual(Array.from(rows, (row) => row.dataset.videoId), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    assert.deepEqual(textOf(panel, 'ytkit-transcript-batch-name'), ['First video', 'bbbbbbbbbbb']);
    assert.deepEqual(textOf(panel, 'ytkit-transcript-batch-meta'),
        ['playlist - aaaaaaaaaaa', 'feed - bbbbbbbbbbb']);
    assert.deepEqual(Array.from(collect(panel, 'ytkit-transcript-batch-status'), (s) => s.dataset.state),
        ['pending', 'pending']);
    assert.equal(textOf(panel, 'ytkit-transcript-batch-summary')[0],
        '2/20 queued; one recovery pass per video');

    feature._renderBatchQueue([{ videoId: 'ccccccccccc', title: 'Only one now', source: 'watch' }], null);
    assert.equal(collect(feature._batchPanel, 'ytkit-transcript-batch-row').length, 1,
        'a second run replaces the queue rather than appending to it');
});

test('researchSpacedReview updates the row for the video it names, and ignores one it does not have', () => {
    const { feature } = studyPackFixture();

    feature._renderBatchQueue([
        { videoId: 'aaaaaaaaaaa', title: 'First', source: 'feed' },
        { videoId: 'bbbbbbbbbbb', title: 'Second', source: 'feed' }
    ], null);

    feature._setBatchRow('bbbbbbbbbbb', 'failed', 'No captions available');
    feature._setBatchRow('zzzzzzzzzzz', 'failed', 'not queued');

    const statuses = collect(feature._batchPanel, 'ytkit-transcript-batch-status');
    assert.equal(statuses[0].dataset.state, 'pending', 'the other row is untouched');
    assert.equal(statuses[0].textContent, 'pending');
    assert.equal(statuses[1].dataset.state, 'failed');
    assert.equal(statuses[1].textContent, 'failed: No captions available');
    assert.equal(statuses[1].title, 'No captions available',
        'the full reason stays reachable when the cell is narrow');

    feature._setBatchRow('aaaaaaaaaaa', 'done');
    assert.equal(collect(feature._batchPanel, 'ytkit-transcript-batch-status')[0].textContent, 'done',
        'a state with no detail renders the state alone, not a dangling separator');
});

// ── bulkCardActions ────────────────────────────────────────────────────
function bulkFixture() {
    const doc = renderDocument(() => []);
    const toasts = [];
    const hidden = [];
    const allowed = [];
    const feature = loadFeature('bulkCardActions', {
        document: doc,
        location: { href: 'https://www.youtube.com/' },
        URL,
        showToast: (message) => toasts.push(message),
        _refreshCornerStack: () => {},
        registerCornerStackElement: () => () => {},
        getFeatureById: (id) => (id === 'hideVideosFromHome' ? {
            _addHiddenVideos: (ids) => hidden.push(...ids),
            _addAllowedVideos: (ids) => allowed.push(...ids),
            _removeHiddenVideos: () => {},
            _processAllVideos: () => {}
        } : null)
    });
    return { feature, doc, toasts, hidden, allowed };
}

function card(videoId) {
    const node = fakeNode({ tag: 'ytd-rich-item-renderer' });
    const link = fakeNode({ tag: 'a', attributes: { href: `https://www.youtube.com/watch?v=${videoId}` } });
    node.appendChild(link);
    node.querySelector = () => link;
    return node;
}

test('bulkCardActions builds one toolbar and keeps it out of the way until select mode', () => {
    const { feature, doc } = bulkFixture();

    const bar = feature._findActionBar();
    assert.equal(feature._findActionBar(), bar, 'the toolbar is reused');
    assert.equal(bar.className, 'ytkit-bulk-bar');
    assert.equal(bar.getAttribute('role'), 'toolbar');
    assert.equal(bar.getAttribute('aria-label'), 'Bulk card actions');

    const count = collect(bar, 'ytkit-bulk-count')[0];
    assert.equal(count.dataset.role, 'count');
    assert.equal(count.getAttribute('aria-live'), 'polite');
    assert.equal(count.textContent, '0 selected');

    feature._renderActionBar();
    assert.equal(bar.hidden, true, 'the toolbar hides while select mode is off');

    feature._enterSelectMode();
    assert.equal(bar.hidden, false);
    assert.equal(doc.body.dataset.ytkitBulkSelect, '1',
        'the page is marked so the select-mode styling applies');

    feature._exitSelectMode();
    assert.equal(bar.hidden, true);
    assert.equal(doc.body.dataset.ytkitBulkSelect, undefined);
});

test('bulkCardActions counts the cards it selected and marks each one', () => {
    const { feature } = bulkFixture();
    const first = card('aaaaaaaaaaa');
    const second = card('bbbbbbbbbbb');

    feature._enterSelectMode();
    const bar = feature._actionBar;

    feature._toggleCardSelection(first);
    assert.equal(first.dataset.ytkitBulkSelected, '1');
    assert.equal(textOf(bar, 'ytkit-bulk-count')[0], '1 selected');

    feature._toggleCardSelection(second);
    assert.equal(textOf(bar, 'ytkit-bulk-count')[0], '2 selected');

    // Clicking a selected card takes it back out rather than counting it twice.
    feature._toggleCardSelection(first);
    assert.equal(first.dataset.ytkitBulkSelected, undefined);
    assert.equal(textOf(bar, 'ytkit-bulk-count')[0], '1 selected');

    feature._clearSelection();
    assert.equal(second.dataset.ytkitBulkSelected, undefined);
    assert.equal(textOf(bar, 'ytkit-bulk-count')[0], '0 selected');
});

test('bulkCardActions ignores a card it cannot resolve to a video', () => {
    const { feature } = bulkFixture();
    const stranger = fakeNode({ tag: 'ytd-rich-item-renderer' });
    stranger.querySelector = () => null;

    feature._enterSelectMode();
    feature._toggleCardSelection(stranger);

    assert.equal(stranger.dataset.ytkitBulkSelected, undefined,
        'a card with no watch link must not look selected when nothing was selected');
    assert.equal(textOf(feature._actionBar, 'ytkit-bulk-count')[0], '0 selected');
});

test('bulkCardActions hiding the selection empties it and reports the count', () => {
    const { feature, toasts, hidden } = bulkFixture();
    const first = card('aaaaaaaaaaa');
    const second = card('bbbbbbbbbbb');

    feature._enterSelectMode();
    feature._toggleCardSelection(first);
    feature._toggleCardSelection(second);
    feature._bulkHide();

    assert.deepEqual(Array.from(hidden), ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    assert.ok(first.classList.contains('ytkit-video-hidden'));
    assert.equal(first.dataset.ytkitBulkSelected, undefined,
        'a card that was just hidden must not stay marked as selected');
    assert.equal(textOf(feature._actionBar, 'ytkit-bulk-count')[0], '0 selected');
    assert.ok(toasts.some((message) => /Hidden 2 videos/.test(message)));

    // Nothing selected means nothing to do, and no toast claiming otherwise.
    const before = toasts.length;
    feature._bulkHide();
    assert.equal(toasts.length, before);
});

// ── redditComments ─────────────────────────────────────────────────────
function redditFixture(response) {
    const doc = renderDocument(() => []);
    const feature = loadFeature('redditComments', {
        document: doc,
        URL,
        getVideoId: () => 'abcdefghijk',
        extensionFetchJson: async () => response,
        YTKitCore: {
            describeFailure: () => 'The service could not be reached. Check your connection, then try again.',
            describeFailureWithLabel: (label, _error) => `${label}: reached the fallback`,
            failureDiagnosticText: (error) => String(error?.message || error)
        },
        DiagnosticLog: { record() {} }
    });
    return { feature, doc };
}

function redditPost(overrides = {}) {
    return {
        data: {
            permalink: '/r/videos/comments/abc/a_thread/',
            title: 'A thread about the video',
            subreddit: 'videos',
            score: 42,
            num_comments: 7,
            ...overrides
        }
    };
}

test('redditComments renders a row per thread with its subreddit line', async () => {
    const { feature, doc } = redditFixture({
        data: { data: { children: [redditPost(), redditPost({ title: '', subreddit: 'youtube', score: 1, num_comments: 0 })] } }
    });
    const container = doc.createElement('div');

    await feature._load(container);

    const rows = collect(container, 'ytkit-rc-row');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].href, 'https://www.reddit.com/r/videos/comments/abc/a_thread/');
    assert.equal(rows[0].target, '_blank');
    assert.equal(rows[0].rel, 'noopener noreferrer', 'an off-site row must not hand over the opener');
    assert.deepEqual(textOf(container, 'ytkit-rc-title'), ['A thread about the video', '(untitled)']);
    assert.deepEqual(textOf(container, 'ytkit-rc-meta'), [
        'r/videos • 42 pts • 7 comments',
        'r/youtube • 1 pts • 0 comments'
    ]);
});

test('redditComments skips a permalink that would leave reddit.com', async () => {
    const { feature, doc } = redditFixture({
        data: {
            data: {
                children: [
                    redditPost({ permalink: '//evil.test/phish', title: 'Protocol relative' }),
                    redditPost({ permalink: 'https://evil.test/phish', title: 'Absolute off-site' }),
                    redditPost({ permalink: '/r/videos/comments/ok/', title: 'Genuine thread' })
                ]
            }
        }
    });
    const container = doc.createElement('div');

    await feature._load(container);

    assert.deepEqual(textOf(container, 'ytkit-rc-title'), ['Genuine thread'],
        'only a permalink that resolves back to reddit.com may be rendered');
    assert.equal(collect(container, 'ytkit-rc-row')[0].href, 'https://www.reddit.com/r/videos/comments/ok/');
});

test('redditComments says so when there is nothing to show', async () => {
    const { feature, doc } = redditFixture({ data: { data: { children: [] } } });
    const container = doc.createElement('div');

    await feature._load(container);

    assert.equal(container.textContent, 'No Reddit threads found for this video.');
    assert.equal(collect(container, 'ytkit-rc-row').length, 0);
});

test('redditComments builds its panel once, collapsed until asked to load', () => {
    const secondary = fakeNode({ tag: 'div', attributes: { id: 'secondary', class: 'ytd-watch-flexy' } });
    secondary.querySelector = (selector) => collectMatching(secondary, selector)[0] || null;
    const doc = renderDocument((selector) => (selector.includes('#secondary') ? secondary : []));
    const feature = loadFeature('redditComments', {
        document: doc,
        URL,
        getVideoId: () => 'abcdefghijk',
        extensionFetchJson: async () => ({ data: { data: { children: [] } } }),
        DiagnosticLog: { record() {} }
    });

    feature._inject();
    feature._inject();

    assert.equal(secondary.children.length, 1, 'the panel is injected once per sidebar');
    const panel = secondary.children[0];
    assert.equal(panel.className, 'ytkit-rc-panel');
    assert.equal(textOf(panel, 'ytkit-rc-head')[0], 'Reddit Discussions');
    assert.equal(collect(panel, 'ytkit-rc-body')[0].children.length, 0,
        'nothing is fetched until the reader asks for it');
    assert.equal(textOf(panel, 'ytkit-rc-load')[0], 'Load threads');
});

// ── miniPlayerBar ──────────────────────────────────────────────────────
function miniPlayerFixture({ title = 'The video title', video } = {}) {
    const titleNode = fakeNode({ tag: 'yt-formatted-string', text: title });
    const player = fakeNode({ tag: 'div', attributes: { id: 'movie_player' } });
    const observers = [];
    const doc = renderDocument((selector) => {
        if (selector.includes('h1')) return titleNode;
        if (selector === 'video') return video ? [video] : [];
        if (selector.includes('#movie_player')) return player;
        return [];
    });
    const feature = loadFeature('miniPlayerBar', {
        document: doc,
        URL,
        location: { href: 'https://www.youtube.com/watch?v=abcdefghijk' },
        window: { scrollTo: () => {} },
        isWatchPagePath: () => true,
        IntersectionObserver: class IntersectionObserver {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe() {}
            disconnect() {}
        }
    });
    return { feature, doc, observers };
}

function playerVideo({ paused = false, currentTime = 0, duration = 100 } = {}) {
    return {
        paused,
        currentTime,
        duration,
        play() { this.paused = false; return Promise.resolve(); },
        pause() { this.paused = true; }
    };
}

test('miniPlayerBar builds one bar carrying the current video thumbnail and title', () => {
    const { feature, doc } = miniPlayerFixture({ video: playerVideo() });

    feature._create();
    feature._create();

    assert.equal(doc.body.children.length, 1, 'the bar is built once');
    const bar = doc.body.children[0];
    assert.equal(bar.id, 'ytkit-mini-player-bar');
    assert.equal(bar.getAttribute('role'), 'complementary');
    assert.equal(collect(bar, 'ytkit-mini-player-thumb-image')[0].src,
        'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg');
    assert.equal(textOf(bar, 'ytkit-mini-player-title')[0], 'The video title');
    assert.equal(collect(bar, 'ytkit-mini-player-progress-fill').length, 1);
});

test('miniPlayerBar falls back to a generic label when the title has not rendered', () => {
    const { feature, doc } = miniPlayerFixture({ title: '', video: playerVideo() });

    feature._create();

    assert.equal(textOf(doc.body.children[0], 'ytkit-mini-player-title')[0], 'Now Playing',
        'an empty title must not render as a blank strip');
});

test('miniPlayerBar toggles the player and keeps its own control in sync', () => {
    const video = playerVideo({ paused: false });
    const { feature, doc } = miniPlayerFixture({ video });

    feature._create();
    const bar = doc.body.children[0];
    const playBtn = collect(bar, 'ytkit-mini-player-btn--primary')[0];
    assert.equal(playBtn.textContent, '⏸');
    assert.equal(playBtn.getAttribute('aria-label'), 'Pause video');

    playBtn.handlers.get('click')();
    assert.equal(video.paused, true);
    assert.equal(playBtn.textContent, '▶');
    assert.equal(playBtn.getAttribute('aria-label'), 'Play video');

    playBtn.handlers.get('click')();
    assert.equal(video.paused, false);
    assert.equal(playBtn.getAttribute('aria-label'), 'Pause video');
});

test('miniPlayerBar draws progress only while it is on screen', () => {
    const video = playerVideo({ currentTime: 25, duration: 100 });
    const { feature, doc, observers } = miniPlayerFixture({ video });

    feature._create();
    const bar = doc.body.children[0];
    const fill = collect(bar, 'ytkit-mini-player-progress-fill')[0];

    // The bar starts hidden, so a timeupdate must not cost anything.
    bar.style.display = 'none';
    feature._updateProgress();
    assert.equal(fill.style.width, '', 'a hidden bar does not repaint');

    // Scrolling the player out of view reveals the bar and refreshes it at
    // once, because timeupdate will not fire again while the video is paused.
    observers[0].callback([{ isIntersecting: false }]);
    assert.equal(bar.style.display, 'flex');
    assert.equal(fill.style.width, '25%');

    video.currentTime = 60;
    feature._updateProgress();
    assert.equal(fill.style.width, '60%');

    observers[0].callback([{ isIntersecting: true }]);
    assert.equal(bar.style.display, 'none');
});

test('miniPlayerBar stays dismissed once the reader closes it', () => {
    const { feature, doc, observers } = miniPlayerFixture({ video: playerVideo() });

    feature._create();
    const bar = doc.body.children[0];
    const close = collect(bar, 'ytkit-mini-player-btn').at(-1);
    assert.equal(close.getAttribute('aria-label'), 'Dismiss mini player bar');

    close.handlers.get('click')();
    assert.equal(bar.style.display, 'none');

    observers[0].callback([{ isIntersecting: false }]);
    assert.equal(bar.style.display, 'none',
        'scrolling again must not bring back a bar the reader dismissed');
});

// ── playlistSearch ─────────────────────────────────────────────────────
function playlistSearchFixture(titles = []) {
    const header = fakeNode({ tag: 'div', attributes: { id: 'header-contents' } });
    const panel = fakeNode({ tag: 'ytd-playlist-panel-renderer' });
    panel.appendChild(header);
    const items = titles.map((text) => {
        const item = fakeNode({ tag: 'ytd-playlist-panel-video-renderer' });
        const titleNode = fakeNode({ tag: 'span', text, attributes: { id: 'video-title' } });
        item.appendChild(titleNode);
        item.querySelector = () => titleNode;
        item.style.display = '';
        return item;
    });
    const container = fakeNode({ tag: 'div', attributes: { id: 'items' } });
    container.querySelectorAll = () => items;
    const doc = renderDocument((selector) => {
        if (selector.includes('#header-contents')) return header;
        if (selector.includes('#items')) return container;
        return [];
    });
    const feature = loadFeature('playlistSearch', { document: doc });
    return { feature, panel, header, items };
}

test('playlistSearch builds one bar and reports the unfiltered item count', () => {
    const { feature, panel } = playlistSearchFixture(['Alpha', 'Beta', 'Gamma']);

    feature._create();
    feature._create();

    assert.equal(panel.children.length, 2, 'the bar joins the header, once');
    const bar = panel.children[1];
    assert.equal(bar.className, 'ytkit-playlist-search-bar');
    assert.equal(collect(bar, 'ytkit-playlist-search-count')[0].textContent, '3 items');
    const input = bar.children[0];
    assert.equal(input.type, 'search');
    assert.equal(input.getAttribute('aria-label'), 'Search playlist items');
});

test('playlistSearch pluralises a single item rather than saying "1 items"', () => {
    const { feature, panel } = playlistSearchFixture(['Only one']);
    feature._create();
    assert.equal(collect(panel.children[1], 'ytkit-playlist-search-count')[0].textContent, '1 item');
});

test('playlistSearch hides the rows that do not match and restores them on clear', () => {
    const { feature, panel, items } = playlistSearchFixture(['Cooking basics', 'Cycling basics', 'More cooking']);

    feature._create();
    const bar = panel.children[1];
    const input = bar.children[0];
    const count = collect(bar, 'ytkit-playlist-search-count')[0];

    input.value = 'cooking';
    feature._applyFilter();
    assert.deepEqual(Array.from(items, (item) => item.style.display), ['', 'none', '']);
    assert.equal(count.textContent, '2 of 3');

    input.value = '';
    feature._applyFilter();
    assert.deepEqual(Array.from(items, (item) => item.style.display), ['', '', '']);
    assert.equal(count.textContent, '3 items');
});

// ── abLoop ─────────────────────────────────────────────────────────────
function abLoopFixture(video) {
    const progressBar = fakeNode({ tag: 'div', attributes: { class: 'ytp-progress-bar' } });
    const toasts = [];
    const doc = renderDocument(() => []);
    const feature = loadFeature('abLoop', {
        document: doc,
        getMainVideoElement: () => video,
        getPlayerProgressBar: () => progressBar,
        showToast: (message) => toasts.push(message)
    });
    feature._btn = doc.createElement('button');
    return { feature, progressBar, toasts, doc };
}

function loopVideo(duration = 200) {
    return {
        duration,
        currentTime: 0,
        _handlers: new Map(),
        addEventListener(type, handler) { this._handlers.set(type, handler); },
        removeEventListener(type) { this._handlers.delete(type); }
    };
}

test('abLoop draws the loop region across the progress bar once both points are set', () => {
    const video = loopVideo(200);
    const { feature, progressBar } = abLoopFixture(video);

    video.currentTime = 50;
    feature._setPoint('A');
    assert.equal(progressBar.children.length, 0, 'one point alone draws nothing');

    video.currentTime = 150;
    feature._setPoint('B');

    assert.equal(progressBar.children.length, 1);
    const markers = progressBar.children[0];
    assert.equal(markers.className, 'ytkit-ab-markers');
    const region = markers.children[0];
    assert.equal(region.style.left, '25%');
    assert.equal(region.style.width, '50%');
});

test('abLoop orders the points it was given backwards before drawing them', () => {
    const video = loopVideo(200);
    const { feature, progressBar } = abLoopFixture(video);

    video.currentTime = 150;
    feature._setPoint('A');
    video.currentTime = 50;
    feature._setPoint('B');

    assert.equal(feature._pointA, 50);
    assert.equal(feature._pointB, 150);
    assert.equal(progressBar.children[0].children[0].style.left, '25%',
        'a backwards region would render a negative width');
    assert.equal(progressBar.children[0].children[0].style.width, '50%');
});

test('abLoop clearing takes the region off the bar and resets the button state', () => {
    const video = loopVideo(200);
    const { feature, progressBar, toasts } = abLoopFixture(video);

    video.currentTime = 20;
    feature._setPoint('A');
    video.currentTime = 60;
    feature._setPoint('B');
    assert.ok(feature._btn.classList.contains('ytkit-player-btn--active'));

    feature._clearLoop();

    assert.equal(progressBar.children.length, 0);
    assert.equal(feature._pointA, null);
    assert.equal(feature._pointB, null);
    assert.equal(feature._btn.classList.contains('ytkit-player-btn--active'), false);
    assert.equal(feature._btn.classList.contains('ytkit-player-btn--warn'), false);
    assert.ok(toasts.some((message) => /A-B Loop cleared/.test(message)));
});

test('abLoop marks a half-set loop differently from a running one', () => {
    const video = loopVideo(200);
    const { feature } = abLoopFixture(video);

    video.currentTime = 20;
    feature._setPoint('A');
    feature._updateBtn();

    assert.equal(feature._btn.classList.contains('ytkit-player-btn--warn'), true,
        'a loop waiting for its second point must not look like a running one');
    assert.equal(feature._btn.classList.contains('ytkit-player-btn--active'), false);
});

test('abLoop rewinds to A once playback passes B', () => {
    const video = loopVideo(200);
    const { feature } = abLoopFixture(video);

    video.currentTime = 40;
    feature._setPoint('A');
    video.currentTime = 80;
    feature._setPoint('B');

    video.currentTime = 81;
    video._handlers.get('timeupdate')();
    assert.equal(video.currentTime, 40);

    feature._stopLoop();
    video.currentTime = 81;
    assert.equal(video._handlers.has('timeupdate'), false,
        'a stopped loop must not keep seeking the player');
});

// ── watchPageTabs ──────────────────────────────────────────────────────
function watchTabsFixture() {
    const below = fakeNode({ tag: 'div', attributes: { id: 'below', class: 'ytd-watch-flexy' } });
    const description = fakeNode({ tag: 'ytd-watch-metadata' });
    below.appendChild(description);
    const comments = fakeNode({ tag: 'ytd-comments', attributes: { id: 'comments' } });
    const chapters = fakeNode({ tag: 'ytd-macro-markers-list-renderer' });
    const transcript = fakeNode({ tag: 'ytd-transcript-renderer' });
    below.querySelector = (selector) => (
        selector.includes('ytd-watch-metadata') ? description : collectMatching(below, selector)[0] || null
    );

    const doc = renderDocument((selector) => {
        if (selector.includes('#below')) return below;
        if (selector.includes('ytd-comments#comments')) return comments;
        if (selector.includes('macro-markers')) return chapters;
        return [];
    });
    const feature = loadFeature('watchPageTabs', {
        document: doc,
        YTKitCore: { getTranscriptPanelElement: () => transcript }
    });
    return { feature, below, description, comments, chapters, transcript };
}

test('watchPageTabs builds one tab bar and opens on the description', () => {
    const { feature, below, description, comments } = watchTabsFixture();

    feature._inject();
    feature._inject();

    const bars = collect(below, 'ytkit-wtabs');
    assert.equal(bars.length, 1, 'the bar is injected once per watch page');
    assert.equal(below.children[0], bars[0], 'the bar goes above the panels it switches');

    const tabs = collect(bars[0], 'ytkit-wtab');
    assert.deepEqual(Array.from(tabs, (tab) => tab.textContent),
        ['Description', 'Comments', 'Chapters', 'Transcript']);
    assert.deepEqual(Array.from(tabs, (tab) => tab.dataset.wtab),
        ['desc', 'comments', 'chapters', 'transcript']);

    assert.ok(tabs[0].classList.contains('ytkit-wtab--active'));
    assert.equal(description.style.display, '');
    assert.equal(comments.style.display, 'none');
});

test('watchPageTabs shows exactly one panel per tab and moves the active mark with it', () => {
    const { feature, below, description, comments, chapters, transcript } = watchTabsFixture();

    feature._inject();
    const tabs = collect(collect(below, 'ytkit-wtabs')[0], 'ytkit-wtab');

    tabs[1].onclick();
    assert.deepEqual(
        [description.style.display, comments.style.display, chapters.style.display, transcript.style.display],
        ['none', '', 'none', 'none']
    );
    assert.deepEqual(Array.from(tabs, (tab) => tab.classList.contains('ytkit-wtab--active')),
        [false, true, false, false]);

    tabs[3].onclick();
    assert.deepEqual(
        [description.style.display, comments.style.display, chapters.style.display, transcript.style.display],
        ['none', 'none', 'none', '']
    );
    assert.deepEqual(Array.from(tabs, (tab) => tab.classList.contains('ytkit-wtab--active')),
        [false, false, false, true]);
});

// ── playbackStatsOverlay ───────────────────────────────────────────────
function statsOverlayFixture(video) {
    const controls = fakeNode({ tag: 'div', attributes: { class: 'ytp-right-controls' } });
    const player = fakeNode({ tag: 'div', attributes: { id: 'movie_player' } });
    player.appendChild(controls);
    player.querySelector = (selector) => collectMatching(player, selector)[0] || null;
    player.getStatsForNerds = () => ({ codecs: 'av01', resolution: '1920x1080' });

    const doc = renderDocument((selector) => {
        if (selector === 'video') return video ? [video] : [];
        if (selector.includes('#movie_player')) return player;
        return [];
    });
    const feature = loadFeature('playbackStatsOverlay', {
        document: doc,
        window: { location: { href: 'https://www.youtube.com/watch?v=abcdefghijk' } },
        navigator: { connection: { downlink: 25 } },
        setInterval: () => 1,
        clearInterval: () => {},
        getVideoId: () => 'abcdefghijk',
        downloadFormatEstimates: null,
        QUALITY_OPTIONS: []
    });
    return { feature, player, controls, doc };
}

function statsVideo() {
    return {
        videoWidth: 1280,
        videoHeight: 720,
        playbackRate: 1.25,
        currentTime: 10,
        buffered: { length: 1, end: () => 40 },
        getVideoPlaybackQuality: () => ({ droppedVideoFrames: 3, totalVideoFrames: 900 })
    };
}

test('playbackStatsOverlay builds a hidden overlay and a toggle that reports its state', () => {
    const { feature, player, controls } = statsOverlayFixture(statsVideo());

    feature._create();
    feature._create();

    const overlays = collect(player, 'ytkit-stats-btn');
    assert.equal(overlays.length, 1, 'the toggle is built once');
    assert.equal(feature._overlay.id, 'ytkit-stats-overlay');
    assert.equal(feature._overlay.style.display, 'none', 'stats stay off until asked for');
    assert.equal(controls.children[0], overlays[0], 'the toggle leads the right-hand controls');

    const button = overlays[0];
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.equal(button.getAttribute('aria-label'), 'Toggle playback stats overlay');

    button.handlers.get('click')();
    assert.equal(feature._overlay.style.display, 'block');
    assert.equal(button.getAttribute('aria-pressed'), 'true');

    button.handlers.get('click')();
    assert.equal(feature._overlay.style.display, 'none');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('playbackStatsOverlay writes the player numbers only while it is visible', () => {
    const video = statsVideo();
    const { feature, player } = statsOverlayFixture(video);

    feature._create();
    feature._update();
    assert.equal(feature._overlay.textContent, '', 'a hidden overlay costs nothing to keep');

    collect(player, 'ytkit-stats-btn')[0].handlers.get('click')();
    feature._update();

    const lines = feature._overlay.textContent.split('\n');
    // Resolution comes from the player's own stats when it exposes them, and
    // falls back to the element's intrinsic size otherwise.
    assert.equal(lines[0], 'Resolution: 1920x1080');
    assert.equal(lines[1], 'Dropped: 3/900 frames');
    assert.equal(lines[2], 'Bandwidth: 25 Mbps');
    assert.equal(lines[3], 'Playback: 1.25x');
    assert.equal(lines[4], 'Buffered: 30s ahead');
});

test('playbackStatsOverlay falls back to the element size when the player exposes no stats', () => {
    const video = statsVideo();
    const { feature, player } = statsOverlayFixture(video);
    player.getStatsForNerds = () => null;

    feature._create();
    collect(player, 'ytkit-stats-btn')[0].handlers.get('click')();
    feature._update();

    assert.equal(feature._overlay.textContent.split('\n')[0], 'Resolution: 1280x720');
});

test('playbackStatsOverlay cleanup takes both its nodes off the player', () => {
    const { feature, player } = statsOverlayFixture(statsVideo());

    feature._create();
    assert.equal(collect(player, 'ytkit-stats-btn').length, 1);

    feature._cleanup();

    assert.equal(collect(player, 'ytkit-stats-btn').length, 0);
    assert.equal(feature._overlay, null);
    assert.equal(feature._btn, null);
});
