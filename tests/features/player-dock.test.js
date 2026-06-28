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

test('Player Dock speed picker wakes persistent speed reapply task', () => {
    assert.match(sources.ytkit, /f\._scheduleApply\?\.\(0,\s*'player-dock'\)/,
        'speed popup must wake persistentSpeed after changing the default speed');
    assert.match(sources.ytkit, /const video = getMainVideoElement\(\);[\s\S]{0,240}video\.playbackRate = value/,
        'speed popup must apply to the canonical main video element');
});
