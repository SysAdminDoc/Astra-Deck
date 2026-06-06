'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    compareReleaseDigests,
    normalizeAssets,
    parseArgs,
    parseDigest
} = require('../scripts/compare-release-digests');

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeDigestFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-release-digests-'));
    const buildDir = path.join(root, 'build');
    fs.mkdirSync(buildDir, { recursive: true });

    const files = {
        'astra-deck-store-safe-chrome-v1.2.3.zip': 'zip fixture\n',
        'release-manifest.json': '{"schemaVersion":1}\n'
    };
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(buildDir, name), content);
    }

    const checksumNames = Object.keys(files).sort();
    const sums = checksumNames
        .map((name) => `${sha256(path.join(buildDir, name))}  ${name}`)
        .join('\n') + '\n';
    fs.writeFileSync(path.join(buildDir, 'SHA256SUMS'), sums);

    const assets = [...checksumNames, 'SHA256SUMS'].map((name) => ({
        name,
        digest: `sha256:${sha256(path.join(buildDir, name))}`,
        size: fs.statSync(path.join(buildDir, name)).size,
        state: 'uploaded'
    }));
    return { buildDir, checksumPath: path.join(buildDir, 'SHA256SUMS'), assets };
}

test('release digest comparison passes when GitHub asset digests match local SHA256SUMS', () => {
    const { checksumPath, assets } = writeDigestFixture();
    const result = compareReleaseDigests({ checksumPath, assets });

    assert.equal(result.status, 'pass');
    assert.deepEqual(result.failures.missingRemote, []);
    assert.equal(result.checked.length, 3);
});

test('release digest comparison fails on mismatches, missing digests, and extra assets', () => {
    const { checksumPath, assets } = writeDigestFixture();
    const mutated = assets.map((asset) => ({ ...asset }));
    mutated[0].digest = `sha256:${'0'.repeat(64)}`;
    mutated.push({ name: 'extra.zip', digest: `sha256:${'1'.repeat(64)}`, size: 1 });
    mutated.push({ name: 'no-digest.zip', size: 1 });

    const result = compareReleaseDigests({ checksumPath, assets: mutated });

    assert.equal(result.status, 'fail');
    assert.deepEqual(result.failures.digestMismatch.map((item) => item.name), [mutated[0].name]);
    assert.ok(result.failures.extraRemote.includes('extra.zip'));
    assert.ok(result.failures.missingDigest.includes('no-digest.zip'));
});

test('release digest helper parses GitHub-shaped asset JSON and strict CLI options', () => {
    assert.equal(parseDigest(`sha256:${'a'.repeat(64)}`), 'a'.repeat(64));
    assert.equal(parseDigest('md5:not-supported'), null);
    assert.deepEqual(normalizeAssets({ assets: [{ name: 'x', digest: `sha256:${'b'.repeat(64)}` }] }).length, 1);
    assert.throws(() => normalizeAssets({ bad: [] }), /assets array/);

    const parsed = parseArgs(['--repo', 'SysAdminDoc/Astra-Deck', '--tag', 'v1.2.3', '--checksums', 'build/SHA256SUMS', '--assets-json', 'assets.json']);
    assert.equal(parsed.repo, 'SysAdminDoc/Astra-Deck');
    assert.equal(parsed.tag, 'v1.2.3');
    assert.match(parsed.checksumPath, /SHA256SUMS$/);
    assert.match(parsed.assetsJson, /assets\.json$/);
    assert.throws(() => parseArgs(['--wat']), /unknown argument/);
});

test('release digest command is exposed through package scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.match(pkg.scripts['release:verify-digests'] || '', /scripts\/compare-release-digests\.js/);
});
