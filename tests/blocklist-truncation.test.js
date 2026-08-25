'use strict';

// Video Hider appends: `hidden.push(id)` for videos, `[...channels, record]`
// for channels, and it trims overflow with `splice(0, overflow)` so the OLDEST
// entry is the one dropped. The sanitizers and the sync payload builder cut
// from the front instead, which threw away the most recent entries. Because
// applyRemotePayload replaces the peer's list wholesale, the loss propagated:
// videos the user had just hidden came back on every device.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const persisted = require('../extension/core/persisted-domains');

const videoId = (n) => 'v' + String(n).padStart(10, '0');

test('sanitizeVideoIds keeps the newest ids, not the oldest', () => {
    const ids = Array.from({ length: 6000 }, (_, index) => videoId(index));
    const kept = persisted.sanitizeDomainValue('hiddenVideos', ids);
    assert.equal(kept.length, 5000);
    assert.equal(kept[kept.length - 1], videoId(5999), 'the most recently hidden video must survive');
    assert.equal(kept[0], videoId(1000), 'the oldest thousand are the ones dropped');
});

test('sanitizeBlockedChannels keeps the newest blocks in their original order', () => {
    const channels = Array.from({ length: 2500 }, (_, index) => ({ id: 'UC' + index, name: 'Chan ' + index }));
    const kept = persisted.sanitizeDomainValue('blockedChannels', channels);
    assert.equal(kept.length, 2000);
    assert.equal(kept[kept.length - 1].id, 'UC2499', 'the most recent block must survive');
    assert.equal(kept[0].id, 'UC500', 'the oldest five hundred are the ones dropped');
    // Order has to stay oldest-first, or the next append/trim cycle cuts the
    // wrong end again.
    for (let index = 1; index < kept.length; index += 1) {
        assert.ok(Number(kept[index].id.slice(2)) > Number(kept[index - 1].id.slice(2)),
            'survivors must stay in their original order');
    }
});

test('a duplicate id collapses to one entry without shrinking the kept window', () => {
    const kept = persisted.sanitizeDomainValue('blockedChannels', [
        { id: 'UCa', name: 'First' },
        { id: 'UCb', name: 'Second' },
        { id: 'UCa', name: 'Renamed' }
    ]);
    assert.equal(kept.length, 2);
    assert.deepEqual(kept.map((row) => row.id), ['UCa', 'UCb']);
});

test('the sync payload uploads the newest blocklist entries', () => {
    // The builder is not separately exported, so pin the direction at the
    // source. `slice(0, cap)` here is the whole defect.
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'settings-sync.js'), 'utf8');
    assert.ok(source.includes('sanitized.slice(-domain.cap)'),
        'buildBlocklists must keep the tail of each list');
    assert.ok(!source.includes('sanitized.slice(0, domain.cap)'),
        'cutting from the front drops what the user just hid');
});

test('the write path and the sync path agree on which end is newest', () => {
    // If Video Hider ever starts prepending, every slice above is wrong. Pin
    // the assumption where it is made.
    const hider = fs.readFileSync(
        path.join(repoRoot, 'extension', 'features', 'video-hider', 'index.js'), 'utf8'
    );
    assert.ok(hider.includes('hidden.push(id);'),
        'hidden videos must still be appended, newest last');
    assert.ok(hider.includes('hidden.splice(0, hidden.length - IMPORT_LIMITS.hiddenVideos);'),
        'the write-time trim must still drop from the front, oldest first');
    assert.ok(hider.includes('this._setBlockedChannels([...channels, record]);'),
        'blocked channels must still be appended, newest last');
});
