'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, extractFeatureBlock } = require('../helpers/source');
const fs = require('fs');
const path = require('path');

test('Player Dock feature block is reachable', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'floatingLogoOnWatch');
    assert.ok(block.length > 100,
        'floatingLogoOnWatch feature block must contain non-trivial source');
});

test('Player Dock peeled module exports a factory function', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');
    assert.match(modSrc, /createFloatingLogoOnWatchFeature/,
        'Module must export a createFloatingLogoOnWatchFeature factory');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
});

test('Player Dock creates player controls container', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');
    assert.match(modSrc, /ytkit-player-controls|ytkit-po-logo-wrap/,
        'Player Dock must create a player controls container');
});

test('Player Dock exposes a CC mirror for the hidden native subtitles control', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');
    for (const [label, source] of [
        ['module', modSrc],
        ['monolith', sources.ytkit],
        ['userscript', sources.userscript]
    ]) {
        assert.match(source, /ytkit-po-cc/, `${label} must render the CC button`);
        assert.match(source, /\.ytp-subtitles-button/, `${label} must target YouTube's native subtitles button`);
        assert.match(source, /nativeButton\.click\(\)/, `${label} must delegate CC clicks to YouTube`);
        assert.match(source, /aria-pressed/, `${label} must expose the captions state accessibly`);
    }
});

test('Player Dock speed picker wakes persistent speed reapply task', () => {
    assert.match(sources.ytkit, /f\._scheduleApply\?\.\(0,\s*'player-dock'\)/,
        'speed popup must wake persistentSpeed after changing the default speed');
    assert.match(sources.ytkit, /const video = getMainVideoElement\(\);[\s\S]{0,240}video\.playbackRate = value/,
        'speed popup must apply to the canonical main video element');
});

test('CC mirror prefers the watch player over an earlier inline preview player', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8');

    // Drive the real resolver rather than pinning its text: a selector LIST
    // resolves in document order, so the unscoped fallback would win whenever
    // the inline hover-preview player (which precedes ytd-page-manager) owns an
    // instantiated subtitles button.
    const previewButton = { id: 'preview' };
    const watchButton = { id: 'watch' };
    const fakeDocument = {
        querySelector(selector) {
            if (selector === '#movie_player .ytp-subtitles-button') return watchButton;
            if (selector === '.ytp-subtitles-button') return previewButton;
            return null;
        }
    };

    const body = modSrc.match(/_getNativeCcButton\(\)\s*\{([\s\S]*?)\n {12}\},/);
    assert.ok(body, 'module must define _getNativeCcButton');
    const resolve = new Function('document', body[1].replace(/typeof document === 'undefined'/, 'false'));
    assert.equal(resolve(fakeDocument), watchButton,
        'CC mirror must bind the #movie_player subtitles button, not the first one in the document');

    const onlyPreview = { querySelector: (s) => (s === '.ytp-subtitles-button' ? previewButton : null) };
    assert.equal(resolve(onlyPreview), previewButton,
        'CC mirror must still fall back when the watch player is not scoped yet');
});

test('CC observer does not attach before the mirror button exists', () => {
    for (const [label, source] of [
        ['module', fs.readFileSync(
            path.join(__dirname, '..', '..', 'extension', 'features', 'player-dock', 'index.js'), 'utf8')],
        ['monolith', sources.ytkit]
    ]) {
        const watchStart = source.indexOf('_watchCcState()');
        const watchBody = source.slice(watchStart, watchStart + 1400);
        assert.match(watchBody, /if \(!this\._ccButton\) return;/,
            `${label} must bail out of the CC observer when no mirror button is mounted`);
        assert.ok(
            watchBody.indexOf('if (!this._ccButton) return;') < watchBody.indexOf('new MutationObserver'),
            `${label} must bail out before constructing the observer`
        );
    }
});
