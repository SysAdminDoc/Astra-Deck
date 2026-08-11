#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const MANIFEST_NAME = 'release-manifest.json';
const SHA256SUMS_NAME = 'SHA256SUMS';
const SBOM_NAME = 'astra-deck-npm-sbom.cdx.json';
const CAPABILITY_MATRIX_NAME = 'browser-capability-matrix.json';
// Local-only signing provenance marker written by build-extension.js.
// Never listed as a release asset; its `mode` field is folded into the
// manifest as `crxSigningMode` so release readiness can gate on it.
const CRX_SIGNING_PROVENANCE_NAME = 'crx-signing-provenance.json';

function readJson(relPath) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

function readProductVersion() {
    return String(readJson('package.json').version || '');
}

function git(args) {
    try {
        return execFileSync('git', args, {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch (_) {
        return '';
    }
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseAssetName(name, version) {
    const extensionMatch = name.match(/^astra-deck-(store-safe|github-full)-(chrome|firefox)-v([0-9]+\.[0-9]+\.[0-9]+)\.(zip|crx|xpi)$/);
    if (extensionMatch) {
        return {
            kind: 'extension',
            profile: extensionMatch[1],
            browser: extensionMatch[2],
            artifactType: extensionMatch[4],
            version: extensionMatch[3]
        };
    }

    const userscriptMatch = name.match(/^ytkit-v([0-9]+\.[0-9]+\.[0-9]+)\.user\.js$/);
    if (userscriptMatch) {
        return {
            kind: 'userscript',
            profile: 'userscript',
            browser: 'userscript-manager',
            artifactType: 'user.js',
            version: userscriptMatch[1]
        };
    }

    if (name === SBOM_NAME) {
        return {
            kind: 'sbom',
            profile: 'release',
            browser: null,
            artifactType: 'cyclonedx-json',
            version
        };
    }

    return {
        kind: 'auxiliary',
        profile: 'release',
        browser: null,
        artifactType: path.extname(name).replace(/^\./, '') || 'file',
        version
    };
}

function expectedReleaseNames(version, options = {}) {
    const names = [];
    // A --no-crx build produces no CRX, so the CRX must not be expected either
    // — otherwise every no-CRX release reports two missing assets. The mode is
    // passed in rather than read from build/ here: this function is pure and
    // is called from tests, and reading ambient build state would make its
    // answer depend on whatever the last local build happened to be.
    const includeCrx = (options.crxSigningMode || 'external') !== 'none';
    for (const profile of ['store-safe', 'github-full']) {
        for (const browser of ['chrome', 'firefox']) {
            names.push(`astra-deck-${profile}-${browser}-v${version}.zip`);
        }
        if (includeCrx) names.push(`astra-deck-${profile}-chrome-v${version}.crx`);
        names.push(`astra-deck-${profile}-firefox-v${version}.xpi`);
    }
    names.push(`ytkit-v${version}.user.js`);
    names.push(SBOM_NAME);
    names.push(CAPABILITY_MATRIX_NAME);
    // Astra Downloader ships from its own repository
    // (SysAdminDoc/AstraDownloader) as of companion v2.0.0. Its executable is
    // deliberately absent from this list, so a stray AstraDownloader.exe in
    // build/ is reported as an unexpected asset rather than published from
    // here — a second, older copy on this release is exactly how installs got
    // a four-versions-stale companion before.
    return names.sort();
}

function unexpectedReleaseNames(assetNames, version, options = {}) {
    const allowed = new Set(expectedReleaseNames(version, options));
    return (assetNames || [])
        .filter((name) => !allowed.has(name))
        .sort();
}

function listBuildAssets() {
    if (!fs.existsSync(BUILD_DIR)) {
        throw new Error('build/ does not exist. Run `npm run build:userscript` first.');
    }
    return fs.readdirSync(BUILD_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name !== MANIFEST_NAME
            && name !== SHA256SUMS_NAME
            && name !== CRX_SIGNING_PROVENANCE_NAME)
        .sort();
}

function readCrxSigningProvenance(buildDir = BUILD_DIR) {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(buildDir, CRX_SIGNING_PROVENANCE_NAME), 'utf8'));
        const mode = raw && typeof raw.mode === 'string' ? raw.mode : null;
        // 'none' means the build ran with --no-crx and produced no CRX at all.
        return mode === 'external' || mode === 'ephemeral' || mode === 'none' ? mode : 'unknown';
    } catch (_) {
        return 'unknown';
    }
}

function isValidationBuild(argv = process.argv, env = process.env) {
    return argv.includes('--validation-build') || env.ASTRA_VALIDATION_RELEASE === '1';
}

function assertExpectedAssets(assetNames, version, options = {}) {
    const present = new Set(assetNames);
    const missing = expectedReleaseNames(version, options).filter((name) => !present.has(name));
    if (missing.length) {
        throw new Error('missing release asset(s): ' + missing.join(', '));
    }
    const unexpected = unexpectedReleaseNames(assetNames, version, options);
    if (unexpected.length) {
        throw new Error('unexpected release asset(s): ' + unexpected.join(', '));
    }
}

function assertKnownArgs(argv) {
    // Every sibling gate rejects unknown flags. This one accepted anything,
    // which is how a documented-but-nonexistent `--require-companion` in the
    // release checklist read as a gate while doing nothing.
    const known = new Set(['--validation-build']);
    const unknown = argv.filter((arg) => arg.startsWith('--') && !known.has(arg));
    if (unknown.length) {
        console.error(`[release-manifest] unknown argument(s): ${unknown.join(', ')}`);
        process.exit(2);
    }
}

function main() {
    assertKnownArgs(process.argv.slice(2));
    const version = readProductVersion();
    if (!version) throw new Error('package.json version is empty');

    const assetNames = listBuildAssets();
    // Read the provenance once and thread it through, so a --no-crx build does
    // not report its (correctly) absent CRX assets as missing.
    const crxSigningMode = readCrxSigningProvenance();
    assertExpectedAssets(assetNames, version, { crxSigningMode });

    const commit = process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']);
    const tag = process.env.GITHUB_REF_NAME || `v${version}`;
    const generatedAt = new Date().toISOString();

    const assets = assetNames.map((name) => {
        const filePath = path.join(BUILD_DIR, name);
        const stat = fs.statSync(filePath);
        return {
            name,
            size: stat.size,
            sha256: sha256(filePath),
            ...parseAssetName(name, version)
        };
    });

    const manifest = {
        schemaVersion: 1,
        product: 'Astra Deck',
        version,
        tag,
        commit,
        generatedAt,
        localSigningRequired: true,
        signingKeyPolicy: 'Public CRX artifacts must be built locally with ASTRA_CRX_KEY_PATH or the default external key store; CI build artifacts use ephemeral CRX signing for validation/provenance only.',
        crxSigningMode,
        validationBuild: isValidationBuild(),
        assets
    };

    const manifestPath = path.join(BUILD_DIR, MANIFEST_NAME);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    const checksumTargets = [...assetNames, MANIFEST_NAME].sort();
    const sums = checksumTargets
        .map((name) => `${sha256(path.join(BUILD_DIR, name))}  ${name}`)
        .join('\n') + '\n';
    fs.writeFileSync(path.join(BUILD_DIR, SHA256SUMS_NAME), sums, 'utf8');

    console.log(`Release manifest: build/${MANIFEST_NAME} (${assets.length} asset(s))`);
    console.log(`Checksums: build/${SHA256SUMS_NAME} (${checksumTargets.length} entries)`);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[release-manifest] ' + err.message);
        process.exit(1);
    }
}

module.exports = {
    CRX_SIGNING_PROVENANCE_NAME,
    expectedReleaseNames,
    isValidationBuild,
    parseAssetName,
    readCrxSigningProvenance,
    unexpectedReleaseNames
};
