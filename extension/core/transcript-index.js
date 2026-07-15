(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.transcriptIndex) return;

    const SCHEMA_VERSION = 3;
    const MAX_RECORDS = 1000;
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
        return {
            videoId,
            title: normalizeTranscriptText(raw?.title || '', 200),
            text,
            searchTerms: buildSearchTerms(text),
            indexedAt: Number.isFinite(Number(raw?.indexedAt)) ? Number(raw.indexedAt) : Date.now()
        };
    }

    function matchesSearch(record, normalizedQuery) {
        if (!normalizedQuery || !record?.text) return false;
        return String(record.text).toLocaleLowerCase().includes(normalizedQuery);
    }

    function estimateRecordBytes(record) {
        return (String(record?.text || '').length * 2) + (String(record?.title || '').length * 2) + 128;
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
        scanTranscriptRecordsChunked
    });
})();
