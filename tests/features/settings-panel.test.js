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

const MODULE_PATH = '../../extension/features/settings-panel/index.js';
const PANEL_OPEN_CLASS = 'ytkit-panel-open';
const userscriptRuntime = fs.readFileSync(
    path.join(__dirname, '..', '..', 'YTKit-core.user.js'), 'utf8'
) + '\n' + fs.readFileSync(
    path.join(__dirname, '..', '..', 'YTKit.user.js'), 'utf8'
);

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
    for (const [label, source] of [
        ['settings-panel module', moduleSource],
        ['extension inline fallback', fs.readFileSync(
            require.resolve('../../extension/ytkit.js'), 'utf8')],
        ['userscript runtime', userscriptRuntime]
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

test('page quick controls reconcile feature settings without in-place mutation', () => {
    for (const [label, source] of [
        ['extension runtime', fs.readFileSync(
            require.resolve('../../extension/ytkit.js'), 'utf8')],
        ['userscript runtime', fs.readFileSync(
            path.join(__dirname, '..', '..', 'YTKit.user.js'), 'utf8')]
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
        assert.match(block, /quick-settings-rollback/,
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
        // eslint-disable-next-line no-new-func
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
