'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Theme CSS peeled module exports builder functions', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'theme-css', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
    assert.match(modSrc, /themeCss|buildProgressBarCss|buildHideVideoEndContentCss/i,
        'Module must export theme CSS builder functions');
});

test('Theme CSS module handles accent color and progress bar', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'theme-css', 'index.js'), 'utf8');
    assert.match(modSrc, /accent|progressBar|themeAccentColor/i,
        'Module must reference accent color or progress bar theming');
});
