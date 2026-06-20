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
