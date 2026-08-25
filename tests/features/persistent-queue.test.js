'use strict';

// persistentQueue builds a pill, a panel and a row per entry, and every one of
// these tests used to be a regex over the feature's source. A source pin
// cannot tell a working renderer from a broken one, so the queue is driven for
// real here: mutate it, render it, click the buttons it produced.
//
// Every assertion is bait-verified against a mutation of the shipped source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

function descendants(node) {
    const found = [];
    (function walk(current) {
        for (const child of current.children || []) {
            found.push(child);
            walk(child);
        }
    })(node);
    return found;
}

function byClass(node, className) {
    return descendants(node).filter((element) => element.classList?.contains?.(className));
}

function queueFixture({ items = [], claim, now } = {}) {
    const store = new Map();
    if (items.length || claim) store.set('ytkit-queue', { v: 1, items, ...(claim ? { claim } : {}) });
    const toasts = [];
    const navigations = [];
    const listeners = new Map();

    // destroy() sweeps the buttons it injected into feed cards; the fixture has
    // to own one so the sweep can be observed.
    const cardButton = fakeNode({ tag: 'button', attributes: { class: 'ytkit-queue-btn' } });
    const doc = fakeDocument((selector) => (selector.includes('ytkit-queue-btn') ? [cardButton] : []));
    const created = [];
    const create = doc.createElement.bind(doc);
    doc.createElement = (tag) => {
        const node = create(tag);
        node.querySelectorAll = (selector) => descendants(node)
            .filter((child) => { try { return child.matches(selector); } catch { return false; } });
        node.querySelector = (selector) => node.querySelectorAll(selector)[0] || null;
        node.focus = () => {};
        // Recorded rather than swallowed: the import flow reaches the parser
        // only through a change handler bound this way.
        node.handlers = new Map();
        node.addEventListener = (type, handler) => node.handlers.set(type, handler);
        node.removeEventListener = (type) => node.handlers.delete(type);
        node.click = () => { node.clicked = (node.clicked || 0) + 1; };
        created.push(node);
        return node;
    };

    class StubFileReader {
        readAsText(file) { this.result = file.text; this.onload(); }
    }

    const rules = { navigate: new Set(), scopedMutation: new Set() };
    const appState = { settings: {} };
    const feature = loadFeature('persistentQueue', {
        document: doc,
        appState,
        addNavigateRule: (id) => rules.navigate.add(id),
        removeNavigateRule: (id) => rules.navigate.delete(id),
        addScopedMutationRule: (id) => rules.scopedMutation.add(id),
        removeScopedMutationRule: (id) => rules.scopedMutation.delete(id),
        location: { get href() { return ''; }, set href(value) { navigations.push(value); } },
        window: {
            addEventListener: (type, handler) => listeners.set(type, handler),
            removeEventListener: (type) => listeners.delete(type)
        },
        storageReadJSON: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
        storageWriteJSON: (key, value) => store.set(key, value),
        showToast: (message, _colour, options) => toasts.push({ message, options }),
        registerCornerStackElement: () => () => {},
        _refreshCornerStack: () => {},
        injectStyle: () => fakeNode(),
        getVideoId: () => 'abcdefghijk',
        getMainVideoElement: () => ({ addEventListener() {}, removeEventListener() {} }),
        FileReader: StubFileReader
    });
    void now;
    return { feature, doc, store, toasts, navigations, listeners, created, rules, appState, cardButton };
}

// A feature loaded in a vm sandbox returns arrays carrying the sandbox's
// Array prototype, which deepStrictEqual rejects on identity alone. Cross the
// boundary before comparing.
function pluck(items, key) {
    return Array.from(items, (item) => item[key]);
}

function entry(id, title = `Title ${id}`, channel = '') {
    return { id, title, channel, addedAt: 1 };
}

test('persistentQueue refuses a duplicate and caps the list it stores', () => {
    const { feature, store, toasts } = queueFixture();

    assert.equal(feature._add('aaaaaaaaaaa', 'First', 'Chan'), true);
    assert.equal(feature._add('aaaaaaaaaaa', 'First again', 'Chan'), false);
    assert.deepEqual(pluck(store.get('ytkit-queue').items, 'id'), ['aaaaaaaaaaa']);
    assert.match(toasts.at(-1).message, /Already in queue/);

    assert.equal(feature._MAX_ITEMS, 200, 'the cap is what _write slices to');
    const overfull = { v: 1, items: Array.from({ length: 205 }, (_v, i) => entry(String(i).padStart(11, 'x'))) };
    feature._write(overfull);
    assert.equal(store.get('ytkit-queue').items.length, 200, 'a stored queue is sliced to the cap');
});

test('persistentQueue renders the pill only while the queue has entries', () => {
    const { feature, doc } = queueFixture();

    feature._renderPill();
    assert.equal(doc.body.children.length, 0, 'an empty queue shows no pill');

    feature._add('aaaaaaaaaaa', 'First');
    assert.equal(doc.body.children.length, 1);
    assert.equal(doc.body.children[0].className, 'ytkit-queue-pill');
    assert.equal(doc.body.children[0].textContent, 'Queue · 1');
    assert.equal(doc.body.children[0].getAttribute('aria-label'), 'Open Astra queue (1 item)');

    feature._add('bbbbbbbbbbb', 'Second');
    assert.equal(doc.body.children.length, 1, 'the pill is updated, not duplicated');
    assert.equal(doc.body.children[0].textContent, 'Queue · 2');
    assert.equal(doc.body.children[0].getAttribute('aria-label'), 'Open Astra queue (2 items)');

    feature._removeAt(0, 'aaaaaaaaaaa');
    feature._removeAt(0, 'bbbbbbbbbbb');
    assert.equal(doc.body.children.length, 0, 'emptying the queue takes the pill away');
    assert.equal(feature._pill, null);
});

test('persistentQueue renders a row per entry with its move and remove controls', () => {
    const { feature, doc } = queueFixture({
        items: [entry('aaaaaaaaaaa', 'Alpha', 'Chan A'), entry('bbbbbbbbbbb', 'Beta'), entry('ccccccccccc', 'Gamma')]
    });

    feature._renderPill();
    feature._togglePanel();

    const panel = feature._panel;
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(panel.getAttribute('aria-label'), 'Astra persistent queue');

    const rows = byClass(panel, 'ytkit-queue-row');
    assert.equal(rows.length, 3);
    assert.deepEqual(pluck(byClass(panel, 'ytkit-queue-title'), 'textContent'), ['Alpha', 'Beta', 'Gamma']);
    assert.equal(byClass(panel, 'ytkit-queue-title')[0].href, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
    assert.equal(byClass(panel, 'ytkit-queue-title')[0].title, 'Alpha by Chan A');
    assert.equal(byClass(panel, 'ytkit-queue-title')[1].title, 'Beta', 'no channel means no dangling separator');

    // The ends of the list cannot move further, and that has to show.
    const buttons = (row) => byClass(row, 'ytkit-queue-row-actions')[0].children;
    assert.equal(buttons(rows[0])[0].disabled, true, 'the first row cannot move up');
    assert.equal(buttons(rows[0])[1].disabled, false);
    assert.equal(buttons(rows[2])[1].disabled, true, 'the last row cannot move down');
    assert.equal(buttons(rows[1])[2].getAttribute('aria-label'), 'Remove from queue: Beta');
});

// A row's buttons close over the index they were rendered at, so the wiring has
// to carry the video id too. Proving that means clicking the button the
// renderer produced, not calling the mutator behind it: an earlier version of
// this test called the mutators directly and stayed green with the id argument
// removed from both call sites.
function rowButtons(panel, at) {
    const row = byClass(panel, 'ytkit-queue-row')[at];
    return byClass(row, 'ytkit-queue-row-actions')[0].children;
}

test('persistentQueue row actions follow the video they were rendered for, not the index', () => {
    const { feature, store } = queueFixture({
        items: [entry('aaaaaaaaaaa', 'Alpha'), entry('bbbbbbbbbbb', 'Beta'), entry('ccccccccccc', 'Gamma')]
    });

    feature._renderPill();
    feature._togglePanel();

    // Another tab reorders the queue between render and click. The rendered
    // row for Gamma is still index 2, and a bare index would remove Alpha.
    const removeGamma = rowButtons(feature._panel, 2)[2];
    store.set('ytkit-queue', { v: 1, items: [entry('ccccccccccc', 'Gamma'), entry('aaaaaaaaaaa', 'Alpha'), entry('bbbbbbbbbbb', 'Beta')] });
    removeGamma.handlers.get('click')();
    assert.deepEqual(pluck(store.get('ytkit-queue').items, 'title'), ['Alpha', 'Beta']);

    // Same for a move: the button rendered for Beta must move Beta, whatever
    // slid into its old position.
    const moveBetaUp = rowButtons(feature._panel, 1)[0];
    store.set('ytkit-queue', { v: 1, items: [entry('zzzzzzzzzzz', 'Zeta'), entry('aaaaaaaaaaa', 'Alpha'), entry('bbbbbbbbbbb', 'Beta')] });
    moveBetaUp.handlers.get('click')();
    assert.deepEqual(pluck(store.get('ytkit-queue').items, 'title'), ['Zeta', 'Beta', 'Alpha']);

    // An entry another tab already removed is a no-op, not a blind splice.
    feature._removeAt(1, 'not-in-queue');
    assert.deepEqual(pluck(store.get('ytkit-queue').items, 'title'), ['Zeta', 'Beta', 'Alpha']);

    // The panel follows every one of those writes.
    assert.deepEqual(pluck(byClass(feature._panel, 'ytkit-queue-title'), 'textContent'),
        ['Zeta', 'Beta', 'Alpha']);
});

test('persistentQueue auto-advance is gated on its own sub-toggle', () => {
    const played = [];
    const { feature, appState } = queueFixture({ items: [entry('aaaaaaaaaaa', 'Alpha')] });
    feature._playNext = () => played.push('advanced');
    feature.init();

    assert.equal(typeof feature._endedHandler, 'function', 'the queue rides the video ended event');

    feature._endedHandler();
    assert.deepEqual(played, ['advanced'], 'the sub-toggle is on unless it is explicitly off');

    appState.settings.persistentQueueAutoAdvance = false;
    feature._endedHandler();
    assert.deepEqual(played, ['advanced'],
        'a video ending with auto-advance off must not jump to the next entry');

    appState.settings.persistentQueueAutoAdvance = true;
    feature._endedHandler();
    assert.deepEqual(played, ['advanced', 'advanced']);
});

test('persistentQueue auto-advance stops at the end of the queue', () => {
    const played = [];
    const { feature } = queueFixture();
    feature._playNext = () => played.push('advanced');
    feature.init();

    feature._endedHandler();
    assert.deepEqual(played, [], 'an empty queue has nothing to advance to');
});

test('persistentQueue skips an entry another tab claimed within the claim window', () => {
    const claimedAt = Date.now();
    const { feature, store, navigations } = queueFixture({
        items: [entry('aaaaaaaaaaa'), entry('bbbbbbbbbbb')],
        claim: { id: 'aaaaaaaaaaa', at: claimedAt }
    });

    feature._playNext();

    assert.deepEqual(navigations, ['https://www.youtube.com/watch?v=bbbbbbbbbbb'],
        'the entry another tab claimed must not play twice');
    assert.equal(store.get('ytkit-queue').claim.id, 'bbbbbbbbbbb', 'this tab records its own claim');
    assert.deepEqual(Array.from(store.get('ytkit-queue').items), []);
});

test('persistentQueue plays a head whose claim has expired', () => {
    const { feature, navigations } = queueFixture({
        items: [entry('aaaaaaaaaaa'), entry('bbbbbbbbbbb')],
        // Older than _CLAIM_WINDOW_MS, so the tab that set it is gone.
        claim: { id: 'aaaaaaaaaaa', at: Date.now() - 60_000 }
    });

    feature._playNext();

    assert.deepEqual(navigations, ['https://www.youtube.com/watch?v=aaaaaaaaaaa'],
        'a stale claim must not wedge the queue');
});

test('persistentQueue import keeps valid ids, reports duplicates, and survives a bad file', () => {
    const { feature, store, toasts, created } = queueFixture({ items: [entry('aaaaaaaaaaa', 'Alpha')] });

    const runImport = (text) => {
        feature._importJson();
        const input = created.filter((node) => node.tagName === 'INPUT').at(-1);
        assert.equal(input.type, 'file');
        assert.equal(input.clicked, 1, 'the picker must be opened');
        input.files = [{ text }];
        input.handlers.get('change')();
        return input;
    };

    runImport(JSON.stringify({
        items: [
            { id: 'aaaaaaaaaaa', title: 'Alpha again' },
            { id: 'short', title: 'Rejected' },
            { id: 'bbbbbbbbbbb', title: 'Beta', channel: 'Chan B' },
            { title: 'No id at all' }
        ]
    }));

    assert.deepEqual(pluck(store.get('ytkit-queue').items, 'id'), ['aaaaaaaaaaa', 'bbbbbbbbbbb'],
        'only 11-character ids are imported, and an existing id is not added twice');
    assert.equal(store.get('ytkit-queue').items[1].channel, 'Chan B');
    assert.match(toasts.at(-1).message, /1 added, 1 duplicate\(s\) skipped/);

    runImport('{ not json');
    assert.match(toasts.at(-1).message, /Import failed: not a valid queue JSON file/);
    assert.equal(store.get('ytkit-queue').items.length, 2, 'a bad file must not touch the stored queue');
});

test('persistentQueue re-renders when another tab edits the queue, and detaches on destroy', () => {
    const { feature, doc, store, listeners, rules, cardButton } = queueFixture({ items: [entry('aaaaaaaaaaa', 'Alpha')] });

    feature.init();
    const handler = listeners.get('ytkit-storage-changed');
    assert.equal(typeof handler, 'function', 'the pill must follow cross-tab storage changes');

    assert.equal(doc.body.children.length, 1);
    assert.equal(doc.body.children[0].textContent, 'Queue · 1');

    store.set('ytkit-queue', { v: 1, items: [entry('aaaaaaaaaaa'), entry('bbbbbbbbbbb')] });
    handler({ detail: { changes: { 'other-key': 1 } } });
    assert.equal(doc.body.children[0].textContent, 'Queue · 1', 'an unrelated key must not re-render');

    handler({ detail: { changes: { 'ytkit-queue': 1 } } });
    assert.equal(doc.body.children[0].textContent, 'Queue · 2');

    feature.destroy();
    assert.equal(listeners.has('ytkit-storage-changed'), false, 'destroy detaches the storage listener');
    // A leaked navigate or mutation rule keeps re-rendering the pill after the
    // feature is switched off, and a leaked card button keeps offering to queue.
    assert.equal(rules.navigate.has('persistentQueue'), false, 'destroy releases the navigate rule');
    assert.equal(rules.scopedMutation.has('persistentQueue'), false, 'destroy releases the mutation rule');
    assert.equal(doc.body.children.length, 0, 'destroy takes the pill off the page');
    assert.equal(cardButton.removed, 1, 'destroy removes the buttons it injected into cards');
});

test('autoExitFullscreen treats a pending queue entry as up-next', () => {
    // Cross-feature coupling read out of the monolith: this one is a genuine
    // source relationship rather than a render, so it stays a source check.
    const start = ytkitSource.indexOf("id: 'autoExitFullscreen'");
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /persistentQueue/,
        'fullscreen auto-exit must stay engaged when the queue will advance');
    assert.match(block, /ytkit-queue/,
        'queue check reads the shared queue storage key');
});
