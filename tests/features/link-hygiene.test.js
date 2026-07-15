'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const ytkit = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');

function featureBlock(id, nextId) {
    const start = ytkit.indexOf(`id: '${id}'`);
    assert.ok(start > -1, `${id} feature must exist`);
    const end = nextId ? ytkit.indexOf(`id: '${nextId}'`, start) : start + 8000;
    return ytkit.slice(start, end > start ? end : start + 8000);
}

test('cleanShareUrls delegates tracker stripping to the shared URL policy', () => {
    const block = featureBlock('cleanShareUrls', 'expandVideoWidth');
    // Copy interception must read the live selection: clipboardData.getData()
    // is empty while a copy event dispatches, so a getData-driven branch is
    // dead code (v4.49.x audit).
    assert.match(block, /window\.getSelection\?\.\(\)/);
    assert.match(block, /cleanYouTubeShareUrl\(selected\)/);
    assert.doesNotMatch(block, /clipboardData\?\.getData/);
    assert.match(block, /cleanYouTubeShareUrl\(url, \{ shortenWatch: false \}\)/);
    assert.doesNotMatch(block, /const STRIP_PARAMS/,
        'tracking policy must not drift into a second inline list');
});

test('shareMenuCleaner independently rewrites scoped redirect anchors and removes click beacons', () => {
    const block = featureBlock('shareMenuCleaner', 'autoClosePopups');
    assert.match(block, /_linkSelector: 'a\[href\*="\/redirect\?"\]'/);
    assert.match(block, /unwrapYouTubeRedirectUrl\(link\.href/);
    assert.match(block, /link\.removeAttribute\('ping'\)/);
    assert.match(block, /rel\.add\('noopener'\)/);
    assert.match(block, /rel\.add\('noreferrer'\)/);
    assert.match(block, /addScopedMutationRule\(this\.id, this\._linkSelector/);
});

test('shareMenuCleaner teardown restores href, ping, and rel exactly', () => {
    const block = featureBlock('shareMenuCleaner', 'autoClosePopups');
    assert.match(block, /_originals: null/);
    assert.match(block, /_restoreAttribute\(link, 'href', original\.href\)/);
    assert.match(block, /_restoreAttribute\(link, 'ping', original\.ping\)/);
    assert.match(block, /_restoreAttribute\(link, 'rel', original\.rel\)/);
    assert.match(block, /removeScopedMutationRule\(this\.id\)/);
});
