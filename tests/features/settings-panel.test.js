'use strict';

// Behaviour tests for the second-largest feature module (3,419 lines), and the
// one where all five broken userscript calls originated.
//
// settings-panel had no test file of its own. It was covered only indirectly
// via next-monolith-peel.test.js, which pins source text — and a source pin
// cannot tell a working handler from a broken one. These drive the real runtime
// through the factory's own dependency injection.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readUserscriptBuild, userscriptBundles } = require('../helpers/source');

const MODULE_PATH = '../../extension/features/settings-panel/index.js';
const PANEL_OPEN_CLASS = 'ytkit-panel-open';

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    globalThis.YTKitFeatures = originalFeatures;
    return mod;
}

/** A body element whose class list is observable by the tests. */
function fakeBody() {
    const classes = new Set();
    return {
        classes,
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name),
            toggle: (name, force) => (force ? classes.add(name) : classes.delete(name))
        },
        contains: () => false,
        appendChild() {},
        querySelector: () => null,
        querySelectorAll: () => []
    };
}

/**
 * Run a test body with the runtime constructed and a fake document installed.
 * The document has to stay installed for the DURATION of the assertions —
 * isSettingsPanelOpen() reads document.body on every call, not at build time.
 */
function withRuntime(overrides, fn) {
    const body = fakeBody();
    const appState = overrides.appState || { settings: {} };
    const deps = {
        PANEL_OPEN_CLASS,
        appState,
        DebugManager: { log() {} },
        StorageManager: { get: (_k, d) => d, set() {}, setSync: async () => ({ ok: true }) },
        shouldBuildPrimaryUI: () => true,
        buildSettingsPanel: () => null,
        createToast() {},
        injectStyle: () => ({ remove() {} }),
        // Injected, not defined in the module: the runtime cannot classify a
        // feature on its own.
        isBooleanFeature: (feature) => feature?.type === 'checkbox',
        ...overrides
    };
    const originalDocument = globalThis.document;
    globalThis.document = {
        body,
        documentElement: { classList: body.classList, style: {} },
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {},
        activeElement: null
    };
    try {
        fn({ api: loadModule().createSettingsPanelRuntime(deps), body, appState });
    } finally {
        globalThis.document = originalDocument;
    }
}

// ── Panel open/close state ──

test('settingsPanel reads open state from the body class, not an internal flag', () => {
    withRuntime({}, ({ api, body }) => {
        assert.equal(api.isSettingsPanelOpen(), false, 'a fresh page has no panel');

        body.classList.add(PANEL_OPEN_CLASS);
        assert.equal(api.isSettingsPanelOpen(), true,
            'open state must be derived from the DOM, so an external close cannot desync it');

        body.classList.remove(PANEL_OPEN_CLASS);
        assert.equal(api.isSettingsPanelOpen(), false);
    });
});

test('settingsPanel uses the injected open class rather than a hardcoded one', () => {
    withRuntime({ PANEL_OPEN_CLASS: 'custom-open-token' }, ({ api, body }) => {
        body.classList.add('custom-open-token');
        assert.equal(api.isSettingsPanelOpen(), true,
            'the class name is a dependency; hardcoding it would desync the runtime from its host');
    });
});

// ── Enabled-feature counting ──
//
// This drives the sidebar counts. It must count only boolean toggles that are
// actually enabled — a settings-bag miss must not read as "on".

test('settingsPanel counts only enabled boolean features', () => {
    withRuntime({ appState: { settings: { alpha: true, beta: false, gamma: true } } }, ({ api }) => {
        const features = [
            { id: 'alpha', type: 'checkbox' },
            { id: 'beta', type: 'checkbox' },
            { id: 'gamma', type: 'checkbox' },
            { id: 'alpha', type: 'range' }
        ];
        assert.equal(api.countEnabledToggleFeatures(features), 2,
            'exactly the two enabled BOOLEAN features count — the range must not');
    });
});

test('settingsPanel counting tolerates an empty or missing feature list', () => {
    withRuntime({}, ({ api }) => {
        assert.equal(api.countEnabledToggleFeatures([]), 0);
        assert.equal(api.countEnabledToggleFeatures(null), 0,
            'a missing list must count zero rather than throw');
        assert.equal(api.countEnabledToggleFeatures(undefined), 0);
    });
});

test('settingsPanel promotes every actionable Shorts control into Content without mutating features', () => {
    const {
        groupFeaturesBySettingsPresentation,
        resolveSettingsPresentationCategory
    } = loadModule();
    const { SHORTS_PANEL_SETTING_KEYS } = require('../../extension/core/settings-visual-system');
    const features = SHORTS_PANEL_SETTING_KEYS.map((id) => ({
        id,
        group: id === 'disablePlayOnHover'
            ? 'Home / Subscriptions'
            : id.startsWith('shortsDailyLimit') ? 'Advanced' : 'Content',
        isSubFeature: id.startsWith('shortsDailyLimit'),
        parentId: id.startsWith('shortsDailyLimit') ? 'digitalWellbeing' : undefined
    }));
    const originalGroups = features.map((feature) => feature.group);
    const grouped = groupFeaturesBySettingsPresentation(
        features,
        ['Content', 'Home / Subscriptions', 'Advanced'],
        SHORTS_PANEL_SETTING_KEYS
    );

    assert.deepEqual(grouped.Content.map((feature) => feature.id), SHORTS_PANEL_SETTING_KEYS);
    assert.deepEqual(grouped['Home / Subscriptions'], []);
    assert.deepEqual(grouped.Advanced, []);
    assert.deepEqual(features.map((feature) => feature.group), originalGroups,
        'presentation grouping must not rewrite the runtime feature metadata');
    for (const feature of features) {
        assert.equal(resolveSettingsPresentationCategory(feature, SHORTS_PANEL_SETTING_KEYS), 'Content');
    }
});

// The grouping keeps a feature only when its group resolves to one of the
// panel's categories. Seven groups didn't, and the 22 features in them,
// Return YouTube Dislike among them, had no card and no search hit.
test('every group a feature declares lands in a panel category', () => {
    const { resolveSettingsPresentationCategory } = loadModule();
    const extensionRoot = path.join(__dirname, '..', '..', 'extension');
    const panelSource = fs.readFileSync(path.join(extensionRoot, 'features', 'settings-panel', 'index.js'), 'utf8');
    const categoryOrder = JSON.parse(panelSource.match(/const categoryOrder = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
    const sources = [path.join(extensionRoot, 'ytkit.js'),
        ...fs.readdirSync(path.join(extensionRoot, 'features'))
            .map((dir) => path.join(extensionRoot, 'features', dir, 'index.js'))
            .filter((file) => fs.existsSync(file))];
    const groups = new Set();
    // cssFeature(id, name, description, group, ...) takes its group as an
    // argument. Scanning only the object-literal form missed the notification
    // bell's 'Interface', so that card stayed missing with this test green.
    const textArgument = String.raw`(?:'(?:[^'\\]|\\.)*'|t\(\s*'[^']*',\s*'(?:[^'\\]|\\.)*'\s*\))`;
    const cssFeatureGroup = new RegExp(String.raw`cssFeature\(\s*'[^']+',\s*${textArgument},\s*${textArgument},\s*'([^']+)'`, 'g');
    let cssFeatureCalls = 0;
    let cssFeatureGroups = 0;
    for (const file of sources) {
        const source = fs.readFileSync(file, 'utf8');
        for (const [, group] of source.matchAll(/group:\s*'([^']+)'/g)) groups.add(group);
        cssFeatureCalls += (source.match(/\bcssFeature\(\s*'/g) || []).length;
        for (const [, group] of source.matchAll(cssFeatureGroup)) {
            groups.add(group);
            cssFeatureGroups += 1;
        }
    }
    assert.ok(cssFeatureCalls >= 40, `the scan has to see the cssFeature calls, saw ${cssFeatureCalls}`);
    assert.equal(cssFeatureGroups, cssFeatureCalls, 'every cssFeature call has to yield its group, or one can hide here');
    assert.ok(groups.has('Ratings') && groups.has('Interface') && groups.size >= 18,
        'the scan has to see the groups this test was written for');
    const lost = [...groups].filter((group) => !categoryOrder.includes(resolveSettingsPresentationCategory({ group }, [])));
    assert.deepEqual(lost, [], 'give each a category in PANEL_CATEGORY_FOR_GROUP');
});

test('a sub-feature stays under its parent when their group moves to another category', () => {
    const { groupFeaturesBySettingsPresentation } = loadModule();
    const grouped = groupFeaturesBySettingsPresentation([
        { id: 'returnDislike', group: 'Ratings' },
        { id: 'returnDislikeOnCards', group: 'Ratings', isSubFeature: true, parentId: 'returnDislike' }
    ], ['Watch Page'], []);
    assert.deepEqual(grouped['Watch Page'].map((feature) => feature.id), ['returnDislike', 'returnDislikeOnCards']);
});

test('a sub-feature whose own group lands elsewhere goes where its parent goes', () => {
    // Hide End Screen Cards is in Watch Page and its parent in Video Player.
    // A sub-card is only drawn under its parent, so neither page drew it.
    const { groupFeaturesBySettingsPresentation } = loadModule();
    const grouped = groupFeaturesBySettingsPresentation([
        { id: 'hideVideoEndContent', group: 'Video Player' },
        { id: 'hideEndCards', group: 'Watch Page', isSubFeature: true, parentId: 'hideVideoEndContent' },
        { id: 'shortsDailyLimit', group: 'Video Player', isSubFeature: true, parentId: 'hideVideoEndContent' }
    ], ['Video Player', 'Watch Page', 'Content'], ['shortsDailyLimit']);
    assert.deepEqual(grouped['Video Player'].map((feature) => feature.id), ['hideVideoEndContent', 'hideEndCards']);
    assert.deepEqual(grouped['Watch Page'], []);
    assert.deepEqual(grouped.Content.map((feature) => feature.id), ['shortsDailyLimit'],
        'a key the Shorts rule moves still moves');
});

// The real panel build, on the fake tree document from tests/helpers. The
// tests above call the grouping helper; this is the code that draws from it.
// `act` runs against the built panel while its document is still installed.
function buildRealPanel(features, settings = {}, { shortsKeys, act, core, storage, userscriptHost, version = '0.0.0' } = {}) {
    const { fakeTreeDocument } = require('../helpers/monolith');
    const doc = fakeTreeDocument();
    const saved = {
        document: globalThis.document, chrome: globalThis.chrome, YTKitCore: globalThis.YTKitCore, CSS: globalThis.CSS,
        host: globalThis.__astraDeckUserscript
    };
    globalThis.document = doc;
    globalThis.chrome = { i18n: { getUILanguage: () => 'en-US', getMessage: () => '' } };
    globalThis.CSS = { escape: (value) => String(value) };
    // A core another test loaded adds the Shorts ledger card to the build.
    delete globalThis.YTKitCore;
    if (shortsKeys) globalThis.YTKitCore = { SHORTS_PANEL_SETTING_KEYS: shortsKeys };
    if (core) globalThis.YTKitCore = { ...(globalThis.YTKitCore || {}), ...core };
    if (userscriptHost) globalThis.__astraDeckUserscript = userscriptHost;
    else delete globalThis.__astraDeckUserscript;
    try {
        const byId = new Map(features.map((feature) => [feature.id, feature]));
        const noop = () => {};
        const runtime = loadModule().createSettingsPanelRuntime({
            PANEL_OPEN_CLASS,
            BRAND: { name: 'Astra Deck' },
            CATEGORY_CONFIG: {},
            CATEGORY_META: {},
            CONFLICT_MAP: {},
            FEATURE_PREVIEWS: {},
            ICONS: new Proxy({}, { get: () => () => doc.createElement('svg') }),
            LEGACY_STORAGE_KEYS: {},
            STORAGE_KEYS: {},
            YTKIT_VERSION: version,
            _i18n: { overrideLocale: '', locale: 'en', availableLocales: ['en'], messages: {} },
            MediaDLManager: {},
            appState: { settings },
            DebugManager: { log: noop },
            StorageManager: { get: (_key, fallback) => fallback, set: noop, setSync: async () => ({ ok: true }) },
            shouldBuildPrimaryUI: () => true,
            createToast: noop,
            createBrandImage: () => doc.createElement('img'),
            injectStyle: () => ({ remove: noop }),
            ensurePanelStyles: noop,
            isBooleanFeature: (feature) => feature?.type === 'checkbox',
            getFeatureById: (id) => byId.get(id) || null,
            getFeatureName: (feature) => feature?.name || '',
            getFeatureDescription: () => '',
            getFocusableUiElements: () => [],
            formatPageLabel: (page) => String(page),
            liveFeatureList: features,
            normalizeSelectOptions: (options) => options || [],
            settingsManager: { defaults: {}, save: async () => ({ ok: true }) },
            showToast: noop,
            t: (_key, fallback) => fallback,
            trapFocusWithin: noop,
            storageRead: storage ? (key, fallback) => (key in storage ? storage[key] : fallback) : () => null,
            storageReadJSON: () => null,
            storageWrite: storage ? (key, value) => { storage[key] = value; } : noop
        });
        runtime.buildSettingsPanel();
        const placed = {};
        for (const card of doc.querySelectorAll('.ytkit-feature-card')) {
            const where = { pane: null, under: null, promoted: false };
            for (let node = card.parentElement; node; node = node.parentElement) {
                if (node.classList?.contains('ytkit-sub-features') && where.under === null) {
                    where.under = node.dataset.parentId;
                    where.promoted = node.classList.contains('ytkit-promoted-sub-features');
                }
                if (node.classList?.contains('ytkit-pane')) {
                    where.pane = node.dataset.category;
                    break;
                }
            }
            (placed[card.dataset.featureId] ||= []).push(where);
        }
        act?.(doc, runtime);
        return placed;
    } finally {
        globalThis.document = saved.document;
        globalThis.chrome = saved.chrome;
        globalThis.CSS = saved.CSS;
        if (saved.host === undefined) delete globalThis.__astraDeckUserscript;
        else globalThis.__astraDeckUserscript = saved.host;
        if (saved.YTKitCore === undefined) delete globalThis.YTKitCore;
        else globalThis.YTKitCore = saved.YTKitCore;
    }
}

/** Where a built panel stands: selected tab, the readout of it, and focus. */
function panelState(doc) {
    return {
        tab: doc.querySelector('.ytkit-nav-btn.active')?.dataset.tab,
        readout: doc.getElementById('ytkit-insight-active-section')?.textContent,
        focus: doc.activeElement?.closest?.('.ytkit-feature-card')?.dataset.featureId
    };
}

test('a deep link selects its page the way a tab click does', () => {
    // The link selected the page alone, so the panel's Active section readout
    // still named the page it was on before.
    let before = null;
    let state = null;
    buildRealPanel([
        { id: 'hideVideoEndContent', name: 'Hide Video End Content', group: 'Video Player', type: 'checkbox' },
        { id: 'returnDislike', name: 'Return YouTube Dislike', group: 'Ratings', type: 'checkbox' }
    ], {}, {
        act: (doc, runtime) => {
            before = panelState(doc);
            assert.equal(runtime.requestSettingFocus('returnDislike'), true);
            state = panelState(doc);
            state.label = doc.querySelector('.ytkit-nav-btn.active .ytkit-nav-label')?.textContent;
        }
    });
    assert.notEqual(before.tab, 'Watch-Page', `the link has to move the panel, it started on ${before.tab}`);
    assert.equal(state.tab, 'Watch-Page');
    assert.ok(state.label, 'the tab has a label to read out');
    assert.equal(state.readout, state.label);
    assert.equal(state.focus, 'returnDislike');
});

test('the Digital Wellbeing shortcut opens the page its card is on', () => {
    // It worked the page out from Digital Wellbeing's raw group, which names a
    // page only while that group has one of its own. Research maps to Watch
    // Page, so a raw-group lookup finds no tab here.
    let before = null;
    let state = null;
    buildRealPanel([
        { id: 'hideVideoEndContent', name: 'Hide Video End Content', group: 'Video Player', type: 'checkbox' },
        { id: 'digitalWellbeing', name: 'Digital Wellbeing', group: 'Research', type: 'checkbox' },
        { id: 'shortsDailyLimit', name: 'Daily Shorts limit', group: 'Advanced', type: 'checkbox', isSubFeature: true, parentId: 'digitalWellbeing' }
    ], {}, {
        shortsKeys: ['shortsDailyLimit'],
        act: (doc) => {
            before = panelState(doc);
            const shortcut = doc.querySelector('.ytkit-shorts-dependency')?.querySelector('button');
            assert.ok(shortcut, 'the promoted Shorts card carries the shortcut');
            shortcut.dispatchEvent({ type: 'click' });
            state = panelState(doc);
        }
    });
    assert.notEqual(before.tab, 'Watch-Page', `the shortcut has to move the panel, it started on ${before.tab}`);
    assert.equal(state.tab, 'Watch-Page');
    assert.equal(state.focus, 'digitalWellbeing');
    assert.ok(state.readout && state.readout !== 'Video Player', `the readout follows the page, read ${state.readout}`);
});

test('the built panel draws every feature once, sub-cards under their parent', () => {
    const placed = buildRealPanel([
        { id: 'hideVideoEndContent', name: 'Hide Video End Content', group: 'Video Player', type: 'checkbox' },
        { id: 'hideEndCards', name: 'Hide End Screen Cards', group: 'Watch Page', type: 'checkbox', isSubFeature: true, parentId: 'hideVideoEndContent' },
        { id: 'hideNotificationButton', name: 'Hide Notification Bell', group: 'Interface', type: 'checkbox' },
        { id: 'returnDislike', name: 'Return YouTube Dislike', group: 'Ratings', type: 'checkbox' },
        { id: 'returnDislikeOnCards', name: 'Dislikes on thumbnails', group: 'Ratings', type: 'checkbox', isSubFeature: true, parentId: 'returnDislike' }
    ]);
    assert.deepEqual(placed.hideEndCards, [{ pane: 'Video-Player', under: 'hideVideoEndContent', promoted: false }]);
    assert.deepEqual(placed.hideNotificationButton, [{ pane: 'Home-Subscriptions', under: null, promoted: false }]);
    // Ratings maps to Watch Page. A parent check against the raw group instead
    // of the page would read this sub-card as one the Shorts rule moved and
    // draw it apart from its parent.
    assert.deepEqual(placed.returnDislikeOnCards, [{ pane: 'Watch-Page', under: 'returnDislike', promoted: false }]);
    assert.equal(Object.keys(placed).length, 5, 'one card per feature, none dropped');
    for (const [id, spots] of Object.entries(placed)) assert.equal(spots.length, 1, `${id} is drawn once`);
});

test('settingsPanel does not count a feature whose setting is absent from the sparse bag', () => {
    // Only changed keys are persisted, so an untouched default is `undefined`
    // in appState.settings. Counting it as enabled would overstate every
    // category badge on a fresh install.
    withRuntime({ appState: { settings: {} } }, ({ api }) => {
        const features = [{ id: 'neverTouched', type: 'checkbox' }];
        assert.equal(api.countEnabledToggleFeatures(features), 0);
    });
});

// ── The runtime contract itself ──

test('settingsPanel exposes the handlers ytkit.js and the userscript bundle call', () => {
    withRuntime({}, ({ api }) => {
        // The monolith and the bundled userscript both consume this surface. A
        // missing export here is precisely the class of defect that shipped
        // five dead controls to every Tampermonkey user.
        for (const name of [
            'isSettingsPanelOpen',
            'setSettingsPanelOpen',
            'toggleSettingsPanel',
            'countEnabledToggleFeatures',
            'buildSettingsPanel',
            'buildFeatureCard',
            'updateAllToggleStates',
            'attachUIEventListeners'
        ]) {
            assert.equal(typeof api[name], 'function', `${name} must be exported from the runtime`);
        }
    });
});

test('settingsPanel refuses to open when the host says this is not the primary UI frame', () => {
    // live_chat and other subframes load the same bundle; building the panel
    // there would inject a second copy into the page.
    withRuntime({ shouldBuildPrimaryUI: () => false }, ({ api, body }) => {
        assert.equal(api.setSettingsPanelOpen(true), false,
            'a non-primary frame must refuse rather than build a duplicate panel');
        assert.equal(body.classes.has(PANEL_OPEN_CLASS), false, 'and must not mark the body open');
    });
});

test('Video Hider pane uses its own toggle and shared settings reconciliation', () => {
    const moduleSource = fs.readFileSync(
        require.resolve(MODULE_PATH), 'utf8');
    // The userscript used to carry a third copy of this pane, and ytkit.js a
    // second one. Both now run the settings-panel module, the only copy.
    assert.ok(userscriptBundles('features/settings-panel/index.js'),
        'the userscript must ship the settings-panel module');
    for (const [label, source] of [
        ['settings-panel module', moduleSource]
    ]) {
        assert.match(source, /ytkit-video-hider-enabled/,
            `${label} must give the dedicated Video Hider toggle a unique id`);
        assert.match(source, /const nextSettings = \{[\s\S]{0,180}hideVideosFromHome: toggleInput\.checked/,
            `${label} must build a replacement settings object for Video Hider`);
        assert.match(source, /applyExternalSettingsUpdate/,
            `${label} must use the shared settings reconciler when available`);
        assert.match(source, /useSharedVideoHiderReconciliation/,
            `${label} must reconcile the generic Video Hider card toggle too`);
        assert.match(source, /_ytkitSyncVideoHiderToggle/,
            `${label} must keep the dedicated toggle synchronized after storage reconciliation`);
    }
});

test('Video Hider channels tab follows Channel Allowlist mode', () => {
    // The peeled pane always listed, counted and cleared the blocklist, so
    // in allowlist mode it managed the wrong channels, had no paste-a-channel
    // form, and its summary cards read "0 videos hidden" over "Hidden Videos".
    const channelsTab = (source) => source.slice(
        source.indexOf("} else if (tab === 'channels') {"),
        source.indexOf("} else if (tab === 'keywords') {")
    );
    for (const [label, source] of [
        ['settings-panel module', fs.readFileSync(require.resolve(MODULE_PATH), 'utf8')]
    ]) {
        assert.match(source, /const isChannelAllowlistMode = \(\) => appState\.settings\.hideVideosChannelAllowlist === true;/,
            `${label} must read Channel Allowlist mode`);
        assert.match(source, /function createChannelEntryForm\(\)/,
            `${label} must offer the paste-a-channel form`);
        assert.match(source, /paneChannelsLabel\.textContent = /,
            `${label} must relabel the channels summary card for the active mode`);
        const tab = channelsTab(source);
        assert.ok(tab.length > 500, `${label} channels tab must be present`);
        assert.match(tab, /getManagedChannels\(\)/, `${label} channels tab must list the managed channels`);
        assert.match(tab, /removeManagedChannel\(ch\)/, `${label} channels tab must remove from the managed list`);
        assert.match(tab, /setManagedChannels\(\[\]\)/, `${label} channels tab must clear the managed list`);
        assert.doesNotMatch(tab, /_getBlockedChannels|_setBlockedChannels|_removeBlockedChannel/,
            `${label} channels tab must not reach for the blocklist directly`);
        assert.doesNotMatch(source, /videoHiderHiddenCountTpl|videoHiderAllowedCountTpl|videoHiderBlockedCountTpl/,
            `${label} summary cards must show bare counts under their labels`);
    }
});

test('page quick controls reconcile feature settings without in-place mutation', () => {
    // The userscript runs this same ytkit.js rather than a copy of its own.
    assert.equal(readUserscriptBuild().modules.app, 'ytkit.js',
        'the userscript must run the same page quick-controls runtime');
    for (const [label, source] of [
        ['extension runtime', fs.readFileSync(
            require.resolve('../../extension/ytkit.js'), 'utf8')]
    ]) {
        const start = source.indexOf('const PAGE_MODAL_CONFIG =');
        const end = source.indexOf('function injectPageModalButton', start);
        assert.ok(start > -1 && end > start, `${label} must contain the page quick-controls runtime`);
        const block = source.slice(start, end);
        assert.match(block, /card\.addEventListener\('click', async \(\) =>/,
            `${label} quick controls must await their settings write`);
        assert.match(block, /const previousSettings = \{ \.\.\.appState\.settings \};/,
            `${label} quick controls must snapshot settings before toggling`);
        assert.match(block, /const nextSettings = \{[\s\S]{0,120}\[fid\]: !previousSettings\[fid\]/,
            `${label} quick controls must build a replacement settings object`);
        // Either rollback shape is accepted; tests/guarded-name-binding.test.js
        // drives the rollback for real.
        assert.match(block, /quick-settings-rollback|reconcile\(result\.settings \|\| previousSettings\)/,
            `${label} quick controls must restore the prior setting after a failed write`);
        assert.doesNotMatch(block, /appState\.settings\[fid\] = newVal/,
            `${label} quick controls must not mutate the live settings object in place`);
    }
});

test('Video Hider toggle rolls back the optimistic state after a rejected save', async () => {
    const events = new Map();
    const classes = new Set(['ytkit-panel-open']);
    const appState = { settings: { hideVideosFromHome: false } };
    const calls = [];
    const input = {
        checked: true,
        disabled: false,
        setAttribute() {},
        removeAttribute() {},
        matches: (selector) => selector === '.ytkit-feature-cb',
        closest: (selector) => {
            if (selector === '[data-feature-id]') return card;
            if (selector === '.ytkit-switch') return switchEl;
            return null;
        }
    };
    const card = {
        dataset: { featureId: 'hideVideosFromHome' },
        classList: {
            toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
            contains: (name) => classes.has(name),
            add() {},
            remove() {}
        },
        querySelector: () => null
    };
    const switchEl = {
        classList: { toggle() {}, add() {}, remove() {} }
    };
    const panel = { contains: () => true };
    const documentStub = {
        body: { classList: { contains: (name) => classes.has(name), toggle() {} } },
        documentElement: { classList: { toggle() {} }, style: {} },
        activeElement: input,
        getElementById: (id) => id === 'ytkit-settings-panel' ? panel : null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, handler) { events.set(type, handler); },
        removeEventListener() {}
    };
    const originalDocument = globalThis.document;
    globalThis.document = documentStub;
    try {
        const api = loadModule().createSettingsPanelRuntime({
            PANEL_OPEN_CLASS,
            CONFLICT_MAP: {},
            appState,
            DebugManager: { log() {} },
            StorageManager: { get: (_key, fallback) => fallback, set() {}, setSync: async () => ({ ok: true }) },
            shouldBuildPrimaryUI: () => true,
            buildSettingsPanel: () => panel,
            createToast() {},
            injectStyle: () => ({ remove() {} }),
            isBooleanFeature: (feature) => feature?.type === 'checkbox',
            getFeatureById: (id) => ({ id, type: 'checkbox', name: 'Video Hider' }),
            getFeatureName: (feature) => feature?.name || feature?.id,
            getFeatureDescription: () => '',
            getFocusableUiElements: () => [],
            liveFeatureList: [],
            requestFeatureOptionalHosts: async () => true,
            applyExternalSettingsUpdate({ nextSettings }) {
                appState.settings = { ...nextSettings };
            },
            safeInitFeature() {},
            safeDestroyFeature() {},
            settingsManager: {
                save(nextSettings) {
                    calls.push({ ...nextSettings });
                    return Promise.resolve({ ok: false, settings: { hideVideosFromHome: false } });
                }
            },
            showToast() {},
            t: (_key, fallback) => fallback
        });
        api.attachUIEventListeners();
        const change = events.get('change');
        assert.equal(typeof change, 'function', 'settings panel must register its delegated change handler');

        await change({ target: input });

        assert.deepEqual(calls, [
            { hideVideosFromHome: true }
        ], 'the save must receive the optimistic replacement object');
        assert.equal(appState.settings.hideVideosFromHome, false,
            'a rejected save must restore the previous setting');
        assert.equal(input.checked, false,
            'the dedicated Video Hider checkbox must mirror the rolled-back setting');
    } finally {
        globalThis.document = originalDocument;
    }
});

// ── Known-breakage notices on the card ──
//
// The feed never writes the user's setting, so a paused feature's toggle still
// reads ON. Without this notice the card would say the feature is enabled while
// nothing happened on the page, which is exactly the silent-failure shape the
// feed exists to remove. Rendered from the built tree, not from source text.

const { fakeNode, fakeDocument, fakeTreeDocument } = require('../helpers/monolith');

function buildCardWith(notice, health = []) {
    const originalDocument = globalThis.document;
    globalThis.document = fakeDocument(() => []);
    globalThis.document.body = fakeNode({ tag: 'body' });
    try {
        const api = loadModule().createSettingsPanelRuntime({
            PANEL_OPEN_CLASS,
            appState: { settings: { returnDislike: true } },
            DebugManager: { log() {} },
            StorageManager: { get: (_k, d) => d, set() {} },
            ICONS: new Proxy({}, { get: () => () => fakeNode({ tag: 'svg' }) }),
            FEATURE_PREVIEWS: {},
            shouldBuildPrimaryUI: () => true,
            isBooleanFeature: (feature) => feature?.type === 'checkbox',
            getFeatureName: (feature) => feature.name,
            getFeatureDescription: (feature) => feature.description,
            getFeatureDisableNotice: () => notice,
            getFeatureHealthSnapshot: () => health,
            formatPageLabel: (page) => page,
            normalizeSelectOptions: (options) => options,
            t: (_key, fallback) => fallback,
            injectStyle: () => ({ remove() {} })
        });
        return api.buildFeatureCard(
            { id: 'returnDislike', name: 'Return Dislike', description: 'Show dislike counts.', icon: 'settings' },
            '#ff4e45'
        );
    } finally {
        globalThis.document = originalDocument;
    }
}

function findByClass(node, className, out = []) {
    for (const child of node.children || []) {
        if (child.classList?.contains?.(className)) out.push(child);
        findByClass(child, className, out);
    }
    return out;
}

test('a feature under a known-breakage notice explains itself and links the issue', () => {
    const card = buildCardWith({
        featureId: 'returnDislike',
        issue: 412,
        issueUrl: 'https://github.com/SysAdminDoc/Astra-Deck/issues/412'
    });

    assert.equal(card.classList.contains('ytkit-feature-known-broken'), true,
        'the card must be marked so the notice can be styled and found');

    const notes = findByClass(card, 'ytkit-feature-broken-note');
    assert.equal(notes.length, 1, 'exactly one notice must be rendered');
    assert.match(notes[0].textContent, /Paused/,
        'the notice must say the feature is paused, in the extension\'s own words');

    const links = findByClass(card, 'ytkit-feature-broken-link');
    assert.equal(links.length, 1);
    assert.equal(links[0].getAttribute('href'), 'https://github.com/SysAdminDoc/Astra-Deck/issues/412');
    assert.equal(links[0].getAttribute('rel'), 'noopener noreferrer');
    assert.equal(links[0].textContent, 'Issue #412');
});

test('a feature with no notice renders no notice and no marker class', () => {
    const card = buildCardWith(null);
    assert.equal(card.classList.contains('ytkit-feature-known-broken'), false);
    assert.equal(findByClass(card, 'ytkit-feature-broken-note').length, 0);
});

test('a degraded feature renders one accessible health badge in the canonical settings card', () => {
    // `lastError` is `String(error.message)` from the registry. It used to be
    // the tooltip AND the whole aria-label, so the badge announced an
    // untranslated exception and never announced its own visible label.
    const raw = 'TypeError: Cannot read properties of undefined (reading \'payload\')';
    const card = buildCardWith(null, [{ id: 'returnDislike', status: 'degraded', lastError: raw }]);

    assert.equal(card.classList.contains('ytkit-feature-card--degraded'), true);
    const badges = findByClass(card, 'ytkit-feature-badge');
    assert.equal(badges.length, 1, 'one warning is attached to the card metadata');
    assert.equal(badges[0].textContent, 'Needs attention');
    assert.equal(badges[0].dataset.tone, 'warning');
    assert.equal(badges[0].isConnected, true);

    const label = badges[0].getAttribute('aria-label');
    assert.ok(label.startsWith('Needs attention'),
        'the accessible name must lead with the visible label (WCAG 2.5.3)');
    assert.ok(label.includes('Return Dislike'), 'the name must say which feature is degraded');
    assert.ok(!label.includes(raw), 'the raw throw must not reach a reader');
    assert.ok(!badges[0].title.includes(raw), 'the raw throw must not reach the tooltip');
    assert.ok(badges[0].title.startsWith('Return Dislike: '),
        'the tooltip names the feature, then the cause');
});

test('the health badge states the classified cause, not the thrown text', () => {
    // With the real failure-copy core present the badge must name an
    // actionable cause. Without it the module still falls back to the closed
    // unknown-cause sentence rather than to the throw.
    const failureCopy = path.join(__dirname, '..', '..', 'extension', 'core', 'failure-copy.js');
    const previousCore = globalThis.YTKitCore;
    delete globalThis.YTKitCore;
    try {
        new Function(fs.readFileSync(failureCopy, 'utf8')).call(globalThis);
        const card = buildCardWith(null, [{
            id: 'returnDislike',
            status: 'degraded',
            lastError: 'Failed to fetch'
        }]);
        const badge = findByClass(card, 'ytkit-feature-badge')[0];
        assert.equal(badge.title,
            'Return Dislike: The service could not be reached. Check your connection, then try again.');
    } finally {
        if (previousCore === undefined) delete globalThis.YTKitCore;
        else globalThis.YTKitCore = previousCore;
    }
});

test('the settings search count announces itself', () => {
    // The count is the only feedback that filtering happened. Without a live
    // region a screen-reader user types and hears nothing while the list
    // visibly shrinks. The comment search already did this correctly.
    const documentRef = fakeTreeDocument();
    const expectedHost = documentRef.createElement('div');
    const wrongTarget = documentRef.createElement('div');
    documentRef.body.append(expectedHost, wrongTarget);
    const searchActions = documentRef.createElement('div');
    expectedHost.appendChild(searchActions);

    const searchMeta = loadModule().appendSettingsSearchStatus(
        documentRef,
        searchActions,
        (key, fallback) => key === 'commonAll' ? 'Everything' : fallback
    );

    assert.equal(searchActions.children.length, 1);
    assert.equal(searchActions.children[0], searchMeta,
        'the live count must attach to the search action group that owns it');
    assert.equal(wrongTarget.children.length, 0,
        'the placement oracle must reject a count redirected to a sibling');
    assert.equal(searchMeta.id, 'ytkit-search-count');
    assert.equal(searchMeta.className, 'ytkit-search-meta');
    assert.equal(searchMeta.getAttribute('aria-live'), 'polite');
    assert.equal(searchMeta.getAttribute('aria-atomic'), 'true');
    assert.equal(searchMeta.textContent, 'Everything',
        'the initial count must use the active locale function');
});

// The panel's live status line announced every change in English: "X enabled.",
// "X saved.", "X changed to Y.". It reads the active catalogue now; this flips
// a feature on through the real delegated change handler with the shipped
// German one and reads the status region back.
test('the live status line reports a toggle in the active locale', async () => {
    const catalogue = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', '_locales', 'de', 'messages.json'), 'utf8'));
    const events = new Map();
    const appState = { settings: { returnDislike: false } };
    const status = { textContent: '', dataset: {} };
    const input = {
        checked: true,
        disabled: false,
        setAttribute() {},
        removeAttribute() {},
        matches: (selector) => selector === '.ytkit-feature-cb',
        closest: (selector) => (selector === '[data-feature-id]' ? card : selector === '.ytkit-switch' ? switchEl : null)
    };
    const card = {
        dataset: { featureId: 'returnDislike' },
        classList: { toggle() {}, contains: () => false, add() {}, remove() {} },
        querySelector: () => null
    };
    const switchEl = { classList: { toggle() {}, add() {}, remove() {} } };
    const panel = { contains: () => true };
    const originalDocument = globalThis.document;
    globalThis.document = {
        body: { classList: { contains: (name) => name === 'ytkit-panel-open', toggle() {} } },
        documentElement: { classList: { toggle() {} }, style: {} },
        activeElement: input,
        getElementById: (id) => (id === 'ytkit-settings-panel' ? panel : id === 'ytkit-panel-status' ? status : null),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, handler) { events.set(type, handler); },
        removeEventListener() {}
    };
    try {
        const api = loadModule().createSettingsPanelRuntime({
            PANEL_OPEN_CLASS,
            CONFLICT_MAP: {},
            appState,
            DebugManager: { log() {} },
            StorageManager: { get: (_key, fallback) => fallback, set() {}, setSync: async () => ({ ok: true }) },
            shouldBuildPrimaryUI: () => true,
            buildSettingsPanel: () => panel,
            createToast() {},
            injectStyle: () => ({ remove() {} }),
            isBooleanFeature: (feature) => feature?.type === 'checkbox',
            getFeatureById: (id) => ({ id, type: 'checkbox', name: 'Return YouTube Dislike' }),
            getFeatureName: (feature) => feature?.name || feature?.id,
            getFeatureDescription: () => '',
            getFocusableUiElements: () => [],
            liveFeatureList: [],
            requestFeatureOptionalHosts: async () => true,
            safeInitFeature() {},
            safeDestroyFeature() {},
            initFeatureLifecycle() {},
            destroyFeatureLifecycle() {},
            settingsManager: {
                save(nextSettings) {
                    return Promise.resolve({ ok: true, settings: { ...nextSettings } });
                }
            },
            showToast() {},
            t: (key, fallback) => catalogue[key]?.message ?? fallback
        });
        api.attachUIEventListeners();
        await events.get('change')({ target: input });
        assert.equal(status.textContent, 'Return YouTube Dislike aktiviert');
        assert.equal(status.dataset.tone, 'success');
    } finally {
        globalThis.document = originalDocument;
    }
});

// Option values are strings. The panel stored them as-is, so picking 1.5x in
// Persistent Speed wrote "1.5" into a number setting; the schema refused it,
// export quietly reset it to 1, and the popup listed it as "Unrecognized".
test('a choice for a number setting is saved as a number', async () => {
    const events = new Map();
    const appState = { settings: {} };
    const saved = [];
    const features = {
        persistentSpeed: { id: 'persistentSpeed', type: 'select', settingKey: 'persistentSpeedValue', name: 'Speed' },
        playerTheme: { id: 'playerTheme', type: 'select', name: 'Theme' }
    };
    const selectFor = (featureId, value) => {
        const card = { dataset: { featureId } };
        return {
            value,
            selectedIndex: 0,
            options: [{ text: String(value) }],
            matches: (selector) => selector === '.ytkit-select',
            closest: (selector) => (selector === '[data-feature-id]' ? card : null)
        };
    };
    const panel = { contains: () => true };
    const originalDocument = globalThis.document;
    globalThis.document = {
        body: { classList: { contains: () => true, toggle() {} } },
        documentElement: { classList: { toggle() {} }, style: {} },
        activeElement: null,
        getElementById: (id) => (id === 'ytkit-settings-panel' ? panel : null),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, handler) { events.set(type, handler); },
        removeEventListener() {}
    };
    try {
        const api = loadModule().createSettingsPanelRuntime({
            PANEL_OPEN_CLASS,
            CONFLICT_MAP: {},
            appState,
            DebugManager: { log() {} },
            StorageManager: { get: (_key, fallback) => fallback, set() {}, setSync: async () => ({ ok: true }) },
            shouldBuildPrimaryUI: () => true,
            buildSettingsPanel: () => panel,
            createToast() {},
            injectStyle: () => ({ remove() {} }),
            isBooleanFeature: () => false,
            getFeatureById: (id) => features[id],
            getFeatureName: (feature) => feature?.name,
            getFeatureDescription: () => '',
            getFocusableUiElements: () => [],
            liveFeatureList: [],
            requestFeatureOptionalHosts: async () => true,
            safeInitFeature() {},
            safeDestroyFeature() {},
            initFeatureLifecycle() {},
            destroyFeatureLifecycle() {},
            settingsManager: {
                defaults: { persistentSpeedValue: 1, playerTheme: 'dark' },
                save(nextSettings) {
                    saved.push({ ...nextSettings });
                    return Promise.resolve({ ok: true, settings: { ...nextSettings } });
                }
            },
            showToast() {},
            t: (_key, fallback) => fallback
        });
        api.attachUIEventListeners();
        await events.get('input')({ target: selectFor('persistentSpeed', '1.5') });
        assert.strictEqual(appState.settings.persistentSpeedValue, 1.5);
        assert.strictEqual(saved.at(-1).persistentSpeedValue, 1.5);
        await events.get('input')({ target: selectFor('playerTheme', 'light') });
        assert.strictEqual(appState.settings.playerTheme, 'light', 'a text choice stays text');
        await events.get('input')({ target: selectFor('playerTheme', '2') });
        assert.strictEqual(appState.settings.playerTheme, '2', 'even one that looks like a number');
    } finally {
        globalThis.document = originalDocument;
    }
});

// Force H.264 and the codec selector are a conflict pair, but the selector is
// a string setting. The panel switched it "off" by writing false, which the
// worker rejected, so the whole save rolled back behind an error. And picking
// a codec while Force H.264 was on changed nothing: H.264 kept playing.
function codecPanelHarness(settings) {
    const { SETTING_CONFLICTS } = require('../../extension/core/settings-schema');
    const events = new Map();
    const appState = { settings: { ...settings } };
    const saved = [];
    const toasts = [];
    const destroyed = [];
    const features = {
        forceH264: { id: 'forceH264', name: 'Force H.264 Codec', _initialized: settings.forceH264 === true },
        codecSelector: { id: 'codecSelector', type: 'select', name: 'Codec Selector', _initialized: true }
    };
    const panel = { contains: () => true };
    const originalDocument = globalThis.document;
    globalThis.document = {
        body: { classList: { contains: () => true, toggle() {} } },
        documentElement: { classList: { toggle() {} }, style: {} },
        activeElement: null,
        getElementById: (id) => (id === 'ytkit-settings-panel' ? panel : null),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, handler) { events.set(type, handler); },
        removeEventListener() {}
    };
    const api = loadModule().createSettingsPanelRuntime({
        PANEL_OPEN_CLASS,
        CONFLICT_MAP: SETTING_CONFLICTS,
        appState,
        DebugManager: { log() {} },
        StorageManager: { get: (_key, fallback) => fallback, set() {}, setSync: async () => ({ ok: true }) },
        shouldBuildPrimaryUI: () => true,
        buildSettingsPanel: () => panel,
        createToast() {},
        injectStyle: () => ({ remove() {} }),
        isBooleanFeature: (feature) => feature?.id === 'forceH264',
        getFeatureById: (id) => features[id],
        getFeatureName: (feature) => feature?.name,
        getFeatureDescription: () => '',
        getFocusableUiElements: () => [],
        liveFeatureList: [],
        requestFeatureOptionalHosts: async () => true,
        safeInitFeature() {},
        safeDestroyFeature() {},
        initFeatureLifecycle(feature) { feature._initialized = true; },
        destroyFeatureLifecycle(feature) { destroyed.push(feature.id); feature._initialized = false; },
        settingsManager: {
            defaults: { forceH264: false, codecSelector: 'auto' },
            save(nextSettings) {
                saved.push({ ...nextSettings });
                return Promise.resolve({ ok: true, settings: { ...nextSettings } });
            }
        },
        showToast: (message) => toasts.push(message),
        t: (_key, fallback) => fallback
    });
    api.attachUIEventListeners();
    const restore = () => { globalThis.document = originalDocument; };
    return { events, appState, saved, toasts, destroyed, restore };
}

test('naming a codec while Force H.264 is on switches Force H.264 off and says so', async () => {
    const h = codecPanelHarness({ forceH264: true, codecSelector: 'auto' });
    try {
        const card = { dataset: { featureId: 'codecSelector' } };
        await h.events.get('input')({ target: {
            value: 'av1',
            selectedIndex: 0,
            options: [{ text: 'Force AV1' }],
            matches: (selector) => selector === '.ytkit-select',
            closest: (selector) => (selector === '[data-feature-id]' ? card : null)
        } });
        assert.equal(h.appState.settings.codecSelector, 'av1');
        assert.equal(h.appState.settings.forceH264, false);
        assert.deepEqual({ codec: h.saved.at(-1).codecSelector, h264: h.saved.at(-1).forceH264 }, { codec: 'av1', h264: false });
        assert.ok(h.destroyed.includes('forceH264'));
        assert.match(h.toasts.join('\n'), /Auto-disabled Force H\.264 Codec/);
    } finally {
        h.restore();
    }
});

test('turning Force H.264 on sends a chosen codec back to auto, never to false', async () => {
    for (const [codec, expected, toasted] of [['av1', 'auto', true], ['auto', 'auto', false]]) {
        const h = codecPanelHarness({ forceH264: false, codecSelector: codec });
        try {
            const card = {
                dataset: { featureId: 'forceH264' },
                classList: { toggle() {}, contains: () => false, add() {}, remove() {} },
                querySelector: () => null
            };
            const switchEl = { classList: { toggle() {}, add() {}, remove() {} } };
            await h.events.get('change')({ target: {
                checked: true,
                disabled: false,
                setAttribute() {},
                removeAttribute() {},
                matches: (selector) => selector === '.ytkit-feature-cb',
                closest: (selector) => (selector === '[data-feature-id]' ? card : selector === '.ytkit-switch' ? switchEl : null)
            } });
            assert.equal(h.appState.settings.forceH264, true, codec);
            assert.equal(h.appState.settings.codecSelector, expected, codec);
            assert.ok(h.saved.every((entry) => typeof entry.codecSelector === 'string'), `${codec}: a string setting is never saved as false`);
            assert.equal(/Auto-disabled/.test(h.toasts.join('\n')), toasted, `${codec}: toast only when a codec was switched back`);
        } finally {
            h.restore();
        }
    }
});

test('a card Reset chip anchors to the text column so it cannot sit on the switch', () => {
    const source = fs.readFileSync(require.resolve(MODULE_PATH), 'utf8');
    const rule = source.match(/#ytkit-settings-panel \.ytkit-card-reset \{([^}]*)\}/);
    assert.ok(rule, 'the chip rule exists');
    // `grid-column: 1` alone ends at the padding edge for an absolute box, which
    // puts the chip back over the control column. It has to be a closed 1 / 2 area.
    assert.match(rule[1], /grid-column:\s*1 \/ 2;/);
    assert.match(rule[1], /grid-row:\s*1 \/ 2;/);
    assert.match(rule[1], /justify-self:\s*end;/);
    assert.match(source, /\.ytkit-feature-card\[data-changed="1"\] > \.ytkit-feature-main \{ padding-inline-end: \d+px; \}/);
});

// ── What's New for userscript installs ──
// The userscript has no popup, so its "Updated to vX" note sits under the
// panel header. It shares the popup's rule from core/persisted-domains.js.

function buildReleaseNotePanel({ storage, userscript = true, version = '4.97.0', press = 'dismiss', event = { type: 'click' } }) {
    const persistedDomains = require('../../extension/core/persisted-domains.js');
    let note = null;
    let afterDismiss = null;
    let hiddenAfterPress = null;
    let builtDoc = null;
    buildRealPanel([
        { id: 'hideVideoEndContent', name: 'Hide Video End Content', group: 'Video Player', type: 'checkbox' }
    ], {}, {
        core: { persistedDomains },
        storage,
        version,
        userscriptHost: userscript ? { version, manager: 'Tampermonkey 5.3', errors: [] } : null,
        act: (doc) => {
            const found = doc.querySelector('.ytkit-release-note');
            if (!found) return;
            note = {
                text: found.textContent,
                href: found.querySelector('.ytkit-release-note-open')?.href,
                beforeBody: found.parentElement?.children?.indexOf?.(found)
                    < found.parentElement?.children?.indexOf?.(doc.querySelector('.ytkit-body'))
            };
            builtDoc = doc;
            found.querySelector(`.ytkit-release-note-${press}`).dispatchEvent({ ...event });
            afterDismiss = !!doc.querySelector('.ytkit-release-note');
            hiddenAfterPress = found.hidden === true;
        }
    });
    return { note, afterDismiss, hiddenAfterPress, stillThere: () => !!builtDoc?.querySelector('.ytkit-release-note') };
}

test('a userscript update shows the release note once, and dismissing it records the version', () => {
    const storage = { ytkit_last_seen_version: '4.96.0' };
    const { note, afterDismiss } = buildReleaseNotePanel({ storage });
    assert.ok(note, 'the panel must carry the note after an update');
    assert.match(note.text, /Updated to v4\.97\.0 \(from v4\.96\.0\)\. See what changed\./);
    assert.equal(note.href, 'https://github.com/SysAdminDoc/Astra-Deck/blob/main/CHANGELOG.md');
    assert.equal(note.beforeBody, true, 'the note sits between the header and the body');
    assert.equal(afterDismiss, false, 'dismissing removes it');
    assert.equal(storage.ytkit_last_seen_version, '4.97.0');

    const again = buildReleaseNotePanel({ storage });
    assert.equal(again.note, null, 'a dismissed note never comes back for the same version');
});

test('the changelog link stays in the page until its click is done, and a middle-click counts', async () => {
    for (const event of [{ type: 'click' }, { type: 'auxclick', button: 1 }]) {
        const storage = { ytkit_last_seen_version: '4.96.0' };
        const pressed = buildReleaseNotePanel({ storage, press: 'open', event });
        assert.ok(pressed.note, event.type);
        assert.equal(pressed.afterDismiss, true, `${event.type}: removing the link mid-click can cancel the navigation`);
        assert.equal(pressed.hiddenAfterPress, true, `${event.type}: the note is hidden at once`);
        assert.equal(storage.ytkit_last_seen_version, '4.97.0', `${event.type}: the version is recorded`);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(pressed.stillThere(), false, `${event.type}: then the note is removed`);
    }

    const storage = { ytkit_last_seen_version: '4.96.0' };
    const rightClick = buildReleaseNotePanel({ storage, press: 'open', event: { type: 'auxclick', button: 2 } });
    assert.equal(rightClick.hiddenAfterPress, false, 'a right-click opens a menu, not the changelog');
    assert.equal(storage.ytkit_last_seen_version, '4.96.0');
});

test('a card note follows its setting when the change comes from outside the panel', () => {
    // The popup, another tab, an import or an undo reach the panel through
    // updateAllToggleStates, never through the panel's own change handler.
    const settings = { hideVideoEndContent: true, floatingLogoOnWatch: true };
    const seen = [];
    buildRealPanel([
        { id: 'hideVideoEndContent', name: 'Hide Video End Content', group: 'Video Player', type: 'checkbox' }
    ], settings, {
        act: (doc, runtime) => {
            const note = doc.createElement('p');
            note.dataset.followsSetting = 'floatingLogoOnWatch';
            doc.querySelector('.ytkit-feature-card').appendChild(note);
            settings.floatingLogoOnWatch = false;
            runtime.updateAllToggleStates();
            seen.push(note.hidden);
            settings.floatingLogoOnWatch = true;
            runtime.updateAllToggleStates();
            seen.push(note.hidden);
        }
    });
    assert.deepEqual(seen, [true, false]);
});

test('a userscript install with no last-seen version stamps it silently', () => {
    const storage = {};
    const { note } = buildReleaseNotePanel({ storage });
    assert.equal(note, null, 'a first sight is not an update');
    assert.equal(storage.ytkit_last_seen_version, '4.97.0');
});

test('the extension leaves the release note to its popup', () => {
    const storage = { ytkit_last_seen_version: '4.96.0' };
    const { note } = buildReleaseNotePanel({ storage, userscript: false });
    assert.equal(note, null);
    assert.equal(storage.ytkit_last_seen_version, '4.96.0', 'the popup owns this key in the extension');
});
