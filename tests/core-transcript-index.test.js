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

// ── what a record actually costs ──

// WHEN a record's byte estimate is taken, it SHALL include the search terms it
// stores and the multiEntry index rows built over them. estimateRecordBytes
// counted text and title only, and that estimate is what MAX_TOTAL_BYTES is
// compared against — so the budget whose stated purpose is to evict "long
// before a write can fail" read low, by the most on the records costing most.
test('the byte estimate counts the search terms and their index rows', () => {
    const index = loadHelpers();
    const text = 'alpha bravo charlie delta echo foxtrot golf hotel india juliett';
    const record = index.prepareTranscriptRecord({ videoId: 'aaaaaaaaaaa', text, title: 'A title' });

    assert.ok(record.searchTerms.length >= 10, 'the fixture must actually produce terms');
    const bytes = index.estimateRecordBytes(record);
    const withoutTerms = (record.text.length * 2) + (record.title.length * 2) + 384;
    assert.ok(bytes > withoutTerms,
        `the estimate (${bytes}) must exceed text + title + overhead (${withoutTerms})`);

    // Exactly the term cost, not merely more than nothing.
    assert.equal(bytes - withoutTerms, index.estimateSearchTermBytes(record.searchTerms));
    // And that cost is BOTH copies: the array on the record, and one multiEntry
    // index row per term carrying the 11-character primary key.
    assert.equal(index.estimateSearchTermBytes(['abcd']), (4 * 2) + ((4 * 2) + 22 + 32),
        'dropping either copy halves the estimate for the records that cost most');
    assert.equal(index.estimateSearchTermBytes([]), 0);
});

test('the same text with more distinct terms estimates larger', () => {
    const index = loadHelpers();
    const repeated = new Array(200).fill('alpha').join(' ');
    const varied = Array.from({ length: 200 }, (_, i) => `word${i}zzz`).join(' ');
    const dull = index.prepareTranscriptRecord({ videoId: 'aaaaaaaaaaa', text: repeated });
    const rich = index.prepareTranscriptRecord({ videoId: 'bbbbbbbbbbb', text: varied });

    assert.ok(rich.searchTerms.length > dull.searchTerms.length);
    assert.ok(index.estimateRecordBytes(rich) > index.estimateRecordBytes(dull),
        'a transcript with 200 distinct terms costs more index than one with 1, and the estimate must say so');
});

test('a record with no terms still estimates its text', () => {
    const index = loadHelpers();
    const bytes = index.estimateRecordBytes({ text: 'hello there', title: '', searchTerms: undefined });
    assert.equal(bytes, ('hello there'.length * 2) + 384);
});

// ── which transcripts the term index cannot answer for ──

// WHEN a transcript has more distinct terms than the cap, the record SHALL say
// so. buildSearchTermIndex fills in document order and stops at the cap, so
// what it drops is the END of a long transcript: a query matching only the tail
// found nothing through byTerm, and nothing said why.
test('a transcript past the term cap is marked as partially indexed', () => {
    const index = loadHelpers();
    const many = Array.from({ length: 40 }, (_, i) => `term${i}xx`).join(' ');
    const truncated = index.buildSearchTermIndex(many, 10);
    assert.equal(truncated.terms.length, 10);
    assert.equal(truncated.truncated, true);

    const complete = index.buildSearchTermIndex('alpha bravo charlie', 10);
    assert.equal(complete.truncated, false, 'a transcript that fits is not partial');

    // Exactly at the cap with nothing left over is not truncation either.
    const exact = index.buildSearchTermIndex('alpha bravo charlie', 3);
    assert.equal(exact.terms.length, 3);
    assert.equal(exact.truncated, false,
        'stopping because the text ran out is not the same as stopping because the cap did');

    // A repeat past the cap is already stored, so it is not a dropped term.
    const repeatsPastCap = index.buildSearchTermIndex('alpha bravo charlie alpha alpha', 3);
    assert.equal(repeatsPastCap.truncated, false);
});

test('the truncation flag reaches the stored record', () => {
    const index = loadHelpers();
    const small = index.prepareTranscriptRecord({ videoId: 'aaaaaaaaaaa', text: 'alpha bravo charlie' });
    assert.equal(small.searchTermsTruncated, false);
    assert.ok(Array.isArray(small.searchTerms));

    // Past the real cap, through the real entry point. A fixture that only
    // exercises the false case cannot tell the flag from a hardcoded false.
    const overCap = Array.from({ length: index.MAX_SEARCH_TERMS + 50 }, (_, i) => 'w' + i + 'zz').join(' ');
    const big = index.prepareTranscriptRecord({ videoId: 'bbbbbbbbbbb', text: overCap });
    assert.equal(big.searchTerms.length, index.MAX_SEARCH_TERMS);
    assert.equal(big.searchTermsTruncated, true,
        'the tail of this transcript is not in the term index and the record has to say so');
});

test('buildSearchTerms still returns the plain array its callers expect', () => {
    const index = loadHelpers();
    const terms = index.buildSearchTerms('charlie alpha bravo');
    assert.ok(Array.isArray(terms));
    assert.deepEqual(terms, ['alpha', 'bravo', 'charlie'], 'sorted, deduped, unchanged');
});

// ── the search path, for the transcripts the term index cannot answer for ──

// WHEN a transcript's term set was cut short, a search SHALL still find text in
// its tail. `_search` looked up through the byTerm index only, so a query
// matching only the end of a 200,000-character transcript returned nothing and
// said nothing about why.
test('the transcript search falls back to reading truncated records', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const start = source.indexOf('            async _searchTruncatedRecords(');
    assert.ok(start > -1, 'the fallback must exist');
    const end = source.indexOf('\n            async _search(query, options = {})', start);
    assert.ok(end > start);
    const block = source.slice(start, end);

    assert.match(block, /scanTranscriptRecordsChunked/,
        'reading several 200,000-character transcripts must not hold the main thread');
    assert.match(block, /partialIndex: true/,
        'a hit found this way has to be distinguishable from one the index answered');
    assert.match(block, /ids\.filter\(\(videoId\) => !seen\.has\(videoId\)\)/,
        'a record the term index already matched must not be read again');

    // The term-index pass still runs first, and its result feeds the fallback.
    const searchStart = source.indexOf('            async _search(query, options = {})');
    const searchEnd = source.indexOf('\n            // Reports what the index is actually costing', searchStart);
    const searchBlock = source.slice(searchStart, searchEnd);
    assert.match(searchBlock, /const indexed = await new Promise/);
    assert.match(searchBlock, /resolve\(\{ hits, seen \}\)/);
    assert.match(searchBlock, /this\._searchTruncatedRecords\(normalizedQuery, indexed\.seen, options\)/);
    assert.match(searchBlock, /if \(indexed\.hits\.length >= 200\) return indexed\.hits;/,
        'a full page of hits does not need the fallback at all');
});

// WHEN the store is written to, cleared, or migrated, the cached list of
// truncated records SHALL be dropped. It is derived once per session because it
// only changes on those three paths — and if it is not dropped there, the
// fallback searches a list that is no longer true.
test('every path that changes the store invalidates the truncated-record cache', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');

    const put = source.slice(source.indexOf('            async _put(record, options = {})'));
    assert.match(put.slice(0, 900), /this\._truncatedIds = null;/,
        'indexing a transcript can create or remove a truncated record');

    const clear = source.slice(source.indexOf('            async _clear() {'));
    assert.match(clear.slice(0, 400), /this\._truncatedIds = null;/,
        'clearing the store leaves nothing to fall back to');

    const migrateAt = source.indexOf('if (await this._readSchemaMarker(db) >= helpers.SCHEMA_VERSION) return;');
    assert.ok(migrateAt > -1, 'the schema migration must still be here');
    assert.match(source.slice(migrateAt, migrateAt + 400), /this\._truncatedIds = null;/,
        'the migration rewrites records, so the derived list stops being true');
});
