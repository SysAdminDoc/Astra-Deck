'use strict';

// Sort by Length: a Length choice in a channel's Videos sort menu that loads
// every video and puts the longest first.
//
// The fixture is the @AyaKatz Videos tab captured live (2026-10-26): the
// first grid page and the continuation page after it. The helpers run on it
// directly; the controller runs against a small fake DOM shaped like the
// 2026-10 sort sheet; the bridge half runs through ytkit-main.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installBridgeChannel } = require('../helpers/main-bridge');
const { readUserscriptBuild, userscriptBundles } = require('../helpers/source');

const repoRoot = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const coreSource = read('extension/core/channel-length-sort.js');
const mainSource = read('extension/ytkit-main.js');
const injectionGuardSource = read('extension/core/injection-guard.js');
const lengthSort = require('../../extension/core/channel-length-sort.js');
const {
    parseDurationText, itemDuration, itemVideoId, splitContents, continuationItems,
    sortByLength, collectAllItems, isChannelVideosPath, sortChipOf, createChannelLengthSort, ITEM_ATTR
} = lengthSort;
const { createChannelLengthSortFeature, ENABLE_ATTR, LABEL_ATTR } = require('../../extension/features/channel-length-sort/index.js');
const schema = require('../../extension/core/settings-schema.js');

const STATUS_ATTR = 'data-ytkit-channel-length-sort-status';
const fixture = JSON.parse(read('tests/fixtures/channel-videos-length-sort-2026-10.json'));
const clone = (value) => JSON.parse(JSON.stringify(value));

function video(id, length) {
    return {
        richItemRenderer: { content: { lockupViewModel: {
            contentId: id,
            contentImage: { thumbnailViewModel: { overlays: [
                { thumbnailHoverOverlayToggleActionsViewModel: {} },
                { thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: length } }] } }
            ] } }
        } } }
    };
}
const continuation = (token) => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
const page = (items) => ({ onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: items } }] });

// ── the helpers ──────────────────────────────────────────────────────

test('duration badges read as seconds, and anything else reads -1', () => {
    assert.equal(parseDurationText('3:49'), 229);
    assert.equal(parseDurationText('1:49:16'), 6556);
    assert.equal(parseDurationText('0:07'), 7);
    assert.equal(parseDurationText(' 12:00 '), 720);
    assert.equal(parseDurationText('100:00:00'), 360000);
    for (const value of ['LIVE', 'UPCOMING', '', null, undefined, '3:7', '1:60', 'Now playing', '1:2:3:4']) {
        assert.equal(parseDurationText(value), -1, `${JSON.stringify(value)} has no length`);
    }
});

test('the capture is what the fixture says it is', () => {
    const first = splitContents(fixture.grid.contents);
    assert.equal(first.items.length, 30);
    assert.ok(typeof first.token === 'string' && first.token.length > 100, 'the grid ends in a browse continuation');
    const next = splitContents(continuationItems(fixture.continuation));
    assert.equal(next.items.length, 30);
    assert.ok(next.token && next.token !== first.token, 'the next page carries its own token');
    for (const item of [...first.items, ...next.items]) {
        assert.ok(itemDuration(item) > 0, `${itemVideoId(item)} has a length badge`);
        assert.match(itemVideoId(item), /^[\w-]{11}$/);
    }
    const chip = sortChipOf(fixture.grid);
    assert.deepEqual(chip, { index: 0, titles: ['Latest', 'Popular', 'Oldest'] });
});

test('the older videoRenderer shape still reads its length', () => {
    const item = { richItemRenderer: { content: { videoRenderer: { videoId: 'abcdefghijk', lengthText: { simpleText: '10:05' } } } } };
    assert.equal(itemDuration(item), 605);
    assert.equal(itemVideoId(item), 'abcdefghijk');
    const runs = { richItemRenderer: { content: { videoRenderer: { lengthText: { runs: [{ text: '1:' }, { text: '00' }] } } } } };
    assert.equal(itemDuration(runs), 60);
    assert.equal(itemDuration({}), -1);
});

test('longest first, videos with no length last, ties in the channel\'s order, input untouched', () => {
    const items = [video('a', '3:00'), video('b', 'LIVE'), video('c', '1:00:00'), video('d', '3:00'), video('e', '45:10')];
    const before = JSON.stringify(items);
    assert.deepEqual(sortByLength(items).map(itemVideoId), ['c', 'e', 'a', 'd', 'b']);
    assert.equal(JSON.stringify(items), before);
    assert.deepEqual(sortByLength(null), []);

    const captured = splitContents(fixture.grid.contents).items;
    const sorted = sortByLength(captured).map(itemDuration);
    assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a));
    assert.equal(sorted.length, captured.length);
});

test('a reload response is read as well as an append', () => {
    const reload = { onResponseReceivedEndpoints: [{ reloadContinuationItemsCommand: { continuationItems: [video('r', '1:00')] } }] };
    assert.deepEqual(continuationItems(reload).map(itemVideoId), ['r']);
    assert.deepEqual(continuationItems(null), []);
    assert.deepEqual(continuationItems({ onResponseReceivedActions: [{ somethingElse: {} }] }), []);
});

test('collection follows every token, drops repeats and reports progress', async () => {
    const firstToken = splitContents(fixture.grid.contents).token;
    const secondToken = splitContents(continuationItems(fixture.continuation)).token;
    const asked = [];
    const progress = [];
    const firstId = itemVideoId(fixture.grid.contents[0]);
    const result = await collectAllItems({
        contents: clone(fixture.grid.contents),
        fetchPage: async (token) => {
            asked.push(token);
            if (token === firstToken) return clone(fixture.continuation);
            // The last page: a repeat of the first video, a live stream, no token.
            return page([fixture.grid.contents[0], video('live1234567', 'LIVE')]);
        },
        onProgress: (count) => progress.push(count)
    });
    assert.deepEqual(asked, [firstToken, secondToken]);
    assert.equal(result.complete, true);
    assert.equal(result.items.length, 61, '30 + 30 + the live stream; the repeat is dropped');
    assert.equal(result.items.filter((item) => itemVideoId(item) === firstId).length, 1);
    assert.deepEqual(progress, [60, 61]);
    assert.equal(itemVideoId(sortByLength(result.items).at(-1)), 'live1234567');
});

test('a page that keeps failing ends the walk with what came before it', async () => {
    let calls = 0;
    const result = await collectAllItems({
        contents: [video('a', '1:00'), continuation('t1')],
        fetchPage: async () => { calls += 1; throw new Error('offline'); },
        retries: 2
    });
    assert.equal(calls, 3, 'one try and two retries');
    assert.deepEqual({ complete: result.complete, cancelled: result.cancelled, count: result.items.length },
        { complete: false, cancelled: false, count: 1 });

    let flaky = 0;
    const recovered = await collectAllItems({
        contents: [video('a', '1:00'), continuation('t1')],
        fetchPage: async () => { flaky += 1; if (flaky === 1) throw new Error('blip'); return page([video('b', '2:00')]); }
    });
    assert.equal(recovered.complete, true, 'one failure is retried');
    assert.equal(recovered.items.length, 2);
});

test('cancelling or hitting the page cap stops the walk', async () => {
    let cancel = false;
    let n = 0;
    const endless = async () => { n += 1; if (n === 2) cancel = true; return page([video('v' + n, '1:00'), continuation('t' + n)]); };
    const cancelled = await collectAllItems({ contents: [continuation('t0')], fetchPage: endless, isCancelled: () => cancel });
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.complete, false);
    assert.equal(n, 2);

    n = 0;
    const capped = await collectAllItems({ contents: [continuation('t0')], fetchPage: endless, maxPages: 3 });
    assert.equal(capped.complete, false);
    assert.equal(capped.items.length, 3);
    assert.equal(lengthSort.MAX_PAGES, 400);
});

test('only a channel\'s Videos and Live tabs are channel video pages', () => {
    for (const p of ['/@AyaKatz/videos', '/@AyaKatz/videos/', '/channel/UC123/videos', '/c/Name/streams', '/user/name/videos', '/@a.b-c/streams']) {
        assert.equal(isChannelVideosPath(p), true, p);
    }
    for (const p of ['/@AyaKatz', '/@AyaKatz/shorts', '/@AyaKatz/playlists', '/feed/subscriptions', '/watch', '/results', '', null]) {
        assert.equal(isChannelVideosPath(p), false, String(p));
    }
});

test('a header without a drop-down chip has no sort menu to add to', () => {
    const plain = clone(fixture.grid);
    plain.header.chipBarViewModel.chips[0].chipViewModel.displayType = 'CHIP_VIEW_MODEL_DISPLAY_TYPE_DEFAULT';
    assert.equal(sortChipOf(plain), null);
    assert.equal(sortChipOf({}), null);
    assert.equal(sortChipOf(null), null);
});

// ── the controller, on a fake DOM ────────────────────────────────────

class FakeElement {
    constructor(tag, { classes = [], attrs = {}, text = '' } = {}) {
        this.tagName = tag.toUpperCase();
        this.classList = new Set(classes);
        this.attrs = new Map(Object.entries(attrs));
        this.children = [];
        this.parentElement = null;
        this._text = text;
        this.visible = true;
    }
    set className(value) { this.classList = new Set(String(value).split(/\s+/).filter(Boolean)); }
    get firstElementChild() { return this.children[0] || null; }
    get isConnected() { let node = this; while (node.parentElement) node = node.parentElement; return node.tagName === 'HTML'; }
    get offsetParent() { let node = this; while (node) { if (!node.visible) return null; node = node.parentElement; } return this.isConnected ? {} : null; }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
    set textContent(value) { this.children.forEach((child) => { child.parentElement = null; }); this.children = []; this._text = String(value); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this); this.parentElement = null; }
    cloneNode(deep) {
        const copy = new FakeElement(this.tagName.toLowerCase(), { classes: [...this.classList], attrs: Object.fromEntries(this.attrs), text: this._text });
        if (deep) for (const child of this.children) copy.appendChild(child.cloneNode(true));
        return copy;
    }
    matchesCompound(compound) {
        const re = /^([a-z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i;
        const match = re.exec(compound);
        if (!match) throw new Error('fake DOM cannot read ' + compound);
        if (match[1] && match[1].toUpperCase() !== this.tagName) return false;
        for (const cls of (match[2] || '').split('.').filter(Boolean)) if (!this.classList.has(cls)) return false;
        for (const attr of (match[3] || '').match(/\[[^\]]+\]/g) || []) {
            const [, name, value] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(attr);
            if (!this.attrs.has(name) || (value !== undefined && this.attrs.get(name) !== value)) return false;
        }
        return true;
    }
    matches(selector) {
        return selector.split(',').some((part) => {
            const compounds = part.trim().split(/\s+/);
            if (!this.matchesCompound(compounds[compounds.length - 1])) return false;
            let node = this.parentElement;
            for (let i = compounds.length - 2; i >= 0; i -= 1) {
                while (node && !node.matchesCompound(compounds[i])) node = node.parentElement;
                if (!node) return false;
                node = node.parentElement;
            }
            return true;
        });
    }
    closest(selector) { let node = this; while (node) { if (node.matches(selector)) return node; node = node.parentElement; } return null; }
    querySelectorAll(selector) {
        const out = [];
        const walk = (node) => { for (const child of node.children) { if (child.matches(selector)) out.push(child); walk(child); } };
        walk(this);
        return out;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function el(tag, options, children = []) {
    const node = new FakeElement(tag, options);
    for (const child of children) node.appendChild(child);
    return node;
}

function sheetItem(title) {
    return el('yt-list-item-view-model', { classes: ['ytListItemViewModelHost'] }, [
        el('div', { classes: ['ytListItemViewModelLayoutWrapper'] }, [
            el('button', { classes: ['ytButtonOrAnchorHost'], attrs: { role: 'menuitem' } }, [
                el('span', { classes: ['ytListItemViewModelTitle'], attrs: { role: 'text' }, text: title })
            ])
        ])
    ]);
}

function buildPage() {
    const html = el('html');
    const body = el('body');
    html.appendChild(body);
    const chips = ['Latest', 'Members only', 'Public'].map((label) => el('chip-view-model', {}, [
        el('chip-shape', {}, [el('button', {}, [el('div', { classes: ['ytChipShapeText'], text: label })])])
    ]));
    const grid = el('ytd-rich-grid-renderer', {}, [el('chip-bar-view-model', {}, chips)]);
    grid.data = clone(fixture.grid);
    body.appendChild(el('ytd-browse', { attrs: { 'page-subtype': 'channels' } }, [grid]));
    const list = el('yt-list-view-model', {}, ['Latest', 'Popular', 'Oldest'].map(sheetItem));
    const dropdown = el('tp-yt-iron-dropdown', {}, [el('yt-sheet-view-model', {}, [list])]);
    dropdown.closed = false;
    dropdown.close = () => { dropdown.closed = true; };
    dropdown.refits = 0;
    dropdown.refit = () => { dropdown.refits += 1; };
    dropdown.visible = false;
    body.appendChild(dropdown);

    const listeners = [];
    const doc = {
        addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
        removeEventListener: (type, fn) => {
            const index = listeners.findIndex((entry) => entry.type === type && entry.fn === fn);
            if (index > -1) listeners.splice(index, 1);
        },
        querySelectorAll: (selector) => html.querySelectorAll(selector),
        createElement: (tag) => new FakeElement(tag),
        dispatchEvent: () => true
    };
    const click = (target) => {
        const event = { target, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
        for (const entry of listeners.filter((item) => item.type === 'click')) entry.fn(event);
        return event;
    };
    const win = { location: { pathname: '/@AyaKatz/videos' }, KeyboardEvent: class {} };
    return { html, grid, chips, list, dropdown, doc, win, click, listeners };
}

function bootController(pageFixture, fetchPage) {
    const statuses = [];
    const timers = [];
    const controller = createChannelLengthSort({
        document: pageFixture.doc,
        window: pageFixture.win,
        fetchPage,
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout: () => {},
        onStatus: (status) => statuses.push(status)
    });
    const runTimers = () => { while (timers.length) timers.shift()(); };
    return { controller, statuses, runTimers };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const chipText = (p) => p.chips[0].querySelector('.ytChipShapeText').textContent;
const menuTitles = (p) => p.list.children.map((item) => item.textContent);

test('opening the sort menu adds Length after the native choices, once', () => {
    const p = buildPage();
    const { controller, runTimers } = bootController(p, async () => page([]));
    controller.setLabel('Length');
    controller.setEnabled(true);

    p.click(p.chips[0].querySelector('.ytChipShapeText'));
    assert.deepEqual(menuTitles(p), ['Latest', 'Popular', 'Oldest'], 'nothing goes into a sheet that is not open');
    p.dropdown.visible = true;
    runTimers();
    assert.deepEqual(menuTitles(p), ['Latest', 'Popular', 'Oldest', 'Length']);
    const added = p.list.children[3];
    assert.equal(added.tagName, 'DIV', 'a plain host, never a cloned YouTube component');
    assert.ok(added.attrs.has(ITEM_ATTR));
    assert.ok(added.classList.has('ytListItemViewModelHost'), 'it wears the native item\'s classes');
    assert.equal(p.dropdown.refits, 1, 'the dropdown refits so the new item is not clipped');

    p.click(p.chips[0]);
    runTimers();
    assert.equal(p.list.querySelectorAll('[' + ITEM_ATTR + ']').length, 1, 'reopening does not add a second one');

    p.click(p.chips[1]);
    assert.equal(p.list.querySelectorAll('[' + ITEM_ATTR + ']').length, 1, 'other chips are not the sort menu');
});

test('picking Length loads every page, sorts longest first and drops the continuation', async () => {
    const p = buildPage();
    const firstToken = splitContents(fixture.grid.contents).token;
    const asked = [];
    const { controller, statuses, runTimers } = bootController(p, async (token) => {
        asked.push(token);
        return token === firstToken ? clone(fixture.continuation) : page([video('longest0001', '3:10:00')]);
    });
    controller.setLabel('Length');
    controller.setEnabled(true);
    p.dropdown.visible = true;
    p.click(p.chips[0]);
    runTimers();

    const event = p.click(p.list.children[3].querySelector('.ytListItemViewModelTitle'));
    assert.ok(event.defaultPrevented && event.stopped, 'YouTube never sees the click on our item');
    assert.equal(p.dropdown.closed, true, 'the menu closes');
    assert.match(chipText(p), /^Length · /, 'the chip shows progress while pages load');
    await flush();
    await flush();
    await flush();

    assert.equal(asked.length, 2);
    const contents = p.grid.data.contents;
    assert.equal(contents.length, 61);
    assert.ok(contents.every((item) => item.richItemRenderer), 'no continuation is left to page in');
    assert.equal(itemVideoId(contents[0]), 'longest0001');
    const lengths = contents.map(itemDuration);
    assert.deepEqual(lengths, [...lengths].sort((a, b) => b - a));
    assert.ok(p.grid.data.header, 'the header stays');
    assert.equal(chipText(p), 'Length');
    assert.equal(statuses.at(-1), 'sorted;videos=61');
});

test('a native choice puts the chip back, and a failed walk says it is partial', async () => {
    const p = buildPage();
    const { controller, statuses, runTimers } = bootController(p, async () => { throw new Error('offline'); });
    controller.setLabel('Länge');
    controller.setEnabled(true);
    p.dropdown.visible = true;
    p.click(p.chips[0]);
    runTimers();
    assert.equal(p.list.children[3].textContent, 'Länge', 'the label comes from the isolated world');

    p.click(p.list.children[3]);
    for (let i = 0; i < 6; i += 1) await flush();
    assert.equal(p.grid.data.contents.length, 30);
    assert.equal(chipText(p), 'Länge · 30+');
    assert.equal(statuses.at(-1), 'partial;videos=30');

    p.click(p.list.children[1].querySelector('.ytListItemViewModelTitle'));
    assert.equal(chipText(p), 'Latest', 'YouTube names its own chip after a native sort');
});

test('leaving the page mid-walk throws the result away', async () => {
    const p = buildPage();
    let release;
    const { controller, runTimers } = bootController(p, () => new Promise((resolve) => { release = resolve; }));
    controller.setEnabled(true);
    p.dropdown.visible = true;
    p.click(p.chips[0]);
    runTimers();
    p.click(p.list.children[3]);
    await flush();
    p.win.location.pathname = '/@SomeoneElse/videos';
    release(page([video('late0000001', '9:00:00')]));
    for (let i = 0; i < 4; i += 1) await flush();
    assert.equal(p.grid.data.contents.length, 31, 'the grid keeps what YouTube gave it');
});

test('off removes the item and the listeners, and a page that is not a channel tab gets nothing', () => {
    const p = buildPage();
    const { controller, statuses, runTimers } = bootController(p, async () => page([]));
    controller.setEnabled(true);
    p.dropdown.visible = true;
    p.click(p.chips[0]);
    runTimers();
    assert.equal(p.list.querySelectorAll('[' + ITEM_ATTR + ']').length, 1);

    controller.setEnabled(false);
    assert.equal(p.list.querySelectorAll('[' + ITEM_ATTR + ']').length, 0);
    assert.equal(p.listeners.length, 0);
    assert.equal(statuses.at(-1), 'off');

    const elsewhere = buildPage();
    elsewhere.win.location.pathname = '/feed/subscriptions';
    const other = bootController(elsewhere, async () => page([]));
    other.controller.setEnabled(true);
    elsewhere.dropdown.visible = true;
    elsewhere.click(elsewhere.chips[0]);
    other.runTimers();
    assert.equal(elsewhere.list.querySelectorAll('[' + ITEM_ATTR + ']').length, 0);
});

// ── the bridge, through ytkit-main.js ────────────────────────────────

function bootMainWorld() {
    const attributes = new Map();
    const observers = [];
    const fire = (name) => {
        const records = [{ type: 'attributes', attributeName: name }];
        observers.filter((observer) => observer.active).forEach((observer) => observer.callback(records));
    };
    const documentElement = {
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute: (name, value) => { attributes.set(name, String(value)); fire(name); },
        removeAttribute: (name) => { attributes.delete(name); fire(name); },
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
    };
    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
        observe() { this.active = true; }
        disconnect() { this.active = false; }
    }
    const documentListeners = [];
    const context = {
        console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
        Promise, Math, Date, queueMicrotask, atob: globalThis.atob,
        MutationObserver: FakeMutationObserver,
        fetch: async () => { throw new Error('no network in tests'); },
        document: {
            documentElement,
            addEventListener: (type, listener) => { documentListeners.push(type); },
            removeEventListener: (type) => { documentListeners.splice(documentListeners.indexOf(type), 1); },
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({ style: {}, setAttribute() {}, removeAttribute() {}, appendChild() {} }),
            head: { appendChild() {} },
            body: { appendChild() {} },
            readyState: 'complete'
        },
        location: { href: 'https://www.youtube.com/@AyaKatz/videos', pathname: '/@AyaKatz/videos' },
        performance: { now: () => 0 },
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    };
    context.addEventListener = () => {};
    context.removeEventListener = () => {};
    context.dispatchEvent = () => true;
    context.window = context;
    context.self = context;
    context.globalThis = context;
    context.YTKitCore = {};
    vm.createContext(context);
    const channel = installBridgeChannel(documentElement, context.YTKitCore);
    vm.runInContext(injectionGuardSource, context, { filename: 'extension/core/injection-guard.js' });
    vm.runInContext(coreSource, context, { filename: 'extension/core/channel-length-sort.js' });
    vm.runInContext(mainSource, context, { filename: 'extension/ytkit-main.js' });
    return { attributes, channel, documentElement, documentListeners };
}

test('ytkit-main.js turns the sort on only for a switch the isolated world sealed', () => {
    const world = bootMainWorld();
    assert.ok(!world.documentListeners.includes('click'));

    world.documentElement.setAttribute(ENABLE_ATTR, 'on');
    assert.ok(!world.documentListeners.includes('click'), 'a plain attribute write is what a page script can do, and it changes nothing');

    world.channel.publish(ENABLE_ATTR, 'on');
    assert.ok(world.documentListeners.includes('click'));
    assert.equal(world.attributes.get(STATUS_ATTR), 'on');

    world.channel.clear(ENABLE_ATTR);
    assert.ok(!world.documentListeners.includes('click'));
    assert.equal(world.attributes.get(STATUS_ATTR), 'off');
});

// ── the isolated-world half ──────────────────────────────────────────

test('the feature publishes the label and the switch, and clears both on destroy', () => {
    const calls = [];
    const feature = createChannelLengthSortFeature({
        publishBridgeAttribute: (name, value) => calls.push(['publish', name, value]),
        clearBridgeAttribute: (name) => calls.push(['clear', name]),
        t: (key, fallback) => (key === 'channelLengthSort_option' ? 'Durée' : fallback)
    });
    assert.equal(feature.id, 'channelLengthSort');
    assert.equal(feature.group, 'Home / Subscriptions');
    feature.init();
    assert.deepEqual(calls, [['publish', LABEL_ATTR, 'Durée'], ['publish', ENABLE_ATTR, 'on']]);
    feature.destroy();
    assert.deepEqual(calls.slice(2), [['clear', ENABLE_ATTR], ['clear', LABEL_ATTR]]);
});

// ── wiring ──────────────────────────────────────────────────────────

test('the setting is on by default and the manifest, ytkit.js, locales and userscript carry both halves', () => {
    const entry = schema.SETTINGS_SCHEMA.find((setting) => setting.key === 'channelLengthSort');
    assert.equal(entry.defaultValue, true);
    assert.equal(JSON.parse(read('extension/default-settings.json')).channelLengthSort, true);

    const manifest = JSON.parse(read('extension/manifest.json'));
    const mainEntry = manifest.content_scripts.find((item) => item.world === 'MAIN');
    assert.ok(mainEntry.js.indexOf('core/channel-length-sort.js') > -1);
    assert.ok(mainEntry.js.indexOf('core/channel-length-sort.js') < mainEntry.js.indexOf('ytkit-main.js'));

    const isolatedLists = [
        ...manifest.content_scripts.map((item) => item['x-ytkit-runtime-modules']).filter(Boolean),
        ...manifest.web_accessible_resources.map((item) => item.resources).filter((list) => list.includes('ytkit.js'))
    ];
    assert.equal(isolatedLists.length, 2);
    for (const list of isolatedLists) {
        assert.ok(list.indexOf('features/channel-length-sort/index.js') > -1);
        assert.ok(list.indexOf('features/channel-length-sort/index.js') < list.indexOf('ytkit.js'));
    }

    assert.match(mainSource, /\(function installChannelLengthSort\(\)/);
    const ytkitSource = read('extension/ytkit.js');
    assert.match(ytkitSource, /YTKitFeatures\?\.channelLengthSort\?\.createChannelLengthSortFeature\?\.\(/);
    assert.match(ytkitSource, /channelLengthSort: true,/);

    for (const locale of fs.readdirSync(path.join(repoRoot, 'extension', '_locales'))) {
        const messages = JSON.parse(read(`extension/_locales/${locale}/messages.json`));
        for (const key of ['feature_channelLengthSort_name', 'feature_channelLengthSort_desc', 'channelLengthSort_option']) {
            assert.ok(messages[key] && messages[key].message, `${locale} has ${key}`);
        }
    }

    const { modules } = readUserscriptBuild();
    assert.deepEqual(modules.mainWorld, mainEntry.js, 'the userscript page-world bundle follows the manifest');
    assert.ok(userscriptBundles('core/channel-length-sort.js'));
    assert.ok(userscriptBundles('features/channel-length-sort/index.js'));
});
