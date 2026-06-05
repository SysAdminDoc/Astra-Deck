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

    if (name === 'AstraDownloader.exe') {
        return {
            kind: 'companion',
            profile: 'github-full',
            browser: 'windows',
            artifactType: 'exe',
            version
        };
    }

    if (name === 'AstraDownloader.exe.sha256') {
        return {
            kind: 'companion-checksum',
            profile: 'github-full',
            browser: 'windows',
            artifactType: 'sha256',
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

function expectedReleaseNames(version) {
    const names = [];
    for (const profile of ['store-safe', 'github-full']) {
        for (const browser of ['chrome', 'firefox']) {
            names.push(`astra-deck-${profile}-${browser}-v${version}.zip`);
        }
        names.push(`astra-deck-${profile}-chrome-v${version}.crx`);
        names.push(`astra-deck-${profile}-firefox-v${version}.xpi`);
    }
    names.push(`ytkit-v${version}.user.js`);
    names.push(SBOM_NAME);
    return names.sort();
}

function listBuildAssets() {
    if (!fs.existsSync(BUILD_DIR)) {
        throw new Error('build/ does not exist. Run `npm run build:userscript` first.');
    }
    return fs.readdirSync(BUILD_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name !== MANIFEST_NAME && name !== SHA256SUMS_NAME)
        .sort();
}

function assertExpectedAssets(assetNames, version) {
    const present = new Set(assetNames);
    const missing = expectedReleaseNames(version).filter((name) => !present.has(name));
    if (missing.length) {
        throw new Error('missing release asset(s): ' + missing.join(', '));
    }
}

function writeCompanionSidecarIfPresent(assetNames) {
    if (!assetNames.includes('AstraDownloader.exe')) return assetNames;
    const exePath = path.join(BUILD_DIR, 'AstraDownloader.exe');
    const sidecarPath = path.join(BUILD_DIR, 'AstraDownloader.exe.sha256');
    fs.writeFileSync(sidecarPath, sha256(exePath) + '\n', 'utf8');
    return Array.from(new Set([...assetNames, 'AstraDownloader.exe.sha256'])).sort();
}

function main() {
    const version = readProductVersion();
    if (!version) throw new Error('package.json version is empty');

    let assetNames = listBuildAssets();
    assetNames = writeCompanionSidecarIfPresent(assetNames);
    assertExpectedAssets(assetNames, version);

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
    expectedReleaseNames,
    parseAssetName
};
