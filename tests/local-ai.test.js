'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'core', 'local-ai.js'), 'utf8');

function loadIsolated(globals = {}) {
    const sandbox = {
        ...globals,
        module: { exports: {} }
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: 'local-ai.js' });
    return sandbox.module.exports;
}

test('local AI adapter recognizes current factories and reports active lanes', async () => {
    const summarizer = {
        availability: async () => 'available',
        create: async () => ({ summarize() {} })
    };
    const translator = {
        availability: async () => 'downloadable',
        create: async () => ({ translate() {} })
    };
    const localAi = loadIsolated({ Summarizer: summarizer, Translator: translator });
    assert.equal(localAi.has('summarizer'), true);
    assert.equal(localAi.has('translator'), true);
    assert.equal(localAi.getFactory('summarizer'), summarizer);
    assert.equal(localAi.normalizeAvailability('DOWNLOADABLE'), 'downloadable');
    assert.equal(localAi.normalizeAvailability('future-state'), 'unknown');

    const status = localAi.getLaneStatus();
    assert.equal(status.summary.activeLane, 'local');
    assert.equal(status.transcriptTranslation.activeLane, 'local');
    const resolved = await localAi.resolveLaneStatus();
    assert.equal(resolved.summary.availability, 'available');
    assert.equal(resolved.transcriptTranslation.availability, 'downloadable');
    assert.equal(resolved.transcriptTranslation.activeLane, 'local');
});

test('local AI adapter recognizes legacy window.ai factories and explicit fallbacks', async () => {
    const localAi = loadIsolated({ ai: {
        summarizer: { availability: async () => 'unavailable' },
        translator: {}
    } });
    assert.equal(localAi.has('summarizer'), true);
    assert.equal(localAi.has('translator'), true);
    const resolved = await localAi.resolveLaneStatus();
    assert.equal(resolved.summary.activeLane, 'byo-key');
    assert.equal(resolved.transcriptTranslation.activeLane, 'local');
    assert.equal(resolved.summary.availability, 'unavailable');
});
