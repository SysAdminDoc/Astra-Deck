'use strict';

// The screenshots themselves need two browsers and run through
// `npm run visual:popup`. These cover the parts a wrong answer would hide in:
// the comparison, which must fail when pixels change, and the paths baselines
// are read from.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const {
    baselinePath,
    compareImages,
    parseArgs,
    statePath,
    STATES,
    stillExpression,
    VIEWPORT
} = require('../scripts/visual-popup.js');

function image(width, height, paint = () => [30, 30, 30, 255]) {
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            const [r, g, b, a] = paint(x, y);
            png.data[offset] = r;
            png.data[offset + 1] = g;
            png.data[offset + 2] = b;
            png.data[offset + 3] = a;
        }
    }
    return PNG.sync.write(png);
}

test('identical images compare as the same', async () => {
    const result = await compareImages(image(100, 100), image(100, 100));
    assert.equal(result.ok, true);
    assert.equal(result.diffPixels, 0);
});

test('a block of changed pixels fails and comes with a diff image', async () => {
    const changed = image(100, 100, (x, y) => (x < 20 && y < 20 ? [240, 240, 240, 255] : [30, 30, 30, 255]));
    const result = await compareImages(changed, image(100, 100));
    assert.equal(result.ok, false);
    assert.equal(result.diffPixels, 400);
    assert.match(result.reason, /400 pixels differ/);
    const diff = PNG.sync.read(result.diffPng);
    assert.equal(diff.width, 100);
});

test('one stray pixel stays inside the tolerance on a page-sized image', async () => {
    const speck = image(420, 600, (x, y) => (x === 5 && y === 5 ? [240, 240, 240, 255] : [30, 30, 30, 255]));
    const result = await compareImages(speck, image(420, 600));
    assert.equal(result.ok, true);
    assert.equal(result.diffPixels, 1);
});

test('a repainted control fails on its own, with the rest of the image unchanged', async () => {
    // The light-theme picker went from a dark gray to a pale one, which is this size of jump.
    const repainted = image(100, 100, () => [233, 237, 243, 255]);
    const result = await compareImages(repainted, image(100, 100, () => [72, 74, 78, 255]));
    assert.equal(result.ok, false);
});

test('a size change fails without pretending to have a diff', async () => {
    const result = await compareImages(image(100, 120), image(100, 100));
    assert.equal(result.ok, false);
    assert.match(result.reason, /size changed from 100x100 to 100x120/);
    assert.equal(result.diffPng, null);
    assert.equal(result.diffPixels, null);
});

test('options parse, and a wrong one stops the run', () => {
    assert.deepEqual(parseArgs([]), { update: false, only: '', browser: '', firefox: '', geckodriver: '' });
    assert.equal(parseArgs(['--update']).update, true);
    assert.equal(parseArgs(['--only', 'firefox']).only, 'firefox');
    assert.equal(parseArgs(['--browser', 'x.exe']).browser, 'x.exe');
    assert.throws(() => parseArgs(['--only', 'safari']), /chromium or firefox/);
    assert.throws(() => parseArgs(['--browser']), /needs a value/);
    assert.throws(() => parseArgs(['--nope']), /Unknown option/);
});

test('every state has a baseline for both browsers on the platform that recorded them', () => {
    for (const browser of ['chromium', 'firefox']) {
        for (const state of STATES) {
            const file = baselinePath(browser, state.name, 'win32');
            assert.ok(fs.existsSync(file), `${path.basename(file)} should be committed`);
            const png = PNG.sync.read(fs.readFileSync(file));
            assert.equal(png.width, VIEWPORT.width);
            assert.ok(png.height > 1500, `${path.basename(file)} should show the whole popup, not one screenful`);
        }
    }
    const versions = JSON.parse(fs.readFileSync(path.join(path.dirname(baselinePath('x', 'x', 'win32')), 'versions.json'), 'utf8'));
    assert.ok(versions.chromium && versions.firefox, 'the browser versions behind the baselines should be on record');
});

test('state URLs carry the theme and locale the fixture reads', () => {
    assert.equal(statePath({ theme: 'light', locale: '' }), '/popup-a11y.html?theme=light');
    assert.equal(statePath({ theme: 'dark', locale: 'ar' }), '/popup-a11y.html?theme=dark&locale=ar');
});

test('the still sheet goes in as a constructed sheet, since the popup CSP refuses a style element', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8');
    assert.match(html, /style-src 'self'/, 'this test exists because of that policy');
    const expression = stillExpression();
    assert.match(expression, /adoptedStyleSheets/);
    assert.doesNotMatch(expression, /createElement\('style'\)/);
});
