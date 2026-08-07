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
    assert.match(importBlock, /finally\s*\{[\s\S]*?await refreshUndoImportVisibility\(\)/,
        'import cleanup must refresh Undo Import visibility even when rollback throws');
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
        'statusImportSnapshotFail',
        'statusImportUndoExpired',
        'statusImportUndoFail',
    ]) {
        assert.ok(enMessages[key]?.message, `EN locale must declare ${key}`);
    }
});

test('import and reset keep only reachable undo status copy', () => {
    assert.doesNotMatch(popupSource, /undoAvailable/,
        'import and reset must not carry a hardcoded undo availability branch');
    const removedKeys = new Set(['statusBackupImportedNoUndo', 'statusResetDoneNoUndo']);
    const localeRoot = path.join(__dirname, '..', 'extension', '_locales');
    for (const locale of fs.readdirSync(localeRoot)) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(localeRoot, locale, 'messages.json'), 'utf8'
        ));
        for (const key of removedKeys) {
            assert.equal(messages[key], undefined,
                `${locale} must not retain unreachable ${key}`);
        }
    }
});

test('companion-facing copy names Astra Downloader consistently', () => {
    const keys = {
        dlProgressConnectAudio: 'Connecting to Astra Downloader.',
        dlProgressConnectVideo: 'Connecting to Astra Downloader.',
        dlProgressLostTitle: 'Connection to Astra Downloader lost',
        dlPopupFormatsHint: 'Ask Astra Downloader which resolutions this video actually has.',
        dlPopupFormatsNone: 'Astra Downloader reported no video streams for this URL.',
        statusWelcomeProfileFull: 'GitHub-Full profile enabled. Astra Downloader and AI providers are now available.',
    };
    const localeRoot = path.join(__dirname, '..', 'extension', '_locales');
    for (const locale of fs.readdirSync(localeRoot)) {
        const messages = JSON.parse(fs.readFileSync(
            path.join(localeRoot, locale, 'messages.json'), 'utf8'
        ));
        for (const [key, expected] of Object.entries(keys)) {
            assert.ok(messages[key]?.message.includes('Astra Downloader'),
                `${locale}:${key} must name Astra Downloader`);
            if (locale === 'en') assert.equal(messages[key].message, expected);
        }
    }
    const downloadSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'features', 'download-ui', 'index.js'),
        'utf8'
    );
    assert.doesNotMatch(downloadSource, /Connecting to the local (?:audio|video) downloader/);
    assert.doesNotMatch(downloadSource, /Connection to downloader lost/);
});

test('backup, import, and reset preserve extension recovery when page storage is unavailable', () => {
    assert.match(popupSource,
        /unavailable\.code = 'YTKIT_PERSISTED_DATA_UNAVAILABLE'/,
        'the page-storage bridge must distinguish an unavailable tab from an operation failure');
    assert.match(popupSource,
        /readAllTranscriptRecords\(\{ allowUnavailable: true \}\)/,
        'export must allow extension-local backup when no page bridge responds');
    assert.match(popupSource,
        /unavailableDomains: transcriptAvailable \? \[\] : \['transcriptIndex'\]/,
        'a partial backup must explicitly identify its unavailable transcript domain');

    const importStart = popupSource.indexOf('async function importSettings(file)');
    const importEnd = popupSource.indexOf('\n}\n\nasync function undoImportSettings', importStart);
    const importBlock = popupSource.slice(importStart, importEnd);
    assert.match(importBlock, /allowPageUnavailable: true/,
        'import must stage a local rollback snapshot even without a YouTube tab');
    assert.match(importBlock, /hasTranscriptDomain && snapshot\.pageSnapshotId/,
        'import must leave transcript data unchanged when no page snapshot was captured');
    assert.match(importBlock, /statusBackupImportedNoTranscript/,
        'partial import must report that transcript data was retained');

    const resetStart = popupSource.indexOf('async function resetAllData()');
    const resetEnd = popupSource.indexOf('\n}\n\nasync function undoResetAllData', resetStart);
    const resetBlock = popupSource.slice(resetStart, resetEnd);
    assert.match(resetBlock, /allowPageUnavailable: true/,
        'reset must stage a local rollback snapshot even without a YouTube tab');
    assert.match(resetBlock, /if \(snapshot\.pageSnapshotId\)/,
        'reset must clear page data only after capturing its rollback snapshot');
    assert.match(resetBlock, /statusResetDoneNoTranscript/,
        'partial reset must report that transcript data was retained');

    const enMessages = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    for (const key of [
        'statusBackupExportedNoTranscript',
        'statusBackupImportedNoTranscript',
        'statusResetDoneNoTranscript',
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
    // The commit must come after the controller write so a failed write can
    // retry (the write goes through the mutation controller — see below).
    const writeIdx = block.indexOf(".mutate('_errors', arr)");
    const commitIdx = block.indexOf('_lastCorruptionSignature = signature;');
    assert.ok(writeIdx > -1 && commitIdx > writeIdx,
        'signature commit must follow the diagnostic write');
    // Lost-update guard: the diagnostic write must route through the
    // background-serialized mutation controller and touch only `_errors`
    // — never storageSet the full ytSuiteSettings object.
    assert.match(block, /getSettingsMutationController\(\)\.mutate\('_errors', arr\)/,
        'recordCorruptionDiagnostic must persist through the settings mutation controller');
    assert.doesNotMatch(block, /storageSet\(/,
        'recordCorruptionDiagnostic must not write the full settings object directly');
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

// ── 2b. Full-object settings writes route through the mutation controller ──

test('legacy-key migration merges through mutateMany instead of storageSet-ing the full object', () => {
    const start = popupSource.indexOf('async function loadSettings');
    assert.ok(start > -1, 'loadSettings must exist');
    const end = popupSource.indexOf('let _settingsMutationController', start);
    assert.ok(end > start, 'loadSettings block must be found');
    const block = popupSource.slice(start, end);
    assert.match(block, /getSettingsMutationController\(\)\.mutateMany\(/,
        'legacy migration must merge through the background-serialized controller');
    assert.doesNotMatch(block, /storageSet\(/,
        'loadSettings must not write the full ytSuiteSettings object directly (lost-update race)');
    // Legacy keys may only be removed after the merge persisted, so a
    // failed write retries on the next popup open instead of losing data.
    const mergeIdx = block.indexOf('.mutateMany(');
    const removeIdx = block.indexOf('await storageRemove(normalized.legacyKeys)');
    assert.ok(mergeIdx > -1 && removeIdx > mergeIdx,
        'storageRemove of the legacy keys must follow a successful controller merge');
    assert.match(block, /migrated\?\.ok/,
        'legacy-key removal must be gated on the controller result');
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

// ── 5. Quick toggles resolve schema defaults for never-written keys ──
// On a fresh install (or right after Reset) default-on features have no
// stored value, so raw storage truthiness rendered them as Disabled,
// counted them as 0 enabled, and made the first click compute the wrong
// `next` value. The popup must fall back to the schema defaultValue —
// same resolution the sidepanel uses.

function extractQuickToggleResolver() {
    const start = popupSource.indexOf('let _schemaIndex = null;');
    const end = popupSource.indexOf('// Resolves user-facing strings');
    assert.ok(start > -1 && end > start,
        'popup.js must declare the schema-index + isQuickToggleOn block before the i18n resolver');
    const block = popupSource.slice(start, end);
    return new Function('window', block + '\nreturn isQuickToggleOn;');
}

test('isQuickToggleOn falls back to the schema defaultValue for never-written keys', () => {
    const makeResolver = extractQuickToggleResolver();
    const isQuickToggleOn = makeResolver({
        __YTKIT_SETTINGS_SCHEMA__: {
            SETTINGS_SCHEMA: [
                { key: 'removeAllShorts', type: 'boolean', defaultValue: true },
                { key: 'debugMode', type: 'boolean', defaultValue: false },
            ]
        }
    });
    assert.equal(isQuickToggleOn({}, 'removeAllShorts'), true,
        'a never-written default-on key must render as enabled');
    assert.equal(isQuickToggleOn({}, 'debugMode'), false,
        'a never-written default-off key must render as disabled');
    assert.equal(isQuickToggleOn({ removeAllShorts: false }, 'removeAllShorts'), false,
        'an explicit stored false must win over the schema default');
    assert.equal(isQuickToggleOn({ removeAllShorts: null }, 'removeAllShorts'), true,
        'a stored null must fall back to the schema default (?? semantics, matching sidepanel.js)');
    assert.equal(isQuickToggleOn({}, 'noSuchKey'), false,
        'an unknown key with no schema entry must resolve to disabled');
    assert.equal(isQuickToggleOn(null, 'removeAllShorts'), true,
        'a missing settings object must still resolve the schema default');
});

test('isQuickToggleOn resolves the real schema: audit-named default-on quick toggles', () => {
    const schema = require('../extension/core/settings-schema');
    const makeResolver = extractQuickToggleResolver();
    const isQuickToggleOn = makeResolver({ __YTKIT_SETTINGS_SCHEMA__: schema });
    for (const key of ['removeAllShorts', 'hideRelatedVideos', 'sponsorBlock', 'cleanShareUrls']) {
        const entry = schema.findSettingEntry(key);
        assert.ok(entry, `schema must declare ${key}`);
        assert.equal(entry.defaultValue, true, `${key} must be default-on in the schema`);
        assert.equal(isQuickToggleOn({}, key), true,
            `fresh-install popup must render ${key} as enabled`);
    }
});

test('render, updateSummary, and the click handler all resolve through isQuickToggleOn', () => {
    // updateSummary (enabled count).
    const summaryStart = popupSource.indexOf('function updateSummary(settings)');
    assert.ok(summaryStart > -1, 'updateSummary must exist');
    const summaryBlock = popupSource.slice(summaryStart, summaryStart + 300);
    assert.match(summaryBlock, /isQuickToggleOn\(settings, key\)/,
        'updateSummary must count enabled toggles through the schema-default resolver');
    // render(): per-row state and per-group count.
    assert.match(popupSource, /const on = isQuickToggleOn\(settings, item\.key\);/,
        'render must resolve each row state through the schema-default resolver');
    assert.match(popupSource, /isQuickToggleOn\(settings, item\.key\) \? 1 : 0/,
        'render must compute the per-group enabled count through the schema-default resolver');
    // Click handler `next` computation.
    assert.match(popupSource, /const next = !isQuickToggleOn\(popupState\.settings, key\);/,
        'the toggle click handler must compute next from the resolved (default-aware) state');
    assert.doesNotMatch(popupSource, /Boolean\(settings\[item\.key\]\)/,
        'raw storage truthiness must not drive quick-toggle rendering');
});

// ── 6. Preview-mode bootstrap must not crash on a null ext ──

test('storage.onChanged wiring is guarded against a null ext (preview mode)', () => {
    assert.match(popupSource, /if \(ext\?\.storage\?\.onChanged\)/,
        'the onChanged wiring must optional-chain ext — it is null in preview mode');
    assert.doesNotMatch(popupSource, /if \(ext\.storage\?\.onChanged\)/,
        'a bare ext.storage access throws in preview mode and kills every listener wired after it');
});

// ── 7. Bridge-tab ranking must not read nonexistent Tab fields ──

test('rankPopupBridgeTab does not consult tab.currentWindow (not a tabs.Tab property)', () => {
    const start = popupSource.indexOf('function rankPopupBridgeTab');
    assert.ok(start > -1, 'rankPopupBridgeTab must exist');
    const end = popupSource.indexOf('function sortPopupBridgeTabs', start);
    assert.ok(end > start, 'rankPopupBridgeTab block must be found');
    const block = popupSource.slice(start, end);
    assert.doesNotMatch(block, /tab\?\.currentWindow|tab\.currentWindow/,
        'currentWindow is a tabs.query filter, not a Tab field — ranking on it is a permanent no-op');
    assert.match(block, /tab\?\.active/, 'active-tab preference must remain');
    assert.match(block, /tab\?\.highlighted/, 'highlighted-tab preference must remain');
});

// ── 8. Schema-overview interactions keep keyboard focus ──

test('schema-overview expand/toggle/reset refocus the rebuilt control after re-render', () => {
    assert.match(popupSource, /function refocusSchemaOverviewCategory\(cat\)/,
        'popup.js must declare the category refocus helper');
    assert.match(popupSource, /function refocusSchemaOverviewKey\(entry\)/,
        'popup.js must declare the per-key refocus helper');
    assert.match(popupSource, /\.so-row-head\[data-category="\$\{CSS\.escape\(cat\)\}"\]/,
        'category refocus must locate the rebuilt disclosure by data-category');

    // Category expand/collapse.
    const headStart = popupSource.indexOf("head.addEventListener('click'");
    assert.ok(headStart > -1, 'category head click handler must exist');
    const headBlock = popupSource.slice(headStart, headStart + 900);
    const headRender = headBlock.indexOf('renderSchemaOverview()');
    const headRefocus = headBlock.indexOf('refocusSchemaOverviewCategory(cat)');
    assert.ok(headRender > -1 && headRefocus > headRender,
        'expand/collapse must refocus the disclosure after the re-render destroys it');

    // Per-key boolean switch.
    const switchStart = popupSource.indexOf("btn.addEventListener('click'");
    assert.ok(switchStart > -1, 'schema-overview switch handler must exist');
    const switchBlock = popupSource.slice(switchStart, switchStart + 900);
    const switchRender = switchBlock.indexOf('renderSchemaOverview()');
    const switchRefocus = switchBlock.indexOf('refocusSchemaOverviewKey(entry)');
    assert.ok(switchRender > -1 && switchRefocus > switchRender,
        'the per-key switch must refocus its rebuilt control after re-render');

    // Per-key reset.
    const resetStart = popupSource.indexOf("resetBtn.addEventListener('click'");
    assert.ok(resetStart > -1, 'per-key reset handler must exist');
    const resetBlock = popupSource.slice(resetStart, resetStart + 1100);
    const resetRender = resetBlock.indexOf('renderSchemaOverview()');
    const resetRefocus = resetBlock.indexOf('refocusSchemaOverviewKey(entry)');
    assert.ok(resetRender > -1 && resetRefocus > resetRender,
        'per-key reset must refocus the row after its own button disappears');
});

// ── 9. Filter input hint is programmatically associated ──

test('#q carries aria-describedby pointing at the mini-DSL hint', () => {
    assert.match(popupHtmlSource, /<input id="q"[^>]*aria-describedby="search-hint"/,
        'the filter input must reference #search-hint via aria-describedby (the comment above it promises this wiring)');
    assert.match(popupHtmlSource, /id="search-hint"/,
        'the hint element #search-hint must exist');
});

// ── Schema overview must resolve schema defaults ──
// The stored ytSuiteSettings bag is SPARSE: only changed keys are persisted.
// The quick toggles and the sidepanel were fixed to fall back to the schema
// default in v4.49.6; the schema-overview panel a few pixels away was not, so
// on a fresh install every default-on feature read as Disabled, the category
// roll-ups undercounted them, and every untouched key whose default was
// false/0/'' grew a spurious "reset to default" button.
function extractSchemaOverviewResolvers() {
    const start = popupSource.indexOf('// A schema entry\'s effective value');
    const end = popupSource.indexOf('// v4.47.0 NEW-6: short pretty-print');
    assert.ok(start > -1 && end > start,
        'popup.js must declare the effective-value resolver next to isDefaultValue');
    const block = popupSource.slice(start, end);
    return new Function(
        block + '\nreturn { resolveEffectiveSettingValue, isDefaultValue };'
    )();
}

function extractIsToggleEnabled() {
    const start = popupSource.indexOf('function isToggleEnabled(entry, settings) {');
    const end = popupSource.indexOf('\n}', start) + 2;
    assert.ok(start > -1, 'popup.js must declare isToggleEnabled');
    const helpers = popupSource.indexOf('// A schema entry\'s effective value');
    const helpersEnd = popupSource.indexOf('function isDefaultValue');
    return new Function(
        popupSource.slice(helpers, helpersEnd)
        + popupSource.slice(start, end)
        + '\nreturn isToggleEnabled;'
    )();
}

test('schema overview treats an unwritten key as its schema default', () => {
    const { resolveEffectiveSettingValue, isDefaultValue } = extractSchemaOverviewResolvers();
    const defaultOn = { key: 'sponsorBlock', type: 'boolean', defaultValue: true };
    const defaultOff = { key: 'oledTheme', type: 'boolean', defaultValue: false };

    // Fresh install: nothing written yet.
    assert.equal(resolveEffectiveSettingValue(defaultOn, {}), true,
        'a default-on feature with no stored value is on');
    assert.equal(resolveEffectiveSettingValue(defaultOff, {}), false);
    // An explicit stored value always wins, including an explicit false.
    assert.equal(resolveEffectiveSettingValue(defaultOn, { sponsorBlock: false }), false,
        'an explicit opt-out must not be overridden by the default');

    // No reset affordance for a key that was never written.
    assert.equal(isDefaultValue(undefined, false), true,
        'an unwritten key with a false default is already at its default');
    assert.equal(isDefaultValue(undefined, true), true);
    assert.equal(isDefaultValue(undefined, ''), true);
    assert.equal(isDefaultValue(undefined, 0), true);
    // A genuine divergence still offers the reset.
    assert.equal(isDefaultValue(false, true), false);
    assert.equal(isDefaultValue('x', ''), false);
});

test('schema overview enabled counts include untouched default-on features', () => {
    const isToggleEnabled = extractIsToggleEnabled();
    assert.equal(isToggleEnabled({ key: 'sponsorBlock', type: 'boolean', defaultValue: true }, {}), true,
        'a default-on boolean must count as enabled before it is ever written');
    assert.equal(isToggleEnabled({ key: 'oledTheme', type: 'boolean', defaultValue: false }, {}), false);
    assert.equal(isToggleEnabled({ key: 'sponsorBlock', type: 'boolean', defaultValue: true }, { sponsorBlock: false }), false,
        'an explicit opt-out must count as disabled');
    assert.equal(isToggleEnabled({ key: 'uiFontSize', type: 'number', defaultValue: 14 }, {}), true,
        'a positive numeric default counts as enabled');
});

test('settings import reports a readable error instead of the raw JSON parser message', () => {
    const popupSource = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8'
    );
    const importStart = popupSource.indexOf('async function importSettings(file)');
    const importEnd = popupSource.indexOf('\n}\n\nasync function undoImportSettings', importStart);
    assert.ok(importStart > -1 && importEnd > importStart, 'importSettings block must be found');
    const importBlock = popupSource.slice(importStart, importEnd);

    // A bare `JSON.parse(text)` here surfaced "Unexpected token < in JSON at
    // position 0" through the generic catch, which names a byte offset and
    // tells the user nothing about which file to pick.
    assert.doesNotMatch(importBlock, /^\s*const data = JSON\.parse\(text\);/m,
        'the backup parse must be guarded, not left to the generic catch');
    assert.match(importBlock, /try\s*\{\s*data = JSON\.parse\(text\);\s*\}\s*catch/,
        'JSON.parse of the backup must have its own catch');
    assert.match(importBlock, /statusImportNotBackup/,
        'the parse failure must throw the localised backup-shape message');
    assert.match(importBlock, /console\.warn\([^)]*parseError|console\.warn\([\s\S]{0,120}?parseError/,
        'the raw parser error must still reach the console for diagnostics');

    // The message has to survive into every shipped locale. This is the check
    // that catches a key which generated but fell through to English: ar and
    // zh_CN are proofed directly in their catalogs rather than through the
    // generator tables, so they are exactly the two that silently regress.
    const localesDir = path.join(__dirname, '..', 'extension', '_locales');
    const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en', 'messages.json'), 'utf8'));
    const enMessage = en.statusImportNotBackup?.message;
    assert.ok(enMessage, 'EN locale must declare statusImportNotBackup');
    assert.match(enMessage, /exportVersion/, 'the copy must name the field a real backup carries');

    for (const locale of fs.readdirSync(localesDir)) {
        if (locale === 'en') continue;
        const messages = JSON.parse(
            fs.readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8')
        );
        const message = messages.statusImportNotBackup?.message;
        assert.ok(message, `${locale} must declare statusImportNotBackup`);
        assert.notEqual(message, enMessage,
            `${locale} statusImportNotBackup is still the English string — it fell through instead of being translated`);
    }
});
