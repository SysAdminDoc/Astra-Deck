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
    const appState = { settings: { ...BASELINE } };
    const featureIndex = new Map();
    const helpers = loadDeclarations(['activePresetLayers', 'buildPresetRecipeUpdate', 'buildPresetRestoreUpdate'], {
        appState,
        featureIndex
    });
    // A "tab" is a fresh set of preset objects over the same storage and
    // settings, which is all a reload or another tab shares.
    const openTab = () => {
        const globals = {
            appState,
            storageReadJSON: (key, fallback) => (storage.has(key) ? JSON.parse(storage.get(key)) : fallback),
            storageWriteJSON: (key, value) => { storage.set(key, JSON.stringify(value)); },
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
    return { appState, openTab };
}

function pick(settings) {
    return Object.fromEntries(Object.keys(BASELINE).map((key) => [key, settings[key]]));
}

for (const order of [['privacy', 'focus'], ['focus', 'privacy']]) {
    test(`turning presets off ${order.join(' then ')} keeps what the other owns and the user's own edits`, () => {
        const w = world();
        let tab = w.openTab();
        tab.privacy.init();
        tab.focus.init();
        assert.equal(w.appState.settings.removeAllShorts, true);
        // The user's own edits while both are on: one turns a recipe key off,
        // one turns off a key that was already on before either preset.
        w.appState.settings.disableInfiniteScroll = false;
        w.appState.settings.hideAiSummary = false;

        tab = w.openTab(); // a reload keeps the layers: they live in storage
        const [first, second] = order;
        tab[first].destroy();
        const still = second === 'focus' ? tab.focus._RECIPE : tab.privacy._RECIPE;
        assert.equal(w.appState.settings.removeAllShorts, true, `${second} still removes Shorts`);
        assert.equal(w.appState.settings.redirectShorts, true, `${second} still redirects Shorts`);
        assert.equal(w.appState.settings.hideRelatedVideos, still.hideRelatedVideos === true,
            'a key only the removed preset owned returns to its baseline');
        assert.equal(w.appState.settings.cleanShareUrls, still.cleanShareUrls === true);
        assert.equal(w.appState.settings.disableInfiniteScroll, false, 'the explicit edit survives');
        assert.equal(w.appState.settings.hideAiSummary, false, 'the explicit edit survives');

        w.openTab()[second].destroy();
        assert.deepEqual(pick(w.appState.settings), { ...BASELINE, hideAiSummary: false },
            'with every preset off the baseline is back, except what the user changed');
    });
}

test('a preset that is the only owner restores the baseline exactly as before', () => {
    const w = world();
    const tab = w.openTab();
    tab.focus.init();
    tab.focus.destroy();
    assert.deepEqual(pick(w.appState.settings), { ...BASELINE });
});
