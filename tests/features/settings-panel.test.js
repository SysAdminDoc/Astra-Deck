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
const path = require('node:path');

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
