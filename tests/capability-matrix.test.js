'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

function loadFreshProbe() {
    delete require.cache[require.resolve('../extension/core/capability-probe.js')];
    delete globalThis.YTKitCore;
    return require('../extension/core/capability-probe.js');
}

test('capability matrix is a frozen runtime contract for every probe', () => {
    const probe = loadFreshProbe();
    const matrix = probe.CAPABILITY_MATRIX;
    assert.equal(matrix.schemaVersion, 2);
    assert.ok(Object.isFrozen(matrix));
    assert.deepEqual(Object.keys(matrix.capabilities).sort(), Object.keys(probe.PROBES).sort());

    for (const [name, entry] of Object.entries(matrix.capabilities)) {
        assert.equal(typeof entry.api, 'string', `${name} must document its API`);
        assert.ok(entry.api.length > 0);
        assert.deepEqual(Object.keys(entry.availability).sort(), ['chromium', 'firefox', 'userscript']);
        assert.ok(Array.isArray(entry.requiredPermission), `${name} must document permissions`);
        assert.equal(typeof entry.executionWorld, 'string');
        assert.equal(typeof entry.minimumBrowser, 'object');
        assert.equal(typeof entry.probe, 'string');
        assert.equal(typeof probe.PROBES[name].run, 'function');
        assert.equal(typeof entry.fallback, 'string');
        assert.equal(typeof entry.userVisibleDegradation, 'string');
        assert.ok(entry.fallback.length > 0, `${name} must define a fallback`);
        assert.ok(entry.userVisibleDegradation.length > 0,
            `${name} must define user-visible degradation`);
    }

    assert.equal(Object.isFrozen(matrix.browsers), true);
    assert.equal(Object.isFrozen(matrix.platformApiPolicy), true);
    assert.equal(Object.isFrozen(matrix.platformApiPolicy.evaluations), true);
    assert.equal(Object.isFrozen(matrix.capabilities), true);
    assert.deepEqual(matrix.aiLanes, {
        summary: {
            localCapability: 'summarizerApi',
            fallbackLane: 'byo-key',
            localDataPolicy: 'No host permission or provider credential is used when the browser lane is active.'
        },
        transcriptTranslation: {
            localCapability: 'translatorApi',
            fallbackLane: 'byo-key',
            localDataPolicy: 'Transcript text stays on-device when the browser lane is active; the fallback is explicit.'
        }
    });
    assert.equal(matrix.capabilities.translatorApi.probe, 'hasTranslatorApi');
});

test('platform API policy evaluates every 2026 candidate against supported floors', () => {
    const { CAPABILITY_MATRIX } = loadFreshProbe();
    const policy = CAPABILITY_MATRIX.platformApiPolicy;
    const entries = policy.evaluations;

    assert.deepEqual(policy.browserFloors, { chrome: '120', firefox: '142' });
    assert.deepEqual(Object.keys(entries).sort(), [
        'contentScriptAdoptedStyleSheets',
        'documentId',
        'firefoxSandbox',
        'mediaStatePseudoClasses',
        'nativeBrowserNamespace',
        'runtimeGetContexts'
    ]);

    for (const [name, entry] of Object.entries(entries)) {
        assert.match(entry.decision, /^(retain|defer)$/, `${name} must record a decision`);
        assert.equal(typeof entry.shipped, 'boolean', `${name} must record whether the path ships`);
        assert.equal(typeof entry.probe, 'string', `${name} must document its independent probe`);
        assert.ok(entry.probe.length > 0, `${name} must document its independent probe`);
        assert.deepEqual(Object.keys(entry.minimumBrowser).sort(), ['chrome', 'firefox']);
        assert.equal(typeof entry.fallback, 'string', `${name} must document the floor fallback`);
        assert.ok(entry.fallback.length > 0, `${name} must document the floor fallback`);
        assert.equal(typeof entry.codeEffect, 'string', `${name} must record the code-size decision`);
        assert.ok(Array.isArray(entry.sources) && entry.sources.length > 0,
            `${name} must cite a primary browser source`);
        assert.ok(entry.sources.every((url) => /^https:\/\/(developer\.chrome\.com|developer\.mozilla\.org)\//.test(url)),
            `${name} must cite only the primary Chrome or Mozilla documentation`);
        assert.equal(entry.shipped, entry.decision === 'retain',
            `${name} must ship only when the retained path already pays for its fallback`);
    }

    assert.deepEqual(Object.entries(entries)
        .filter(([, entry]) => entry.shipped)
        .map(([name]) => name), ['nativeBrowserNamespace', 'documentId']);
});

test('capability matrix generator emits the runtime contract without executable values', () => {
    const generator = require('../scripts/generate-capability-matrix.js');
    const matrix = generator.buildCapabilityMatrix();
    assert.equal(matrix.product, 'Astra Deck');
    assert.equal(matrix.generatedBy, 'scripts/generate-capability-matrix.js');
    assert.ok(matrix.browsers.chromium);
    assert.ok(matrix.platformApiPolicy.evaluations.runtimeGetContexts);
    assert.ok(matrix.capabilities.promptApi);
    const pending = [matrix];
    while (pending.length) {
        const value = pending.pop();
        assert.notEqual(typeof value, 'function', 'generated matrix values must be data only');
        if (value && typeof value === 'object') pending.push(...Object.values(value));
    }

    const output = path.join(repoRoot, 'build', 'browser-capability-matrix.json');
    if (fs.existsSync(output)) {
        generator.checkCapabilityMatrix(output);
    }
});

// ── The declared Chrome floor ──
//
// The matrix has claimed "Chrome 120+" since it existed while the manifest
// declared nothing, so a Chrome 119 user installed successfully and then met
// undefined behaviour instead of being told the version is unsupported. Both
// now state it, so both can drift apart; these hold them together.

test('the manifest declares the same Chrome floor the capability matrix claims', () => {
    const probe = loadFreshProbe();
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
    const chromium = probe.CAPABILITY_MATRIX.browsers.chromium;

    assert.equal(typeof manifest.minimum_chrome_version, 'string',
        'the manifest must declare a Chrome floor, not leave it to documentation');
    assert.match(manifest.minimum_chrome_version, /^\d+$/);
    assert.equal(manifest.minimum_chrome_version, chromium.minimumChromeVersion);
    assert.match(chromium.baseline, new RegExp(`Chrome ${chromium.minimumChromeVersion}\\b`));
});

test('the generator refuses to emit a matrix that disagrees with the manifest', () => {
    const probe = loadFreshProbe();
    const generator = require('../scripts/generate-capability-matrix');
    const chromium = probe.CAPABILITY_MATRIX.browsers.chromium;
    const manifest = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
    assert.throws(() => generator.buildCapabilityMatrix({
        manifest: { ...manifest, minimum_chrome_version: '1' }
    }), /floor disagreement/);
    assert.equal(manifest.minimum_chrome_version, chromium.minimumChromeVersion);
    assert.doesNotThrow(() => generator.buildCapabilityMatrix());
});

test('the Firefox build strips the Chrome-only floor declaration', () => {
    const { patchManifestForFirefox } = require('../scripts/manifest-patch');
    const patched = patchManifestForFirefox({
        minimum_chrome_version: '120',
        side_panel: { default_path: 'sidepanel.html' },
        permissions: ['storage', 'sidePanel']
    });
    assert.equal('minimum_chrome_version' in patched, false,
        'Firefox states its floor through strict_min_version; addons-linter reports this key as unknown');
});
