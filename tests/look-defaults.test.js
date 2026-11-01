'use strict';

// #52: a fresh install used to land on square corners, no sidebar, no related
// videos and a restyled watch page before anyone had picked anything. The look
// is opt-in now. The other half matters just as much: nobody who already had a
// profile may see a single thing change, whether their saved bag held the key or
// only ever inherited the default.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findBalancedObjectLiteral } = require('../scripts/catalog-utils');
const schema = require('../extension/core/settings-schema.js');
const { createLookPresetFeatures, LOOKS } = require('../extension/features/look-presets/index.js');
const { loadDeclarations } = require('./helpers/monolith');

const repoRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const ytkitSource = read('extension', 'ytkit.js');
const popupSource = read('extension', 'popup.js');
const defaultSettings = JSON.parse(read('extension', 'default-settings.json'));

const { LEGACY_LOOK_DEFAULTS, CURRENT_LOOK_DEFAULTS, seedLegacyLookDefaults } = schema;
const LOOK_KEYS = Object.keys(LEGACY_LOOK_DEFAULTS);

function createSettingsManager() {
    const literal = findBalancedObjectLiteral(ytkitSource, 'const settingsManager =');
    assert.ok(literal, 'settingsManager must be extractable from ytkit.js');
    return Function(
        'isPlainObject', 'isSafeObjectKey', 'RETIRED_SETTING_KEYS', 'DiagnosticLog', 'DebugManager',
        `"use strict"; return (${literal});`
    )(
        (value) => !!value && typeof value === 'object' && !Array.isArray(value),
        (key) => key !== '__proto__' && key !== 'prototype' && key !== 'constructor',
        new Set(),
        { record() {} },
        { log() {} }
    );
}

const pick = (settings) => Object.fromEntries(LOOK_KEYS.map((key) => [key, settings[key]]));
// What a page ends up with: load() lays the migrated bag over the defaults.
const rendered = (manager, saved, ...args) => pick({ ...manager.defaults, ...manager._migrate({ ...saved }, ...args) });

test('all three default catalogs moved every look key, and only look keys carry a legacy value', () => {
    const manager = createSettingsManager();
    assert.ok(LOOK_KEYS.length >= 18, 'the bundle the migration protects did not shrink');
    for (const key of LOOK_KEYS) {
        const current = CURRENT_LOOK_DEFAULTS[key];
        assert.notDeepEqual(current, LEGACY_LOOK_DEFAULTS[key], `${key} must actually have moved`);
        assert.deepEqual(manager.defaults[key], current, `ytkit.js defaults: ${key}`);
        assert.deepEqual(defaultSettings[key], current, `default-settings.json: ${key}`);
        assert.deepEqual(schema.findSettingEntry(key)?.defaultValue, current, `schema: ${key}`);
    }
});

test('a fresh install renders the new defaults, even after the popup wrote to its bag first', () => {
    const manager = createSettingsManager();
    assert.deepEqual(rendered(manager, {}), CURRENT_LOOK_DEFAULTS, 'nothing stored');
    // The welcome flow writes a preset or profile key before the first tab load.
    // The popup does not stamp, so this bag has never been through a page.
    assert.deepEqual(rendered(manager, { githubFullProfile: false, presetPrivacy: true }), CURRENT_LOOK_DEFAULTS,
        'an unstamped bag on a page load is still a fresh install');
});

test('a stored profile keeps its look through the upgrade, sparse or full', () => {
    const manager = createSettingsManager();
    for (const version of [1, 5, 10, 11]) {
        assert.deepEqual(rendered(manager, { _settingsVersion: version }), LEGACY_LOOK_DEFAULTS,
            `a sparse v${version} bag inherited the old defaults, and must keep rendering them`);
        assert.deepEqual(rendered(manager, { _settingsVersion: version, ...LEGACY_LOOK_DEFAULTS }), LEGACY_LOOK_DEFAULTS,
            `a full v${version} bag holds them outright`);
    }
});

test('an explicit choice always beats the seed, in both directions', () => {
    const manager = createSettingsManager();
    const explicit = { hideSidebar: false, uiStyle: 'rounded', stickyVideo: false, restoreNativeYouTubeUi: true };
    const after = rendered(manager, { _settingsVersion: 11, ...explicit });
    assert.deepEqual(after, { ...LEGACY_LOOK_DEFAULTS, ...explicit });
    const seeded = seedLegacyLookDefaults({ squareAvatars: false });
    assert.equal(seeded.squareAvatars, false);
    assert.equal(seeded.squareSearchBar, true);
});

test('a profile already at v12 is left on the current defaults, so the migration runs once', () => {
    const manager = createSettingsManager();
    assert.equal(manager.SETTINGS_VERSION >= 12, true);
    assert.deepEqual(rendered(manager, { _settingsVersion: 12 }), CURRENT_LOOK_DEFAULTS);
    // Turning the old look off after the upgrade has to stay off on the next load.
    const once = manager._migrate({ _settingsVersion: 11 });
    delete once.squareAvatars;
    once.hideSidebar = false;
    const again = rendered(manager, once);
    assert.equal(again.hideSidebar, false);
    assert.equal(again.squareAvatars, false, 'a v12 bag with no key takes the current default');
});

test('importing a backup keeps the look it was exported with', () => {
    const manager = createSettingsManager();
    assert.deepEqual(rendered(manager, {}, 'profile-import'), LEGACY_LOOK_DEFAULTS,
        'a backup with no version at all is an old one');
    assert.deepEqual(rendered(manager, {}, 'profile-import', { backupSchemaVersion: 11 }), LEGACY_LOOK_DEFAULTS);
    assert.deepEqual(rendered(manager, {}, 'profile-import', { backupSchemaVersion: 12 }), CURRENT_LOOK_DEFAULTS,
        'a v12 backup from a fresh install stays on the new look');
});

test('the popup import path applies the same migration, with its version in lockstep', () => {
    assert.match(popupSource, /const SETTINGS_VERSION_FALLBACK = 12;/);
    const literal = findBalancedObjectLiteral(popupSource, 'const SETTINGS_IMPORT_MIGRATIONS =');
    assert.ok(literal, 'SETTINGS_IMPORT_MIGRATIONS must be extractable from popup.js');
    const migrations = Function('RETIRED_SETTING_KEYS', `"use strict"; return (${literal});`)(new Set());
    const migrated = migrations[12]({ squareAvatars: false });
    assert.deepEqual(pick(migrated), { ...LEGACY_LOOK_DEFAULTS, squareAvatars: false });
});

// ── the two look presets ─────────────────────────────────────────────

function presetWorld(startingSettings) {
    const storage = new Map();
    const appState = { settings: { ...startingSettings } };
    const featureIndex = new Map();
    const toasts = [];
    const helpers = loadDeclarations(
        ['PRESET_EXPLICIT_KEYS', 'activePresetLayers', 'buildPresetRecipeUpdate', 'buildPresetRestoreUpdate'],
        { appState, featureIndex }
    );
    const features = createLookPresetFeatures({
        storageReadJSON: (key, fallback) => (storage.has(key) ? JSON.parse(storage.get(key)) : fallback),
        storageWriteJSON: (key, value) => {
            if (value === null) storage.delete(key);
            else storage.set(key, JSON.stringify(value));
        },
        buildPresetRecipeUpdate: helpers.buildPresetRecipeUpdate,
        buildPresetRestoreUpdate: helpers.buildPresetRestoreUpdate,
        commitPresetSettings: (next) => { appState.settings = next; },
        showToast: (message) => toasts.push(message),
        t: (_key, fallback) => fallback,
        astraRecipe: LEGACY_LOOK_DEFAULTS,
        classicRecipe: CURRENT_LOOK_DEFAULTS
    });
    for (const feature of features) featureIndex.set(feature.id, feature);
    const toggle = (id, on) => {
        appState.settings[id] = on;
        const feature = featureIndex.get(id);
        if (on) feature.init();
        else feature.destroy();
    };
    return { appState, storage, features, toggle, toasts };
}

test('Astra Look brings the old look to a fresh install and turning it off undoes it', () => {
    const w = presetWorld(CURRENT_LOOK_DEFAULTS);
    w.toggle('presetAstraLook', true);
    assert.deepEqual(pick(w.appState.settings), LEGACY_LOOK_DEFAULTS);
    assert.equal(w.toasts.length, 1, 'the toggle says what it did');
    w.toggle('presetAstraLook', false);
    assert.deepEqual(pick(w.appState.settings), CURRENT_LOOK_DEFAULTS);
    assert.equal(w.storage.size, 0, 'no backup record is left behind');
});

test('Classic YouTube gives a migrated profile the new look in one click and turning it off undoes it', () => {
    const w = presetWorld(LEGACY_LOOK_DEFAULTS);
    w.toggle('presetClassicLook', true);
    assert.deepEqual(pick(w.appState.settings), CURRENT_LOOK_DEFAULTS);
    w.toggle('presetClassicLook', false);
    assert.deepEqual(pick(w.appState.settings), LEGACY_LOOK_DEFAULTS);
});

test('an edit made while a look is on survives turning the look off', () => {
    const w = presetWorld(LEGACY_LOOK_DEFAULTS);
    w.toggle('presetClassicLook', true);
    w.appState.settings.stickyVideo = true;
    w.toggle('presetClassicLook', false);
    assert.equal(w.appState.settings.stickyVideo, true);
    assert.equal(w.appState.settings.hideSidebar, true, 'the rest comes back');
});

test('with both looks on, the last one wins and each undo lands on the right values', () => {
    const w = presetWorld(CURRENT_LOOK_DEFAULTS);
    w.toggle('presetAstraLook', true);
    w.toggle('presetClassicLook', true);
    assert.deepEqual(pick(w.appState.settings), CURRENT_LOOK_DEFAULTS, 'Classic was turned on last');
    w.toggle('presetClassicLook', false);
    assert.deepEqual(pick(w.appState.settings), LEGACY_LOOK_DEFAULTS, 'Astra Look is still on');
    w.toggle('presetAstraLook', false);
    assert.deepEqual(pick(w.appState.settings), CURRENT_LOOK_DEFAULTS, 'back to what was there before either');
});

test('each look is a real, registered setting with a backup record the backup system knows about', () => {
    const allDomains = read('extension', 'core', 'persisted-domains.js');
    for (const look of LOOKS) {
        assert.equal(schema.findSettingEntry(look.id)?.defaultValue, false, `${look.id} starts off`);
        assert.equal(defaultSettings[look.id], false, `default-settings.json: ${look.id}`);
        assert.ok(allDomains.includes(look.backupKey), `${look.backupKey} goes through backup and restore`);
    }
    assert.match(ytkitSource, /createLookPresetFeatures\?\.\(\{/, 'ytkit.js registers the module');
});

test('the Theme pane opens on the look controls, in the sections they belong to', () => {
    const { SETTINGS_CATEGORY_SECTIONS } = require('../extension/core/settings-visual-system.js');
    const sections = SETTINGS_CATEGORY_SECTIONS.Theme;
    const sectionFor = (id) => sections.find((section) => section.match.test(id))?.labelKey;
    for (const id of ['presetClassicLook', 'presetAstraLook', 'restoreNativeYouTubeUi']) {
        assert.equal(sectionFor(id), 'settingsSectionStartingLook', id);
    }
    for (const id of ['uiStyleManager', 'squareAvatars', 'squareSearchBar']) {
        assert.equal(sectionFor(id), 'settingsSectionShape', id);
    }
    assert.equal(sections[0].labelKey, 'settingsSectionStartingLook');
    assert.equal(SETTINGS_CATEGORY_SECTIONS['Home / Subscriptions'].some((section) => section.labelKey === 'settingsSectionHeader' && section.match.test('squareSearchBar')), false,
        'the search bar shape moved out of Header with the other corners');
});

test('the welcome flow offers Astra Look, so a new user finds it without reading every setting', () => {
    const popupHtml = read('extension', 'popup.html');
    assert.match(popupHtml, /data-preset="presetAstraLook"/);
    const en = JSON.parse(read('extension', '_locales', 'en', 'messages.json'));
    for (const key of ['welcomePresetAstraLookTitle', 'welcomePresetAstraLookDesc', 'settingsSectionStartingLook', 'settingsSectionShape']) {
        assert.ok(en[key]?.message, `${key} needs English copy`);
    }
});

test('Square Search Bar names the box YouTube draws today', () => {
    const block = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8')
        .split('\n')
        .find((line) => line.includes('.ytSearchboxComponentInputBox') && line.includes('border-radius: 0'));
    assert.ok(block, 'the rule must round off the input box');
    assert.ok(block.includes('.ytSearchboxComponentSearchButton'), 'and the button beside it');
});
