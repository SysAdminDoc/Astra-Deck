'use strict';

// An in-page settings save reaches chrome.storage through the service worker,
// which writes {...stored, ...changes}; chrome.storage then hands the value
// back with every object's keys sorted. The page used to remember its own
// full snapshot byte for byte, so no echo ever matched and each one ran as an
// outside change. With two saves in flight (the load() migration save, then
// the startup conflict skip) the first echo rolled the page back: Audio-Only
// was started over Always Best Quality and torn down again 20 ms later.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadDeclarations } = require('./helpers/monolith');
const { sources } = require('./helpers/source');

const SETTINGS_KEY = 'ytSuiteSettings';

function loadStorageCache() {
    const sandbox = { YTKitCore: {} };
    const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'storage-manager.js'), 'utf8');
    new Function('globalThis', src)(sandbox);
    return sandbox.YTKitCore.createStorageCache({ echoTtlMs: 500 });
}

// What chrome.storage returns: keys sorted at every depth.
function asStored(value) {
    if (Array.isArray(value)) return value.map(asStored);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, asStored(value[key])]));
}

function loadHandler() {
    const StorageManager = loadStorageCache();
    const applied = [];
    const api = loadDeclarations(['settingsEchoForm', 'handleExternalStorageChanges'], {
        StorageManager,
        STORAGE_KEYS: { settings: SETTINGS_KEY },
        settingsManager: {
            defaults: { autoMaxResolution: true, audioOnlyPlayback: false, listFeedLayout: false, _errors: [] },
            _sanitize: (settings) => ({ ...settings })
        },
        applyExternalSettingsUpdate: (update) => applied.push(update),
        getFeatureById: () => null,
        syncSettingsPanelControls: () => {},
        updateAllToggleStates: () => {},
        DebugManager: { log() {} }
    });
    // The same call settingsManager.save() makes before handing changes to the worker.
    const rememberSave = (snapshot) => StorageManager._rememberLocalWrite(SETTINGS_KEY, api.settingsEchoForm(snapshot));
    return { ...api, applied, rememberSave };
}

test('a worker echo of an in-page save is consumed, not applied as an outside change', () => {
    const { handleExternalStorageChanges, applied, rememberSave } = loadHandler();
    const migrationEntry = { ts: 1791324179187, ctx: 'settings-migration', msg: 'load: applied settings migration v2 (1 -> 11)' };
    // Save 1: load() persists the migration. Save 2: startup skips the
    // conflicting Audio-Only and persists it off.
    const migrated = { autoMaxResolution: true, audioOnlyPlayback: true, listFeedLayout: false, _errors: [migrationEntry] };
    const skipped = { ...migrated, audioOnlyPlayback: false };
    rememberSave(migrated);
    rememberSave(skipped);

    // The stored copy lacks a default the page filled in, and comes back sorted.
    const { listFeedLayout: _omitted, ...storedMigrated } = migrated;
    const echo1 = asStored(storedMigrated);
    assert.notEqual(JSON.stringify(echo1), JSON.stringify(migrated), 'the echo must differ byte for byte, or this proves nothing');

    handleExternalStorageChanges({ [SETTINGS_KEY]: { oldValue: {}, newValue: echo1 } }, 'chrome-storage');
    handleExternalStorageChanges({ [SETTINGS_KEY]: { oldValue: echo1, newValue: asStored({ ...storedMigrated, audioOnlyPlayback: false }) } }, 'chrome-storage');
    assert.deepEqual(applied, [], 'neither echo may roll the page back or forward');
});

test('an outside settings change is still applied', () => {
    const { handleExternalStorageChanges, applied, rememberSave } = loadHandler();
    rememberSave({ autoMaxResolution: true, audioOnlyPlayback: false, listFeedLayout: false, _errors: [] });

    const fromPopup = asStored({ autoMaxResolution: false, audioOnlyPlayback: false, _errors: [] });
    handleExternalStorageChanges({ [SETTINGS_KEY]: { oldValue: {}, newValue: fromPopup } }, 'chrome-storage');
    assert.equal(applied.length, 1);
    assert.equal(applied[0].nextSettings.autoMaxResolution, false);
});

test('settingsManager.save remembers the echo form it will be compared against', () => {
    assert.match(sources.ytkit, /StorageManager\._rememberLocalWrite\(STORAGE_KEYS\.settings, settingsEchoForm\(nextSettings\)\)/);
});
