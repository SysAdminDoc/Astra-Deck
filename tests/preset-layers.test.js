'use strict';

// Privacy and Focus both own removeAllShorts and disableInfiniteScroll. Each
// kept its own backup, so turning Privacy off brought Shorts back while Focus
// was still on, and turning the second preset off restored the first preset's
// recipe value (or wiped the user's own edit) instead of the real baseline.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadDeclarations, loadFeature } = require('./helpers/monolith');

const BASELINE = Object.freeze({
    removeAllShorts: false,
    redirectShorts: false,
    disableInfiniteScroll: false,
    hideRelatedVideos: false,
    cleanShareUrls: false,
    hideAiSummary: true
});

function world() {
    const storage = new Map();
    const writes = [];
    const appState = { settings: { ...BASELINE } };
    const featureIndex = new Map();
    const helpers = loadDeclarations(['PRESET_EXPLICIT_KEYS', 'activePresetLayers', 'buildPresetRecipeUpdate', 'buildPresetRestoreUpdate'], {
        appState,
        featureIndex
    });
    // A "tab" is a fresh set of preset objects over the same storage and
    // settings, which is all a reload or another tab shares.
    const openTab = () => {
        const globals = {
            appState,
            storageReadJSON: (key, fallback) => (storage.has(key) ? JSON.parse(storage.get(key)) : fallback),
            storageWriteJSON: (key, value, options) => {
                writes.push({ key, options });
                storage.set(key, JSON.stringify(value));
            },
            commitPresetSettings: (next) => { appState.settings = next; },
            buildPresetRecipeUpdate: helpers.buildPresetRecipeUpdate,
            buildPresetRestoreUpdate: helpers.buildPresetRestoreUpdate,
            t: (_key, fallback) => fallback,
            DebugManager: { log() {} }
        };
        const tab = { privacy: loadFeature('presetPrivacy', globals), focus: loadFeature('presetFocus', globals) };
        featureIndex.clear();
        for (const feature of Object.values(tab)) featureIndex.set(feature.id, feature);
        return tab;
    };
    // The reconciler flips the preset's own setting before running init or
    // destroy, the same order a settings toggle takes.
    const turnOn = (tab, name) => { appState.settings[tab[name].id] = true; tab[name].init(); };
    const turnOff = (tab, name) => { appState.settings[tab[name].id] = false; tab[name].destroy(); };
    return { appState, storage, writes, openTab, turnOn, turnOff };
}

function pick(settings) {
    return Object.fromEntries(Object.keys(BASELINE).map((key) => [key, settings[key]]));
}

for (const order of [['privacy', 'focus'], ['focus', 'privacy']]) {
    test(`turning presets off ${order.join(' then ')} keeps what the other owns and the user's own edits`, () => {
        const w = world();
        let tab = w.openTab();
        w.turnOn(tab, 'privacy');
        w.turnOn(tab, 'focus');
        assert.equal(w.appState.settings.removeAllShorts, true);
        // The user's own edits while both are on: one turns a recipe key off,
        // one turns off a key that was already on before either preset.
        w.appState.settings.disableInfiniteScroll = false;
        w.appState.settings.hideAiSummary = false;

        tab = w.openTab(); // a reload keeps the layers: they live in storage
        const [first, second] = order;
        w.turnOff(tab, first);
        const still = second === 'focus' ? tab.focus._RECIPE : tab.privacy._RECIPE;
        assert.equal(w.appState.settings.removeAllShorts, true, `${second} still removes Shorts`);
        assert.equal(w.appState.settings.redirectShorts, true, `${second} still redirects Shorts`);
        assert.equal(w.appState.settings.hideRelatedVideos, still.hideRelatedVideos === true,
            'a key only the removed preset owned returns to its baseline');
        assert.equal(w.appState.settings.cleanShareUrls, still.cleanShareUrls === true);
        assert.equal(w.appState.settings.disableInfiniteScroll, false, 'the explicit edit survives');
        assert.equal(w.appState.settings.hideAiSummary, false, 'the explicit edit survives');

        w.turnOff(w.openTab(), second);
        assert.deepEqual(pick(w.appState.settings), { ...BASELINE, hideAiSummary: false },
            'with every preset off the baseline is back, except what the user changed');
    });
}

test('a preset that is the only owner restores the baseline exactly as before', () => {
    const w = world();
    const tab = w.openTab();
    w.turnOn(tab, 'focus');
    w.turnOff(tab, 'focus');
    assert.deepEqual(pick(w.appState.settings), { ...BASELINE });
});

test('a backup record left behind by a preset that is off is not a layer', () => {
    const w = world();
    // Privacy was turned off with no YouTube tab open, so its record stayed.
    w.storage.set('ytkit-preset-privacy-backup', JSON.stringify({ removeAllShorts: false, redirectShorts: false, disableInfiniteScroll: false }));
    w.appState.settings.presetPrivacy = false;
    const tab = w.openTab();
    w.turnOn(tab, 'focus');
    w.turnOff(tab, 'focus');
    assert.deepEqual(pick(w.appState.settings), { ...BASELINE },
        'the orphan must neither hold Focus\'s keys nor lend Focus its stale baseline');
});

test('an edit made under one preset survives a second preset coming and going', () => {
    const w = world();
    const tab = w.openTab();
    w.turnOn(tab, 'privacy');
    w.appState.settings.removeAllShorts = false; // the user wants Shorts back
    w.turnOn(tab, 'focus');
    assert.equal(w.appState.settings.removeAllShorts, true, 'Focus applies its recipe');
    w.turnOff(tab, 'focus');
    assert.equal(w.appState.settings.removeAllShorts, false, 'the edit comes back, not Privacy\'s recipe');
    assert.equal(w.appState.settings.redirectShorts, true, 'a key Privacy still holds stays');
    assert.equal(Object.hasOwn(w.appState.settings, '__presetExplicit'), false, 'the marker never reaches settings');
});

test('preset backup records are written straight through, ahead of the settings change', () => {
    // Another tab reacts to the settings change. If the record were still
    // sitting in the write debounce, that tab would find none and snapshot
    // the recipe itself as the baseline.
    const w = world();
    const tab = w.openTab();
    w.turnOn(tab, 'privacy');
    w.turnOff(tab, 'privacy');
    const backupWrites = w.writes.filter((entry) => entry.key === 'ytkit-preset-privacy-backup');
    assert.equal(backupWrites.length, 2);
    for (const entry of backupWrites) assert.equal(entry.options?.immediate, true);
});
