'use strict';

// An empty or non-JSON 2xx body from the companion's /download yields a null
// response object. Reading `.id` off it threw a TypeError, which the enclosing
// catch rethrew into ytKitDownload's CONNECTION-error handler — so the user
// was told "Astra Downloader stopped. Starting it again…" and shown a repair
// prompt for a companion that was running fine and had simply answered with
// nothing.
//
// The correct branch (showDownloaderFailure) was already written. It was just
// unreachable.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension/features/download-ui/index.js'), 'utf8');

function downloadDispatchBlock() {
    const at = source.indexOf('Download response:');
    assert.ok(at > 0, 'the /download dispatch must exist');
    return source.slice(at, at + 1200);
}

test('a null response cannot throw on property access', () => {
    const block = downloadDispatchBlock();
    assert.match(block, /if \(resp\?\.id\)/,
        'resp.id on a null body throws into the connection-error handler');
    assert.doesNotMatch(block, /if \(resp\.id\)/);
});

test('the failure branch that handles it is still there', () => {
    const block = downloadDispatchBlock();
    assert.match(block, /showDownloaderFailure\(resp \|\| \{\}\)/,
        'an empty 2xx must reach the download-failure UI, not the restart prompt');
});

test('the restart/repair prompt is reserved for genuine connection errors', () => {
    // The restart flow is gated on _isDownloaderConnectionError and lives in
    // ytKitDownload's catch. A response-shape problem must never reach it —
    // assert on the call, not on the toast copy (which this file quotes).
    const block = downloadDispatchBlock();
    assert.doesNotMatch(block, /_isDownloaderConnectionError\(/,
        'response-shape handling must not consult the connection-error classifier');
    assert.doesNotMatch(block, /showToast\(t\('toastDlStopped'/,
        'response-shape handling must not raise the companion-restart toast');
});

test('the reason the guard exists is recorded next to it', () => {
    const block = downloadDispatchBlock();
    assert.match(block, /empty or non-JSON 2xx/i,
        'the next reader must be able to see why the optional chain is load-bearing');
});
