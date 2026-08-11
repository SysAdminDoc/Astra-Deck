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
    buildBundleParityCheck,
    parseArgs,
    parseSha256Sums,
    renderMarkdown
} = require('../scripts/generate-release-readiness');

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFixtureRepo({ crxSigningMode = 'external', validationBuild = false } = {}) {
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
    fs.writeFileSync(path.join(root, 'YTKit.user.js'), `// @name        YTKit v${version}\n// @version      ${version}\n`);

    for (const name of expectedReleaseNames(version)) {
        let content;
        if (name === 'astra-deck-npm-sbom.cdx.json') {
            content = Buffer.from(JSON.stringify({
                bomFormat: 'CycloneDX',
                specVersion: '1.5',
                version: 1,
                components: []
            }, null, 2) + '\n', 'utf8');
        } else {
            content = Buffer.from(`fixture ${name}\n`, 'utf8');
        }
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
        crxSigningMode,
        validationBuild,
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

test('release readiness verifies the repository userscript bundle without throwing', () => {
    const check = buildBundleParityCheck(path.join(__dirname, '..'));

    assert.equal(check.status, 'pass');
    assert.match(check.details, /byte-identical to their source modules/);
});



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

test('release readiness fails when CRX assets were validation-signed without a validation-build label', () => {
    const { root, buildDir } = writeFixtureRepo({ crxSigningMode: 'ephemeral' });
    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const signingCheck = report.checks.find((item) => item.id === 'crx-signing-mode');

    assert.equal(report.status, 'fail');
    assert.equal(signingCheck.status, 'fail');
    assert.match(signingCheck.details, /validation-signed/);
    assert.match(signingCheck.details, /external maintainer key/);
});

test('release readiness allows ephemeral signing only on explicitly labeled validation builds', () => {
    const { root, buildDir } = writeFixtureRepo({ crxSigningMode: 'ephemeral', validationBuild: true });
    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const signingCheck = report.checks.find((item) => item.id === 'crx-signing-mode');

    assert.equal(signingCheck.status, 'pass');
    assert.match(signingCheck.details, /NOT publishable/);
});

test('release readiness fails on unknown CRX signing provenance', () => {
    const { root, buildDir } = writeFixtureRepo({ crxSigningMode: null });
    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const signingCheck = report.checks.find((item) => item.id === 'crx-signing-mode');

    assert.equal(report.status, 'fail');
    assert.equal(signingCheck.status, 'fail');
    assert.match(signingCheck.details, /unknown CRX signing provenance/);
});

test('release manifest module reads CRX signing provenance and validation labels', () => {
    const {
        CRX_SIGNING_PROVENANCE_NAME,
        isValidationBuild,
        readCrxSigningProvenance
    } = require('../scripts/generate-release-manifest');

    assert.equal(CRX_SIGNING_PROVENANCE_NAME, 'crx-signing-provenance.json');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-crx-prov-'));
    assert.equal(readCrxSigningProvenance(tmp), 'unknown', 'missing provenance file must read as unknown');
    fs.writeFileSync(path.join(tmp, CRX_SIGNING_PROVENANCE_NAME), JSON.stringify({ schemaVersion: 1, mode: 'ephemeral' }));
    assert.equal(readCrxSigningProvenance(tmp), 'ephemeral');
    fs.writeFileSync(path.join(tmp, CRX_SIGNING_PROVENANCE_NAME), JSON.stringify({ schemaVersion: 1, mode: 'external' }));
    assert.equal(readCrxSigningProvenance(tmp), 'external');
    fs.writeFileSync(path.join(tmp, CRX_SIGNING_PROVENANCE_NAME), JSON.stringify({ schemaVersion: 1, mode: 'garbage' }));
    assert.equal(readCrxSigningProvenance(tmp), 'unknown', 'unrecognized mode strings must not pass as trusted');

    assert.equal(isValidationBuild(['node', 'x', '--validation-build'], {}), true);
    assert.equal(isValidationBuild(['node', 'x'], { ASTRA_VALIDATION_RELEASE: '1' }), true);
    assert.equal(isValidationBuild(['node', 'x'], {}), false);
});

test('build-extension writes the CRX signing provenance marker after artifact builds', () => {
    const buildSource = fs.readFileSync(path.join(__dirname, '..', 'build-extension.js'), 'utf8');
    assert.match(buildSource, /CRX_SIGNING_PROVENANCE_NAME = 'crx-signing-provenance\.json'/,
        'build-extension.js must own the provenance marker name');
    assert.match(buildSource, /mode: crxSigningConfig\.mode/,
        'the provenance marker must record the actual signing mode used for this run');
});

test('stray product tags that version-sort ahead of the current version are detected', () => {
    const { findStrayProductTags, parseProductTagSegments, compareVersionSegments } = require('../scripts/check-versions');

    assert.deepEqual(parseProductTagSegments('v4.46.35'), [4, 46, 35]);
    assert.deepEqual(parseProductTagSegments('v25.11'), [25, 11]);
    assert.equal(parseProductTagSegments('release-4'), null);
    assert.equal(parseProductTagSegments('v4.46.35-rc1'), null,
        'suffixed tags are not product-tag shaped');

    assert.ok(compareVersionSegments([25, 11], [4, 46, 35]) > 0, 'v25.11 sorts ahead of v4.46.35');
    assert.ok(compareVersionSegments([4, 46, 4], [4, 46, 35]) < 0);
    assert.equal(compareVersionSegments([4, 46], [4, 46, 0]), 0, 'missing segments compare as zero');

    const tags = ['v25.11', 'v4.46.34', 'v4.46.4', 'v4.5.0', 'not-a-version'];
    assert.deepEqual(findStrayProductTags('4.46.35', tags), ['v25.11']);
    assert.deepEqual(findStrayProductTags('4.46.35', ['v4.46.35', 'v4.46.34']), [],
        'the current tag and older tags are not stray');
    assert.deepEqual(findStrayProductTags('', tags), [],
        'unparseable product version disables the check rather than false-failing');
});

test('release readiness fails when a stray product tag outranks the current version', () => {
    const { root, buildDir } = writeFixtureRepo();
    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        gitTags: ['v25.11', 'v1.2.3', 'v1.2.2'],
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const tagCheck = report.checks.find((item) => item.id === 'product-tag-sanity');

    assert.equal(report.status, 'fail');
    assert.equal(tagCheck.status, 'fail');
    assert.match(tagCheck.details, /v25\.11/);
    assert.match(tagCheck.details, /git tag -d/);

    const cleanReport = buildReadinessReport({
        repoRoot: root,
        buildDir,
        gitTags: ['v1.2.3', 'v1.2.2'],
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const cleanTagCheck = cleanReport.checks.find((item) => item.id === 'product-tag-sanity');
    assert.equal(cleanTagCheck.status, 'pass');
});

test('compare-release-digests refuses tags that version-sort ahead of the product version', () => {
    const { parseArgs: parseDigestArgs } = require('../scripts/compare-release-digests');
    assert.throws(() => parseDigestArgs(['--tag', 'v99.0']), /version-sorts ahead of the current product version/);
    assert.doesNotThrow(() => parseDigestArgs(['--tag', 'v0.0.1']),
        'older release tags remain valid digest-comparison targets');
});

test('release readiness fails when an Astra Downloader asset is staged here', () => {
    const { root, buildDir } = writeFixtureRepo();
    fs.writeFileSync(path.join(buildDir, 'AstraDownloader.exe'), Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048)]));

    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const stagedCheck = report.checks.find((item) => item.id === 'companion-not-republished');
    const inventoryCheck = report.checks.find((item) => item.id === 'manifest-inventory');

    assert.equal(report.status, 'fail');
    assert.equal(stagedCheck.status, 'fail');
    assert.match(stagedCheck.details, /SysAdminDoc\/AstraDownloader/);
    assert.equal(inventoryCheck.status, 'fail',
        'a companion exe in build/ is also an unmanifested file');
});

test('release readiness fails when unexpected assets are present and manifest-listed', () => {
    const { root, buildDir } = writeFixtureRepo();
    const extraName = 'debug-extra.zip';
    const extraPath = path.join(buildDir, extraName);
    fs.writeFileSync(extraPath, 'debug fixture\n', 'utf8');

    const manifestPath = path.join(buildDir, 'release-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.assets.push({
        name: extraName,
        size: fs.statSync(extraPath).size,
        sha256: sha256(extraPath)
    });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    const checksumPath = path.join(buildDir, 'SHA256SUMS');
    fs.appendFileSync(checksumPath, `${sha256(extraPath)}  ${extraName}\n`);

    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        now: new Date('2026-06-06T12:00:00.000Z')
    });
    const unexpectedCheck = report.checks.find((item) => item.id === 'unexpected-assets');

    assert.equal(report.status, 'fail');
    assert.equal(unexpectedCheck.status, 'fail');
    assert.match(unexpectedCheck.details, /debug-extra\.zip/);
});

test('release readiness helpers parse checksums and CLI options strictly', () => {
    const entries = parseSha256Sums(`${'a'.repeat(64)}  build.zip\n`);
    assert.equal(entries.get('build.zip'), 'a'.repeat(64));
    assert.throws(() => parseSha256Sums('not-a-sum build.zip\n'), /invalid SHA256SUMS line/);

    assert.deepEqual(parseArgs(['--require-pass', '--output-dir', 'out']).requirePass, true);
    assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
});

test('release readiness command is wired into local package scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    assert.match(pkg.scripts['build:userscript'] || '', /release:sbom/,
        'release artifact builds must write the SBOM before manifest generation');
    assert.match(pkg.scripts['build:userscript'] || '', /release:manifest/,
        'release artifact builds must write release-manifest.json and SHA256SUMS');
    assert.match(pkg.scripts['release:prepare'] || '', /release:readiness -- --require-pass/,
        'release preparation must finish by enforcing the readiness gate');
    assert.match(pkg.scripts['release:sbom'] || '', /scripts\/generate-release-sbom\.js/,
        'package.json must expose local SBOM generation for older npm versions');
    assert.match(pkg.scripts['release:readiness'] || '', /scripts\/generate-release-readiness\.js/);
    assert.match(pkg.scripts['release:manifest'] || '', /scripts\/generate-release-manifest\.js/);
    assert.equal(fs.existsSync(path.join(__dirname, '..', '.github', 'workflows', 'build.yml')), false,
        'release readiness must stay local-only; no build workflow should exist');
});

test('release SBOM generation uses production package-lock dependencies', () => {
    const { buildSbom } = require('../scripts/generate-release-sbom');
    const sbom = buildSbom();
    const componentNames = sbom.components.map((component) => component.name);

    assert.equal(sbom.bomFormat, 'CycloneDX');
    assert.equal(sbom.specVersion, '1.5');
    assert.ok(componentNames.includes('crx3'),
        'SBOM must include production dependencies from package-lock.json');
    assert.equal(componentNames.includes('eslint'), false,
        'SBOM must omit dev-only dependencies');
    assert.ok(sbom.dependencies.some((entry) => entry.dependsOn && entry.dependsOn.length),
        'SBOM must include dependency graph edges');
});



