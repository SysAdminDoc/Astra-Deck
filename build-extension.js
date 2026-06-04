#!/usr/bin/env node
// build-extension.js -- Packages extension/ into profile-split Chrome + Firefox artifacts
// Usage: node build-extension.js [--profile store-safe|github-full|both] [--bump patch|minor|major]

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crx3 = require('crx3');
const { getUserscriptBasename, resolveUserscriptPath } = require('./scripts/repo-paths');
const {
    extractDefaultsFromSource,
    extractSettingsVersionFromSource
} = require('./scripts/catalog-utils');
const { patchManifestForFirefox } = require('./scripts/manifest-patch');
const { buildDefaultsFromSchema } = require('./extension/core/settings-schema');
const { ORIGIN_CATALOGUE } = require('./extension/core/data-flow');

const EXT_DIR = path.join(__dirname, 'extension');
const BUILD_DIR = path.join(__dirname, 'build');
const MANIFEST = path.join(EXT_DIR, 'manifest.json');
const YTKIT_JS = path.join(EXT_DIR, 'ytkit.js');
const DEFAULT_SETTINGS_JSON = path.join(EXT_DIR, 'default-settings.json');
const SETTINGS_META_JSON = path.join(EXT_DIR, 'settings-meta.json');
const USERSCRIPT = resolveUserscriptPath(__dirname);
const USERSCRIPT_BASENAME = getUserscriptBasename(__dirname);
const CRX_KEY = path.join(__dirname, 'ytkit.pem');

const BUILD_PROFILE_IDS = Object.freeze(['store-safe', 'github-full']);
const BUILD_PROFILES = Object.freeze({
    'store-safe': Object.freeze({
        id: 'store-safe',
        catalogueProfiles: Object.freeze(['store-safe'])
    }),
    'github-full': Object.freeze({
        id: 'github-full',
        catalogueProfiles: Object.freeze(['store-safe', 'github-full'])
    })
});

const CONTENT_HOST_PERMISSIONS = Object.freeze([
    'https://*.youtube.com/*',
    'https://*.youtube-nocookie.com/*',
    'https://youtu.be/*'
]);

const ORIGIN_HOST_PERMISSION_ALIASES = Object.freeze({
    'https://www.reddit.com': Object.freeze([
        'https://www.reddit.com/*',
        'https://old.reddit.com/*'
    ]),
    'http://127.0.0.1:9751-9851': Object.freeze([
        'http://127.0.0.1:9751/*',
        'http://127.0.0.1:9761/*',
        'http://127.0.0.1:9771/*',
        'http://127.0.0.1:9781/*',
        'http://127.0.0.1:9791/*',
        'http://127.0.0.1:9851/*'
    ])
});

function unique(values) {
    return Array.from(new Set(values));
}

function normalizeBuildProfile(profile) {
    if (!BUILD_PROFILE_IDS.includes(profile)) {
        throw new Error('Invalid build profile: ' + profile + ' (use store-safe, github-full, or both)');
    }
    return profile;
}

function expandBuildProfileSelection(profile) {
    if (!profile || profile === 'both') return BUILD_PROFILE_IDS.slice();
    return [normalizeBuildProfile(profile)];
}

// Parse args. Keep imports side-effect-free so tests can require the profile
// helpers without inheriting the parent process' CLI flags.
const IS_CLI = require.main === module;
const args = IS_CLI ? process.argv.slice(2) : [];
const INCLUDE_USERSCRIPT = args.includes('--with-userscript');
const bumpIndex = args.indexOf('--bump');
const profileIndex = args.indexOf('--profile');
// Guard: `--bump` with no following arg previously silently no-op'd because
// `bumpType` was undefined and fell through the `if (bumpType)` check. Fail
// loudly instead so the user knows the bump didn't apply.
let bumpType = null;
if (bumpIndex !== -1) {
    bumpType = args[bumpIndex + 1];
    if (!bumpType || bumpType.startsWith('--')) {
        console.error('--bump requires a type: patch | minor | major');
        process.exit(1);
    }
    if (!['patch', 'minor', 'major'].includes(bumpType)) {
        console.error('Invalid bump type: ' + bumpType + ' (use patch, minor, or major)');
        process.exit(1);
    }
}
let profileType = 'both';
if (profileIndex !== -1) {
    profileType = args[profileIndex + 1];
    if (!profileType || profileType.startsWith('--')) {
        console.error('--profile requires a type: store-safe | github-full | both');
        process.exit(1);
    }
    if (![...BUILD_PROFILE_IDS, 'both'].includes(profileType)) {
        console.error('Invalid profile type: ' + profileType + ' (use store-safe, github-full, or both)');
        process.exit(1);
    }
}
const SELECTED_BUILD_PROFILES = expandBuildProfileSelection(profileType);

// Read manifest
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let version = manifest.version;
let ytkitSource = fs.readFileSync(YTKIT_JS, 'utf8');

// Optional version bump
if (bumpType) {
    const parts = version.split('.').map(Number);
    if (bumpType === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
    else if (bumpType === 'minor') { parts[1]++; parts[2] = 0; }
    else if (bumpType === 'patch') { parts[2]++; }
    version = parts.join('.');
    manifest.version = version;
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    // Update YTKIT_VERSION constant in ytkit.js — hard-fail if the regex no
    // longer matches (e.g. string was refactored to template/backtick form),
    // otherwise the built extension would ship with a stale embedded version.
    const versionRegex = /const YTKIT_VERSION = '[^']+';/;
    if (!versionRegex.test(ytkitSource)) {
        console.error('Could not find `const YTKIT_VERSION = \'...\';` in ytkit.js — refusing to bump with stale version.');
        process.exit(1);
    }
    ytkitSource = ytkitSource.replace(versionRegex, "const YTKIT_VERSION = '" + version + "';");
    fs.writeFileSync(YTKIT_JS, ytkitSource, 'utf8');
    console.log('Updated YTKIT_VERSION in ytkit.js');

    // Always keep the repo-tracked userscript header in sync with the extension
    // version — `Version everything` (CLAUDE.md) requires all version strings
    // to match across files. The `--with-userscript` flag still controls
    // whether a *build artifact* copy is emitted into `build/` later.
    if (fs.existsSync(USERSCRIPT)) {
        let usSrc = fs.readFileSync(USERSCRIPT, 'utf8');
        const before = usSrc;
        const userscriptRawUrl = `https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/${USERSCRIPT_BASENAME}`;
        usSrc = usSrc.replace(/^(\/\/ @name\s+)YTKit v[\d.]+/m, '$1YTKit v' + version);
        usSrc = usSrc.replace(/^(\/\/ @version\s+)[\d.]+/m, '$1' + version);
        usSrc = usSrc.replace(/^(\/\/ @updateURL\s+).+$/m, '$1' + userscriptRawUrl);
        usSrc = usSrc.replace(/^(\/\/ @downloadURL\s+).+$/m, '$1' + userscriptRawUrl);
        usSrc = usSrc.replace(/const YTKIT_VERSION = '[^']+';/, "const YTKIT_VERSION = '" + version + "';");
        if (usSrc !== before) {
            fs.writeFileSync(USERSCRIPT, usSrc, 'utf8');
            console.log('Updated userscript metadata in ' + USERSCRIPT_BASENAME);
        }
    }

    // Keep package.json + package-lock.json in sync. The local/CI version
    // gate validates all version surfaces, so a bump that leaves the lockfile
    // stale should fail before artifacts are shipped.
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
        const updated = pkgRaw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
        if (updated !== pkgRaw) {
            fs.writeFileSync(pkgPath, updated, 'utf8');
            console.log('Updated package.json version');
        }
    }
    const pkgLockPath = path.join(__dirname, 'package-lock.json');
    if (fs.existsSync(pkgLockPath)) {
        const lock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8'));
        let changed = false;
        if (lock.version !== version) {
            lock.version = version;
            changed = true;
        }
        if (lock.packages && lock.packages[''] && lock.packages[''].version !== version) {
            lock.packages[''].version = version;
            changed = true;
        }
        if (changed) {
            fs.writeFileSync(pkgLockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');
            console.log('Updated package-lock.json version');
        }
    }

    console.log('Bumped version to ' + version);
}

const STAGE_SKIP_NAMES = new Set([
    '.git',
    '.DS_Store',
    'Thumbs.db',
    'node_modules',
    '.claude-octopus'
]);

const STAGE_SKIP_SUFFIXES = [
    '.map',
    '.tmp',
    '.bak',
    '.orig',
    '.rej'
];

function shouldStageEntry(entryName) {
    if (STAGE_SKIP_NAMES.has(entryName)) return false;
    return !STAGE_SKIP_SUFFIXES.some(suffix => entryName.endsWith(suffix));
}

// Copy extension files while skipping temp/editor artifacts
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (!shouldStageEntry(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function escapePowershellSingleQuotedString(value) {
    return String(value).replace(/'/g, "''");
}

function createZip(sourceDir, zipPath) {
    if (process.platform === 'win32') {
        // Use Get-ChildItem -Force to include dotfiles, unlike the \* glob
        const escapedSourceDir = escapePowershellSingleQuotedString(sourceDir);
        const escapedZipPath = escapePowershellSingleQuotedString(zipPath);
        execSync(
            `powershell -NoProfile -Command "Get-ChildItem -LiteralPath '${escapedSourceDir}' -Force | Compress-Archive -DestinationPath '${escapedZipPath}' -Force"`,
            { stdio: 'inherit' }
        );
    } else {
        execSync('cd "' + sourceDir + '" && zip -r "' + zipPath + '" .', { stdio: 'inherit' });
    }
    const size = fs.statSync(zipPath).size;
    return (size / 1024).toFixed(1);
}

function formatSize(filePath) {
    return (fs.statSync(filePath).size / 1024).toFixed(1);
}

function hostPermissionsForOrigin(origin) {
    const alias = ORIGIN_HOST_PERMISSION_ALIASES[origin];
    if (alias) return alias.slice();
    return [origin.replace(/\/+$/, '') + '/*'];
}

function getManifestProfileHostPermissions(profile) {
    const normalized = normalizeBuildProfile(profile);
    const allowedCatalogueProfiles = new Set(BUILD_PROFILES[normalized].catalogueProfiles);
    const hosts = CONTENT_HOST_PERMISSIONS.slice();
    for (const entry of ORIGIN_CATALOGUE) {
        if (!allowedCatalogueProfiles.has(entry.profile)) continue;
        hosts.push(...hostPermissionsForOrigin(entry.origin));
    }
    return unique(hosts);
}

function cspSourceFromHostPermission(permission) {
    return String(permission).replace(/\/\*$/, '').replace(/\/+$/, '');
}

function buildExtensionPagesCsp(profile) {
    const connectSources = unique([
        "'self'",
        ...getManifestProfileHostPermissions(profile).map(cspSourceFromHostPermission)
    ]);
    return [
        "script-src 'self'",
        "object-src 'self'",
        'connect-src ' + connectSources.join(' ')
    ].join('; ');
}

function patchManifestForBuildProfile(profileManifest, profile) {
    const normalized = normalizeBuildProfile(profile);
    profileManifest.host_permissions = getManifestProfileHostPermissions(normalized);
    profileManifest.content_security_policy = {
        ...(profileManifest.content_security_policy || {}),
        extension_pages: buildExtensionPagesCsp(normalized)
    };
    return profileManifest;
}

function getArtifactBaseName(profile, browser, artifactVersion = version) {
    return 'astra-deck-' + normalizeBuildProfile(profile) + '-' + browser + '-v' + artifactVersion;
}

function patchStagedManifest(stageDir, profile, browser) {
    const manifestPath = path.join(stageDir, 'manifest.json');
    const stagedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    patchManifestForBuildProfile(stagedManifest, profile);
    if (browser === 'firefox') patchManifestForFirefox(stagedManifest);
    fs.writeFileSync(manifestPath, JSON.stringify(stagedManifest, null, 2) + '\n', 'utf8');
}

// Collect all files in a directory recursively (relative paths)
function listFiles(dir, base) {
    base = base || dir;
    let files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!shouldStageEntry(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(listFiles(full, base));
        } else {
            files.push(full);
        }
    }
    return files;
}

function writeDefaultSettingsCatalog(ytkitSource) {
    // v5.0.0: extension/core/settings-schema.js is the single source of truth.
    // The legacy brace-balanced extractor from ytkit.js still runs as a
    // belt-and-braces drift check — if the in-code `defaults:` block ever
    // disagrees with the schema (a developer hand-edits ytkit.js but forgets
    // the schema, or vice versa), the build fails loudly here instead of
    // silently shipping mismatched defaults.

    const schemaDefaults = buildDefaultsFromSchema();
    const legacyDefaults = extractDefaultsFromSource(ytkitSource);

    // Keep this empty unless a setting is fully removed from defaults, UI, and runtime.
    const retiredSettingKeys = [];
    for (const key of retiredSettingKeys) {
        delete schemaDefaults[key];
        delete legacyDefaults[key];
    }

    const schemaKeys = Object.keys(schemaDefaults);
    const legacyKeys = Object.keys(legacyDefaults);
    const missingFromSchema = legacyKeys.filter((k) => !(k in schemaDefaults));
    const missingFromLegacy = schemaKeys.filter((k) => !(k in legacyDefaults));
    const valueDrift = schemaKeys
        .filter((k) => k in legacyDefaults)
        .filter((k) => JSON.stringify(schemaDefaults[k]) !== JSON.stringify(legacyDefaults[k]));

    if (missingFromSchema.length || missingFromLegacy.length || valueDrift.length) {
        const lines = ['default-settings drift between settings-schema.js and ytkit.js:'];
        if (missingFromSchema.length) lines.push('  schema missing keys: ' + missingFromSchema.join(', '));
        if (missingFromLegacy.length) lines.push('  ytkit.js defaults block missing keys: ' + missingFromLegacy.join(', '));
        if (valueDrift.length) lines.push('  default-value drift on: ' + valueDrift.join(', '));
        lines.push('Resolve by updating extension/core/settings-schema.js OR ytkit.js defaults block,');
        lines.push('then re-run `node scripts/check-settings.js` to verify.');
        throw new Error(lines.join('\n'));
    }

    // Schema wins — emit from schema for byte-stable insertion order.
    fs.writeFileSync(DEFAULT_SETTINGS_JSON, JSON.stringify(schemaDefaults, null, 2) + '\n', 'utf8');
}

function writeSettingsMetaCatalog(ytkitSource) {
    const meta = {
        settingsVersion: extractSettingsVersionFromSource(ytkitSource)
    };

    fs.writeFileSync(SETTINGS_META_JSON, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

function readUserscriptSource() {
    if (!fs.existsSync(USERSCRIPT)) {
        throw new Error(USERSCRIPT_BASENAME + ' is missing — cannot package userscript artifact');
    }
    return fs.readFileSync(USERSCRIPT, 'utf8');
}

async function build() {
    writeDefaultSettingsCatalog(ytkitSource);
    writeSettingsMetaCatalog(ytkitSource);

    // Clean and create build dir
    if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true });
    fs.mkdirSync(BUILD_DIR, { recursive: true });

    for (const profile of SELECTED_BUILD_PROFILES) {
        await buildProfileArtifacts(profile);
    }

    // ── Optional Userscript Build Artifact ──
    if (INCLUDE_USERSCRIPT) {
        const userscriptDestName = 'ytkit-v' + version + '.user.js';
        const userscriptDestPath = path.join(BUILD_DIR, userscriptDestName);
        fs.writeFileSync(userscriptDestPath, readUserscriptSource(), 'utf8');
        console.log('Userscript:  build/' + userscriptDestName + ' (' + formatSize(userscriptDestPath) + ' KB)');
    } else {
        console.log('Userscript:  skipped (extension-native build)');
    }

    console.log('\nAll artifacts built for v' + version + ' (' + SELECTED_BUILD_PROFILES.join(', ') + ')');
}

async function buildProfileArtifacts(profile) {
    // Wrap each profile build in try/finally so an exception mid-flight cannot
    // leave orphan staging directories behind in `build/` that confuse the next run.
    const chromeStageDir = path.join(BUILD_DIR, profile + '-chrome-stage');
    let firefoxStageDir = null;
    try {
        copyDir(EXT_DIR, chromeStageDir);
        patchStagedManifest(chromeStageDir, profile, 'chrome');

        const chromeZipName = getArtifactBaseName(profile, 'chrome') + '.zip';
        const chromeZipPath = path.join(BUILD_DIR, chromeZipName);

        try {
            const size = createZip(chromeStageDir, chromeZipPath);
            console.log(profile + ' Chrome ZIP: build/' + chromeZipName + ' (' + size + ' KB)');
        } catch (e) {
            throw new Error(profile + ' Chrome ZIP failed: ' + e.message);
        }

        const chromeCrxName = getArtifactBaseName(profile, 'chrome') + '.crx';
        const chromeCrxPath = path.join(BUILD_DIR, chromeCrxName);

        try {
            const crxFiles = listFiles(chromeStageDir);
            const keyPath = fs.existsSync(CRX_KEY) ? CRX_KEY : undefined;

            await crx3(crxFiles, {
                keyPath: keyPath,
                crxPath: chromeCrxPath,
                zipPath: undefined // already have the ZIP
            });

            // crx3 generates a key file if one didn't exist
            if (!keyPath) {
                // Move auto-generated key to project root for reuse
                const generatedKey = chromeCrxPath.replace('.crx', '.pem');
                if (fs.existsSync(generatedKey)) {
                    fs.renameSync(generatedKey, CRX_KEY);
                    console.log('Generated signing key: ytkit.pem (keep this file for consistent extension ID)');
                }
            }

            console.log(profile + ' Chrome CRX: build/' + chromeCrxName + ' (' + formatSize(chromeCrxPath) + ' KB)');
        } catch (e) {
            throw new Error(profile + ' Chrome CRX failed: ' + e.message);
        }

        firefoxStageDir = path.join(BUILD_DIR, profile + '-firefox-stage');
        copyDir(EXT_DIR, firefoxStageDir);
        patchStagedManifest(firefoxStageDir, profile, 'firefox');

        const firefoxZipName = getArtifactBaseName(profile, 'firefox') + '.zip';
        const firefoxZipPath = path.join(BUILD_DIR, firefoxZipName);

        try {
            const size = createZip(firefoxStageDir, firefoxZipPath);
            console.log(profile + ' Firefox ZIP: build/' + firefoxZipName + ' (' + size + ' KB)');
        } catch (e) {
            throw new Error(profile + ' Firefox ZIP failed: ' + e.message);
        }

        // XPI is just a ZIP with .xpi extension.
        const firefoxXpiName = getArtifactBaseName(profile, 'firefox') + '.xpi';
        const firefoxXpiPath = path.join(BUILD_DIR, firefoxXpiName);
        fs.copyFileSync(firefoxZipPath, firefoxXpiPath);
        console.log(profile + ' Firefox XPI: build/' + firefoxXpiName + ' (' + formatSize(firefoxXpiPath) + ' KB)');
    } finally {
        if (chromeStageDir && fs.existsSync(chromeStageDir)) {
            try { fs.rmSync(chromeStageDir, { recursive: true, force: true }); } catch (_) {}
        }
        if (firefoxStageDir && fs.existsSync(firefoxStageDir)) {
            try { fs.rmSync(firefoxStageDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
}

if (IS_CLI) {
    build().catch(e => { console.error('Build failed:', e); process.exit(1); });
}

module.exports = {
    BUILD_PROFILE_IDS,
    BUILD_PROFILES,
    buildExtensionPagesCsp,
    expandBuildProfileSelection,
    getArtifactBaseName,
    getManifestProfileHostPermissions,
    patchManifestForBuildProfile
};
