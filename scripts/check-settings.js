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
//   7. Every user-facing key has a runtime consumer or a registered feature.
//   8. Every in-page array sub-toggle token is exposed by the popup's
//      schema `knownValues` editor vocabulary.
//   9. Every setting key and feature ID that has shipped in a tagged release
//      still resolves: it is in the schema, an alias points at a schema key,
//      or it is explicitly retired. A rename that skips the alias table
//      orphans stored user state silently, so it fails the build instead.
//
// Exit 0 if all invariants hold; exit 1 with a per-issue list otherwise.
// Hooked into the `check` npm script alongside check-versions / check-i18n.

const fs = require('fs');
const path = require('path');
const { extractFeatureCopyFromSource, findBalancedObjectLiteral } = require('./catalog-utils');

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
const { SETTING_ALIASES, RETIRED_SHIPPED_IDS, resolveSettingKey } = schemaModule;
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

    // Optional value constraints (range/enum enforcement). `min`/`max` clamp
    // numeric settings; `enum` coerces unrecognized values to the default.
    // Validate their shapes here so the constraints stay consistent with the
    // entry's type and defaultValue.
    if (e.min !== undefined || e.max !== undefined) {
        if (e.type !== 'number') issues.push(ctx + ' min/max only valid on a number-typed entry');
        if (e.min !== undefined && typeof e.min !== 'number') issues.push(ctx + ' min must be a number');
        if (e.max !== undefined && typeof e.max !== 'number') issues.push(ctx + ' max must be a number');
        if (typeof e.min === 'number' && typeof e.max === 'number' && e.min > e.max) issues.push(ctx + ' min must be <= max');
        if (typeof e.defaultValue === 'number') {
            if (typeof e.min === 'number' && e.defaultValue < e.min) issues.push(ctx + ' defaultValue is below min');
            if (typeof e.max === 'number' && e.defaultValue > e.max) issues.push(ctx + ' defaultValue is above max');
        }
    }
    if (e.enum !== undefined) {
        if (!Array.isArray(e.enum) || e.enum.length === 0) {
            issues.push(ctx + ' enum must be a non-empty array');
        } else {
            for (const ev of e.enum) {
                const evType = ev === null ? 'null' : (Array.isArray(ev) ? 'array' : typeof ev);
                if (evType !== e.type) issues.push(ctx + ` enum value ${JSON.stringify(ev)} does not match entry type "${e.type}"`);
            }
            if (!e.enum.includes(e.defaultValue)) issues.push(ctx + ' enum must include the defaultValue');
        }
    }
    if (!e.internal && e.type === 'number' && e.enum === undefined
        && typeof e.min !== 'number' && typeof e.max !== 'number') {
        issues.push(ctx + ' user-facing number settings require a schema bound or enum');
    }

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

// 6. Every schema key must be referenced by something that implements it.
//
// Parity with default-settings.json proves the two files agree, not that the
// setting exists in the product: an orphaned key (implementation deleted, key
// kept) satisfies every check above while doing nothing. Scan the shipped
// source for each key.
const REFERENCE_ROOTS = [
    path.join(REPO_ROOT, 'extension'),
];
const REFERENCE_SKIP = new Set([
    path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js'),
    path.join(REPO_ROOT, 'extension', 'default-settings.json'),
    path.join(REPO_ROOT, 'extension', '_locales'),
]);

function collectSourceText(dir, sink) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (REFERENCE_SKIP.has(full)) continue;
        if (entry.isDirectory()) { collectSourceText(full, sink); continue; }
        if (!/\.(js|mjs|html|json)$/.test(entry.name)) continue;
        try { sink.push(fs.readFileSync(full, 'utf8')); } catch { /* reason: an unreadable file is not a schema problem; the gate
            reports on what it could read rather than failing on a
            permissions or encoding error. */ }
    }
}

// A schema key is only "referenced" when it appears as a whole token. Plain
// substring matching makes this invariant vacuous for every prefix family: a
// key that is a lexical substring of any other identifier can never be
// flagged orphaned, so deleting every consumer of `sponsorBlock` would still
// pass while `sponsorBlockBaseUrl` exists.
const KEY_BOUNDARY_CACHE = new Map();
function corpusReferencesKey(corpus, key) {
    let pattern = KEY_BOUNDARY_CACHE.get(key);
    if (!pattern) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // A key is a whole token when it is not flanked by identifier
        // characters. `$` and `-` are excluded deliberately: neither appears
        // in a schema key, and treating `-` as a boundary would let a
        // kebab-case string satisfy a camelCase key.
        pattern = new RegExp('(?<![A-Za-z0-9_$])' + escaped + '(?![A-Za-z0-9_$])');
        KEY_BOUNDARY_CACHE.set(key, pattern);
    }
    return pattern.test(corpus);
}

const referenceChunks = [];
for (const root of REFERENCE_ROOTS) collectSourceText(root, referenceChunks);
const referenceCorpus = referenceChunks.join(String.fromCharCode(10));
const orphanKeys = SETTINGS_SCHEMA
    .map((entry) => entry.key)
    .filter((key) => !corpusReferencesKey(referenceCorpus, key));
if (orphanKeys.length) {
    issues.push('schema key(s) referenced nowhere in extension/: ' + orphanKeys.join(', '));
}

// 7. A declaration/default/UI echo is not an implementation. Build a second,
// stricter corpus that excludes the schema, generated defaults, popup editor,
// and in-page settings renderer; strip comments and the monolith's defaults
// object. A setting is implemented when it is either a registered feature
// (canonical feature copy exists) or is read by another shipped runtime file.
const RUNTIME_SKIP = new Set([
    path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js'),
    path.join(REPO_ROOT, 'extension', 'default-settings.json'),
    path.join(REPO_ROOT, 'extension', 'popup.js'),
    path.join(REPO_ROOT, 'extension', 'features', 'settings-panel', 'index.js'),
]);

function collectRuntimeSources(dir, sink) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '_locales') collectRuntimeSources(full, sink);
            continue;
        }
        if (!entry.name.endsWith('.js') || RUNTIME_SKIP.has(full)) continue;
        let source;
        try { source = fs.readFileSync(full, 'utf8'); } catch { continue; }
        sink.push({ full, source });
    }
}

// Strip comments WITHOUT crossing string boundaries.
//
// The naive `/\/\*[\s\S]*?\*\//g` this replaced could not tell a comment from
// a string containing comment punctuation. ytkit.js carries the literal
// `'/*/*'`, which opened a fake block comment that ran 75,662 characters --
// deleting roughly lines 5877-7300 of runtime code from this gate's corpus.
// Every schema key implemented only in that region looked unreferenced, and
// the gate stayed green purely because its substring test matched a longer
// identifier elsewhere. Whole-token matching exposed it.
//
// This is a small scanner rather than a regex: it tracks string, template and
// regex-literal state so a comment marker inside a literal is left alone.
function stripJsComments(source) {
    const text = String(source || '');
    let out = '';
    let i = 0;
    // Tracks the last significant character so a `/` can be classified as
    // division or as the start of a regex literal.
    let prevSignificant = '';
    while (i < text.length) {
        const char = text[i];
        const next = text[i + 1];

        // Line comment.
        if (char === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') i += 1;
            continue;
        }
        // Block comment.
        if (char === '/' && next === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
            i += 2;
            out += ' ';
            continue;
        }
        // String or template literal — copied through verbatim.
        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            out += char;
            i += 1;
            while (i < text.length) {
                if (text[i] === '\\') { out += text[i] + (text[i + 1] || ''); i += 2; continue; }
                out += text[i];
                if (text[i] === quote) { i += 1; break; }
                i += 1;
            }
            prevSignificant = quote;
            continue;
        }
        // Regex literal. Only after a position where a regex may legally
        // begin; otherwise the `/` is division.
        if (char === '/' && (prevSignificant === '' || '=(,:[!&|?{};+-*%<>~^'.includes(prevSignificant))) {
            out += char;
            i += 1;
            let inClass = false;
            while (i < text.length) {
                if (text[i] === '\\') { out += text[i] + (text[i + 1] || ''); i += 2; continue; }
                if (text[i] === '[') inClass = true;
                else if (text[i] === ']') inClass = false;
                else if (text[i] === '/' && !inClass) { out += text[i]; i += 1; break; }
                else if (text[i] === '\n') break;
                out += text[i];
                i += 1;
            }
            prevSignificant = '/';
            continue;
        }

        out += char;
        if (!/\s/.test(char)) prevSignificant = char;
        i += 1;
    }
    return out;
}

const runtimeSources = [];
collectRuntimeSources(path.join(REPO_ROOT, 'extension'), runtimeSources);
const featureCopy = {};
const runtimeChunks = [];
for (const item of runtimeSources) {
    const extracted = extractFeatureCopyFromSource(item.source);
    Object.assign(featureCopy, extracted.copies);
    let source = item.source;
    if (item.full.endsWith(path.join('extension', 'ytkit.js'))) {
        const defaultsLiteral = findBalancedObjectLiteral(source, 'defaults:');
        if (defaultsLiteral) source = source.replace(defaultsLiteral, '');
    }
    runtimeChunks.push(stripJsComments(source));
}
const runtimeCorpus = runtimeChunks.join('\n');
const inertKeys = SETTINGS_SCHEMA
    .filter((entry) => !entry.internal)
    .map((entry) => entry.key)
    .filter((key) => !featureCopy[`feature_${key}_name`] && !corpusReferencesKey(runtimeCorpus, key));
if (inertKeys.length) {
    issues.push('user-facing schema key(s) have no runtime consumer or registered feature: ' + inertKeys.join(', '));
}

// 8. The in-page settings panel models hidden-element sub-toggles as compact
// array literals whose `_arrayValue` is each row's first item. Compare every
// such runtime token with the popup editor vocabulary. This is intentionally
// one-way: `knownValues` may include selector-backed values that do not have an
// in-page card, but no in-page card may become invisible/unsettable in popup.
const ytkitSource = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
const runtimeArrayKeys = [...new Set(
    [...ytkitSource.matchAll(/_arrayKey:'([^']+)'/g)].map((match) => match[1])
)];
for (const key of runtimeArrayKeys) {
    const entry = SETTINGS_SCHEMA.find((candidate) => candidate.key === key);
    if (!entry) {
        issues.push(`in-page _arrayKey "${key}" has no schema entry`);
    } else if (!Array.isArray(entry.knownValues)) {
        issues.push(`in-page _arrayKey "${key}" has no schema knownValues vocabulary`);
    }
}
for (const entry of SETTINGS_SCHEMA.filter((candidate) => Array.isArray(candidate.knownValues))) {
    const marker = `_arrayKey:'${entry.key}'`;
    const markerAt = ytkitSource.indexOf(marker);
    if (markerAt === -1) {
        issues.push(`knownValues entry "${entry.key}" has no in-page _arrayKey sub-toggle model`);
        continue;
    }
    const spreadAt = ytkitSource.lastIndexOf('...([', markerAt);
    const mapAt = spreadAt === -1 ? -1 : ytkitSource.indexOf('].map(', spreadAt);
    if (spreadAt === -1 || mapAt === -1 || mapAt > markerAt) {
        issues.push(`could not parse in-page token vocabulary for "${entry.key}"`);
        continue;
    }
    let rows;
    try {
        // Node-only validation of a repo-owned literal; shipped code never
        // evaluates strings. The literal contains only [value,name,desc] rows.
        rows = Function('"use strict"; return (' + ytkitSource.slice(spreadAt + 4, mapAt + 1) + ');')();
    } catch (error) {
        issues.push(`could not evaluate in-page token vocabulary for "${entry.key}": ${error.message}`);
        continue;
    }
    const known = new Set(entry.knownValues);
    const missing = rows.map((row) => row?.[0]).filter((token) => typeof token === 'string' && !known.has(token));
    if (missing.length) {
        issues.push(`knownValues for "${entry.key}" omit in-page token(s): ${missing.join(', ')}`);
    }
}

// ── 9. Shipped identity still resolves ──────────────────────────────────
//
// scripts/shipped-identity-baseline.json records every setting key and feature
// ID that has appeared in a tagged release. Anything in it that is no longer
// in the schema (or in the live feature-ID set) must resolve through the alias
// table or be named in RETIRED_SHIPPED_IDS. Without this, a rename ships as a
// silent reset of that setting for every existing user.
const IDENTITY_BASELINE_PATH = path.join(__dirname, 'shipped-identity-baseline.json');
if (!fs.existsSync(IDENTITY_BASELINE_PATH)) {
    issues.push('scripts/shipped-identity-baseline.json is missing; run node scripts/generate-shipped-identity-baseline.js');
} else if (!Array.isArray(RETIRED_SHIPPED_IDS) || !SETTING_ALIASES || typeof resolveSettingKey !== 'function') {
    issues.push('settings-schema.js must export SETTING_ALIASES, RETIRED_SHIPPED_IDS, and resolveSettingKey');
} else {
    const identityBaseline = JSON.parse(fs.readFileSync(IDENTITY_BASELINE_PATH, 'utf8'));
    const retiredSet = new Set(RETIRED_SHIPPED_IDS);
    const aliasTargets = Object.values(SETTING_ALIASES);
    for (const [from, to] of Object.entries(SETTING_ALIASES)) {
        if (!schemaSet.has(to)) {
            issues.push(`alias "${from}" points at "${to}", which is not a current schema key`);
        }
        if (retiredSet.has(from)) {
            issues.push(`"${from}" is both aliased and retired; it can only be one`);
        }
    }
    if (new Set(aliasTargets).size !== aliasTargets.length) {
        issues.push('two aliases resolve to the same current key; the later stored value would be ambiguous');
    }
    for (const key of identityBaseline.settingKeys || []) {
        if (schemaSet.has(key)) continue;
        if (schemaSet.has(resolveSettingKey(key))) continue;
        if (retiredSet.has(key)) continue;
        issues.push(`setting key "${key}" shipped in a release but is now in neither the schema, the alias table, nor RETIRED_SHIPPED_IDS`);
    }
    // Feature IDs are declared in the monolith and in the peeled feature
    // modules, the same two places project-facts.js counts them from.
    const featureIdSources = [path.join(REPO_ROOT, 'extension', 'ytkit.js')];
    const featureDir = path.join(REPO_ROOT, 'extension', 'features');
    for (const entry of fs.readdirSync(featureDir, { withFileTypes: true })) {
        if (entry.isDirectory()) featureIdSources.push(path.join(featureDir, entry.name, 'index.js'));
    }
    const liveFeatureIds = new Set();
    for (const file of featureIdSources) {
        if (!fs.existsSync(file)) continue;
        const source = fs.readFileSync(file, 'utf8');
        const pattern = /^\s+id:\s*'([a-zA-Z][a-zA-Z0-9]*)'/gm;
        let match;
        while ((match = pattern.exec(source)) !== null) liveFeatureIds.add(match[1]);
    }
    for (const id of identityBaseline.featureIds || []) {
        if (liveFeatureIds.has(id)) continue;
        if (liveFeatureIds.has(resolveSettingKey(id))) continue;
        if (schemaSet.has(id) || schemaSet.has(resolveSettingKey(id))) continue;
        if (retiredSet.has(id)) continue;
        issues.push(`feature ID "${id}" shipped in a release but is now in neither the runtime, the alias table, nor RETIRED_SHIPPED_IDS`);
    }
    // A retirement that names a key still in the schema is stale bookkeeping,
    // and it would make the gate blind to that key being renamed later.
    for (const id of RETIRED_SHIPPED_IDS) {
        if (schemaSet.has(id) || liveFeatureIds.has(id)) {
            issues.push(`"${id}" is listed as retired but is still live; remove it from RETIRED_SHIPPED_IDS`);
        }
    }
}

// Final verdict
if (issues.length === 0) {
    ok(`OK — ${SETTINGS_SCHEMA.length} schema entries match default-settings.json byte-for-byte`);
    ok(`Categories represented: ${CATEGORIES.length}, Risks: ${RISKS.length}, Profiles: ${PROFILES.length}`);
    ok(`Shipped identity resolves: ${Object.keys(SETTING_ALIASES).length} alias(es), ${RETIRED_SHIPPED_IDS.length} retired`);
    process.exit(0);
}

console.error('[check-settings] FAIL — ' + issues.length + ' issue(s):');
for (const i of issues) console.error('  - ' + i);
process.exit(1);
