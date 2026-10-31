'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findBalancedObjectLiteral } = require('../scripts/catalog-utils');
require('../extension/core/remote-list-scope');
require('../extension/core/settings-schema');

const repoRoot = path.join(__dirname, '..');
const ytkitSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const defaultSettings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'default-settings.json'), 'utf8'));
const settingsMeta = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'settings-meta.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'tests', 'fixtures', 'settings-import-roundtrip.json'),
    'utf8'
));
const fullProfileFixture = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'tests', 'fixtures', 'settings-legacy-v1-full-profile.json'),
    'utf8'
));

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeObjectKey(key) {
    return key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function extractRetiredSettingKeys(source) {
    const match = source.match(/const\s+RETIRED_SETTING_KEYS\s*=\s*new Set\(\s*(\[[\s\S]*?\])\s*\);/);
    assert.ok(match, 'RETIRED_SETTING_KEYS must be extractable from ytkit.js');

    const keys = Function('"use strict"; return (' + match[1] + ');')();
    assert.ok(Array.isArray(keys), 'RETIRED_SETTING_KEYS must evaluate to an array literal');
    return new Set(keys);
}

function createSettingsManagerFromSource(source) {
    const objectLiteral = findBalancedObjectLiteral(source, 'const settingsManager =');
    assert.ok(objectLiteral, 'settingsManager object literal must be extractable from ytkit.js');

    const diagnostics = [];
    const retiredSettingKeys = extractRetiredSettingKeys(source);
    const DiagnosticLog = {
        record(ctx, msg) {
            diagnostics.push({ ctx, msg });
        }
    };
    const DebugManager = {
        log() {}
    };

    const manager = Function(
        'isPlainObject',
        'isSafeObjectKey',
        'RETIRED_SETTING_KEYS',
        'DiagnosticLog',
        'DebugManager',
        '"use strict"; return (' + objectLiteral + ');'
    )(isPlainObject, isSafeObjectKey, retiredSettingKeys, DiagnosticLog, DebugManager);

    return { manager, diagnostics };
}

test('settings import fixtures round-trip every prior schema version into the current schema', () => {
    const currentVersion = settingsMeta.settingsVersion;
    assert.equal(currentVersion, 12, 'fixture suite is pinned to the current v12 schema');
    assert.deepEqual(
        fixture.profiles.map((profile) => profile.schemaVersion),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        'fixtures must cover every prior SETTINGS_VERSION'
    );

    for (const profile of fixture.profiles) {
        const { manager, diagnostics } = createSettingsManagerFromSource(ytkitSource);
        assert.equal(manager.SETTINGS_VERSION, currentVersion, 'extracted manager must match generated metadata');

        const importedSettings = clone(profile.settings);
        const result = manager._prepareImportedSettings(importedSettings);

        assert.equal(result._settingsVersion, currentVersion, `v${profile.schemaVersion} import stamps current schema`);
        for (const key of Object.keys(defaultSettings)) {
            assert.ok(
                Object.hasOwn(result, key),
                `v${profile.schemaVersion} import should restore default key ${key}`
            );
        }

        for (const [key, expectedValue] of Object.entries(profile.expected)) {
            assert.deepEqual(
                result[key],
                expectedValue,
                `v${profile.schemaVersion} import should resolve ${key}`
            );
        }

        for (const key of profile.absent) {
            assert.equal(
                Object.hasOwn(result, key),
                false,
                `v${profile.schemaVersion} import should drop unsafe or retired key ${key}`
            );
        }

        const migrationEntries = (result._errors || []).filter((entry) => entry?.ctx === 'settings-migration');
        assert.equal(
            migrationEntries.length,
            currentVersion - profile.schemaVersion,
            `v${profile.schemaVersion} import should log one diagnostic per migration step`
        );
        assert.equal(
            diagnostics.filter((entry) => entry.ctx === 'settings-migration').length,
            currentVersion - profile.schemaVersion,
            `v${profile.schemaVersion} import should also record migration steps in DiagnosticLog`
        );
        assert.ok(
            migrationEntries.every((entry) => entry.msg.includes('profile-import: applied settings migration')),
            `v${profile.schemaVersion} migration diagnostics should name the profile-import source`
        );

        const secondImport = manager._prepareImportedSettings(result);
        assert.deepEqual(
            secondImport,
            result,
            `v${profile.schemaVersion} migrated profile should be idempotent on re-import`
        );
    }

    assert.equal({}.polluted, undefined, 'unsafe __proto__ fixture key must not pollute Object.prototype');
});

test('pinned v1 full-profile fixture migrates without dropping catalogued settings', () => {
    const currentVersion = settingsMeta.settingsVersion;
    assert.equal(fullProfileFixture.schemaVersion, 1, 'full-profile fixture must remain a v1 import snapshot');

    const { manager, diagnostics } = createSettingsManagerFromSource(ytkitSource);
    assert.equal(manager.SETTINGS_VERSION, currentVersion, 'extracted manager must match generated metadata');

    const sourceSettings = clone(fullProfileFixture.settings);
    const expectedOverrides = fullProfileFixture.expectedOverrides || {};
    const expectedDefaulted = new Set(fullProfileFixture.expectedDefaulted || []);
    const expectedAbsent = new Set(fullProfileFixture.expectedAbsent || []);

    for (const key of Object.keys(defaultSettings)) {
        assert.ok(
            Object.hasOwn(sourceSettings, key) || expectedDefaulted.has(key),
            `v1 full-profile fixture must either carry ${key} or list it under expectedDefaulted`
        );
    }

    for (const key of expectedDefaulted) {
        assert.ok(
            Object.hasOwn(defaultSettings, key),
            `v1 full-profile expectedDefaulted key ${key} must exist in default-settings`
        );
        assert.equal(
            Object.hasOwn(sourceSettings, key),
            false,
            `v1 full-profile expectedDefaulted key ${key} must be absent from the legacy fixture`
        );
    }

    for (const key of expectedAbsent) {
        assert.ok(
            Object.hasOwn(sourceSettings, key),
            `v1 full-profile expectedAbsent key ${key} must be present in the legacy fixture`
        );
    }

    const result = manager._prepareImportedSettings(sourceSettings);
    assert.equal(result._settingsVersion, currentVersion, 'v1 full-profile import stamps current schema');

    for (const key of Object.keys(defaultSettings)) {
        assert.ok(Object.hasOwn(result, key), `v1 full-profile import should restore default key ${key}`);

        if (key === '_errors') {
            assert.deepEqual(
                result._errors.slice(0, sourceSettings._errors.length),
                sourceSettings._errors,
                'v1 full-profile import should preserve pre-existing diagnostics before migration entries'
            );
        } else if (Object.hasOwn(expectedOverrides, key)) {
            assert.deepEqual(
                result[key],
                expectedOverrides[key],
                `v1 full-profile import should apply migration override for ${key}`
            );
        } else if (expectedDefaulted.has(key)) {
            assert.deepEqual(
                result[key],
                defaultSettings[key],
                `v1 full-profile import should default intentionally missing key ${key}`
            );
        } else {
            assert.deepEqual(
                result[key],
                fullProfileFixture.settings[key],
                `v1 full-profile import should preserve legacy value for ${key}`
            );
        }
    }

    for (const key of expectedAbsent) {
        assert.equal(
            Object.hasOwn(result, key),
            false,
            `v1 full-profile import should drop retired key ${key}`
        );
    }

    for (const key of Object.keys(fullProfileFixture.settings)) {
        if (key === '_settingsVersion' || expectedAbsent.has(key) || !Object.hasOwn(defaultSettings, key)) {
            continue;
        }
        assert.ok(Object.hasOwn(result, key), `v1 full-profile import should not drop legacy key ${key}`);
    }

    const migrationEntries = (result._errors || []).filter((entry) => entry?.ctx === 'settings-migration');
    assert.equal(
        migrationEntries.length,
        currentVersion - fullProfileFixture.schemaVersion,
        'v1 full-profile import should log one diagnostic per migration step'
    );
    assert.equal(
        diagnostics.filter((entry) => entry.ctx === 'settings-migration').length,
        currentVersion - fullProfileFixture.schemaVersion,
        'v1 full-profile import should record migration steps in DiagnosticLog'
    );

    const secondImport = manager._prepareImportedSettings(result);
    assert.deepEqual(secondImport, result, 'v1 full-profile migrated settings should be idempotent on re-import');
});

// The tests above run without a policy, so they never reach the schema check the
// real import goes through. _migrate stamps _settingsVersion on a backup older
// than the running schema, before that check, and the stamp isn't a schema key.
// So every older backup was refused with 'unknown setting "_settingsVersion"' in
// the panel and the userscript (seen live on both, 2026-10-31). A current backup
// returns from _migrate unstamped and passed, and the popup removes the stamp.
test('a backup imports through the real schema check', () => {
    require('../extension/core/policy-profile');
    const { manager } = createSettingsManagerFromSource(ytkitSource);
    const policy = globalThis.YTKitCore.createPolicyProfile();
    manager._policyProfile = policy;
    const backup = policy.buildExportSnapshot({ ...defaultSettings, hideAskAi: true }, { schemaOnly: true }).settings;
    assert.equal(Object.hasOwn(backup, '_settingsVersion'), false, 'a backup carries no stamp of its own');

    const imported = manager._prepareImportedSettings(backup, { backupSchemaVersion: settingsMeta.settingsVersion });
    assert.equal(imported._settingsVersion, settingsMeta.settingsVersion);
    assert.equal(imported.hideAskAi, true);

    assert.deepEqual(manager._importSkippedKeys, [], 'the stamp is not a skipped setting');

    const stamped = manager._prepareImportedSettings({ ...backup, _settingsVersion: 3 }, { backupSchemaVersion: 3 });
    assert.equal(stamped._settingsVersion, settingsMeta.settingsVersion, 'an older stamp in the file is replaced');
    assert.equal(stamped.hideAskAi, true);
    assert.deepEqual(manager._importSkippedKeys, [], 'nor is a stamp _migrate added');

    const newer =manager._prepareImportedSettings({ ...backup, _settingsVersion: 99 }, { backupSchemaVersion: 99 });
    assert.equal(newer._settingsVersion, 99, 'a newer stamp stays so migrations do not re-arm');

    // A setting this build doesn't have, from an older or a newer backup, can't cost
    // the user the rest of the file. The popup's import already worked this way.
    const warn = console.warn;
    const warned = [];
    console.warn = (...args) => warned.push(args.join(' '));
    try {
        const partial = manager._prepareImportedSettings({ ...backup, settingFromAnotherBuild: 1 }, { backupSchemaVersion: settingsMeta.settingsVersion });
        assert.equal(partial.hideAskAi, true);
        assert.equal(Object.hasOwn(partial, 'settingFromAnotherBuild'), false);
        assert.deepEqual([...manager._importSkippedKeys], ['settingFromAnotherBuild']);
        assert.match(warned.join('\n'), /settingFromAnotherBuild/);
    } finally {
        console.warn = warn;
    }

    manager._prepareImportedSettings(backup, { backupSchemaVersion: settingsMeta.settingsVersion });
    assert.deepEqual(manager._importSkippedKeys, [], 'the next import starts its list again');

    // A known key with a bad value still refuses the whole file.
    assert.throws(() => manager._prepareImportedSettings({ ...backup, hideAskAi: 'yes' }, { backupSchemaVersion: settingsMeta.settingsVersion }),
        /hideAskAi/);
    assert.throws(() => manager._prepareImportedSettings({ ...backup, subStyleColor: 'url(x)' }, { backupSchemaVersion: settingsMeta.settingsVersion }),
        /subStyleColor/);
});

test('an import with no policy loaded still leaves a list for the summary to count', () => {
    const { manager } = createSettingsManagerFromSource(ytkitSource);
    manager._getPolicyProfile = () => null;
    manager._importSkippedKeys = ['left over from the last import'];
    manager._prepareImportedSettings({ hideAskAi: true }, { backupSchemaVersion: settingsMeta.settingsVersion });
    assert.deepEqual(manager._importSkippedKeys, []);
});

test('the import summary counts settings it had to skip', () => {
    const body = ytkitSource.slice(ytkitSource.indexOf('async importAllSettingsDetailed(jsonString)'));
    assert.match(body.slice(0, body.indexOf('const restore = (snapshot)')),
        /skipped: this\._importSkippedKeys\.length \+ hiddenSummary\.skipped/);
});

test('_migrate preserves a future schema stamp instead of lowering it (no migration re-arm on downgrade)', () => {
    const { manager } = createSettingsManagerFromSource(ytkitSource);
    const future = manager.SETTINGS_VERSION + 5;
    const migrated = manager._migrate({ _settingsVersion: future, someFutureKey: 'x' }, 'downgrade-test');
    assert.equal(
        migrated._settingsVersion,
        future,
        'opening older code against newer data must keep the higher stamp so forward migrations are not re-run'
    );
    assert.equal(migrated.someFutureKey, 'x', 'future values must be preserved untouched');
});
