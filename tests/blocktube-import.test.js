'use strict';

// BlockTube and ChannelSieve backups import into Astra's own lists. Only
// what maps without changing meaning is kept, every refused line is counted
// by reason, and nothing already stored is ever evicted to make room.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const persisted = require('../extension/core/persisted-domains');
const { hasUnsafeRegexQuantifiers } = require('../extension/core/regex-safety');

function fixture(name) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

const NOW = 1790000000000;

function channelId(n) {
    return 'UC' + String(n).padStart(22, '0');
}

test('a BlockTube backup is told apart from Astra backups and other JSON', () => {
    assert.equal(persisted.isBlockTubeBackup(fixture('blocktube-backup.json')), true);
    assert.equal(persisted.isBlockTubeBackup({ filterData: {} }), true, 'an empty BlockTube export is still one');
    for (const version of [1, 2, 3, 4]) {
        assert.equal(persisted.isBlockTubeBackup(fixture(`backup-v${version}.json`)), false, `backup-v${version}`);
    }
    assert.equal(persisted.isBlockTubeBackup({ filterData: {}, exportVersion: 3 }), false);
    assert.equal(persisted.isBlockTubeBackup({ filterData: {}, astraDeckBackup: true }), false);
    assert.equal(persisted.isBlockTubeBackup({ filterData: [] }), false);
    assert.equal(persisted.isBlockTubeBackup({ filterData: 'x' }), false);
    assert.equal(persisted.isBlockTubeBackup([]), false);
    assert.equal(persisted.isBlockTubeBackup(null), false);
    assert.throws(() => persisted.mergeBlockTubeBackup({ settings: {} }), { code: 'bad-format' });
});

test('the fixture merges into channels, videos and per-field rules with a count for every line', () => {
    const result = persisted.mergeBlockTubeBackup(fixture('blocktube-backup.json'), {}, { hasUnsafeRegexQuantifiers, now: NOW });
    assert.deepEqual(result.counts, { valid: 7, duplicate: 2, invalid: 4, unsupported: 6, overLimit: 0 });
    assert.deepEqual(result.added, { blockedChannels: 2, hiddenVideos: 1, filterRules: 4 });
    assert.equal(result.changed, true);
    assert.equal(result.source, 'blocktube');

    assert.deepEqual(result.blockedChannels, [
        { id: 'UCabcdefghijklmnopqrstuv', name: 'Loud Reactions (Official)', channelId: 'UCabcdefghijklmnopqrstuv', blockedAt: NOW, source: 'blocktube' },
        { id: 'UCzyxwvutsrqponmlkjihgfe', name: 'UCzyxwvutsrqponmlkjihgfe', channelId: 'UCzyxwvutsrqponmlkjihgfe', blockedAt: NOW, source: 'blocktube' }
    ], 'the context-menu name only labels the ID right under it');
    assert.deepEqual(result.hiddenVideos, ['dQw4w9WgXcQ']);
    assert.deepEqual(result.filterRules, [
        { field: 'title', kind: 'keyword', pattern: 'reaction', source: 'blocktube' },
        { field: 'title', kind: 'regex', pattern: '\\bprank(s)?\\b', flags: 'i', source: 'blocktube' },
        { field: 'channel', kind: 'keyword', pattern: 'Clickbait Central', source: 'blocktube' },
        { field: 'channel', kind: 'regex', pattern: '^News', flags: '', source: 'blocktube' }
    ]);

    const stored = JSON.stringify(result);
    assert.doesNotMatch(stored, /video\) => true/, 'the JavaScript filter is never carried over');
    assert.doesNotMatch(stored, /5f4dcc3b/, 'the BlockTube UI password hash is never carried over');
    assert.doesNotMatch(stored, /spoiler|first/, 'comment rules have no Astra equivalent');
});

test('a ChannelSieve source tags every new entry, and a string field splits on newlines', () => {
    const raw = { filterData: { channelId: 'UCabcdefghijklmnopqrstuv\n\nUCzyxwvutsrqponmlkjihgfe', title: 'one\ntwo' } };
    const result = persisted.mergeBlockTubeBackup(raw, {}, { source: 'channelsieve', hasUnsafeRegexQuantifiers, now: NOW });
    assert.equal(result.source, 'channelsieve');
    assert.deepEqual(result.added, { blockedChannels: 2, hiddenVideos: 0, filterRules: 2 });
    assert.ok(result.blockedChannels.every((row) => row.source === 'channelsieve'));
    assert.ok(result.filterRules.every((row) => row.source === 'channelsieve'));

    const unknown = persisted.mergeBlockTubeBackup(raw, {}, { source: 'somewhere', hasUnsafeRegexQuantifiers });
    assert.equal(unknown.source, 'blocktube', 'an unknown source falls back to blocktube');
});

test('entries already stored count as duplicates and keep their own records', () => {
    const current = {
        blockedChannels: [{ id: 'UCabcdefghijklmnopqrstuv', name: 'Mine', blockedAt: 5 }],
        hiddenVideos: ['dQw4w9WgXcQ'],
        filterRules: [{ field: 'title', kind: 'keyword', pattern: 'REACTION', source: 'channelsieve' }]
    };
    const result = persisted.mergeBlockTubeBackup(fixture('blocktube-backup.json'), current, { hasUnsafeRegexQuantifiers, now: NOW });
    assert.deepEqual(result.added, { blockedChannels: 1, hiddenVideos: 0, filterRules: 3 });
    assert.equal(result.counts.duplicate, 5);
    assert.equal(result.blockedChannels[0].name, 'Mine', 'the stored record is not overwritten');
    assert.equal(result.filterRules[0].pattern, 'REACTION');
    assert.equal(current.blockedChannels.length, 1, 'the caller\'s lists are not mutated');
    assert.equal(current.hiddenVideos.length, 1);
});

test('nothing stored is evicted: new entries only fill the room left under each cap', () => {
    const current = { blockedChannels: Array.from({ length: 1999 }, (_, i) => ({ id: channelId(i), name: `c${i}` })) };
    const raw = { filterData: { channelId: [channelId(5000), channelId(5001), channelId(5002)] } };
    const result = persisted.mergeBlockTubeBackup(raw, current, { hasUnsafeRegexQuantifiers, now: NOW });
    assert.equal(persisted.BLOCKTUBE_LIMITS.blockedChannels, 2000);
    assert.equal(result.blockedChannels.length, 2000);
    assert.equal(result.added.blockedChannels, 1);
    assert.equal(result.counts.overLimit, 2);
    assert.equal(result.blockedChannels[0].id, channelId(0), 'the oldest entry is still there');
    assert.equal(result.blockedChannels[1999].id, channelId(5000));

    const full = persisted.mergeBlockTubeBackup(raw, { blockedChannels: result.blockedChannels }, { hasUnsafeRegexQuantifiers });
    assert.equal(full.changed, false);
    assert.equal(full.counts.valid, 0);
});

test('a field over the line cap counts the rest as over the limit, and rules stop at their own cap', () => {
    const title = Array.from({ length: 20001 }, (_, i) => `word${i}`);
    const result = persisted.mergeBlockTubeBackup({ filterData: { title } }, {}, { hasUnsafeRegexQuantifiers });
    assert.equal(result.filterRules.length, persisted.BLOCKTUBE_LIMITS.filterRules);
    assert.equal(result.counts.valid, 1000);
    assert.equal(result.counts.overLimit, 19001, '19000 past the rule cap plus 1 past the line cap');

    const long = persisted.mergeBlockTubeBackup({ filterData: { title: ['x'.repeat(201), '/' + 'y'.repeat(201) + '/'] } }, {}, { hasUnsafeRegexQuantifiers });
    assert.equal(long.counts.invalid, 2, 'patterns over the ReDoS guard length are refused');
});

test('regex rules fail closed without the ReDoS guard, keywords never need it', () => {
    const raw = { filterData: { title: ['/safe/', 'plain words'] } };
    const flagged = persisted.mergeBlockTubeBackup(raw, {}, { hasUnsafeRegexQuantifiers: () => true });
    assert.equal(flagged.added.filterRules, 1);
    assert.equal(flagged.filterRules[0].kind, 'keyword');
    assert.equal(flagged.counts.invalid, 1);

    const rule = { field: 'title', kind: 'regex', pattern: 'safe', flags: '' };
    assert.equal(persisted.compileImportedFilterRule(rule, null), null, 'no guard, no regex');
    assert.equal(persisted.compileImportedFilterRule(rule, () => true), null);
    assert.equal(persisted.compileImportedFilterRule({ ...rule, pattern: '(a+)+$' }, hasUnsafeRegexQuantifiers), null);
    assert.equal(persisted.compileImportedFilterRule({ ...rule, pattern: '(' }, hasUnsafeRegexQuantifiers), null, 'uncompilable');
    assert.equal(persisted.compileImportedFilterRule(rule, hasUnsafeRegexQuantifiers).test('a safe title'), true);
    assert.equal(persisted.compileImportedFilterRule({ field: 'title', kind: 'keyword', pattern: 'a.b' }, null).test('axb'), false,
        'keyword text is matched literally');
});

test('regex flags are checked, and the stateful ones are dropped', () => {
    const raw = { filterData: { title: ['/a/gi', '/b/ii', '/c/x', '/d/yd'] } };
    const result = persisted.mergeBlockTubeBackup(raw, {}, { hasUnsafeRegexQuantifiers });
    assert.deepEqual(result.filterRules.map((rule) => rule.flags), ['i', '']);
    assert.equal(result.counts.invalid, 2);
    const matcher = persisted.compileImportedFilterRule(result.filterRules[0], hasUnsafeRegexQuantifiers);
    assert.equal(matcher.test('A') && matcher.test('A'), true, 'no lastIndex carried between tests');
});

test('a regex keeps its own spaces through the merge and storage, a keyword is trimmed', () => {
    const raw = { filterData: { title: ['/foo /i', '/foo/i', '  spaced word  '] } };
    const result = persisted.mergeBlockTubeBackup(raw, {}, { hasUnsafeRegexQuantifiers });
    assert.deepEqual(result.filterRules.map((rule) => rule.pattern), ['foo ', 'foo', 'spaced word']);
    const stored = persisted.sanitizeImportedFilterRules(result.filterRules);
    assert.deepEqual(stored.map((rule) => rule.pattern), ['foo ', 'foo', 'spaced word'],
        'storage keeps the pattern the merge validated');
    assert.deepEqual(persisted.sanitizeImportedFilterRules([{ field: 'title', kind: 'regex', pattern: '   ' }]), [],
        'an all-space regex is still empty');
});

test('sanitizeImportedFilterRules keeps only well-formed rules, once each, under the cap', () => {
    const rows = [
        { field: 'title', kind: 'keyword', pattern: '  spaced  ', source: 'channelsieve', extra: 1 },
        { field: 'title', kind: 'keyword', pattern: 'SPACED' },
        { field: 'title', kind: 'regex', pattern: 'x', flags: 'gi' },
        { field: 'title', kind: 'regex', pattern: 'x', flags: 'qq' },
        { field: 'comment', kind: 'keyword', pattern: 'x' },
        { field: 'channel', kind: 'eval', pattern: 'x' },
        { field: 'channel', kind: 'keyword', pattern: '' },
        { field: 'channel', kind: 'keyword', pattern: 'y'.repeat(201) },
        'not a row',
        null
    ];
    assert.deepEqual(persisted.sanitizeImportedFilterRules(rows), [
        { field: 'title', kind: 'keyword', pattern: 'spaced', source: 'channelsieve' },
        { field: 'title', kind: 'regex', pattern: 'x', flags: 'i', source: 'blocktube' }
    ]);
    assert.deepEqual(persisted.sanitizeImportedFilterRules('nope'), []);
    const many = Array.from({ length: 1200 }, (_, i) => ({ field: 'title', kind: 'keyword', pattern: `k${i}` }));
    assert.equal(persisted.sanitizeImportedFilterRules(many).length, persisted.IMPORTED_FILTER_RULES_MAX);
});

test('imported rules are a backed-up domain and survive a v3 backup migration', () => {
    const entry = persisted.DURABLE_DOMAIN_REGISTRY.find((domain) => domain.id === 'importedFilterRules');
    assert.ok(entry, 'registry classifies importedFilterRules');
    assert.equal(entry.backup, 'include');
    assert.equal(entry.key, persisted.IMPORTED_FILTER_RULES_KEY);
    const rules = [{ field: 'title', kind: 'keyword', pattern: 'x', source: 'blocktube' }];
    const migrated = persisted.migrateBackup({ exportVersion: 3, settings: {}, importedFilterRules: rules });
    assert.deepEqual(migrated.domains.importedFilterRules, rules);
    assert.equal(persisted.migrateBackup({ exportVersion: 2, settings: {}, importedFilterRules: rules }).domains.importedFilterRules,
        undefined, 'v2 backups never carried the field');
});

test('the summary names every non-zero count', () => {
    assert.equal(persisted.formatBlockTubeImportSummary({ valid: 7, duplicate: 2, invalid: 4, unsupported: 6, overLimit: 0 }),
        'BlockTube backup: 7 filters added, 2 already there, 4 invalid, 6 not supported');
    assert.equal(persisted.formatBlockTubeImportSummary({ valid: 1, overLimit: 1 }),
        'BlockTube backup: 1 filter added, 1 over the limit');
    assert.equal(persisted.formatBlockTubeImportSummary({}), 'BlockTube backup: 0 filters added');
    const t = (key, fallback) => (key === 'blockTubeImportValidTplOther' ? '{count} Filter' : fallback);
    assert.equal(persisted.formatBlockTubeImportSummary({ valid: 3 }, { t }), 'BlockTube backup: 3 Filter');
});
