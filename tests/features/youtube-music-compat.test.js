'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('YouTube Music Compat peeled module exports a factory function', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'youtube-music-compat', 'index.js'), 'utf8');
    assert.match(modSrc, /createYoutubeMusicCompatFeature/,
        'Module must export a createYoutubeMusicCompatFeature factory');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
});

test('YouTube Music Compat targets music.youtube.com', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'youtube-music-compat', 'index.js'), 'utf8');
    assert.match(modSrc, /music\.youtube\.com/,
        'Module must reference music.youtube.com domain');
});
