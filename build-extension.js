#!/usr/bin/env node
// build-extension.js -- Packages extension/ into profile-split Chrome + Firefox artifacts
// Usage: node build-extension.js [--profile store-safe|github-full|both] [--bump patch|minor|major] [--no-crx]
//
// --no-crx skips CRX production entirely. Self-hosted CRX installs are
// Linux-only on modern Chrome and the last two published releases shipped no
// CRX at all, so the maintainer key should not gate a ZIP/XPI/userscript
// release — without this flag a release build with no key aborts in
// resolveCrxSigningConfig before producing anything.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const crx3 = require('crx3');
const { getUserscriptBasename, resolveUserscriptPath } = require('./scripts/repo-paths');
const {
    extractDefaultsFromSource,
    extractSettingsVersionFromSource
} = require('./scripts/catalog-utils');
const { patchManifestForFirefox } = require('./scripts/manifest-patch');
const { COMPANION_PORT_CATALOGUE } = require('./scripts/companion-port-catalogue');
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
const CRX_KEY_PATH_ENV = 'ASTRA_CRX_KEY_PATH';
const CRX_KEY_MODE_ENV = 'ASTRA_CRX_KEY_MODE';
const CRX_KEY_MODES = Object.freeze(['external', 'ephemeral']);
// Local-only signing provenance marker. generate-release-manifest.js reads
// this to stamp `crxSigningMode` into release-manifest.json so release
// readiness can refuse public releases built with validation (ephemeral)
// signing. Never uploaded as a release asset.
const CRX_SIGNING_PROVENANCE_NAME = 'crx-signing-provenance.json';

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

function readUtf8IfPresent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        if (error && error.code === 'ENOENT') return null;
        throw error;
    }
}

const CONTENT_HOST_PERMISSIONS = Object.freeze([
    'https://*.youtube.com/*',
    'https://*.youtube-nocookie.com/*',
    'https://youtu.be/*'
]);

const WEB_ACCESSIBLE_RESOURCE_CONSUMERS = Object.freeze([
    Object.freeze({
        resource: 'icons/32.png',
        source: 'extension/ytkit.js',
        anchor: "getBrandAssetUrl('32.png')",
        consumer: 'injected Astra glyph'
    }),
    Object.freeze({
        resource: 'assets/cat.gif',
        source: 'extension/ytkit.js',
        anchor: "getRepoAssetUrl('cat.gif')",
        consumer: 'nyan-cat progress scrubber'
    })
]);

const WEB_ACCESSIBLE_RESOURCE_POLICY = Object.freeze({
    resources: Object.freeze(WEB_ACCESSIBLE_RESOURCE_CONSUMERS.map((entry) => entry.resource)),
    matches: CONTENT_HOST_PERMISSIONS
});

const ORIGIN_HOST_PERMISSION_ALIASES = Object.freeze({
    'https://www.reddit.com': Object.freeze([
        'https://www.reddit.com/*',
        'https://old.reddit.com/*'
    ]),
    [COMPANION_PORT_CATALOGUE.origin]: COMPANION_PORT_CATALOGUE.hostPermissions
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

function defaultCrxKeyPath(env = process.env, platform = process.platform, homeDir = os.homedir()) {
    const baseDir = platform === 'win32'
        ? (env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'))
        : (env.XDG_CONFIG_HOME || path.join(homeDir, '.config'));
    return path.join(baseDir, 'Astra-Deck', 'keys', 'ytkit.pem');
}

function normalizeCrxKeyMode(mode) {
    if (!CRX_KEY_MODES.includes(mode)) {
        throw new Error('Invalid CRX key mode: ' + mode + ' (use external or ephemeral)');
    }
    return mode;
}

function isPathInside(parentDir, candidatePath) {
    const relative = path.relative(path.resolve(parentDir), path.resolve(candidatePath));
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveCrxSigningConfig(options = {}) {
    const env = options.env || process.env;
    const releaseBuild = Boolean(options.releaseBuild);
    const mode = normalizeCrxKeyMode(
        options.mode || env[CRX_KEY_MODE_ENV] || (releaseBuild ? 'external' : 'ephemeral')
    );

    if (mode === 'ephemeral') {
        return {
            mode,
            keyPath: null,
            generatedKeyPath: options.generatedKeyPath || null
        };
    }

    const rawKeyPath = options.keyPath || env[CRX_KEY_PATH_ENV] || defaultCrxKeyPath(env, options.platform || process.platform, options.homeDir || os.homedir());
    const keyPath = path.resolve(rawKeyPath);

    if (isPathInside(__dirname, keyPath)) {
        throw new Error(
            'CRX signing key must live outside the repository worktree. ' +
            'Move ytkit.pem to ' + defaultCrxKeyPath(env, options.platform || process.platform, options.homeDir || os.homedir()) +
            ' or set ' + CRX_KEY_PATH_ENV + ' to another external path.'
        );
    }
    if (!fs.existsSync(keyPath)) {
        throw new Error(
            'CRX signing key not found at ' + keyPath + '. ' +
            'Set ' + CRX_KEY_PATH_ENV + ' to the external ytkit.pem path before running a release build, ' +
            'or set ' + CRX_KEY_MODE_ENV + '=ephemeral for CI validation artifacts only.'
        );
    }

    return {
        mode,
        keyPath,
        generatedKeyPath: null
    };
}

// Parse args. Keep imports side-effect-free so tests can require the profile
// helpers without inheriting the parent process' CLI flags.
const IS_CLI = require.main === module;
const args = IS_CLI ? process.argv.slice(2) : [];
const INCLUDE_USERSCRIPT = args.includes('--with-userscript');
const SKIP_CRX = args.includes('--no-crx') || process.env.ASTRA_SKIP_CRX === '1';
const bumpIndex = args.indexOf('--bump');
const profileIndex = args.indexOf('--profile');
const crxKeyIndex = args.indexOf('--crx-key');
const crxKeyModeIndex = args.indexOf('--crx-key-mode');
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
let crxKeyPath = null;
if (crxKeyIndex !== -1) {
    crxKeyPath = args[crxKeyIndex + 1];
    if (!crxKeyPath || crxKeyPath.startsWith('--')) {
        console.error('--crx-key requires a path outside the repository worktree');
        process.exit(1);
    }
}
let crxKeyMode = null;
if (crxKeyModeIndex !== -1) {
    crxKeyMode = args[crxKeyModeIndex + 1];
    if (!crxKeyMode || crxKeyMode.startsWith('--')) {
        console.error('--crx-key-mode requires a mode: external | ephemeral');
        process.exit(1);
    }
    if (!CRX_KEY_MODES.includes(crxKeyMode)) {
        console.error('Invalid CRX key mode: ' + crxKeyMode + ' (use external or ephemeral)');
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
    // Validate regex BEFORE writing any files to avoid a half-bumped state
    // where manifest.json is updated but ytkit.js is left at the old version.
    const versionRegex = /const YTKIT_VERSION = '[^']+';/;
    if (!versionRegex.test(ytkitSource)) {
        console.error('Could not find `const YTKIT_VERSION = \'...\';` in ytkit.js — refusing to bump with stale version.');
        process.exit(1);
    }

    manifest.version = version;
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    ytkitSource = ytkitSource.replace(versionRegex, "const YTKIT_VERSION = '" + version + "';");
    fs.writeFileSync(YTKIT_JS, ytkitSource, 'utf8');
    console.log('Updated YTKIT_VERSION in ytkit.js');

    // Always keep the repo-tracked userscript header in sync with the extension
    // version — `Version everything` (the project notes) requires all version strings
    // to match across files. The `--with-userscript` flag still controls
    // whether a *build artifact* copy is emitted into `build/` later.
    const originalUserscript = readUtf8IfPresent(USERSCRIPT);
    if (originalUserscript !== null) {
        let usSrc = originalUserscript;
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
    const pkgRaw = readUtf8IfPresent(pkgPath);
    if (pkgRaw !== null) {
        const updated = pkgRaw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
        if (updated !== pkgRaw) {
            fs.writeFileSync(pkgPath, updated, 'utf8');
            console.log('Updated package.json version');
        }
    }
    const pkgLockPath = path.join(__dirname, 'package-lock.json');
    const pkgLockRaw = readUtf8IfPresent(pkgLockPath);
    if (pkgLockRaw !== null) {
        const lock = JSON.parse(pkgLockRaw);
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
    '.rej',
    // Key material and logs must never ship inside an artifact, even if a
    // stray ytkit.pem / debug.log lands in extension/ on a developer machine.
    '.pem',
    '.log'
];

const STAGE_SECRET_NAMES = new Set([
    '.env',
    '.npmrc',
    '.pypirc',
    '.netrc',
    'cert.p12',
    'client_secret.json',
    'credentials.json',
    'id_dsa',
    'id_ecdsa',
    'id_ed25519',
    'id_rsa',
    'private.key',
    'secret.txt',
    'secrets.json',
    'token.txt',
    'tokens.json'
]);

const STAGE_SECRET_SUFFIXES = [
    '.key',
    '.p12',
    '.pfx',
    '.jks',
    '.keystore'
];

function shouldStageEntry(entryName) {
    const name = String(entryName || '');
    const lower = name.toLowerCase();
    if (!name) return false;
    if (STAGE_SKIP_NAMES.has(name) || STAGE_SKIP_NAMES.has(lower)) return false;
    if (STAGE_SECRET_NAMES.has(lower) || lower.startsWith('.env.')) return false;
    return ![...STAGE_SKIP_SUFFIXES, ...STAGE_SECRET_SUFFIXES].some(suffix => lower.endsWith(suffix));
}

function assertPathInsideRoot(candidate, root, label = 'stage path') {
    const relative = path.relative(root, candidate);
    if (!relative) return;
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return;
    throw new Error(`${label} escapes extension root: ${candidate}`);
}

function realpathInsideRoot(candidate, rootReal, label) {
    const real = fs.realpathSync(candidate);
    assertPathInsideRoot(real, rootReal, label);
    return real;
}

// Copy extension files while skipping temp/editor artifacts
function copyDir(src, dest, options = {}) {
    const root = options.root || src;
    const rootReal = options.rootReal || fs.realpathSync(root);
    realpathInsideRoot(src, rootReal, 'stage source directory');
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (!shouldStageEntry(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        const relativePath = path.relative(root, srcPath);
        const stat = fs.lstatSync(srcPath);
        if (stat.isSymbolicLink()) {
            throw new Error(`Refusing to stage symlink or reparse point: ${relativePath}`);
        }
        realpathInsideRoot(srcPath, rootReal, `stage entry ${relativePath}`);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath, { root, rootReal });
        } else if (stat.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        } else {
            throw new Error(`Refusing to stage non-file entry: ${relativePath}`);
        }
    }
}

function createZip(sourceDir, zipPath) {
    if (process.platform === 'win32') {
        // Windows ships bsdtar at System32\tar.exe; `-a` infers ZIP format
        // from the .zip suffix. PowerShell 5.1's archive cmdlet writes
        // backslash entry separators, which AMO rejects for XPIs and which
        // break unzip on Linux — bsdtar writes forward slashes. The full
        // System32 path matters: a bare `tar` resolves to GNU tar inside
        // Git Bash, which silently emits a POSIX tar instead of a ZIP.
        // Enumerating top-level entries (instead of `.`) includes dotfiles
        // while avoiding bsdtar's `./` entry-name prefix.
        const bsdtar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
        const entries = fs.readdirSync(sourceDir);
        if (!entries.length) {
            throw new Error('createZip: nothing to package in ' + sourceDir);
        }
        execFileSync(bsdtar, ['-a', '-cf', zipPath, '-C', sourceDir, ...entries], { stdio: 'inherit' });
    } else {
        execFileSync('zip', ['-r', zipPath, '.'], { cwd: sourceDir, stdio: 'inherit' });
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

function shouldUseRuntimeOptionalHostPermission(entry, profile) {
    return normalizeBuildProfile(profile) === 'store-safe'
        && entry.hostGrant === 'runtime-optional';
}

// API permissions that exist solely to serve a `profile: 'github-full'` origin.
//
// The profile split rewrote host_permissions, optional_host_permissions, CSP and
// web_accessible_resources but never `permissions`, so store-safe shipped two of
// Chrome's most review-sensitive permissions while stripping the only origins
// that consume them. The artifact asked for capability it could not exercise,
// and docs/store-permission-rationale.md justified both to reviewers on that
// false premise.
//
// Each value is the consumer chain, so a future reader can re-verify rather than
// trust this list. Both terminate at the loopback companion, whose origin is
// `profile: 'github-full'` in extension/core/data-flow.js.
const GITHUB_FULL_ONLY_API_PERMISSIONS = Object.freeze({
    cookies: 'EXT_COOKIE_LIST (background.js) -> browserCookies (ytkit.js) -> features/download-ui sends the YouTube jar to the companion',
    nativeMessaging: "background.js connectNative('com.astra.deck.downloader') — companion token bootstrap"
});

function getManifestProfilePermissions(profile, declaredPermissions) {
    const normalized = normalizeBuildProfile(profile);
    const declared = Array.isArray(declaredPermissions) ? declaredPermissions.slice() : [];
    if (normalized !== 'store-safe') return declared;
    return declared.filter((name) => !Object.hasOwn(GITHUB_FULL_ONLY_API_PERMISSIONS, name));
}

function assertCompanionOriginInCatalogue() {
    // data-flow.js adds the companion origin behind a require() wrapped in a
    // swallow-everything catch. If that require ever throws, the build still
    // succeeds and emits artifacts with no loopback host permissions at all,
    // i.e. downloads dead for every install, with no error anywhere.
    const companionOrigin = COMPANION_PORT_CATALOGUE.origin;
    const present = ORIGIN_CATALOGUE.some((entry) => entry.origin === companionOrigin);
    if (!present) {
        throw new Error(
            `Origin catalogue is missing the companion origin (${companionOrigin}). `
            + 'extension/core/data-flow.js could not load scripts/companion-port-catalogue; '
            + 'refusing to emit artifacts without loopback host permissions.'
        );
    }
}

function getManifestProfileHostPermissions(profile) {
    assertCompanionOriginInCatalogue();
    const normalized = normalizeBuildProfile(profile);
    const allowedCatalogueProfiles = new Set(BUILD_PROFILES[normalized].catalogueProfiles);
    const hosts = CONTENT_HOST_PERMISSIONS.slice();
    for (const entry of ORIGIN_CATALOGUE) {
        if (!allowedCatalogueProfiles.has(entry.profile)) continue;
        if (shouldUseRuntimeOptionalHostPermission(entry, normalized)) continue;
        hosts.push(...hostPermissionsForOrigin(entry.origin));
    }
    return unique(hosts);
}

function getManifestProfileOptionalHostPermissions(profile) {
    const normalized = normalizeBuildProfile(profile);
    const allowedCatalogueProfiles = new Set(BUILD_PROFILES[normalized].catalogueProfiles);
    const hosts = [];
    for (const entry of ORIGIN_CATALOGUE) {
        if (!allowedCatalogueProfiles.has(entry.profile)) continue;
        if (!shouldUseRuntimeOptionalHostPermission(entry, normalized)) continue;
        hosts.push(...hostPermissionsForOrigin(entry.origin));
    }
    return unique(hosts);
}

function getManifestProfileConnectHostPermissions(profile) {
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
        ...getManifestProfileConnectHostPermissions(profile).map(cspSourceFromHostPermission)
    ]);
    return [
        "script-src 'self'",
        "object-src 'self'",
        'connect-src ' + connectSources.join(' ')
    ].join('; ');
}

function getPageAccessibleResourceInventory(repoRoot = __dirname) {
    const seen = new Set();
    return WEB_ACCESSIBLE_RESOURCE_CONSUMERS.map((entry) => {
        if (!entry.resource || path.isAbsolute(entry.resource)
                || entry.resource.includes('*') || entry.resource.split(/[\\/]/).includes('..')) {
            throw new Error(`Invalid page-accessible resource path: ${entry.resource}`);
        }
        if (seen.has(entry.resource)) {
            throw new Error(`Duplicate page-accessible resource: ${entry.resource}`);
        }
        seen.add(entry.resource);
        const resourcePath = path.join(repoRoot, 'extension', entry.resource);
        const sourcePath = path.join(repoRoot, entry.source);
        if (!fs.existsSync(resourcePath) || !fs.statSync(resourcePath).isFile()) {
            throw new Error(`Page-accessible resource is missing: ${entry.resource}`);
        }
        const source = fs.readFileSync(sourcePath, 'utf8');
        if (!source.includes(entry.anchor)) {
            throw new Error(
                `Page-accessible resource consumer is missing for ${entry.resource}: ${entry.anchor}`
            );
        }
        return { ...entry };
    });
}

function getRuntimeModuleResources(repoRoot = __dirname) {
    const manifestPath = path.join(repoRoot, 'extension', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const runtimeEntry = (manifest.content_scripts || []).find((entry) => {
        const scripts = entry['x-ytkit-runtime-modules'] || entry.js || [];
        return scripts.includes('ytkit.js');
    });
    const modules = runtimeEntry?.['x-ytkit-runtime-modules'];
    if (!Array.isArray(modules) || modules.length === 0) {
        throw new Error('Normal YouTube runtime module catalogue is missing from manifest.json');
    }

    const seen = new Set();
    for (const resource of modules) {
        if (!resource.endsWith('.js') || path.isAbsolute(resource)
                || resource.includes('..') || resource.includes('*')) {
            throw new Error(`Invalid runtime module resource path: ${resource}`);
        }
        if (seen.has(resource)) throw new Error(`Duplicate runtime module resource: ${resource}`);
        seen.add(resource);
        const fullPath = path.join(repoRoot, 'extension', resource);
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            throw new Error(`Runtime module resource is missing: ${resource}`);
        }
    }
    return modules.slice();
}

function getManifestWebAccessibleResources(browser = 'chromium', repoRoot = __dirname) {
    const pageResources = unique(
        getPageAccessibleResourceInventory(repoRoot).map((entry) => entry.resource)
    );
    const runtimeResources = unique([
        'runtime-core-loader.mjs',
        ...getRuntimeModuleResources(repoRoot),
    ]);
    const entries = [
        {
            resources: pageResources,
            matches: WEB_ACCESSIBLE_RESOURCE_POLICY.matches.slice()
        },
        {
            resources: runtimeResources,
            matches: WEB_ACCESSIBLE_RESOURCE_POLICY.matches.slice()
        }
    ];
    // Chromium's rotating WAR host cannot anchor the loader's relative ES-module
    // imports: descendants resolve to chrome-extension://invalid. Keep only
    // standalone page assets dynamic and serve the reviewed module graph from
    // the stable extension origin.
    if (browser !== 'firefox') entries[0].use_dynamic_url = true;
    return entries;
}

function patchManifestForBuildProfile(profileManifest, profile, browser = 'chromium') {
    const normalized = normalizeBuildProfile(profile);
    profileManifest.permissions = getManifestProfilePermissions(normalized, profileManifest.permissions);
    profileManifest.host_permissions = getManifestProfileHostPermissions(normalized);
    const optionalHostPermissions = getManifestProfileOptionalHostPermissions(normalized);
    if (optionalHostPermissions.length) {
        profileManifest.optional_host_permissions = optionalHostPermissions;
    } else {
        delete profileManifest.optional_host_permissions;
    }
    profileManifest.content_security_policy = {
        ...(profileManifest.content_security_policy || {}),
        extension_pages: buildExtensionPagesCsp(normalized)
    };
    profileManifest.web_accessible_resources = getManifestWebAccessibleResources(browser);
    return profileManifest;
}

function getArtifactBaseName(profile, browser, artifactVersion = version) {
    return 'astra-deck-' + normalizeBuildProfile(profile) + '-' + browser + '-v' + artifactVersion;
}

function patchStagedManifest(stageDir, profile, browser) {
    const manifestPath = path.join(stageDir, 'manifest.json');
    const stagedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    patchManifestForBuildProfile(stagedManifest, profile, browser);
    if (browser === 'firefox') patchManifestForFirefox(stagedManifest);
    fs.writeFileSync(manifestPath, JSON.stringify(stagedManifest, null, 2) + '\n', 'utf8');
}

// Collect all files in a directory recursively (relative paths)
function listFiles(dir, base, options = {}) {
    base = base || dir;
    const root = options.root || base;
    const rootReal = options.rootReal || fs.realpathSync(root);
    realpathInsideRoot(dir, rootReal, 'stage file list directory');
    let files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!shouldStageEntry(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const relativePath = path.relative(root, full);
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) {
            throw new Error(`Refusing to list staged symlink or reparse point: ${relativePath}`);
        }
        realpathInsideRoot(full, rootReal, `staged file entry ${relativePath}`);
        if (entry.isDirectory()) {
            files = files.concat(listFiles(full, base, { root, rootReal }));
        } else if (stat.isFile()) {
            files.push(full);
        } else {
            throw new Error(`Refusing to list non-file staged entry: ${relativePath}`);
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

    // --no-crx short-circuits key resolution entirely. resolveCrxSigningConfig
    // THROWS on a release build with no external key, so asking for the key
    // first would abort the very release this flag exists to unblock.
    const baseCrxSigningConfig = SKIP_CRX
        ? { mode: 'none', keyPath: null, generatedKeyPath: null }
        : resolveCrxSigningConfig({
            keyPath: crxKeyPath,
            mode: crxKeyMode,
            releaseBuild: INCLUDE_USERSCRIPT || Boolean(bumpType)
        });
    const crxSigningConfig = {
        ...baseCrxSigningConfig,
        skip: SKIP_CRX,
        generatedKeyPath: baseCrxSigningConfig.mode === 'ephemeral'
            ? path.join(BUILD_DIR, '.validation-crx-key.pem')
            : null
    };
    if (SKIP_CRX) console.log('Skipping CRX production (--no-crx): no maintainer key required');

    // Ephemeral mode: generate ONE throwaway RSA key up front and hand the
    // same key to every crx3() call in this run. (Previously keyPath was left
    // undefined, so crx3 generated a fresh in-memory key per CRX — store-safe
    // and github-full validation artifacts got DIFFERENT extension IDs in a
    // single build, and the rename/cleanup logic never fired because crx3
    // never writes a .pem for generated keys.)
    if (crxSigningConfig.mode === 'ephemeral') {
        const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        fs.writeFileSync(
            crxSigningConfig.generatedKeyPath,
            privateKey.export({ type: 'pkcs8', format: 'pem' }),
            { encoding: 'utf8', mode: 0o600 }
        );
        console.log('Generated single-run ephemeral CRX signing key for validation artifacts; it will be deleted before build exit');
    }

    try {
        for (const profile of SELECTED_BUILD_PROFILES) {
            await buildProfileArtifacts(profile, crxSigningConfig);
        }
    } finally {
        if (crxSigningConfig.generatedKeyPath && fs.existsSync(crxSigningConfig.generatedKeyPath)) {
            fs.rmSync(crxSigningConfig.generatedKeyPath, { force: true });
        }
    }

    // Record how this run's CRX assets were signed so downstream release
    // tooling can distinguish publishable external-key builds from
    // validation-only ephemeral builds.
    fs.writeFileSync(
        path.join(BUILD_DIR, CRX_SIGNING_PROVENANCE_NAME),
        JSON.stringify({
            schemaVersion: 1,
            mode: crxSigningConfig.mode,
            generatedAt: new Date().toISOString()
        }, null, 2) + '\n',
        'utf8'
    );

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

async function buildProfileArtifacts(profile, crxSigningConfig = resolveCrxSigningConfig({ releaseBuild: false })) {
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

        if (crxSigningConfig.skip) {
            console.log(profile + ' Chrome CRX: skipped (--no-crx)');
        } else {
        const chromeCrxName = getArtifactBaseName(profile, 'chrome') + '.crx';
        const chromeCrxPath = path.join(BUILD_DIR, chromeCrxName);

        try {
            const crxFiles = listFiles(chromeStageDir);
            // External mode signs with the maintainer key; ephemeral mode
            // signs with the single per-run key written by build() so every
            // profile in the run shares one extension ID.
            const keyPath = crxSigningConfig.mode === 'external'
                ? crxSigningConfig.keyPath
                : (crxSigningConfig.generatedKeyPath || undefined);

            await crx3(crxFiles, {
                keyPath: keyPath,
                crxPath: chromeCrxPath,
                zipPath: undefined // already have the ZIP
            });

            console.log(profile + ' Chrome CRX: build/' + chromeCrxName + ' (' + formatSize(chromeCrxPath) + ' KB)');
        } catch (e) {
            throw new Error(profile + ' Chrome CRX failed: ' + e.message);
        }
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
    copyDir,
    CRX_SIGNING_PROVENANCE_NAME,
    defaultCrxKeyPath,
    expandBuildProfileSelection,
    getArtifactBaseName,
    getManifestProfileHostPermissions,
    getManifestProfileOptionalHostPermissions,
    getManifestProfilePermissions,
    GITHUB_FULL_ONLY_API_PERMISSIONS,
    getManifestWebAccessibleResources,
    getPageAccessibleResourceInventory,
    getRuntimeModuleResources,
    listFiles,
    patchManifestForBuildProfile,
    resolveCrxSigningConfig,
    shouldStageEntry,
    WEB_ACCESSIBLE_RESOURCE_CONSUMERS,
    WEB_ACCESSIBLE_RESOURCE_POLICY
};
