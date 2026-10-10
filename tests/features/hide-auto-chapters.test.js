'use strict';

// Hide AI Chapters: YouTube's auto-generated chapters, taken out of the
// watch response while creator chapters and the heatmap stay.
//
// The fixture is three live watch pages (2026-10-10): two with the AI
// chapters panel, one of them beside other player-bar markers, and one with
// only chapters the creator wrote. The page-world half is exercised directly,
// then through ytkit-main.js and the sealed bridge; the isolated half through
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
const coreSource = read('extension/core/auto-chapters.js');
const mainSource = read('extension/ytkit-main.js');
const injectionGuardSource = read('extension/core/injection-guard.js');
const {
    removeAutoChapters,
    findWatchResponse,
    isAutoChapterKey,
    targetsAutoChapterPanel,
    PANEL_ID
} = require('../../extension/core/auto-chapters.js');
const { parseHeatmapMarkers } = require('../../extension/core/heatmap.js');
const {
    createHideAutoChaptersFeature,
    buildHideAutoChaptersCss,
    ENABLE_ATTR
} = require('../../extension/features/hide-auto-chapters/index.js');
const schema = require('../../extension/core/settings-schema.js');

const STATUS_ATTR = 'data-ytkit-hide-auto-chapters-status';
const fixture = JSON.parse(read('tests/fixtures/watch-auto-chapters-2026-10.json'));
const capture = (name) => JSON.parse(JSON.stringify(fixture.captures[name]));

// Independent of the shipped decoder on purpose: the leftovers check must not
// share a bug with the code it checks.
function keyNamesAutoChapters(key) {
    try {
        const base64 = decodeURIComponent(key).replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(base64, 'base64').toString('latin1').includes('AUTO_CHAPTERS');
    } catch (error) {
        return false;
    }
}

/** Every path in a response that still points at YouTube's AI chapters. */
function autoChapterLeftovers(value, trail = '$', keyName = '', out = []) {
    if (typeof value === 'string') {
        if (value === PANEL_ID || value === 'AUTO_CHAPTERS') out.push(trail);
        else if (/^(entityKey|entityKeys|visibleOnLoadKeys)$/.test(keyName) && keyNamesAutoChapters(value)) out.push(trail);
        return out;
    }
    if (!value || typeof value !== 'object') return out;
    if (Array.isArray(value)) value.forEach((entry, index) => autoChapterLeftovers(entry, `${trail}[${index}]`, keyName, out));
    else for (const [key, entry] of Object.entries(value)) autoChapterLeftovers(entry, `${trail}.${key}`, key, out);
    return out;
}

const playerBar = (response) => response.playerOverlays?.playerOverlayRenderer?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer;
const markerKeys = (response) => (playerBar(response)?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap || []).map((entry) => entry.key);
const panelIds = (response) => response.engagementPanels.map((panel) => panel.engagementPanelSectionListRenderer?.panelIdentifier
    || panel.engagementPanelSectionListRenderer?.targetId);

// ── the decision half, against the live captures ─────────────────────

test('the captures are what the fixture says they are', () => {
    for (const name of ['autoOnly', 'autoBesideOtherMarkers']) {
        const response = capture(name);
        assert.ok(autoChapterLeftovers(response).length > 5, `${name} carries AI chapters`);
        assert.ok(panelIds(response).includes(PANEL_ID), `${name} has the AI chapters panel`);
        assert.ok(markerKeys(response).includes('AUTO_CHAPTERS'));
    }
    const creator = capture('creatorOnly');
    assert.deepEqual(autoChapterLeftovers(creator), []);
    assert.ok(markerKeys(creator).includes('DESCRIPTION_CHAPTERS'));
    assert.ok(panelIds(creator).includes('engagement-panel-macro-markers-description-chapters'));
});

test('a page with only AI chapters comes out with no marker, panel, chip, card or entity key left', () => {
    const response = capture('autoOnly');
    const panelsBefore = panelIds(response).length;
    const report = removeAutoChapters(response);

    assert.deepEqual(autoChapterLeftovers(response), []);
    assert.equal(report.changed, true);
    assert.equal(report.panels, 1);
    assert.equal(report.chips, 1, 'the chip that switches the description panel to AI chapters');
    assert.equal(report.cards, 1, 'the chapters card in the description');
    assert.equal(report.entityKeys, 1, 'the loadMarkersCommand key');
    assert.equal(report.playerBar, true, 'nothing else was on the bar, so the decorated bar goes');
    assert.equal(response.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer, undefined);
    assert.equal(panelIds(response).length, panelsBefore - 1, 'every other panel stays');
});

test('beside other markers, only the AI chapters and their button go', () => {
    const response = capture('autoBesideOtherMarkers');
    const report = removeAutoChapters(response);

    assert.deepEqual(autoChapterLeftovers(response), []);
    assert.equal(report.actionButton, true);
    assert.equal(report.playerBar, false);
    assert.deepEqual(markerKeys(response), ['ANIMATION_ANNOTATION_MARKERS'], 'the other markers stay on the bar');
    assert.equal(playerBar(response).playerBarActionButton, undefined, 'no "View Chapters" button for chapters that are gone');
});

test('a page with only creator chapters is returned exactly as it came', () => {
    const response = capture('creatorOnly');
    const before = JSON.stringify(response);
    const report = removeAutoChapters(response);
    assert.equal(report.changed, false);
    assert.equal(JSON.stringify(response), before);
});

test('the heatmap reads the same before and after the filter', () => {
    for (const name of Object.keys(fixture.captures)) {
        const response = capture(name);
        const before = parseHeatmapMarkers(response);
        assert.ok(before.length >= 4, `${name} has a heatmap`);
        removeAutoChapters(response);
        assert.deepEqual(parseHeatmapMarkers(response), before, name);
    }
});

test('get_watch answers in an array, and the response inside it is cleaned', () => {
    const response = capture('autoOnly');
    const batch = [{ response }, { playerResponse: {} }];
    assert.equal(findWatchResponse(batch), response);
    assert.equal(removeAutoChapters(batch).changed, true);
    assert.deepEqual(autoChapterLeftovers(batch), []);
});

test('anything that is not a watch response passes through', () => {
    for (const value of [null, undefined, 'text', 42, [], {}, { contents: {} }, [{ response: {} }], { engagementPanels: 'nope' }]) {
        assert.equal(removeAutoChapters(value).changed, false);
    }
    // A malformed or non-base64 key is simply not an AI chapters key.
    for (const key of ['%E0%A4%A', '!!!', '', null, 42]) assert.equal(isAutoChapterKey(key), false);
    assert.equal(isAutoChapterKey('Eg1BVVRPX0NIQVBURVJTIJICKAE%3D'), true, 'a key from the capture');
    // Nested executor commands are followed, but not forever.
    let command = { changeEngagementPanelVisibilityAction: { targetId: PANEL_ID } };
    for (let depth = 0; depth < 20; depth++) command = { commandExecutorCommand: { commands: [command] } };
    assert.equal(targetsAutoChapterPanel(command), false);
});

test('positive control: a filter without the entity-key test fails the capture', () => {
    const needle = 'return decodeEntityKey(key).includes(MARKER_KEY);';
    assert.ok(coreSource.includes(needle));
    const context = vm.createContext({ atob: globalThis.atob });
    vm.runInContext(coreSource.replace(needle, 'return false;'), context);
    const response = capture('autoOnly');
    context.YTKitCore.removeAutoChapters(response);
    const leftovers = autoChapterLeftovers(response);
    assert.equal(leftovers.length, 1);
    assert.match(leftovers[0], /loadMarkersCommand\.entityKeys/);
});

// ── end to end through ytkit-main.js and the sealed bridge ──────────

function bootMainWorld({ readyState = 'complete' } = {}) {
    const attributes = new Map();
    const observers = [];
    const documentListeners = [];
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
        atob: globalThis.atob,
        MutationObserver: FakeMutationObserver,
        document: {
            documentElement,
            addEventListener: (type, listener) => { documentListeners.push({ type, listener }); },
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({ style: {}, setAttribute() {}, removeAttribute() {}, appendChild() {} }),
            head: { appendChild() {} },
            body: { appendChild() {} },
            readyState
        },
        location: { href: 'https://www.youtube.com/watch?v=auto-chapters', pathname: '/watch' },
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
    vm.runInContext(coreSource, context, { filename: 'extension/core/auto-chapters.js' });
    vm.runInContext(mainSource, context, { filename: 'extension/ytkit-main.js' });
    // What the page does with a response: parse it with whatever JSON.parse is now.
    const pageParse = (value) => {
        context.__payload = JSON.stringify(value);
        return vm.runInContext('JSON.parse(__payload)', context);
    };
    const dispatchDocument = (type) => {
        for (const entry of documentListeners.filter((item) => item.type === type)) entry.listener({ type });
    };
    return { attributes, channel, context, documentElement, pageParse, dispatchDocument };
}

test('ytkit-main.js filters parsed responses only for a switch the isolated world sealed', () => {
    const world = bootMainWorld();
    assert.equal(world.attributes.get(STATUS_ATTR), 'off');

    world.documentElement.setAttribute(ENABLE_ATTR, 'on');
    assert.ok(autoChapterLeftovers(world.pageParse(capture('autoOnly'))).length > 0,
        'a plain attribute write is what a page script can do, and it changes nothing');

    world.context.ytInitialData = capture('autoBesideOtherMarkers');
    world.channel.publish(ENABLE_ATTR, 'on');
    assert.deepEqual(autoChapterLeftovers(world.context.ytInitialData), [],
        'the first response, kept for back navigation, is cleaned when the switch turns on');
    assert.deepEqual(autoChapterLeftovers(world.pageParse(capture('autoOnly'))), []);
    assert.deepEqual(autoChapterLeftovers(world.pageParse([{ response: capture('autoOnly') }])), []);
    // The parse result comes from the vm's realm, so compare it as text.
    const creator = capture('creatorOnly');
    assert.equal(JSON.stringify(world.pageParse(creator)), JSON.stringify(creator));
    assert.equal(world.attributes.get(STATUS_ATTR), 'on;cleaned=3');

    world.channel.clear(ENABLE_ATTR);
    assert.equal(world.attributes.get(STATUS_ATTR), 'off');
    assert.ok(autoChapterLeftovers(world.pageParse(capture('autoOnly'))).length > 0, 'off leaves responses alone');
});

test('a filter error reads degraded while the switch is on, and off reads off', () => {
    const world = bootMainWorld();
    const hostile = {};
    Object.defineProperty(hostile, 'engagementPanels', { get() { throw new Error('page getter'); } });
    world.context.ytInitialData = hostile;
    world.channel.publish(ENABLE_ATTR, 'on');
    assert.equal(world.attributes.get(STATUS_ATTR), 'degraded', 'the error is reported, and the page is not broken');

    world.channel.clear(ENABLE_ATTR);
    assert.equal(world.attributes.get(STATUS_ATTR), 'off', 'a switched-off filter is not degraded');

    world.context.ytInitialData = capture('autoOnly');
    world.channel.publish(ENABLE_ATTR, 'on');
    assert.equal(world.attributes.get(STATUS_ATTR), 'on;cleaned=1', 'turning it back on starts clean');
});

// The early switch can land before the inline assignment. If another
// script (an ad blocker's scriptlet, say) already owns ytInitialData with an
// accessor, Astra's own setter can't go in, so it looks again at
// DOMContentLoaded instead of leaving the first response dirty.
test('an early switch still cleans a first response that another script\'s accessor holds', () => {
    const world = bootMainWorld({ readyState: 'loading' });
    let held;
    Object.defineProperty(world.context, 'ytInitialData', {
        configurable: true,
        get() { return held; },
        set(value) { held = value; }
    });
    world.channel.publish(ENABLE_ATTR, 'on');
    world.context.ytInitialData = capture('autoBesideOtherMarkers');
    assert.ok(autoChapterLeftovers(held).length > 0, 'the other accessor took the value as it came');
    assert.equal(typeof Object.getOwnPropertyDescriptor(world.context, 'ytInitialData').get, 'function',
        'the other script\'s accessor is left in place');

    world.dispatchDocument('DOMContentLoaded');
    assert.deepEqual(autoChapterLeftovers(held), [], 'cleaned in place at DOMContentLoaded');
});

test('with no other accessor, an early switch cleans through its own setter', () => {
    const world = bootMainWorld({ readyState: 'loading' });
    world.channel.publish(ENABLE_ATTR, 'on');
    world.context.ytInitialData = capture('autoBesideOtherMarkers');
    assert.deepEqual(autoChapterLeftovers(world.context.ytInitialData), []);
    world.dispatchDocument('DOMContentLoaded');
    assert.deepEqual(autoChapterLeftovers(world.context.ytInitialData), []);
});

// ── the isolated-world half ──────────────────────────────────────────

test('the feature publishes the switch, hides the AI chapters panel, and clears both on destroy', () => {
    const calls = [];
    const styles = [];
    const feature = createHideAutoChaptersFeature({
        injectStyle: (css, id, raw) => {
            const style = { css, id, raw, removed: false, remove() { this.removed = true; } };
            styles.push(style);
            return style;
        },
        publishBridgeAttribute: (name, value) => calls.push(['publish', name, value]),
        clearBridgeAttribute: (name) => calls.push(['clear', name])
    });

    assert.equal(feature.id, 'hideAutoChapters');
    feature.init();
    assert.deepEqual(calls, [['publish', ENABLE_ATTR, 'on']]);
    assert.equal(styles.length, 1);
    assert.equal(styles[0].css, buildHideAutoChaptersCss());
    assert.match(styles[0].css, /ytd-engagement-panel-section-list-renderer\[target-id="engagement-panel-macro-markers-auto-chapters"\] \{ display: none !important; \}/);
    assert.doesNotMatch(styles[0].css, /description-chapters/, 'the creator chapters panel is never hidden');

    feature.destroy();
    assert.deepEqual(calls.slice(1), [['clear', ENABLE_ATTR]]);
    assert.equal(styles[0].removed, true);
});

// ── wiring ──────────────────────────────────────────────────────────

test('the setting is off by default and the manifest, ytkit.js and userscript carry both halves', () => {
    const entry = schema.SETTINGS_SCHEMA.find((setting) => setting.key === 'hideAutoChapters');
    assert.equal(entry.defaultValue, false);
    assert.equal(JSON.parse(read('extension/default-settings.json')).hideAutoChapters, false);

    const manifest = JSON.parse(read('extension/manifest.json'));
    const mainEntry = manifest.content_scripts.find((item) => item.world === 'MAIN');
    assert.ok(mainEntry.js.indexOf('core/auto-chapters.js') > -1);
    assert.ok(mainEntry.js.indexOf('core/auto-chapters.js') < mainEntry.js.indexOf('ytkit-main.js'),
        'the page-world rules load before the bridge that drives them');

    const isolatedLists = [
        ...manifest.content_scripts.map((item) => item['x-ytkit-runtime-modules']).filter(Boolean),
        ...manifest.web_accessible_resources.map((item) => item.resources).filter((list) => list.includes('ytkit.js'))
    ];
    assert.equal(isolatedLists.length, 2);
    for (const list of isolatedLists) {
        assert.ok(list.indexOf('features/hide-auto-chapters/index.js') > -1);
        assert.ok(list.indexOf('features/hide-auto-chapters/index.js') < list.indexOf('ytkit.js'));
    }

    assert.match(mainSource, /\(function installAutoChapterFilter\(\)/);
    const ytkitSource = read('extension/ytkit.js');
    assert.match(ytkitSource, /YTKitFeatures\?\.hideAutoChapters\?\.createHideAutoChaptersFeature\?\.\(/);
    assert.match(ytkitSource, /hideAutoChapters: false,/);

    const { modules } = readUserscriptBuild();
    assert.deepEqual(modules.mainWorld, mainEntry.js, 'the userscript page-world bundle follows the manifest');
    assert.ok(userscriptBundles('core/auto-chapters.js'), 'the userscript ships the page-world rules');
    assert.ok(userscriptBundles('features/hide-auto-chapters/index.js'), 'the userscript ships the feature');
});
