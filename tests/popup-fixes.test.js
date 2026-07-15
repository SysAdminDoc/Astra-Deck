'use strict';

// Regression tests for the popup audit-fix pass:
// 1. Export→import settings round-trips must not re-enable
//    hidePinnedComments / autoExpandComments (migration version seed +
//    conditional seed migrations).
// 2. Corruption-diagnostic writes must dedupe so the
//    renderStorageInfo → recordCorruptionDiagnostic → onStorageChanged
//    loop terminates after one write per distinct finding.
// 3. Clearing the search (× button or Escape) must also re-render the
//    schema overview, not just the quick-toggle list.
// 4. Inline schema-overview editors must clamp through policy-profile
//    clampSettingValue before persisting.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const popupSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'popup.js'),
    'utf8'
);
const popupHtmlSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'popup.html'),
    'utf8'
);

// ── Extraction helper ──
// Same pattern as the hardening suite's extractNormalizeFn: slice the
// vetted, repo-tracked declarations out of popup.js and evaluate them in
// isolation so the migration chain can be exercised as real code instead
// of regex pins. popup.js is not a module, so source slicing is the only
// way to run its helpers without a DOM.
function extractMigrationHelpers() {
    const constStart = popupSource.indexOf('const UNSAFE_OBJECT_KEYS');
    const constEnd = popupSource.indexOf('const STORAGE_KEYS');
    assert.ok(constStart > -1 && constEnd > constStart,
        'popup.js must declare UNSAFE_OBJECT_KEYS … SETTINGS_IMPORT_MIGRATIONS before STORAGE_KEYS');
    const constBlock = popupSource.slice(constStart, constEnd);

    const fnStart = popupSource.indexOf('function deepClone');
    const fnEnd = popupSource.indexOf('async function readExtensionJson');
    assert.ok(fnStart > -1 && fnEnd > fnStart,
        'popup.js must declare the shared-helper block (deepClone … migrateImportedSettings)');
    const fnBlock = popupSource.slice(fnStart, fnEnd);

    // eslint-disable-next-line no-new-func
    return new Function(
        constBlock + '\n' + fnBlock +
        '; return { migrateImportedSettings, SETTINGS_IMPORT_MIGRATIONS, SETTINGS_VERSION_FALLBACK };'
    )();
}

const { migrateImportedSettings, SETTINGS_IMPORT_MIGRATIONS, SETTINGS_VERSION_FALLBACK } =
    extractMigrationHelpers();

// ── 1a. Migration version seed ──

test('migrateImportedSettings seeds the starting version from the backup-level settingsSchemaVersion', () => {
    // Schema-only exports strip the inner _settingsVersion (not a schema
    // key), so the importer must be able to start the chain from the
    // backup's top-level settingsSchemaVersion instead of v1.
    const imported = { hidePinnedComments: false, autoExpandComments: false };
    const result = migrateImportedSettings(
        imported, SETTINGS_VERSION_FALLBACK, 'test-import',
        { backupSchemaVersion: SETTINGS_VERSION_FALLBACK }
    );
    assert.equal(result.hidePinnedComments, false,
        'a current-version backup must not re-enable hidePinnedComments');
    assert.equal(result.autoExpandComments, false,
        'a current-version backup must not re-enable autoExpandComments');
    assert.equal(result._settingsVersion, SETTINGS_VERSION_FALLBACK,
        'migrated snapshot must be stamped with the target version');
    assert.ok(!Array.isArray(result._errors) || result._errors.every(
        (e) => !/applied settings migration/.test(String(e.msg))),
        'no migrations should run when the backup already matches the target version');
});

test('migrateImportedSettings honors an explicit inner _settingsVersion over the backup seed', () => {
    const imported = { _settingsVersion: 2, hidePinnedComments: false };
    const result = migrateImportedSettings(
        imported, SETTINGS_VERSION_FALLBACK, 'test-import',
        { backupSchemaVersion: SETTINGS_VERSION_FALLBACK }
    );
    // Inner marker (v2) wins → migrations 3..target run.
    assert.ok(Array.isArray(result._errors)
        && result._errors.some((e) => /applied settings migration v3/.test(String(e.msg))),
        'inner _settingsVersion=2 must run the v3 migration even when the backup claims current');
    // …but the conditional migration must still respect the explicit choice.
    assert.equal(result.hidePinnedComments, false,
        'migration 3 must not override an explicit false');
});

test('migrateImportedSettings still defaults to v1 for legacy snapshots without any version signal', () => {
    const result = migrateImportedSettings({}, SETTINGS_VERSION_FALLBACK, 'test-import');
    assert.equal(result.hidePinnedComments, true,
        'legacy v1 snapshot without the key must be seeded with the new default');
    assert.equal(result.autoExpandComments, true,
        'legacy v1 snapshot without the key must be seeded with the new default');
    assert.equal(result._settingsVersion, SETTINGS_VERSION_FALLBACK);
});

// ── 1b. Conditional seed migrations ──

test('migrations 3 and 4 seed defaults without overriding explicit user choices', () => {
    for (const [step, key] of [[3, 'hidePinnedComments'], [4, 'autoExpandComments']]) {
        const explicitOff = SETTINGS_IMPORT_MIGRATIONS[step]({ [key]: false });
        assert.equal(explicitOff[key], false,
            `migration ${step} must preserve an explicit ${key}: false`);
        const explicitOn = SETTINGS_IMPORT_MIGRATIONS[step]({ [key]: true });
        assert.equal(explicitOn[key], true,
            `migration ${step} must preserve an explicit ${key}: true`);
        const unset = SETTINGS_IMPORT_MIGRATIONS[step]({});
        assert.equal(unset[key], true,
            `migration ${step} must seed ${key}: true when the key is absent`);
    }
});

test('legacy v1 import preserves explicit false through the full chain', () => {
    // End-to-end shape of the original bug: a backup whose version marker
    // was stripped (starts from v1) but which carries explicit user
    // choices must keep them through migrations 3/4.
    const result = migrateImportedSettings(
        { hidePinnedComments: false, autoExpandComments: false },
        SETTINGS_VERSION_FALLBACK, 'test-import'
    );
    assert.equal(result.hidePinnedComments, false);
    assert.equal(result.autoExpandComments, false);
});

test('popup importer threads the backup settingsSchemaVersion into the migration chain', () => {
    assert.match(popupSource,
        /backupSchemaVersion:\s*migrated\.settingsSchemaVersion/,
        'importSettings must pass the backup-level settingsSchemaVersion to the merge/migrate path');
    assert.match(popupSource,
        /function mergeImportedSettingsWithDefaults\(settings, defaults, settingsVersion, source, options = \{\}\)/,
        'mergeImportedSettingsWithDefaults must accept and forward the options bag');
});

test('popup import stages a session undo snapshot before applying backup data', () => {
    assert.match(popupHtmlSource, /id="undo-import-btn"/,
        'popup.html must declare the Undo Import button');
    assert.match(popupHtmlSource, /aria-label="Restore data from the most recent Import"/,
        'Undo Import must carry an accessible label');
    assert.match(popupHtmlSource, /data-i18n="undoImportBtn"/,
        'Undo Import must carry an i18n key');
    assert.match(popupSource, /const IMPORT_SNAPSHOT_KEY = '_importSnapshot'/,
        'popup.js must use a dedicated import snapshot key');
    assert.match(popupSource, /async function writeImportSnapshot\(snapshot\)/,
        'popup.js must expose an import snapshot writer');

    const importStart = popupSource.indexOf('async function importSettings(file)');
    const importEnd = popupSource.indexOf('\n}\n\nasync function undoImportSettings', importStart);
    assert.ok(importStart > -1 && importEnd > importStart,
        'importSettings block must be found');
    const importBlock = popupSource.slice(importStart, importEnd);
    const snapshotPos = importBlock.indexOf('writeImportSnapshot(snapshot)');
    const settingApplyPos = importBlock.indexOf('replaceSettings(importedSettingsToApply)');
    const otherApplyPos = importBlock.indexOf('storageSet(nonSettingWrites)');
    const applyPos = Math.min(
        settingApplyPos > -1 ? settingApplyPos : Number.MAX_SAFE_INTEGER,
        otherApplyPos > -1 ? otherApplyPos : Number.MAX_SAFE_INTEGER
    );
    assert.ok(snapshotPos > -1 && applyPos > -1 && snapshotPos < applyPos,
        'importSettings must stage the undo snapshot before writing imported data');
    assert.match(importBlock, /restoreCoordinatedSnapshot\(snapshot\)/,
        'failed import apply must restore the coordinated extension/page snapshot');
    assert.match(importBlock, /statusBackupImportedUndo/,
        'successful import must tell users the Undo Import recovery is available');

    const undoStart = popupSource.indexOf('async function undoImportSettings()');
    const undoEnd = popupSource.indexOf('\n}\n\n// v4.47.0 NF6', undoStart);
    assert.ok(undoStart > -1 && undoEnd > undoStart,
        'undoImportSettings block must be found');
    const undoBlock = popupSource.slice(undoStart, undoEnd);
    assert.match(undoBlock, /readImportSnapshot\(\)/,
        'Undo Import must read the session snapshot');
    assert.match(undoBlock, /restoreCoordinatedSnapshot\(snap\)/,
        'Undo Import must restore both extension and YouTube-origin data');
    assert.match(undoBlock, /clearImportSnapshot\(\)/,
        'Undo Import must clear the snapshot after restoration');
    assert.match(undoBlock, /broadcastSettingsReplaced\(restoredLocal\[STORAGE_KEYS\.settings\]\)/,
        'Undo Import must notify open YouTube tabs when settings are restored');

    const enMessages = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    for (const key of [
        'undoImportAria',
        'undoImportBtn',
        'statusBackupImportedUndo',
        'statusBackupImportedNoUndo',
        'statusImportSnapshotFail',
        'statusImportUndoExpired',
        'statusImportUndoFail',
    ]) {
        assert.ok(enMessages[key]?.message, `EN locale must declare ${key}`);
    }
});

// ── 2. Corruption-diagnostic dedupe ──

test('recordCorruptionDiagnostic dedupes by corruption signature so the write loop terminates', () => {
    assert.match(popupSource, /let _lastCorruptionSignature = null;/,
        'popup.js must track the last recorded corruption signature at module level');
    const start = popupSource.indexOf('async function recordCorruptionDiagnostic');
    assert.ok(start > -1, 'recordCorruptionDiagnostic must exist');
    const block = popupSource.slice(start, start + 1600);
    assert.match(block, /\.sort\(\)/,
        'the corruption signature must be order-independent (sorted key+reason list)');
    assert.match(block, /if \(signature === _lastCorruptionSignature\) return;/,
        'recordCorruptionDiagnostic must early-return when the signature matches the last recorded one');
    assert.match(block, /_lastCorruptionSignature = signature;/,
        'the signature must only be committed after a successful storage write');
    // The commit must come after the storageSet so a failed write can retry.
    const writeIdx = block.indexOf('await storageSet(');
    const commitIdx = block.indexOf('_lastCorruptionSignature = signature;');
    assert.ok(writeIdx > -1 && commitIdx > writeIdx,
        'signature commit must follow the diagnostic write');
});

// ── 3. Schema overview clear-path sync ──

test('clearing the search via the × button re-renders the schema overview', () => {
    const start = popupSource.indexOf("clearSearchButton.addEventListener('click'");
    assert.ok(start > -1, 'clear-search click handler must exist');
    const block = popupSource.slice(start, start + 400);
    assert.match(block, /renderSchemaOverview\(\)/,
        'clear-search click must un-filter the schema overview too');
});

test('clearing the search via Escape re-renders the schema overview', () => {
    const start = popupSource.indexOf("event.key === 'Escape' && q.value");
    assert.ok(start > -1, 'search Escape handler must exist');
    const block = popupSource.slice(start, start + 400);
    assert.match(block, /renderSchemaOverview\(\)/,
        'search Escape must un-filter the schema overview too');
});

// ── 4. Inline editors clamp through policy-profile ──

test('inline number and string editors clamp through policy clampSettingValue before persisting', () => {
    const occurrences = popupSource.match(/policy\.clampSettingValue\(/g) || [];
    assert.ok(occurrences.length >= 2,
        'both the number and string inline editors must route through policy.clampSettingValue');
    // Number editor reflects the clamped value back into the input.
    const numStart = popupSource.indexOf("input.type = 'number'");
    assert.ok(numStart > -1, 'number inline editor must exist');
    const numBlock = popupSource.slice(numStart, numStart + 1600);
    assert.match(numBlock, /clampSettingValue\(next, entry\)/,
        'number editor must clamp the parsed value against the schema entry');
    assert.match(numBlock, /input\.value = String\(next\)/,
        'number editor must reflect the clamped value back into the input');
});
