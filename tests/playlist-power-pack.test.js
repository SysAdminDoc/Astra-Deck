'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const persisted = require('../extension/core/persisted-domains');
const { findBalancedObjectLiteral } = require('../scripts/catalog-utils');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');

function playlistFeature() {
    const literal = findBalancedObjectLiteral(source, "\n        {\n            id: 'playlistEnhancer'");
    return Function(
        'appState', 'storageReadJSON', 'storageWriteJSON', 'STORAGE_KEYS',
        'VIDEO_ID_PATTERN', 't', 'settingsManager', 'isWatchPagePath',
        `return (${literal});`
    )(
        { settings: { playlistAutoSkipWatched: false } },
        () => ({}),
        () => {},
        { playlistResume: 'ytkit-playlist-resume' },
        /^[A-Za-z0-9_-]{11}$/,
        (_key, fallback) => fallback,
        { save: () => Promise.resolve({ ok: true }) },
        () => true
    );
}

test('playlist pack parses durations and keeps unknown durations last', () => {
    const feature = playlistFeature();
    assert.equal(feature._parseDuration('1:02'), 62);
    assert.equal(feature._parseDuration('1:02:03'), 3723);
    assert.equal(feature._parseDuration('LIVE'), null);

    const entries = [
        { item: {}, durationSec: null },
        { item: {}, durationSec: 62 },
        { item: {}, durationSec: 12 }
    ];
    feature._nativeOrder = new WeakMap(entries.map(({ item }, index) => [item, index]));
    assert.deepEqual(feature._orderedEntries(entries, 'duration-asc').map((entry) => entry.durationSec), [12, 62, null]);
    assert.deepEqual(feature._orderedEntries(entries, 'duration-desc').map((entry) => entry.durationSec), [62, 12, null]);
    assert.deepEqual(feature._orderedEntries(entries, 'none').map((entry) => entry.durationSec), [null, 62, 12]);
});

test('playlist pack persists bounded per-playlist resume state through the portable domain', () => {
    const domain = persisted.DURABLE_DOMAIN_REGISTRY.find((entry) => entry.id === 'playlistResume');
    assert.equal(domain?.key, 'ytkit-playlist-resume');
    assert.equal(domain?.backup, 'include');
    const sanitized = persisted.sanitizeDomainValue('playlistResume', {
        good: { videoId: 'abcdefghijk', ts: 20 },
        badVideo: { videoId: 'not-valid', ts: 30 },
        badTimestamp: { videoId: 'lmnopqrstuv', ts: 0 },
        'bad space': { videoId: 'lmnopqrstuv', ts: 40 }
    });
    assert.deepEqual(sanitized, { good: { videoId: 'abcdefghijk', ts: 20 } });
});

test('playlist pack exposes explicit watched-skip and accessible toolbar contracts', () => {
    const block = findBalancedObjectLiteral(source, "\n        {\n            id: 'playlistEnhancer'");
    assert.match(block, /playlistAutoSkipWatched/);
    assert.match(block, /watchedPct < 90/);
    assert.match(block, /STORAGE_KEYS\.playlistResume/);
    assert.match(block, /aria-pressed/);
    assert.match(block, /duration-asc/);
    assert.match(source, /feature_playlistAutoSkipWatched_name/);
});
