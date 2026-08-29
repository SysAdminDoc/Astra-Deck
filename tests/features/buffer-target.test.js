'use strict';

// The configurable VOD buffer goal. The value crosses a world boundary via a
// data attribute, so both halves are driven here: the ISOLATED publisher and
// the MAIN-world reader that clamps and re-applies it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

const repoRoot = path.join(__dirname, '..', '..');
const mainWorldSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
const schema = require('../../extension/core/settings-schema.js');
const defaults = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'extension', 'default-settings.json'), 'utf8'));

// Lift the MAIN-world clamp out of its IIFE so the boundaries can be exercised
// without standing up the whole bridge.
function mainWorldClamp() {
    const start = mainWorldSource.indexOf('function readTargetSeconds()');
    const end = mainWorldSource.indexOf('function syncFromAttr()', start);
    assert.ok(start > -1 && end > start, 'the MAIN-world clamp must exist');
    const constants = `
        var DEFAULT_TARGET_SECONDS = 20;
        var MAX_TARGET_SECONDS = 600;
        var MIN_TARGET_SECONDS = 5;
        var SECONDS_ATTR = 'data-ytkit-buffer-seconds';
    `;
    let attrValue = null;
    const sandbox = {
        // The slice reads its value through the sealed channel, not off the
        // attribute: that is the change that stopped a page script being able
        // to set the buffering goal. Here the channel is one value.
        _bridgeGet: () => attrValue,
        document: { documentElement: { getAttribute: () => attrValue } },
        Math, Number, isFinite
    };
    const read = vm.runInNewContext(
        `${constants}\n${mainWorldSource.slice(start, end)}\nreadTargetSeconds`, sandbox);
    return (value) => { attrValue = value; return read(); };
}

test('the buffer goal is a real setting, not a hardcoded constant', () => {
    const entry = schema.SETTINGS_SCHEMA.find((e) => e.key === 'bufferPreloadSeconds');
    assert.ok(entry, 'bufferPreloadSeconds must be in the schema');
    assert.equal(entry.type, 'number');
    assert.equal(entry.defaultValue, 20, 'existing installs must not change behaviour');
    assert.equal(entry.min, 5);
    assert.equal(entry.max, 600);
    assert.equal(defaults.bufferPreloadSeconds, 20);
    assert.ok(defaults.syncSafePrefsAllowlist.includes('bufferPreloadSeconds'),
        'the goal travels with its parent in sync-safe prefs');

    // The old fixed constant must be gone from the applying call.
    assert.doesNotMatch(mainWorldSource, /setBufferingGoal\(TARGET_SECONDS\)/,
        'the goal must come from the setting, not a module constant');
});

test('the MAIN-world reader clamps the goal to a range the media element can hold', () => {
    const read = mainWorldClamp();

    assert.equal(read('20'), 20, 'the declared value passes through');
    assert.equal(read('600'), 600, 'the ceiling is reachable');
    assert.equal(read('5'), 5, 'the floor is reachable');

    // Unbounded is the request; unbounded is not what gets sent to the player.
    assert.equal(read('99999'), 600, 'an oversized goal is capped, not forwarded');
    assert.equal(read('1'), 5, 'a sub-floor goal is raised');
    assert.equal(read('37.6'), 38, 'fractional seconds are rounded');

    // Anything unparseable falls back to the shipped default rather than 0,
    // which the player would read as "no buffering at all".
    for (const bad of [null, '', 'abc', '0', '-40', 'Infinity', 'NaN']) {
        assert.equal(read(bad), 20, `"${bad}" must fall back to the default`);
    }
});

test('changing the goal releases the per-video short-circuit', () => {
    // apply() returns early when the same video was already handled, so a new
    // goal would otherwise only land on the next navigation.
    // ytkit-main.js has several IIFEs with a syncFromAttr; anchor on the
    // buffer block so the slice is unambiguous.
    const blockStart = mainWorldSource.indexOf("var SECONDS_ATTR = 'data-ytkit-buffer-seconds'");
    assert.ok(blockStart > -1, 'the buffer bridge block must exist');
    const start = mainWorldSource.indexOf('function syncFromAttr()', blockStart);
    const block = mainWorldSource.slice(start, start + 900);
    assert.match(block, /if \(nextSeconds !== targetSeconds\)/,
        'a changed goal must be detected');
    assert.match(block, /lastAppliedVideo = null;/,
        'the short-circuit must be released so the running video picks up the new goal');
    assert.match(mainWorldSource, /_obsRegister\(\[ENABLE_ATTR, SECONDS_ATTR\], syncFromAttr\)/,
        'the seconds attribute must be observed, not just read once');
});

test('the ISOLATED side publishes the goal and clears it on teardown', () => {
    const root = fakeNode({ tag: 'html' });
    const document = Object.assign(fakeDocument(() => []), { documentElement: root });
    const feature = loadFeature('bufferPreload', {
        document,
        appState: { settings: { bufferPreloadSeconds: 300 } },
        MutationObserver: function () { return { observe() {}, disconnect() {} }; },
        setFeatureHealth() {},
        DiagnosticLog: { record() {} }
    });

    feature._apply();
    assert.equal(root.getAttribute('data-ytkit-buffer-seconds'), '300');
    assert.equal(root.getAttribute('data-ytkit-buffer-preload'), 'on');

    // The publisher clamps too, so a corrupted setting cannot reach the player.
    feature.appState = undefined;
    assert.equal(feature._targetSeconds.call({
        ...feature,
        _targetSeconds: feature._targetSeconds
    }), 300, 'the helper reads the live setting');

    feature.destroy();
    assert.equal(root.getAttribute('data-ytkit-buffer-seconds'), null,
        'teardown must not leave a goal the bridge would keep applying');
    assert.equal(root.getAttribute('data-ytkit-buffer-preload'), null);
});

test('the sub-feature re-publishes through its parent so the value applies live', () => {
    let republished = 0;
    const parent = { _initialized: true, _apply() { republished += 1; } };
    const feature = loadFeature('bufferPreloadSeconds', {
        document: fakeDocument(() => []),
        getFeatureById: (id) => (id === 'bufferPreload' ? parent : null)
    });

    assert.equal(feature.parentId, 'bufferPreload');
    assert.equal(feature.type, 'range');
    assert.equal(feature.min, 5);
    assert.equal(feature.max, 600);

    feature.init();
    assert.equal(republished, 1, 'changing the value must re-publish the attribute');
    feature.destroy();
    assert.equal(republished, 2, 'reverting to the default must re-publish too');

    // A disabled parent must not be poked.
    parent._initialized = false;
    feature.init();
    assert.equal(republished, 2);
});

test('the slider label reads in minutes once the goal passes a minute', () => {
    const feature = loadFeature('bufferPreloadSeconds', {
        document: fakeDocument(() => []),
        getFeatureById: () => null
    });
    assert.equal(feature.formatValue(20), '20s');
    assert.equal(feature.formatValue(45), '45s');
    assert.equal(feature.formatValue(60), '1 min');
    assert.equal(feature.formatValue(600), '10 min');
});
