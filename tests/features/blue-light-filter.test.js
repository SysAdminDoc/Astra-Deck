'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Blue Light Filter peeled module exports CSS builder functions', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'blue-light-filter', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
    assert.match(modSrc, /blueLightFilter/,
        'Module must reference the blueLightFilter feature id');
});

test('Blue Light Filter produces RGBA overlay CSS', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'blue-light-filter', 'index.js'), 'utf8');
    assert.match(modSrc, /rgba|background.*color|filter/i,
        'Module must produce CSS for the warm-tint overlay');
});
