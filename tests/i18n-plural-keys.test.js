'use strict';

// tCount(count, 'key', singular, plural) reads key + 'One' or key + 'Other'.
// Those names are built at runtime, so extract-i18n-keys never sees them and a
// missing pair falls back to English in every locale without any gate
// noticing. This parses every extension script, finds each tCount call and
// requires both halves of its pair in all 11 catalogues.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const extensionRoot = path.join(__dirname, '..', 'extension');
const localesRoot = path.join(extensionRoot, '_locales');

function scripts(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== '_locales') scripts(full, out);
        else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

function pluralCalls(file) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('tCount(')) return [];
    const found = [];
    (function walk(node) {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'tCount') {
            const key = node.arguments[1];
            found.push({
                key: key?.type === 'Literal' && typeof key.value === 'string' ? key.value : null,
                line: source.slice(0, node.start).split('\n').length
            });
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value.type === 'string') walk(value);
        }
    })(acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }));
    return found.map((call) => ({ ...call, file: path.relative(extensionRoot, file) }));
}

test('every tCount key has its One and Other messages in every catalogue', () => {
    const calls = scripts(extensionRoot).flatMap(pluralCalls);
    assert.ok(calls.length >= 10, `only ${calls.length} tCount calls found; the scan has gone blind`);
    const dynamic = calls.filter((call) => call.key === null);
    assert.deepEqual(dynamic, [], 'a tCount key must be a string literal so it can be checked');

    const locales = fs.readdirSync(localesRoot);
    assert.equal(locales.length, 11);
    const missing = [];
    for (const locale of locales) {
        const catalogue = JSON.parse(fs.readFileSync(path.join(localesRoot, locale, 'messages.json'), 'utf8'));
        for (const { key, file, line } of calls) {
            for (const suffix of ['One', 'Other']) {
                if (!catalogue[key + suffix]?.message) missing.push(`${locale}: ${key}${suffix} (${file}:${line})`);
            }
        }
    }
    assert.deepEqual(missing, []);
});
