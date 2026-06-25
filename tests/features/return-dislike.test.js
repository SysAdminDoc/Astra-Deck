'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, extractFeatureBlock } = require('../helpers/source');
const fs = require('fs');
const path = require('path');

test('Return Dislike feature block is reachable via the shared helper', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    assert.ok(block.length > 100,
        'returnDislike feature block must contain non-trivial source');
    assert.match(block, /name:\s*['"]Return YouTube Dislike['"]/,
        'returnDislike feature block must carry the user-facing name');
});

test('Return Dislike peeled module exports a factory function', () => {
    const modSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'extension', 'features', 'return-dislike', 'index.js'), 'utf8');
    assert.match(modSrc, /createReturnDislikeFeature/,
        'Module must export a createReturnDislikeFeature factory');
    assert.match(modSrc, /YTKitFeatures/,
        'Module must register on the YTKitFeatures namespace');
});

test('Return Dislike uses the RYD API with rate-limit budget', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    assert.match(block, /returnyoutubedislikeapi\.com/,
        'returnDislike must query the RYD API');
    assert.match(block, /_budgetWindow|_BUDGET_PER_MIN/,
        'returnDislike must enforce a per-minute request budget');
});

test('Return Dislike renders the est. caveat disclosure', () => {
    const [block] = extractFeatureBlock(sources.ytkit, 'returnDislike');
    assert.match(block, /est\.|estimate/i,
        'returnDislike must surface the estimate caveat');
});
