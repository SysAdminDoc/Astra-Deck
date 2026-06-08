'use strict';

// Regression coverage for the extraction of TranscriptService
// out of the ytkit.js monolith and into extension/core/transcript-service.js.
//
// The factory module is loaded by faking the document_idle content_script
// load order: prime globalThis.YTKitCore from core/storage.js conventions,
// then require() the file (which auto-registers via the IIFE).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const corePath = path.join(repoRoot, 'extension', 'core', 'transcript-service.js');
const ytkitPath = path.join(repoRoot, 'extension', 'ytkit.js');
const manifestPath = path.join(repoRoot, 'extension', 'manifest.json');

function loadFactoryIntoFreshGlobal() {
    // Pretend we're at content-script load time: YTKitCore namespace exists,
    // earlier core/* modules have attached their exports.
    globalThis.YTKitCore = {};
    const src = fs.readFileSync(corePath, 'utf8');
    // The module is an IIFE that mutates globalThis.YTKitCore — eval it.
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    if (typeof globalThis.YTKitCore.createTranscriptService !== 'function') {
        throw new Error('createTranscriptService not attached to YTKitCore');
    }
    return globalThis.YTKitCore.createTranscriptService;
}

test('createTranscriptService exposes the legacy API surface used by ytkit.js call sites', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({
        getVideoId: () => 'abc',
        showToast: () => {},
        getPlayerResponseGlobal: () => null,
        extensionFetchJson: async () => ({ response: { status: 200 }, data: {} }),
        extensionFetchText: async () => ({ text: '' })
    });
    assert.equal(typeof svc.downloadTranscript, 'function');
    assert.equal(typeof svc._getCaptionTracks, 'function');
    assert.equal(typeof svc._selectBestTrack, 'function');
    assert.equal(typeof svc._fetchTranscriptContent, 'function');
    assert.equal(typeof svc._formatTranscript, 'function');
    assert.equal(typeof svc._extractFromPlayerResponse, 'function');
    assert.equal(typeof svc.config, 'object');
    assert.deepEqual(svc.config.preferredLanguages, ['en', 'en-US', 'en-GB']);
});

test('downloadTranscript fails cleanly when no video id is in scope', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const toasts = [];
    const svc = createTranscriptService({
        getVideoId: () => null,
        showToast: (msg, color) => toasts.push({ msg, color }),
        getPlayerResponseGlobal: () => null,
        extensionFetchJson: async () => ({ response: { status: 200 }, data: {} }),
        extensionFetchText: async () => ({ text: '' })
    });
    const result = await svc.downloadTranscript();
    assert.equal(result.success, false);
    assert.equal(result.error, 'No video ID');
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].msg, 'No video ID found');
});

test('_selectBestTrack scores manual EN above autogen', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    const tracks = [
        { languageCode: 'en', kind: 'asr', name: 'English (auto)' },
        { languageCode: 'en', kind: 'manual', name: 'English' },
        { languageCode: 'es', kind: 'manual', name: 'Spanish' }
    ];
    const best = svc._selectBestTrack(tracks);
    assert.equal(best.kind, 'manual');
    assert.equal(best.languageCode, 'en');
});

test('_formatTimestamp formats hours when ms >= 1h, MM:SS otherwise', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    assert.equal(svc._formatTimestamp(0), '00:00');
    assert.equal(svc._formatTimestamp(65_000), '01:05');
    assert.equal(svc._formatTimestamp(3_725_000), '01:02:05');
});

test('Innertube API method requires a page-derived API key', async () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    let fetchCalled = false;
    const svc = createTranscriptService({
        extensionFetchJson: async () => {
            fetchCalled = true;
            return { response: { status: 200 }, data: {} };
        }
    });

    await assert.rejects(
        () => svc._method2_InnertubeAPI('abc123'),
        /Innertube API key unavailable/
    );
    assert.equal(fetchCalled, false);
});

test('_sanitizeFilename strips fs-unsafe chars and clamps length', () => {
    const createTranscriptService = loadFactoryIntoFreshGlobal();
    const svc = createTranscriptService({});
    assert.equal(svc._sanitizeFilename('hello: <world>?'), 'hello_world');
    assert.equal(svc._sanitizeFilename(''), 'untitled');
    assert.ok(svc._sanitizeFilename('x'.repeat(200)).length <= 120);
});

test('manifest.json loads core/transcript-service.js BEFORE ytkit.js in both content_script blocks', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const isoBlocks = manifest.content_scripts.filter(b => b.world === 'ISOLATED');
    assert.ok(isoBlocks.length >= 2, 'expected at least two ISOLATED content_script entries');
    for (const block of isoBlocks) {
        const idxTranscript = block.js.indexOf('core/transcript-service.js');
        const idxYtkit = block.js.indexOf('ytkit.js');
        assert.notEqual(idxTranscript, -1, 'core/transcript-service.js missing from content_scripts.js');
        assert.notEqual(idxYtkit, -1, 'ytkit.js missing from content_scripts.js');
        assert.ok(idxTranscript < idxYtkit, 'core/transcript-service.js must load before ytkit.js');
    }
});

test('ytkit.js no longer declares the inline `const TranscriptService = {` block', () => {
    const src = fs.readFileSync(ytkitPath, 'utf8');
    // The line that USED to start the 446-line inline block.
    assert.equal(src.includes("const TranscriptService = {\n        config: {\n            preferredLanguages:"), false,
        'inline TranscriptService block still present in ytkit.js — extraction is incomplete');
    // Conversely, the factory instantiation must be present.
    assert.ok(src.includes('createTranscriptService('),
        'ytkit.js should instantiate TranscriptService via the factory');
});
