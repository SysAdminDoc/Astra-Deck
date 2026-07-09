'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

function featureSlice(id, span = 20000) {
    const start = ytkitSource.indexOf(`id: '${id}'`);
    assert.notEqual(start, -1, `feature ${id} must exist in ytkit.js`);
    return ytkitSource.slice(start, start + span);
}

test('persistentQueue stores a capped, deduplicated local queue', () => {
    const block = featureSlice('persistentQueue');
    assert.match(block, /_KEY: 'ytkit-queue'/,
        'queue must persist under the ytkit-queue storage key');
    assert.match(block, /_MAX_ITEMS: 200/,
        'queue must be capped at 200 entries');
    assert.match(block, /items\.some\(it => it\.id === videoId\)/,
        'adding must dedupe by video id');
    assert.match(block, /storageWriteJSON\(this\._KEY/,
        'writes go through the shared storage helper');
});

test('persistentQueue import validates entries and reports duplicates', () => {
    const block = featureSlice('persistentQueue');
    assert.match(block, /\^\[\\w-\]\{11\}\$/,
        'import must validate 11-char video ids');
    assert.match(block, /duplicate\(s\) skipped/,
        'import must report duplicate counts');
    assert.match(block, /Import failed: not a valid queue JSON file/,
        'malformed import files must fail with user feedback');
});

test('persistentQueue auto-advance is gated on its sub-toggle', () => {
    const block = featureSlice('persistentQueue');
    assert.match(block, /persistentQueueAutoAdvance === false\) return/,
        'ended handler must respect the auto-advance sub-toggle');
    assert.match(block, /addEventListener\('ended'/,
        'auto-advance rides the video ended event');
});

test('persistentQueue cleans up UI, listeners, and rules on destroy', () => {
    const block = featureSlice('persistentQueue');
    assert.match(block, /removeNavigateRule\('persistentQueue'\)/);
    assert.match(block, /removeScopedMutationRule\('persistentQueue'\)/);
    assert.match(block, /\.ytkit-queue-btn'\)\.forEach\(b => b\.remove\(\)\)/,
        'destroy must remove injected card buttons');
});

test('autoExitFullscreen treats a pending queue entry as up-next', () => {
    const start = ytkitSource.indexOf("id: 'autoExitFullscreen'");
    const block = ytkitSource.slice(start, start + 4000);
    assert.match(block, /persistentQueue/,
        'fullscreen auto-exit must stay engaged when the queue will advance');
    assert.match(block, /ytkit-queue/,
        'queue check reads the shared queue storage key');
});
