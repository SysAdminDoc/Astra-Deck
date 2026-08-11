'use strict';

// Firefox self-distribution update manifest helpers. The update channel stays
// on the existing store-safe Gecko ID so a signed XPI can update current
// companion-capable installs without changing the native-messaging identity.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    FIREFOX_AUTO_UPDATE_PROFILE,
    FIREFOX_EXTENSION_ID,
} = require('./manifest-patch');

const FIREFOX_UPDATE_MANIFEST_NAME = 'updates.json';
const FIREFOX_RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/SysAdminDoc/Astra-Deck/releases/download';

function assertVersion(version) {
    const normalized = String(version || '').trim();
    if (!/^\d+\.\d+\.\d+$/.test(normalized)) {
        throw new Error(`Firefox update manifest requires a semantic version, got: ${version}`);
    }
    return normalized;
}

function normalizeSha256(value) {
    const normalized = String(value || '').trim().replace(/^sha256:/i, '');
    if (!/^[a-f0-9]{64}$/i.test(normalized)) {
        throw new Error('Firefox update manifest requires a 64-character SHA-256 hash');
    }
    return normalized.toLowerCase();
}

function getFirefoxUpdateAssetName(version, profile = FIREFOX_AUTO_UPDATE_PROFILE) {
    const normalizedVersion = assertVersion(version);
    if (profile !== FIREFOX_AUTO_UPDATE_PROFILE) {
        throw new Error(`Firefox update channel is not configured for profile: ${profile}`);
    }
    return `astra-deck-${profile}-firefox-v${normalizedVersion}.xpi`;
}

function getFirefoxUpdateLink(version, profile = FIREFOX_AUTO_UPDATE_PROFILE) {
    const assetName = getFirefoxUpdateAssetName(version, profile);
    const link = new URL(
        `${FIREFOX_RELEASE_DOWNLOAD_BASE_URL}/v${assertVersion(version)}/${assetName}`
    );
    if (link.protocol !== 'https:') throw new Error('Firefox update links must use HTTPS');
    return link.toString();
}

function createFirefoxUpdateManifest(version, updateHash, options = {}) {
    const normalizedVersion = assertVersion(version);
    const profile = options.profile || FIREFOX_AUTO_UPDATE_PROFILE;
    const hash = normalizeSha256(updateHash);
    const updateLink = options.updateLink || getFirefoxUpdateLink(normalizedVersion, profile);
    const parsedLink = new URL(updateLink);
    if (parsedLink.protocol !== 'https:') throw new Error('Firefox update links must use HTTPS');

    return {
        addons: {
            [FIREFOX_EXTENSION_ID]: {
                updates: [{
                    version: normalizedVersion,
                    update_link: parsedLink.toString(),
                    update_hash: `sha256:${hash}`
                }]
            }
        }
    };
}

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeFirefoxUpdateManifest(buildDir, version) {
    const assetName = getFirefoxUpdateAssetName(version);
    const assetPath = path.join(buildDir, assetName);
    if (!fs.existsSync(assetPath)) {
        throw new Error(`Firefox update manifest cannot find ${assetName}`);
    }
    const manifest = createFirefoxUpdateManifest(version, sha256File(assetPath));
    const outputPath = path.join(buildDir, FIREFOX_UPDATE_MANIFEST_NAME);
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return { assetName, manifest, outputPath };
}

function assertFirefoxUpdateManifestMatchesAssets(manifest, assets) {
    const update = manifest?.addons?.[FIREFOX_EXTENSION_ID]?.updates?.[0];
    if (!update) throw new Error(`updates.json is missing the ${FIREFOX_EXTENSION_ID} update entry`);
    const link = new URL(update.update_link);
    if (link.protocol !== 'https:') throw new Error('updates.json update_link must use HTTPS');
    const assetName = decodeURIComponent(path.posix.basename(link.pathname));
    const assetMap = new Map(Array.isArray(assets)
        ? assets.map((asset) => [asset.name, asset.sha256])
        : Object.entries(assets || {}));
    const expectedHash = assetMap.get(assetName);
    if (!expectedHash) throw new Error(`updates.json points at an unlisted asset: ${assetName}`);
    if (update.update_hash !== `sha256:${normalizeSha256(expectedHash)}`) {
        throw new Error(`updates.json hash does not match ${assetName}`);
    }
    return true;
}

module.exports = {
    FIREFOX_RELEASE_DOWNLOAD_BASE_URL,
    FIREFOX_UPDATE_MANIFEST_NAME,
    assertFirefoxUpdateManifestMatchesAssets,
    createFirefoxUpdateManifest,
    getFirefoxUpdateAssetName,
    getFirefoxUpdateLink,
    normalizeSha256,
    sha256File,
    writeFirefoxUpdateManifest,
};
