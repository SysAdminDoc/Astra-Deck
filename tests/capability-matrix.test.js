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
    assert.equal(matrix.schemaVersion, 1);
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

test('capability matrix generator emits the runtime contract without executable values', () => {
    const generator = require('../scripts/generate-capability-matrix.js');
    const matrix = generator.buildCapabilityMatrix();
    assert.equal(matrix.product, 'Astra Deck');
    assert.equal(matrix.generatedBy, 'scripts/generate-capability-matrix.js');
    assert.ok(matrix.browsers.chromium);
    assert.ok(matrix.capabilities.promptApi);
    assert.doesNotMatch(JSON.stringify(matrix), /function|=>/);

    const output = path.join(repoRoot, 'build', 'browser-capability-matrix.json');
    if (fs.existsSync(output)) {
        generator.checkCapabilityMatrix(output);
    }
});
