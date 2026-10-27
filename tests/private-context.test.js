'use strict';

// Private windows. Automatic records (viewing history, the Watch Feed, in-app
// saves, fetch caches, diagnostic page IDs) written from a private or unknown
// context stay in the tab's memory and never reach regular storage. The
// background half (anonymous fetches, cookie store binding) is covered in
// background.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const persisted = require('../extension/core/persisted-domains');
const { captureAdapters } = require('../scripts/check-userscript-symbols');
const { buildUserscriptOutputs, parseUserscriptBuild } = require('../sync-userscript');

const repoRoot = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const PRIVATE_IDS = [
    'markedWatchedVideos', 'bookmarks', 'watchProgress', 'watchTime', 'resumePositions',
    'playlistResume', 'persistentQueue', 'watchLaterRemovalLog', 'recommendationScrubSessions',
    'subscriptionUnsubscribeSessions', 'usageStats', 'aiSummaries', 'aiTranscriptQa',
    'deArrowCache', 'sponsorBlockCache', 'returnDislikeCache', 'aiLabelVerdicts'
];
const keyOf = (id) => persisted.DURABLE_DOMAIN_REGISTRY.find((entry) => entry.id === id).key;

test('the registry marks history, Watch Feed, in-app saves and caches as private memory', () => {
    for (const id of PRIVATE_IDS) {
        assert.equal(persisted.isPrivateMemoryStorageKey(keyOf(id)), true, `${id} must stay in memory in a private window`);
    }
    for (const id of ['settings', 'hiddenVideos', 'channelSpeeds']) {
        assert.equal(persisted.isPrivateMemoryStorageKey(keyOf(id)), false, `${id} is a shared preference`);
    }
});

function loadStorage({ incognito, withRegistry = true } = {}) {
    const writes = [];
    const events = [];
    let changeListener = null;
    const chrome = {
        runtime: { id: 'astra-test' },
        storage: {
            local: {
                get: async () => ({}),
                set: async (items) => { writes.push({ ...items }); }
            },
            onChanged: { addListener: (listener) => { changeListener = listener; } }
        }
    };
    if (incognito !== undefined) chrome.extension = { inIncognitoContext: incognito };
    const context = vm.createContext({
        console: { warn() {}, error() {} },
        setTimeout,
        clearTimeout,
        chrome,
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        addEventListener() {},
        dispatchEvent: (event) => { events.push(event); return true; }
    });
    context.globalThis = context;
    context.window = context;
    context.top = context;
    vm.runInContext(read('extension/core/env.js'), context);
    if (withRegistry) context.YTKitCore.persistedDomains = persisted;
    vm.runInContext(read('extension/core/storage.js'), context);
    context.YTKitCore.installStorageChangeListener();
    return { core: context.YTKitCore, writes, events, echo: (changes) => changeListener(changes, 'local') };
}

const WATCH = keyOf('watchProgress');
const FEED = keyOf('persistentQueue');
const SETTINGS = keyOf('settings');

test('content reads the browser flag: private, regular, or unknown', () => {
    assert.equal(loadStorage({ incognito: true }).core.privateContextState(), 'private');
    assert.equal(loadStorage({ incognito: false }).core.privateContextState(), 'regular');
    assert.equal(loadStorage({}).core.privateContextState(), 'unknown');
});

test('a private window keeps history and Watch Feed writes in memory and still saves preferences', async () => {
    const { core, writes, events } = loadStorage({ incognito: true });
    await core.storageWriteMany({ [WATCH]: { abc: 42 }, [FEED]: ['abc'], [SETTINGS]: { theme: 'oled' } }, { immediate: true });

    assert.deepEqual(writes.map((w) => Object.keys(w)), [[SETTINGS]], 'only the shared preference reaches chrome.storage');
    assert.deepEqual(core.storageRead(WATCH, null), { abc: 42 }, 'the tab still reads its own private progress');
    assert.deepEqual(core.storageRead(FEED, null), ['abc']);
    assert.equal(core.hasPrivateMemoryKeys(), true);
    assert.equal(events.filter((e) => e.type === 'ytkit-private-memory-write').length, 1);

    await core.storageWriteMany({ [WATCH]: { abc: 50 } }, { immediate: true });
    assert.equal(events.filter((e) => e.type === 'ytkit-private-memory-write').length, 1, 'the notice fires once per tab');
});

test('a held write says so in its result, so import and undo never report it saved', async () => {
    const { core } = loadStorage({ incognito: true });
    const held = await core.storageWriteMany({ [WATCH]: { abc: 42 }, [SETTINGS]: { theme: 'oled' } }, { immediate: true });
    assert.equal(held.ok, true);
    assert.deepEqual([...held.heldInMemory], [WATCH]);
    const queued = await core.storageWriteMany({ [FEED]: ['abc'] });
    assert.deepEqual([...queued.heldInMemory], [FEED]);

    const regular = loadStorage({ incognito: false });
    const saved = await regular.core.storageWriteMany({ [WATCH]: { abc: 42 } }, { immediate: true });
    assert.equal(saved.heldInMemory, undefined);
});

test('a regular tab write never overwrites the private copy', async () => {
    const { core, events, echo } = loadStorage({ incognito: true });
    await core.storageWriteMany({ [WATCH]: { abc: 42 } }, { immediate: true });
    events.length = 0;
    // A regular tab's write arrives here as a storage echo.
    echo({ [WATCH]: { newValue: { abc: 1, other: 9 } }, [SETTINGS]: { newValue: { theme: 'dark' } } });
    assert.deepEqual(core.storageRead(WATCH, null), { abc: 42 }, 'private progress is unchanged');
    assert.deepEqual(core.storageRead(SETTINGS, null), { theme: 'dark' }, 'shared preferences still sync');
    const changed = events.filter((e) => e.type === 'ytkit-storage-changed');
    assert.equal(changed.length, 1);
    assert.deepEqual(Object.keys(changed[0].detail.changes), [SETTINGS]);
});

test('a regular window writes everything through as before', async () => {
    const { core, writes, events } = loadStorage({ incognito: false });
    await core.storageWriteMany({ [WATCH]: { abc: 42 }, [SETTINGS]: { theme: 'oled' } }, { immediate: true });
    assert.deepEqual(Object.keys(writes[0]).sort(), [SETTINGS, WATCH].sort());
    assert.equal(core.hasPrivateMemoryKeys(), false);
    assert.equal(events.filter((e) => e.type === 'ytkit-private-memory-write').length, 0);
});

test('an unknown context is treated as private', async () => {
    const { core, writes } = loadStorage({});
    await core.storageWriteMany({ [WATCH]: { abc: 42 }, [SETTINGS]: { theme: 'oled' } }, { immediate: true });
    assert.deepEqual(writes.map((w) => Object.keys(w)), [[SETTINGS]]);
});

test('without the registry a private window holds every write rather than guess', async () => {
    const { core, writes } = loadStorage({ incognito: true, withRegistry: false });
    await core.storageWriteMany({ [WATCH]: { abc: 42 }, [SETTINGS]: { theme: 'oled' } }, { immediate: true });
    assert.equal(writes.length, 0);
});

function loadDiagnosticLog(keepInMemory) {
    const context = vm.createContext({ console: { warn() {} } });
    context.globalThis = context;
    vm.runInContext(read('extension/core/diagnostic-log.js'), context);
    const settings = { diagnosticLog: true };
    const log = context.YTKitCore.createDiagnosticLog({ getSettings: () => settings, keepInMemory });
    return { log, settings };
}

test('diagnostic entries from a private window stay out of the saved settings', () => {
    let isPrivate = true;
    const { log, settings } = loadDiagnosticLog(() => isPrivate);
    log.record('player', 'failed on /watch?v=abc12345678');
    assert.equal(settings._errors, undefined, 'nothing rides the next settings save');
    assert.equal(log.get().length, 1, 'the tab can still show and download it');
    assert.equal(log.countsByCtx().player, 1);

    isPrivate = false;
    log.record('player', 'regular entry');
    assert.equal(settings._errors.length, 1);
    assert.equal(log.get().length, 2);

    log.clear();
    assert.equal(log.get().length, 0);
});

test('the page wires the private context into diagnostics and tells the user once', () => {
    const ytkit = read('extension/ytkit.js');
    assert.match(ytkit, /keepInMemory: \(\) => \(globalThis\.YTKitCore\?\.privateContextState\?\.\(\) \?\? 'unknown'\) !== 'regular'/);
    assert.match(ytkit, /addEventListener\('ytkit-private-memory-write'/);
    const en = JSON.parse(read('extension/_locales/en/messages.json'));
    assert.ok(en.privateMemoryNotice?.message, 'the private notice is localized');
    assert.ok(en.privateMemoryUnknownNotice?.message);
    assert.ok(en.privateImportHeldNotice?.message);
});

// Boots the real listener from ytkit.js against a stub showToast and the
// real quiet-toast rule, so a neutral tone that only reaches screen readers
// fails here.
function bootPrivateNotice(state) {
    const ytkit = read('extension/ytkit.js');
    const start = ytkit.indexOf("window.addEventListener('ytkit-private-memory-write'");
    const end = ytkit.indexOf('\n        });\n', start) + '\n        });\n'.length;
    assert.ok(start > 0 && end > start, 'the listener is where the test expects it');
    const quietStart = ytkit.indexOf('function isQuietToast(');
    const quietEnd = ytkit.indexOf('\n    }\n', quietStart) + '\n    }\n'.length;
    const toasts = [];
    const stores = { localStorage: new Map(), sessionStorage: new Map() };
    const storage = (map) => ({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) });
    let listener = null;
    const context = vm.createContext({
        appState: { settings: { actionToasts: false } },
        document: { body: { classList: { contains: () => false } } },
        normalizeToastTone: (tone) => tone,
        inferToastTone: (color) => (color === '#f59e0b' ? 'warning' : 'neutral'),
        t: (_key, fallback) => fallback,
        localStorage: storage(stores.localStorage),
        sessionStorage: storage(stores.sessionStorage),
        YTKitCore: { privateContextState: () => state },
        window: { addEventListener: (_type, fn) => { listener = fn; } }
    });
    context.globalThis = context;
    vm.runInContext(`${ytkit.slice(quietStart, quietEnd)}
        function showToast(message, color, options = {}) { toasts.push({ message, quiet: isQuietToast(color, options) }); }
        ${ytkit.slice(start, end)}`, Object.assign(context, { toasts }));
    return { fire: () => listener(), toasts, stores };
}

test('the private notice is a visible toast, shown once, and an unknown context marks only the tab session', () => {
    const known = bootPrivateNotice('private');
    known.fire();
    known.fire();
    assert.equal(known.toasts.length, 1, 'once per private session');
    assert.equal(known.toasts[0].quiet, false, 'a quiet toast only reaches screen readers');
    assert.equal(known.stores.localStorage.size, 1);

    const unknown = bootPrivateNotice('unknown');
    unknown.fire();
    assert.equal(unknown.toasts.length, 1);
    assert.equal(unknown.stores.localStorage.size, 0, 'a maybe-regular window gets no mark in the profile page storage');
    assert.equal(unknown.stores.sessionStorage.size, 1);
});

// Boots the real crash-loop guard from ytkit.js. Every page boot stamps it,
// so a private boot that stamps regular storage leaves a trace of the visit
// (scripts/smoke-private-window.js caught it under both userscript managers).
function bootCrashGuard(state) {
    const ytkit = read('extension/ytkit.js');
    const start = ytkit.indexOf("const _CRASH_SESSION_KEY = '_ytkit_crash_guard'");
    const end = ytkit.indexOf('const isSafeMode = _crashGuardTriggered', start);
    assert.ok(start > 0 && end > start, 'the crash-loop guard is where the test expects it');
    const writes = [];
    const stores = { localStorage: new Map(), sessionStorage: new Map() };
    const storage = (map) => ({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) });
    const context = vm.createContext({
        hasExtensionContext: () => true,
        storageRead: (_key, fallback) => fallback,
        storageWrite: (key) => { writes.push(key); },
        localStorage: storage(stores.localStorage),
        sessionStorage: storage(stores.sessionStorage),
        YTKitCore: { privateContextState: () => state },
        DiagnosticLog: null,
        console
    });
    context.globalThis = context;
    vm.runInContext(ytkit.slice(start, end), context);
    return { writes, stores, clear: () => vm.runInContext('_clearCrashGuardTimestamps();', context) };
}

test('a private or unknown boot stamps the crash-loop guard in the tab, not regular storage', () => {
    for (const state of ['private', 'unknown']) {
        const guard = bootCrashGuard(state);
        assert.equal(guard.writes.length, 0, `${state}: the boot stamp must not reach extension storage`);
        assert.equal(guard.stores.localStorage.size, 0, `${state}: nor the profile's page storage`);
        assert.equal(guard.stores.sessionStorage.size, 1, `${state}: the tab still guards against a crash loop across reloads`);
        guard.clear();
        assert.equal(guard.writes.length, 0, `${state}: clearing stays in the tab too`);
        assert.equal(guard.stores.sessionStorage.size, 0);
    }
    const regular = bootCrashGuard('regular');
    assert.deepEqual(regular.writes, ['_ytkit_crash_guard'], 'a regular boot still uses extension storage');
    assert.equal(regular.stores.sessionStorage.size, 0);
});

// Built in memory from the current host.js, not the committed YTKit.user.js,
// which only catches up at the next release sync.
const userscriptSource = buildUserscriptOutputs(repoRoot).get('YTKit.user.js');
const userscriptBuild = parseUserscriptBuild(userscriptSource);

async function bootUserscript(gmInfo) {
    const run = captureAdapters(userscriptSource, userscriptBuild, {}, { gmInfo: { scriptHandler: 'test', version: '0', ...gmInfo } });
    for (let round = 0; round < 5; round += 1) {
        run.drain();
        await new Promise((resolve) => setImmediate(resolve));
    }
    return run.captured;
}

test('the userscript adapter reports the manager private flag the same way the browser does', async () => {
    for (const [isIncognito, expected] of [[true, true], [false, false], [undefined, null]]) {
        const { content, background } = await bootUserscript(isIncognito === undefined ? {} : { isIncognito });
        assert.equal(content.extension.inIncognitoContext, expected);
        const [tab] = await background.tabs.query({});
        assert.equal(tab.incognito, expected, 'the sender tab carries the same flag');
    }
});

test('the userscript still has no authenticated cookie download path', () => {
    const host = read('userscript/host.js');
    assert.doesNotMatch(host, /YTKIT_COOKIE_HANDOFF/);
});
