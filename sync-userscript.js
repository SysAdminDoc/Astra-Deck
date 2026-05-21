#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { getUserscriptBasename, resolveUserscriptPath } = require('./scripts/repo-paths');

const REPO_ROOT = __dirname;
const EXTENSION_SOURCE = path.join(REPO_ROOT, 'extension', 'ytkit.js');
const USERSCRIPT_SOURCE = resolveUserscriptPath(REPO_ROOT);
const USERSCRIPT_BASENAME = getUserscriptBasename(REPO_ROOT);
const USERSCRIPT_RAW_URL = `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/${USERSCRIPT_BASENAME}`;

const extensionText = fs.readFileSync(EXTENSION_SOURCE, 'utf8');
const versionMatch = extensionText.match(/const YTKIT_VERSION = '([^']+)'/);
if (!versionMatch) {
    console.error('Could not find YTKIT_VERSION in extension/ytkit.js');
    process.exit(1);
}

const targetVersion = versionMatch[1];
let userscriptText = fs.readFileSync(USERSCRIPT_SOURCE, 'utf8');
const before = userscriptText;

userscriptText = userscriptText.replace(/^(\/\/ @name\s+)YTKit v[\d.]+/m, `$1YTKit v${targetVersion}`);
userscriptText = userscriptText.replace(/^(\/\/ @version\s+)[\d.]+/m, `$1${targetVersion}`);
userscriptText = userscriptText.replace(/^(\/\/ @updateURL\s+).+$/m, `$1${USERSCRIPT_RAW_URL}`);
userscriptText = userscriptText.replace(/^(\/\/ @downloadURL\s+).+$/m, `$1${USERSCRIPT_RAW_URL}`);
userscriptText = userscriptText.replace(/const YTKIT_VERSION = '[^']+';/, `const YTKIT_VERSION = '${targetVersion}';`);

// v4.20.0: bundle the v5.0.0 core modules into the userscript so the
// userscript path reaches feature parity with the MV3 extension. Each
// listed module is an IIFE that attaches to globalThis.YTKitCore or
// globalThis.YTKitFeatures — safe to concatenate in this order. The
// region between the BEGIN/END markers is replaced wholesale on every
// sync; do NOT hand-edit content between the markers in YTKit.user.js.
const V5_BUNDLE_MODULES = [
    'extension/core/settings-schema.js',
    'extension/core/feature-lifecycle.js',
    'extension/core/policy-profile.js',
    'extension/core/selector-health.js',
    'extension/core/data-flow.js',
    'extension/core/toast.js',
    'extension/features/subtitles/index.js',
    'extension/features/video-filters/index.js',
    'extension/features/blue-light-filter/index.js',
    'extension/features/theme-css/index.js',
    'extension/features/wave-8-css/index.js',
    'extension/core/lifecycle-route-bridge.js'
];

const BUNDLE_BEGIN_RE = /\/\/ ── BEGIN v5\.0\.0 bundled core modules ──[\s\S]*?\/\/ ── END v5\.0\.0 bundled core modules ──/;

if (BUNDLE_BEGIN_RE.test(userscriptText)) {
    const parts = ['    // ── BEGIN v5.0.0 bundled core modules ──'];
    parts.push('    // Auto-bundled by sync-userscript.js — do NOT hand-edit. To refresh, run:');
    parts.push('    //     node sync-userscript.js');
    parts.push('    //');
    parts.push('    // The hardening test `v4.20.0 userscript bundles every v5.0.0 core module');
    parts.push('    // verbatim` pins the parity contract.');
    parts.push('');
    for (const rel of V5_BUNDLE_MODULES) {
        const full = path.join(REPO_ROOT, rel);
        if (!fs.existsSync(full)) {
            console.error('Module not found:', rel);
            process.exit(1);
        }
        const body = fs.readFileSync(full, 'utf8').replace(/\s+$/, '');
        parts.push('    // ── bundled module: ' + rel + ' ──');
        // Indent each line by 4 spaces so the bundled module sits cleanly
        // inside the userscript's outer IIFE (cosmetic — JS doesn't care).
        parts.push(body.split('\n').map((line) => line.length ? '    ' + line : line).join('\n'));
        parts.push('');
    }
    parts.push('    // ── END v5.0.0 bundled core modules ──');
    userscriptText = userscriptText.replace(BUNDLE_BEGIN_RE, parts.join('\n'));
} else {
    console.warn('Userscript bundle markers not found — skipping bundle refresh.');
}

if (userscriptText === before) {
    console.log(`Userscript already aligned to v${targetVersion}`);
    process.exit(0);
}

fs.writeFileSync(USERSCRIPT_SOURCE, userscriptText, 'utf8');
console.log(`Userscript metadata synced to v${targetVersion} (${path.basename(USERSCRIPT_SOURCE)})`);
