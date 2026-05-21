#!/usr/bin/env node
'use strict';
// One-shot generator that builds extension/core/settings-schema.js from the
// per-category schema embedded in ROADMAP.md and the live default values in
// extension/default-settings.json. Run once during v5.0.0 bootstrap; the
// generated file becomes the canonical source. After bootstrap this script
// is intentionally retained so the build can be re-validated against the
// ROADMAP narrative on demand.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const ROADMAP = fs.readFileSync(path.join(REPO_ROOT, 'ROADMAP.md'), 'utf8');
const DEFAULTS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'default-settings.json'), 'utf8'));

const START = '### Full Per-Toggle Settings Schema (354 keys)';
const END = 'Schema verification gates';
const slice = ROADMAP.slice(ROADMAP.indexOf(START), ROADMAP.indexOf(END));

const CATEGORY_ORDER = [
    'shell', 'nav', 'shorts', 'feed', 'watch-player', 'playback-audio',
    'quality-codec', 'content-filter', 'comments', 'live-chat',
    'subscriptions', 'enrichment', 'downloads', 'subtitles',
    'research-ai', 'privacy-profiles', 'a11y-perf', 'dev-diagnostics'
];

const CATEGORY_SCOPE = {
    shell: 'global', nav: 'global', shorts: 'feed', feed: 'feed',
    'watch-player': 'watch', 'playback-audio': 'player',
    'quality-codec': 'player', 'content-filter': 'feed',
    comments: 'comments', 'live-chat': 'live-chat',
    subscriptions: 'subscriptions', enrichment: 'player',
    downloads: 'downloads', subtitles: 'player',
    'research-ai': 'watch', 'privacy-profiles': 'global',
    'a11y-perf': 'global', 'dev-diagnostics': 'global'
};

function parseRiskNote(note) {
    const lower = note.toLowerCase();
    let risk = 'safe';
    let profile = 'both';
    if (/^api(\b|\/)/.test(lower)) risk = 'api';
    else if (/^safe(\b|\/)/.test(lower)) risk = 'safe';
    else if (/^store-risk(\b|\/)/.test(lower)) risk = 'store-risk';
    else if (/^local-companion(\b|\/)/.test(lower)) risk = 'local-companion';
    else if (/^experimental(\b|\/)/.test(lower)) risk = 'experimental';
    else if (lower.startsWith('internal')) risk = 'safe';
    if (lower.includes('/github-full')) profile = 'github-full';
    else if (lower.includes('/store-safe')) profile = 'store-safe';
    return { risk, profile };
}

// Parse per-key category + risk from the ROADMAP narrative.
const assignments = {};
let currentCat = null;
const KEY_LINE = /^- `([A-Za-z_][A-Za-z0-9_]*)` \(([^,]+), ([^)]+)\) — (.+)$/;
for (const line of slice.split('\n')) {
    const catM = line.match(/^#### Category `([a-z0-9-]+)`/);
    if (catM) { currentCat = catM[1]; continue; }
    if (!currentCat) continue;
    const m = line.match(KEY_LINE);
    if (!m) continue;
    const [, key, type, , riskNote] = m;
    if (assignments[key]) throw new Error('Duplicate key in ROADMAP schema: ' + key);
    assignments[key] = { category: currentCat, type: type.trim(), riskNote: riskNote.trim() };
}

const orderedKeys = Object.keys(DEFAULTS);
for (const key of orderedKeys) {
    if (!assignments[key]) throw new Error('Uncategorized in ROADMAP: ' + key);
}

const entries = orderedKeys.map((key) => {
    const a = assignments[key];
    const { risk, profile } = parseRiskNote(a.riskNote);
    const isInternal = key.startsWith('_');
    return {
        key,
        category: a.category,
        type: a.type,
        defaultValue: DEFAULTS[key],
        risk,
        profile,
        scope: CATEGORY_SCOPE[a.category] || 'global',
        immediateApply: !isInternal,
        destroyRequired: a.type === 'boolean' && !isInternal,
        internal: isInternal,
        since: '0.1.0'
    };
});

// Emit entries in default-settings.json insertion order so a regenerated
// default-settings.json is a byte-for-byte match. Category headers in the
// source comments still help readability.
const lastSeenCategory = { value: null };
function categoryHeaderFor(e) {
    if (e.category === lastSeenCategory.value) return null;
    lastSeenCategory.value = e.category;
    return e.category;
}

const out = [];
out.push("'use strict';");
out.push('');
out.push('// extension/core/settings-schema.js');
out.push('//');
out.push('// v5.0.0 single source of truth for all Astra Deck settings.');
out.push('// Generated from ROADMAP.md "Full Per-Toggle Settings Schema (354 keys)"');
out.push('// and extension/default-settings.json. scripts/check-settings.js enforces');
out.push('// schema <-> default-settings parity on every `npm run check`; build emit');
out.push('// (extension/default-settings.json) is downstream of this module.');
out.push('//');
out.push('// Safe to load as a Node CommonJS module (build + tests) and as an');
out.push('// ISOLATED-world classic content-script (ytkit.js consumer).');
out.push('');
out.push('const CATEGORIES = Object.freeze([');
for (const c of CATEGORY_ORDER) out.push(`    '${c}',`);
out.push(']);');
out.push('');
out.push("const RISKS = Object.freeze(['safe', 'api', 'local-companion', 'experimental', 'store-risk']);");
out.push("const PROFILES = Object.freeze(['store-safe', 'github-full', 'both']);");
out.push("const SCOPES = Object.freeze(['global', 'feed', 'watch', 'player', 'comments', 'live-chat', 'subscriptions', 'downloads', 'popup']);");
out.push("const VEHICLES = Object.freeze(['extension', 'userscript', 'both']);");
out.push("const TYPES = Object.freeze(['boolean', 'string', 'number', 'array', 'object', 'null']);");
out.push('');
out.push('const SETTINGS_SCHEMA = Object.freeze([');

function emitEntry(e) {
    const parts = [
        'key: ' + JSON.stringify(e.key),
        'category: ' + JSON.stringify(e.category),
        'type: ' + JSON.stringify(e.type),
        'defaultValue: ' + JSON.stringify(e.defaultValue),
        'risk: ' + JSON.stringify(e.risk),
        'profile: ' + JSON.stringify(e.profile),
        'scope: ' + JSON.stringify(e.scope),
        "vehicle: 'both'",
        'immediateApply: ' + e.immediateApply,
        'destroyRequired: ' + e.destroyRequired,
        'internal: ' + e.internal,
        'since: ' + JSON.stringify(e.since)
    ];
    out.push('    Object.freeze({ ' + parts.join(', ') + ' }),');
}

// Per-category running tallies (for inline section headers as the order
// streams through default-settings insertion order — keys may revisit a
// category multiple times, which is fine; the header annotates the FIRST
// run in each contiguous block).
for (const e of entries) {
    const newHeader = categoryHeaderFor(e);
    if (newHeader) {
        out.push('');
        out.push(`    // ─── ${newHeader} ───`);
    }
    emitEntry(e);
}
out.push(']);');
out.push('');
out.push('// Build a {key: defaultValue} map for chrome.storage.local seeding +');
out.push('// for the build-time emit of extension/default-settings.json.');
out.push('function buildDefaultsFromSchema(schema) {');
out.push('    const src = schema || SETTINGS_SCHEMA;');
out.push('    const out = {};');
out.push('    for (const entry of src) out[entry.key] = entry.defaultValue;');
out.push('    return out;');
out.push('}');
out.push('');
out.push('// Group keys by category in declared order. The popup renders');
out.push('// category sections from this map.');
out.push('function getKeysByCategory(schema) {');
out.push('    const src = schema || SETTINGS_SCHEMA;');
out.push('    const out = {};');
out.push('    for (const c of CATEGORIES) out[c] = [];');
out.push('    for (const entry of src) {');
out.push('        if (!out[entry.category]) out[entry.category] = [];');
out.push('        out[entry.category].push(entry.key);');
out.push('    }');
out.push('    return out;');
out.push('}');
out.push('');
out.push('// O(n) lookup. Cache the result if used on a hot path.');
out.push('function findSettingEntry(key, schema) {');
out.push('    const src = schema || SETTINGS_SCHEMA;');
out.push('    for (const entry of src) if (entry.key === key) return entry;');
out.push('    return null;');
out.push('}');
out.push('');
out.push('// Internal storage-only keys (prefix `_`). Excluded from the popup');
out.push('// toggle surface and from data-flow advertising; still imported/exported.');
out.push('function isInternalSettingKey(key) {');
out.push('    return typeof key === "string" && key.startsWith("_");');
out.push('}');
out.push('');
out.push('// Store-safe vs github-full filters drive the dual-profile build.');
out.push('function getStoreSafeKeys(schema) {');
out.push('    const src = schema || SETTINGS_SCHEMA;');
out.push('    return src.filter((e) => e.profile !== "github-full").map((e) => e.key);');
out.push('}');
out.push('function getGithubFullKeys(schema) {');
out.push('    const src = schema || SETTINGS_SCHEMA;');
out.push('    return src.filter((e) => e.profile === "github-full").map((e) => e.key);');
out.push('}');
out.push('');
out.push('if (typeof module !== "undefined" && module.exports) {');
out.push('    module.exports = {');
out.push('        SETTINGS_SCHEMA, CATEGORIES, RISKS, PROFILES, SCOPES, VEHICLES, TYPES,');
out.push('        buildDefaultsFromSchema, getKeysByCategory, findSettingEntry,');
out.push('        isInternalSettingKey, getStoreSafeKeys, getGithubFullKeys');
out.push('    };');
out.push('}');
out.push('if (typeof window !== "undefined") {');
out.push('    window.__YTKIT_SETTINGS_SCHEMA__ = {');
out.push('        SETTINGS_SCHEMA, CATEGORIES, RISKS, PROFILES, SCOPES, VEHICLES, TYPES,');
out.push('        buildDefaultsFromSchema, getKeysByCategory, findSettingEntry,');
out.push('        isInternalSettingKey, getStoreSafeKeys, getGithubFullKeys');
out.push('    };');
out.push('}');
out.push('');

const dest = path.join(REPO_ROOT, 'extension', 'core', 'settings-schema.js');
fs.writeFileSync(dest, out.join('\n'));
console.log('Wrote', dest, '—', out.length, 'lines,', entries.length, 'entries');
