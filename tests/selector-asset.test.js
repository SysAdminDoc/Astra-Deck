'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { digestPayload } = require('../scripts/build-selector-asset');

const ROOT = path.join(__dirname, '..');

function loadSelectorCore() {
    const context = {
        console,
        Date,
        Math,
        Object,
        Set,
        Map,
        TextEncoder,
        Uint8Array,
        crypto: webcrypto,
        globalThis: null,
        dispatchEvent() {},
    };
    context.globalThis = context;
    vm.createContext(context);
    const packsDir = path.join(ROOT, 'extension', 'core', 'selector-packs');
    const files = [
        'extension/core/registry.js',
        ...fs.readdirSync(packsDir).filter((file) => file.endsWith('.js')).sort()
            .map((file) => `extension/core/selector-packs/${file}`),
        'extension/core/selectors.js'
    ];
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    }
    return context.globalThis.YTKitCore;
}

test('selector-packs.json is versioned and its SHA-256 covers the canonical payload', () => {
    const asset = JSON.parse(fs.readFileSync(path.join(ROOT, 'selector-packs.json'), 'utf8'));
    assert.equal(asset.schemaVersion, 1);
    assert.match(asset.assetVersion, /^\d+\.\d+\.\d+\.selector\.\d+$/);
    assert.equal(asset.digest, `sha256:${digestPayload(asset)}`);
    assert.ok(Object.keys(asset.packs).length >= 30);
});

test('selector asset promotion is atomic and malformed candidates roll back', async () => {
    const core = loadSelectorCore();
    const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'selector-packs.json'), 'utf8'));
    const before = core.getSurfaceSelectorChain('watch');
    const candidate = JSON.parse(JSON.stringify(shipped));
    candidate.assetVersion = '9.9.9.selector.1';
    candidate.packs.watch.stable.unshift('ytd-hot-update-canary');
    candidate.digest = `sha256:${digestPayload(candidate)}`;

    const promoted = await core.applySelectorAsset(candidate, { source: 'remote' });
    assert.equal(promoted.ok, true);
    assert.equal(core.getSurfaceSelectorChain('watch')[0], 'ytd-hot-update-canary');
    assert.equal(core.getSelectorAssetState().assetVersion, '9.9.9.selector.1');

    const invalid = JSON.parse(JSON.stringify(candidate));
    invalid.assetVersion = '9.9.9.selector.2';
    invalid.packs.watch.stable[0] = 'ytd-corrupt-canary';
    // Keep the old digest intentionally: the verifier must reject this before
    // changing the active map.
    const rejected = await core.applySelectorAsset(invalid, { source: 'remote' });
    assert.equal(rejected.ok, false);
    assert.equal(core.getSurfaceSelectorChain('watch')[0], 'ytd-hot-update-canary');
    assert.equal(core.getSelectorAssetState().status, 'rollback');
    assert.match(core.getSelectorAssetState().lastError, /digest mismatch/i);
    assert.equal(before.includes('ytd-hot-update-canary'), false);

    const malformed = JSON.parse(JSON.stringify(candidate));
    malformed.assetVersion = '9.9.9.selector.3';
    malformed.packs.watch.stable[0] = { selector: 'not-a-string' };
    malformed.digest = `sha256:${digestPayload(malformed)}`;
    const malformedResult = await core.applySelectorAsset(malformed, { source: 'remote' });
    assert.equal(malformedResult.ok, false);
    assert.match(malformedResult.error, /non-string selector/i);
    assert.equal(core.getSurfaceSelectorChain('watch')[0], 'ytd-hot-update-canary');

    const oversized = await core.applySelectorAsset('x'.repeat(256 * 1024 + 1), { source: 'remote' });
    assert.equal(oversized.ok, false);
    assert.match(oversized.error, /size limit/i);
    assert.equal(core.getSurfaceSelectorChain('watch')[0], 'ytd-hot-update-canary');
});

test('selector health export includes the active asset state', () => {
    const core = loadSelectorCore();
    const report = JSON.parse(core.exportSelectorHealth());
    assert.equal(report.selectorAsset.status, 'offline-default');
    assert.equal(report.selectorAsset.source, 'shipped');
});

test('selector refresh is fixed to the allowlisted project asset and size bounded', () => {
    const background = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));
    assert.match(background, /YTKIT_FETCH_SELECTOR_ASSET/);
    assert.match(background, /raw\.githubusercontent\.com\/SysAdminDoc\/Astra-Deck\/refs\/heads\/main\/selector-packs\.json/);
    assert.match(background, /MAX_SELECTOR_ASSET_BYTES\s*=\s*256\s*\*\s*1024/);
    assert.ok(manifest.host_permissions.includes('https://raw.githubusercontent.com/*'));
    assert.doesNotMatch(background, /SELECTOR_ASSET_URL\s*=\s*msg\./);
});
