#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { parseSha256Sums } = require('./generate-release-readiness');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const DEFAULT_CHECKSUMS = path.join(BUILD_DIR, 'SHA256SUMS');

function readJson(relPath) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

function readProductVersion() {
    return String(readJson('package.json').version || '');
}

function defaultRepo() {
    const pkg = readJson('package.json');
    const url = pkg.repository && pkg.repository.url ? String(pkg.repository.url) : '';
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match ? match[1] : 'SysAdminDoc/Astra-Deck';
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseDigest(digest) {
    const text = String(digest || '').trim().toLowerCase();
    const match = text.match(/^sha256:([0-9a-f]{64})$/);
    return match ? match[1] : null;
}

function normalizeAssets(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.assets)) return payload.assets;
    throw new Error('release asset JSON must be an array or an object with an assets array');
}

function loadAssetsFromFile(filePath) {
    return normalizeAssets(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function loadAssetsFromGitHub({ repo, tag }) {
    const raw = execFileSync('gh', [
        'release',
        'view',
        tag,
        '--repo',
        repo,
        '--json',
        'tagName,assets'
    ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return normalizeAssets(JSON.parse(raw));
}

function readLocalDigestMap(checksumPath = DEFAULT_CHECKSUMS) {
    const checksumText = fs.readFileSync(checksumPath, 'utf8');
    const entries = parseSha256Sums(checksumText);
    const buildDir = path.dirname(checksumPath);
    const local = new Map(entries);
    local.set(path.basename(checksumPath), sha256(checksumPath));
    return { buildDir, local };
}

function compareReleaseDigests({ checksumPath = DEFAULT_CHECKSUMS, assets }) {
    const { buildDir, local } = readLocalDigestMap(checksumPath);
    const remote = new Map();
    const duplicateRemote = [];
    const missingDigest = [];

    for (const asset of normalizeAssets(assets)) {
        if (!asset || !asset.name) continue;
        const name = String(asset.name);
        if (remote.has(name)) duplicateRemote.push(name);
        const digest = parseDigest(asset.digest);
        if (!digest) missingDigest.push(name);
        remote.set(name, {
            digest,
            size: asset.size,
            state: asset.state || null,
            url: asset.url || asset.browser_download_url || null
        });
    }

    const missingRemote = [];
    const extraRemote = [];
    const localFileMissing = [];
    const localHashMismatch = [];
    const digestMismatch = [];
    const matched = [];

    for (const [name, expectedHash] of local) {
        const localPath = path.join(buildDir, name);
        if (!fs.existsSync(localPath)) {
            localFileMissing.push(name);
        } else {
            const actual = sha256(localPath);
            if (actual !== expectedHash) localHashMismatch.push(name);
        }

        if (!remote.has(name)) {
            missingRemote.push(name);
            continue;
        }
        const remoteEntry = remote.get(name);
        if (remoteEntry.digest && remoteEntry.digest !== expectedHash) {
            digestMismatch.push({
                name,
                local: expectedHash,
                remote: remoteEntry.digest
            });
            continue;
        }
        if (remoteEntry.digest) matched.push(name);
    }

    for (const name of remote.keys()) {
        if (!local.has(name)) extraRemote.push(name);
    }

    const failures = {
        duplicateRemote,
        missingDigest,
        missingRemote,
        extraRemote,
        localFileMissing,
        localHashMismatch,
        digestMismatch
    };
    const failed = Object.values(failures).some((items) => items.length > 0);
    return {
        status: failed ? 'fail' : 'pass',
        checked: matched.sort(),
        failures
    };
}

function parseArgs(argv = process.argv.slice(2)) {
    const version = readProductVersion();
    const args = {
        repo: defaultRepo(),
        tag: `v${version}`,
        checksumPath: DEFAULT_CHECKSUMS,
        assetsJson: null
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--repo') {
            args.repo = argv[i + 1];
            if (!args.repo) throw new Error('--repo requires owner/name');
            i += 1;
            continue;
        }
        if (arg === '--tag') {
            args.tag = argv[i + 1];
            if (!args.tag) throw new Error('--tag requires a release tag');
            i += 1;
            continue;
        }
        if (arg === '--checksums') {
            const value = argv[i + 1];
            if (!value) throw new Error('--checksums requires a path');
            args.checksumPath = path.resolve(value);
            i += 1;
            continue;
        }
        if (arg === '--assets-json') {
            const value = argv[i + 1];
            if (!value) throw new Error('--assets-json requires a path');
            args.assetsJson = path.resolve(value);
            i += 1;
            continue;
        }
        throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

function printResult(result) {
    console.log(`[release-digests] ${result.status}: ${result.checked.length} asset digest(s) matched`);
    for (const [key, value] of Object.entries(result.failures)) {
        if (!value.length) continue;
        if (key === 'digestMismatch') {
            console.error(`[release-digests] ${key}: ${value.map((item) => item.name).join(', ')}`);
            continue;
        }
        console.error(`[release-digests] ${key}: ${value.join(', ')}`);
    }
}

function main() {
    const args = parseArgs();
    const assets = args.assetsJson
        ? loadAssetsFromFile(args.assetsJson)
        : loadAssetsFromGitHub({ repo: args.repo, tag: args.tag });
    const result = compareReleaseDigests({
        checksumPath: args.checksumPath,
        assets
    });
    printResult(result);
    if (result.status !== 'pass') {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[release-digests] ' + err.message);
        process.exit(1);
    }
}

module.exports = {
    compareReleaseDigests,
    loadAssetsFromFile,
    normalizeAssets,
    parseArgs,
    parseDigest,
    readLocalDigestMap
};
