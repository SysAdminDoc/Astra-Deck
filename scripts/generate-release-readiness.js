#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
    expectedReleaseNames
} = require('./generate-release-manifest');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const DEFAULT_OUTPUT_DIR = path.join(BUILD_DIR, 'release-readiness');
const MANIFEST_NAME = 'release-manifest.json';
const SHA256SUMS_NAME = 'SHA256SUMS';
const SBOM_NAME = 'astra-deck-npm-sbom.cdx.json';

function readFileIfExists(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        if (err && err.code === 'ENOENT') return null;
        throw err;
    }
}

function readJsonIfExists(filePath) {
    const text = readFileIfExists(filePath);
    if (text === null) return null;
    return JSON.parse(text);
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function check(id, label, status, details) {
    return { id, label, status, details };
}

function worstStatus(checks) {
    if (checks.some((item) => item.status === 'fail')) return 'fail';
    if (checks.some((item) => item.status === 'warning')) return 'warning';
    return 'pass';
}

function readVersionSurfaces(repoRoot = REPO_ROOT) {
    const surfaces = [];
    const packageJson = readJsonIfExists(path.join(repoRoot, 'package.json'));
    surfaces.push({
        name: 'package.json',
        version: packageJson && packageJson.version ? String(packageJson.version) : null
    });

    const lockJson = readJsonIfExists(path.join(repoRoot, 'package-lock.json'));
    surfaces.push({
        name: 'package-lock.json',
        version: lockJson && lockJson.version ? String(lockJson.version) : null
    });
    surfaces.push({
        name: 'package-lock.json packages[""]',
        version: lockJson && lockJson.packages && lockJson.packages[''] && lockJson.packages[''].version
            ? String(lockJson.packages[''].version)
            : null
    });

    const manifestJson = readJsonIfExists(path.join(repoRoot, 'extension', 'manifest.json'));
    surfaces.push({
        name: 'extension/manifest.json',
        version: manifestJson && manifestJson.version ? String(manifestJson.version) : null
    });

    const ytkitSource = readFileIfExists(path.join(repoRoot, 'extension', 'ytkit.js')) || '';
    const ytkitMatch = ytkitSource.match(/\bYTKIT_VERSION\s*=\s*['"]([^'"]+)['"]/);
    surfaces.push({
        name: 'extension/ytkit.js YTKIT_VERSION',
        version: ytkitMatch ? ytkitMatch[1] : null
    });

    const userscript = readFileIfExists(path.join(repoRoot, 'YTKit.user.js')) || '';
    const userscriptMatch = userscript.match(/^\s*\/\/\s*@version\s+(\S+)/m);
    surfaces.push({
        name: 'YTKit.user.js @version',
        version: userscriptMatch ? userscriptMatch[1] : null
    });

    return surfaces;
}

function parseSha256Sums(text) {
    const entries = new Map();
    for (const rawLine of String(text || '').split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line.trim()) continue;
        const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
        if (!match) {
            throw new Error(`invalid SHA256SUMS line: ${line}`);
        }
        entries.set(match[2], match[1].toLowerCase());
    }
    return entries;
}

// Recursively find *.pem files under `dir` (repo-relative forward-slash
// paths). Used by the key-leak readiness check: a stray private key anywhere
// inside extension/ would be staged into every artifact, not just one that
// lands in the repo root.
function listPemFiles(dir, repoRoot) {
    const out = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        if (err && err.code === 'ENOENT') return out;
        throw err;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listPemFiles(full, repoRoot));
        } else if (entry.name.toLowerCase().endsWith('.pem')) {
            out.push(path.relative(repoRoot, full).split(path.sep).join('/'));
        }
    }
    return out;
}

function listBuildFiles(buildDir = BUILD_DIR) {
    try {
        return fs.readdirSync(buildDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .sort();
    } catch (err) {
        if (err && err.code === 'ENOENT') return null;
        throw err;
    }
}

function buildReadinessReport(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const buildDir = options.buildDir || path.join(repoRoot, 'build');
    const now = options.now || new Date();
    const checks = [];

    const versionSurfaces = readVersionSurfaces(repoRoot);
    const versionValues = new Set(versionSurfaces.map((surface) => surface.version).filter(Boolean));
    const missingVersionSurfaces = versionSurfaces.filter((surface) => !surface.version);
    const packageVersion = (versionSurfaces.find((surface) => surface.name === 'package.json') || {}).version || null;
    checks.push(check(
        'version-surfaces',
        'Product version surfaces match',
        missingVersionSurfaces.length === 0 && versionValues.size === 1 ? 'pass' : 'fail',
        versionSurfaces.map((surface) => `${surface.name}=${surface.version || 'missing'}`).join('; ')
    ));

    const buildFiles = listBuildFiles(buildDir);
    checks.push(check(
        'build-dir',
        'Build directory exists',
        buildFiles ? 'pass' : 'fail',
        buildFiles ? `${buildFiles.length} top-level file(s)` : 'build/ is missing; run npm run build:userscript before release readiness'
    ));

    const releaseManifestPath = path.join(buildDir, MANIFEST_NAME);
    const releaseManifest = readJsonIfExists(releaseManifestPath);
    checks.push(check(
        'release-manifest',
        'Release manifest exists',
        releaseManifest ? 'pass' : 'fail',
        releaseManifest ? `build/${MANIFEST_NAME}` : `missing build/${MANIFEST_NAME}`
    ));

    if (releaseManifest) {
        checks.push(check(
            'release-manifest-version',
            'Release manifest version matches product version',
            releaseManifest.version === packageVersion ? 'pass' : 'fail',
            `manifest=${releaseManifest.version || 'missing'}; product=${packageVersion || 'missing'}`
        ));
        checks.push(check(
            'local-signing-policy',
            'Release manifest discloses local signing requirement',
            releaseManifest.localSigningRequired === true ? 'pass' : 'fail',
            `localSigningRequired=${String(releaseManifest.localSigningRequired)}`
        ));
    }

    const rootKeyPath = path.join(repoRoot, 'ytkit.pem');
    const extensionPemFiles = listPemFiles(path.join(repoRoot, 'extension'), repoRoot);
    const keyLeaks = [
        ...(fs.existsSync(rootKeyPath) ? ['ytkit.pem'] : []),
        ...extensionPemFiles
    ];
    checks.push(check(
        'root-signing-key',
        'No private signing key in repo root or extension/',
        keyLeaks.length ? 'fail' : 'pass',
        keyLeaks.length
            ? `key material found: ${keyLeaks.join(', ')}`
            : 'no root ytkit.pem; no *.pem under extension/'
    ));

    const sbomPath = path.join(buildDir, SBOM_NAME);
    checks.push(check(
        'sbom',
        'Release SBOM exists',
        fs.existsSync(sbomPath) ? 'pass' : 'fail',
        fs.existsSync(sbomPath) ? `build/${SBOM_NAME}` : `missing build/${SBOM_NAME}`
    ));

    const shaPath = path.join(buildDir, SHA256SUMS_NAME);
    const shaText = readFileIfExists(shaPath);
    let checksumEntries = null;
    if (shaText === null) {
        checks.push(check('sha256sums', 'SHA256SUMS exists and parses', 'fail', `missing build/${SHA256SUMS_NAME}`));
    } else {
        try {
            checksumEntries = parseSha256Sums(shaText);
            checks.push(check('sha256sums', 'SHA256SUMS exists and parses', 'pass', `${checksumEntries.size} entr${checksumEntries.size === 1 ? 'y' : 'ies'}`));
        } catch (err) {
            checks.push(check('sha256sums', 'SHA256SUMS exists and parses', 'fail', err.message));
        }
    }

    if (releaseManifest && Array.isArray(releaseManifest.assets) && buildFiles) {
        const manifestAssetNames = releaseManifest.assets.map((asset) => asset.name).sort();
        const requireCompanion = releaseManifest.companionUpdateRequired === true;
        const expectedAssets = expectedReleaseNames(packageVersion || releaseManifest.version || '', { requireCompanion });
        const fileSet = new Set(buildFiles);
        const missingExpected = expectedAssets.filter((name) => !fileSet.has(name));
        checks.push(check(
            'expected-assets',
            'Expected release assets are present',
            missingExpected.length === 0 ? 'pass' : 'fail',
            missingExpected.length ? `missing: ${missingExpected.join(', ')}` : `${expectedAssets.length} expected asset(s)`
        ));

        const manifestSet = new Set(manifestAssetNames);
        const unmanifestedFiles = buildFiles
            .filter((name) => name !== MANIFEST_NAME && name !== SHA256SUMS_NAME)
            .filter((name) => !manifestSet.has(name));
        checks.push(check(
            'manifest-inventory',
            'Release manifest inventories top-level build files',
            unmanifestedFiles.length === 0 ? 'pass' : 'fail',
            unmanifestedFiles.length ? `not in manifest: ${unmanifestedFiles.join(', ')}` : `${manifestAssetNames.length} manifest asset(s)`
        ));

        const hasCompanionExe = fileSet.has('AstraDownloader.exe') || manifestSet.has('AstraDownloader.exe');
        const hasCompanionSidecar = fileSet.has('AstraDownloader.exe.sha256') || manifestSet.has('AstraDownloader.exe.sha256');
        let companionStatus = 'pass';
        let companionDetails = 'companion assets omitted by manifest';
        if (requireCompanion) {
            companionStatus = hasCompanionExe && hasCompanionSidecar ? 'pass' : 'fail';
            companionDetails = `companionUpdateRequired=true; exe=${hasCompanionExe}; sidecar=${hasCompanionSidecar}`;
        } else if (hasCompanionExe || hasCompanionSidecar) {
            companionStatus = 'fail';
            companionDetails = 'companion asset present but companionUpdateRequired is not true';
        }
        checks.push(check(
            'companion-assets',
            'Companion asset truth matches release manifest',
            companionStatus,
            companionDetails
        ));

        if (checksumEntries) {
            const expectedChecksumNames = [...manifestAssetNames, MANIFEST_NAME].sort();
            const missingChecksumEntries = expectedChecksumNames.filter((name) => !checksumEntries.has(name));
            const mismatched = [];
            for (const name of expectedChecksumNames) {
                const filePath = path.join(buildDir, name);
                if (!fs.existsSync(filePath) || !checksumEntries.has(name)) continue;
                const actual = sha256(filePath);
                if (actual !== checksumEntries.get(name)) {
                    mismatched.push(name);
                }
            }
            const checksumStatus = missingChecksumEntries.length || mismatched.length ? 'fail' : 'pass';
            const checksumDetails = [
                missingChecksumEntries.length ? `missing entries: ${missingChecksumEntries.join(', ')}` : null,
                mismatched.length ? `hash mismatch: ${mismatched.join(', ')}` : null,
                !missingChecksumEntries.length && !mismatched.length ? `${expectedChecksumNames.length} verified entr${expectedChecksumNames.length === 1 ? 'y' : 'ies'}` : null
            ].filter(Boolean).join('; ');
            checks.push(check(
                'checksum-coverage',
                'SHA256SUMS covers manifest assets and hashes match',
                checksumStatus,
                checksumDetails
            ));
        }
    } else if (releaseManifest) {
        checks.push(check(
            'manifest-assets-shape',
            'Release manifest asset list is readable',
            'fail',
            'release-manifest.json must contain an assets array and build files must be available'
        ));
    }

    const report = {
        schemaVersion: 1,
        product: 'Astra Deck',
        version: packageVersion,
        generatedAt: now.toISOString(),
        status: worstStatus(checks),
        buildDir: path.relative(repoRoot, buildDir).replace(/\\/g, '/') || '.',
        checks
    };
    return report;
}

function renderMarkdown(report) {
    const lines = [
        `# ${report.product} Release Readiness`,
        '',
        `Generated: ${report.generatedAt}`,
        `Version: ${report.version || 'unknown'}`,
        `Status: ${report.status.toUpperCase()}`,
        '',
        '| Check | Status | Details |',
        '|---|---|---|'
    ];
    for (const item of report.checks) {
        lines.push(`| ${item.label} | ${item.status.toUpperCase()} | ${String(item.details || '').replace(/\|/g, '/')} |`);
    }
    lines.push('');
    return lines.join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
    const args = {
        outputDir: DEFAULT_OUTPUT_DIR,
        requirePass: false
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--require-pass') {
            args.requirePass = true;
            continue;
        }
        if (arg === '--output-dir') {
            const value = argv[i + 1];
            if (!value) throw new Error('--output-dir requires a path');
            args.outputDir = path.resolve(value);
            i += 1;
            continue;
        }
        throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

function writeReports(report, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    const jsonPath = path.join(outputDir, 'release-readiness.json');
    const markdownPath = path.join(outputDir, 'release-readiness.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');
    return { jsonPath, markdownPath };
}

function main() {
    const args = parseArgs();
    const report = buildReadinessReport();
    const written = writeReports(report, args.outputDir);
    console.log(`Release readiness: ${report.status}`);
    console.log(`JSON: ${path.relative(REPO_ROOT, written.jsonPath).replace(/\\/g, '/')}`);
    console.log(`Markdown: ${path.relative(REPO_ROOT, written.markdownPath).replace(/\\/g, '/')}`);
    if (args.requirePass && report.status !== 'pass') {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[release-readiness] ' + err.message);
        process.exit(1);
    }
}

module.exports = {
    buildReadinessReport,
    parseArgs,
    parseSha256Sums,
    readVersionSurfaces,
    renderMarkdown,
    worstStatus
};
