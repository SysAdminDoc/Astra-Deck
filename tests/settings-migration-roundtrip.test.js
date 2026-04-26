'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { findBalancedObjectLiteral } = require('../scripts/catalog-utils');

const repoRoot = path.join(__dirname, '..');
const ytkitSource = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
const defaultSettings = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'default-settings.json'), 'utf8'));
const settingsMeta = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension', 'settings-meta.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'tests', 'fixtures', 'settings-import-roundtrip.json'),
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
    assert.equal(currentVersion, 6, 'fixture suite is pinned to the current v6 schema');
    assert.deepEqual(
        fixture.profiles.map((profile) => profile.schemaVersion),
        [1, 2, 3, 4, 5],
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
