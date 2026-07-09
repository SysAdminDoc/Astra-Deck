'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

function featureSlice(id, span = 24000) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `feature ${id} must exist in ytkit.js`);
    return ytkitSource.slice(start, start + span);
}

test('watchLaterWorkbench only activates on the WL playlist and bounds removal sessions', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /params\.get\('list'\) === 'WL'/,
        'workbench must gate on the Watch Later playlist');
    assert.match(block, /_BATCH_LIMIT: 25/,
        'removal sessions are bounded to 25 rows per run');
    assert.match(block, /_PACE_MS: 400/,
        'removal clicks are paced at 400ms');
    assert.match(block, /matched\.slice\(0, this\._BATCH_LIMIT\)/,
        'each run consumes at most one batch');
});

test('watchLaterWorkbench keeps a capped removal log for recovery', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /_LOG_KEY: 'ytkit-wl-removal-log'/,
        'removal log persists under a stable storage key');
    assert.match(block, /log\.slice\(-500\)/,
        'removal log is capped at 500 entries');
    assert.match(block, /Recovery list is in the removal log/,
        'completion toast points users at the recovery log');
});

test('watchLaterWorkbench filters, sorts, and exports the loaded scan', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /watchedPct/,
        'scan must capture the watched percentage per row');
    assert.match(block, /duration-asc/,
        'preview supports duration sorting');
    assert.match(block, /videoId,title,channel,durationSec,watchedPct,url/,
        'CSV export carries the full column set');
    assert.match(block, /_csvEscape/,
        'CSV fields must be escaped');
    assert.match(block, /Scroll the playlist to load more rows/,
        'status must disclose that only loaded rows are covered (no silent cap)');
});

test('watchLaterWorkbench cleans up its UI on destroy', () => {
    const block = featureSlice('watchLaterWorkbench');
    assert.match(block, /removeNavigateRule\('watchLaterWorkbench'\)/);
    assert.match(block, /this\._panel\?\.remove\(\)/);
});
