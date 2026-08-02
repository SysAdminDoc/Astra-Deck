'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    PROPERTY,
    buildCompanionInventory,
    inspectCompanionInventory
} = require('../scripts/companion-license-inventory');
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

function writeFixtureRepo({ companionRequired = false, crxSigningMode = 'external', validationBuild = false } = {}) {
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

    for (const name of expectedReleaseNames(version, { requireCompanion: companionRequired })) {
        let content;
        if (name === 'AstraDownloader.exe') {
            content = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 7)]);
        } else if (name === 'astra-deck-npm-sbom.cdx.json') {
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

function writeCompanionInventoryFixture(root, buildDir) {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 9)]);
    const exePath = path.join(buildDir, 'AstraDownloader.exe');
    fs.writeFileSync(exePath, exe);
    fs.mkdirSync(path.join(root, 'astra_downloader'), { recursive: true });
    fs.copyFileSync(
        path.join(__dirname, '..', 'astra_downloader', 'license-policy.json'),
        path.join(root, 'astra_downloader', 'license-policy.json')
    );
    fs.copyFileSync(
        path.join(__dirname, '..', 'astra_downloader', 'constraints-release.txt'),
        path.join(root, 'astra_downloader', 'constraints-release.txt')
    );
    const constraintsSha256 = sha256(path.join(root, 'astra_downloader', 'constraints-release.txt'));
    const licenseFile = [{ path: 'package.dist-info/LICENSE', sha256: 'b'.repeat(64) }];
    const resolvedPackages = [
        { name: 'PyInstaller', version: '6.21.0', scope: 'build', license: 'MIT', dependsOn: [] },
        { name: 'PyQt6', version: '6.11.0', scope: 'embedded', license: 'GPL-3.0-only', dependsOn: ['pyqt6-qt6'] },
        { name: 'PyQt6-Qt6', version: '6.11.1', scope: 'embedded', license: 'LGPL-3.0-only', dependsOn: [] },
        { name: 'requests', version: '2.34.2', scope: 'validation', license: 'Apache-2.0', dependsOn: [] }
    ];
    const metadata = {
        schemaVersion: 2,
        version: '1.5.1',
        artifact: {
            name: 'AstraDownloader.exe',
            size: exe.length,
            sha256: sha256(exePath)
        },
        python: {
            implementation: 'CPython',
            version: '3.12.10',
            license: 'Python-2.0',
            sourceUrl: 'https://www.python.org/'
        },
        resolution: {
            schemaVersion: 1,
            constraintsPath: 'astra_downloader/constraints-release.txt',
            constraintsSha256,
            supportedPythonMinors: ['3.11', '3.12'],
            direct: ['pyinstaller', 'pyqt6', 'requests'],
            packages: resolvedPackages
        },
        distributions: [
            {
                name: 'PyInstaller',
                version: '6.21.0',
                scope: 'build',
                license: 'GPLv2-or-later with special exception',
                sourceUrl: 'https://pyinstaller.org/',
                recordSha256: '1'.repeat(64),
                licenseFiles: licenseFile
            },
            {
                name: 'PyQt6',
                version: '6.11.0',
                scope: 'embedded',
                license: 'GPL-3.0-only',
                sourceUrl: 'https://pypi.org/project/PyQt6/',
                recordSha256: '2'.repeat(64),
                licenseFiles: licenseFile
            },
            {
                name: 'PyQt6-Qt6',
                version: '6.11.1',
                scope: 'embedded',
                license: 'LGPL-3.0-only',
                sourceUrl: 'https://pypi.org/project/PyQt6-Qt6/',
                recordSha256: '3'.repeat(64),
                licenseFiles: licenseFile
            }
        ]
    };
    fs.writeFileSync(
        path.join(buildDir, 'companion-build-metadata.json'),
        JSON.stringify(metadata, null, 2) + '\n'
    );
    return {
        artifactSha256: metadata.artifact.sha256,
        inventory: buildCompanionInventory(root, buildDir)
    };
}

test('companion SBOM inventory carries the reviewed Python resolution graph', () => {
    const { root, buildDir } = writeFixtureRepo();
    const { inventory } = writeCompanionInventoryFixture(root, buildDir);
    const requests = inventory.components.find((component) => component['bom-ref'] === 'pkg:pypi/requests@2.34.2');
    const pyqt = inventory.dependencies.find((entry) => entry.ref === 'pkg:pypi/pyqt6@6.11.0');

    assert.ok(requests, 'a constraints-only package must still appear in the release SBOM');
    assert.equal(requests.scope, 'excluded', 'validation-only packages must not be represented as shipped');
    assert.equal(
        requests.properties.find((item) => item.name === PROPERTY.resolutionGraph).value,
        'true'
    );
    assert.deepEqual(pyqt.dependsOn, ['pkg:pypi/pyqt6-qt6@6.11.1']);
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

test('companion SBOM inventory links exact embedded versions to the staged artifact and names unresolved obligations', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-companion-license-'));
    const buildDir = path.join(root, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    const { artifactSha256, inventory } = writeCompanionInventoryFixture(root, buildDir);
    const sbom = { components: inventory.components };
    const inspection = inspectCompanionInventory(sbom, artifactSha256);

    assert.ok(inventory.components.some((component) => component.name === 'CPython' && component.version === '3.12.10'));
    assert.ok(inventory.components.some((component) => component.name === 'PyQt6' && component.version === '6.11.0'));
    assert.equal(
        inventory.components.every((component) => (
            component.properties.find((entry) => entry.name === PROPERTY.artifactSha256).value === artifactSha256
        )),
        true
    );
    assert.ok(inspection.issues.some((issue) => /pyqt6: decision=unresolved/i.test(issue)));
    assert.ok(inspection.issues.some((issue) => /ffmpeg: exact version is unresolved/i.test(issue)));
    assert.ok(inspection.issues.some((issue) => /yt-dlp: exact download SHA-256 is unresolved/i.test(issue)));
});

test('companion license inspection fails closed on disallowed decisions and clears only after exact approvals', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-companion-license-'));
    const buildDir = path.join(root, 'build');
    fs.mkdirSync(buildDir, { recursive: true });
    const { artifactSha256, inventory } = writeCompanionInventoryFixture(root, buildDir);
    const sbom = { components: inventory.components };

    for (const component of sbom.components) {
        const decision = component.properties.find((entry) => entry.name === PROPERTY.decision);
        if (decision) decision.value = 'approved';
        const evidence = component.properties.find((entry) => entry.name === PROPERTY.evidence);
        if (evidence && !evidence.value) evidence.value = 'reviewed fixture evidence';
        if (/^(?:unknown|unresolved|latest|dynamic)$/i.test(component.version)) component.version = '1.2.3';
        const downloadHash = component.properties.find((entry) => entry.name === PROPERTY.downloadSha256);
        if (downloadHash) downloadHash.value = 'a'.repeat(64);
        for (const propertyName of [PROPERTY.distributionUrl, PROPERTY.checksumUrl, PROPERTY.sourceUrl]) {
            const url = component.properties.find((entry) => entry.name === propertyName);
            if (url && /latest/i.test(url.value)) url.value = 'https://example.test/releases/v1.2.3/artifact';
        }
    }
    assert.deepEqual(inspectCompanionInventory(sbom, artifactSha256).issues, []);

    const pyqt = sbom.components.find((component) => component.name === 'PyQt6');
    pyqt.properties.find((entry) => entry.name === PROPERTY.decision).value = 'disallowed';
    assert.ok(inspectCompanionInventory(sbom, artifactSha256).issues.some(
        (issue) => /pyqt6: decision=disallowed/i.test(issue)
    ));
});

test('release readiness surfaces companion license blockers by component name', () => {
    const { root, buildDir } = writeFixtureRepo();
    const { inventory } = writeCompanionInventoryFixture(root, buildDir);
    fs.writeFileSync(
        path.join(buildDir, 'astra-deck-npm-sbom.cdx.json'),
        JSON.stringify({
            bomFormat: 'CycloneDX',
            specVersion: '1.5',
            version: 1,
            components: inventory.components
        }, null, 2) + '\n'
    );
    const report = buildReadinessReport({
        repoRoot: root,
        buildDir,
        gitTags: [],
        now: new Date('2026-07-14T12:00:00.000Z')
    });
    const licenseCheck = report.checks.find((item) => item.id === 'companion-license-inventory');

    assert.equal(licenseCheck.status, 'fail');
    assert.match(licenseCheck.details, /pyqt6: decision=unresolved/i);
    assert.match(licenseCheck.details, /ffmpeg: exact version is unresolved/i);
});

test('companion staging metadata is accepted only for the exact EXE bytes', () => {
    const { readValidatedMetadata } = require('../scripts/stage-companion-release');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-companion-stage-'));
    const metadataPath = path.join(root, 'companion-build-metadata.json');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 4)]);
    const metadata = {
        schemaVersion: 2,
        artifact: { name: 'AstraDownloader.exe', size: exe.length, sha256: crypto.createHash('sha256').update(exe).digest('hex') },
        python: { version: '3.12.10' },
        resolution: {
            schemaVersion: 1,
            constraintsPath: 'astra_downloader/constraints-release.txt',
            constraintsSha256: sha256(path.join(__dirname, '..', 'astra_downloader', 'constraints-release.txt')),
            supportedPythonMinors: ['3.11', '3.12'],
            direct: ['pyinstaller'],
            packages: [{ name: 'PyInstaller', version: '6.21.0', scope: 'build', dependsOn: [] }]
        },
        distributions: []
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));

    assert.equal(readValidatedMetadata(metadataPath, exe).artifact.sha256, metadata.artifact.sha256);
    fs.writeFileSync(metadataPath, JSON.stringify({ ...metadata, resolution: undefined }));
    assert.throws(
        () => readValidatedMetadata(metadataPath, exe),
        /reviewed release resolution graph/
    );
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));
    assert.throws(
        () => readValidatedMetadata(metadataPath, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 5)])),
        /does not match/
    );
});
