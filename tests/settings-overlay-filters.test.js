'use strict';

// Answering "what did I change", one setting at a time.
//
// The overlay owns every setting. Its search was substring-only, its reset was
// category-wide, and no setting had an address, so the popup and the failure
// copy could say "turn on X" without being able to link to X. Three gaps, one
// surface.
//
// These drive the shipped module's own helpers rather than re-implementing the
// comparison, because a second definition of "changed" would drift from the one
// the filter and the reset button both read.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(
    path.join(REPO_ROOT, 'extension', 'features', 'settings-panel', 'index.js'), 'utf8');

/** Slice a named top-level declaration out of the panel module and run it. */
function loadPanelDeclarations(names, globals = {}) {
    const { loadDeclarationsFrom } = require('./helpers/monolith');
    return loadDeclarationsFrom(source, names, globals);
}

test('a setting equal to its default is not reported as changed', () => {
    const { settingDiffersFromDefault } = loadPanelDeclarations(['settingDiffersFromDefault'], {
        appState: { settings: { a: true, b: 'x', c: 3, list: [1, 2], obj: { k: 1 } } },
        settingsManager: { defaults: { a: true, b: 'x', c: 3, list: [1, 2], obj: { k: 1 } } }
    });

    for (const key of ['a', 'b', 'c', 'list', 'obj']) {
        assert.equal(settingDiffersFromDefault(key), false,
            `${key} matches its default and must not be listed as changed`);
    }
    // A list or an object is a fresh instance on every read, so identity
    // comparison alone would mark every one of them changed forever.
});

test('a setting the user moved is reported as changed', () => {
    const { settingDiffersFromDefault } = loadPanelDeclarations(['settingDiffersFromDefault'], {
        appState: { settings: { a: false, b: 'y', list: [1, 2, 3], obj: { k: 2 } } },
        settingsManager: { defaults: { a: true, b: 'x', list: [1, 2], obj: { k: 1 } } }
    });

    for (const key of ['a', 'b', 'list', 'obj']) {
        assert.equal(settingDiffersFromDefault(key), true, `${key} was changed`);
    }
});

test('a key with no default and a missing key are handled without throwing', () => {
    const { settingDiffersFromDefault } = loadPanelDeclarations(['settingDiffersFromDefault'], {
        appState: { settings: { orphan: 1 } },
        settingsManager: { defaults: {} }
    });

    assert.equal(settingDiffersFromDefault(''), false, 'no key is not a change');
    assert.equal(settingDiffersFromDefault('neverHeardOfIt'), false,
        'undefined on both sides is not a change');
    assert.equal(settingDiffersFromDefault('orphan'), true,
        'a value with no shipped default is a change, not a crash');
});

test('a value that cannot be serialised is treated as changed rather than hidden', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    const { settingDiffersFromDefault } = loadPanelDeclarations(['settingDiffersFromDefault'], {
        appState: { settings: { weird: cyclic } },
        settingsManager: { defaults: { weird: {} } }
    });

    assert.equal(settingDiffersFromDefault('weird'), true,
        'failing to compare must not quietly drop the setting out of the changed list');
});

test('the same unserialisable object on both sides is not a change', () => {
    // The identity check ahead of the structural one is not an optimisation:
    // a value JSON cannot walk makes the structural compare throw, and the
    // catch calls that changed. A setting still holding its shipped default
    // would then be listed as changed forever, with a reset button that does
    // nothing.
    const shared = {};
    shared.self = shared;
    const { settingDiffersFromDefault } = loadPanelDeclarations(['settingDiffersFromDefault'], {
        appState: { settings: { shared } },
        settingsManager: { defaults: { shared } }
    });

    assert.equal(settingDiffersFromDefault('shared'), false);
});

test('a deep link is accepted only in the shape the panel publishes', () => {
    const { deepLinkedSettingKey } = loadPanelDeclarations(['DEEP_LINK_PREFIX', 'SETTING_KEY_SHAPE', 'deepLinkedSettingKey'], {});

    assert.equal(deepLinkedSettingKey('#ytkit-setting=classicPlayerChrome'), 'classicPlayerChrome');
    assert.equal(deepLinkedSettingKey('#ytkit-setting=' + encodeURIComponent('videoNotes')), 'videoNotes');
    assert.equal(deepLinkedSettingKey('#ytkit-setting=_activeProfile'), '_activeProfile');
});

test('a deep link that is not a setting key is refused', () => {
    const { deepLinkedSettingKey } = loadPanelDeclarations(['DEEP_LINK_PREFIX', 'SETTING_KEY_SHAPE', 'deepLinkedSettingKey'], {});

    for (const hash of [
        '',
        '#',
        '#something-else',
        '#ytkit-setting=',
        '#ytkit-setting=has spaces',
        '#ytkit-setting=has-a-dash',
        '#ytkit-setting=../../etc',
        '#ytkit-setting="]',
        '#ytkit-setting=' + 'x'.repeat(90),
        '#ytkit-setting=%E0%A4%A',
        // Same length as the prefix, different fragment. Slicing without
        // checking the prefix turns '#ytkit-search=videoNotes' into 'oNotes'.
        '#ytkit-search=videoNotes',
        '#ytkit-profile=darkPreset'
    ]) {
        assert.equal(deepLinkedSettingKey(hash), '',
            `${JSON.stringify(hash)} must not be treated as a setting key`);
    }
});

test('the deep-linked key is matched against the card, never interpolated into a selector', () => {
    // The key comes off the URL bar. Building a selector string from it is how
    // a fragment turns into a query the panel did not intend.
    const start = source.indexOf('function openPanelToDeepLinkedSetting');
    const end = source.indexOf('\n        }', start);
    assert.ok(start > 0 && end > start, 'the deep-link opener must exist');
    const body = source.slice(start, end);

    assert.match(body, /dataset\.settingKey === key \|\| entry\.dataset\.featureId === key/,
        'the key is compared to a data attribute, not spliced into a selector');
    assert.doesNotMatch(body, /querySelector\([^)]*\$\{key\}/,
        'the key must never be interpolated into a query');
});

test('the changed filter and the search compose in one pass', () => {
    // Two filters each setting style.display independently means whichever runs
    // last wins and the other silently does nothing.
    assert.match(source,
        /const matches = haystack\.includes\(query\) && \(!_changedOnly \|\| cardDiffersFromDefault\(card\)\);/,
        'the search decision must include the changed-only state');
});

test('the Changed button is painted from the live filter state', () => {
    // _changedOnly outlives the panel: it is module state, the panel is rebuilt
    // whenever it has been torn down. Hardcoding 'false' at build time shows an
    // unpressed button sitting over an already-filtered list.
    assert.match(source,
        /changedBtn\.setAttribute\('aria-pressed', _changedOnly \? 'true' : 'false'\);\s*\n\s*changedBtn\.classList\.toggle\('is-active', _changedOnly\);/,
        'the button has to read the state, not assume it');
    assert.doesNotMatch(source, /changedBtn\.setAttribute\('aria-pressed', 'false'\)/,
        'no hardcoded starting state');
});

test('the per-card reset is delegated, not wired per card', () => {
    // ~480 cards, rebuilt on every search and category switch. A listener each
    // is both slower and a leak the destroy contract would have to unwind.
    assert.match(source, /panel\.addEventListener\('click', \(event\) => \{[\s\S]{0,200}?ytkit-card-reset/,
        'one delegated listener on the panel');
    assert.match(source, /resetSingleSetting\(card\.dataset\.featureId, card\.dataset\.settingKey\)/);
});

test('the reset toast names the setting the way the panel does', () => {
    // Interpolating the storage key means voice-control users hear
    // "customProgressBarColor" for a row that reads "Custom progress bar
    // colour", and it disagrees with the reset button's own tooltip.
    const { settingDisplayName } = loadPanelDeclarations(['settingDisplayName'], {
        document: {
            querySelectorAll: () => [{
                dataset: { featureId: 'alphaFeature', settingKey: 'alpha' },
                querySelector: () => ({ textContent: 'Alpha setting' })
            }]
        }
    });

    assert.equal(settingDisplayName('alphaFeature', 'alpha'), 'Alpha setting');
});

test('the toast falls back to the key when there is no card to read', () => {
    const { settingDisplayName } = loadPanelDeclarations(['settingDisplayName'], {
        document: { querySelectorAll: () => [] }
    });

    assert.equal(settingDisplayName('missingFeature', 'alpha'), 'alpha',
        'a nameless toast is worse than one carrying the raw key');
});

// Reset goes through the card's own control and the handler a person's edit
// reaches. It used to write the default straight into settings, and the tests
// that stood here pinned exactly that: one save and a destroy/init. That path
// left the switch or the text showing the old value (a textarea blur then saved
// the old text back), skipped conflicts and a list card's parent re-init, found
// no default at all for the ~45 list cards, and left Custom CSS injected. These
// run the shipped handlers from attachUIEventListeners against the same state.
const CONTROL = {
    toggle: { prefix: 'ytkit-toggle-', selector: '.ytkit-feature-cb' },
    select: { prefix: 'ytkit-select-', selector: '.ytkit-select' },
    range: { prefix: 'ytkit-range-', selector: '.ytkit-range' },
    color: { prefix: 'ytkit-color-', selector: '[id^="ytkit-color-"]' },
    textarea: { prefix: 'ytkit-input-', selector: '.ytkit-input' }
};

function resetHarness({ settings, defaults, features, controls }) {
    const handlers = new Map();
    const appState = { settings: structuredClone(settings) };
    const calls = { saved: [], toasts: [], inited: [], destroyed: [], fired: [], focused: [], refreshed: 0 };
    const settingsManager = {
        defaults,
        save(next) {
            calls.saved.push(structuredClone(next));
            return Promise.resolve({ ok: true, settings: { ...next } });
        }
    };
    const getFeatureById = (id) => features[id] || null;
    const byId = new Map();
    const made = {};
    for (const [featureId, [kind, value]] of Object.entries(controls)) {
        const feature = features[featureId];
        const card = {
            dataset: { featureId, settingKey: feature?.settingKey || featureId },
            classList: { toggle() {}, contains: () => false, add() {}, remove() {} },
            querySelector: () => null,
            isConnected: true,
            getClientRects: () => [{}]
        };
        const control = {
            id: CONTROL[kind].prefix + featureId,
            dataset: {},
            disabled: false,
            checked: kind === 'toggle' ? value : undefined,
            value: kind === 'toggle' ? 'on' : value,
            selectedIndex: 0,
            get options() { return [{ text: String(control.value) }]; },
            matches: (selector) => selector === CONTROL[kind].selector,
            closest: (selector) => (selector === '[data-feature-id]' || selector === '.ytkit-feature-card' ? card : null),
            setAttribute() {},
            removeAttribute() {},
            focus() { calls.focused.push(control.id); },
            dispatchEvent(event) {
                calls.fired.push(`${event.type}:${featureId}`);
                for (const handler of handlers.get(event.type) || []) handler({ type: event.type, target: control });
                return true;
            },
            card
        };
        byId.set(control.id, control);
        made[featureId] = control;
    }
    const changedFilter = { id: 'ytkit-search-changed', focus() { calls.focused.push('ytkit-search-changed'); } };
    byId.set(changedFilter.id, changedFilter);
    const panel = { contains: () => true };
    byId.set('ytkit-settings-panel', panel);
    const doc = {
        body: { classList: { contains: () => true, toggle() {} } },
        documentElement: { classList: { toggle() {} }, style: {} },
        activeElement: null,
        getElementById: (id) => byId.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, handler) {
            if (!handlers.has(type)) handlers.set(type, []);
            handlers.get(type).push(handler);
        },
        removeEventListener() {}
    };
    const t = (_key, fallback) => fallback;
    const showToast = (message, colour, opts) => calls.toasts.push({ message, opts });

    const originalDocument = globalThis.document;
    const originalFeatures = globalThis.YTKitFeatures;
    const modulePath = path.join(REPO_ROOT, 'extension', 'features', 'settings-panel', 'index.js');
    globalThis.document = doc;
    delete require.cache[require.resolve(modulePath)];
    globalThis.YTKitFeatures = {};
    const runtime = require(modulePath).createSettingsPanelRuntime({
        PANEL_OPEN_CLASS: 'ytkit-panel-open',
        CONFLICT_MAP: require('../extension/core/settings-schema').SETTING_CONFLICTS,
        appState,
        DebugManager: { log() {} },
        StorageManager: { get: (_key, fallback) => fallback, set() {}, setSync: async () => ({ ok: true }) },
        shouldBuildPrimaryUI: () => true,
        buildSettingsPanel: () => panel,
        createToast() {},
        injectStyle: () => ({ remove() {} }),
        isBooleanFeature: () => true,
        getFeatureById,
        getFeatureName: (feature) => feature?.name,
        getFeatureDescription: () => '',
        getFocusableUiElements: () => [],
        liveFeatureList: [],
        requestFeatureOptionalHosts: async () => true,
        safeInitFeature() {},
        safeDestroyFeature() {},
        initFeatureLifecycle: (feature, reason) => calls.inited.push(`${feature.id}:${reason}`),
        destroyFeatureLifecycle: (feature, reason) => calls.destroyed.push(`${feature.id}:${reason}`),
        settingsManager,
        showToast,
        t
    });
    globalThis.YTKitFeatures = originalFeatures;
    runtime.attachUIEventListeners();

    const { resetSingleSetting } = loadPanelDeclarations([
        'settingDisplayName', 'driveCardControl', 'resetSingleSetting'
    ], {
        appState,
        settingsManager,
        getFeatureById,
        refreshChangedFilterView: () => { calls.refreshed += 1; },
        showToast,
        document: doc,
        Event,
        setTimeout,
        t
    });
    // The switch saves after an awaited host check, and Reset settles again
    // on the next task to follow it.
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
    return {
        resetSingleSetting, appState, calls, controls: made, settled,
        restore() { globalThis.document = originalDocument; },
        edit(featureId, value) {
            const control = made[featureId];
            control.value = value;
            for (const handler of handlers.get('input') || []) handler({ type: 'input', target: control });
        }
    };
}

async function withReset(options, fn) {
    const h = resetHarness(options);
    try {
        await fn(h);
    } finally {
        h.restore();
    }
}

test('Reset sets the switch back and goes through the switch handler', async () => {
    await withReset({
        settings: { alpha: true },
        defaults: { alpha: false },
        features: { alpha: { id: 'alpha', name: 'Alpha' } },
        controls: { alpha: ['toggle', true] }
    }, async (h) => {
        assert.equal(h.resetSingleSetting('alpha', 'alpha'), true);
        await h.settled();
        assert.equal(h.controls.alpha.checked, false, 'the switch shows the default');
        assert.equal(h.appState.settings.alpha, false);
        assert.equal(h.calls.saved.at(-1).alpha, false, 'a reset that is not saved is undone by the next reload');
        assert.deepEqual(h.calls.destroyed, ['alpha:toggle'], 'torn down the way a switch turned off is');
        assert.deepEqual(h.calls.inited, [], 'and not started again');
        assert.ok(h.calls.refreshed >= 1, 'the changed count and filter reflect the reset');
    });
});

test('undo puts back what the user had, through the same switch', async () => {
    await withReset({
        settings: { alpha: true },
        defaults: { alpha: false },
        features: { alpha: { id: 'alpha', name: 'Alpha' } },
        controls: { alpha: ['toggle', true] }
    }, async (h) => {
        h.resetSingleSetting('alpha', 'alpha');
        await h.settled();
        const undo = h.calls.toasts[0]?.opts?.action;
        assert.ok(undo && typeof undo.onClick === 'function', 'the reset toast offers an undo');
        undo.onClick();
        await h.settled();
        assert.equal(h.controls.alpha.checked, true);
        assert.equal(h.appState.settings.alpha, true);
        assert.equal(h.calls.saved.at(-1).alpha, true, 'the undo persists too');
        assert.deepEqual(h.calls.inited, ['alpha:toggle']);
    });
});

test('Reset of a list card puts its member back and re-inits the parent', async () => {
    await withReset({
        settings: { hideGuide: true, guideHideItems: ['shorts', 'music'] },
        defaults: { hideGuide: true, guideHideItems: ['music'] },
        features: {
            hideGuide: { id: 'hideGuide', name: 'Hide guide items' },
            guideHide_shorts: { id: 'guideHide_shorts', name: 'Shorts', _arrayKey: 'guideHideItems', _arrayValue: 'shorts', parentId: 'hideGuide' }
        },
        controls: { guideHide_shorts: ['toggle', true] }
    }, async (h) => {
        assert.equal(h.resetSingleSetting('guideHide_shorts', undefined), true,
            'a list card has no default of its own; its list does');
        await h.settled();
        assert.equal(h.controls.guideHide_shorts.checked, false);
        assert.deepEqual(h.appState.settings.guideHideItems, ['music']);
        assert.deepEqual(h.calls.destroyed, ['hideGuide:array-toggle']);
        assert.deepEqual(h.calls.inited, ['hideGuide:array-toggle']);
    });
});

test('Reset of a text setting saves the default and blurs, so the blur saves it too', async () => {
    await withReset({
        settings: { customCssCode: 'body { display: none }' },
        defaults: { customCssCode: '' },
        features: { customCssCode: { id: 'customCssCode', type: 'textarea', settingKey: 'customCssCode', name: 'Custom CSS' } },
        controls: { customCssCode: ['textarea', 'body { display: none }'] }
    }, async (h) => {
        h.resetSingleSetting('customCssCode', 'customCssCode');
        await h.settled();
        assert.equal(h.controls.customCssCode.value, '', 'the field shows the default');
        assert.equal(h.appState.settings.customCssCode, '');
        // The card's own blur listener saves the field and announces
        // ytkit-settings-changed, which is what takes Custom CSS off the page.
        assert.deepEqual(h.calls.fired, ['input:customCssCode', 'blur:customCssCode']);
    });
});

test('Reset of a choice and a slider shows the default and saves it as the handler would', async () => {
    await withReset({
        settings: { persistentSpeedValue: 1.5, playerVolume: 40 },
        defaults: { persistentSpeedValue: 1, playerVolume: 100 },
        features: {
            persistentSpeed: { id: 'persistentSpeed', type: 'select', settingKey: 'persistentSpeedValue', name: 'Speed', init() {}, destroy() {} },
            playerVolume: { id: 'playerVolume', type: 'range', name: 'Volume' }
        },
        controls: { persistentSpeed: ['select', '1.5'], playerVolume: ['range', '40'] }
    }, async (h) => {
        h.resetSingleSetting('persistentSpeed', 'persistentSpeedValue');
        h.resetSingleSetting('playerVolume', 'playerVolume');
        await h.settled();
        assert.equal(h.controls.persistentSpeed.value, '1');
        assert.strictEqual(h.appState.settings.persistentSpeedValue, 1, 'a number setting stays a number');
        assert.equal(h.controls.playerVolume.value, '100');
        assert.strictEqual(h.appState.settings.playerVolume, 100);
        assert.ok(h.calls.destroyed.includes('persistentSpeed:select'), 'the choice is applied at once');
    });
});

test('a colour reset or Clear stores "no override", not blue', async () => {
    await withReset({
        settings: { themeAccentColor: '#ff0000' },
        defaults: { themeAccentColor: '' },
        features: { themeAccentColor: { id: 'themeAccentColor', type: 'color', name: 'Accent' } },
        controls: { themeAccentColor: ['color', '#ff0000'] }
    }, async (h) => {
        h.resetSingleSetting('themeAccentColor', 'themeAccentColor');
        await h.settled();
        assert.strictEqual(h.appState.settings.themeAccentColor, '');
        assert.notEqual(h.controls.themeAccentColor.value, '#ff0000', 'the swatch moves off the old colour');
        assert.equal(h.controls.themeAccentColor.dataset.ytkitPendingValue, undefined, 'and the handler took the value');
    });
    assert.match(source, /clearBtn\.onclick = \(\) => \{ driveCardControl\(f\.id, settingsManager\?\.defaults\?\.\[settingKey\] \?\? ''\); \};/,
        'Clear goes through the same path to the shipped default');
});

test('an edit back to the default clears the card\'s Reset marker, and one away sets it', async () => {
    await withReset({
        settings: { playerTheme: 'dark' },
        defaults: { playerTheme: 'dark' },
        features: { playerTheme: { id: 'playerTheme', type: 'select', name: 'Theme' } },
        controls: { playerTheme: ['select', 'dark'] }
    }, async (h) => {
        h.edit('playerTheme', 'light');
        assert.equal(h.controls.playerTheme.card.dataset.changed, '1');
        h.edit('playerTheme', 'dark');
        assert.equal(h.controls.playerTheme.card.dataset.changed, '');
    });
});

test('an outside settings change draws "no override" as the default swatch, not black', () => {
    const { loadDeclarations } = require('./helpers/monolith');
    // Like the browser's: a value that isn't #rrggbb becomes black.
    const color = {
        current: '#ff0000',
        get value() { return this.current; },
        set value(next) { this.current = /^#[0-9a-f]{6}$/i.test(next) ? next.toLowerCase() : '#000000'; }
    };
    const card = {
        dataset: { featureId: 'themeAccentColor' },
        classList: { toggle() {}, contains: () => false },
        querySelector: (selector) => (selector === '[id^="ytkit-color-"]' ? color : null)
    };
    const settings = { themeAccentColor: '' };
    const { syncSettingsPanelControls } = loadDeclarations(['syncSettingsPanelControls'], {
        document: {
            querySelectorAll: (selector) => (selector === '.ytkit-feature-card[data-feature-id]' ? [card] : []),
            querySelector: () => null
        },
        getFeatureById: (id) => ({ id }),
        getFeatureSettingKey: (feature) => feature.settingKey || feature.id,
        appState: { settings }
    });
    syncSettingsPanelControls();
    assert.equal(color.value, '#3b82f6');
    settings.themeAccentColor = '#00ff00';
    syncSettingsPanelControls();
    assert.equal(color.value, '#00ff00', 'a real colour still lands');
});

test('focus stays on the card, or moves to the Changed filter when the card has left it', async () => {
    for (const [visible, expected] of [[true, 'ytkit-toggle-alpha'], [false, 'ytkit-search-changed']]) {
        await withReset({
            settings: { alpha: true },
            defaults: { alpha: false },
            features: { alpha: { id: 'alpha', name: 'Alpha' } },
            controls: { alpha: ['toggle', true] }
        }, async (h) => {
            h.controls.alpha.card.getClientRects = () => (visible ? [{}] : []);
            h.resetSingleSetting('alpha', 'alpha');
            await h.settled();
            assert.equal(h.calls.focused.at(-1), expected);
        });
    }
});

test('a card with no shipped default resets nothing at all', async () => {
    await withReset({
        settings: { orphan: 'whatever' },
        defaults: {},
        features: { orphan: { id: 'orphan', type: 'textarea', name: 'Orphan' } },
        controls: { orphan: ['textarea', 'whatever'] }
    }, async (h) => {
        assert.equal(h.resetSingleSetting('orphan', 'orphan'), false);
        await h.settled();
        assert.equal(h.appState.settings.orphan, 'whatever');
        assert.deepEqual(h.calls.fired, [], 'the control is left alone');
        assert.deepEqual(h.calls.saved, [], 'nothing was reset, so nothing may be written');
        assert.deepEqual(h.calls.toasts, [], 'and nothing may claim it was');
    });
});

test('the Changed filter counts a list card by its membership', () => {
    const features = {
        guideHide_shorts: { id: 'guideHide_shorts', _arrayKey: 'guideHideItems', _arrayValue: 'shorts' }
    };
    const differs = (items) => loadPanelDeclarations(['settingDiffersFromDefault', 'cardDiffersFromDefault'], {
        appState: { settings: { guideHideItems: items } },
        settingsManager: { defaults: { guideHideItems: ['music'] } },
        getFeatureById: (id) => features[id]
    }).cardDiffersFromDefault({ dataset: { featureId: 'guideHide_shorts' } });
    assert.equal(differs(['music', 'shorts']), true, 'switched on, off by default');
    assert.equal(differs(['music']), false);
    assert.equal(differs([]), false, 'another member moving is that card\'s change, not this one');
});

/** A stand-in card that records what the deep-link opener did to it. */
function fakeCard(key, log) {
    return {
        dataset: { settingKey: key },
        classList: { add: (cls) => log.push(`add:${key}:${cls}`), remove: () => {} },
        closest: () => null,
        querySelector: () => null,
        scrollIntoView: () => {},
        focus: () => log.push(`focus:${key}`)
    };
}

function fakePanel(cards) {
    return { querySelectorAll: (sel) => (sel === '.ytkit-deep-linked' ? [] : cards) };
}

const DEEP_LINK_NAMES = [
    'DEEP_LINK_PREFIX', 'SETTING_KEY_SHAPE', '_requestedSettingKey', 'deepLinkedSettingKey',
    'requestSettingFocus', 'openPanelToDeepLinkedSetting'
];

test('a request from another surface outranks a stale URL fragment', () => {
    // The popup opens the panel by message when the tab already has one. If the
    // user's YouTube URL still carries an old fragment, the request they just
    // made has to win.
    const log = [];
    const cards = [fakeCard('oldOne', log), fakeCard('newOne', log)];
    const panel = fakePanel(cards);

    const env = loadPanelDeclarations(DEEP_LINK_NAMES, {
        document: { getElementById: () => panel },
        CSS: { escape: (v) => v }
    });
    env.globalThis.location = { hash: '#ytkit-setting=oldOne' };

    assert.equal(env.requestSettingFocus('newOne'), true);
    assert.deepEqual(log, ['add:newOne:ytkit-deep-linked', 'focus:newOne']);
});

test('the URL fragment is still honoured when nothing else asked', () => {
    const log = [];
    const panel = fakePanel([fakeCard('fromHash', log)]);
    const env = loadPanelDeclarations(DEEP_LINK_NAMES, {
        document: { getElementById: () => null },
        CSS: { escape: (v) => v }
    });
    env.globalThis.location = { hash: '#ytkit-setting=fromHash' };

    assert.equal(env.openPanelToDeepLinkedSetting(panel), true);
    assert.deepEqual(log, ['add:fromHash:ytkit-deep-linked', 'focus:fromHash']);
});

test('opening a second setting clears the first one highlight', () => {
    // The highlight is how the user finds the row they were sent to. Leaving
    // the old one lit means the next deep link points at two settings at once.
    const lit = new Set();
    const card = (key) => ({
        dataset: { settingKey: key },
        classList: { add: () => lit.add(key), remove: () => lit.delete(key) },
        closest: () => null, querySelector: () => null, scrollIntoView: () => {}, focus: () => {}
    });
    const cards = [card('first'), card('second')];
    const panel = {
        querySelectorAll: (sel) => (sel === '.ytkit-deep-linked'
            ? cards.filter((entry) => lit.has(entry.dataset.settingKey))
            : cards)
    };
    const env = loadPanelDeclarations(DEEP_LINK_NAMES, {
        document: { getElementById: () => panel },
        CSS: { escape: (v) => v }
    });
    env.globalThis.location = { hash: '' };

    env.requestSettingFocus('first');
    assert.deepEqual([...lit], ['first']);
    env.requestSettingFocus('second');
    assert.deepEqual([...lit], ['second'], 'only the setting just asked for stays lit');
});

test('a request is drained, so it does not fire again later', () => {
    const log = [];
    const panel = fakePanel([fakeCard('alpha', log)]);
    const env = loadPanelDeclarations(DEEP_LINK_NAMES, {
        document: { getElementById: () => null },
        CSS: { escape: (v) => v }
    });
    env.globalThis.location = { hash: '' };

    env.requestSettingFocus('alpha');
    assert.equal(env.openPanelToDeepLinkedSetting(panel), true,
        'the panel picks the request up when it builds');
    assert.equal(env.openPanelToDeepLinkedSetting(panel), false,
        'a second build must not re-open a request the user already got');
    assert.deepEqual(log, ['add:alpha:ytkit-deep-linked', 'focus:alpha']);
});

test('a request that names nothing valid is refused before it is stored', () => {
    const env = loadPanelDeclarations(DEEP_LINK_NAMES, {
        document: { getElementById: () => null },
        CSS: { escape: (v) => v }
    });

    for (const bad of ['', null, undefined, 'has spaces', 'has-a-dash', '../etc', 'x'.repeat(90)]) {
        assert.equal(env.requestSettingFocus(bad), false, `${bad} must not be accepted`);
    }
});

test('the popup carries the key on both routes to the panel', () => {
    // Message when the tab already runs the content script, URL fragment when a
    // new tab has to be opened. Dropping it on either route leaves the user on
    // whatever category was last shown, which for 484 settings is not a link.
    const popup = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'popup.js'), 'utf8');

    assert.match(popup, /void openSettingsSurfaceForKey\(entry\.key\)/,
        'the chip has to pass the key it is standing next to');
    assert.match(popup, /sendPanelOpenMessage\(tab\.id, key\)/);
    assert.match(popup, /type: PANEL_OPEN_MESSAGE, settingKey/);
    assert.match(popup, /\$\{PANEL_DEEP_LINK\}\$\{encodeURIComponent\(key\)\}/,
        'the fragment route has to encode the key');
});

test('the content script re-checks the key it was handed', () => {
    // It arrives from another process, so the panel cannot trust the popup's
    // check. requestSettingFocus is where that second check lives, and it lives
    // in the peeled module's closure: the handler has to go through the runtime
    // accessor, not call a bare name ytkit.js does not define.
    const ytkit = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
    assert.match(ytkit,
        /getSettingsPanelRuntime\(\)\?\.requestSettingFocus\?\.\(message\.settingKey\)/,
        'the handler has to reach the module that owns the requested key');
    assert.match(source, /^            requestSettingFocus,$/m,
        'and the runtime has to export it');
});

test('the new copy is translatable and carries no dash', () => {
    const en = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, 'extension', '_locales', 'en', 'messages.json'), 'utf8'));

    for (const key of [
        'settingsChangedFilter', 'settingsChangedFilterTitle', 'settingsChangedCountTpl',
        'settingsChangedNone', 'settingsCardReset', 'settingsCardResetTitleTpl',
        'settingsSingleResetToastTpl'
    ]) {
        assert.ok(en[key], `${key} must exist in the English catalogue`);
        assert.doesNotMatch(en[key].message, /[–—]/,
            `${key} carries an em or en dash, which the copy gate forbids`);
    }
});
