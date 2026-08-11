'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    FIREFOX_AUTO_UPDATE_PROFILE,
    FIREFOX_EXTENSION_ID,
    FIREFOX_UPDATE_MANIFEST_URL,
    patchManifestForFirefox,
} = require('../scripts/manifest-patch');
const {
    FIREFOX_UPDATE_MANIFEST_NAME,
    assertFirefoxUpdateManifestMatchesAssets,
    createFirefoxUpdateManifest,
    getFirefoxUpdateAssetName,
    writeFirefoxUpdateManifest,
} = require('../scripts/firefox-update-manifest');
const { expectedReleaseNames } = require('../scripts/generate-release-manifest');

test('Firefox patch wires the stable update URL only to the store-safe channel', () => {
    const storeSafe = { background: { service_worker: 'background.js' }, permissions: [] };
    patchManifestForFirefox(storeSafe, FIREFOX_AUTO_UPDATE_PROFILE);
    assert.equal(storeSafe.browser_specific_settings.gecko.id, FIREFOX_EXTENSION_ID);
    assert.equal(storeSafe.browser_specific_settings.gecko.update_url, FIREFOX_UPDATE_MANIFEST_URL);

    const full = { background: { service_worker: 'background.js' }, permissions: [] };
    patchManifestForFirefox(full, 'github-full');
    assert.equal(full.browser_specific_settings.gecko.id, FIREFOX_EXTENSION_ID);
    assert.equal(full.browser_specific_settings.gecko.update_url, undefined);
});

test('updates.json links the signed XPI and uses the SHA256SUMS hash format', () => {
    const version = '4.59.1';
    const hash = 'A'.repeat(64).toLowerCase();
    const manifest = createFirefoxUpdateManifest(version, hash);
    const update = manifest.addons[FIREFOX_EXTENSION_ID].updates[0];
    const assetName = getFirefoxUpdateAssetName(version);

    assert.equal(update.version, version);
    assert.equal(update.update_link,
        `https://github.com/SysAdminDoc/Astra-Deck/releases/download/v${version}/${assetName}`);
    assert.equal(update.update_hash, `sha256:${hash}`);
    assert.doesNotThrow(() => assertFirefoxUpdateManifestMatchesAssets(manifest, [
        { name: assetName, sha256: hash }
    ]));
    assert.throws(() => assertFirefoxUpdateManifestMatchesAssets(manifest, [
        { name: assetName, sha256: 'b'.repeat(64) }
    ]), /hash does not match/);
    assert.ok(expectedReleaseNames(version).includes(FIREFOX_UPDATE_MANIFEST_NAME));
});

test('release helper writes updates.json from the staged XPI bytes', () => {
    const version = '4.59.1';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-firefox-updates-'));
    try {
        const assetName = getFirefoxUpdateAssetName(version);
        fs.writeFileSync(path.join(tempDir, assetName), 'signed-xpi-fixture\n', 'utf8');
        const result = writeFirefoxUpdateManifest(tempDir, version);
        assert.equal(path.basename(result.outputPath), FIREFOX_UPDATE_MANIFEST_NAME);
        const saved = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
        assert.doesNotThrow(() => assertFirefoxUpdateManifestMatchesAssets(saved, [
            { name: assetName, sha256: result.manifest.addons[FIREFOX_EXTENSION_ID].updates[0].update_hash.slice(7) }
        ]));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
