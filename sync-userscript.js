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
const USERSCRIPT_CORE_SOURCE = path.join(REPO_ROOT, 'YTKit-core.user.js');
const GREASY_FORK_CORE_URL = process.env.ASTRA_GREASY_FORK_CORE_URL
    || 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit-core.user.js';
const CORE_BEGIN_MARKER = '// ── BEGIN v5.0.0 bundled core modules ──';
const CORE_END_MARKER = '// ── END v5.0.0 bundled core modules ──';
const EXTERNAL_BUNDLE_BEGIN_RE = /^[ \t]*\/\/ ── BEGIN v5\.0\.0 bundled core modules ──\r?\n[\s\S]*?^[ \t]*\/\/ ── END v5\.0\.0 bundled core modules ──/m;

// v4.20.0: keep the v5.0.0 core modules in the userscript distribution so the
// userscript path reaches feature parity with the MV3 extension. Each listed
// module is an IIFE that attaches to globalThis.YTKitCore or
// globalThis.YTKitFeatures — safe to concatenate in this order. The main
// artifact carries an ordered dependency manifest; executable bodies are
// generated into YTKit-core.user.js, a separate Greasy Fork library record.
// If a manifest feature cannot ship in the userscript, classify the feature ID
// in scripts/check-userscript-drift.js instead of leaving silent parity drift.
const V5_BUNDLE_MODULES = [
    'extension/core/styles.js',
    'extension/core/trusted-html.js',
    'extension/core/settings-visual-system.js',
    'extension/core/settings-schema.js',
    'extension/core/injection-guard.js',
    'extension/core/feature-lifecycle.js',
    'extension/core/policy-profile.js',
    'extension/core/settings-controller.js',
    // Bundled so the monolith settingsManager can run imports through the same
    // snapshot/rollback/undo transaction the extension uses, instead of
    // carrying a second implementation. Pure JS, no chrome.* and no DOM.
    // NOTE: no apostrophes in comments inside this array — check-userscript-drift.js
    // scans it with a bare quote regex and one stray quote truncates the list.
    'extension/core/settings-import-transaction.js',
    // Bundled so the userscript filters an authenticated cookie handoff
    // through the SAME reviewed contract the extension uses (four yt-dlp
    // auth cookie names, domain/path/Secure/size validation) instead of
    // posting the whole YouTube jar. Pure JS, no chrome.* and no DOM.
    'extension/core/cookie-handoff.js',
    'extension/core/transcript-service.js',
    'extension/core/transcript-index.js',
    'extension/core/ai-summary-artifacts.js',
    'extension/core/credential-vault.js',
    'extension/core/local-ai.js',
    'extension/core/userscript-ai-summary.js',
    'extension/core/external-api-health.js',
    'extension/core/selector-health.js',
    'extension/core/feature-health.js',
    'extension/core/hide-attribution.js',
    'extension/core/heatmap.js',
    'extension/core/youtube-thumbnails.js',
    'extension/core/feature-schedule.js',
    'extension/core/feed-prefilter.js',
    'extension/core/companion-ports.js',
    'extension/core/data-flow.js',
    'extension/core/toast.js',
    'extension/core/toast-dom.js',
    'extension/core/navigation.js',
    'extension/core/player.js',
    'extension/core/resource-unlock.js',
    'extension/core/text-metrics.js',
    'extension/core/date-time.js',
    'extension/core/runtime-flags.js',
    'extension/core/capability-probe.js',
    'extension/features/subtitles/index.js',
    'extension/features/video-filters/index.js',
    'extension/features/blue-light-filter/index.js',
    'extension/features/theme-css/index.js',
    'extension/features/wave-8-css/index.js',
    'extension/features/home-subs-css/index.js',
    'extension/features/chat-style-comments/index.js',
    'extension/features/sticky-video/index.js',
    'extension/features/sticky-chat/index.js',
    'extension/features/video-hider/index.js',
    'extension/features/video-notes/index.js',
    'extension/features/subscription-groups/index.js',
    'extension/features/digital-wellbeing/index.js',
    'extension/features/settings-panel/index.js',
    'extension/features/player-dock/index.js',
    'extension/features/youtube-music-compat/index.js',
    'extension/features/return-dislike/index.js',
    'extension/features/sponsorblock/index.js',
    'extension/features/dearrow/index.js',
    'extension/core/lifecycle-route-bridge.js'
];

const BUNDLE_BEGIN_RE = /^[ \t]*\/\/ ── BEGIN v5\.0\.0 bundled core modules ──\r?\n[\s\S]*?^[ \t]*\/\/ ── END v5\.0\.0 bundled core modules ──/m;

function bundledModuleHeader(rel) {
    return '    // ── bundled module: ' + rel + ' ──';
}

function coreModuleHeader(rel) {
    return '// ── bundled module: ' + rel + ' ──';
}

function buildExternalBundleRegion() {
    const parts = [
        '    ' + CORE_BEGIN_MARKER,
        '    // The v5.0.0 modules are delivered by the configured @require dependency.',
        '    // This manifest keeps the dependency order visible in the main artifact;',
        '    // the generated YTKit-core.user.js contains the executable module bodies.',
        ''
    ];
    for (const rel of V5_BUNDLE_MODULES) parts.push(bundledModuleHeader(rel));
    parts.push('', '    ' + CORE_END_MARKER);
    return parts.join('\n');
}

// Build the bundled-module region exactly as the userscript must contain it.
// check-userscript-drift.js recomputes this and compares it against the
// shipped bundle, so this function is the single source of truth for the
// transform. A fingerprint-substring check cannot see a stale module body —
// v4.51.2's settings-schema shipped stale through three releases that way.
function buildBundleRegion(repoRoot = REPO_ROOT) {
    // Keep the historical function name as the main-artifact contract. The
    // executable bodies now live in the separately published library below;
    // the main file retains an ordered manifest so stale dependency changes
    // remain visible without paying for a second copy of the code.
    void repoRoot;
    return buildExternalBundleRegion();
}

function buildCoreLibrarySource(repoRoot = REPO_ROOT, version = null) {
    const extensionText = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const versionMatch = extensionText.match(/const YTKIT_VERSION = '([^']+)'/);
    if (!versionMatch && !version) {
        throw new Error('Could not find YTKIT_VERSION while building the userscript core library');
    }
    const targetVersion = version || versionMatch[1];
    const parts = [
        '// ==UserScript==',
        '// @name         Astra Deck YTKit Core Library',
        '// @namespace    https://github.com/SysAdminDoc/Astra-Deck',
        `// @version      ${targetVersion}`,
        '// @description  Shared Astra Deck userscript runtime dependency; loaded by YTKit.user.js',
        '// @author       Matthew Parker',
        '// @homepageURL  https://github.com/SysAdminDoc/Astra-Deck',
        '// @supportURL    https://github.com/SysAdminDoc/Astra-Deck/issues',
        '// @license      MIT',
        '// @grant         none',
        '// @run-at        document-start',
        '// ==/UserScript==',
        '',
        CORE_BEGIN_MARKER,
        '// Auto-generated by sync-userscript.js — do NOT hand-edit. To refresh, run:',
        '//     node sync-userscript.js',
        '//',
        '// Every module body below is copied byte-for-byte from its extension source.',
        ''
    ];
    for (const rel of V5_BUNDLE_MODULES) {
        const full = path.join(repoRoot, rel);
        if (!fs.existsSync(full)) {
            const error = new Error('Module not found: ' + rel);
            error.modulePath = rel;
            throw error;
        }
        const moduleBody = fs.readFileSync(full, 'utf8').replace(/\s+$/, '');
        // A module containing either bundle marker would truncate the region
        // the next sync run's regex matches, silently corrupting the
        // userscript. Refuse to bundle rather than write a poisoned bundle.
        if (/── (?:BEGIN|END) v5\.0\.0 bundled core modules ──/.test(moduleBody)) {
            const error = new Error('Refusing to bundle ' + rel + ': module source contains a v5.0.0 bundle marker, which would corrupt the next sync run.');
            error.modulePath = rel;
            throw error;
        }
        parts.push(coreModuleHeader(rel));
        parts.push(moduleBody);
        parts.push('');
    }
    parts.push(CORE_END_MARKER, '');
    return parts.join('\n');
}

function upsertMetadataLine(headerText, key, value) {
    const line = `// @${key}      ${value}`;
    const re = new RegExp(`^// @${key}\\s+.*$`, 'm');
    if (re.test(headerText)) return headerText.replace(re, line);
    return headerText.replace(/^\/\/ ==\/UserScript==$/m, `${line}\n// ==/UserScript==`);
}

function main() {
    const extensionText = fs.readFileSync(EXTENSION_SOURCE, 'utf8');
    const versionMatch = extensionText.match(/const YTKIT_VERSION = '([^']+)'/);
    if (!versionMatch) {
        console.error('Could not find YTKIT_VERSION in extension/ytkit.js');
        process.exit(1);
    }

    const targetVersion = versionMatch[1];
    let userscriptText = fs.readFileSync(USERSCRIPT_SOURCE, 'utf8');
    const before = userscriptText;

    const headerEnd = userscriptText.indexOf('// ==/UserScript==');
    if (headerEnd === -1) {
        console.error('Could not find userscript metadata header terminator');
        process.exit(1);
    }
    const headerCloseEnd = headerEnd + '// ==/UserScript=='.length;
    let headerText = userscriptText.slice(0, headerCloseEnd);
    const bodyText = userscriptText.slice(headerCloseEnd);
    headerText = headerText.replace(/^(\/\/ @name\s+)YTKit v[\d.]+/m,
        (_match, prefix) => `${prefix}YTKit v${targetVersion}`);
    headerText = headerText.replace(/^(\/\/ @version\s+)[\d.]+/m,
        (_match, prefix) => `${prefix}${targetVersion}`);
    headerText = headerText.replace(/^(\/\/ @updateURL\s+).+$/m,
        (_match, prefix) => `${prefix}${USERSCRIPT_RAW_URL}`);
    headerText = headerText.replace(/^(\/\/ @downloadURL\s+).+$/m,
        (_match, prefix) => `${prefix}${USERSCRIPT_RAW_URL}`);
    headerText = upsertMetadataLine(headerText, 'require', GREASY_FORK_CORE_URL);
    for (const [key, value] of [
        ['homepageURL', 'https://github.com/SysAdminDoc/Astra-Deck'],
        ['supportURL', 'https://github.com/SysAdminDoc/Astra-Deck/issues'],
        ['license', 'MIT'],
        ['icon', 'https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/extension/icons/128.png'],
    ]) {
        headerText = upsertMetadataLine(headerText, key, value);
    }
    headerText = headerText.replace(/^(\/\/ @description\s+).*$/m,
        '$1YouTube customization with filtering, playback, accessibility, and research tools; requires the Astra Deck YTKit Core Library and optionally uses the Astra Downloader companion');
    userscriptText = headerText + bodyText;
    userscriptText = userscriptText.replace(/const YTKIT_VERSION = '[^']+';/,
        () => `const YTKIT_VERSION = '${targetVersion}';`);


    if (BUNDLE_BEGIN_RE.test(userscriptText)) {
        let bundleRegion;
        try {
            bundleRegion = buildBundleRegion(REPO_ROOT);
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
        userscriptText = userscriptText.replace(BUNDLE_BEGIN_RE, () => bundleRegion);
    } else if (!EXTERNAL_BUNDLE_BEGIN_RE.test(userscriptText)) {
        // Fail loudly: this tool's whole job is refreshing the bundle region, so
        // silently rewriting only the header and reporting success let a stale
        // bundle reach packaging with a green run.
        console.error('Userscript bundle markers not found — cannot refresh the bundle region.');
        process.exit(1);
    }

    let coreLibraryText;
    try {
        coreLibraryText = buildCoreLibrarySource(REPO_ROOT, targetVersion);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    const previousCore = fs.existsSync(USERSCRIPT_CORE_SOURCE)
        ? fs.readFileSync(USERSCRIPT_CORE_SOURCE, 'utf8')
        : null;
    if (previousCore !== coreLibraryText) {
        fs.writeFileSync(USERSCRIPT_CORE_SOURCE, coreLibraryText, 'utf8');
        console.log(`Userscript core library synced to v${targetVersion} (${path.basename(USERSCRIPT_CORE_SOURCE)})`);
    }

    if (userscriptText === before) {
        console.log(`Userscript already aligned to v${targetVersion}`);
        process.exit(0);
    }

    fs.writeFileSync(USERSCRIPT_SOURCE, userscriptText, 'utf8');
    console.log(`Userscript metadata synced to v${targetVersion} (${path.basename(USERSCRIPT_SOURCE)})`);
}

if (require.main === module) {
    main();
}

module.exports = {
    V5_BUNDLE_MODULES,
    buildBundleRegion,
    buildCoreLibrarySource,
    bundledModuleHeader,
    coreModuleHeader,
    BUNDLE_BEGIN_RE,
    EXTERNAL_BUNDLE_BEGIN_RE,
    USERSCRIPT_CORE_SOURCE,
    GREASY_FORK_CORE_URL,
};
