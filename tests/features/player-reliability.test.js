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
    return ytkitSource.slice(start, start + 8000);
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

test('playbackErrorRecovery reloads on the player error screen with a bounded retry budget', () => {
    const block = featureSlice('playbackErrorRecovery');
    assert.match(block, /\.ytp-error/,
        'must detect the player error screen element');
    assert.match(block, /_MAX_ATTEMPTS:\s*3/,
        'retry budget must be capped at 3 attempts');
    assert.match(block, /attempts >= this\._MAX_ATTEMPTS/,
        'must give up once the attempt budget is exhausted');
    assert.match(block, /location\.reload\(\)/,
        'recovery reloads the page');
    assert.match(block, /playbackRate/,
        'must restore playback speed after reload');
    assert.match(block, /DebugManager\.log\('PlaybackRecovery'/,
        'attempts and give-ups must leave diagnostic log entries');
});

test('playbackErrorRecovery resume state is scoped, expiring, and cleaned up', () => {
    const block = featureSlice('playbackErrorRecovery');
    assert.match(block, /state\.videoId !== this\._currentVideoId\(\)/,
        'stale state for another video must be discarded');
    assert.match(block, /60000/,
        'resume records older than 60s must expire');
    assert.match(block, /removeMutationRule\(this\.id\)/,
        'destroy must remove the mutation rule');
    assert.match(block, /removeNavigateRule\('playbackErrorRecovery'\)/,
        'destroy must remove the navigate rule');
});

test('fullscreenScroll restores body scroll and the columns layout in fullscreen only', () => {
    const block = featureSlice('fullscreenScroll');
    assert.match(block, /html:fullscreen body \{ overflow-y: auto !important; \}/,
        'body scroll is restored only while the document is fullscreen');
    assert.match(block, /ytd-app\[fullscreen\] ytd-watch-flexy\[fullscreen\] #columns \{ display: flex !important/,
        'columns are re-shown only under fullscreen attribute gating');
    assert.match(block, /--yt-spec-base-background/,
        'columns get a theme-aware background so light theme stays readable');
});

test('autoExitFullscreen is registered off by default across catalog surfaces', () => {
    const defaults = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'default-settings.json'), 'utf8'));
    assert.equal(defaults.autoExitFullscreen, false);
    const schemaSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'core', 'settings-schema.js'), 'utf8');
    assert.match(schemaSrc, /key: "autoExitFullscreen"/);
});
