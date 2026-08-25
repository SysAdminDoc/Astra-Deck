'use strict';

// The transcript store's readout and its recovery path.
//
// The popup's storage figures come from chrome.storage.local, which does not
// include a page-origin IndexedDB — so the largest thing Astra Deck writes to
// disk had no readout on the one surface a user goes to for storage, and a
// store with unreadable records in it looked exactly like a large one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const popupSource = fs.readFileSync(path.join(repoRoot, 'extension', 'popup.js'), 'utf8');

// Lift the two shipped functions out and run them against stubs. Asserting on
// their source would not answer the question the acceptance asks: does a failed
// export leave the data alone.
function loadRecovery(overrides = {}) {
    const pick = (name, endMarker) => {
        const start = popupSource.indexOf(name);
        assert.ok(start > -1, `${name} must still exist`);
        const end = popupSource.indexOf(endMarker, start);
        assert.ok(end > start, `${name} must still be followed by ${endMarker}`);
        return popupSource.slice(start, end);
    };
    // From the state declaration, not from the first function: the busy flag is
    // declared above them and the closures read it.
    const body = pick('let transcriptRecoveryBusy = false;', '\nasync function renderStorageInfo() {');

    const calls = { messages: [], downloads: [], statuses: [] };
    const detail = { textContent: '' };
    const recover = { hidden: true, disabled: false };

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        Blob: class { constructor(parts) { this.parts = parts; } },
        URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
        Date,
        document: {
            createElement: () => {
                if (overrides.breakDownload) throw new Error('download blocked');
                return { click() { calls.downloads.push('clicked'); } };
            }
        },
        transcriptIndexDetail: detail,
        transcriptIndexRecover: recover,
        t: (_key, fallback) => fallback,
        formatBytes: (bytes) => `${bytes} B`,
        formatCount: (value) => String(value),
        tCount: (count, _key, one, other) => (Math.abs(Number(count)) === 1 ? one : other),
        showStatus: (message, tone) => calls.statuses.push({ message, tone }),
        failureText: (_id, error, _key, fallback) => `${fallback} (${error?.message || ''})`,
        isPersistedDataUnavailable: (error) => error?.code === 'YTKIT_PERSISTED_DATA_UNAVAILABLE',
        sendPersistedDataMessage: overrides.sendPersistedDataMessage
            || (async (message) => { calls.messages.push(message); return { response: { records: 0 }, origin: 'https://www.youtube.com' }; }),
        readAllTranscriptRecords: overrides.readAllTranscriptRecords
            || (async () => ({ records: [], origin: 'https://www.youtube.com', available: true }))
    };
    sandbox.globalThis = sandbox;

    const api = vm.runInNewContext(
        '(() => {' + body
        + 'return { renderTranscriptIndexUsage, recoverTranscriptIndex, downloadTranscriptRecovery };})()',
        sandbox
    );
    return { api, calls, detail, recover };
}

function unavailable() {
    const error = new Error('No responsive YouTube tab is available');
    error.code = 'YTKIT_PERSISTED_DATA_UNAVAILABLE';
    return error;
}

// ── the readout ──

// WHEN there is no responsive YouTube tab, the popup SHALL explain that rather
// than showing nothing. The database lives under the YouTube origin, so it can
// only be measured through a tab.
test('with no YouTube tab the readout says why', async () => {
    const { api, detail, recover } = loadRecovery({
        sendPersistedDataMessage: async () => { throw unavailable(); }
    });
    await api.renderTranscriptIndexUsage();
    assert.match(detail.textContent, /open a YouTube tab/);
    assert.equal(recover.hidden, true, 'nothing can be recovered without a tab either');
});

test('a failure that is not a missing tab reads differently', async () => {
    const { api, detail } = loadRecovery({
        sendPersistedDataMessage: async () => { throw new Error('IndexedDB is unavailable'); }
    });
    await api.renderTranscriptIndexUsage();
    assert.match(detail.textContent, /could not be measured/);
    assert.doesNotMatch(detail.textContent, /open a YouTube tab/);
});

test('an empty store says so rather than reporting zero bytes', async () => {
    const { api, detail } = loadRecovery({
        sendPersistedDataMessage: async () => ({ response: { records: 0, corrupt: 0, bytes: 0 }, origin: '' })
    });
    await api.renderTranscriptIndexUsage();
    assert.match(detail.textContent, /empty/);
});

test('a healthy store reports its size and count, and offers no recovery', async () => {
    const { api, detail, recover } = loadRecovery({
        sendPersistedDataMessage: async () => ({ response: { records: 12, corrupt: 0, bytes: 4096 }, origin: '' })
    });
    await api.renderTranscriptIndexUsage();
    assert.match(detail.textContent, /4096 B/);
    assert.match(detail.textContent, /12 videos/);
    assert.equal(recover.hidden, true, 'there is nothing to recover from');
});

// WHEN records are present but unreadable, the readout SHALL say so and the
// recovery SHALL be offered. Without the corrupt count there is no way to tell
// a large store from a broken one.
test('a malformed store is named as damaged and offers recovery', async () => {
    const { api, detail, recover } = loadRecovery({
        sendPersistedDataMessage: async () => ({ response: { records: 9, corrupt: 3, bytes: 2048 }, origin: '' })
    });
    await api.renderTranscriptIndexUsage();
    assert.match(detail.textContent, /unreadable/);
    assert.match(detail.textContent, /3/);
    assert.equal(recover.hidden, false, 'the way out has to be reachable');
});

test('one unreadable record reads as one, not as "1 videos"', async () => {
    const { api, detail } = loadRecovery({
        sendPersistedDataMessage: async () => ({ response: { records: 1, corrupt: 1, bytes: 512 }, origin: '' })
    });
    await api.renderTranscriptIndexUsage();
    assert.match(detail.textContent, /1 video,/);
});

// ── recovery ──

// WHEN recovery runs and the export succeeds, the store SHALL be cleared, and
// only then.
test('a successful export is written out and then the store is cleared', async () => {
    const cleared = [];
    const { api, calls } = loadRecovery({
        readAllTranscriptRecords: async () => ({
            records: [{ videoId: 'aaaaaaaaaaa' }, { videoId: 'bbbbbbbbbbb' }],
            origin: 'https://www.youtube.com',
            available: true
        }),
        sendPersistedDataMessage: async (message, origin) => {
            if (message.action === 'clear') cleared.push(origin);
            return { response: {}, origin: 'https://www.youtube.com' };
        }
    });

    await api.recoverTranscriptIndex();
    assert.deepEqual(calls.downloads, ['clicked'], 'the readable records must reach a file');
    assert.deepEqual(cleared, ['https://www.youtube.com'],
        'and the clear must go to the tab the export came from');
    assert.match(calls.statuses.at(-1).message, /Exported 2 readable transcripts/);
    assert.equal(calls.statuses.at(-1).tone, 'success');
});

// WHEN the export fails, NOTHING SHALL be cleared. A damaged store is the one
// case where clearing is the only way out, and also the case where whatever is
// still readable is the only copy of it.
test('a failed export clears nothing', async () => {
    const cleared = [];
    const { api, calls } = loadRecovery({
        readAllTranscriptRecords: async () => { throw new Error('export cursor failed'); },
        sendPersistedDataMessage: async (message) => {
            if (message.action === 'clear') cleared.push(message);
            return { response: {}, origin: '' };
        }
    });

    await api.recoverTranscriptIndex();
    assert.deepEqual(cleared, [], 'the store must be left exactly as it was');
    assert.deepEqual(calls.downloads, [], 'and nothing may be presented as a saved export');
    assert.match(calls.statuses.at(-1).message, /Nothing was cleared/);
    assert.equal(calls.statuses.at(-1).tone, 'error');
});

// The same rule when the file itself cannot be produced. A saved export the
// user does not actually have is worse than no export at all.
test('a download that cannot be produced clears nothing', async () => {
    const cleared = [];
    const { api, calls } = loadRecovery({
        readAllTranscriptRecords: async () => ({
            records: [{ videoId: 'aaaaaaaaaaa' }], origin: 'https://www.youtube.com', available: true
        }),
        sendPersistedDataMessage: async (message) => {
            if (message.action === 'clear') cleared.push(message);
            return { response: {}, origin: '' };
        },
        breakDownload: true
    });
    await api.recoverTranscriptIndex();
    assert.deepEqual(cleared, [], 'the store must be left exactly as it was');
    assert.deepEqual(calls.downloads, []);
    assert.match(calls.statuses.at(-1).message, /Nothing was cleared/);
});

// WHEN the tab disappears between the readout and the recovery, nothing SHALL
// be cleared and the user SHALL be told why.
test('recovery with no tab clears nothing', async () => {
    const cleared = [];
    const { api, calls } = loadRecovery({
        readAllTranscriptRecords: async () => ({ records: null, origin: '', available: false }),
        sendPersistedDataMessage: async (message) => {
            if (message.action === 'clear') cleared.push(message);
            return { response: {}, origin: '' };
        }
    });
    await api.recoverTranscriptIndex();
    assert.deepEqual(cleared, []);
    assert.deepEqual(calls.downloads, []);
    assert.match(calls.statuses.at(-1).message, /open a YouTube tab/);
});

// WHEN the clear fails after a successful export, the user SHALL be told that
// the export survived — otherwise they cannot tell whether their data is safe.
test('a failed clear still reports the export as saved', async () => {
    const { api, calls } = loadRecovery({
        readAllTranscriptRecords: async () => ({
            records: [{ videoId: 'aaaaaaaaaaa' }], origin: 'https://www.youtube.com', available: true
        }),
        sendPersistedDataMessage: async (message) => {
            if (message.action === 'clear') throw new Error('write blocked');
            return { response: {}, origin: '' };
        }
    });
    await api.recoverTranscriptIndex();
    assert.deepEqual(calls.downloads, ['clicked']);
    assert.match(calls.statuses.at(-1).message, /export was saved/);
});

// ── the plumbing behind it ──

test('the content script answers a stats request', () => {
    const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    assert.match(ytkit, /case 'stats':\s*\n\s*return persisted\.readTranscriptIndexStats\(\);/,
        'the popup cannot measure a page-origin database without asking the page');
});

test('the stats read counts what is unreadable as well as what is there', () => {
    const domains = fs.readFileSync(
        path.join(repoRoot, 'extension', 'core', 'persisted-domains.js'), 'utf8');
    const start = domains.indexOf('async function readTranscriptIndexStats(options = {}) {');
    assert.ok(start > -1, 'the stats read must exist');
    const body = domains.slice(start, domains.indexOf('\n    async function readTranscriptChunk', start));

    assert.match(body, /corrupt \+= 1;/,
        'a record that no consumer can read still occupies the quota and has to be counted');
    assert.match(body, /records \+= 1;[\s\S]{0,200}?bytes \+= estimateJsonBytes\(raw\)/,
        'and its bytes are counted from the raw value, since the clean one does not exist');
    assert.match(body, /helpers\?\.estimateRecordBytes/,
        'a readable record is measured the same way the index measures itself');
    assert.match(body, /readTranscriptIndexStats,/.test(domains) ? /readTranscriptIndexStats/ : /never/,
        'and the function has to be exported');
});
