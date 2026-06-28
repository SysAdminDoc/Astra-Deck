'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const userscriptSource = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');

test('userscript metadata and watch guards support youtu.be routes', () => {
    assert.match(userscriptSource, /^\/\/ @match\s+https:\/\/youtu\.be\/\*/m);
    assert.doesNotMatch(userscriptSource, /location\.pathname\s*!==?\s*'\/watch'/);
    assert.match(userscriptSource, /\bisWatchPagePath\(\)/);
});

test('userscript comment handle revealer deduplicates requests and aborts on teardown', () => {
    assert.match(userscriptSource, /_pendingAuthors:\s*null/);
    assert.match(userscriptSource, /signal:\s*this\._abortController\?\.signal/);
    assert.match(userscriptSource, /this\._abortController\?\.abort\(\);\s*this\._abortController = null;/);
});

test('userscript hardens blank-target navigation and CPU tamer cleanup', () => {
    assert.match(userscriptSource, /function setSafeBlankTarget\(anchor\)/);
    assert.match(userscriptSource, /anchor\.rel = 'noopener noreferrer';/);
    assert.match(userscriptSource, /function openExternalWindow\(url\)/);
    assert.match(userscriptSource, /_pumpInterval:\s*null/);
    assert.match(userscriptSource, /this\._pumpInterval = origSetInterval\(/);
    assert.match(userscriptSource, /clearInterval\.call\(window,\s*this\._pumpInterval\)/);
});

test('userscript pauseOtherTabs guards BroadcastChannel failures', () => {
    const start = userscriptSource.indexOf("id: 'pauseOtherTabs'");
    assert.ok(start > -1, 'userscript must include pauseOtherTabs');
    const end = userscriptSource.indexOf("id: 'abLoop'", start);
    assert.ok(end > start, 'pauseOtherTabs block must end before abLoop');
    const block = userscriptSource.slice(start, end);

    assert.match(block, /_recordChannelFailure\(operation,\s*error\)/);
    assert.match(block, /_openChannel\(\)/);
    assert.match(block, /typeof BroadcastChannel\s*!==\s*'function'/);
    assert.match(block, /DiagnosticLog\?\.record\?\.\('broadcast-channel'/);
    assert.match(block, /if \(!this\._channel\) return;/);
    assert.match(block, /_broadcastPause\(\)/);
    assert.match(block, /_recordChannelFailure\('postMessage'/);
});

test('userscript ports safe DOM and CSS parity batch', () => {
    for (const featureId of [
        'titleCaseTransform',
        'customSelectionColor',
        'bypassPlaylistMode',
        'videoRotation',
        'videoFlip'
    ]) {
        assert.match(userscriptSource, new RegExp(`id: '${featureId}'`),
            `userscript must include ${featureId}`);
    }

    assert.match(userscriptSource, /text-transform:\s*\$\{transform\}/,
        'titleCaseTransform must write the selected CSS text-transform');
    assert.match(userscriptSource, /buildSelectionColorCss/,
        'customSelectionColor must reuse the shared theme CSS builder when available');
    assert.match(userscriptSource, /url\.searchParams\.delete\('list'\)/,
        'bypassPlaylistMode must remove playlist query parameters');
    assert.match(userscriptSource, /settingKey:\s*'videoRotationAngle'/,
        'videoRotation must be wired to the existing setting key');
    assert.match(userscriptSource, /settingKey:\s*'videoFlipMode'/,
        'videoFlip must be wired to the existing setting key');
});

test('userscript ships videoNotes defaults and local notes runtime', () => {
    assert.match(userscriptSource, /videoNotes:\s*false/);
    assert.match(userscriptSource, /videoNotesData:\s*\{\}/);
    const start = userscriptSource.indexOf("id: 'videoNotes'");
    assert.ok(start > -1, 'userscript must include the videoNotes runtime feature');
    const block = userscriptSource.slice(start, start + 30000);
    assert.match(block, /_DATA_KEY: 'videoNotesData'/);
    assert.match(block, /_MAX_NOTES: 1000/);
    assert.match(block, /_MAX_NOTE_CHARS: 5000/);
    assert.match(block, /Object\.fromEntries\(entries\.slice\(0, this\._MAX_NOTES\)\)/);
    assert.match(block, /injectStyle\([\s\S]*'video-notes', true\)/,
        'userscript injectStyle must receive raw CSS for the notes panel');
    assert.match(block, /handleFileExport\(`astra-deck-video-notes-/);
    assert.match(block, /addNavigateRule\(this\.id, this\._navRule\)/);
    assert.match(block, /removeNavigateRule\(this\.id\)/);
});

test('userscript enforces write-time caps for bookmarks and watch-history stores', () => {
    assert.match(userscriptSource, /function sanitizeTimestampBookmarks\(value, limits = IMPORT_LIMITS\)/);
    assert.match(userscriptSource, /function sanitizeWatchProgressStore\(value, nowMs = Date\.now\(\)\)/);
    assert.match(userscriptSource, /function sanitizeWatchTimeStats\(value, nowDate = new Date\(\)\)/);

    const bookmarkStart = userscriptSource.indexOf("id: 'timestampBookmarks'");
    assert.ok(bookmarkStart > -1, 'userscript must include timestampBookmarks');
    const bookmarkBlock = userscriptSource.slice(bookmarkStart, bookmarkStart + 9000);
    assert.match(bookmarkBlock, /_MAX_BOOKMARK_VIDEOS: IMPORT_LIMITS\.bookmarkVideos/);
    assert.match(bookmarkBlock, /_writeBookmarks\(bookmarks\)/);
    assert.match(bookmarkBlock, /this\._writeBookmarks\(bookmarks\)/);
    assert.match(bookmarkBlock, /bks\[videoId\]\[idx\]\.d = Date\.now\(\)/);

    const progressStart = userscriptSource.indexOf("id: 'watchProgress'");
    assert.ok(progressStart > -1, 'userscript must include watchProgress');
    const progressBlock = userscriptSource.slice(progressStart, progressStart + 7000);
    assert.match(progressBlock, /_MAX_PROGRESS_VIDEOS: STORAGE_CAPS\.watchProgressVideos/);
    assert.match(progressBlock, /_writeProgress\(progress\)/);
    assert.match(progressBlock, /this\._writeProgress\(progress\)/);

    const trackerStart = userscriptSource.indexOf("id: 'watchTimeTracker'");
    assert.ok(trackerStart > -1, 'userscript must include watchTimeTracker');
    const trackerBlock = userscriptSource.slice(trackerStart, trackerStart + 7000);
    assert.match(trackerBlock, /_writeStats\(stats\)/);
    assert.match(trackerBlock, /this\._writeStats\(stats\)/);
});
