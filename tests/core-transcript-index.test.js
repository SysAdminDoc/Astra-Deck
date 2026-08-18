'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const corePath = path.join(repoRoot, 'extension', 'core', 'transcript-index.js');
const servicePath = path.join(repoRoot, 'extension', 'core', 'transcript-service.js');
const ytkitPath = path.join(repoRoot, 'extension', 'ytkit.js');

function loadHelpers() {
    globalThis.YTKitCore = {};
    (0, eval)(fs.readFileSync(servicePath, 'utf8'));
    (0, eval)(fs.readFileSync(corePath, 'utf8'));
    return globalThis.YTKitCore.transcriptIndex;
}

test('transcript records normalize segment text once and carry bounded search terms', () => {
    const helpers = loadHelpers();
    const record = helpers.prepareTranscriptRecord({
        videoId: 'abcdefghijk',
        title: '  Demo\u00a0title  ',
        segments: [{ text: 'Hello\nworld' }, { text: 'hello   again' }],
        indexedAt: 10,
        provenance: {
            source: 'innertube-player', language: 'en', fetchedAt: 9,
            expiresAt: 99, staleReason: 'http-403', fallbackReason: 'track-refresh'
        }
    });
    assert.equal(record.text, 'Hello world hello again');
    assert.equal(record.title, 'Demo title');
    assert.deepEqual(record.searchTerms, ['again', 'hello', 'world']);
    assert.equal(record.indexedAt, 10);
    assert.deepEqual(record.provenance, {
        source: 'innertube-player', language: 'en', fetchedAt: 9, expiresAt: 99,
        staleReason: 'http-403', fallbackReason: 'track-refresh'
    });
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

// ── Byte budget ──
// A record cap alone was never a budget: 1000 records at the 200,000-char text
// cap is ~400 MB, in a page-origin IndexedDB that storageQuotaLRU does not prune
// and the popup's chrome.storage.local measurement cannot see.

test('eviction satisfies the byte budget even when the record cap is not reached', () => {
    const helpers = loadHelpers();
    // 10 records, well under a 100-record cap, but 10x over a 1000-byte budget.
    const entries = Array.from({ length: 10 }, (_, index) => ({
        videoId: `video${String(index).padStart(6, '0')}`,
        indexedAt: 1000 + index,
        bytes: 1000
    }));

    const plan = helpers.planTranscriptEviction(entries, { maxRecords: 100, maxBytes: 1000 });
    assert.equal(plan.overByteBudget, true);
    assert.equal(plan.overRecordCap, false, 'the record cap is not what bound here');
    assert.equal(plan.keptBytes <= 1000, true, 'the plan must bring bytes under budget');
    // Oldest go first, and exactly enough of them.
    assert.deepEqual(plan.evict, entries.slice(0, 9).map((entry) => entry.videoId));
    assert.equal(plan.keptRecords, 1);
});

test('eviction still honours the record cap when bytes are tiny', () => {
    const helpers = loadHelpers();
    const entries = Array.from({ length: 12 }, (_, index) => ({
        videoId: `video${String(index).padStart(6, '0')}`,
        indexedAt: 5000 - index, // deliberately reverse order on input
        bytes: 1
    }));

    const plan = helpers.planTranscriptEviction(entries, { maxRecords: 10, maxBytes: 1024 * 1024 });
    assert.equal(plan.keptRecords, 10);
    assert.equal(plan.evict.length, 2);
    // Input order must not matter — the two OLDEST (highest index here) go.
    assert.deepEqual(plan.evict.sort(), ['video000010', 'video000011']);
});

test('eviction is deterministic when records share a timestamp', () => {
    const helpers = loadHelpers();
    // A batch import gives many records the same millisecond. Without a
    // tie-break the plan would vary run to run and the stress test below could
    // pass or fail by luck.
    const entries = Array.from({ length: 6 }, (_, index) => ({
        videoId: `video${String(index).padStart(6, '0')}`,
        indexedAt: 42,
        bytes: 100
    }));
    const first = helpers.planTranscriptEviction(entries, { maxRecords: 2, maxBytes: 1e9 });
    const shuffled = [...entries].reverse();
    const second = helpers.planTranscriptEviction(shuffled, { maxRecords: 2, maxBytes: 1e9 });
    assert.deepEqual(first.evict, second.evict);
    assert.equal(first.evict.length, 4);
});

test('a record that is alone and over budget is still kept, not evicted to nothing', () => {
    const helpers = loadHelpers();
    // Evicting the only record would lose the video the user is watching and
    // still not get under budget. The loop must stop with one left.
    const plan = helpers.planTranscriptEviction(
        [{ videoId: 'solovideoid', indexedAt: 1, bytes: 10_000 }],
        { maxRecords: 10, maxBytes: 100 }
    );
    assert.deepEqual(plan.evict, []);
    assert.equal(plan.keptRecords, 1);
    assert.equal(plan.overByteBudget, true, 'the overflow is still reported');
});

test('stress: a full index of maximum-size transcripts stays under the shipped budget', () => {
    const helpers = loadHelpers();
    // The worst case the record cap alone permits: MAX_RECORDS transcripts each
    // at the text cap. This is the ~400 MB scenario the byte budget exists for.
    const worstCaseBytes = helpers.estimateRecordBytes({
        text: 'x'.repeat(helpers.MAX_TEXT_CHARS),
        title: 'y'.repeat(200)
    });
    const entries = Array.from({ length: helpers.MAX_RECORDS }, (_, index) => ({
        videoId: `video${String(index).padStart(6, '0')}`,
        indexedAt: index,
        bytes: worstCaseBytes
    }));

    assert.ok(worstCaseBytes * helpers.MAX_RECORDS > helpers.MAX_TOTAL_BYTES,
        'the record cap alone must be capable of exceeding the byte budget, or this test proves nothing');

    const plan = helpers.planTranscriptEviction(entries);
    assert.ok(plan.keptBytes <= helpers.MAX_TOTAL_BYTES, 'the shipped defaults must bound total bytes');
    assert.ok(plan.keptRecords >= 1, 'the index must not be emptied');
    // No id appears twice, and every evicted id came from the input: an eviction
    // plan that dropped or duplicated a video would lose transcripts silently.
    assert.equal(new Set(plan.evict).size, plan.evict.length);
    const known = new Set(entries.map((entry) => entry.videoId));
    assert.ok(plan.evict.every((videoId) => known.has(videoId)));
    assert.equal(plan.keptRecords + plan.evict.length, entries.length,
        'every record is either kept or evicted — none may vanish from the accounting');
});

test('the index summary reports what the storage surfaces need', () => {
    const helpers = loadHelpers();
    const summary = helpers.summarizeTranscriptIndex([
        { videoId: 'aaaaaaaaaaa', indexedAt: 300, bytes: 100 },
        { videoId: 'bbbbbbbbbbb', indexedAt: 100, bytes: 200 },
        { videoId: 'ccccccccccc', indexedAt: 200, bytes: 300 }
    ], { maxRecords: 10, maxBytes: 1200 });

    assert.equal(summary.records, 3);
    assert.equal(summary.bytes, 600);
    assert.equal(summary.oldestIndexedAt, 100);
    assert.equal(summary.newestIndexedAt, 300);
    assert.equal(summary.recordUsage, 0.3);
    assert.equal(summary.byteUsage, 0.5);
});

test('the monolith write path enforces both caps and can report the index size', () => {
    const source = fs.readFileSync(ytkitPath, 'utf8');
    const start = source.indexOf("_DB_NAME: 'ytkit-transcript-index'");
    assert.ok(start > 0, 'the transcript index feature must exist');
    // Bound on the feature's teardown helper, which sits after every method
    // asserted below. A tighter landmark (_search) silently excluded _stats and
    // made that assertion fail for the wrong reason.
    const end = source.indexOf("            _abortIngest() {", start);
    assert.ok(end > start, 'the transcript index slice must span the whole feature');
    const block = source.slice(start, end);

    assert.match(block, /_MAX_TOTAL_BYTES: \d+ \* 1024 \* 1024/,
        'the feature must carry a byte budget, not only a record cap');
    assert.match(block, /planTranscriptEviction\(entries, \{/,
        'the write path must plan eviction through the shared helper');
    assert.match(block, /maxBytes: this\._MAX_TOTAL_BYTES/,
        'the byte budget must actually be passed to the planner');
    assert.match(block, /index\('byIndexedAt'\)\.openCursor\(\)/,
        'eviction must walk oldest-first');
    assert.ok(block.includes('async _stats()'),
        'the index must be able to report its own size');
    assert.match(block, /navigator\.storage\?\.estimate\?\.\(\)/,
        'the readout must include the browser quota estimate');
    // The just-written record must survive its own write.
    assert.match(block, /if \(videoId === prepared\.videoId\) continue;/,
        'eviction must never delete the record the write just added');
});
