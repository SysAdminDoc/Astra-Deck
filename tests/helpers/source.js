'use strict';

// Shared source-loading helpers for per-area feature tests.
//
// The monolithic `tests/hardening.test.js` reads
// `extension/ytkit.js`, `extension/popup.js`, `extension/popup.html`,
// `extension/background.js` at top level. Per-area tests (DeArrow,
// SponsorBlock, Theater Split, …) re-use those same loads — having one
// canonical helper keeps the per-area files thin and avoids each new
// area silently caching a stale snapshot of the source.
//
// Usage:
//   const test = require('node:test');
//   const assert = require('node:assert/strict');
//   const { sources, extractFeatureBlock } = require('./helpers/source');
//   const block = extractFeatureBlock(sources.ytkit, 'sponsorBlock');

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const extensionRoot = path.join(repoRoot, 'extension');

function readUtf8(...segments) {
    return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

const sources = Object.freeze({
    ytkit: readUtf8('extension', 'ytkit.js'),
    popup: readUtf8('extension', 'popup.js'),
    popupHtml: readUtf8('extension', 'popup.html'),
    background: readUtf8('extension', 'background.js'),
    userscript: readUtf8('YTKit.user.js'),
});

const config = Object.freeze({
    repoRoot,
    extensionRoot,
    defaultSettings: JSON.parse(readUtf8('extension', 'default-settings.json')),
    settingsMeta: JSON.parse(readUtf8('extension', 'settings-meta.json')),
    manifest: JSON.parse(readUtf8('extension', 'manifest.json')),
});

/**
 * Extract the source-text block corresponding to a feature object
 * literal so per-area tests don't have to compute start/end indices.
 * Returns a tuple `[block, startIndex, endIndex]`.
 *
 * Lookup is the same primitive both `hardening.test.js` and the new
 * per-area test files use: find ``id: 'featureId'`` and slice until the
 * NEXT ``id: '…'`` in the features array.
 */
function extractFeatureBlock(source, featureId) {
    const needle = `id: '${featureId}'`;
    const start = source.indexOf(needle);
    if (start === -1) {
        throw new Error(`extractFeatureBlock: feature '${featureId}' not found`);
    }
    // Find the next `id: '…'` after this one; if none, fall back to
    // a fixed 8000-char window so the helper still returns something
    // useful for the last feature in the array.
    const after = source.indexOf("id: '", start + needle.length);
    const end = after === -1 ? Math.min(source.length, start + 8000) : after;
    return [source.slice(start, end), start, end];
}

module.exports = {
    sources,
    config,
    extractFeatureBlock,
};
