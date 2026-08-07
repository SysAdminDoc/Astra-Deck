'use strict';

// Drive the userscript monolith's own settingsManager / MediaDLManager for
// real, instead of pinning their source.
//
// v4.50.7 shipped five controls that called methods the userscript never
// defined — Import, import-Undo, Takeout import, companion install-assist and
// copy-install-command. Every one threw TypeError on click for every
// Tampermonkey user, and the whole 20-gate check chain stayed green, because
// nothing ever CALLED them. check-userscript-symbols.js now proves the calls
// resolve; these tests prove the methods behave.
//
// The contract under test is deliberately narrow and is exactly what was
// broken: each entry point returns a RESULT OBJECT and does not throw.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.join(__dirname, '..');
const USERSCRIPT = fs.readFileSync(path.join(REPO_ROOT, 'YTKit.user.js'), 'utf8');
const LINES = USERSCRIPT.split(/\r?\n/);

const SINGLETON_DEF = (name) => new RegExp(`^ {4}(?:const|let|var) ${name} = \\{$`);

/**
 * Slice a top-level singleton object literal out of the monolith. Same
 * indentation contract check-userscript-symbols.js relies on: the literal opens
 * at 4-space indent and closes on a bare `    };`.
 */
function singletonSource(name) {
    const open = LINES.findIndex((l) => SINGLETON_DEF(name).test(l));
    assert.ok(open >= 0, `${name} must be a top-level singleton in YTKit.user.js`);
    let close = -1;
    for (let i = open + 1; i < LINES.length; i++) {
        if (LINES[i] === '    };') { close = i; break; }
    }
    assert.ok(close > open, `${name} must close at the singleton indent`);
    return LINES.slice(open, close + 1)
        .join('\n')
        .replace(/^ {4}(?:const|let|var) \w+ = /, '')
        // Drop the statement terminator — the caller wraps this in parentheses.
        .replace(/;\s*$/, '');
}

/** Slice the contiguous Takeout helper block so the real merge logic is exercised. */
function takeoutHelperSource() {
    const start = USERSCRIPT.indexOf('    function normalizeTakeoutWatchTitle(');
    const end = USERSCRIPT.indexOf('    function estimateSerializedBytes(', start);
    assert.ok(start > 0 && end > start, 'Takeout helper block must exist in YTKit.user.js');
    return USERSCRIPT.slice(start, end);
}

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const STORAGE_CAPS = { watchTimeDays: 90, watchTimeImportedEntries: 5000 };

function baseSandbox(extra = {}) {
    const sandbox = {
        console: { error() {}, warn() {}, log() {} },
        setTimeout,
        clearTimeout,
        Intl,
        URL,
        Date,
        Blob: typeof Blob !== 'undefined' ? Blob : class { constructor(p) { this.size = JSON.stringify(p).length; } },
        VIDEO_ID_PATTERN,
        STORAGE_CAPS,
        TAKEOUT_WATCH_SECONDS: 60,
        isPlainObject: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
        isSafeObjectKey: (k) => typeof k === 'string' && !['__proto__', 'constructor', 'prototype'].includes(k),
        formatLocalDateKey: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        ...extra
    };
    sandbox.globalThis = sandbox;
    return sandbox;
}

// ── MediaDLManager: companion install-assist ──

function loadMediaDL() {
    const calls = { downloads: [], external: [], toasts: [] };
    const sandbox = baseSandbox({
        triggerDownload: async (url, filename) => { calls.downloads.push({ url, filename }); return { ok: true }; },
        openExternalWindow: (url) => { calls.external.push(url); },
        showToast: (msg) => { calls.toasts.push(msg); },
        DebugManager: { log() {} },
        navigator: { clipboard: { writeText: async () => {} } },
        // Read at literal-evaluation time for _PORT_CANDIDATES / _port.
        USERSCRIPT_COMPANION_PORT_CATALOGUE: { host: '127.0.0.1', primaryPort: 9751, ports: [9751, 9761] },
        AUTO_START_RETRY_BUDGET: 8,
        GM_getValue: () => null,
        GM_setValue: () => {},
        document: { createElement: () => ({ style: {}, appendChild() {}, remove() {} }), body: null }
    });
    const obj = vm.runInNewContext(`(${singletonSource('MediaDLManager')})`, sandbox);
    return { obj, calls };
}

test('userscript MediaDLManager.copyInstallCommand resolves false instead of throwing', async () => {
    const { obj } = loadMediaDL();
    assert.equal(typeof obj.copyInstallCommand, 'function', 'copyInstallCommand must be defined on the monolith singleton');
    const result = await obj.copyInstallCommand();
    // Deliberately false: the userscript install flow is download-the-release-exe.
    // The bundled settings panel branches to the installer URL when this is false.
    assert.equal(result, false);
});

test('userscript MediaDLManager.runInstallAssist returns a result object and downloads the installer', async () => {
    const { obj, calls } = loadMediaDL();
    assert.equal(typeof obj.runInstallAssist, 'function', 'runInstallAssist must be defined on the monolith singleton');
    const result = await obj.runInstallAssist();
    assert.ok(result && typeof result === 'object', 'runInstallAssist must return a result object');
    assert.deepEqual(Object.keys(result).sort(), ['copied', 'downloaded']);
    assert.equal(result.downloaded, true);
    assert.equal(result.copied, false);
    assert.equal(calls.downloads.length, 1, 'the installer download must actually fire');
    assert.match(calls.downloads[0].url, /AstraDownloader\.exe$/);
    assert.equal(calls.external.length, 0, 'no URL fallback needed when the download succeeded');
    assert.equal(calls.toasts.length, 1);
});

test('userscript MediaDLManager.runInstallAssist falls back to opening the URL when the download fails', async () => {
    const { obj, calls } = loadMediaDL();
    // Model the anchor-click download failing (blocked popup, hostile manager).
    obj.downloadInstaller = async () => false;
    const result = await obj.runInstallAssist();
    assert.equal(result.downloaded, false);
    assert.equal(calls.external.length, 1, 'a failed download must open the installer URL instead');
});

// ── settingsManager: import, undo, Takeout ──

function loadSettingsManager() {
    const store = new Map([
        ['ytkit-hidden-videos', []],
        ['ytkit-blocked-channels', []],
        ['ytkit-bookmarks', {}],
        ['ytkit-watch-time', { days: {}, total: 0 }]
    ]);
    const saved = [];
    const { createSettingsImportTransaction } = require(path.join(REPO_ROOT, 'extension', 'core', 'settings-import-transaction.js'));

    const sandbox = baseSandbox({
        appState: { settings: { existingKey: 1 } },
        IMPORT_LIMITS: { totalBytes: 10 * 1024 * 1024, hiddenVideos: 5000 },
        StorageManager: {
            get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
            set: (key, value) => store.set(key, value),
            setSync: (key, value) => store.set(key, value)
        },
        estimateSerializedBytes: (v) => JSON.stringify(v).length,
        sanitizeSettingsObject: (s) => ({ ...s }),
        sanitizeImportedHiddenVideos: (v) => (Array.isArray(v) ? v.slice() : []),
        sanitizeImportedBlockedChannels: (v) => (Array.isArray(v) ? v.slice() : []),
        sanitizeImportedBookmarks: (v) => ({ ...(v || {}) })
    });
    // The real transaction engine — this is the integration the port exists for.
    sandbox.YTKitCore = { createSettingsImportTransaction };

    // Bring the real Takeout helpers into the same scope.
    vm.createContext(sandbox);
    vm.runInContext(takeoutHelperSource(), sandbox);

    const obj = vm.runInContext(`(${singletonSource('settingsManager')})`, sandbox);
    obj.defaults = { existingKey: 1, other: false };
    obj.SETTINGS_VERSION = 9;
    obj.save = (s) => { saved.push(s); sandbox.appState.settings = s; };
    return { obj, store, saved };
}

const VALID_BACKUP = JSON.stringify({
    exportVersion: 3,
    settings: { other: true },
    hiddenVideos: ['abcdefghijk'],
    blockedChannels: ['UC123'],
    bookmarks: {}
});

test('userscript settingsManager.importAllSettingsDetailed returns a result object, not a bare boolean', async () => {
    const { obj, saved } = loadSettingsManager();
    assert.equal(typeof obj.importAllSettingsDetailed, 'function', 'importAllSettingsDetailed must be defined on the monolith singleton');
    const result = await obj.importAllSettingsDetailed(VALID_BACKUP);
    assert.ok(result && typeof result === 'object', 'must return a result object');
    assert.equal(result.ok, true);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0, 'a successful import must explain what it imported');
    assert.equal(saved.length, 1, 'the import must actually persist settings');
});

test('userscript settingsManager.importAllSettingsDetailed reports a message on malformed input', async () => {
    const { obj } = loadSettingsManager();
    for (const bad of ['not json at all', '[]', '{}']) {
        const result = await obj.importAllSettingsDetailed(bad);
        assert.ok(result && typeof result === 'object', `must return an object for ${bad}`);
        assert.equal(result.ok, false);
        assert.equal(typeof result.message, 'string');
        assert.ok(result.message.length > 0, 'a failed import must say why');
    }
});

test('userscript settingsManager.importAllSettings still answers a boolean for legacy callers', async () => {
    const { obj } = loadSettingsManager();
    assert.equal(await obj.importAllSettings(VALID_BACKUP), true);
    assert.equal(await obj.importAllSettings('garbage'), false);
});

test('userscript settingsManager.undoLastSettingsImport restores the pre-import snapshot', async () => {
    const { obj, store } = loadSettingsManager();
    store.set('ytkit-hidden-videos', ['originalvid']);

    const before = await obj.undoLastSettingsImport();
    assert.ok(before && typeof before === 'object', 'undo must return a result object even with nothing to undo');
    assert.equal(before.ok, false, 'no import yet, so there is nothing to undo');

    await obj.importAllSettingsDetailed(VALID_BACKUP);
    // Spread into a host array: values built inside the vm realm have a
    // different Array.prototype, which deepEqual reports as unequal.
    assert.deepEqual([...store.get('ytkit-hidden-videos')], ['abcdefghijk'], 'import applied');

    const undone = await obj.undoLastSettingsImport();
    assert.ok(undone && typeof undone === 'object');
    assert.equal(undone.ok, true);
    assert.equal(typeof undone.message, 'string');
    assert.deepEqual([...store.get('ytkit-hidden-videos')], ['originalvid'], 'undo must restore the pre-import list');
});

test('userscript settingsManager.importYouTubeTakeoutWatchHistory returns a result object and merges entries', () => {
    const { obj, store } = loadSettingsManager();
    assert.equal(typeof obj.importYouTubeTakeoutWatchHistory, 'function', 'importYouTubeTakeoutWatchHistory must be defined on the monolith singleton');

    const recent = new Date();
    recent.setDate(recent.getDate() - 1);
    const takeout = JSON.stringify([
        { titleUrl: 'https://www.youtube.com/watch?v=abcdefghijk', time: recent.toISOString(), title: 'Watched Something' }
    ]);

    const result = obj.importYouTubeTakeoutWatchHistory(takeout);
    assert.ok(result && typeof result === 'object', 'must return a result object');
    assert.equal(result.ok, true);
    assert.equal(result.imported, 1);
    assert.equal(typeof result.message, 'string');
    assert.ok(store.get('ytkit-watch-time').total > 0, 'imported seconds must land in the watch-time store');
});

test('userscript Takeout re-import is idempotent — the same file cannot double-count', () => {
    const { obj, store } = loadSettingsManager();
    const recent = new Date();
    recent.setDate(recent.getDate() - 1);
    const takeout = JSON.stringify([
        { titleUrl: 'https://www.youtube.com/watch?v=abcdefghijk', time: recent.toISOString(), title: 'One' },
        { titleUrl: 'https://www.youtube.com/watch?v=bbcdefghijk', time: recent.toISOString(), title: 'Two' }
    ]);

    const first = obj.importYouTubeTakeoutWatchHistory(takeout);
    assert.equal(first.imported, 2);
    const totalAfterFirst = store.get('ytkit-watch-time').total;

    const second = obj.importYouTubeTakeoutWatchHistory(takeout);
    assert.equal(second.imported, 0, 'a re-import must import nothing new');
    assert.equal(second.duplicates, 2);
    assert.equal(store.get('ytkit-watch-time').total, totalAfterFirst, 'the total must not grow on re-import');
});

test('userscript settingsManager.importYouTubeTakeoutWatchHistory reports empty and malformed payloads', () => {
    const { obj } = loadSettingsManager();
    const empty = obj.importYouTubeTakeoutWatchHistory('[]');
    assert.equal(empty.ok, false);
    assert.match(empty.message, /No valid/i);

    const broken = obj.importYouTubeTakeoutWatchHistory('{{{');
    assert.equal(broken.ok, false);
    assert.equal(typeof broken.message, 'string');
});
