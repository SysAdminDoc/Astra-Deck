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

test('every blocklist cap in settings-sync keeps the tail', () => {
    // Three rounds on this one, each because the assertion was narrower than
    // its own message. First it forbade the single literal
    // `sanitized.slice(0, domain.cap)` and missed three spelled across a line
    // break. Then it matched only the two `domain.cap` spellings and missed
    // the quota trim loop, which is spelled `.slice(0, nextLength)` and is the
    // path a heavy user actually hits: the caps alone serialize past
    // SYNC_MAX_PAYLOAD_BYTES before the settings delta is added, so it runs on
    // every sync and dropped the most recently hidden entries.
    //
    // So: find every slice applied to a blocklist in this file, whatever the
    // bound is called, and require all of them to take the tail.
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'settings-sync.js'), 'utf8');

    const slices = [...source.matchAll(/\.slice\(\s*([^)]*?)\s*\)/g)]
        .map((match) => ({
            args: match[1],
            line: source.slice(0, match.index).split('\n').length,
            text: source.slice(source.lastIndexOf('\n', match.index) + 1,
                source.indexOf('\n', match.index)).trim()
        }))
        // Only the ones operating on a blocklist. `splitUtf8` and the chunk
        // helpers slice strings and are not in scope.
        .filter((entry) => /blocklist|domain\.cap|nextLength|\blist\b|sanitized/i.test(entry.text));

    assert.ok(slices.length >= 5,
        'the blocklist slices must still be findable; got ' + slices.length);

    const headKeeping = slices.filter((entry) => /^0\s*,/.test(entry.args));
    assert.deepEqual(headKeeping.map((entry) => entry.line + ': ' + entry.text), [],
        'no blocklist cap may cut from the front');
});

test('the quota trim loop drops the oldest entries and can reach empty', () => {
    // `slice(-0)` returns the WHOLE array, so the zero case needs its own
    // branch or the loop never terminates on a list it cannot shrink.
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'core', 'settings-sync.js'), 'utf8');
    assert.ok(source.includes('nextLength === 0 ? [] : list.slice(-nextLength)'),
        'the trim must special-case zero, because slice(-0) is slice(0)');

    // Run the shrink step exactly as written.
    const shrink = (list) => {
        const nextLength = Math.max(0, list.length - Math.max(1, Math.ceil(list.length * 0.1)));
        return nextLength === 0 ? [] : list.slice(-nextLength);
    };
    let list = Array.from({ length: 100 }, (_, index) => index);
    list = shrink(list);
    assert.equal(list.length, 90);
    assert.equal(list[list.length - 1], 99, 'the newest entry must survive a trim pass');
    assert.equal(list[0], 10, 'the oldest ten are the ones dropped');

    // And it terminates rather than looping forever at length 1.
    let guard = 0;
    let small = [1];
    while (small.length > 0 && guard < 10) { small = shrink(small); guard += 1; }
    assert.equal(small.length, 0, 'a one-entry list must reach empty');
    assert.ok(guard < 10, 'and must not spin');
});

test('the runtime writers keep the channel the user just blocked', () => {
    // ytkit.js has its own sanitizers, injected into video-hider. They broke at
    // the limit while walking from the front, and `_normalizeBlockedChannels`
    // hands them the list with no pre-slice, so `[...channels, record]` on a
    // full list dropped the new record and kept the oldest one. The earlier fix
    // only touched persisted-domains.js and settings-sync.js, which are the
    // export and upload paths, not the writer the feature actually runs.
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');

    const extract = (name) => {
        const at = source.indexOf('function ' + name + '(');
        assert.ok(at > -1, name + ' must exist');
        let depth = 0;
        for (let i = source.indexOf('{', at); i < source.length; i += 1) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') {
                depth -= 1;
                if (depth === 0) return source.slice(at, i + 1);
            }
        }
        throw new Error('unbalanced ' + name);
    };

    for (const name of ['sanitizeImportedVideoIdList', 'sanitizeImportedBlockedChannels']) {
        const body = extract(name);
        assert.match(body, /return sanitized\.slice\(-/, name + ' must keep the newest entries');
        assert.ok(!/if \(sanitized\.length >= /.test(body),
            name + ' must not stop walking at the cap, which keeps the oldest');
    }

    // Run the real thing rather than trusting the shape.
    const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
    // eslint-disable-next-line no-new-func
    const build = new Function('IMPORT_LIMITS', 'VIDEO_ID_PATTERN',
        'normalizeBlockedChannelRecord', 'getBlockedChannelDedupeKey',
        '"use strict";'
        + extract('sanitizeImportedVideoIdList') + '\n'
        + extract('sanitizeImportedBlockedChannels') + '\n'
        + 'return { sanitizeImportedVideoIdList, sanitizeImportedBlockedChannels };');
    const api = build(
        { hiddenVideos: 5000, blockedChannels: 2000 },
        VIDEO_ID_PATTERN,
        (entry) => (entry && typeof entry.id === 'string' ? entry : null),
        (record) => (record ? String(record.id) : '')
    );

    const ids = Array.from({ length: 5001 }, (_, index) => 'v' + String(index).padStart(10, '0'));
    const keptIds = api.sanitizeImportedVideoIdList(ids);
    assert.equal(keptIds.length, 5000);
    assert.equal(keptIds[keptIds.length - 1], ids[5000],
        'the video the user just hid must survive');

    const channels = Array.from({ length: 2001 }, (_, index) => ({ id: 'UC' + index }));
    const keptChannels = api.sanitizeImportedBlockedChannels(channels);
    assert.equal(keptChannels.length, 2000);
    assert.equal(keptChannels[keptChannels.length - 1].id, 'UC2000',
        'the channel the user just blocked must survive');
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
