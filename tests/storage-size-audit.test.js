'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    STORAGE_KEYS,
    SYNC_QUOTA,
    assessSyncEligibility,
    buildAuditPayloads,
    formatReport,
    storageItemBytes
} = require('../scripts/audit-storage-size');

test('storage size audit uses Chrome sync byte accounting', () => {
    const value = { check: '✓', nested: ['Astra', 42] };
    const expected = Buffer.byteLength('sampleKey', 'utf8')
        + Buffer.byteLength(JSON.stringify(value), 'utf8');
    assert.equal(storageItemBytes('sampleKey', value), expected);
});

test('safe-store profile payload fits current storage.sync quotas', () => {
    const { safeStoreProfile } = buildAuditPayloads();
    const assessment = assessSyncEligibility(safeStoreProfile);

    assert.equal(assessment.totalBytes, 5572);
    assert.equal(assessment.itemCount, 1);
    assert.equal(assessment.largestItem.key, STORAGE_KEYS.settings);
    assert.equal(assessment.largestItem.bytes, 5572);
    assert.ok(assessment.totalBytes < SYNC_QUOTA.totalBytes);
    assert.ok(assessment.largestItem.bytes < SYNC_QUOTA.bytesPerItem);
    assert.equal(assessment.ok, true);
});

test('typical local payload is not storage.sync eligible', () => {
    const { typicalLocal } = buildAuditPayloads();
    const assessment = assessSyncEligibility(typicalLocal);

    // v4.47.0 NF29: adding `transcriptPreferredLanguage: "auto"` to the
    // settings catalogue bumped this baseline by 37 bytes.
    // v4.47.0 NF33: adding `hideVideosSubsLoadHiddenRatio: 0.8` added
    // another 36 bytes.
    // v4.47.0 EI-NEW3: adding `reactionSpammerMinIntervalMs: 500`
    // added another 35 bytes.
    // v4.47.0 NF9: adding `wheelSeek: false` + `wheelSeekStepSec: 5`
    // added another 39 bytes.
    // Dead-channel unsubscribe staging adds `subscriptionUnsubscribeStagingData`
    // to the settings catalogue, adding another 40 bytes.
    // NF1 videoNotes adds `videoNotes` + `videoNotesData`, adding another
    // 39 bytes to the empty settings payload.
    // cleanUiPreset (Compact Clean UI opt-in) adds another 22 bytes.
    // zenMode adds 16 bytes, playlistSearch 23 bytes, classicPlayerChrome 28 bytes.
    // SponsorBlock per-channel profiles add a boolean toggle, local data object,
    // and one safe-sync allowlist entry.
    // Preset profiles (Privacy, Researcher, PowerUser) add 3 booleans.
    assert.equal(assessment.totalBytes, 178281);
    assert.equal(assessment.ok, false);
    assert.equal(assessment.totalOk, false);
    assert.equal(assessment.perItemOk, false);
    assert.deepEqual(
        assessment.overSyncItemLimit.map((item) => item.key),
        [
            STORAGE_KEYS.deArrowCache,
            STORAGE_KEYS.sponsorBlockCache,
            STORAGE_KEYS.watchProgress,
            STORAGE_KEYS.resumePositions,
            STORAGE_KEYS.settings,
            STORAGE_KEYS.bookmarks
        ]
    );
});

test('storage audit report records the sync decision', () => {
    const report = formatReport(buildAuditPayloads());

    assert.match(report, /Safe-store profile sync candidate: viable \(5\.\d KB/);
    assert.match(report, /Full UI preferences payload: not viable for sync \(1[12]\.\d KB/);
    assert.match(report, /Whole chrome\.storage\.local payload: not viable for sync \(17[0-9]\.\d KB/);
    assert.match(report, /Keep histories, caches, diagnostics, watch progress, and downloaded-state data local-only/);
});
