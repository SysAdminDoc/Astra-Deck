#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { buildAsset, digestPayload } = require('./build-selector-asset');
const { buildReadinessReport } = require('./generate-release-readiness');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build');
const DEFAULT_OUTPUT_PATH = path.join(BUILD_DIR, 'release-health.json');
const MANIFEST_NAME = 'release-manifest.json';
const SELECTOR_ASSET_NAME = 'selector-packs.json';
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

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

function selectorAssetCheck(repoRoot = REPO_ROOT) {
    const assetPath = path.join(repoRoot, SELECTOR_ASSET_NAME);
    try {
        const text = fs.readFileSync(assetPath, 'utf8');
        const actual = JSON.parse(text);
        if (!actual || actual.schemaVersion !== 1 || !actual.assetVersion || !actual.packs
                || typeof actual.packs !== 'object' || Array.isArray(actual.packs)
                || !Object.keys(actual.packs).length) {
            throw new Error('schema, assetVersion, or packs are malformed');
        }
        const digest = `sha256:${digestPayload(actual)}`;
        if (actual.digest !== digest) throw new Error('canonical SHA-256 digest does not match the payload');
        const expected = buildAsset();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error('selector-packs.json is stale; run npm run generate:selector-asset');
        }
        return check(
            'selector-asset',
            'Selector-pack asset parses and matches the current shipped selector map',
            'pass',
            `${Object.keys(actual.packs).length} pack(s), ${actual.assetVersion}, ${actual.digest}`
        );
    } catch (error) {
        return check(
            'selector-asset',
            'Selector-pack asset parses and matches the current shipped selector map',
            'fail',
            `${path.relative(repoRoot, assetPath).replace(/\\/g, '/')} invalid: ${error.message}`
        );
    }
}

function runNodeCheck(repoRoot, scriptName, args) {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', scriptName), ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: 180000
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (result.error) {
        return { status: 'fail', details: `${result.error.message}${output ? `\n${output}` : ''}` };
    }
    if (result.status !== 0) {
        return { status: 'fail', details: output || `${scriptName} exited with code ${result.status}` };
    }
    return { status: 'pass', details: output || `${scriptName} completed successfully` };
}

function normalizeRuntimeCheck(result, fallbackLabel) {
    if (result && typeof result === 'object' && (result.status === 'pass' || result.status === 'fail' || result.status === 'warning')) {
        return result;
    }
    if (result === true) return { status: 'pass', details: `${fallbackLabel} completed successfully` };
    if (result === false) return { status: 'fail', details: `${fallbackLabel} returned failure` };
    throw new Error(`${fallbackLabel} runner returned an unsupported result`);
}

function buildHealthReport(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const buildDir = options.buildDir || path.join(repoRoot, 'build');
    const now = options.now || new Date();
    const manifestPath = path.join(buildDir, MANIFEST_NAME);
    const checks = [];
    const readiness = options.readinessReport || buildReadinessReport({ repoRoot, buildDir, now });
    checks.push(check(
        'artifact-readiness',
        'Release manifest, version surfaces, SBOM, and digests pass readiness',
        readiness.status,
        `release readiness: ${readiness.status}; ${readiness.checks.filter((item) => item.status !== 'pass').map((item) => `${item.id}=${item.status}`).join(', ') || 'all readiness checks passed'}`
    ));
    const selector = options.selectorCheck
        ? normalizeRuntimeCheck(options.selectorCheck(), 'selector asset check')
        : selectorAssetCheck(repoRoot);
    checks.push(check(
        'selector-asset',
        'Selector-pack asset parses and matches the current shipped selector map',
        selector.status,
        selector.details
    ));

    const startup = options.startupCheck
        ? normalizeRuntimeCheck(options.startupCheck(), 'startup budget check')
        : runNodeCheck(repoRoot, 'bench-startup.js', ['--check']);
    checks.push(check(
        'startup-budget',
        'Headless startup benchmark stays within the tracked budget',
        startup.status,
        startup.details
    ));

    const smoke = options.smokeCheck
        ? normalizeRuntimeCheck(options.smokeCheck(), 'release smoke fixture')
        : runNodeCheck(repoRoot, 'smoke-settings-overlay.js', ['--health-only']);
    checks.push(check(
        'smoke-fixture',
        'Real-DOM release smoke fixture passes without screenshots',
        smoke.status,
        smoke.details
    ));

    let version = null;
    let manifestSha256 = null;
    if (fs.existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            version = typeof manifest.version === 'string' ? manifest.version : null;
            manifestSha256 = sha256(manifestPath);
        } catch (_) { /* artifact readiness contains the actionable parse failure */ }
    }
    if (!version) {
        const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
        version = typeof packageJson.version === 'string' && VERSION_PATTERN.test(packageJson.version)
            ? packageJson.version
            : null;
    }
    const status = worstStatus(checks);
    return {
        schemaVersion: 1,
        product: 'Astra Deck',
        version,
        generatedAt: now.toISOString(),
        status,
        promotionEligible: status === 'pass',
        manifestSha256,
        checks,
        readiness
    };
}

function writeHealthReport(report, outputPath = DEFAULT_OUTPUT_PATH) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    return outputPath;
}

function parseArgs(argv = process.argv.slice(2)) {
    const args = { outputPath: DEFAULT_OUTPUT_PATH };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--output') {
            const value = argv[++index];
            if (!value) throw new Error('--output requires a path');
            args.outputPath = path.resolve(value);
            continue;
        }
        throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const report = buildHealthReport();
    const outputPath = writeHealthReport(report, args.outputPath);
    console.log(`[release-health] ${report.status}: ${path.relative(REPO_ROOT, outputPath).replace(/\\/g, '/')}`);
    if (report.status !== 'pass') process.exitCode = 1;
    return report;
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('[release-health] ' + (error.message || error));
        process.exit(1);
    }
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    buildHealthReport,
    check,
    normalizeRuntimeCheck,
    parseArgs,
    selectorAssetCheck,
    sha256,
    worstStatus,
    writeHealthReport
};
