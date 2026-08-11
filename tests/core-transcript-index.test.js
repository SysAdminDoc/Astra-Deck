'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const corePath = path.join(repoRoot, 'extension', 'core', 'transcript-index.js');
const ytkitPath = path.join(repoRoot, 'extension', 'ytkit.js');

function loadHelpers() {
    globalThis.YTKitCore = {};
    (0, eval)(fs.readFileSync(corePath, 'utf8'));
    return globalThis.YTKitCore.transcriptIndex;
}

test('transcript records normalize segment text once and carry bounded search terms', () => {
    const helpers = loadHelpers();
    const record = helpers.prepareTranscriptRecord({
        videoId: 'abcdefghijk',
        title: '  Demo\u00a0title  ',
        segments: [{ text: 'Hello\nworld' }, { text: 'hello   again' }],
        indexedAt: 10
    });
    assert.equal(record.text, 'Hello world hello again');
    assert.equal(record.title, 'Demo title');
    assert.deepEqual(record.searchTerms, ['again', 'hello', 'world']);
    assert.equal(record.indexedAt, 10);
    assert.ok(record.text.length <= helpers.MAX_TEXT_CHARS);
    assert.ok(record.searchTerms.length <= helpers.MAX_SEARCH_TERMS);
});

test('lookup chooses a selective term and phrase matching remains exact after candidate lookup', () => {
    const helpers = loadHelpers();
    assert.equal(helpers.selectLookupTerm('climate change'), 'climate');
    const record = helpers.prepareTranscriptRecord({ videoId: 'abcdefghijk', text: 'A climate policy changed.', indexedAt: 1 });
    assert.equal(helpers.matchesSearch(record, helpers.normalizeSearchQuery('climate policy')), true);
    assert.equal(helpers.matchesSearch(record, helpers.normalizeSearchQuery('policy climate')), false);
});

test('1000 by 200000 fixture yields within 2 MB and cancellation applies by the next chunk', async () => {
    const helpers = loadHelpers();
    const sharedText = 'x'.repeat(200000);
    const records = Array.from({ length: 1000 }, (_, index) => ({
        videoId: `A${String(index).padStart(10, '0')}`,
        title: `Fixture ${index}`,
        text: sharedText
    }));
    const controller = new AbortController();
    const chunks = [];
    await assert.rejects(
        () => helpers.scanTranscriptRecordsChunked(records, 'not-present', {
            signal: controller.signal,
            onChunk: (chunk) => chunks.push(chunk),
            yieldControl: async () => controller.abort()
        }),
        (error) => error?.name === 'AbortError'
    );
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].bytes <= helpers.MAX_CHUNK_BYTES);
    assert.ok(chunks[0].records > 0 && chunks[0].records < records.length);
});

test('malformed and captionless transcript records fail before an IndexedDB write', () => {
    const helpers = loadHelpers();
    assert.throws(() => helpers.prepareTranscriptRecord({ videoId: '../bad', text: 'caption' }), /Invalid transcript video id/);
    assert.throws(() => helpers.prepareTranscriptRecord({ videoId: 'abcdefghijk', text: '  ' }), /no indexable text/);
});

test('transcript index lifecycle uses the shared service, indexed lookup, and cancellation tokens', () => {
    const source = fs.readFileSync(ytkitPath, 'utf8');
    const start = source.indexOf("id: 'researchTranscriptIndex'");
    const end = source.indexOf("id: 'researchTranscriptSearchPanel'", start);
    const block = source.slice(start, end);
    assert.match(block, /TranscriptService\.fetchTranscript\(videoId, \{ signal \}\)/);
    assert.doesNotMatch(block, /ytd-transcript-segment-renderer/);
    assert.match(block, /store\.index\('byTerm'\)\.openCursor\(range\)/);
    assert.match(block, /_ingestController\?\.abort\(\)/);
    assert.match(block, /clearTimeout\(this\._ingestTimer\)/);
    assert.match(block, /generation !== this\._generation \|\| getVideoId\?\.\(\) !== videoId/);
    assert.match(block, /tx\.onerror = \(\) => \{ db\.close\(\); reject/);
});

test('search panel tokens prevent older queries from replacing newer results', () => {
    const source = fs.readFileSync(ytkitPath, 'utf8');
    const start = source.indexOf("id: 'researchTranscriptSearchPanel'");
    const end = source.indexOf("id: 'reducedMotion'", start);
    const block = source.slice(start, end);
    assert.match(block, /this\._queryController\?\.abort\(\)/);
    assert.match(block, /generation !== this\._queryGeneration/);
    assert.match(block, /Search could not read the local index\. Your data is unchanged\./);
    assert.match(block, /Clear again to confirm/);
    assert.match(block, /Could not clear the local transcript index\. Your existing data is still available\./);
});

test('transcript and local-search marking use CSS Custom Highlight with DOM fallbacks', () => {
    const source = fs.readFileSync(ytkitPath, 'utf8');
    const viewerStart = source.indexOf("id: 'transcriptViewer'");
    const viewerEnd = source.indexOf("id: 'searchFilterDefaults'", viewerStart);
    const viewer = source.slice(viewerStart, viewerEnd);
    assert.match(viewer, /document\.createRange\(\)/,
        'transcript segment marking must build text ranges');
    assert.match(viewer, /setCustomHighlight\(this\._activeHighlightName/,
        'transcript segment marking must use the Custom Highlight registry');
    assert.match(viewer, /line\.classList\.toggle\('is-active'/,
        'transcript segment marking must retain a DOM fallback');

    const searchStart = source.indexOf("id: 'researchTranscriptSearchPanel'");
    const searchEnd = source.indexOf("id: 'reducedMotion'", searchStart);
    const search = source.slice(searchStart, searchEnd);
    assert.match(search, /::highlight\(ytkit-transcript-search-match\)/,
        'transcript search must ship a named ::highlight paint rule');
    assert.match(search, /setCustomHighlight\(this\._searchHighlightName/,
        'transcript search must register ranges without wrapping matching text');
    assert.match(search, /_renderExcerptFallback/,
        'transcript search must retain a mark fallback for older browsers');
});
