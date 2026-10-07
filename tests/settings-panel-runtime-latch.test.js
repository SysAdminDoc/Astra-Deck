'use strict';

// The extension imports the deferred feature modules AFTER ytkit.js, so any
// call to getSettingsPanelRuntime() during ytkit.js init happens before
// features/settings-panel/index.js has registered its factory. Latching the
// memo on that first call pinned the runtime to null for the whole session:
// every panel came from the inline fallback, the peeled module only ever ran
// in the userscript, and the two copies had to be maintained by hand.
//
// This drives the REAL function out of ytkit.js rather than pinning its text.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const YTKIT_PATH = path.join(__dirname, '..', 'extension', 'ytkit.js');

function loadRuntimeResolver() {
    const src = fs.readFileSync(YTKIT_PATH, 'utf8');
    const start = src.indexOf('    function getSettingsPanelRuntime() {');
    assert.ok(start > -1, 'ytkit.js must define getSettingsPanelRuntime');
    const end = src.indexOf('\n    }', src.indexOf('return _settingsPanelRuntime;', start)) + 6;
    const body = src.slice(start, end);

    // `with` over a catch-all proxy resolves the free identifiers the function
    // closes over, EXCEPT the three memo variables, which must stay lexical.
    const LOCALS = new Set([
        '_settingsPanelRuntime',
        '_settingsPanelRuntimeInitialized',
        '_settingsPanelRuntimeReady'
    ]);
    const factory = new Function(`
        return function (proxy) {
            var _settingsPanelRuntime = null;
            var _settingsPanelRuntimeInitialized = false;
            var _settingsPanelRuntimeReady = true;
            with (proxy) {
                ${body}
                return {
                    getSettingsPanelRuntime: getSettingsPanelRuntime,
                    latched: function () { return _settingsPanelRuntimeInitialized; }
                };
            }
        };
    `)();

    const proxy = new Proxy({}, {
        has: (_t, key) => !LOCALS.has(key) && key !== 'globalThis',
        get: (_t, key) => {
            if (key === Symbol.unscopables) return undefined;
            if (key === 'DebugManager') return { log() {} };
            return function () {};
        }
    });
    return factory(proxy);
}

test('settings panel runtime does not memoise null before the module registers', () => {
    const previousFeatures = globalThis.YTKitFeatures;
    try {
        const api = loadRuntimeResolver();

        // 1. ytkit.js init asks before the deferred module has loaded.
        globalThis.YTKitFeatures = undefined;
        assert.equal(api.getSettingsPanelRuntime(), null,
            'an early call must report no runtime');
        assert.equal(api.latched(), false,
            'an early call must NOT latch the memo — that is the whole defect');

        // 2. The deferred module registers its factory.
        const runtime = { marker: 'module-runtime' };
        let built = 0;
        globalThis.YTKitFeatures = {
            settingsPanel: {
                createSettingsPanelRuntime: () => { built += 1; return runtime; }
            }
        };

        // 3. The next caller (opening the panel) gets the module runtime.
        const resolved = api.getSettingsPanelRuntime();
        assert.equal(resolved, runtime,
            'the module runtime must be reachable once the module has registered');
        assert.equal(api.latched(), true, 'a successful build latches the memo');

        // 4. And it is built once, not per call.
        assert.equal(api.getSettingsPanelRuntime(), runtime);
        assert.equal(built, 1, 'the runtime factory must be memoised after success');
    } finally {
        globalThis.YTKitFeatures = previousFeatures;
    }
});

// The inline copy those comments describe was retired on 2026-10-06. With no
// module, opening the panel now says it didn't load and builds nothing, and
// the calls that only refresh or wire an open panel do nothing at all.
test('without the settings-panel module, an open request reports the panel unavailable', () => {
    const { loadDeclarationsFrom } = require('./helpers/monolith');
    const src = fs.readFileSync(YTKIT_PATH, 'utf8');
    const toasts = [];
    const warnings = [];
    const body = { classList: { contains: () => false, toggle() { throw new Error('nothing may mark the body open'); } } };
    const api = loadDeclarationsFrom(src, [
        'reportSettingsPanelUnavailable', 'isSettingsPanelOpen', 'setSettingsPanelOpen',
        'toggleSettingsPanel', 'updateAllToggleStates', 'attachUIEventListeners'
    ], {
        console: { warn: (...args) => warnings.push(args.join(' ')) },
        document: { body, getElementById: () => { throw new Error('nothing may look for a panel to build'); } },
        PANEL_OPEN_CLASS: 'ytkit-panel-open',
        getSettingsPanelRuntime: () => null,
        showToast: (message, color) => toasts.push({ message, color }),
        t: (_key, fallback) => fallback
    });

    assert.equal(api.setSettingsPanelOpen(true), false);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].message, /settings panel didn't load\. Reload the page/);
    assert.equal(toasts[0].color, '#ef4444');
    assert.ok(warnings.some((line) => /panel is unavailable/.test(line)));

    // Closing, refreshing and wiring have nothing to act on, so they stay quiet.
    assert.equal(api.setSettingsPanelOpen(false), false);
    assert.equal(api.updateAllToggleStates(), undefined);
    assert.equal(api.attachUIEventListeners(), undefined);
    assert.equal(api.isSettingsPanelOpen(), false);
    assert.equal(toasts.length, 1, 'only an open request tells the user');
});

test('the toggle path reaches the same notice', async () => {
    const { loadDeclarationsFrom } = require('./helpers/monolith');
    const src = fs.readFileSync(YTKIT_PATH, 'utf8');
    const toasts = [];
    const api = loadDeclarationsFrom(src, [
        'reportSettingsPanelUnavailable', 'isSettingsPanelOpen', 'setSettingsPanelOpen', 'toggleSettingsPanel'
    ], {
        console: { warn() {} },
        document: { body: { classList: { contains: () => false } } },
        PANEL_OPEN_CLASS: 'ytkit-panel-open',
        getSettingsPanelRuntime: () => null,
        showToast: (message) => toasts.push(message),
        t: (_key, fallback) => fallback
    });
    assert.equal(await api.toggleSettingsPanel(), false);
    assert.equal(toasts.length, 1);
});
