'use strict';

// The per-page Quick Controls modal (the sliders button beside the gear).
// A row whose id names no feature is dropped without a word, so a typo or a
// renamed feature quietly shrinks the panel; these tests read the real config.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadDeclarations, loadUserscriptDeclarations, fakeTreeDocument, fakeNode } = require('../helpers/monolith');
const schema = require('../../extension/core/settings-schema');

const EXTENSION_DIR = path.join(__dirname, '..', '..', 'extension');
const LOCALES_DIR = path.join(EXTENSION_DIR, '_locales');

function featureSources() {
    const files = [path.join(EXTENSION_DIR, 'ytkit.js')];
    const featuresDir = path.join(EXTENSION_DIR, 'features');
    for (const entry of fs.readdirSync(featuresDir, { withFileTypes: true })) {
        const index = path.join(featuresDir, entry.name, 'index.js');
        if (entry.isDirectory() && fs.existsSync(index)) files.push(index);
    }
    return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

const PAGE_MODAL_TABLES = ['PAGE_MODAL_CONFIG', 'PAGE_MODAL_SECTIONS', 'PAGE_MODAL_PAGE_NAMES'];
const MODAL_FUNCTIONS = ['CONFLICT_MAP', 'clearPendingPageModalRemoval', 'closePageModal', 'openPageModal'];

// openPageModal on the fake tree, with the real tables. `settings` is the
// starting state, `features` the stand-ins getFeatureById hands out, and
// `save` what settingsManager.save returns.
function openModal({ page, pageType, features, settings, save = () => ({ ok: true }), reconcile }) {
    const documentRef = fakeTreeDocument();
    const appState = { settings: { ...settings } };
    const saved = [];
    const toasts = [];
    const tables = loadDeclarations(PAGE_MODAL_TABLES);
    const api = loadUserscriptDeclarations(MODAL_FUNCTIONS, {
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
        getCurrentPage: () => pageType,
        getFeatureById: (id) => features.find((entry) => entry.id === id) || null,
        getFeatureName: (entry) => entry?.name || '',
        getFeatureDescription: (entry) => entry?.description || '',
        getFocusableUiElements: () => [],
        setSettingsPanelOpen() {},
        HTMLElement: class {},
        PAGE_MODAL_PAGE_MAP: { [pageType]: page },
        PAGE_MODAL_CONFIG: tables.PAGE_MODAL_CONFIG,
        PAGE_MODAL_SECTIONS: tables.PAGE_MODAL_SECTIONS,
        PAGE_MODAL_PAGE_NAMES: tables.PAGE_MODAL_PAGE_NAMES,
        ICONS: new Proxy({}, { get: () => () => fakeNode() }),
        requestAnimationFrame: (fn) => fn(),
        setTimeout: () => 0,
        clearTimeout() {},
        settingsManager: { save: (next) => { saved.push({ ...next }); return save(next); } },
        applyExternalSettingsUpdate: reconcile
            ? (update) => reconcile(update, appState)
            : ({ nextSettings }) => { appState.settings = { ...nextSettings }; },
        showToast: (message, color) => toasts.push({ message, color }),
        t: (key, fallback) => fallback,
        DebugManager: { log() {} },
        __YTKIT_SETTINGS_SCHEMA__: schema
    });
    api.openPageModal();
    const rows = new Map(documentRef.querySelectorAll('.ytkit-pm-card').map((node) => [node.dataset.fid, node]));
    return { api, documentRef, appState, saved, toasts, rows };
}

const click = (row) => row.listeners.get('click').values().next().value({});
const change = (select) => select.listeners.get('change').values().next().value({});

test('every Quick Controls row names a real feature it can actually set', () => {
    const { PAGE_MODAL_CONFIG } = loadDeclarations(['PAGE_MODAL_CONFIG']);
    const sources = featureSources();
    const settingTypes = new Map(schema.SETTINGS_SCHEMA.map((entry) => [entry.key, entry.type]));
    const icons = fs.readFileSync(path.join(EXTENSION_DIR, 'core', 'icons.js'), 'utf8');
    for (const [page, rows] of Object.entries(PAGE_MODAL_CONFIG)) {
        assert.ok(rows.length, `${page} has rows`);
        for (const { id, icon } of rows) {
            // An unknown name falls through to the feature's own icon, so a typo
            // would only show as the wrong picture.
            if (icon) assert.match(icons, new RegExp(`['"]?${icon}['"]?: `), `${page} row "${id}" names icon "${icon}"`);
            const at = sources.indexOf(`id: '${id}'`);
            assert.ok(at > -1, `${page} row "${id}" must name a defined feature`);
            const type = settingTypes.get(id);
            if (type === 'boolean') continue;
            // Anything else is drawn as a dropdown, which needs the feature to
            // list its values and keep the choice under its own id.
            const head = sources.slice(at, sources.indexOf('init(', at));
            assert.match(head, /type: 'select'/, `${page} row "${id}" holds a ${type}, so its feature must list choices`);
            assert.doesNotMatch(head, /settingKey:/, `${page} row "${id}" must store its choice under its own id`);
        }
    }
});

test('every name the panel shows is a message every catalogue translates', () => {
    // t() falls back to the English in the code, so a key missing from the
    // catalogues would never fail anywhere; it would just stay English.
    const { PAGE_MODAL_CONFIG, PAGE_MODAL_SECTIONS, PAGE_MODAL_PAGE_NAMES } = loadDeclarations(PAGE_MODAL_TABLES);
    const used = new Map();
    for (const rows of Object.values(PAGE_MODAL_CONFIG)) {
        for (const row of rows) {
            if (row.section) assert.ok(PAGE_MODAL_SECTIONS[row.section], `section "${row.section}" must have a heading`);
            if (row.labelKey) used.set(row.labelKey, row.label);
        }
    }
    for (const [key, fallback] of [...Object.values(PAGE_MODAL_SECTIONS), ...Object.values(PAGE_MODAL_PAGE_NAMES)]) {
        used.set(key, fallback);
    }
    const ytkit = fs.readFileSync(path.join(EXTENSION_DIR, 'ytkit.js'), 'utf8');
    for (const match of ytkit.matchAll(/t\('(pageModal\w+)', '((?:[^'\\]|\\.)*)'\)/g)) {
        used.set(match[1], match[2].replace(/\\'/g, '\''));
    }
    const catalogues = Object.fromEntries(fs.readdirSync(LOCALES_DIR).map((locale) => [
        locale, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8'))
    ]));
    assert.ok(used.size >= 20, 'the scan must find the panel\'s strings');
    for (const [key, fallback] of used) {
        assert.equal(catalogues.en[key]?.message, fallback, `en ${key} must match the code's fallback`);
        for (const [locale, messages] of Object.entries(catalogues)) {
            if (locale === 'en') continue;
            assert.ok(messages[key]?.message, `${locale} must carry ${key}`);
            // Reused keys may match English for real ("Playlists" in French);
            // the panel's own keys were all translated when they were added.
            if (key.startsWith('pageModal')) {
                assert.notEqual(messages[key].message, fallback, `${locale} ${key} is still English`);
            }
        }
    }
});

test('Videos Per Row is a dropdown that saves the number picked', async () => {
    const calls = [];
    const features = [
        { id: 'videosPerRow', name: 'Videos Per Row', type: 'select', options: { '0': 'Dynamic', '4': '4', '5': '5' } },
        { id: 'hideNewsHome', name: 'Hide News' },
        { id: 'hidePlaylistsHome', name: 'Hide Playlists' }
    ];
    // true is what the old switch card left behind.
    const { rows, saved, appState, toasts } = openModal({
        page: 'home', pageType: 'home', features,
        settings: { videosPerRow: true, hideNewsHome: false },
        reconcile: ({ nextSettings }, state) => {
            if (nextSettings.videosPerRow !== state.settings.videosPerRow) calls.push('rebuild');
            state.settings = { ...nextSettings };
        }
    });
    const row = rows.get('videosPerRow');
    assert.ok(row, 'the Videos Per Row row renders');
    assert.equal(row.getAttribute('role'), null, 'a dropdown row is not announced as a switch');
    assert.equal(row.listeners?.get('click')?.size ?? 0, 0, 'clicking the row does not flip the setting');
    const select = row.querySelector('select');
    assert.ok(select, 'the row holds a dropdown');
    assert.deepEqual([...select.querySelectorAll('option')].map((node) => node.value), ['0', '4', '5']);
    assert.equal(row.querySelector('label')?.textContent, 'Videos per row');

    select.value = '5';
    await change(select);
    assert.equal(saved.at(-1).videosPerRow, 5, 'the number picked is saved as a number');
    assert.equal(typeof appState.settings.videosPerRow, 'number');
    assert.equal(select.value, '5');
    assert.equal(row.getAttribute('aria-busy'), null, 'the row is idle again once the save settles');
    assert.deepEqual(calls, ['rebuild'], 'the layout is rebuilt for the new count');

    select.value = '0';
    await change(select);
    assert.equal(saved.at(-1).videosPerRow, 0, 'Dynamic saves 0, not false');
    assert.equal(toasts.length, 0);
});

test('arrowing through the dropdown saves every step in order and never disables it', async () => {
    const features = [{ id: 'videosPerRow', name: 'Videos Per Row', type: 'select', options: { '0': 'Dynamic', '4': '4', '5': '5' } }];
    const pending = [];
    const { rows, saved, appState } = openModal({
        page: 'home', pageType: 'home', features, settings: { videosPerRow: 0 },
        save: () => new Promise((resolve) => pending.push(() => resolve({ ok: true })))
    });
    const row = rows.get('videosPerRow');
    const select = row.querySelector('select');

    select.value = '4';
    const first = change(select);
    select.value = '5';
    const second = change(select);
    assert.equal(row.getAttribute('aria-busy'), 'true', 'the row says it is saving');
    assert.notEqual(select.disabled, true, 'disabling the focused dropdown would throw focus out of the dialog');
    // The second change waits for the first save.
    await Promise.resolve();
    assert.equal(saved.length, 1);
    pending.shift()();
    await first;
    assert.equal(select.value, '5', 'the newer pick is not overwritten while it waits');
    pending.shift()();
    await second;
    assert.deepEqual(saved.map((entry) => entry.videosPerRow), [4, 5]);
    assert.equal(appState.settings.videosPerRow, 5);
    assert.equal(row.getAttribute('aria-busy'), null);
});

test('Subscriptions groups DeArrow, the layout and the feed filters under headings', () => {
    const { PAGE_MODAL_CONFIG } = loadDeclarations(['PAGE_MODAL_CONFIG']);
    const ids = [...PAGE_MODAL_CONFIG.subs].map(({ id }) => id);
    for (const id of ['subscriptionsGrid', 'fullWidthSubscriptions', 'hideVideosFromHome', 'deArrow', 'hidePlannedLivestreams', 'removeAllShorts', 'hideWatchedVideos']) {
        assert.ok(ids.includes(id), `Subscriptions Quick Controls must offer ${id}`);
    }
    assert.equal(new Set(ids).size, ids.length, 'no row appears twice');

    const features = ids.map((id) => ({ id, name: id === 'deArrow' ? 'DeArrow' : id }));
    const { documentRef } = openModal({ page: 'subs', pageType: 'subscriptions', features, settings: {} });
    const sections = documentRef.querySelectorAll('.ytkit-pm-section').map((section) => ({
        heading: section.querySelector('.ytkit-pm-section-title')?.textContent,
        rows: section.querySelectorAll('.ytkit-pm-card').map((node) => node.dataset.fid)
    }));
    assert.deepEqual(sections, [
        { heading: 'Layout', rows: ['subscriptionsGrid', 'fullWidthSubscriptions'] },
        { heading: 'Titles and thumbnails', rows: ['deArrow'] },
        { heading: 'Hide from feed', rows: ['hideVideosFromHome', 'hidePlannedLivestreams', 'removeAllShorts', 'hideWatchedVideos'] }
    ]);
    assert.equal(documentRef.getElementById('ytkit-pm-title')?.textContent, 'Quick controls');
    assert.equal(documentRef.getElementById('ytkit-pm-copy')?.textContent, 'Subscriptions');
});

test('a page with one group shows its rows without a heading', () => {
    const { PAGE_MODAL_CONFIG } = loadDeclarations(['PAGE_MODAL_CONFIG']);
    const features = PAGE_MODAL_CONFIG.channel.map(({ id }) => ({ id, name: id }));
    const { documentRef, rows } = openModal({ page: 'channel', pageType: 'channel', features, settings: {} });
    assert.equal(rows.size, PAGE_MODAL_CONFIG.channel.length);
    assert.equal(documentRef.querySelectorAll('.ytkit-pm-section-title').length, 0);
    assert.equal(documentRef.querySelector('.ytkit-pm-section')?.getAttribute('role'), null,
        'an unnamed group is not announced as one');
});

test('the scheduled-streams row shows them again and DeArrow switches off from the Subscriptions page', async () => {
    const { PAGE_MODAL_CONFIG } = loadDeclarations(['PAGE_MODAL_CONFIG']);
    const calls = [];
    const features = PAGE_MODAL_CONFIG.subs.map(({ id }) => ({
        id,
        name: id === 'deArrow' ? 'DeArrow' : id,
        description: id === 'deArrow' ? 'Replace clickbait titles and thumbnails.' : '',
        _initialized: false
    }));
    const settings = { deArrow: true, hidePlannedLivestreams: true, removeAllShorts: true };
    for (const feature of features) feature._initialized = settings[feature.id] === true;
    const { rows, saved, toasts, documentRef } = openModal({
        page: 'subs', pageType: 'subscriptions', features, settings,
        reconcile: ({ nextSettings }, state) => {
            state.settings = { ...nextSettings };
            for (const entry of features) {
                const on = state.settings[entry.id] === true;
                if (on && !entry._initialized) { entry._initialized = true; calls.push(`init:${entry.id}`); }
                if (!on && entry._initialized) { entry._initialized = false; calls.push(`destroy:${entry.id}`); }
            }
        }
    });
    assert.deepEqual([...rows.keys()].sort(), [...PAGE_MODAL_CONFIG.subs].map(({ id }) => id).sort(), 'one row per configured control');

    const scheduled = rows.get('hidePlannedLivestreams');
    assert.equal(scheduled.getAttribute('role'), 'switch');
    assert.equal(scheduled.getAttribute('aria-checked'), 'true', 'scheduled streams start hidden, the default');
    assert.equal(scheduled.getAttribute('aria-label'), 'Scheduled streams', 'the name is the label; aria-checked carries the state');
    assert.equal(scheduled.querySelector('.ytkit-pm-switch')?.getAttribute('aria-hidden'), 'true');
    await click(scheduled);
    assert.equal(saved.at(-1).hidePlannedLivestreams, false, 'turning the row off is saved');
    assert.equal(scheduled.getAttribute('aria-checked'), 'false');
    assert.equal(scheduled.classList.contains('on'), false);

    const deArrow = rows.get('deArrow');
    assert.equal(deArrow.getAttribute('aria-label'), 'DeArrow');
    const descId = deArrow.getAttribute('aria-describedby');
    assert.ok(descId, 'the description is announced with the switch');
    assert.equal(documentRef.getElementById(descId)?.textContent, 'Replace clickbait titles and thumbnails.');
    assert.equal(deArrow.title, 'Replace clickbait titles and thumbnails.', 'and shown on hover');
    await click(deArrow);
    assert.equal(saved.at(-1).deArrow, false);
    assert.equal(saved.at(-1).hidePlannedLivestreams, false, 'the earlier flip stays saved');
    assert.deepEqual(calls, ['destroy:hidePlannedLivestreams', 'destroy:deArrow'],
        'each row stops only its own feature');
    assert.equal(toasts.length, 0);
});

test('a switch stays focusable while it saves and says so when the save fails', async () => {
    const features = [{ id: 'removeAllShorts', name: 'Hide Shorts' }];
    let finish;
    const { rows, saved, appState, toasts } = openModal({
        page: 'subs', pageType: 'subscriptions', features, settings: { removeAllShorts: false },
        save: () => new Promise((resolve) => { finish = resolve; })
    });
    const row = rows.get('removeAllShorts');
    const pendingClick = click(row);
    assert.equal(row.getAttribute('aria-busy'), 'true');
    assert.notEqual(row.disabled, true, 'a disabled button gives up keyboard focus');
    await click(row);
    assert.equal(saved.length, 1, 'a second press while saving does nothing');

    finish({ ok: false });
    await pendingClick;
    assert.equal(appState.settings.removeAllShorts, false, 'the refused change is rolled back');
    assert.equal(row.getAttribute('aria-checked'), 'false');
    assert.equal(row.getAttribute('aria-busy'), null);
    assert.equal(toasts.length, 1, 'a refused save is not silent');
    assert.match(toasts[0].message, /Couldn't save that change/);
});
