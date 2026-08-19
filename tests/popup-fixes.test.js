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

test('migrateImportedSettings preserves a future schema stamp', () => {
    const futureVersion = SETTINGS_VERSION_FALLBACK + 7;
    const result = migrateImportedSettings(
        { _settingsVersion: futureVersion, sponsorBlock: false },
        SETTINGS_VERSION_FALLBACK,
        'future-import'
    );
    assert.equal(result._settingsVersion, futureVersion,
        'older popup code must not lower the stamp and re-arm migrations');
    assert.equal(result.sponsorBlock, false);
});

test('popup importer threads the backup settingsSchemaVersion into the migration chain', () => {
    assert.match(popupSource,
        /backupSchemaVersion:\s*migrated\.settingsSchemaVersion/,
        'importSettings must pass the backup-level settingsSchemaVersion to the merge/migrate path');
    assert.match(popupSource,
        /function mergeImportedSettingsWithDefaults\(settings, defaults, settingsVersion, source, options = \{\}\)/,
        'mergeImportedSettingsWithDefaults must accept and forward the options bag');
    assert.match(popupSource,
        /_settingsVersion:\s*Math\.max\(migratedVersion, normalizeSettingsVersion\(settingsVersion\)\)/,
        'the final defaults merge must retain the highest schema stamp');
    assert.match(popupSource,
        /validateSettingsSnapshot\(settings, \{ dropUnknown: true \}\)/,
        'backup import must drop/report unknown keys instead of rejecting every known value');
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

test('popup exposes transactional filter-list import/export and bounded refresh controls', () => {
    for (const id of [
        'export-filter-list-btn',
        'import-filter-list-btn',
        'import-filter-list-file',
        'filter-list-url',
        'refresh-filter-list-btn',
        'filter-list-status',
        'filter-list-refresh-mode',
        'filter-list-stale-enabled'
    ]) {
        assert.match(popupHtmlSource, new RegExp(`id="${id}"`),
            `popup.html must expose ${id}`);
    }

    // Slice on the function's own closing brace rather than on whatever
    // happens to be declared next. Anchoring on the following declaration
    // made this assertion fail the moment an unrelated const was added
    // between the two, which is a test defect, not a regression.
    const importStart = popupSource.indexOf('async function importFilterList(file)');
    const importEnd = popupSource.indexOf('\n}\n', importStart);
    assert.ok(importStart > -1 && importEnd > importStart,
        'importFilterList block must be found');
    const importBlock = popupSource.slice(importStart, importEnd);
    const parsePos = importBlock.indexOf('parseVideoFilterList(data)');
    const snapshotPos = importBlock.indexOf('createCoordinatedSnapshot');
    const writePos = importBlock.indexOf('storageSet(nonSettingWrites)');
    assert.ok(parsePos > -1 && snapshotPos > parsePos && writePos > snapshotPos,
        'filter-list imports must validate, snapshot, then write');
    assert.match(importBlock, /restoreCoordinatedSnapshot\(snapshot\)/,
        'filter-list import failures must restore the prior snapshot');
    assert.match(popupSource, /YTKIT_REFRESH_FILTER_LIST/,
        'popup refresh must use the YouTube tab bridge');
    assert.match(popupSource, /updateFilterListSubscriptionPreferences/,
        'popup must persist manual refresh and stale-rule choices in subscription state');

    const enMessages = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    for (const key of [
        'exportFilterListBtn',
        'importFilterListBtn',
        'refreshFilterListBtn',
        'filterListUrlLabel',
        'filterListStatusReady',
        'filterListStatusImported',
        'filterListStatusRefreshed'
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
    const numBlock = popupSource.slice(numStart, numStart + 2400);
    assert.match(numBlock, /clampSettingValue\(next, entry\)/,
        'number editor must clamp the parsed value against the schema entry');
    assert.match(numBlock, /input\.value = String\(next\)/,
        'number editor must reflect the clamped value back into the input');
    assert.match(numBlock, /raw === '' \? entry\.defaultValue : Number\(raw\)/,
        'clearing a number editor must reset to its schema default');
});

test('schema overview editors use their visible labels as accessible names', () => {
    for (const selector of [
        "input.className = 'so-key-number'",
        "select.className = 'so-key-select'",
        "input.className = looksHex ? 'so-key-color' : 'so-key-text'",
        "grid.className = 'so-key-checks'",
        "textarea.className = 'so-key-json'"
    ]) {
        const start = popupSource.indexOf(selector);
        assert.ok(start > -1, `editor block must exist: ${selector}`);
        assert.match(popupSource.slice(start, start + 600),
            /setAttribute\('aria-label', label\.textContent\)/,
            `editor ${selector} must match its visible label`);
    }
});

test('finite settings render a constrained select and preserve typed values and focus', () => {
    const start = popupSource.indexOf("select.className = 'so-key-select'");
    assert.ok(start > -1, 'enum select editor must exist');
    // Bounded by content, not by a magic length: a fixed window silently
    // stops covering the later assertions as soon as the branch grows, which
    // is how a passing test turns into a vacuous one.
    const end = popupSource.indexOf('refocusSchemaOverviewKey(entry)', start);
    assert.ok(end > start, 'the enum branch must still end in the refocus call');
    const block = popupSource.slice(start, end + 200);
    assert.match(block, /for \(const value of entry\.enum\)/,
        'the select vocabulary must come from the canonical schema enum');
    assert.match(block, /entry\.type === 'number' \? Number\(select\.value\) : select\.value/,
        'number enums must remain numbers instead of being persisted as strings');
    assert.match(block, /await writeSetting\(entry\.key, next\)/,
        'enum changes must use the serialized settings write path');
    assert.match(block, /refocusSchemaOverviewKey\(entry\)/,
        'the rebuilt enum row must restore keyboard focus');
    // Scoped to the helper: matching at file scope would keep passing if the
    // helper lost its select branch while the string survived anywhere else.
    const helperStart = popupSource.indexOf('function refocusSchemaOverviewKey(entry)');
    assert.ok(helperStart > -1, 'popup.js must declare the shared key refocus helper');
    const helperEnd = popupSource.indexOf('\nfunction ', helperStart + 1);
    assert.ok(helperEnd > helperStart, 'the refocus helper must be followed by another function');
    const helper = popupSource.slice(helperStart, helperEnd);
    assert.match(helper, /select\[data-key="\$\{esc\}"\]/,
        'the shared refocus helper must discover enum select controls');
});

test('late capability results do not rebuild a focused schema editor', () => {
    const start = popupSource.indexOf('void ensureCapabilityMap().then((caps) =>');
    assert.ok(start > -1, 'capability bootstrap path must exist');
    const block = popupSource.slice(start, start + 700);
    assert.match(block, /!schemaOverviewList\.contains\(document\.activeElement\)/,
        'capability re-render must preserve a focused inline editor');
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

// The schema-overview editors read a SPARSE settings bag: only changed keys
// are persisted. Any editor that seeds or compares against the raw bag treats
// "never written" as "empty", so a focus and blur with no edit persists '' or
// [] over a non-empty default — silent data loss on a keyboard pass through an
// expanded category. These assert the editors resolve through the schema.
test('schema-overview editors seed and compare against the effective value, not raw storage', () => {
    const editorStart = popupSource.indexOf("if (entry.type === 'boolean') {");
    const editorEnd = popupSource.indexOf('function resolveEffectiveSettingValue');
    assert.ok(editorStart > -1 && editorEnd > editorStart,
        'popup.js must declare the schema-overview editors before the resolver');
    const editors = popupSource.slice(editorStart, editorEnd);

    assert.doesNotMatch(editors, /const next = !\(popupState\.settings\[entry\.key\] === true\)/,
        'the boolean switch must not derive its next value from the sparse bag');
    assert.match(editors, /const next = resolveEffectiveSettingValue\(entry, popupState\.settings\) !== true/,
        'the boolean switch must toggle the effective value');

    assert.doesNotMatch(editors, /const seed = Array\.isArray\(settings\[entry\.key\]\)/,
        'the checkbox grid must not seed from the sparse bag');
    assert.doesNotMatch(editors, /const seed = settings\[entry\.key\];/,
        'the JSON editor must not seed from the sparse bag');
    assert.doesNotMatch(editors, /if \(popupState\.settings\[entry\.key\] === raw\) return;/,
        'the string editor must not compare against the sparse bag');
    assert.doesNotMatch(editors, /JSON\.stringify\(popupState\.settings\[entry\.key\]\) === JSON\.stringify\(parsed\)/,
        'the JSON editor must not compare against the sparse bag');

    // Every editor branch resolves through the shared helper.
    const resolverUses = editors.match(/resolveEffectiveSettingValue\(entry, (?:settings|popupState\.settings)\)/g) || [];
    assert.ok(resolverUses.length >= 6,
        `every editor branch must resolve through the schema (found ${resolverUses.length})`);
});

test('a blur with no edit on an unwritten key persists nothing', () => {
    const { resolveEffectiveSettingValue } = extractSchemaOverviewResolvers();

    // String editor: the field is seeded from the effective value, so the
    // no-change guard compares like with like.
    const stringEntry = { key: 'autoSubtitleLang', type: 'string', defaultValue: 'en' };
    const seeded = resolveEffectiveSettingValue(stringEntry, {});
    assert.equal(seeded, 'en', 'the field seeds from the default, not an empty string');
    assert.equal(resolveEffectiveSettingValue(stringEntry, {}) === seeded, true,
        'a blur with no edit compares equal and must not write');

    // JSON editor: same contract for an array-typed key with a large default.
    const arrayEntry = { key: 'syncSafePrefsAllowlist', type: 'array', defaultValue: ['a', 'b', 'c'] };
    const arraySeed = resolveEffectiveSettingValue(arrayEntry, {});
    assert.deepEqual(arraySeed, ['a', 'b', 'c'],
        'the textarea seeds from the default rather than an empty array');
    assert.equal(
        JSON.stringify(resolveEffectiveSettingValue(arrayEntry, {})) === JSON.stringify(arraySeed),
        true,
        'a blur with no edit compares equal and must not overwrite the default'
    );

    // Checkbox grid: the tokens of a 14-item default must render checked, so
    // toggling one cannot silently drop the other thirteen.
    const gridEntry = { key: 'hiddenChatElements', type: 'array', defaultValue: ['x', 'y', 'z'] };
    const gridSeed = resolveEffectiveSettingValue(gridEntry, {});
    assert.deepEqual(gridSeed, ['x', 'y', 'z']);
});

test('optional-host grant scan is driven by the schema, not the sparse settings bag', () => {
    const start = popupSource.indexOf('async function refreshOptionalHostGrantState');
    const end = popupSource.indexOf('\n}', popupSource.indexOf('renderOptionalHostBanner();', start));
    const scan = popupSource.slice(start, end);
    assert.doesNotMatch(scan, /for \(const \[key, value\] of Object\.entries\(settings\)\)/,
        'a bag-driven scan is blind to default-on features that were never toggled');
    assert.match(scan, /getSchemaIndex\(\)/,
        'the scan must enumerate schema keys');
    assert.match(scan, /resolveEffectiveSettingValue\(entry, settings\)/,
        'the scan must resolve each key through its schema default');
});

test('the filter-list status line reports stored subscription state, not the shipped default', () => {
    // Regression: render() filled the URL input but never touched the status
    // line, so a user who had configured and fetched a list still read "No
    // filter list is being followed." on every popup open.
    assert.match(popupSource, /async function refreshFilterListStatus\(\)/,
        'popup.js must derive the filter-list status from stored state');
    assert.match(popupSource, /syncFilterListUrlInput\(settings\);\s*\n\s*void refreshFilterListStatus\(\);/,
        'render must refresh the status line alongside the URL input');

    const start = popupSource.indexOf('async function refreshFilterListStatus()');
    const end = popupSource.indexOf('\n}\n', start);
    assert.ok(start > -1 && end > start, 'refreshFilterListStatus block must be found');
    const block = popupSource.slice(start, end);

    for (const key of [
        'filterListStatusReady',
        'filterListStatusPendingTpl'
    ]) {
        assert.ok(popupSource.includes(key), `status must cover the ${key} state`);
    }
    for (const key of ['filterListStatusActiveTpl', 'filterListStatusStaleActiveTpl', 'filterListStatusStalePausedTpl']) {
        assert.ok(popupSource.includes(key), `status renderer must cover the ${key} state`);
    }
    assert.match(block, /describeRemoteListUrl/,
        'the status must resolve the configured URL through the shared scope rules');
    assert.match(popupSource, /const host = described\.hostname/,
        'only the host may be written into the DOM, never the stored URL');
    assert.match(popupSource, /\(record\.sourceUrl \|\| record\.url\) === described\.url/,
        'a cached record for a different URL must not be reported as current');
    assert.match(popupSource, /buildVideoFilterListSubscriptionMetadata/,
        'diagnostic bundles must include sanitized filter-list provenance');
    assert.match(popupSource, /formatRelativeTimestamp/,
        'freshness must use the shared relative-time formatter');

    // The token templates have to substitute at the call site or the
    // check-i18n substitution gate cannot see them. Plain string pins, not a
    // built regex: escaping a generated pattern is its own hazard.
    for (const key of ['filterListStatusPendingTpl', 'filterListStatusActiveTpl']) {
        const callIndex = popupSource.indexOf("t('" + key + "'");
        assert.ok(callIndex > -1, key + ' must be read through t()');
        const tail = popupSource.slice(callIndex, callIndex + 700);
        assert.ok(tail.includes(".replace('{host}', host)"),
            key + ' must substitute {host} next to its own t() call');
    }
});

test('filter-list refresh failures do not echo the bridge error back into the popup', () => {
    // t() resolves the key and drops the fallback, so passing result.error as
    // a fallback displayed nothing while looking like it displayed something.
    const start = popupSource.indexOf('async function refreshFilterList()');
    const end = popupSource.indexOf('\n}\n', start);
    const block = popupSource.slice(start, end);
    assert.ok(start > -1 && end > start, 'refreshFilterList block must be found');
    assert.doesNotMatch(block, /setFilterListStatus\([^)]*result\?\.error/,
        'the raw bridge error must not be passed as status copy');
    assert.match(block, /filterListStatusRefreshFail/,
        'refresh failures need their own message, not the generic operation failure');
    assert.match(block, /filterListStatusPermissionNeeded/,
        'a denied host grant must be reported as a permission prompt, not a generic failure');
    assert.match(block, /filterListStatusPrivateHost/,
        'a private-network address must say so instead of failing generically');

    const enMessages = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'
    ));
    for (const key of [
        'filterListStatusRefreshFail',
        'filterListStatusPermissionNeeded',
        'filterListStatusPrivateHost',
        'filterListStatusActiveTpl',
        'filterListStatusPendingTpl',
        'filterListStatusStaleActiveTpl',
        'filterListStatusStalePausedTpl',
        'filterListRefreshModeLabel',
        'filterListUseStaleLabel'
    ]) {
        assert.ok(enMessages[key]?.message, `en/messages.json must define ${key}`);
    }
});

// ── Filter-list URL: uncommitted input must survive an incidental re-render ──

test('syncFilterListUrlInput never overwrites the field the user is typing in', () => {
    // The URL persists only on submit, so until then the field holds
    // uncommitted input. render() runs on any quick toggle, any storage
    // change, and every permission refresh — rewriting the value there
    // discarded a half-typed address mid-entry.
    const source = popupSource;
    const start = source.indexOf('function syncFilterListUrlInput');
    assert.ok(start > -1, 'syncFilterListUrlInput must exist');
    const end = source.indexOf('function formatFilterListRelativeTime', start);
    assert.ok(end > start, 'formatFilterListRelativeTime must follow it');
    const fn = source.slice(start, end);

    assert.match(fn, /if \(!force && document\.activeElement === filterListUrlInput\) return;/,
        'an unforced sync must bail while the field has focus');
    assert.ok(
        fn.indexOf('return;') < fn.indexOf('filterListUrlInput.value ='),
        'the guard must precede the assignment'
    );

    // The incidental caller (render) must NOT force; deliberate actions must.
    const renderStart = source.indexOf('function render(settings, filter) {');
    assert.ok(renderStart > -1, 'render must exist');
    const renderCall = source.slice(renderStart, renderStart + 900);
    assert.match(renderCall, /syncFilterListUrlInput\(settings\);/,
        'render must call the guarded form');
    assert.doesNotMatch(renderCall, /syncFilterListUrlInput\(settings, \{ force/,
        'render is incidental and must never force a rewrite');

    const forced = source.split('syncFilterListUrlInput(popupState.settings, { force: true })').length - 1;
    assert.equal(forced, 4,
        'the four deliberate actions (submit, clear, stop, restore) must force the rewrite');
});

// ── Side panel: stop overstating what it knows ──

test('the side panel refreshes on tab changes it claims to track live', () => {
    // sidepanel.html promises "Live diagnostics" and "stream diagnostics", but
    // nothing re-read anything after boot: switching tabs left every dashboard
    // showing another tab's data under a "Live diagnostics updated" status.
    const sidepanel = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'sidepanel.js'), 'utf8');
    assert.match(sidepanel, /tabs\.onActivated\.addListener/,
        'the panel must refresh when the active tab changes');
    assert.match(sidepanel, /tabs\.onUpdated\?\.addListener/,
        'the panel must refresh when a tracked tab finishes navigating');
    assert.match(sidepanel, /changeInfo\?\.status !== 'complete'/,
        'only a completed navigation should trigger a refresh');
    assert.match(sidepanel, /isSupportedUrl\(tab\?\.url \|\| ''\)/,
        'the navigation filter must reuse the shared URL predicate');
    assert.match(sidepanel, /clearTimeout\(pending\)/,
        'refreshes must coalesce — one navigation emits several events');
});

test('side panel byte formatting scales past MB and matches the popup', () => {
    const sidepanel = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'sidepanel.js'), 'utf8');
    const start = sidepanel.indexOf('function formatBytes');
    assert.ok(start > -1, 'sidepanel must define formatBytes');
    const fn = sidepanel.slice(start, sidepanel.indexOf('function formatHumanName', start));

    // Evaluate the real function rather than pinning its text.
    // eslint-disable-next-line no-new-func
    const formatBytes = new Function(
        "const BYTE_UNITS = ['B','KB','MB','GB','TB'];" + fn + '; return formatBytes;')();
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1024), '1 KB');
    assert.match(formatBytes(2 * 1024 ** 3), /\bGB$/,
        'a multi-GB store must not read as thousands of MB');
    assert.match(formatBytes(1024 ** 4), /\bTB$/);
});

test('a denied host-permission prompt is not reported as a failed save', () => {
    // "Save failed. Try refreshing the dashboard." cannot fix a denied grant
    // and sends the user looking in the wrong place.
    const sidepanel = fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'sidepanel.js'), 'utf8');
    assert.match(sidepanel, /const deniedGrant = !granted;/,
        'the save-failure path must distinguish a denied grant');
    assert.match(sidepanel, /spRowHostAccessDeniedTpl/,
        'the row description must name the permission cause');
    assert.match(sidepanel, /spStatusHostAccessDenied/,
        'the status line must name the permission cause');

    const en = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', '_locales', 'en', 'messages.json'), 'utf8'));
    for (const key of ['spRowHostAccessDeniedTpl', 'spStatusHostAccessDenied', 'spStatStoredSettings']) {
        assert.ok(en[key]?.message, `${key} must exist in the EN catalogue`);
    }
    // The storage stat no longer borrows the overview card's label.
    assert.doesNotMatch(sidepanel, /t\('panelTitle', 'Settings'\), value: String\(Object\.keys\(settings\)/,
        'the stored-settings stat must not be labelled "Settings" like the schema count');
});

// ── Onboarding must confirm itself, and state hooks must have a tone ──

test('completing onboarding shows a confirmation instead of the card just vanishing', () => {
    // Picking a preset flipped a bundle of settings and produced zero
    // feedback. The two profile-confirmation messages were translated into
    // every locale but unreachable: the profile step hands over to the preset
    // step rather than dismissing, so no `profile-*` reason ever arrived.
    const start = popupSource.indexOf('async function pickWelcomePreset');
    assert.ok(start > -1, 'pickWelcomePreset must exist');
    const fn = popupSource.slice(start, popupSource.indexOf('function showWhatsNew', start));

    assert.match(fn, /showStatus\(fullProfile/,
        'completing onboarding must confirm which profile is active');
    assert.match(fn, /statusWelcomeProfileFull/, 'the full-profile message must be used');
    assert.match(fn, /statusWelcomeProfileSafe/, 'the store-safe message must be used');
    assert.ok(
        fn.indexOf('await dismissWelcomeCard') < fn.indexOf('showStatus(fullProfile'),
        'the confirmation must follow the successful write, not precede it'
    );

    // The unreachable branches are gone rather than left as decoys.
    const dismiss = popupSource.slice(
        popupSource.indexOf('async function dismissWelcomeCard'),
        popupSource.indexOf('let _welcomePickInFlight')
    );
    assert.doesNotMatch(dismiss, /reason === 'profile-store-safe'/,
        'the dead profile-reason branch must be removed');
});

test('every popup state hook the JS sets has a matching tone rule', () => {
    // popup.js sets data-state / data-tier on three surfaces to signal
    // outcomes; none of them had a single CSS rule, so a filter-list refusal,
    // a storage-corruption banner, and a failed selector asset all rendered in
    // the same neutral grey as their idle state.
    const css = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8');

    for (const selector of [
        '.filter-list-tools__status[data-state="error"]',
        '.filter-list-tools__status[data-state="success"]',
        '.filter-list-tools__status[data-state="info"]',
        '.selector-health-asset[data-state="degraded"]',
        '.selector-health-asset[data-state="failed"]',
        '.storage-banner[data-tier="soft"]',
        '.storage-banner[data-tier="corruption"]',
    ]) {
        assert.ok(css.includes(selector), `popup.css must style ${selector}`);
    }

    // Corruption must not look identical to a size nudge — that distinction is
    // the entire reason the tiers exist.
    const soft = css.slice(css.indexOf('.storage-banner[data-tier="soft"] {'));
    assert.match(soft.slice(0, 200), /--warning/,
        'the soft size nudge must use the warning tone');
    const corruption = css.slice(css.indexOf('.storage-banner[data-tier="corruption"] .storage-banner-icon {'));
    assert.match(corruption.slice(0, 200), /--error/,
        'the corruption tier must use the error tone');
});
