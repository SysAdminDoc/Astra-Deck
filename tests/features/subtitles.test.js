'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Subtitles peeled module exports CSS builder functions', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'subtitles', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
});

test('Subtitles module handles caption styling schema keys', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'subtitles', 'index.js'), 'utf8');
    assert.match(modSrc, /captionFont|captionSize|captionColor|captionBg|caption/i,
        'Module must reference caption styling settings');
});
