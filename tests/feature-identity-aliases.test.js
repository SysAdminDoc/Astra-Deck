'use strict';

// 476 settings keys and 291 feature IDs, and until now nothing mapped an old
// identity to a current one. A rename orphans stored user state: the browser
// keeps the value under the old key, the loader reads the new one, and the
// setting reverts to its default with no error and nothing on screen.
//
// The alias table in settings-schema.js is the resolver, RETIRED_SHIPPED_IDS
// is the accounting of identities that were removed rather than renamed, and
// scripts/check-settings.js is what makes them non-optional: any identity that
// shipped in a tagged release and stops resolving fails the build.
//
// The table is empty at the time of writing. That is measured, not assumed —
// every commit that touched the settings source of truth and every tagged
// release back to v3.0.1 was compared, and the 26 identities that left were
// all removals. These tests exercise the resolver against a synthetic table so
// the empty case does not leave the code untested.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const schema = require(path.join(repoRoot, 'extension', 'core', 'settings-schema.js'));
const baseline = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'scripts', 'shipped-identity-baseline.json'), 'utf8'
));
const identityGenerator = require('../scripts/generate-shipped-identity-baseline.js');

const schemaKeys = new Set(schema.SETTINGS_SCHEMA.map((entry) => entry.key));

function liveFeatureIds() {
    const sources = [path.join(repoRoot, 'extension', 'ytkit.js')];
    const featureDir = path.join(repoRoot, 'extension', 'features');
    for (const entry of fs.readdirSync(featureDir, { withFileTypes: true })) {
        if (entry.isDirectory()) sources.push(path.join(featureDir, entry.name, 'index.js'));
    }
    const ids = new Set();
    for (const file of sources) {
        if (!fs.existsSync(file)) continue;
        const source = fs.readFileSync(file, 'utf8');
        const pattern = /^\s+id:\s*'([a-zA-Z][a-zA-Z0-9]*)'/gm;
        let match;
        while ((match = pattern.exec(source)) !== null) ids.add(match[1]);
    }
    return ids;
}

test('settings-schema exposes the identity resolver the loaders call', () => {
    assert.equal(typeof schema.resolveSettingKey, 'function');
    assert.equal(typeof schema.applySettingAliases, 'function');
    assert.equal(typeof schema.isRetiredShippedId, 'function');
    assert.ok(schema.SETTING_ALIASES && typeof schema.SETTING_ALIASES === 'object');
    assert.ok(Array.isArray(schema.RETIRED_SHIPPED_IDS));
    assert.ok(Object.isFrozen(schema.SETTING_ALIASES),
        'the alias table must be frozen; a runtime write would rename a setting for one session only');
});

test('an unknown key passes through the resolver unchanged', () => {
    // The resolver is not a validator. Rejecting what it does not recognise
    // would break every forward-compatible read of a newer backup.
    assert.equal(schema.resolveSettingKey('somethingNobodyHasHeardOf'), 'somethingNobodyHasHeardOf');
    assert.equal(schema.resolveSettingKey(''), '');
    assert.equal(schema.resolveSettingKey(null), '');
    assert.equal(schema.resolveSettingKey(42), '');
});

test('the resolver does not treat inherited Object keys as aliases', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
        assert.equal(schema.resolveSettingKey(key), key,
            `${key} must not resolve through the prototype chain`);
    }
});

test('applySettingAliases rewrites a renamed key onto its current name', () => {
    // Exercise the mechanism through a synthetic table so the currently empty
    // real one does not leave this untested.
    const { applySettingAliases } = loadSchemaWithAliases({ oldName: 'newName' });
    const result = applySettingAliases({ oldName: true, unrelated: 5 });
    assert.equal(result.settings.newName, true, 'the stored value must survive the rename');
    assert.equal('oldName' in result.settings, false, 'the historical key must not be carried forward');
    assert.equal(result.settings.unrelated, 5, 'unrelated keys pass through');
    assert.deepEqual(result.renamed, [{ from: 'oldName', to: 'newName' }]);
});

test('a value already stored under the current name beats the aliased one', () => {
    // The current-name value is the later, deliberate choice. An alias that
    // overwrote it would undo an edit the user made after the rename shipped.
    const { applySettingAliases } = loadSchemaWithAliases({ oldName: 'newName' });
    for (const input of [{ oldName: 'stale', newName: 'current' }, { newName: 'current', oldName: 'stale' }]) {
        const result = applySettingAliases(input);
        assert.equal(result.settings.newName, 'current',
            'iteration order must not decide which value wins');
        assert.deepEqual(result.renamed, []);
    }
});

test('applySettingAliases refuses anything that is not a settings bag', () => {
    for (const input of [null, undefined, 'settings', 42, ['a']]) {
        const result = schema.applySettingAliases(input);
        assert.deepEqual(result.settings, {});
        assert.deepEqual(result.renamed, []);
    }
});

test('every identity that shipped in a release still resolves', () => {
    const retired = new Set(schema.RETIRED_SHIPPED_IDS);
    const live = liveFeatureIds();
    const unresolved = [];
    for (const key of baseline.settingKeys) {
        if (schemaKeys.has(key) || schemaKeys.has(schema.resolveSettingKey(key)) || retired.has(key)) continue;
        unresolved.push(`setting:${key}`);
    }
    for (const id of baseline.featureIds) {
        if (live.has(id) || live.has(schema.resolveSettingKey(id))) continue;
        if (schemaKeys.has(id) || schemaKeys.has(schema.resolveSettingKey(id))) continue;
        if (retired.has(id)) continue;
        unresolved.push(`feature:${id}`);
    }
    assert.deepEqual(unresolved, [],
        'a shipped identity that resolves to nothing is a silent reset for every existing user');
});

test('nothing is both aliased and retired, and no alias points at a dead key', () => {
    const retired = new Set(schema.RETIRED_SHIPPED_IDS);
    const targets = Object.values(schema.SETTING_ALIASES);
    for (const [from, to] of Object.entries(schema.SETTING_ALIASES)) {
        assert.ok(schemaKeys.has(to), `alias "${from}" must point at a current schema key`);
        assert.equal(retired.has(from), false, `"${from}" cannot be both aliased and retired`);
    }
    assert.equal(new Set(targets).size, targets.length,
        'two aliases resolving to one key make the restored value ambiguous');
});

test('a retirement never names an identity that is still live', () => {
    const live = liveFeatureIds();
    const stale = schema.RETIRED_SHIPPED_IDS.filter((id) => schemaKeys.has(id) || live.has(id));
    assert.deepEqual(stale, [],
        'a retired entry for a live identity makes the gate blind to that identity being renamed later');
});

test('the shipped-identity baseline only grows', () => {
    // The baseline is the gate's memory. A key dropped from it is a rename the
    // gate can no longer see, so the generator merges rather than replaces.
    const generator = fs.readFileSync(
        path.join(repoRoot, 'scripts', 'generate-shipped-identity-baseline.js'), 'utf8'
    );
    assert.match(generator, /function mergeWithExisting/,
        'the generator must merge with the existing baseline instead of replacing it');
    assert.ok(baseline.settingKeys.length >= schemaKeys.size,
        'the baseline cannot hold fewer keys than the current schema');
    assert.equal('releases' in baseline, false,
        'volatile tag names must not make an unchanged identity baseline stale');
    const sortedKeys = [...baseline.settingKeys].sort();
    assert.deepEqual(baseline.settingKeys, sortedKeys, 'baseline keys must stay sorted for readable diffs');
    const sortedFeatureIds = [...baseline.featureIds].sort();
    assert.deepEqual(baseline.featureIds, sortedFeatureIds,
        'baseline feature IDs must stay sorted for readable diffs');
});

test('adding a tag for an already-checked identity set leaves the baseline byte-identical', () => {
    const identities = {
        v1: { settings: ['alpha'], features: ['featureA'] },
        HEAD: { settings: ['alpha', 'candidateSetting'], features: ['featureA', 'candidateFeature'] },
        v2: { settings: ['alpha', 'candidateSetting'], features: ['featureA', 'candidateFeature'] },
    };
    const options = (releaseTags) => ({
        releaseTags,
        currentRef: 'HEAD',
        settingKeysAt: (ref) => identities[ref]?.settings || null,
        featureIdsAt: (ref) => identities[ref]?.features || null,
    });
    const beforeTag = identityGenerator.serialize(identityGenerator.buildBaseline(options(['v1'])));
    const afterTag = identityGenerator.serialize(identityGenerator.buildBaseline(options(['v1', 'v2'])));
    assert.equal(afterTag, beforeTag,
        'creating a release tag after the candidate was checked must not rewrite the baseline');
});

test('a tagged release still contributes identities absent from the current candidate', () => {
    const identities = {
        v1: { settings: ['currentSetting'], features: ['currentFeature'] },
        historical: { settings: ['removedSetting'], features: ['removedFeature'] },
        HEAD: { settings: ['currentSetting'], features: ['currentFeature'] },
    };
    const result = identityGenerator.buildBaseline({
        releaseTags: ['v1', 'historical'],
        currentRef: 'HEAD',
        settingKeysAt: (ref) => identities[ref]?.settings || null,
        featureIdsAt: (ref) => identities[ref]?.features || null,
    });
    assert.ok(result.settingKeys.includes('removedSetting'));
    assert.ok(result.featureIds.includes('removedFeature'));
});

test('check-settings fails when a shipped identity stops resolving', () => {
    // The gate is the only thing that makes the alias table non-optional, so
    // prove it fails rather than trusting that it would. Use a private
    // baseline file so this mutation cannot race another test file that runs
    // check-settings against the repository baseline.
    const baselinePath = path.join(repoRoot, 'scripts', 'shipped-identity-baseline.json');
    const tampered = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    tampered.settingKeys = [...tampered.settingKeys, 'aKeyThatWasRenamedAndForgotten'].sort();
    const testBaselinePath = path.join(
        os.tmpdir(),
        `astra-settings-identity-${process.pid}-${Date.now()}.json`
    );
    fs.writeFileSync(testBaselinePath, JSON.stringify(tampered, null, 2) + '\n');
    try {
        let failed = false;
        let output = '';
        try {
            execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'check-settings.js')], {
                cwd: repoRoot,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, ASTRA_SETTINGS_IDENTITY_BASELINE: testBaselinePath }
            });
        } catch (error) {
            failed = true;
            output = String(error.stdout || '') + String(error.stderr || '');
        }
        assert.ok(failed, 'check-settings must exit non-zero on an unresolved shipped key');
        assert.match(output, /aKeyThatWasRenamedAndForgotten/,
            'the failure must name the key that stopped resolving');
    } finally {
        fs.unlinkSync(testBaselinePath);
    }
});

test('both settings loaders resolve aliases before reading stored state', () => {
    const popup = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    for (const [label, source, scope] of [['popup.js', popup, 'globalThis'], ['ytkit.js', ytkit, 'globalThis']]) {
        const start = source.indexOf(label === 'popup.js'
            ? 'function sanitizeSettingsObject(settings)'
            : '_sanitize(settings = {}) {');
        assert.ok(start > -1, `${label} must still declare its settings sanitizer`);
        const body = source.slice(start, source.indexOf('return sanitized;', start));
        assert.ok(body.includes(`${scope}.__YTKIT_SETTINGS_SCHEMA__?.applySettingAliases?.(settings)`),
            `${label} must resolve aliases before it filters stored keys`);
        const aliasAt = body.indexOf('applySettingAliases');
        const filterAt = body.indexOf('RETIRED_SETTING_KEYS.has(key)');
        assert.ok(aliasAt > -1 && filterAt > aliasAt,
            `${label} must resolve the rename before the retirement filter, not after`);
    }
});

test('the popup and the monolith agree on which keys are retired', () => {
    // These lists had drifted: lowPowerProfileBackup was retired in the
    // monolith in v4.62.0 and never added to the popup, so the popup carried a
    // key the runtime strips on every load.
    const extract = (source) => {
        const match = source.match(/const\s+RETIRED_SETTING_KEYS\s*=\s*new Set\(\s*(\[[\s\S]*?\])\s*\);/);
        assert.ok(match, 'RETIRED_SETTING_KEYS must be extractable');
        // eslint-disable-next-line no-new-func
        return new Set(Function(`"use strict"; return (${match[1]});`)());
    };
    const popupRetired = extract(fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8'));
    const ytkitRetired = extract(fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8'));
    assert.deepEqual([...popupRetired].sort(), [...ytkitRetired].sort(),
        'a key retired in one surface and not the other is a key one of them still writes');
    // The runtime list must be a subset of the historical accounting.
    const shipped = new Set(schema.RETIRED_SHIPPED_IDS);
    for (const key of ytkitRetired) {
        assert.ok(shipped.has(key), `${key} is stripped at runtime but missing from RETIRED_SHIPPED_IDS`);
    }
});

// ── helper ──
// Rebuild the identity block from settings-schema.js with a substituted alias
// table, so the resolver's behaviour is tested rather than just its empty case.
function loadSchemaWithAliases(aliases) {
    const source = fs.readFileSync(
        path.join(repoRoot, 'extension', 'core', 'settings-schema.js'), 'utf8'
    );
    const start = source.indexOf('const SETTING_ALIASES = Object.freeze({});');
    const end = source.indexOf('const HUMANISE_SHORT_FORMS');
    assert.ok(start > -1 && end > start, 'the identity block must be sliceable from settings-schema.js');
    const block = source.slice(start, end)
        .replace('const SETTING_ALIASES = Object.freeze({});',
            `const SETTING_ALIASES = Object.freeze(${JSON.stringify(aliases)});`);
    // eslint-disable-next-line no-new-func
    return new Function(block + '; return { resolveSettingKey, applySettingAliases };')();
}
