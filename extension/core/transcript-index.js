(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.transcriptIndex) return;

    const SCHEMA_VERSION = 3;
    const MAX_RECORDS = 1000;
    // A record cap alone is not a budget. 1000 records x 200,000 chars x 2 bytes
    // is ~400 MB in the worst case, and this store lives in IndexedDB under the
    // page origin, which storageQuotaLRU does not prune and the popup's
    // chrome.storage.local measurement never sees. So the largest thing Astra
    // Deck writes to disk was the one thing with no visible ceiling and no
    // recovery path short of a browser-level "clear site data".
    //
    // 64 MB is deliberately far below any browser quota: the point is to evict
    // predictably long before a write can fail, not to discover the quota by
    // hitting it. At the observed median transcript size that is several
    // thousand videos, so the record cap still binds first for normal use.
    const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
    const MAX_TEXT_CHARS = 200000;
    const MAX_SEARCH_TERMS = 5000;
    const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
    const SEARCH_TERM_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;

    function createAbortError() {
        try { return new DOMException('Operation cancelled', 'AbortError'); }
        catch (_) {
            const error = new Error('Operation cancelled');
            error.name = 'AbortError';
            return error;
        }
    }

    function throwIfAborted(signal) {
        if (signal?.aborted) throw signal.reason?.name === 'AbortError' ? signal.reason : createAbortError();
    }

    function isAbortError(error) {
        return error?.name === 'AbortError';
    }

    function normalizeTranscriptText(value, maxChars = MAX_TEXT_CHARS) {
        const source = Array.isArray(value)
            ? value.map((segment) => String(segment?.text || '')).join(' ')
            : String(value || '');
        return source
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, Math.max(0, Number(maxChars) || MAX_TEXT_CHARS));
    }

    function normalizeSearchQuery(value) {
        return normalizeTranscriptText(value, 500).toLocaleLowerCase();
    }

    function buildSearchTerms(text, maxTerms = MAX_SEARCH_TERMS) {
        const terms = new Set();
        for (const match of String(text || '').toLocaleLowerCase().matchAll(SEARCH_TERM_PATTERN)) {
            const term = match[0].replace(/^[\s'’_-]+|[\s'’_-]+$/g, '');
            if (term.length < 3 || term.length > 80) continue;
            terms.add(term);
            if (terms.size >= maxTerms) break;
        }
        return [...terms].sort();
    }

    function selectLookupTerm(query) {
        const terms = buildSearchTerms(normalizeSearchQuery(query), 32);
        if (!terms.length) return '';
        return terms.sort((left, right) => right.length - left.length || left.localeCompare(right))[0];
    }

    function prepareTranscriptRecord(raw) {
        const videoId = String(raw?.videoId || '');
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid transcript video id');
        const text = normalizeTranscriptText(raw?.segments || raw?.text);
        if (!text) throw new Error('Transcript has no indexable text');
        const provenance = typeof core.sanitizeTranscriptProvenance === 'function'
            ? core.sanitizeTranscriptProvenance(raw?.provenance)
            : {
                source: 'none', language: '', fetchedAt: 0, expiresAt: 0,
                staleReason: '', fallbackReason: ''
            };
        return {
            videoId,
            title: normalizeTranscriptText(raw?.title || '', 200),
            text,
            searchTerms: buildSearchTerms(text),
            indexedAt: Number.isFinite(Number(raw?.indexedAt)) ? Number(raw.indexedAt) : Date.now(),
            provenance
        };
    }

    function matchesSearch(record, normalizedQuery) {
        if (!normalizedQuery || !record?.text) return false;
        return String(record.text).toLocaleLowerCase().includes(normalizedQuery);
    }

    function estimateRecordBytes(record) {
        return (String(record?.text || '').length * 2) + (String(record?.title || '').length * 2) + 384;
    }

    // Pure eviction planner. Takes {videoId, indexedAt, bytes} descriptors in any
    // order and returns the videoIds to delete, oldest first, so BOTH the record
    // cap and the byte budget are satisfied. Kept pure and separate from the
    // IndexedDB cursor work so the policy is testable without a database.
    function planTranscriptEviction(entries, options = {}) {
        const maxRecords = Math.max(1, Number(options.maxRecords) || MAX_RECORDS);
        const maxBytes = Math.max(1, Number(options.maxBytes) || MAX_TOTAL_BYTES);
        const sorted = (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && typeof entry.videoId === 'string' && entry.videoId)
            .map((entry) => ({
                videoId: entry.videoId,
                indexedAt: Number.isFinite(Number(entry.indexedAt)) ? Number(entry.indexedAt) : 0,
                bytes: Math.max(0, Number(entry.bytes) || 0)
            }))
            // Oldest first, then by id so the plan is deterministic when two
            // records share a timestamp (which the millisecond clock makes
            // routine for a batch import).
            .sort((a, b) => (a.indexedAt - b.indexedAt) || (a.videoId < b.videoId ? -1 : 1));

        const startingBytes = sorted.reduce((sum, entry) => sum + entry.bytes, 0);
        let totalBytes = startingBytes;
        let totalRecords = sorted.length;
        const evict = [];
        for (const entry of sorted) {
            if (totalRecords <= maxRecords && totalBytes <= maxBytes) break;
            // Never evict down to nothing. A single transcript larger than the
            // whole budget would otherwise be deleted immediately after being
            // written, leaving the index permanently empty and re-indexing the
            // same video on every visit. Report the overflow instead and let the
            // record stand — one oversized entry is bounded by MAX_TEXT_CHARS.
            if (totalRecords <= 1) break;
            evict.push(entry.videoId);
            totalRecords -= 1;
            totalBytes -= entry.bytes;
        }
        return {
            evict,
            keptRecords: totalRecords,
            keptBytes: totalBytes,
            overRecordCap: sorted.length > maxRecords,
            overByteBudget: startingBytes > maxBytes
        };
    }

    // Reporting shape for the storage-health surfaces. Separate from the planner
    // so a surface can show the budget without triggering eviction.
    function summarizeTranscriptIndex(entries, options = {}) {
        const maxRecords = Math.max(1, Number(options.maxRecords) || MAX_RECORDS);
        const maxBytes = Math.max(1, Number(options.maxBytes) || MAX_TOTAL_BYTES);
        const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
        const times = list
            .map((entry) => Number(entry.indexedAt))
            .filter((value) => Number.isFinite(value) && value > 0);
        const bytes = list.reduce((sum, entry) => sum + Math.max(0, Number(entry.bytes) || 0), 0);
        return {
            records: list.length,
            bytes,
            oldestIndexedAt: times.length ? Math.min(...times) : 0,
            newestIndexedAt: times.length ? Math.max(...times) : 0,
            maxRecords,
            maxBytes,
            recordUsage: list.length / maxRecords,
            byteUsage: bytes / maxBytes
        };
    }

    async function scanTranscriptRecordsChunked(records, query, options = {}) {
        const normalizedQuery = normalizeSearchQuery(query);
        if (normalizedQuery.length < 3) return [];
        const signal = options.signal;
        const maxChunkBytes = Math.max(65536, Math.min(MAX_CHUNK_BYTES, Number(options.maxChunkBytes) || MAX_CHUNK_BYTES));
        const maxHits = Math.max(1, Math.min(200, Number(options.maxHits) || 200));
        const yieldControl = typeof options.yieldControl === 'function'
            ? options.yieldControl
            : () => new Promise((resolve) => setTimeout(resolve, 0));
        const onChunk = typeof options.onChunk === 'function' ? options.onChunk : () => {};
        const hits = [];
        let chunkBytes = 0;
        let chunkRecords = 0;
        for (const record of records || []) {
            throwIfAborted(signal);
            const recordBytes = Math.min(maxChunkBytes, estimateRecordBytes(record));
            if (chunkRecords && chunkBytes + recordBytes > maxChunkBytes) {
                onChunk({ bytes: chunkBytes, records: chunkRecords });
                await yieldControl();
                throwIfAborted(signal);
                chunkBytes = 0;
                chunkRecords = 0;
            }
            chunkBytes += recordBytes;
            chunkRecords += 1;
            if (matchesSearch(record, normalizedQuery)) hits.push(record);
            if (hits.length >= maxHits) break;
        }
        if (chunkRecords) onChunk({ bytes: chunkBytes, records: chunkRecords });
        return hits;
    }

    core.transcriptIndex = Object.freeze({
        SCHEMA_VERSION,
        MAX_RECORDS,
        MAX_TOTAL_BYTES,
        MAX_TEXT_CHARS,
        MAX_SEARCH_TERMS,
        MAX_CHUNK_BYTES,
        createAbortError,
        throwIfAborted,
        isAbortError,
        normalizeTranscriptText,
        normalizeSearchQuery,
        buildSearchTerms,
        selectLookupTerm,
        prepareTranscriptRecord,
        matchesSearch,
        estimateRecordBytes,
        planTranscriptEviction,
        summarizeTranscriptIndex,
        scanTranscriptRecordsChunked
    });
})();
