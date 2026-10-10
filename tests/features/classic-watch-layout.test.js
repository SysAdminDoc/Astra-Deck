'use strict';

// Classic Watch Layout: YouTube's 2026-10 side-panel watch page, undone.
// The page-world half (core/classic-watch-layout.js) is exercised in a vm
// with a fake ytcfg and a fake ytd-watch-flexy, then end to end through
// ytkit-main.js and the sealed bridge, and the isolated-world half through
// its feature factory.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installBridgeChannel } = require('../helpers/main-bridge');
const { readUserscriptBuild, userscriptBundles } = require('../helpers/source');

const repoRoot = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const coreSource = read('extension/core/classic-watch-layout.js');
const mainSource = read('extension/ytkit-main.js');
const injectionGuardSource = read('extension/core/injection-guard.js');
const {
    DEFAULT_FLAGS,
    LAYOUT_ATTRIBUTES,
    parseFlagOverrides,
    resolveFlags,
    isSidePanelLayout
} = require('../../extension/core/classic-watch-layout.js');
const {
    createClassicWatchLayoutFeatures,
    buildClassicWatchLayoutCss,
    ENABLE_ATTR,
    FLAGS_ATTR
} = require('../../extension/features/classic-watch-layout/index.js');
const schema = require('../../extension/core/settings-schema.js');

// ── fixtures ─────────────────────────────────────────────────────────

function sidePanelFlags() {
    const flags = { some_unrelated_flag: true, numeric_flag: 3 };
    for (const flag of DEFAULT_FLAGS) flags[flag] = true;
    return flags;
}

// YouTube's own ytcfg shape: data lives in ytcfg.data_ (or yt.config_),
// set() merges keys into it and replaces EXPERIMENT_FLAGS wholesale.
function createYtcfg(initialFlags) {
    const ytcfg = {
        data_: { EXPERIMENT_FLAGS: initialFlags },
        d() { return ytcfg.data_; },
        get(key, fallback) { return key in ytcfg.d() ? ytcfg.d()[key] : fallback; },
        set(...args) {
            if (args.length > 1) ytcfg.d()[args[0]] = args[1];
            else for (const key of Object.keys(args[0])) ytcfg.d()[key] = args[0][key];
        }
    };
    return ytcfg;
}

function createElement(tagName, { id = '', attributes = {} } = {}) {
    const attrs = new Map(Object.entries(attributes));
    const element = {
        tagName: tagName.toUpperCase(),
        id,
        children: [],
        parent: null,
        getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
        setAttribute: (name, value) => { attrs.set(name, String(value)); },
        removeAttribute: (name) => { attrs.delete(name); },
        hasAttribute: (name) => attrs.has(name),
        appendChild(child) {
            if (child.parent) child.parent.children = child.parent.children.filter((node) => node !== child);
            child.parent = element;
            element.children.push(child);
            return child;
        },
        contains(node) {
            for (let current = node; current; current = current.parent) if (current === element) return true;
            return false;
        },
        querySelector(selector) {
            return element.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const out = [];
            const walk = (node) => {
                for (const child of node.children) {
                    if (matches(child, selector)) out.push(child);
                    walk(child);
                }
            };
            walk(element);
            return out;
        }
    };
    return element;
}

// Just enough selector matching for the selectors the module uses.
function matches(element, selector) {
    return selector.split(',').some((part) => {
        const simple = part.trim().split(/\s+/).pop();
        const tag = simple.match(/^[a-z-]+/)?.[0];
        const id = simple.match(/#([\w-]+)/)?.[1];
        const attr = simple.match(/\[([\w-]+)="([^"]+)"\]/);
        if (tag && element.tagName.toLowerCase() !== tag) return false;
        if (id && element.id !== id) return false;
        if (attr && element.getAttribute(attr[1]) !== attr[2]) return false;
        return Boolean(tag || id);
    });
}

function createWatchPage({ sidePanel = true, twoColumns = true, descriptionBuilt = true } = {}) {
    const html = createElement('html');
    const flexy = createElement('ytd-watch-flexy', {
        attributes: sidePanel
            ? Object.fromEntries(LAYOUT_ATTRIBUTES.map((name) => [name, '']))
            : {}
    });
    const primary = createElement('div', { id: 'primary' });
    const secondary = createElement('div', { id: 'secondary' });
    const secondaryInner = createElement('div', { id: 'secondary-inner' });
    const below = createElement('div', { id: 'below' });
    const related = createElement('div', { id: 'related' });
    // The capture: on the side-panel page the description under the title is
    // switched off with hide-description, because the panel carries it.
    const metadata = createElement('ytd-watch-metadata', {
        attributes: sidePanel ? { 'hide-description': '' } : {}
    });
    // The description under the title, as YouTube builds it.
    const inlineDescription = createElement('ytd-text-inline-expander', { id: 'description-inline-expander' });
    if (descriptionBuilt) metadata.appendChild(inlineDescription);
    const comments = createElement('ytd-comments', { id: 'comments' });
    const commentsPanel = createElement('ytd-engagement-panel-section-list-renderer', {
        attributes: { 'target-id': 'engagement-panel-comments-section', visibility: 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' }
    });
    const descriptionPanel = createElement('ytd-engagement-panel-section-list-renderer', {
        attributes: { 'target-id': 'engagement-panel-structured-description', visibility: 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' }
    });
    const otherPanel = createElement('ytd-engagement-panel-section-list-renderer', {
        attributes: { 'target-id': 'engagement-panel-searchable-transcript', visibility: 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' }
    });
    html.appendChild(flexy);
    flexy.appendChild(primary);
    flexy.appendChild(secondary);
    secondary.appendChild(secondaryInner);
    primary.appendChild(metadata);
    primary.appendChild(below);
    // The side-panel page renders the grid under the player.
    below.appendChild(related);
    below.appendChild(comments);
    flexy.appendChild(commentsPanel);
    flexy.appendChild(descriptionPanel);
    flexy.appendChild(otherPanel);

    metadata.hideDescription = sidePanel;
    comments.hidden = sidePanel;
    comments.data = { contents: [] };
    flexy.isTwoColumns_ = twoColumns;
    flexy.splitScroll = sidePanel;
    flexy.sideRailDismissiblePanels = sidePanel;
    flexy.fixedPanelWatchNext = sidePanel;
    flexy.fixedDefaultPanels = sidePanel;
    flexy.fixedSideMenu = sidePanel ? { buttons: [] } : null;
    flexy.calls = [];
    flexy._setProperty = (name, value) => { flexy.calls.push(['_setProperty', name, value]); flexy[name] = value; };
    flexy.setPlayerTheaterMode_ = () => { flexy.calls.push(['setPlayerTheaterMode_']); };
    flexy.updateWatchFeedLocation = (twoColumnsArg) => { flexy.calls.push(['updateWatchFeedLocation', twoColumnsArg]); };

    const listeners = new Map();
    const documentRef = {
        documentElement: html,
        querySelector: (selector) => html.querySelector(selector),
        querySelectorAll: (selector) => html.querySelectorAll(selector),
        addEventListener: (type, fn) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
        dispatch: (type) => { for (const fn of [...(listeners.get(type) || [])]) fn({ type }); },
        listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    };
    return { documentRef, flexy, related, secondaryInner, metadata, inlineDescription, comments, commentsPanel, descriptionPanel, otherPanel };
}

function loadCore(context) {
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'extension/core/classic-watch-layout.js' });
    return context.YTKitCore.createClassicWatchLayout;
}

function createLayout({ ytcfg, ytConfig, page } = {}) {
    const timers = [];
    const resizes = [];
    const context = {
        YTKitCore: {},
        ytcfg,
        yt: ytConfig ? { config_: ytConfig } : undefined,
        dispatchEvent: (event) => { resizes.push(event.type); return true; }
    };
    context.globalThis = context;
    const factory = loadCore(context);
    const statuses = [];
    const layout = factory({
        root: context,
        document: page?.documentRef || null,
        setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
        requestAnimationFrame: (fn) => fn(),
        MutationObserver: null,
        Event: class { constructor(type) { this.type = type; } },
        onStatus: (state) => statuses.push(state)
    });
    return {
        layout,
        context,
        statuses,
        resizes,
        flushTimers() {
            while (timers.length) timers.shift().fn();
        }
    };
}

// ── the flag list ────────────────────────────────────────────────────

test('the built-in flag list names every flag the 2026-10 side-panel page is known to use', () => {
    assert.deepEqual([...DEFAULT_FLAGS], [
        'web_watch_eligible_to_switch_to_grid',
        'web_watch_enable_single_column_grid_view',
        'web_fixed_panel_watch_next',
        'web_fixed_panel_watch_next_grid_swap',
        'web_live_chat_panel_watch_next_grid_swap',
        'web_watch_fixed_default_panels',
        'web_engagement_panel_show_description',
        'web_watch_move_summary_to_sd',
        'web_watch_hero_list',
        'web_watch_split_scroll',
        'swatcheroo_split_scroll',
        'enable_web_side_rail',
        'web_side_rail_dismissible_panels',
        'web_side_rail_default_dismissed_panels',
        'web_side_rail_with_border',
        'kevlar_watch_hide_comments_while_panel_open',
        'kevlar_watch_cinematics',
        'disable_theater_mode'
    ]);
    assert.ok(Object.isFrozen(DEFAULT_FLAGS));
});

test('a user-added flag joins the list, a minus line drops a built-in one, junk is ignored', () => {
    assert.deepEqual(resolveFlags(''), [...DEFAULT_FLAGS]);
    assert.deepEqual(resolveFlags(undefined), [...DEFAULT_FLAGS]);

    const resolved = resolveFlags('web_watch_new_thing\n-kevlar_watch_cinematics, another_flag\nweb_watch_new_thing');
    assert.ok(resolved.includes('web_watch_new_thing'));
    assert.ok(resolved.includes('another_flag'));
    assert.ok(!resolved.includes('kevlar_watch_cinematics'), 'a minus line leaves that flag alone');
    assert.equal(resolved.filter((flag) => flag === 'web_watch_new_thing').length, 1, 'duplicates collapse');

    const parsed = parseFlagOverrides('ok_flag 1starts_with_digit has-dash <script> -also_ok');
    assert.deepEqual(parsed.add, ['ok_flag']);
    assert.deepEqual(parsed.remove, ['also_ok']);

    const many = Array.from({ length: 100 }, (_, index) => `extra_flag_${index}`).join('\n');
    assert.equal(parseFlagOverrides(many).add.length, 64, 'extra flags are capped');
});

test('the settings schema ships the switch off and the extra-flag field empty, and accepts a user flag line', () => {
    const byKey = new Map(schema.SETTINGS_SCHEMA.map((entry) => [entry.key, entry]));
    const toggle = byKey.get('restoreClassicWatchLayout');
    const field = byKey.get('watchLayoutFlagOverrides');
    assert.equal(toggle.type, 'boolean');
    assert.equal(toggle.defaultValue, false);
    assert.equal(field.type, 'string');
    assert.equal(field.defaultValue, '');
    const pattern = new RegExp(field.pattern);
    assert.ok(pattern.test('web_watch_new_thing\n-kevlar_watch_cinematics, another_flag'));
    assert.ok(!pattern.test('<img src=x>'), 'markup is rejected before it reaches the page world');
    const defaults = JSON.parse(read('extension/default-settings.json'));
    assert.equal(defaults.restoreClassicWatchLayout, false);
    assert.equal(defaults.watchLayoutFlagOverrides, '');
});

// ── the page-world half ──────────────────────────────────────────────

test('with the switch on, every listed flag reads false in ytcfg and yt.config_', () => {
    const ytcfg = createYtcfg(sidePanelFlags());
    const ytConfig = { EXPERIMENT_FLAGS: sidePanelFlags() };
    const { layout, statuses } = createLayout({ ytcfg, ytConfig });

    layout.setEnabled(true, '');

    for (const flag of DEFAULT_FLAGS) {
        assert.equal(ytcfg.get('EXPERIMENT_FLAGS')[flag], false, `${flag} in ytcfg`);
        assert.equal(ytConfig.EXPERIMENT_FLAGS[flag], false, `${flag} in yt.config_`);
    }
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').some_unrelated_flag, true, 'flags off the list are untouched');
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').numeric_flag, 3);
    assert.deepEqual(statuses, ['waiting'], 'no watch page yet');
});

test('a later ytcfg.set that brings the flags back is overridden before anything reads them', () => {
    const ytcfg = createYtcfg({});
    const { layout } = createLayout({ ytcfg });
    layout.setEnabled(true, 'my_extra_flag');

    // The page replaces EXPERIMENT_FLAGS wholesale, the way a late config
    // chunk does. The very next read must already see the override.
    ytcfg.set({ EXPERIMENT_FLAGS: { ...sidePanelFlags(), my_extra_flag: true } });
    const flags = ytcfg.get('EXPERIMENT_FLAGS');
    for (const flag of DEFAULT_FLAGS) assert.equal(flags[flag], false, flag);
    assert.equal(flags.my_extra_flag, false, 'the user-added flag is turned off too');
    assert.equal(flags.some_unrelated_flag, true);

    ytcfg.set('EXPERIMENT_FLAGS', { web_watch_split_scroll: true });
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').web_watch_split_scroll, false, 'the two-argument form too');
});

test('with the switch off nothing is touched: no wrapper, no flag change, no listener', () => {
    const ytcfg = createYtcfg(sidePanelFlags());
    const originalSet = ytcfg.set;
    const page = createWatchPage();
    const { layout, statuses } = createLayout({ ytcfg, page });

    layout.setEnabled(false, 'my_extra_flag');
    page.documentRef.dispatch('yt-navigate-finish');

    assert.equal(ytcfg.set, originalSet, 'ytcfg.set is the page\'s own function');
    for (const flag of DEFAULT_FLAGS) assert.equal(ytcfg.get('EXPERIMENT_FLAGS')[flag], true, flag);
    assert.equal(page.documentRef.listenerCount(), 0);
    assert.equal(page.flexy.splitScroll, true);
    assert.equal(page.flexy.hasAttribute('split-scroll'), true);
    assert.deepEqual(statuses, []);
});

test('turning it off hands back the values YouTube set, and a narrowed list releases a dropped flag', () => {
    const ytcfg = createYtcfg(sidePanelFlags());
    const page = createWatchPage({ sidePanel: false });
    const { layout, statuses } = createLayout({ ytcfg, page });

    layout.setEnabled(true, '');
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').kevlar_watch_cinematics, false);

    layout.setEnabled(true, '-kevlar_watch_cinematics');
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').kevlar_watch_cinematics, true, 'excluded later, handed back at once');
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').web_watch_split_scroll, false);

    layout.setEnabled(false, '');
    for (const flag of DEFAULT_FLAGS) assert.equal(ytcfg.get('EXPERIMENT_FLAGS')[flag], true, flag);
    assert.equal(page.documentRef.listenerCount(), 0, 'navigation listeners come off');
    assert.deepEqual(statuses, ['waiting', 'off']);
});

test('a navigation on the side-panel page puts the classic layout back', () => {
    const ytcfg = createYtcfg(sidePanelFlags());
    const page = createWatchPage({ sidePanel: true, twoColumns: true });
    const ctx = createLayout({ ytcfg, page });
    ctx.layout.setEnabled(true, '');
    // setEnabled already ran once against the live page. Put the element
    // back in the side-panel state YouTube re-applies on the next navigation.
    page.flexy.splitScroll = true;
    page.flexy.sideRailDismissiblePanels = true;
    page.flexy.setAttribute('split-scroll', '');
    page.comments.hidden = true;
    page.documentRef.dispatch('yt-navigate-finish');

    const { flexy } = page;
    assert.equal(flexy.isTwoColumns_, true);
    assert.equal(flexy.splitScroll, false);
    assert.equal(flexy.sideRailDismissiblePanels, false);
    assert.equal(flexy.fixedPanelWatchNext, false);
    assert.equal(flexy.fixedDefaultPanels, false);
    assert.equal(flexy.fixedSideMenu, null);
    for (const attribute of LAYOUT_ATTRIBUTES) assert.equal(flexy.hasAttribute(attribute), false, attribute);
    assert.ok(flexy.calls.some(([name, key, value]) => name === '_setProperty' && key === 'splitScroll' && value === false));
    assert.ok(flexy.calls.some(([name]) => name === 'setPlayerTheaterMode_'), 'the theater button is re-checked');
    assert.ok(flexy.calls.some(([name, arg]) => name === 'updateWatchFeedLocation' && arg === true));
    assert.ok(page.secondaryInner.contains(page.related), 'recommendations are back in the right-hand column');
    assert.equal(page.comments.hidden, false, 'comments are back under the video');
    assert.equal(page.metadata.hasAttribute('hide-description'), false, 'the description is back under the title');
    assert.equal(page.metadata.hideDescription, false);
    assert.equal(page.commentsPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    assert.equal(page.descriptionPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    assert.equal(page.otherPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED',
        'a transcript panel the user opened stays open');
    assert.deepEqual(ctx.statuses, ['applied']);

    ctx.flushTimers();
    assert.ok(ctx.resizes.includes('resize'), 'a resize nudges the player out of the side-panel width');
});

test('on a hard load each side panel stays open until its section under the video is showing', () => {
    const page = createWatchPage({ sidePanel: true });
    // The switch arrives at document_idle: comments have not loaded yet.
    page.comments.data = null;
    const ctx = createLayout({ ytcfg: createYtcfg({}), page });
    ctx.layout.setEnabled(true, '');

    assert.equal(page.metadata.hasAttribute('hide-description'), false);
    assert.equal(page.descriptionPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN',
        'the description is under the title, so its panel goes');
    assert.equal(page.comments.hidden, true);
    assert.equal(page.commentsPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED',
        'no comments under the video yet, so the panel keeps them on screen');

    // ytd-comments.data is a property, so no observer sees it land. The
    // re-check schedule does, with no navigation and no run() from outside.
    page.comments.data = { contents: [] };
    ctx.flushTimers();
    assert.equal(page.comments.hidden, false);
    assert.equal(page.commentsPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');

    // Closed once. A comments panel the user opens afterwards stays open.
    page.commentsPanel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    page.documentRef.dispatch('yt-navigate-finish');
    ctx.flushTimers();
    assert.equal(page.commentsPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');

    // YouTube putting hide-description back is undone on the next pass.
    page.metadata.setAttribute('hide-description', '');
    ctx.layout.run();
    assert.equal(page.metadata.hasAttribute('hide-description'), false);
});

test('the description panel stays open until YouTube has built the description under the title', () => {
    const page = createWatchPage({ sidePanel: true, descriptionBuilt: false });
    const ctx = createLayout({ ytcfg: createYtcfg({}), page });
    ctx.layout.setEnabled(true, '');
    assert.equal(page.metadata.hasAttribute('hide-description'), false, 'un-hidden at once');
    assert.equal(page.descriptionPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED',
        'un-hiding is not enough: nothing is under the title yet, so the panel keeps the description');
    assert.equal(page.commentsPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');

    page.metadata.appendChild(page.inlineDescription);
    ctx.flushTimers();
    assert.equal(page.descriptionPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN',
        'once it is built, the re-check closes the panel');
});

test('a description that never arrives leaves its panel open and the re-checks stop', () => {
    const page = createWatchPage({ sidePanel: true, descriptionBuilt: false });
    const ctx = createLayout({ ytcfg: createYtcfg({}), page });
    ctx.layout.setEnabled(true, '');
    ctx.flushTimers();
    assert.equal(page.descriptionPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    // The schedule is bounded: flushTimers drained it, and a description
    // built after it ran out is left for the next navigation to settle.
    page.metadata.appendChild(page.inlineDescription);
    ctx.flushTimers();
    assert.equal(page.descriptionPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    ctx.layout.run();
    assert.equal(page.descriptionPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN',
        'the next pass still closes it');
});

test('a flag line naming an inherited method never lands on the flag store', () => {
    const flags = sidePanelFlags();
    const ytcfg = createYtcfg(flags);
    const { layout } = createLayout({ ytcfg });
    layout.setEnabled(true, 'hasOwnProperty\ntoString\nvalueOf\nconstructor');
    for (const name of ['hasOwnProperty', 'toString', 'valueOf', 'constructor']) {
        assert.equal(Object.prototype.hasOwnProperty.call(flags, name), false, name);
    }
    assert.equal(flags.hasOwnProperty('web_watch_split_scroll'), true, 'the store still answers the page');
    layout.setEnabled(false, '');
    assert.deepEqual(Object.keys(flags).sort(), Object.keys(sidePanelFlags()).sort(), 'nothing left behind');
});

test('the same switch and list again does nothing, so an unrelated bridge change cannot close panels', () => {
    const page = createWatchPage({ sidePanel: true });
    const ctx = createLayout({ ytcfg: createYtcfg(sidePanelFlags()), page });
    ctx.layout.setEnabled(true, '');
    const callsAfterFirst = page.flexy.calls.length;

    page.flexy.splitScroll = true;
    page.commentsPanel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    ctx.layout.setEnabled(true, '');
    assert.equal(page.flexy.calls.length, callsAfterFirst);
    assert.equal(page.commentsPanel.getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');

    ctx.layout.setEnabled(true, 'web_watch_new_thing');
    assert.ok(page.flexy.calls.length > callsAfterFirst, 'a changed list applies at once');
});

test('the classic page is left alone, and a narrow window keeps the grid where YouTube put it', () => {
    const classic = createWatchPage({ sidePanel: false });
    const ctx = createLayout({ ytcfg: createYtcfg({}), page: classic });
    ctx.layout.setEnabled(true, '');
    assert.deepEqual(classic.flexy.calls, [], 'no element call on a page already in the classic layout');
    assert.equal(isSidePanelLayout(classic.flexy), false);
    assert.deepEqual(ctx.statuses, ['waiting']);

    const narrow = createWatchPage({ sidePanel: true, twoColumns: false });
    const narrowCtx = createLayout({ ytcfg: createYtcfg({}), page: narrow });
    narrowCtx.layout.setEnabled(true, '');
    assert.equal(narrow.flexy.splitScroll, false);
    assert.equal(narrow.secondaryInner.contains(narrow.related), false,
        'one column: the related list stays under the video');
});

// ── end to end through ytkit-main.js and the sealed bridge ──────────

function bootMainWorld({ ytcfg }) {
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
    const context = {
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {},
        Promise,
        Math,
        Date,
        queueMicrotask,
        MutationObserver: FakeMutationObserver,
        ytcfg,
        document: {
            documentElement,
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({ style: {}, setAttribute() {}, removeAttribute() {}, appendChild() {} }),
            head: { appendChild() {} },
            body: { appendChild() {} },
            readyState: 'complete'
        },
        location: { href: 'https://www.youtube.com/watch?v=classic-layout', pathname: '/watch' },
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
    vm.runInContext(coreSource, context, { filename: 'extension/core/classic-watch-layout.js' });
    vm.runInContext(mainSource, context, { filename: 'extension/ytkit-main.js' });
    return { attributes, channel, documentElement };
}

test('ytkit-main.js applies the override only for a switch the isolated world sealed', () => {
    const ytcfg = createYtcfg(sidePanelFlags());
    const world = bootMainWorld({ ytcfg });

    world.documentElement.setAttribute(ENABLE_ATTR, 'on');
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').web_watch_split_scroll, true,
        'a plain attribute write is what a page script can do, and it changes nothing');

    world.channel.publish(FLAGS_ATTR, 'my_extra_flag');
    world.channel.publish(ENABLE_ATTR, 'on');
    ytcfg.set({ EXPERIMENT_FLAGS: { ...sidePanelFlags(), my_extra_flag: true } });
    for (const flag of [...DEFAULT_FLAGS, 'my_extra_flag']) {
        assert.equal(ytcfg.get('EXPERIMENT_FLAGS')[flag], false, flag);
    }
    assert.equal(world.attributes.get('data-ytkit-classic-watch-layout-status'), 'waiting');

    world.channel.clear(ENABLE_ATTR);
    assert.equal(ytcfg.get('EXPERIMENT_FLAGS').web_watch_split_scroll, true, 'off hands the page its values back');
    assert.equal(world.attributes.get('data-ytkit-classic-watch-layout-status'), 'off');
});

// ── the isolated-world half ──────────────────────────────────────────

test('the feature publishes the list, then the switch, hides the side menu, and clears it all on destroy', () => {
    const calls = [];
    const listeners = new Map();
    const styles = [];
    const settings = { watchLayoutFlagOverrides: '  web_watch_new_thing  ' };
    const [feature, flagsFeature] = createClassicWatchLayoutFeatures({
        documentRef: {
            addEventListener: (type, fn) => listeners.set(type, fn),
            removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); }
        },
        injectStyle: (css, id, raw) => {
            const style = { css, id, raw, removed: false, remove() { this.removed = true; } };
            styles.push(style);
            return style;
        },
        publishBridgeAttribute: (name, value) => calls.push(['publish', name, value]),
        clearBridgeAttribute: (name) => calls.push(['clear', name]),
        readSetting: (key) => settings[key]
    });

    assert.equal(feature.id, 'restoreClassicWatchLayout');
    assert.equal(flagsFeature.id, 'watchLayoutFlagOverrides');
    assert.equal(flagsFeature.type, 'textarea');
    assert.equal(flagsFeature.parentId, 'restoreClassicWatchLayout');
    assert.equal(flagsFeature.settingKey, 'watchLayoutFlagOverrides');

    feature.init();
    assert.deepEqual(calls, [
        ['publish', FLAGS_ATTR, 'web_watch_new_thing'],
        ['publish', ENABLE_ATTR, 'on']
    ]);
    assert.equal(styles.length, 1);
    assert.match(styles[0].css, /ytd-watch-flexy #fixed-side-menu \{ display: none !important; \}/);
    assert.match(styles[0].css, /--ytd-watch-flexy-fixed-side-menu-width: 0px !important/);
    assert.equal(styles[0].css, buildClassicWatchLayoutCss());

    calls.length = 0;
    settings.watchLayoutFlagOverrides = '';
    listeners.get('ytkit-settings-changed')({ detail: { keys: ['watchLayoutFlagOverrides'] } });
    assert.deepEqual(calls, [['clear', FLAGS_ATTR]], 'an emptied field clears the list');
    calls.length = 0;
    listeners.get('ytkit-settings-changed')({ detail: { keys: ['someOtherSetting'] } });
    assert.deepEqual(calls, [], 'unrelated settings do not republish');

    feature.destroy();
    assert.deepEqual(calls, [['clear', ENABLE_ATTR], ['clear', FLAGS_ATTR]]);
    assert.equal(styles[0].removed, true);
    assert.equal(listeners.has('ytkit-settings-changed'), false);
});

// ── wiring ──────────────────────────────────────────────────────────

test('the manifest, ytkit.js and the userscript all carry both halves', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));
    const mainEntry = manifest.content_scripts.find((entry) => entry.world === 'MAIN');
    assert.ok(mainEntry.js.indexOf('core/classic-watch-layout.js') > -1);
    assert.ok(mainEntry.js.indexOf('core/classic-watch-layout.js') < mainEntry.js.indexOf('ytkit-main.js'),
        'the page-world rules load before the bridge that drives them');

    // The isolated runtime is loaded by runtime-bootstrap.js from the
    // x-ytkit-runtime-modules list, and each module must be web-accessible.
    const isolatedLists = [
        ...manifest.content_scripts.map((entry) => entry['x-ytkit-runtime-modules']).filter(Boolean),
        ...manifest.web_accessible_resources.map((entry) => entry.resources).filter((list) => list.includes('ytkit.js'))
    ];
    assert.equal(isolatedLists.length, 2);
    for (const list of isolatedLists) {
        assert.ok(list.indexOf('features/classic-watch-layout/index.js') > -1);
        assert.ok(list.indexOf('features/classic-watch-layout/index.js') < list.indexOf('ytkit.js'));
    }

    assert.match(mainSource, /data-ytkit-classic-watch-layout'/);
    assert.match(mainSource, /data-ytkit-classic-watch-layout-flags'/);
    const ytkitSource = read('extension/ytkit.js');
    assert.match(ytkitSource, /YTKitFeatures\?\.classicWatchLayout\?\.createClassicWatchLayoutFeatures\?\.\(/);
    assert.match(ytkitSource, /restoreClassicWatchLayout: false,/);
    assert.match(ytkitSource, /watchLayoutFlagOverrides: '',/);

    const { modules } = readUserscriptBuild();
    assert.deepEqual(modules.mainWorld, mainEntry.js, 'the userscript page-world bundle follows the manifest');
    assert.ok(userscriptBundles('core/classic-watch-layout.js'), 'the userscript ships the page-world rules');
    assert.ok(userscriptBundles('features/classic-watch-layout/index.js'), 'the userscript ships the feature');
});
