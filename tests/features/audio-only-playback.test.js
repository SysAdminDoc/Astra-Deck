'use strict';

// Audio-only / bandwidth-saver mode. YouTube exposes no true audio-only stream
// to extensions, so the contract under test is that the feature never CLAIMS
// one it did not get: it probes, falls back to the cheapest quality, and
// publishes which of the two actually happened.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');
const { sources } = require('../helpers/source');

const repoRoot = path.join(__dirname, '..', '..');
const mainWorldSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
const schema = require('../../extension/core/settings-schema.js');
const defaults = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'extension', 'default-settings.json'), 'utf8'));

// Lift the two MAIN-world quality pickers out of their IIFE.
function qualityPickers() {
    const start = mainWorldSource.indexOf("var LADDER = ['tiny'");
    const end = mainWorldSource.indexOf('function apply(ctx)', start);
    assert.ok(start > -1 && end > start, 'the audio-only quality pickers must exist');
    const sandbox = { console };
    return vm.runInNewContext(
        `${mainWorldSource.slice(start, end)}\n({ cheapestQuality: cheapestQuality, audioOnlyQuality: audioOnlyQuality })`,
        sandbox);
}

test('audio-only is a real setting, off by default, and declares its conflicts', () => {
    const entry = schema.SETTINGS_SCHEMA.find((e) => e.key === 'audioOnlyPlayback');
    assert.ok(entry, 'audioOnlyPlayback must be in the schema');
    assert.equal(entry.type, 'boolean');
    assert.equal(entry.defaultValue, false, 'a mode that hides the video must be opt-in');
    assert.equal(entry.destroyRequired, true, 'it changes player state, so teardown must run');
    assert.equal(defaults.audioOnlyPlayback, false);

    // It pins the CHEAPEST stream; the quality-raising features pin the
    // opposite through the same player call, so the conflict must be declared
    // in both directions or whichever ran last silently wins.
    const start = sources.ytkit.indexOf('const CONFLICT_MAP');
    const map = sources.ytkit.slice(start, start + 3500);
    assert.match(map, /audioOnlyPlayback: \{ conflicts: \['autoMaxResolution', 'qualityProfileMatrix'\]/);
    assert.match(map, /autoMaxResolution: \{ conflicts: \['audioOnlyPlayback'\]/);
    assert.match(map, /qualityProfileMatrix: \{ conflicts: \['audioOnlyPlayback'\]/);
});

test('the cheapest-quality picker walks the ladder the player actually offers', () => {
    const { cheapestQuality } = qualityPickers();

    assert.equal(cheapestQuality({ getAvailableQualityLevels: () => ['hd1080', 'large', 'medium', 'tiny'] }), 'tiny');
    assert.equal(cheapestQuality({ getAvailableQualityLevels: () => ['hd1080', 'large', 'medium'] }), 'medium',
        'a video with no 144p must still pick its own floor, not a level it lacks');
    assert.equal(cheapestQuality({ getAvailableQualityLevels: () => ['hd2160', 'hd1440'] }), 'hd1440',
        'when nothing on the ladder is offered, the last entry is the cheapest available');

    // The quality API is not public, so its absence must not throw.
    assert.equal(cheapestQuality({}), 'tiny');
    assert.equal(cheapestQuality({ getAvailableQualityLevels: () => { throw new Error('nope'); } }), 'tiny');
    assert.equal(cheapestQuality({ getAvailableQualityLevels: () => [] }), 'tiny');
});

test('an audio-only stream is only claimed when the player really reports one', () => {
    const { audioOnlyQuality } = qualityPickers();

    // No shipping build exposes one — the honest answer is null.
    assert.equal(audioOnlyQuality({}), null);
    assert.equal(audioOnlyQuality({
        getAvailableQualityData: () => [{ quality: 'tiny', qualityLabel: '144p' }]
    }), null, 'a low video quality is NOT an audio-only stream');

    // …but if one ever appears, it is preferred without a code change.
    assert.equal(audioOnlyQuality({
        getAvailableQualityData: () => [
            { quality: 'hd1080', qualityLabel: '1080p' },
            { quality: 'audio', qualityLabel: 'Audio only', isAudioOnly: true }
        ]
    }), 'audio');
    assert.equal(audioOnlyQuality({
        getAvailableQualityData: () => [{ quality: 'aud', qualityLabel: 'AUDIO ONLY' }]
    }), 'aud', 'the label is matched case-insensitively');

    assert.equal(audioOnlyQuality({
        getAvailableQualityData: () => { throw new Error('undocumented'); }
    }), null);
});

test('the bridge publishes what it did, never an unearned audio-only claim', () => {
    const start = mainWorldSource.indexOf("var ENABLE_ATTR = 'data-ytkit-audio-only'");
    const block = mainWorldSource.slice(start, start + 6000);

    assert.match(block, /writeStatus\('applied', \(audioQuality \? 'audio-stream:' : 'lowest-quality:'\) \+ target\)/,
        'the reason string must distinguish a real audio stream from the fallback');
    assert.match(block, /writeStatus\('skipped', 'live-stream'\)/,
        'live streams must no-op with a stated reason');
    assert.match(block, /writeStatus\('degraded', 'player-api-missing'\)/,
        'a player without the quality API must degrade, not pretend');
    assert.match(block, /p\.setPlaybackQualityRange\(restoreQuality, restoreQuality\)/,
        'disabling must hand the quality pin back, not leave the player at 144p');
});

test('the ISOLATED surface reports the fallback distinctly from a real audio stream', () => {
    const root = fakeNode({ tag: 'html' });
    const player = fakeNode({ tag: 'div' });
    const document = Object.assign(
        fakeDocument((sel) => (sel.includes('movie_player') ? player : [])),
        { documentElement: root, createElement: () => fakeNode({ tag: 'div' }) });

    const labels = [];
    const feature = loadFeature('audioOnlyPlayback', {
        document,
        injectStyle: () => fakeNode({ tag: 'style' }),
        setFeatureHealth() {},
        DiagnosticLog: { record() {} },
        MutationObserver: function () { return { observe() {}, disconnect() {} }; }
    });
    feature._renderPill = (label, tone) => labels.push([label, tone]);

    root.setAttribute('data-ytkit-audio-only-status', 'applied');
    root.setAttribute('data-ytkit-audio-only-reason', 'lowest-quality:tiny');
    feature._syncStatus();
    assert.deepEqual(labels.pop(), ['Audio mode · lowest quality', 'ok'],
        'the fallback must say so rather than claiming audio-only');

    root.setAttribute('data-ytkit-audio-only-reason', 'audio-stream:audio');
    feature._syncStatus();
    assert.deepEqual(labels.pop(), ['Audio only', 'ok']);

    root.setAttribute('data-ytkit-audio-only-status', 'skipped');
    feature._syncStatus();
    assert.deepEqual(labels.pop(), ['Audio-only off for live', 'warn']);

    root.setAttribute('data-ytkit-audio-only-status', 'degraded');
    feature._syncStatus();
    assert.deepEqual(labels.pop(), ['Audio-only unavailable', 'warn']);
});

test('teardown removes every attribute the bridge acts on', () => {
    const root = fakeNode({ tag: 'html' });
    const document = Object.assign(fakeDocument(() => []), { documentElement: root });
    const feature = loadFeature('audioOnlyPlayback', {
        document,
        injectStyle: () => fakeNode({ tag: 'style' }),
        setFeatureHealth() {},
        DiagnosticLog: { record() {} },
        MutationObserver: function () { return { observe() {}, disconnect() {} }; }
    });

    feature._apply();
    assert.equal(root.getAttribute('data-ytkit-audio-only'), 'on');

    feature.destroy();
    for (const attr of [
        'data-ytkit-audio-only',
        'data-ytkit-audio-only-status',
        'data-ytkit-audio-only-reason'
    ]) {
        assert.equal(root.getAttribute(attr), null, `${attr} must not survive teardown`);
    }
});

test('the video surface is hidden without detaching the media element', () => {
    // display:none / removing the element makes some player builds tear the
    // media element down, which stops the audio this mode exists to keep.
    const start = sources.ytkit.indexOf("id: 'audioOnlyPlayback'");
    const block = sources.ytkit.slice(start, start + 4000);
    assert.match(block, /visibility: hidden !important/);
    assert.doesNotMatch(block, /html5-main-video \{ display: none/);
    assert.match(block, /html:not\(\[dark\]\)/,
        'the collapsed surface needs a light-theme lane like every other injected surface');
});
