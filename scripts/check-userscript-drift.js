#!/usr/bin/env node
'use strict';

// scripts/check-userscript-drift.js — CI guard for userscript/extension module parity.
//
// Validates the contract between the extension's manifest content_scripts and
// the userscript's V5_BUNDLE_MODULES list in sync-userscript.js:
//
//   1. Every V5_BUNDLE_MODULES entry exists on disk.
//   2. Every extension/features/*/index.js in the manifest is covered by
//      V5_BUNDLE_MODULES (new peeled features must be added to the bundle).
//   3. The userscript file contains the BEGIN/END bundle markers.
//
// Core infrastructure modules (env.js, storage.js, selectors.js, etc.) are
// NOT required in V5_BUNDLE_MODULES — the userscript provides its own
// equivalents via GM_* APIs or inline stubs. Only feature modules and the
// shared-surface core modules (settings-schema, policy-profile, etc.) that
// both builds consume must stay in sync.
//
// Exit 0: parity holds. Exit 1: drift detected.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SYNC_SCRIPT = path.join(REPO_ROOT, 'sync-userscript.js');
const MANIFEST_PATH = path.join(REPO_ROOT, 'extension', 'manifest.json');

const errors = [];

// ── 1. Extract V5_BUNDLE_MODULES from sync-userscript.js ──

const syncSource = fs.readFileSync(SYNC_SCRIPT, 'utf8');
const bundleMatch = syncSource.match(/const V5_BUNDLE_MODULES\s*=\s*\[([\s\S]*?)\];/);
if (!bundleMatch) {
    console.error('[check-userscript-drift] Cannot parse V5_BUNDLE_MODULES from sync-userscript.js');
    process.exit(2);
}
const bundleModules = [];
const lineRe = /['"]([^'"]+)['"]/g;
let m;
while ((m = lineRe.exec(bundleMatch[1])) !== null) {
    bundleModules.push(m[1]);
}
const bundleSet = new Set(bundleModules);

// ── 2. Verify every bundled module exists on disk ──

for (const mod of bundleModules) {
    const full = path.join(REPO_ROOT, mod);
    if (!fs.existsSync(full)) {
        errors.push(`V5_BUNDLE_MODULES lists "${mod}" but it does not exist on disk`);
    }
}

// ── 3. Parse manifest content_scripts JS lists ──

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const manifestJsFiles = new Set();
for (const entry of (manifest.content_scripts || [])) {
    if (entry.world === 'MAIN') continue;
    for (const js of (entry.js || [])) {
        manifestJsFiles.add(js);
    }
}

// ── 4. Flag feature modules in manifest not covered by V5_BUNDLE_MODULES ──
// Feature modules follow the pattern features/*/index.js and must be bundled.

for (const js of manifestJsFiles) {
    if (!js.startsWith('features/')) continue;
    const relative = 'extension/' + js;
    if (!bundleSet.has(relative)) {
        errors.push(`Manifest content_scripts includes "${js}" but V5_BUNDLE_MODULES does not — add it to sync-userscript.js or document the exclusion`);
    }
}

// ── 5. Verify userscript has bundle markers ──

try {
    const { resolveUserscriptPath } = require(path.join(REPO_ROOT, 'scripts', 'repo-paths'));
    const usPath = resolveUserscriptPath(REPO_ROOT);
    const usText = fs.readFileSync(usPath, 'utf8');
    if (!usText.includes('// ── BEGIN v5.0.0 bundled core modules ──')) {
        errors.push('Userscript is missing the BEGIN v5.0.0 bundled core modules marker');
    }
    if (!usText.includes('// ── END v5.0.0 bundled core modules ──')) {
        errors.push('Userscript is missing the END v5.0.0 bundled core modules marker');
    }
} catch (e) {
    errors.push(`Could not read userscript: ${e.message}`);
}

// ── Report ──

if (errors.length === 0) {
    console.log(`[check-userscript-drift] OK — ${bundleModules.length} bundled module(s), all on disk`);
    const manifestFeatures = [...manifestJsFiles].filter(f => f.startsWith('features/'));
    console.log(`[check-userscript-drift] ${manifestFeatures.length} manifest feature module(s) covered by V5_BUNDLE_MODULES`);
    console.log(`[check-userscript-drift] Userscript bundle markers present`);
    process.exit(0);
}

console.error(`[check-userscript-drift] ${errors.length} drift issue(s):`);
for (const err of errors) console.error(`  ✗ ${err}`);
process.exit(1);
