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

    // Channel allowlist mode adds the setting and its safe-sync allowlist
    // entry to the profile snapshot.
    assert.equal(assessment.totalBytes, 5811);
    assert.equal(assessment.itemCount, 1);
    assert.equal(assessment.largestItem.key, STORAGE_KEYS.settings);
    assert.equal(assessment.largestItem.bytes, 5811);
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
    // Video flip adds boolean toggle + string mode key.
    // Subscription content-type filter adds 2 booleans.
    // Mono-to-stereo adds 1 boolean.
    // Auto-dismiss content warning adds 1 boolean (default true).
    // Volume boost adds boolean + number level. Audio normalization adds boolean.
    // Remaining-time compact + hide-in-fullscreen add 2 booleans (65 bytes).
    // Auto-exit fullscreen adds 1 boolean (27 bytes).
    // Playback-error auto-recovery adds 1 boolean (30 bytes).
    // Persistent queue toggle + auto-advance add 2 booleans (58 bytes).
    // Shorts speed control + auto-advance add 2 booleans (53 bytes).
    // Scroll-in-fullscreen adds 1 boolean (25 bytes).
    // Watch Later workbench adds 1 boolean (28 bytes).
    // Muted/rewind caption triggers + live-edge speed reset add 3 booleans (80 bytes).
    // v4.49.0 Wave 11 userscript ingestion adds the Guide-element manager (bool +
    // empty array) + 6 CSS-toggle booleans + uiFontSize number (232 bytes).
    // The background-owned AI credential vault removes the 21-byte empty
    // aiSummaryApiKey field from ordinary settings.
    // GitHub-full videoInsights adds a 22-byte false-by-default preference.
    // Search-while-watching adds a 28-byte false-by-default preference.
    // Subscription list/compact view and loaded-only ordering add 3 preferences (96 bytes).
    // v4.49.7 moved the AI summary archive to the top-level
    // ytkit-ai-summaries key (-28 bytes from the settings bag).
    // v4.50.8 descriptive-audio preference adds 31 bytes.
    // v4.51.1 audio sync offset adds 22 bytes.
    // Client-side mark-as-watched adds 46 bytes to this local fixture.
    // Dual-language subtitles add the master toggle and language selector,
    // adding 60 bytes to the local settings payload.
    // Channel allowlist mode adds 64 bytes to the local settings payload.
    // The separate allowed-channel list adds a bounded 80-channel local
    // fixture alongside the existing blocklist.
    assert.equal(assessment.totalBytes, 184201);
    assert.equal(assessment.ok, false);
    assert.equal(assessment.totalOk, false);
    assert.equal(assessment.perItemOk, false);
    assert.deepEqual(
        assessment.overSyncItemLimit.map((item) => item.key),
        [
            STORAGE_KEYS.deArrowCache,
            STORAGE_KEYS.sponsorBlockCache,
            STORAGE_KEYS.watchProgress,
            STORAGE_KEYS.settings,
            STORAGE_KEYS.resumePositions,
            STORAGE_KEYS.bookmarks
        ]
    );
});

test('storage audit report handles arbitrary --file payloads without the built-in decision inputs', () => {
    const report = formatReport({ filePayload: { [STORAGE_KEYS.settings]: { theme: 'dark' } } });

    assert.match(report, /Astra Deck storage size audit/);
    assert.match(report, /filePayload: \d+ B across 1 items/);
    assert.doesNotMatch(report, /Decision:/);
});

test('storage audit report records the sync decision', () => {
    const report = formatReport(buildAuditPayloads());

    assert.match(report, /Safe-store profile sync candidate: viable \(5\.\d KB/);
    assert.match(report, /Full UI preferences payload: not viable for sync \(13\.\d KB/);
    assert.match(report, /Whole chrome\.storage\.local payload: not viable for sync \(17[0-9]\.\d KB/);
    assert.match(report, /Keep histories, caches, diagnostics, watch progress, and downloaded-state data local-only/);
});
