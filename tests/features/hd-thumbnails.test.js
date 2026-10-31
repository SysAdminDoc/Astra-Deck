'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature } = require('../helpers/monolith');

const HQ = 'https://i.ytimg.com/vi/GvgqDSnpRQM/hqdefault.jpg?sqp=abc&rs=def';
const MAXRES = 'https://i.ytimg.com/vi/GvgqDSnpRQM/maxresdefault.jpg?sqp=abc&rs=def';

function setup(imgs) {
    const seen = [];
    const feature = loadFeature('thumbnailQualityUpgrade', {
        document: {
            querySelectorAll(selector) {
                seen.push(selector);
                return imgs;
            }
        }
    });
    return { feature, seen };
}

const image = (src = HQ) => ({ src, dataset: {}, naturalWidth: 0, onload: null, onerror: null });

test('lockup thumbnails are part of the upgrade', () => {
    const { feature, seen } = setup([]);
    feature._upgradeAll();
    assert.match(seen[0], /yt-thumbnail-view-model img/);
});

test('a real maxres image stays', () => {
    const img = image();
    const { feature } = setup([img]);
    feature._upgradeAll();
    assert.equal(img.src, MAXRES);
    img.naturalWidth = 1280;
    img.onload();
    assert.equal(img.src, MAXRES);
    assert.equal(img.onload, null);
    assert.equal(img.onerror, null);
});

test('the gray placeholder YouTube sends for a missing maxres falls back to the original', () => {
    const img = image();
    const { feature } = setup([img]);
    feature._upgradeAll();
    img.naturalWidth = 120;
    img.onload();
    assert.equal(img.src, HQ);
    assert.equal(img.onload, null);
    assert.equal(img.onerror, null);
});

test('a failed load falls back to the original', () => {
    const img = image();
    const { feature } = setup([img]);
    feature._upgradeAll();
    img.onerror();
    assert.equal(img.src, HQ);
    assert.equal(img.onload, null);
});

test('a row that fell back is not tried again on the next pass', () => {
    const img = image();
    const { feature } = setup([img]);
    feature._upgradeAll();
    img.naturalWidth = 120;
    img.onload();
    feature._upgradeAll();
    assert.equal(img.src, HQ);
});

test('a recycled image holding another video gets its own try', () => {
    const img = image();
    const { feature } = setup([img]);
    feature._upgradeAll();
    img.naturalWidth = 120;
    img.onload();
    img.src = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    feature._upgradeAll();
    assert.equal(img.src, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
});
