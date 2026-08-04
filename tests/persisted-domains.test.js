'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const persisted = require('../extension/core/persisted-domains');

function fixture(version) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `backup-v${version}.json`), 'utf8'));
}

test('durable-domain registry explicitly classifies every known storage boundary', () => {
    const ids = new Set(persisted.DURABLE_DOMAIN_REGISTRY.map((entry) => entry.id));
    for (const required of [
        'settings', 'hiddenVideos', 'allowedVideos', 'markedWatchedVideos', 'blockedChannels', 'bookmarks',
        'watchProgress', 'watchTime', 'channelSpeeds', 'resumePositions',
        'persistentQueue', 'reactionSpammerState', 'watchLaterRemovalLog',
        'recommendationScrubSessions', 'localeOverride', 'debugPreference',
        'playerControlDismissals', 'theaterSplitRatio', 'transcriptIndex', 'credentialVault',
        'deArrowCache', 'sponsorBlockCache', 'returnDislikeCache', 'pageCrashGuard', 'updateRecovery',
        'stickyChatLayout'
    ]) assert.ok(ids.has(required), `registry must classify ${required}`);
    assert.equal(ids.size, persisted.DURABLE_DOMAIN_REGISTRY.length, 'domain ids must be unique');
    for (const domain of persisted.DURABLE_DOMAIN_REGISTRY) {
        assert.ok(['include', 'exclude'].includes(domain.backup), `${domain.id} needs an explicit backup policy`);
        assert.ok(domain.credentialScrub, `${domain.id} needs an explicit credential-scrub policy`);
        assert.ok(domain.migration, `${domain.id} needs an explicit migration policy`);
        if (domain.backup === 'exclude') assert.ok(domain.reason, `${domain.id} exclusion needs a reason`);
    }
});

test('persisted-domain service loads before every consumer surface', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
    for (const entry of manifest.content_scripts.filter((item) => Array.isArray(item.js) && item.js.includes('ytkit.js'))) {
        assert.ok(entry.js.indexOf('core/persisted-domains.js') > -1);
        assert.ok(entry.js.indexOf('core/persisted-domains.js') < entry.js.indexOf('ytkit.js'));
    }
    const popup = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8');
    assert.ok(popup.indexOf('core/persisted-domains.js') < popup.indexOf('popup.js'));
});

test('legacy backup fixtures v1-v4 migrate deterministically', () => {
    for (let version = 1; version <= 4; version += 1) {
        const first = persisted.migrateBackup(fixture(version));
        const second = persisted.migrateBackup(fixture(version));
        assert.deepEqual(first, second, `v${version} migration must be deterministic`);
        assert.equal(first.sourceVersion, version);
        assert.ok(first.domains.settings);
    }
    assert.deepEqual(persisted.migrateBackup(fixture(2)).domains.hiddenVideos, ['abcdefghijk']);
    assert.deepEqual(persisted.migrateBackup(fixture(3)).domains.allowedVideos, ['lmnopqrstuv']);
    assert.equal(persisted.migrateBackup(fixture(4)).settingsSchemaVersion, 7);
});

test('AI summaries migrate from both v4 backup shapes into the aiSummaries domain', () => {
    const artifact = {
        artifactId: 'abcdefghijk_1720972800000',
        videoId: 'abcdefghijk',
        summary: 'A validated summary.',
        bullets: [{ text: 'point', citations: ['C1'] }],
        citations: { C1: { timestamp: '0:01', startSeconds: 1 } },
        generatedAt: '2026-07-14T00:00:00.000Z'
    };
    // Pre-4.49.7 backups embedded the store inside the settings bag.
    const legacyShape = persisted.migrateBackup({
        exportVersion: 4,
        backupSchemaVersion: 1,
        settings: { hideHomeFeed: true, aiSummaryArtifactsData: { [artifact.artifactId]: artifact } }
    });
    assert.ok(legacyShape.domains.aiSummaries, 'legacy in-settings store must reach the aiSummaries domain');
    assert.deepEqual(Object.keys(legacyShape.domains.aiSummaries), [artifact.artifactId]);
    // 4.49.7+ v4 backups export the store as a top-level field.
    const topLevelShape = persisted.migrateBackup({
        exportVersion: 4,
        backupSchemaVersion: 1,
        settings: { hideHomeFeed: true },
        aiSummaries: { [artifact.artifactId]: artifact }
    });
    assert.deepEqual(Object.keys(topLevelShape.domains.aiSummaries), [artifact.artifactId]);
    // The registry classifies the new top-level key as an included domain.
    const domain = persisted.DURABLE_DOMAIN_REGISTRY.find((entry) => entry.id === 'aiSummaries');
    assert.equal(domain?.key, 'ytkit-ai-summaries');
    assert.equal(domain?.backup, 'include');
});

test('legacy filtered-video alias and allowed-video exceptions migrate through the public boundary', () => {
    const migratedAlias = persisted.migrateBackup({
        exportVersion: 2,
        settings: { hideHomeFeed: true },
        filteredVideoPosts: ['abcdefghijk']
    });
    assert.deepEqual(migratedAlias.domains.hiddenVideos, ['abcdefghijk']);

    const hiddenVideosTakePrecedence = persisted.migrateBackup({
        exportVersion: 3,
        settings: {},
        hiddenVideos: ['lmnopqrstuv'],
        filteredVideoPosts: ['abcdefghijk'],
        allowedVideos: ['zyxwvutsrqp']
    });
    assert.deepEqual(hiddenVideosTakePrecedence.domains.hiddenVideos, ['lmnopqrstuv']);
    assert.deepEqual(hiddenVideosTakePrecedence.domains.allowedVideos, ['zyxwvutsrqp']);
});

test('future backup version is rejected before a caller can stage mutations', () => {
    let stagedMutation = false;
    const importBoundary = (raw) => {
        const migrated = persisted.migrateBackup(raw);
        stagedMutation = true;
        return migrated;
    };
    assert.throws(
        () => importBoundary({ exportVersion: persisted.BACKUP_EXPORT_VERSION + 1, domains: {} }),
        /newer than this Astra Deck build supports/
    );
    assert.equal(stagedMutation, false);
});

test('current backup payload represents every included domain and scrubs credentials', () => {
    const allStorage = {
        ytSuiteSettings: { hideHomeFeed: true, aiSummaryApiKey: 'secret', _errors: [{ message: 'local diagnostic' }] },
        'ytkit-hidden-videos': ['abcdefghijk'],
        'ytkit-video-hider-allowed-videos': ['lmnopqrstuv'],
        'ytkit-blocked-channels': [{ id: 'UCfixture', name: 'Fixture' }],
        'ytkit-bookmarks': { abcdefghijk: [{ t: 12, n: 'note', d: 1700000000000 }] }
    };
    const domains = persisted.buildIncludedDomainPayload(allStorage);
    domains.transcriptIndex = [];
    for (const domain of persisted.INCLUDED_DOMAINS) {
        assert.ok(Object.hasOwn(domains, domain.id), `current backup must represent ${domain.id}`);
    }
    assert.equal(domains.settings.aiSummaryApiKey, undefined);
    assert.equal(domains.settings._errors, undefined);

    const migrated = persisted.migrateBackup({
        exportVersion: persisted.BACKUP_EXPORT_VERSION,
        backupSchemaVersion: persisted.BACKUP_SCHEMA_VERSION,
        settingsSchemaVersion: 8,
        domains
    });
    const sanitized = persisted.sanitizeMigratedDomains(migrated, (settings) => persisted.sanitizeDomainValue('settings', settings));
    assert.deepEqual(persisted.domainsToExtensionWrites(sanitized.domains)['ytkit-hidden-videos'], ['abcdefghijk']);
    assert.equal(sanitized.domains.settings.aiSummaryApiKey, undefined);
});

test('marked-watched domain keeps the newest valid IDs and migrates legacy exports', () => {
    const ids = Array.from({ length: 5002 }, (_, index) => String(index).padStart(11, '0'));
    const payload = persisted.buildIncludedDomainPayload({
        'ytkit-marked-watched-videos': ['not-a-video-id', ...ids]
    });

    assert.equal(payload.markedWatchedVideos.length, 5000);
    assert.equal(payload.markedWatchedVideos[0], ids[2]);
    assert.equal(payload.markedWatchedVideos.at(-1), ids.at(-1));

    const migrated = persisted.sanitizeMigratedDomains(persisted.migrateBackup({
        exportVersion: 4,
        backupSchemaVersion: 1,
        settings: {},
        markedWatchedVideos: [ids[0], ids[1]]
    }));
    assert.deepEqual(migrated.domains.markedWatchedVideos, [ids[0], ids[1]]);
});

test('portable domain scrubbing rejects common credential-key variants at any depth', () => {
    const sanitized = persisted.sanitizeDomainValue('usageStats', {
        safe: 1,
        nested: {
            accessToken: 'secret',
            OPENAI_API_KEY: 'secret',
            password_hash: 'secret',
            harmlessTokenCount: 3
        }
    });
    assert.deepEqual(sanitized, {
        safe: 1,
        nested: { harmlessTokenCount: 3 }
    });
});

test('current imports remove stale dynamic-domain keys that are absent from the backup', () => {
    const domains = { playerControlDismissals: { ytkit_pc_keep: true } };
    const current = { ytkit_pc_keep: false, ytkit_pc_stale: true, unrelated: true };
    assert.deepEqual(persisted.extensionKeysToRemove(domains, current), ['ytkit_pc_stale']);
    assert.deepEqual(persisted.domainsToExtensionWrites(domains), { ytkit_pc_keep: true });
});

test('worst-case transcript domain round-trips its current 1000 by 200000 cap', () => {
    const text = 'x'.repeat(200000);
    const records = Array.from({ length: 1000 }, (_, index) => ({
        videoId: `A${String(index).padStart(10, '0')}`,
        title: `Video ${index}`,
        text,
        indexedAt: index + 1
    }));
    const raw = {
        exportVersion: persisted.BACKUP_EXPORT_VERSION,
        backupSchemaVersion: persisted.BACKUP_SCHEMA_VERSION,
        settingsSchemaVersion: 8,
        domains: { transcriptIndex: records }
    };
    const migrated = persisted.migrateBackup(raw);
    const { domains, droppedByDomain } = persisted.sanitizeMigratedDomains(migrated);
    assert.equal(domains.transcriptIndex.length, 1000);
    assert.equal(domains.transcriptIndex[0].text.length, 200000);
    assert.equal(domains.transcriptIndex[999].videoId, 'A0000000999');
    assert.equal(droppedByDomain.transcriptIndex, 0);
});

test('import preview reports replace, merge, drop, and intentional exclusions', () => {
    const preview = persisted.buildImportPreview({
        settings: { hideHomeFeed: true, customCss: false },
        hiddenVideos: ['abcdefghijk'],
        transcriptIndex: [{ videoId: 'abcdefghijk', text: 'caption' }]
    }, { hiddenVideos: 2 });
    assert.deepEqual({ replace: preview.replace, merge: preview.merge, drop: preview.drop }, { replace: 2, merge: 2, drop: 2 });
    assert.ok(preview.exclusions.some((entry) => entry.id === 'credentialVault'));
    assert.match(persisted.formatImportPreview(preview), /2 items replace, 2 settings merge, 2 dropped/);
});
