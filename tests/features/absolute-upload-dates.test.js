'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');

function featureBlock(id, nextId) {
    const start = source.indexOf(`id: '${id}'`);
    assert.ok(start > -1, `${id} feature must exist`);
    const end = source.indexOf(`id: '${nextId}'`, start);
    assert.ok(end > start, `${nextId} feature must follow ${id}`);
    return source.slice(start, end);
}

test('precise watch metadata displays exact locale date and available time', () => {
    const block = featureBlock('preciseViewCounts', 'videoScreenshot');
    assert.match(block, /liveBroadcastDetails\?\.startTimestamp/);
    assert.match(block, /formatAbsoluteYouTubeDate\?\.\(value\)/);
    assert.match(block, /className = 'ytkit-exact-upload-date'/);
    assert.match(block, /setAttribute\('aria-label'/);
});

test('precise watch metadata restores native counts and removes exact dates on teardown', () => {
    const block = featureBlock('preciseViewCounts', 'videoScreenshot');
    assert.match(block, /ytkitPreciseOriginal/);
    assert.match(block, /document\.querySelectorAll\('\[data-ytkit-precise\]'\)/);
    assert.match(block, /this\._dateEl\?\.remove\(\)/);
});

test('video age cards expose approximate absolute dates without destroying native teardown state', () => {
    const block = featureBlock('videoAgeColors', 'watchPageTabs');
    assert.match(block, /parseRelativeYouTubeAge/);
    assert.match(block, /formatApproximateYouTubeDate/);
    assert.match(block, /`≈ \$\{absoluteText\}`/);
    assert.match(block, /ytkitOriginalDateText/);
    assert.match(block, /originalText} → \$\{dateEl\.dataset\.ytkitAbsoluteDate/);
    assert.match(block, /document\.querySelectorAll\('\[data-ytkit-absolute-date\]'\)/);
});
