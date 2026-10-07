'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { digestPayload } = require('../scripts/build-selector-asset');

const ROOT = path.join(__dirname, '..');

function loadSelectorCore(extraGlobals = {}) {
    const context = {
        ...extraGlobals,
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
    assert.equal(report.schemaVersion, 3);
    assert.ok(Object.prototype.hasOwnProperty.call(report, 'youtubeClientVersion'));
    assert.ok(Object.prototype.hasOwnProperty.call(report, 'criticalCanary'));
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

function shippedCandidate(version, mutate = () => {}) {
    const candidate = JSON.parse(fs.readFileSync(path.join(ROOT, 'selector-packs.json'), 'utf8'));
    candidate.assetVersion = version;
    mutate(candidate);
    candidate.digest = `sha256:${digestPayload(candidate)}`;
    return candidate;
}

// A selector reaches injectStyle as stylesheet text. A brace there closes the
// rule and opens another; url( makes the page fetch. Signed or not, those
// assets are refused whole.
test('a selector that could break out of a style rule rejects the asset', async () => {
    for (const hostile of ['ytd-app{}', 'ytd-app } body { display: none', '[style*="url(https://example.com/x)"]']) {
        const core = loadSelectorCore();
        const result = await core.applySelectorAsset(shippedCandidate('9.9.9.selector.1', (asset) => {
            asset.packs.watch.stable.unshift(hostile);
        }), { source: 'remote' });
        assert.equal(result.ok, false, hostile);
        assert.match(result.error, /could break out of a style rule/, hostile);
        assert.equal(core.getSelectorAssetState().source, 'shipped');
    }
});

test('where the browser can check selector syntax, an unparseable one rejects the asset', async () => {
    const asked = [];
    const CSS = {
        supports(text) {
            asked.push(text);
            return !text.includes('!!');
        }
    };
    const accepted = await loadSelectorCore({ CSS }).applySelectorAsset(shippedCandidate('9.9.9.selector.1', (asset) => {
        asset.packs.watch.stable.unshift('ytd-a, :is(ytd-b, [title="x, y"])');
    }), { source: 'remote' });
    assert.equal(accepted.ok, true);
    // A list is checked one complex selector at a time; commas inside
    // :is() and inside a quoted value stay with their part.
    assert.ok(asked.includes('selector(ytd-a)'));
    assert.ok(asked.includes('selector(:is(ytd-b, [title="x, y"]))'));

    const rejected = await loadSelectorCore({ CSS }).applySelectorAsset(shippedCandidate('9.9.9.selector.1', (asset) => {
        asset.packs.watch.stable.unshift('ytd-app!!');
    }), { source: 'remote' });
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /can't parse: ytd-app!!/);
});

test('an asset older than the build\'s own packs, or than the active one, is refused', async () => {
    const core = loadSelectorCore();
    const old = await core.applySelectorAsset(shippedCandidate('4.95.0.selector.9'), { source: 'remote', floorVersion: '4.96.0' });
    assert.equal(old.ok, false);
    assert.match(old.error, /older than the packs this build shipped \(4\.96\.0\)/);

    const current = await core.applySelectorAsset(shippedCandidate('4.96.0.selector.2'), { source: 'remote', floorVersion: '4.96.0' });
    assert.equal(current.ok, true, 'the release\'s own asset clears the floor');

    const replay = await core.applySelectorAsset(shippedCandidate('4.96.0.selector.1'), { source: 'remote', floorVersion: '4.96.0' });
    assert.equal(replay.ok, false);
    assert.match(replay.error, /older than the active 4\.96\.0\.selector\.2/);
    assert.equal(core.getSelectorAssetState().assetVersion, '4.96.0.selector.2', 'the newer asset stays active');

    assert.equal(core.compareSelectorAssetVersions('4.96.0.selector.10', '4.96.0.selector.9'), 1);
    assert.equal(core.compareSelectorAssetVersions('no-digits', '0.0.1'), -1, 'a version with no numbers fails closed');
});

test('the shipped asset clears its own release\'s floor', () => {
    const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'selector-packs.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(loadSelectorCore().compareSelectorAssetVersions(shipped.assetVersion, pkg.version) >= 0,
        `${shipped.assetVersion} must not sit below ${pkg.version}, or every user refuses it`);
});
