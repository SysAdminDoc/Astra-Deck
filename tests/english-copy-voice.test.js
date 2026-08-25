'use strict';

// The English catalog is the copy a person reads. House style bans em and en
// dashes in that prose, along with the stock AI-writing vocabulary, because
// both are the tells that make a product read as machine-written. 75 catalog
// strings and roughly the same number of code fallbacks carried a dash before
// this gate existed.
//
// Scope: the EN catalog and the code fallbacks that mirror it. Translated
// catalogs are not covered, because an em dash is ordinary typography in
// German, French and Russian, and this is an English style rule rather than a
// Unicode ban. Code comments, console lines and log output are not covered.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const en = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'
));

const DASH = /[—–]/;

function extensionJsFiles() {
    const files = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (entry.name !== '_locales') walk(full); }
            else if (full.endsWith('.js')) files.push(full);
        }
    }(path.join(repoRoot, 'extension')));
    return files;
}

test('no English message carries an em or en dash', () => {
    const offenders = Object.entries(en)
        .filter(([, entry]) => DASH.test(entry.message || ''))
        .map(([key, entry]) => `${key}: ${entry.message}`);
    assert.deepEqual(offenders, [],
        'use a period, a comma, or parentheses instead of a dash');
});

test('no English message uses a spaced hyphen as a dash', () => {
    // " - " is the ASCII stand-in for the same habit. Hyphens join compound
    // words; they do not join clauses.
    const offenders = Object.entries(en)
        .filter(([, entry]) => / - /.test(entry.message || ''))
        .map(([key, entry]) => `${key}: ${entry.message}`);
    assert.deepEqual(offenders, [], 'a spaced hyphen is a dash wearing a hat');
});

test('no English message uses the stock AI-writing vocabulary', () => {
    const BANNED = ['delve', 'leverage', 'seamless', 'seamlessly', 'elevate', 'elevated',
        'unlock', 'unlocks', 'harness', 'empower', 'streamline', 'streamlined',
        "in today's", 'at its core', 'a testament to', 'game-changer', 'best-in-class'];
    const offenders = [];
    for (const [key, entry] of Object.entries(en)) {
        const message = String(entry.message || '').toLowerCase();
        for (const word of BANNED) {
            // Word-boundary match so "unlocked" in a security sense and
            // "leverages" inside a URL do not false-trip.
            const pattern = new RegExp('(^|[^a-z])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)');
            if (pattern.test(message)) offenders.push(`${key}: ${word}`);
        }
    }
    assert.deepEqual(offenders, [], 'rewrite these in plain English');
});

// Any quote style, including a template literal, and \uXXXX escapes decoded
// before the comparison. The first version of this gate matched only
// single-quoted fallbacks and scanned the raw source for a literal dash
// character, which left two real offenders invisible: video-notes wrote its em
// dash as a `—` ESCAPE, and the wlwbRemovedRemainingTpl fallback is a
// TEMPLATE literal. Both rendered a dash at runtime while the catalog entry
// beside them had already been fixed.
const T_CALL = /\bt\(\s*'([A-Za-z0-9_]+)'\s*,\s*(['"`])([\s\S]*?)\2\s*\)/g;

function decodeEscapes(text) {
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

test('the fallback scanner can actually see every quote style and escape', () => {
    // A scanner that matches nothing passes every test it backs. Prove it
    // matches before trusting the result of the check below.
    const sample = [
        "t('aKey', 'plain single')",
        't(\'bKey\', "double quoted")',
        't(\'cKey\', `template ${x} literal`)',
        "t('dKey', 'escaped \\u2014 dash')"
    ].join('\n');
    const seen = [];
    T_CALL.lastIndex = 0;
    let match;
    while ((match = T_CALL.exec(sample))) seen.push([match[1], decodeEscapes(match[3])]);
    assert.deepEqual(seen.map((entry) => entry[0]), ['aKey', 'bKey', 'cKey', 'dKey'],
        'the scanner must reach all four quote styles');
    assert.ok(DASH.test(seen[3][1]), 'a \\u2014 escape must decode to a real dash');
    assert.ok(!DASH.test(seen[0][1]), 'and ordinary copy must not false-trip');
});

test('a code fallback never renders a dash the catalog no longer has', () => {
    const offenders = [];
    for (const file of extensionJsFiles()) {
        const source = fs.readFileSync(file, 'utf8');
        T_CALL.lastIndex = 0;
        let match;
        while ((match = T_CALL.exec(source))) {
            const [, key, , rawFallback] = match;
            if (!en[key]) continue;
            if (!DASH.test(decodeEscapes(rawFallback))) continue;
            const line = source.slice(0, match.index).split('\n').length;
            offenders.push(path.relative(repoRoot, file) + ':' + line + ' :: ' + key);
        }
    }
    assert.deepEqual(offenders, [], 'fix the fallback literal alongside the catalog entry');
});

test('no English catalog message hides a dash behind an escape', () => {
    // The catalog is JSON, so an escape there is already decoded by
    // JSON.parse and the first test would catch it. This asserts the raw file
    // too, so a hand-edited entry cannot smuggle one past a future scan that
    // reads the bytes rather than the parsed value.
    const raw = fs.readFileSync(
        path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8');
    assert.ok(!/\\u201[34]/.test(raw),
        'write the character, not an escape, so every scan can see it');
});
