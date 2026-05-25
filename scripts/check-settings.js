#!/usr/bin/env node
'use strict';

// scripts/check-settings.js — v5.0.0 settings-schema parity gate.
//
// Asserts the following invariants on every `npm run check`:
//   1. extension/core/settings-schema.js loads cleanly and exports the
//      expected surface (SETTINGS_SCHEMA, CATEGORIES, helpers).
//   2. Every entry has a complete metadata bundle with values drawn from
//      the canonical enums (CATEGORIES / RISKS / PROFILES / SCOPES / TYPES).
//   3. Schema key set === default-settings.json key set (no missing, no
//      extras, no duplicates).
//   4. Schema iteration order === default-settings.json insertion order.
//   5. buildDefaultsFromSchema() round-trips to default-settings.json
//      byte-for-byte (every default value matches).
//   6. Every entry's declared `type` matches the runtime type of its
//      defaultValue (null entries explicitly carry type "null").
//
// Exit 0 if all invariants hold; exit 1 with a per-issue list otherwise.
// Hooked into the `check` npm script alongside check-versions / check-i18n.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js');
const DEFAULTS_PATH = path.join(REPO_ROOT, 'extension', 'default-settings.json');

function fail(msg) {
    console.error('[check-settings]', msg);
    process.exitCode = 1;
}

function ok(msg) {
    console.log('[check-settings]', msg);
}

const issues = [];

// 1. Schema module loads
let schemaModule;
try {
    schemaModule = require(SCHEMA_PATH);
} catch (e) {
    fail('settings-schema.js failed to require: ' + e.message);
    process.exit(1);
}

const { SETTINGS_SCHEMA, CATEGORIES, RISKS, PROFILES, SCOPES, TYPES, CAPABILITIES, buildDefaultsFromSchema } = schemaModule;
for (const named of ['SETTINGS_SCHEMA', 'CATEGORIES', 'RISKS', 'PROFILES', 'SCOPES', 'TYPES', 'CAPABILITIES', 'buildDefaultsFromSchema']) {
    if (!schemaModule[named]) issues.push('settings-schema.js missing export: ' + named);
}
if (!Array.isArray(SETTINGS_SCHEMA)) issues.push('SETTINGS_SCHEMA is not an array');
if (issues.length) { for (const i of issues) fail(i); process.exit(1); }

// 2. Per-entry metadata validation
const seenKeys = new Set();
const validCats = new Set(CATEGORIES);
const validRisks = new Set(RISKS);
const validProfiles = new Set(PROFILES);
const validScopes = new Set(SCOPES);
const validTypes = new Set(TYPES);
const validCapabilities = new Set(CAPABILITIES);

for (let i = 0; i < SETTINGS_SCHEMA.length; i++) {
    const e = SETTINGS_SCHEMA[i];
    const ctx = `entry[${i}] (key=${e && e.key ? e.key : '?'})`;
    if (!e || typeof e !== 'object') { issues.push(ctx + ' is not an object'); continue; }
    if (seenKeys.has(e.key)) issues.push(ctx + ' duplicate key');
    seenKeys.add(e.key);
    if (typeof e.key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key)) issues.push(ctx + ' invalid key shape');
    if (!validCats.has(e.category)) issues.push(ctx + ' invalid category: ' + e.category);
    if (!validTypes.has(e.type)) issues.push(ctx + ' invalid type: ' + e.type);
    if (!validRisks.has(e.risk)) issues.push(ctx + ' invalid risk: ' + e.risk);
    if (!validProfiles.has(e.profile)) issues.push(ctx + ' invalid profile: ' + e.profile);
    if (!validScopes.has(e.scope)) issues.push(ctx + ' invalid scope: ' + e.scope);
    if (typeof e.immediateApply !== 'boolean') issues.push(ctx + ' immediateApply must be boolean');
    if (typeof e.destroyRequired !== 'boolean') issues.push(ctx + ' destroyRequired must be boolean');
    if (typeof e.internal !== 'boolean') issues.push(ctx + ' internal must be boolean');
    if (typeof e.since !== 'string') issues.push(ctx + ' since must be a string');

    // type vs defaultValue
    const v = e.defaultValue;
    const runtimeType = Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v);
    if (e.type !== runtimeType) issues.push(ctx + ` type "${e.type}" mismatches defaultValue runtime type "${runtimeType}"`);

    // Internal keys must be prefixed _; non-internal must not be.
    if (e.internal !== e.key.startsWith('_')) issues.push(ctx + ' internal flag does not match `_` prefix');

    // v4.47.0 NF17: optional `requires:` field declares the runtime
    // capabilities the feature strictly needs. Validate shape +
    // membership in CAPABILITIES.
    if (e.requires !== undefined) {
        if (!Array.isArray(e.requires)) {
            issues.push(ctx + ' requires must be an array of capability names');
        } else {
            if (e.requires.length === 0) {
                issues.push(ctx + ' requires must be omitted entirely when empty (no [] sentinel)');
            }
            const seenCaps = new Set();
            for (const cap of e.requires) {
                if (typeof cap !== 'string') {
                    issues.push(ctx + ' requires entries must be strings, got ' + typeof cap);
                    continue;
                }
                if (!validCapabilities.has(cap)) {
                    issues.push(ctx + ' requires unknown capability "' + cap + '" (allowlist: ' + Array.from(validCapabilities).join(', ') + ')');
                }
                if (seenCaps.has(cap)) {
                    issues.push(ctx + ' requires lists capability "' + cap + '" more than once');
                }
                seenCaps.add(cap);
            }
        }
    }
}

// 3-4. Schema <-> default-settings parity (set + order)
const defaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
const defaultKeys = Object.keys(defaults);
const schemaKeys = SETTINGS_SCHEMA.map((e) => e.key);

const defaultSet = new Set(defaultKeys);
const schemaSet = new Set(schemaKeys);
for (const k of defaultKeys) if (!schemaSet.has(k)) issues.push('default-settings.json key missing from schema: ' + k);
for (const k of schemaKeys) if (!defaultSet.has(k)) issues.push('schema key missing from default-settings.json: ' + k);

if (defaultKeys.length === schemaKeys.length) {
    for (let i = 0; i < defaultKeys.length; i++) {
        if (defaultKeys[i] !== schemaKeys[i]) {
            issues.push(`order mismatch at index ${i}: default="${defaultKeys[i]}" schema="${schemaKeys[i]}"`);
            break;  // one report is enough; downstream tooling can re-emit
        }
    }
}

// 5. Round-trip values
const rebuilt = buildDefaultsFromSchema();
for (const k of defaultKeys) {
    const lhs = JSON.stringify(defaults[k]);
    const rhs = JSON.stringify(rebuilt[k]);
    if (lhs !== rhs) issues.push(`defaultValue drift for "${k}": defaults=${lhs} schema=${rhs}`);
}

// Final verdict
if (issues.length === 0) {
    ok(`OK — ${SETTINGS_SCHEMA.length} schema entries match default-settings.json byte-for-byte`);
    ok(`Categories represented: ${CATEGORIES.length}, Risks: ${RISKS.length}, Profiles: ${PROFILES.length}`);
    process.exit(0);
}

console.error('[check-settings] FAIL — ' + issues.length + ' issue(s):');
for (const i of issues) console.error('  - ' + i);
process.exit(1);
