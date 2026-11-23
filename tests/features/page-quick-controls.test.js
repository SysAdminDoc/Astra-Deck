'use strict';

// The per-page Quick Controls modal (the sliders button beside the gear).
// A card whose id names no feature is dropped without a word, so a typo or a
// renamed feature quietly shrinks the panel; these tests read the real config.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadDeclarations, loadUserscriptDeclarations, fakeTreeDocument, fakeNode } = require('../helpers/monolith');
const schema = require('../../extension/core/settings-schema');

const EXTENSION_DIR = path.join(__dirname, '..', '..', 'extension');

function featureSources() {
    const files = [path.join(EXTENSION_DIR, 'ytkit.js')];
    const featuresDir = path.join(EXTENSION_DIR, 'features');
    for (const entry of fs.readdirSync(featuresDir, { withFileTypes: true })) {
        const index = path.join(featuresDir, entry.name, 'index.js');
        if (entry.isDirectory() && fs.existsSync(index)) files.push(index);
    }
    return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

test('every Quick Controls card names a real feature it can actually set', () => {
    const { PAGE_MODAL_CONFIG } = loadDeclarations(['PAGE_MODAL_CONFIG']);
    const sources = featureSources();
    const settingTypes = new Map(schema.SETTINGS_SCHEMA.map((entry) => [entry.key, entry.type]));
    for (const [page, cards] of Object.entries(PAGE_MODAL_CONFIG)) {
        assert.ok(cards.length, `${page} has cards`);
        for (const { id } of cards) {
            const at = sources.indexOf(`id: '${id}'`);
            assert.ok(at > -1, `${page} card "${id}" must name a defined feature`);
            const type = settingTypes.get(id);
            if (type === 'boolean') continue;
            // Anything else is drawn as a dropdown, which needs the feature to
            // list its values and keep the choice under its own id.
            const head = sources.slice(at, sources.indexOf('init(', at));
            assert.match(head, /type: 'select'/, `${page} card "${id}" holds a ${type}, so its feature must list choices`);
            assert.doesNotMatch(head, /settingKey:/, `${page} card "${id}" must store its choice under its own id`);
        }
    }
});

test('Videos Per Row is a dropdown that saves the number picked', async () => {
    const documentRef = fakeTreeDocument();
    const calls = [];
    const features = [
        {
            id: 'videosPerRow', name: 'Videos Per Row', type: 'select',
            options: { '0': 'Dynamic', '4': '4', '5': '5' },
            _initialized: true,
            init() { calls.push('init'); },
            destroy() { calls.push('destroy'); }
        },
        { id: 'hideNewsHome', name: 'Hide News', _initialized: false, init() {}, destroy() {} }
    ];
    // true is what the old switch card left behind.
    const appState = { settings: { videosPerRow: true, hideNewsHome: false } };
    const saved = [];
    const api = loadUserscriptDeclarations([
        'tCount', 'CONFLICT_MAP', 'clearPendingPageModalRemoval', 'updatePageModalEnabledCount', 'closePageModal', 'openPageModal'
    ], {
        document: documentRef,
        features,
        appState,
        _pageModalOpen: false,
        _pageModalEl: null,
        _pageModalOverlay: null,
        _pageModalLastFocus: null,
        _pageModalRemovalTimer: null,
        _pageModalPendingRemoval: [],
        _pageModalNavCleanup: null,
        getCurrentPage: () => 'home',
        getFeatureById: (id) => features.find((entry) => entry.id === id) || null,
        getFeatureName: (entry) => entry?.name || '',
        getFeatureDescription: () => '',
        getFocusableUiElements: () => [],
        setSettingsPanelOpen() {},
        HTMLElement: class {},
        BRAND: { name: 'Astra Deck' },
        PAGE_MODAL_PAGE_MAP: { home: 'home' },
        PAGE_MODAL_CONFIG: { home: [{ id: 'videosPerRow', label: 'Videos Per Row' }, { id: 'hideNewsHome', label: 'Hide News' }] },
        PAGE_MODAL_META: {},
        PAGE_LABELS: { home: 'Home' },
        ICONS: new Proxy({}, { get: () => () => fakeNode() }),
        requestAnimationFrame: (fn) => fn(),
        setTimeout: () => 0,
        clearTimeout() {},
        settingsManager: { save: (next) => { saved.push({ ...next }); return { ok: true }; } },
        applyExternalSettingsUpdate: ({ nextSettings }) => {
            const changed = nextSettings.videosPerRow !== appState.settings.videosPerRow;
            appState.settings = { ...nextSettings };
            if (changed) { calls.push('destroy'); calls.push('init'); }
        },
        showToast() {},
        t: (key, fallback) => fallback,
        DebugManager: { log() {} },
        __YTKIT_SETTINGS_SCHEMA__: schema
    });
    api.openPageModal();
    const card = documentRef.querySelector('.ytkit-pm-card[data-fid="videosPerRow"]');
    assert.ok(card, 'the Videos Per Row card renders');
    assert.equal(card.getAttribute('role'), null, 'a dropdown card is not announced as a switch');
    assert.equal(card.listeners?.get('click')?.size ?? 0, 0, 'clicking the card no longer flips the setting');
    const select = card.querySelector('select');
    assert.ok(select, 'the card holds a dropdown');
    assert.deepEqual([...select.querySelectorAll('option')].map((node) => node.value), ['0', '4', '5']);

    select.value = '5';
    await select.listeners.get('change').values().next().value({});
    assert.equal(saved.at(-1).videosPerRow, 5, 'the number picked is saved as a number');
    assert.equal(typeof appState.settings.videosPerRow, 'number');
    assert.equal(select.value, '5');
    assert.equal(select.disabled, false, 'the dropdown is usable again once the save settles');
    assert.deepEqual(calls, ['destroy', 'init'], 'the layout is rebuilt for the new count');
    assert.equal(documentRef.getElementById('ytkit-pm-enabled-count')?.textContent, '1 Enabled');

    select.value = '0';
    await select.listeners.get('change').values().next().value({});
    assert.equal(saved.at(-1).videosPerRow, 0, 'Dynamic saves 0, not false');
    assert.equal(documentRef.getElementById('ytkit-pm-enabled-count')?.textContent, '0 Enabled');
});
