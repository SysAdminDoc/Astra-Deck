'use strict';

// The English catalog is the copy a person reads. House style bans em and en
// dashes in that prose, along with the stock AI-writing vocabulary, because
// both are the tells that make a product read as machine-written. 75 catalog
// strings and roughly the same number of code fallbacks carried a dash before
// this gate existed.
//
// Scope: the EN catalog and the code fallbacks that mirror it. Translated
// catalogs are not covered — an em dash is ordinary typography in German,
// French and Russian, and this is an English style rule, not a Unicode ban.
// Code comments, console lines and log output are not covered either.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const en = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'extension', '_locales', 'en', 'messages.json'), 'utf8'
));

const DASH = /[—–]/;

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
        'in today\'s', 'at its core', 'a testament to', 'game-changer', 'best-in-class'];
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

test('a code fallback never disagrees with the catalog entry it names', () => {
    // `t('someKey', 'fallback')` renders the fallback only when i18n has not
    // loaded, so a divergent fallback means the user sees different copy
    // depending on timing. It is also how the dashes survived the last sweep:
    // the catalog was fixed and the literal beside it was not.
    const files = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { if (entry.name !== '_locales') walk(full); }
            else if (full.endsWith('.js')) files.push(full);
        }
    }(path.join(repoRoot, 'extension')));

    const offenders = [];
    // Only single-quoted fallbacks with no interpolation are comparable; a
    // template literal legitimately differs from the {token} form.
    const CALL = /\bt\(\s*'([A-Za-z0-9_]+)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        let match;
        CALL.lastIndex = 0;
        while ((match = CALL.exec(source))) {
            const [, key, rawFallback] = match;
            if (!en[key]) continue;
            const fallback = rawFallback.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
            if (DASH.test(fallback)) {
                offenders.push(path.relative(repoRoot, file) + ' :: ' + key + ' fallback carries a dash');
            }
        }
    }
    assert.deepEqual(offenders, [], 'fix the fallback literal alongside the catalog');
});
