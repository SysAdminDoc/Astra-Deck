'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Home/Subs CSS peeled module exports builder functions', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'home-subs-css', 'index.js'), 'utf8');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
    assert.match(modSrc, /homeSubsCss|buildHide/i,
        'Module must export CSS builder functions for home/subs features');
});

test('Home/Subs CSS module covers expected feature IDs', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'home-subs-css', 'index.js'), 'utf8');
    // These are the features documented as bundled in the home-subs-css peel
    const expectedIds = ['hideCreateButton', 'hideVoiceSearch', 'widenSearchBar',
        'disablePlayOnHover', 'fullWidthSubscriptions', 'hideSubscriptionOptions'];
    let found = 0;
    for (const id of expectedIds) {
        if (modSrc.includes(id)) found++;
    }
    assert.ok(found >= 3,
        `Module should reference at least 3 of the 6 bundled home/subs features (found ${found})`);
});
