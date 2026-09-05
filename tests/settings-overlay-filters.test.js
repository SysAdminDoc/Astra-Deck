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

// Drive the shipped reset for real. Pinning its text let a mutation delete
// the save on the reset path and still pass, because the undo closure carried
// a second call to the same line.
function loadReset(settings) {
    const calls = { saved: [], toasts: [], destroyed: [], inited: [], refreshed: 0 };
    const state = { settings: { ...settings } };
    const { resetSingleSetting } = loadPanelDeclarations(['settingDisplayName', 'resetSingleSetting'], {
        appState: state,
        settingsManager: {
            defaults: { alpha: 'shipped', flag: true, off: false },
            save(next) { calls.saved.push({ ...next }); }
        },
        getFeatureById: (id) => (id ? { id } : null),
        destroyFeatureLifecycle: (feature, reason) => calls.destroyed.push(reason),
        initFeatureLifecycle: (feature, reason) => calls.inited.push(reason),
        DebugManager: { log() {} },
        refreshChangedFilterView: () => { calls.refreshed += 1; },
        showToast: (message, colour, opts) => calls.toasts.push({ message, colour, opts }),
        document: { querySelectorAll: () => [] },
        t: (key, fallback) => fallback
    });
    return { resetSingleSetting, calls, state };
}

test('resetting one setting writes the shipped default and persists it', () => {
    const { resetSingleSetting, calls, state } = loadReset({ alpha: 'moved' });

    assert.equal(resetSingleSetting('alphaFeature', 'alpha'), true);
    assert.equal(state.settings.alpha, 'shipped');
    assert.equal(calls.saved.length, 1, 'a reset that is not saved is undone by the next reload');
    assert.equal(calls.saved[0].alpha, 'shipped', 'the saved snapshot has to carry the reset value');
    assert.equal(calls.refreshed, 1, 'the changed count and filter have to reflect the reset');
    assert.deepEqual(calls.destroyed, ['single-reset']);
    assert.deepEqual(calls.inited, ['single-reset'], 'a truthy value re-inits the feature');
});

test('undo restores the value the user had, not the default again', () => {
    const { resetSingleSetting, calls, state } = loadReset({ alpha: 'moved' });
    resetSingleSetting('alphaFeature', 'alpha');

    const undo = calls.toasts[0]?.opts?.action;
    assert.ok(undo && typeof undo.onClick === 'function', 'the reset toast has to offer an undo');
    undo.onClick();

    assert.equal(state.settings.alpha, 'moved');
    assert.equal(calls.saved.length, 2, 'the undo has to persist too');
    assert.equal(calls.saved[1].alpha, 'moved');
    assert.equal(calls.refreshed, 2);
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

test('a card with no shipped default resets nothing at all', () => {
    const { resetSingleSetting, calls, state } = loadReset({ orphan: 'whatever' });

    assert.equal(resetSingleSetting('orphanFeature', 'orphan'), false);
    assert.equal(state.settings.orphan, 'whatever');
    assert.deepEqual(calls.saved, [], 'nothing was reset, so nothing may be written');
    assert.deepEqual(calls.toasts, [], 'and nothing may claim it was');
});

test('a falsy default tears the feature down without re-initialising it', () => {
    const { resetSingleSetting, calls } = loadReset({ off: true });
    const before = calls.inited.length;
    resetSingleSetting('offFeature', 'off');
    assert.deepEqual(calls.destroyed, ['single-reset']);
    assert.equal(calls.inited.length, before, 'a feature reset to off must not be started again');
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
