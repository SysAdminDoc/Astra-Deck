'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

function featureSlice(id, span = 8000) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `feature ${id} must exist in ytkit.js`);
    return ytkitSource.slice(start, start + span);
}

test('shortsSpeedControl targets the active reel and honors persistentSpeed', () => {
    const block = featureSlice('shortsSpeedControl');
    assert.match(block, /ytd-reel-video-renderer\[is-active\] video/,
        'must resolve the active Shorts reel video');
    assert.match(block, /persistentSpeedValue/,
        'default speed must honor the persistent speed setting');
    assert.match(block, /_SPEEDS: \[0\.5, 0\.75, 1, 1\.25, 1\.5, 2\]/,
        'speed cycle covers 0.5x through 2x');
    assert.match(block, /location\.pathname\.startsWith\('\/shorts\/'\)/,
        'must gate on the shorts route');
    assert.match(block, /setProgrammaticPlaybackRate\(video, 1\)/,
        'destroy must restore 1x playback WITHOUT perChannelSpeed persisting it');
});

test('shortsAutoAdvance unloops the reel and clicks the next-video control', () => {
    const block = featureSlice('shortsAutoAdvance');
    assert.match(block, /video\.loop = false/,
        'must disable the native loop so ended can fire');
    assert.match(block, /addEventListener\('ended'/,
        'advance rides the ended event');
    assert.match(block, /#navigation-button-down button/,
        'advance clicks the native down-navigation control');
    assert.match(block, /removeNavigateRule\('shortsAutoAdvance'\)/,
        'destroy must remove the navigate rule');
});
