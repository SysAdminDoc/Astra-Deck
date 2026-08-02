'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ytkitSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit.js'), 'utf8');

function featureSlice(id, span = 30000) {
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

test('persistentQueue row actions act on the video id, not a stale index', () => {
    // The panel renders once and its buttons close over a row index. Another
    // tab editing the queue between render and click made that index point at
    // a different video, so Remove deleted the wrong entry.
    const block = featureSlice('persistentQueue');
    assert.match(block, /_indexOf\(queue, index, expectedId\)/,
        'mutators must resolve the row by its rendered video id');
    assert.match(block, /queue\.items\.findIndex\(item => item\.id === expectedId\)/,
        'a moved entry must be found by id before it is mutated');
    assert.match(block, /this\._move\(i, -1, it\.id\)/,
        'move up must pass the row id');
    assert.match(block, /this\._removeAt\(i, it\.id\)/,
        'remove must pass the row id');
    assert.match(block, /if \(at < 0\)/,
        'an entry another tab already removed must be a no-op, not a blind splice');
});

test('persistentQueue guards the head against two tabs advancing at once', () => {
    const block = featureSlice('persistentQueue');
    assert.match(block, /_CLAIM_WINDOW_MS: \d+/,
        'the claim must expire so a crashed tab cannot wedge the queue');
    assert.match(block, /queue\.claim = \{ id: next\.id, at: Date\.now\(\) \}/,
        'advancing must record which entry this tab claimed');
    assert.match(block, /claimFresh && claim\.id === next\.id/,
        'a second tab must skip an entry another tab just claimed');
});

test('persistentQueue re-renders when another tab edits the queue', () => {
    const block = featureSlice('persistentQueue');
    assert.match(block, /window\.addEventListener\('ytkit-storage-changed', this\._storageHandler\)/,
        'the pill and panel must follow cross-tab storage changes');
    assert.match(block, /this\._KEY in event\.detail\.changes/,
        'the handler must filter to the queue key');
    assert.match(block, /window\.removeEventListener\('ytkit-storage-changed', this\._storageHandler\)/,
        'destroy must detach the storage listener');
});
