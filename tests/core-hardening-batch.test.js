'use strict';

// Regression tests for the 2026-08-10 audit's core-module findings.

const test = require('node:test');
const assert = require('node:assert/strict');

function loadFresh(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    delete globalThis.YTKitCore;
    require(modulePath);
    return globalThis.YTKitCore;
}

test('capability probe requires the companion to identify itself, not merely answer', async () => {
    const cases = [
        ['Astra Downloader health payload', { ok: true, status: 200, body: JSON.stringify({ ytDlp: '2026.08.04', appVersion: '1.9.0' }) }, true],
        // The exact field failure: a legacy server squatting the canonical port
        // answered /health and was adopted as the companion.
        ['legacy server on the same port', { ok: true, status: 200, body: JSON.stringify({ server: 'YTYT-Downloader' }) }, false],
        ['unrelated 404 responder', { ok: false, status: 404, body: 'Not Found' }, false],
        ['non-JSON responder', { ok: true, status: 200, body: '<html>hello</html>' }, false]
    ];

    for (const [label, response, expected] of cases) {
        global.fetch = async () => ({
            ok: response.ok,
            status: response.status,
            text: async () => response.body
        });
        const core = loadFresh('../extension/core/capability-probe.js');
        const actual = await core.capabilityProbe.probe('mediaDL');
        assert.equal(actual, expected, `${label} should report mediaDL=${expected}`);
    }
    delete global.fetch;
});

test('Ollama probe requires an Ollama-shaped version payload', async () => {
    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ version: '0.5.1' }) });
    let core = loadFresh('../extension/core/capability-probe.js');
    assert.equal(await core.capabilityProbe.probe('ollama'), true);

    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ hello: 'world' }) });
    core = loadFresh('../extension/core/capability-probe.js');
    assert.equal(await core.capabilityProbe.probe('ollama'), false,
        'any responder on the port must not count as Ollama');
    delete global.fetch;
});

test('summarizer probe matches the API shapes the features actually detect', async () => {
    for (const [label, setup, expected] of [
        ['global Summarizer (Chrome stable)', () => { globalThis.Summarizer = function () {}; }, true],
        ['legacy ai.summarizer', () => { globalThis.ai = { summarizer: {} }; }, true],
        ['no summarizer API', () => {}, false]
    ]) {
        delete globalThis.Summarizer;
        delete globalThis.ai;
        setup();
        const core = loadFresh('../extension/core/capability-probe.js');
        assert.equal(await core.capabilityProbe.probe('summarizerApi'), expected, label);
    }
    delete globalThis.Summarizer;
    delete globalThis.ai;
});

test('imported backups cannot smuggle unbounded strings through sanitisation', () => {
    const core = loadFresh('../extension/core/persisted-domains.js');
    const domains = core.persistedDomains || core.createPersistedDomains?.() || core;
    const clone = domains.safeClone || core.safeClone;
    if (typeof clone !== 'function') {
        // Not exported: assert the bound exists in source instead of skipping.
        const fs = require('node:fs');
        const path = require('node:path');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'extension', 'core', 'persisted-domains.js'), 'utf8');
        assert.match(src, /MAX_CLONED_STRING_LENGTH/,
            'safeClone must bound string length, not just arrays, keys and depth');
        assert.match(src, /value\.slice\(0, MAX_CLONED_STRING_LENGTH\)/);
        return;
    }
    const huge = 'x'.repeat(5 * 1024 * 1024);
    const out = clone({ note: huge });
    assert.ok(out.note.length <= 64 * 1024, 'a multi-megabyte string must be truncated');
});

test('StorageManager.get does not latch one caller default over another', () => {
    const core = loadFresh('../extension/core/storage-manager.js');
    const sm = core.StorageManager || core.storageManager;
    if (!sm || typeof sm.get !== 'function') {
        const fs = require('node:fs');
        const path = require('node:path');
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'extension', 'core', 'storage-manager.js'), 'utf8');
        assert.match(src, /if \(val !== defaultVal\) this\._cache\[key\] = val;/,
            'a miss must not be cached as though it were a real read');
        return;
    }
    const first = sm.get('ytkit-not-a-real-key', 'first-default');
    const second = sm.get('ytkit-not-a-real-key', 'second-default');
    assert.equal(first, 'first-default');
    assert.equal(second, 'second-default',
        'the second call site must receive its own default, not the first caller\'s');
});
