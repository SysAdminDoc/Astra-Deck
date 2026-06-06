'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { expectedReleaseNames } = require('../scripts/generate-release-manifest');
const {
    buildReadinessReport,
    parseArgs,
    parseSha256Sums,
    renderMarkdown
} = require('../scripts/generate-release-readiness');

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFixtureRepo({ companionRequired = false } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-release-ready-'));
    const buildDir = path.join(root, 'build');
    fs.mkdirSync(path.join(root, 'extension'), { recursive: true });
    fs.mkdirSync(buildDir, { recursive: true });

    const version = '1.2.3';
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
        version,
        packages: { '': { version } }
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'extension', 'manifest.json'), JSON.stringify({ version }, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'extension', 'ytkit.js'), `const YTKIT_VERSION = '${version}';\n`);
    fs.writeFileSync(path.join(root, 'YTKit.user.js'), `// @version      ${version}\n`);

    for (const name of expectedReleaseNames(version, { requireCompanion: companionRequired })) {
        const content = name === 'AstraDownloader.exe'
            ? Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 7)])
            : Buffer.from(`fixture ${name}\n`, 'utf8');
        fs.writeFileSync(path.join(buildDir, name), content);
    }

    const assets = fs.readdirSync(buildDir)
        .sort()
        .map((name) => ({
            name,
            size: fs.statSync(path.join(buildDir, name)).size,
            sha256: sha256(path.join(buildDir, name))
        }));
    const manifest = {
        schemaVersion: 1,
        product: 'Astra Deck',
        version,
        localSigningRequired: true,
        companionUpdateRequired: companionRequired,
        assets
    };
    fs.writeFileSync(path.join(buildDir, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    const checksumNames = [...assets.map((asset) => asset.name), 'release-manifest.json'].sort();
    const sums = checksumNames
        .map((name) => `${sha256(path.join(buildDir, name))}  ${name}`)
        .join('\n') + '\n';
    fs.writeFileSync(path.join(buildDir, 'SHA256SUMS'), sums);
    return { root, buildDir, version };
}

test('release readiness passes for a complete manifest, checksum, SBOM, and version fixture', () => {
    const { root, buildDir, version } = writeFixtureRepo();
    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        now: new Date('2026-06-06T12:00:00.000Z')
    });

    assert.equal(report.version, version);
    assert.equal(report.status, 'pass');
    assert.equal(report.checks.every((item) => item.status === 'pass'), true);
    assert.match(renderMarkdown(report), /Release Readiness/);
    assert.match(renderMarkdown(report), /SHA256SUMS covers manifest assets/);
});

test('release readiness fails when companion assets are present but manifest omits the companion release', () => {
    const { root, buildDir } = writeFixtureRepo();
    fs.writeFileSync(path.join(buildDir, 'AstraDownloader.exe'), Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048)]));

    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const companionCheck = report.checks.find((item) => item.id === 'companion-assets');
    const inventoryCheck = report.checks.find((item) => item.id === 'manifest-inventory');

    assert.equal(report.status, 'fail');
    assert.equal(companionCheck.status, 'fail');
    assert.match(companionCheck.details, /companion asset present/);
    assert.equal(inventoryCheck.status, 'fail');
});

test('release readiness helpers parse checksums and CLI options strictly', () => {
    const entries = parseSha256Sums(`${'a'.repeat(64)}  build.zip\n`);
    assert.equal(entries.get('build.zip'), 'a'.repeat(64));
    assert.throws(() => parseSha256Sums('not-a-sum build.zip\n'), /invalid SHA256SUMS line/);

    assert.deepEqual(parseArgs(['--require-pass', '--output-dir', 'out']).requirePass, true);
    assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
});

test('release readiness command is wired into package scripts and release workflow', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build.yml'), 'utf8');
    const manifestIndex = workflow.indexOf('npm run release:manifest');
    const readinessIndex = workflow.indexOf('npm run release:readiness -- --require-pass');

    assert.match(pkg.scripts['release:readiness'] || '', /scripts\/generate-release-readiness\.js/);
    assert.notEqual(manifestIndex, -1, 'release workflow must generate the release manifest');
    assert.notEqual(readinessIndex, -1, 'release workflow must require release readiness before upload');
    assert.ok(readinessIndex > manifestIndex, 'readiness must run after release-manifest generation');
});
