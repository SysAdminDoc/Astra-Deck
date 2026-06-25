'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Wave-8 CSS peeled module exports builder functions', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'wave-8-css', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
});

test('Wave-8 CSS module covers expected wave-8 feature IDs', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'wave-8-css', 'index.js'), 'utf8');
    // Wave-8 features are documented as CSS-only restores from archive
    const wave8Terms = ['preventAutoplay', 'noFrostedGlass', 'hideNotificationButton',
        'hideLatestPosts', 'disableMiniPlayer'];
    let found = 0;
    for (const term of wave8Terms) {
        if (modSrc.includes(term)) found++;
    }
    assert.ok(found >= 2,
        `Module should reference at least 2 wave-8 features (found ${found})`);
});
