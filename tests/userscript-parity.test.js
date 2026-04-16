'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const userscriptSource = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');

test('userscript metadata and watch guards support youtu.be routes', () => {
    assert.match(userscriptSource, /^\/\/ @match\s+https:\/\/youtu\.be\/\*/m);
    assert.doesNotMatch(userscriptSource, /location\.pathname\s*!==?\s*'\/watch'/);
    assert.match(userscriptSource, /\bisWatchPagePath\(\)/);
});

test('userscript comment handle revealer deduplicates requests and aborts on teardown', () => {
    assert.match(userscriptSource, /_pendingAuthors:\s*null/);
    assert.match(userscriptSource, /signal:\s*this\._abortController\?\.signal/);
    assert.match(userscriptSource, /this\._abortController\?\.abort\(\);\s*this\._abortController = null;/);
});

test('userscript hardens blank-target navigation and CPU tamer cleanup', () => {
    assert.match(userscriptSource, /function setSafeBlankTarget\(anchor\)/);
    assert.match(userscriptSource, /anchor\.rel = 'noopener noreferrer';/);
    assert.match(userscriptSource, /function openExternalWindow\(url\)/);
    assert.match(userscriptSource, /_pumpInterval:\s*null/);
    assert.match(userscriptSource, /this\._pumpInterval = origSetInterval\(/);
    assert.match(userscriptSource, /clearInterval\.call\(window,\s*this\._pumpInterval\)/);
});
