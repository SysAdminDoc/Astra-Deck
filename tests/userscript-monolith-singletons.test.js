'use strict';

// Drive the settingsManager and MediaDLManager the userscript runs, for real,
// instead of pinning their source.
//
// v4.50.7 shipped five controls that called methods the userscript never
// defined — Import, import-Undo, Takeout import, companion install-assist and
// copy-install-command. Every one threw TypeError on click for every
// Tampermonkey user, and the whole 20-gate check chain stayed green, because
// nothing ever CALLED them.
//
// The userscript no longer carries its own copies of these singletons. It is
// generated from extension/ and runs extension/ytkit.js's settingsManager and
// features/download-ui's MediaDLManager, so those are what these tests call,
// after proving the userscript ships the files that hold them. The contract
// under test is still exactly what was broken: each entry point returns a
// RESULT OBJECT and does not throw.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');

const { sources, userscriptBundles } = require('./helpers/source');
const { declarationSourceFrom } = require('./helpers/monolith');
const { createDownloadUIFeature } = require('../extension/features/download-ui');

const REPO_ROOT = path.join(__dirname, '..');

test('the userscript ships the files that define both singletons', () => {
    assert.ok(userscriptBundles('ytkit.js'), 'settingsManager lives in ytkit.js');
    assert.ok(userscriptBundles('features/download-ui/index.js'), 'MediaDLManager lives in the download UI module');
    assert.ok(userscriptBundles('core/settings-import-transaction.js'),
        'import and undo go through the shared transaction engine, which has to ship too');
});

// ── MediaDLManager: companion install-assist ──

function loadMediaDL({ downloadFails = false } = {}) {
    const calls = { downloads: [], external: [], toasts: [] };
    const feature = createDownloadUIFeature({
        triggerDownload: async (url, filename) => {
            calls.downloads.push({ url, filename });
            if (downloadFails) throw new Error('blocked');
        },
        openExternalUrl: async (url) => { calls.external.push(url); },
        showToast: (msg) => { calls.toasts.push(msg); },
    });
    return { obj: feature.MediaDLManager, calls };
}

// The clipboard is a browser grant, and a page without it (or a manager that
// refuses it) must not turn Copy into an exception.
async function withClipboard(clipboard, run) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true, writable: true });
    try {
        return await run();
    } finally {
        if (previous) Object.defineProperty(globalThis, 'navigator', previous);
        else delete globalThis.navigator;
    }
}

const REFUSING_CLIPBOARD = { writeText: async () => { throw new Error('denied'); } };

test('MediaDLManager.copyInstallCommand resolves false instead of throwing when the clipboard refuses', async () => {
    const { obj } = loadMediaDL();
    assert.equal(typeof obj.copyInstallCommand, 'function', 'copyInstallCommand must be defined on the singleton');
    assert.equal(await withClipboard(REFUSING_CLIPBOARD, () => obj.copyInstallCommand()), false);
    assert.equal(await withClipboard(undefined, () => obj.copyInstallCommand()), false,
        'no clipboard API at all is the same answer, not a TypeError');
});

test('MediaDLManager.runInstallAssist returns a result object and downloads the installer', async () => {
    const { obj, calls } = loadMediaDL();
    assert.equal(typeof obj.runInstallAssist, 'function', 'runInstallAssist must be defined on the singleton');
    const result = await withClipboard(REFUSING_CLIPBOARD, () => obj.runInstallAssist());
    assert.ok(result && typeof result === 'object', 'runInstallAssist must return a result object');
    assert.deepEqual(Object.keys(result).sort(), ['copied', 'downloaded']);
    assert.equal(result.downloaded, true);
    assert.equal(result.copied, false);
    assert.equal(calls.downloads.length, 1, 'the installer download must actually fire');
    assert.match(calls.downloads[0].url, /AstraDownloader\.exe$/);
    assert.equal(calls.external.length, 0, 'no URL fallback needed when the download succeeded');
    assert.equal(calls.toasts.length, 1);
});

test('MediaDLManager.runInstallAssist falls back to opening the URL when the download fails', async () => {
    // Model the download failing (blocked popup, hostile manager).
    const { obj, calls } = loadMediaDL({ downloadFails: true });
    const result = await withClipboard(REFUSING_CLIPBOARD, () => obj.runInstallAssist());
    assert.equal(result.downloaded, false);
    assert.deepEqual(calls.external, [obj.INSTALLER_URL], 'a failed download must open the installer URL instead');
});

// ── settingsManager: import, undo, Takeout ──

/**
 * settingsManager out of ytkit.js, with the real storage keys, import limits,
 * sanitizers and Takeout merge it calls. The span from STORAGE_KEYS to the
 * serialized-size estimator is contiguous and has no side-effecting top-level
 * initializers, so it is evaluated whole rather than stitched per helper.
 */
function loadSettingsManager() {
    const store = new Map();
    const { createSettingsImportTransaction } = require(path.join(REPO_ROOT, 'extension', 'core', 'settings-import-transaction.js'));
    const begin = sources.ytkit.indexOf('const STORAGE_KEYS = Object.freeze({');
    const end = sources.ytkit.indexOf('    function createBrandImage(', begin);
    assert.ok(begin > -1 && end > begin, 'the storage-key and import-helper span must be extractable from ytkit.js');

    const sandbox = {
        console: { error() {}, warn() {}, log() {} },
        Blob,
        appState: { settings: {} },
        t: (_key, fallback) => fallback,
        tCount: (count, _key, singular, plural) => (Number(count) === 1 ? singular : plural),
        DebugManager: { log() {} },
        StorageManager: {
            get: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
            set: (key, value) => { store.set(key, value); },
            // setSync resolves { ok } the way the real storage cache does.
            setSync: (key, value) => { store.set(key, value); return Promise.resolve({ ok: true }); },
        },
        // The real transaction engine — this is the integration the port exists for.
        YTKitCore: { createSettingsImportTransaction },
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext([
        sources.ytkit.slice(begin, end),
        declarationSourceFrom(sources.ytkit, 'RETIRED_SETTING_KEYS'),
        declarationSourceFrom(sources.ytkit, 'settingsManager'),
        'globalThis.__settingsManager = settingsManager;',
        'globalThis.__STORAGE_KEYS = STORAGE_KEYS;',
    ].join('\n'), sandbox);

    const obj = sandbox.__settingsManager;
    const keys = sandbox.__STORAGE_KEYS;
    sandbox.appState.settings = { ...obj.defaults };
    // Spread into a host array: values built inside the vm realm have a
    // different Array.prototype, which deepEqual reports as unequal.
    const read = (key) => {
        const value = store.get(keys[key]);
        return Array.isArray(value) ? [...value] : value;
    };
    return { obj, store, keys, read };
}

// A real default key flipped, so the import has a known setting to apply.
const VALID_BACKUP = JSON.stringify({
    exportVersion: 3,
    settings: { hideCreateButton: false },
    hiddenVideos: ['abcdefghijk'],
    blockedChannels: ['UC123'],
    bookmarks: {}
});

test('settingsManager.importAllSettingsDetailed returns a result object, not a bare boolean', async () => {
    const { obj, read } = loadSettingsManager();
    assert.equal(typeof obj.importAllSettingsDetailed, 'function', 'importAllSettingsDetailed must be defined on the singleton');
    const result = await obj.importAllSettingsDetailed(VALID_BACKUP);
    assert.ok(result && typeof result === 'object', 'must return a result object');
    assert.equal(result.ok, true, result.message);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0, 'a successful import must explain what it imported');
    assert.equal(read('settings')?.hideCreateButton, false, 'the import must actually persist settings');
});

test('settingsManager.importAllSettingsDetailed reports a message on malformed input', async () => {
    const { obj } = loadSettingsManager();
    for (const bad of ['not json at all', '[]', '{}']) {
        const result = await obj.importAllSettingsDetailed(bad);
        assert.ok(result && typeof result === 'object', `must return an object for ${bad}`);
        assert.equal(result.ok, false);
        assert.equal(typeof result.message, 'string');
        assert.ok(result.message.length > 0, 'a failed import must say why');
    }
});

test('settingsManager.importAllSettings still answers a boolean for legacy callers', async () => {
    const { obj } = loadSettingsManager();
    assert.equal(await obj.importAllSettings(VALID_BACKUP), true);
    assert.equal(await obj.importAllSettings('garbage'), false);
});

test('settingsManager.undoLastSettingsImport restores the pre-import snapshot', async () => {
    const { obj, store, keys, read } = loadSettingsManager();
    store.set(keys.hiddenVideos, ['originalvid']);

    const before = await obj.undoLastSettingsImport();
    assert.ok(before && typeof before === 'object', 'undo must return a result object even with nothing to undo');
    assert.equal(before.ok, false, 'no import yet, so there is nothing to undo');

    await obj.importAllSettingsDetailed(VALID_BACKUP);
    assert.deepEqual(read('hiddenVideos'), ['abcdefghijk'], 'import applied');

    const undone = await obj.undoLastSettingsImport();
    assert.ok(undone && typeof undone === 'object');
    assert.equal(undone.ok, true, undone.message);
    assert.equal(typeof undone.message, 'string');
    assert.deepEqual(read('hiddenVideos'), ['originalvid'], 'undo must restore the pre-import list');
});

test('settingsManager.importYouTubeTakeoutWatchHistory returns a result object and merges entries', () => {
    const { obj, read } = loadSettingsManager();
    assert.equal(typeof obj.importYouTubeTakeoutWatchHistory, 'function', 'importYouTubeTakeoutWatchHistory must be defined on the singleton');

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
    assert.ok(read('watchTime').total > 0, 'imported seconds must land in the watch-time store');
});

test('Takeout re-import is idempotent — the same file cannot double-count', () => {
    const { obj, read } = loadSettingsManager();
    const recent = new Date();
    recent.setDate(recent.getDate() - 1);
    const takeout = JSON.stringify([
        { titleUrl: 'https://www.youtube.com/watch?v=abcdefghijk', time: recent.toISOString(), title: 'One' },
        { titleUrl: 'https://www.youtube.com/watch?v=bbcdefghijk', time: recent.toISOString(), title: 'Two' }
    ]);

    const first = obj.importYouTubeTakeoutWatchHistory(takeout);
    assert.equal(first.imported, 2);
    const totalAfterFirst = read('watchTime').total;

    const second = obj.importYouTubeTakeoutWatchHistory(takeout);
    assert.equal(second.imported, 0, 'a re-import must import nothing new');
    assert.equal(second.duplicates, 2);
    assert.equal(read('watchTime').total, totalAfterFirst, 'the total must not grow on re-import');
});

test('settingsManager.importYouTubeTakeoutWatchHistory reports empty and malformed payloads', () => {
    const { obj } = loadSettingsManager();
    const empty = obj.importYouTubeTakeoutWatchHistory('[]');
    assert.equal(empty.ok, false);
    assert.match(empty.message, /No valid/i);

    const broken = obj.importYouTubeTakeoutWatchHistory('{{{');
    assert.equal(broken.ok, false);
    assert.equal(typeof broken.message, 'string');
});
