#!/usr/bin/env node
'use strict';

// Cross-validate the canonical version strings before tag/push.
//
// Product builds are local-only. Running this in `npm run check` catches
// version drift before a local build, tag, or release upload.
//
// PRODUCT-VERSION sources of truth (must all match):
//   1. package.json                  → "version"
//   2. extension/manifest.json       → "version"
//   3. extension/ytkit.js            → const YTKIT_VERSION = '...'
//   4. YTKit.user.js                 → // @version
//   5. package-lock.json             → root + packages[""].version
//
// SETTINGS-VERSION sources of truth (v4.47.0 NF25 — must all match):
//   1. extension/ytkit.js            → SETTINGS_VERSION: N (in settingsManager)
//   2. extension/popup.js            → const SETTINGS_VERSION_FALLBACK = N
//   3. extension/settings-meta.json  → { "settingsVersion": N }
//
// Exit 0 only if BOTH product-version AND settings-version checks
// pass; exit 1 with a per-source breakdown otherwise.
//
// Optional: pass --tag <vX.Y.Z> to also validate against an external
// tag string (e.g. before `git tag` runs in a release recipe).

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const ACTIVE_DOC_TRUTH_FILES = Object.freeze([
    'README.md',
    path.join('docs', 'architecture.md'),
    path.join('docs', 'repo-settings.md'),
    path.join('docs', 'signing-keys.md'),
]);

function readPackageVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    return { source: 'package.json', value: String(pkg.version || '') };
}

function readPackageLockVersion() {
    const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8'));
    const rootVersion = String(lock.version || '');
    const packageVersion = String(lock.packages?.['']?.version || '');
    return {
        source: 'package-lock.json (root + packages[""])',
        value: rootVersion && rootVersion === packageVersion ? rootVersion : `${rootVersion || '<empty>'} / ${packageVersion || '<empty>'}`
    };
}

function readManifestVersion() {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'manifest.json'), 'utf8'));
    return { source: 'extension/manifest.json', value: String(manifest.version || '') };
}

function readYtkitVersion() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
    const m = src.match(/const YTKIT_VERSION = '([^']+)'/);
    return { source: 'extension/ytkit.js (YTKIT_VERSION)', value: m ? m[1] : '' };
}

function readUserscriptVersion() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'YTKit.user.js'), 'utf8');
    const m = src.match(/^\/\/ @version\s+(\S+)/m);
    return { source: 'YTKit.user.js (@version)', value: m ? m[1] : '' };
}

// v4.47.0 NF25 — SETTINGS_VERSION parity sources.
//
// The product version (above) bumps every release; SETTINGS_VERSION
// bumps only when the storage shape changes (currently 7 after v3.23
// reaction-spammer default-OFF migration). The popup keeps a fallback
// constant in case settings-meta.json fails to load; that fallback
// must match ytkit.js or a partial-storage user can silently
// downgrade their schema version on import.
function readYtkitSettingsVersion() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
    const m = src.match(/SETTINGS_VERSION:\s*(\d+)/);
    return { source: 'extension/ytkit.js (SETTINGS_VERSION)', value: m ? m[1] : '' };
}

function readPopupSettingsVersionFallback() {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'popup.js'), 'utf8');
    const m = src.match(/const\s+SETTINGS_VERSION_FALLBACK\s*=\s*(\d+)/);
    return { source: 'extension/popup.js (SETTINGS_VERSION_FALLBACK)', value: m ? m[1] : '' };
}

function readSettingsMetaVersion() {
    const meta = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', 'settings-meta.json'), 'utf8'));
    return { source: 'extension/settings-meta.json (settingsVersion)', value: String(meta.settingsVersion || '') };
}

function parseTagFlag(argv) {
    const idx = argv.indexOf('--tag');
    if (idx === -1) return null;
    // `--tag` with a missing/empty value must fail loudly. An empty string
    // here used to fall through the falsy `if (tagOverride)` gate and
    // silently skip tag validation — e.g. when a CI variable expands empty.
    const raw = argv[idx + 1];
    if (raw === undefined || raw.trim() === '' || raw.startsWith('--')) {
        throw new Error('--tag requires a non-empty value (e.g. --tag v4.46.2); refusing to silently skip tag validation');
    }
    return raw.startsWith('v') ? raw.slice(1) : raw;
}

function lineNumberForIndex(text, index) {
    return text.slice(0, index).split(/\r?\n/).length;
}

function checkActiveDocumentationTruth(productVersion) {
    const failures = [];
    const retiredRefs = [
        { re: /RESEARCH_REPORT\.md/g, label: 'retired RESEARCH_REPORT.md reference' },
        { re: /\.github\/workflows\/[A-Za-z0-9_.\/-]+/g, label: 'retired GitHub Actions workflow path' },
    ];
    const currentVersionClaims = [
        { re: /today,\s+at\s+v(\d+\.\d+\.\d+)\+?/gi, label: '"today" architecture version claim' },
        { re: /currently\s+agree\s+at\s+v(\d+\.\d+\.\d+)/gi, label: 'current product-version parity claim' },
    ];

    for (const relPath of ACTIVE_DOC_TRUTH_FILES) {
        const absPath = path.join(REPO_ROOT, relPath);
        if (!fs.existsSync(absPath)) continue;
        const text = fs.readFileSync(absPath, 'utf8');
        for (const { re, label } of retiredRefs) {
            let match;
            while ((match = re.exec(text)) !== null) {
                failures.push(`${relPath}:${lineNumberForIndex(text, match.index)} ${label}: ${match[0]}`);
            }
        }
        for (const { re, label } of currentVersionClaims) {
            let match;
            while ((match = re.exec(text)) !== null) {
                if (match[1] !== productVersion) {
                    failures.push(`${relPath}:${lineNumberForIndex(text, match.index)} stale ${label}: v${match[1]} (expected v${productVersion})`);
                }
            }
        }
    }

    if (!failures.length) {
        console.log(`[check-versions] Active documentation truth matches v${productVersion} and the local-build policy`);
        return true;
    }

    console.error('[check-versions] Active documentation truth drift detected:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('');
    console.error('Fix active docs or move historical/dead-policy references into archived research/history docs.');
    return false;
}

function main(argv) {
    const sources = [
        readPackageVersion(),
        readPackageLockVersion(),
        readManifestVersion(),
        readYtkitVersion(),
        readUserscriptVersion(),
    ];

    const tagOverride = parseTagFlag(argv);
    if (tagOverride) {
        sources.push({ source: '--tag flag (caller-provided)', value: tagOverride });
    }

    const distinct = new Set(sources.map((s) => s.value));
    const productOk = distinct.size === 1 && sources[0].value !== '';
    // distinct.size === 1 means every read returned the same string; the
    // empty-string check ensures we don't pass when every regex failed
    // and produced ''. (Earlier draft used .includes('') which is always
    // true on any string and silently broke the happy path.)
    if (productOk) {
        const v = sources[0].value;
        console.log(`[check-versions] All ${sources.length} product-version sources agree at v${v}`);
        for (const s of sources) console.log(`  - ${s.source}`);
    } else {
        console.error('[check-versions] Product-version drift detected — sources disagree:');
        for (const s of sources) {
            console.error(`  ${s.value || '<empty>'}  ←  ${s.source}`);
        }
        console.error('');
        console.error('Fix every source then re-run. Useful one-liners:');
        console.error('  node sync-userscript.js               # syncs YTKit.user.js to ytkit.js');
        console.error('  npm install --package-lock-only       # refreshes package-lock.json');
    }

    // v4.47.0 NF25 — SETTINGS_VERSION parity check (independent of
    // product version). The popup's fallback constant, ytkit.js's
    // SETTINGS_VERSION, and settings-meta.json's settingsVersion all
    // describe the same schema version namespace; any drift between
    // them risks silent profile-import corruption when one source
    // fails to load and another picks up.
    const settingsSources = [
        readYtkitSettingsVersion(),
        readPopupSettingsVersionFallback(),
        readSettingsMetaVersion(),
    ];
    const settingsDistinct = new Set(settingsSources.map((s) => s.value));
    const settingsOk = settingsDistinct.size === 1 && settingsSources[0].value !== '';
    if (settingsOk) {
        console.log(`[check-versions] All ${settingsSources.length} SETTINGS_VERSION sources agree at v${settingsSources[0].value}`);
        for (const s of settingsSources) console.log(`  - ${s.source}`);
    } else {
        console.error('[check-versions] SETTINGS_VERSION drift detected — sources disagree:');
        for (const s of settingsSources) {
            console.error(`  ${s.value || '<empty>'}  ←  ${s.source}`);
        }
        console.error('');
        console.error('Fix every source then re-run. The three SETTINGS_VERSION sources');
        console.error('must all hold the same integer (currently independent of product');
        console.error('version; bumps when storage shape changes).');
    }

    const docsOk = productOk && checkActiveDocumentationTruth(sources[0].value);

    process.exit(productOk && settingsOk && docsOk ? 0 : 1);
}

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error('[check-versions]', e.message || e);
        process.exit(2);
    }
}
