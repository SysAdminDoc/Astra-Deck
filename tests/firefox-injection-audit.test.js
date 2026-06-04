'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const { scanFirefoxInjectionApis } = require('../scripts/check-firefox-injection.js');

test('Firefox injection pre-flight gate is wired into npm run check', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.match(
        pkg.scripts.check,
        /node scripts\/check-firefox-injection\.js/,
        'npm run check must include the Firefox programmatic-injection pre-flight gate'
    );
});

test('Firefox injection pre-flight finds no extension executeScript call sites', () => {
    assert.deepEqual(scanFirefoxInjectionApis(REPO_ROOT), []);
});

test('Firefox executeScript audit note records the zero-call-site result', () => {
    const doc = fs.readFileSync(
        path.join(REPO_ROOT, 'docs', 'firefox-executescript-preflight.md'),
        'utf8'
    );
    assert.match(doc, /Firefox 149/);
    assert.match(doc, /Firefox 152/);
    assert.match(doc, /0 call sites/);
    assert.match(doc, /node scripts\/check-firefox-injection\.js/);
    assert.match(doc, /moz-extension:\/\//);
});
