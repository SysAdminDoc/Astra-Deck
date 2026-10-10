'use strict';

// core/early-switches.js: the three page-world switches a hard load needs
// before YouTube's inline data runs (Force DVR, Hide AI Chapters, Classic
// Watch Layout), published from their own document_start entry instead of
// waiting for ytkit.js at document_idle.
//
// The unit half drives the module with stub storage and a stub channel. The
// end-to-end half builds both worlds over one fake <html>, in manifest
// order, and plays the page's own inline scripts after the switches land.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { DEFAULT_FLAGS } = require('../extension/core/classic-watch-layout.js');
const { PANEL_ID } = require('../extension/core/auto-chapters.js');

const repoRoot = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const EARLY = 'extension/core/early-switches.js';
const earlySource = read(EARLY);
const PAGE_WORLD = [
    'extension/core/bridge-channel.js',
    'extension/core/injection-guard.js',
    'extension/core/classic-watch-layout.js',
    'extension/core/auto-chapters.js',
    'extension/ytkit-main.js',
].map((file) => [file, read(file)]);
const chapterFixture = JSON.parse(read('tests/fixtures/watch-auto-chapters-2026-10.json'));
const liveFixture = JSON.parse(read('tests/fixtures/player-response-live-dvr-disabled.json'));
const clone = (value) => JSON.parse(JSON.stringify(value));
// Values made in a vm carry that realm's prototypes; compare them as data.
const plain = clone;

const ALL_ON = Object.freeze({
    forceDvr: true,
    hideAutoChapters: true,
    restoreClassicWatchLayout: true,
    watchLayoutFlagOverrides: 'my_extra_flag',
});

// ── the module alone ────────────────────────────────────────────────

/**
 * Load early-switches.js into a fresh context. `channel: true` stands in for
 * the channel module the extension imports; `stored` is what storage holds.
 */
function loadEarly({ stored = {}, pathname = '/watch', search = '', channel = true, token = 'a'.repeat(64),
    runtimeStarted = false, storage } = {}) {
    const writes = [];
    const reads = [];
    const core = {};
    if (channel) {
        core.publishBridgeAttribute = (name, value) => writes.push(['publish', name, value]);
        core.clearBridgeAttribute = (name) => writes.push(['clear', name]);
        core.getBridgeWriter = () => (token ? {} : null);
    }
    const context = {
        YTKitCore: core,
        location: { pathname, search },
        chrome: {
            runtime: {},
            storage: {
                local: storage || {
                    get: (keys) => { reads.push(plain(keys)); return Promise.resolve(clone(stored)); },
                },
            },
        },
    };
    if (runtimeStarted) context.__ytkitRuntimeBootstrap = {};
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(earlySource, context, { filename: EARLY });
    const early = context.YTKitCore.earlyBridgeSwitches;
    return { early, writes, reads, ready: early.ready };
}

const names = (writes) => writes.map(([kind, name, value]) => (value === undefined ? `${kind} ${name}` : `${kind} ${name}=${value}`));

test('the plan takes only a stored true, flags first, in the order each feature publishes', () => {
    const { early } = loadEarly({ pathname: '/' });
    const plan = early.planEarlySwitches(ALL_ON);
    assert.deepEqual(plain(plan).map((entry) => [entry.name, entry.value, entry.featureId]), [
        ['data-ytkit-force-dvr', 'on', 'forceDvr'],
        ['data-ytkit-hide-auto-chapters', 'on', 'hideAutoChapters'],
        ['data-ytkit-classic-watch-layout-flags', 'my_extra_flag', 'restoreClassicWatchLayout'],
        ['data-ytkit-classic-watch-layout', 'on', 'restoreClassicWatchLayout'],
    ]);
    for (const value of [false, 1, 'true', 'on', null, undefined, {}]) {
        assert.deepEqual(plain(early.planEarlySwitches({ forceDvr: value, hideAutoChapters: value, restoreClassicWatchLayout: value })), [],
            `${JSON.stringify(value)} is not the user turning it on`);
    }
    for (const settings of [null, undefined, 'x', [], 7]) assert.deepEqual(plain(early.planEarlySwitches(settings)), []);
});

test('a flag list the settings field would refuse is left out, and the switch still goes', () => {
    const { early } = loadEarly({ pathname: '/' });
    for (const junk of ['<img src=x>', 'a;b', 'x'.repeat(4001), '   ', '', 7, null]) {
        const plan = early.planEarlySwitches({ restoreClassicWatchLayout: true, watchLayoutFlagOverrides: junk });
        assert.deepEqual(plain(plan).map((entry) => entry.name), ['data-ytkit-classic-watch-layout'], String(JSON.stringify(junk)).slice(0, 40));
    }
    const plan = early.planEarlySwitches({ restoreClassicWatchLayout: true, watchLayoutFlagOverrides: '  one_flag\n-two_flag  ' });
    assert.equal(plan[0].value, 'one_flag\n-two_flag', 'trimmed the way the feature trims a stored value');
});

test('only a watch page qualifies', () => {
    const { early } = loadEarly({ pathname: '/' });
    assert.equal(early.isWatchPath('/watch'), true);
    // core/page.js doesn't count /live/ID as a watch page, so the features
    // never start there and an early switch would only be withdrawn.
    for (const no of ['/', '/live/abc123', '/watchlater', '/watch/x', '/shorts/abc', '/results', '/@channel/live', '', undefined]) {
        assert.equal(early.isWatchPath(no), false, String(no));
    }
});

test('on a watch page with the switches stored on, they publish as soon as storage answers', async () => {
    const run = loadEarly({ stored: { ytSuiteSettings: ALL_ON } });
    assert.equal(await run.ready, 4);
    assert.deepEqual(run.reads, [['ytSuiteSettings', 'ytkit_safe_mode']]);
    assert.deepEqual(names(run.writes), [
        'publish data-ytkit-force-dvr=on',
        'publish data-ytkit-hide-auto-chapters=on',
        'publish data-ytkit-classic-watch-layout-flags=my_extra_flag',
        'publish data-ytkit-classic-watch-layout=on',
    ]);
    assert.deepEqual(plain(run.early.published).map((entry) => entry.featureId),
        ['forceDvr', 'hideAutoChapters', 'restoreClassicWatchLayout', 'restoreClassicWatchLayout']);
});

test('nothing is published off a watch page, in safe mode, after the runtime started, or with no token', async () => {
    const stored = { ytSuiteSettings: ALL_ON };
    const offPage = loadEarly({ stored, pathname: '/results' });
    assert.equal(await offPage.ready, 0);
    assert.deepEqual(offPage.reads, [], 'storage is not even read off a watch page');

    const safeUrl = loadEarly({ stored, search: '?v=x&ytkit=safe' });
    assert.equal(await safeUrl.ready, 0);
    assert.deepEqual(safeUrl.reads, []);

    const safeStored = loadEarly({ stored: { ...stored, ytkit_safe_mode: true } });
    assert.equal(await safeStored.ready, 0);
    assert.deepEqual(safeStored.writes, []);

    const late = loadEarly({ stored, runtimeStarted: true });
    assert.equal(await late.ready, 0, 'once the runtime runs it owns every switch');
    assert.deepEqual(late.writes, []);

    const noToken = loadEarly({ stored, token: null });
    assert.equal(await noToken.ready, 0, 'with no token the page world reads nothing, so nothing is written');
    assert.deepEqual(noToken.writes, []);

    const allOff = loadEarly({ stored: { ytSuiteSettings: { hideSidebar: true } } });
    assert.equal(await allOff.ready, 0);
    assert.deepEqual(allOff.writes, []);
});

test('a storage or channel failure publishes nothing and never throws', async () => {
    const stored = { ytSuiteSettings: ALL_ON };
    const throwing = loadEarly({ storage: { get() { throw new Error('context invalidated'); } } });
    assert.equal(await throwing.ready, 0);
    const rejecting = loadEarly({ storage: { get: () => Promise.reject(new Error('quota')) } });
    assert.equal(await rejecting.ready, 0);
    // No channel module yet and no runtime.getURL to import it with.
    const noChannel = loadEarly({ stored, channel: false });
    assert.equal(await noChannel.ready, 0);
    assert.deepEqual(plain(noChannel.early.published), []);
});

test('settle keeps what a started feature confirmed, clears the rest, and runs once', async () => {
    const run = loadEarly({ stored: { ytSuiteSettings: ALL_ON } });
    await run.ready;
    run.writes.length = 0;
    assert.equal(run.early.settle((featureId) => featureId === 'hideAutoChapters'), 3);
    assert.deepEqual(names(run.writes), [
        'clear data-ytkit-force-dvr',
        'clear data-ytkit-classic-watch-layout-flags',
        'clear data-ytkit-classic-watch-layout',
    ]);
    assert.equal(run.early.settled, true);
    assert.deepEqual(plain(run.early.published), []);
    assert.equal(run.early.settle(() => false), 0, 'a second settle has nothing left to clear');
    assert.equal(await run.early.start(), 0, 'and nothing publishes after it');
});

test('settle clears everything when the check throws or is missing', async () => {
    const run = loadEarly({ stored: { ytSuiteSettings: { forceDvr: true } } });
    await run.ready;
    assert.equal(run.early.settle(() => { throw new Error('boom'); }), 1);
    const second = loadEarly({ stored: { ytSuiteSettings: { forceDvr: true } } });
    await second.ready;
    assert.equal(second.early.settle(), 1);
});

test('a settle before storage answers stops the late publish', async () => {
    let answer;
    const run = loadEarly({ storage: { get: () => new Promise((resolve) => { answer = resolve; }) } });
    assert.equal(run.early.settle(() => true), 0);
    answer({ ytSuiteSettings: ALL_ON });
    assert.equal(await run.ready, 0);
    assert.deepEqual(run.writes, []);
});

// ── both worlds over one page, in manifest order ────────────────────

function sharedPage() {
    const attributes = new Map();
    const observers = [];
    const deliver = (records) => {
        for (const observer of observers.filter((entry) => entry.active)) {
            const wanted = records.filter((record) => (record.type === 'childList'
                ? observer.options.childList
                : (observer.options.attributes || observer.options.attributeFilter)));
            if (wanted.length) observer.callback(wanted, observer);
        }
    };
    const documentElement = {
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        setAttribute: (name, value) => { attributes.set(name, String(value)); deliver([{ type: 'attributes', attributeName: name }]); },
        removeAttribute: (name) => { attributes.delete(name); deliver([{ type: 'attributes', attributeName: name }]); },
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    };
    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.active = false; this.options = {}; observers.push(this); }
        observe(target, options) { this.active = true; this.options = options || {}; }
        disconnect() { this.active = false; }
        takeRecords() { return []; }
    }
    return {
        attributes,
        documentElement,
        FakeMutationObserver,
        /** The parser adding the next node, which is all the config watch needs. */
        parserAddsNode: () => deliver([{ type: 'childList', addedNodes: [] }]),
        childListWatchers: () => observers.filter((entry) => entry.active && entry.options.childList).length,
    };
}

function isolatedWorld(page, stored) {
    const context = {
        console,
        crypto: webcrypto,
        location: { pathname: '/watch', search: '?v=hard-load' },
        document: { documentElement: page.documentElement, dispatchEvent: () => true },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        chrome: { runtime: {}, storage: { local: { get: () => Promise.resolve(clone(stored)) } } },
    };
    context.globalThis = context;
    context.self = context;
    vm.createContext(context);
    vm.runInContext(read('extension/core/bridge-token.js'), context, { filename: 'extension/core/bridge-token.js' });
    return context;
}

function pageWorld(page) {
    const context = {
        console,
        setTimeout,
        clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {},
        queueMicrotask,
        MutationObserver: page.FakeMutationObserver,
        document: {
            documentElement: page.documentElement,
            addEventListener() {},
            removeEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({ style: {}, setAttribute() {}, removeAttribute() {}, appendChild() {} }),
            head: { appendChild() {} },
            body: { appendChild() {} },
            readyState: 'loading',
        },
        location: { href: 'https://www.youtube.com/watch?v=hard-load', pathname: '/watch' },
        performance: { now: () => 0 },
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => true,
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;
    vm.createContext(context);
    for (const [file, source] of PAGE_WORLD) vm.runInContext(source, context, { filename: file });
    return context;
}

// YouTube's own ytcfg shape: data in ytcfg.data_, set() replaces
// EXPERIMENT_FLAGS wholesale.
const YTCFG_SCRIPT = `var ytcfg = { data_: {}, d: function () { return ytcfg.data_; },
    get: function (key, fallback) { return key in ytcfg.data_ ? ytcfg.data_[key] : fallback; },
    set: function (values) { for (var key in values) ytcfg.data_[key] = values[key]; } };`;

/**
 * A hard load: the token pass, the page world, the early switches, then the
 * page's inline scripts in the order YouTube's HTML runs them.
 */
async function hardLoad(stored) {
    const page = sharedPage();
    const isolated = isolatedWorld(page, stored);
    const main = pageWorld(page);
    // The extension imports the channel module here; running it is the same.
    vm.runInContext(read('extension/core/bridge-channel.js'), isolated, { filename: 'extension/core/bridge-channel.js' });
    vm.runInContext(earlySource, isolated, { filename: EARLY });
    const published = await isolated.YTKitCore.earlyBridgeSwitches.ready;

    const flags = {};
    for (const flag of [...DEFAULT_FLAGS, 'my_extra_flag', 'some_unrelated_flag']) flags[flag] = true;
    vm.runInContext(YTCFG_SCRIPT, main, { filename: 'inline-ytcfg.js' });
    page.parserAddsNode();
    main.__flags = flags;
    main.__player = clone(liveFixture);
    main.__data = clone(chapterFixture.captures.autoOnly);
    vm.runInContext('ytcfg.set({ EXPERIMENT_FLAGS: __flags });', main, { filename: 'inline-flags.js' });
    vm.runInContext('var ytInitialPlayerResponse = __player;', main, { filename: 'inline-player.js' });
    vm.runInContext('var ytInitialData = __data;', main, { filename: 'inline-data.js' });
    return { page, isolated, main, published };
}

const panelMentions = (data) => JSON.stringify(data).split(PANEL_ID).length - 1;

test('on a hard load all three switches reach the page world before its inline data runs', async () => {
    const { main, page, published } = await hardLoad({ ytSuiteSettings: ALL_ON });
    assert.equal(published, 4);

    assert.equal(panelMentions(main.ytInitialData), 0, 'the first video loses its AI chapters too');
    assert.equal(page.attributes.get('data-ytkit-hide-auto-chapters-status'), 'on;cleaned=1');

    assert.equal(main.ytInitialPlayerResponse.videoDetails.isLiveDvrEnabled, true, 'the first live stream gets DVR');

    const experimentFlags = main.ytcfg.get('EXPERIMENT_FLAGS');
    for (const flag of [...DEFAULT_FLAGS, 'my_extra_flag']) assert.equal(experimentFlags[flag], false, flag);
    assert.equal(experimentFlags.some_unrelated_flag, true);
    assert.equal(page.childListWatchers(), 0, 'the config watch is gone once ytcfg turned up');
});

test('the same hard load with the switches off leaves every inline value as YouTube sent it', async () => {
    // Positive control: without the early switches nothing above happens, so
    // the test can tell the difference.
    const { main, published } = await hardLoad({ ytSuiteSettings: {} });
    assert.equal(published, 0);
    assert.equal(panelMentions(main.ytInitialData), 9);
    assert.equal(main.ytInitialPlayerResponse.videoDetails.isLiveDvrEnabled, false);
    assert.equal(main.ytcfg.get('EXPERIMENT_FLAGS').web_watch_split_scroll, true);
});

test('settling through the bridge withdraws a switch whose feature never started', async () => {
    const { main, page, isolated } = await hardLoad({ ytSuiteSettings: ALL_ON });
    // As if ytkit.js found Classic Watch Layout and Force DVR blocked (a
    // conflict, a crash count) and only Hide AI Chapters started.
    isolated.YTKitCore.earlyBridgeSwitches.settle((featureId) => featureId === 'hideAutoChapters');
    assert.equal(page.attributes.get('data-ytkit-force-dvr-status'), 'off');
    assert.equal(page.attributes.get('data-ytkit-classic-watch-layout-status'), 'off');
    assert.equal(main.ytcfg.get('EXPERIMENT_FLAGS').web_watch_split_scroll, true, 'YouTube gets its flags back');
    assert.equal(page.attributes.get('data-ytkit-hide-auto-chapters-status'), 'on;cleaned=1', 'the confirmed one stays');
});

test('a page script writing the switches itself still gets nothing', async () => {
    const page = sharedPage();
    isolatedWorld(page, {});
    const main = pageWorld(page);
    page.documentElement.setAttribute('data-ytkit-hide-auto-chapters', 'on');
    main.__data = clone(chapterFixture.captures.autoOnly);
    vm.runInContext('var ytInitialData = __data;', main, { filename: 'inline-data.js' });
    assert.equal(panelMentions(main.ytInitialData), 9);
});

// ── wiring ──────────────────────────────────────────────────────────

test('ytkit.js settles the early switches in safe mode and after both init tiers', () => {
    const ytkit = read('extension/ytkit.js');
    const safe = ytkit.indexOf('[YTKit] SAFE MODE');
    assert.ok(safe > -1);
    assert.match(ytkit.slice(safe, safe + 600), /earlyBridgeSwitches\?\.settle\?\.\(\(\) => false\)/);
    assert.match(ytkit, /let pendingInitTiers = 2;/);
    assert.equal(ytkit.split('settleEarlySwitches();').length - 1, 2, 'once at the end of each tier');
    assert.ok(ytkit.includes('return feature?._initialized === true && feature._moduleUnavailable !== true;'),
        'a feature confirms its switch only when it started for real');
    // The stubs ytkit.js uses when a feature module fails to import start
    // without publishing anything, so they must not confirm a switch.
    for (const id of ['restoreClassicWatchLayout', 'hideAutoChapters']) {
        const at = ytkit.indexOf(`id: '${id}',`);
        assert.ok(at > -1, id);
        const stub = ytkit.slice(at, ytkit.indexOf('destroy() {}', at));
        assert.ok(stub.includes('Feature module unavailable'), `${id}: the slice is the stub`);
        assert.ok(stub.includes('_moduleUnavailable: true'), `${id}: the stub is marked`);
    }
});

test('a runtime that fails to load takes the early switches back', () => {
    for (const file of ['extension/runtime-bootstrap.js', 'userscript/host.js']) {
        const source = read(file);
        const failed = source.lastIndexOf("phase = 'failed';");
        assert.ok(failed > -1, file);
        assert.ok(source.slice(failed, failed + 900).includes('earlyBridgeSwitches?.settle?.(() => false)'),
            `${file}: the load-failure path settles with nothing confirmed`);
    }
});

test('every switch the early pass knows is one its feature publishes', () => {
    const { early } = loadEarly({ pathname: '/' });
    const sources = {
        forceDvr: read('extension/ytkit.js'),
        hideAutoChapters: read('extension/features/hide-auto-chapters/index.js'),
        restoreClassicWatchLayout: read('extension/features/classic-watch-layout/index.js'),
    };
    for (const entry of early.SWITCHES) {
        assert.ok(sources[entry.featureId].includes(`'${entry.attribute}'`), `${entry.featureId} publishes ${entry.attribute}`);
        if (entry.flagsAttribute) assert.ok(sources[entry.featureId].includes(`'${entry.flagsAttribute}'`));
    }
    const mainSource = read('extension/ytkit-main.js');
    for (const entry of early.SWITCHES) assert.ok(mainSource.includes(`'${entry.attribute}'`), `ytkit-main.js reads ${entry.attribute}`);
});

test('the early pass imports the channel module from the list the runtime loader imports from', () => {
    // Same URL, same module record: the runtime's later import of the channel
    // gets the writer and state map the early pass already used.
    const manifest = JSON.parse(read('extension/manifest.json'));
    const runtimeList = manifest.web_accessible_resources.find((entry) => entry.resources.includes('ytkit.js'));
    assert.ok(runtimeList.resources.includes('core/bridge-channel.js'));
    assert.ok(earlySource.includes("CHANNEL_MODULE = 'core/bridge-channel.js'"));
    assert.ok(earlySource.includes('import(getURL.call(api.runtime, CHANNEL_MODULE))'));
});
