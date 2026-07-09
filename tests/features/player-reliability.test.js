'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

function featureSlice(id) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `feature ${id} must exist in ytkit.js`);
    return ytkitSource.slice(start, start + 4000);
}

test('autoExitFullscreen exits fullscreen on ended and is playlist-aware', () => {
    const block = featureSlice('autoExitFullscreen');
    assert.match(block, /addEventListener\('ended'/,
        'must listen for the video ended event');
    assert.match(block, /document\.exitFullscreen/,
        'must call document.exitFullscreen');
    assert.match(block, /_hasUpNext/,
        'must guard on a playlist/queue up-next check');
    assert.match(block, /ytd-playlist-panel-video-renderer/,
        'up-next check must inspect the playlist panel entries');
    assert.match(block, /document\.fullscreenElement/,
        'must no-op when the player is not fullscreen');
});

test('autoExitFullscreen cleans up its listener and navigate rule on destroy', () => {
    const block = featureSlice('autoExitFullscreen');
    assert.match(block, /removeEventListener\('ended'/,
        'destroy must detach the ended listener');
    assert.match(block, /removeNavigateRule\('autoExitFullscreen'\)/,
        'destroy must remove the navigate rule');
});

test('autoExitFullscreen is registered off by default across catalog surfaces', () => {
    const defaults = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'default-settings.json'), 'utf8'));
    assert.equal(defaults.autoExitFullscreen, false);
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'core', 'settings-schema.js'), 'utf8');
    assert.match(schemaSrc, /key: "autoExitFullscreen"/);
});
