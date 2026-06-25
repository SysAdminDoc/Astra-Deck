'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Video Filters peeled module exports CSS filter chain builder', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'video-filters', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
    assert.match(modSrc, /filter|brightness|contrast|saturate|hue-rotate/i,
        'Module must produce CSS filter chain strings');
});

test('Video Filters module references the html5-main-video target', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'video-filters', 'index.js'), 'utf8');
    assert.match(modSrc, /html5-main-video|\.video-stream/,
        'Module must target the YouTube video element');
});
