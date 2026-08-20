'use strict';

// Every heading in the in-page settings tree renders through
// `t(labelKey, fallback)`. Until 2026-08-20 not one of those labelKeys existed
// in `_locales/en/messages.json`, so `t()` fell through to its English
// fallback and all 43 headings showed English in all eleven locales, however
// well the settings underneath them were translated. Nothing failed, because
// a fallback is indistinguishable from a translation at the call site.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOCALES = ['ar', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'];

function readMessages(locale) {
    return JSON.parse(fs.readFileSync(
        path.join(ROOT, 'extension', '_locales', locale, 'messages.json'), 'utf8'));
}

/** Every section labelKey declared anywhere in the shipped runtime. */
function declaredSectionKeys() {
    const sources = [
        path.join(ROOT, 'extension', 'core', 'settings-visual-system.js'),
        path.join(ROOT, 'extension', 'ytkit.js')
    ];
    const keys = new Set();
    for (const file of sources) {
        const src = fs.readFileSync(file, 'utf8');
        const re = /labelKey:\s*'(settingsSection[A-Za-z0-9]+)'/g;
        let match;
        while ((match = re.exec(src))) keys.add(match[1]);
    }
    return [...keys].sort();
}

test('every declared settings section has an English message', () => {
    const en = readMessages('en');
    const declared = declaredSectionKeys();

    assert.ok(declared.length >= 40,
        `expected the full section taxonomy, found ${declared.length}`);

    const missing = declared.filter(key => !en[key]);
    assert.deepEqual(missing, [],
        'a section heading without a message key silently renders its English fallback');
});

test('every settings section heading is translated in all ten locales', () => {
    const en = readMessages('en');
    const declared = declaredSectionKeys();

    for (const locale of LOCALES) {
        const messages = readMessages(locale);
        const missing = declared.filter(key => !messages[key]);
        assert.deepEqual(missing, [],
            `${locale} is missing section headings: ${missing.join(', ')}`);
    }
});

test('section headings that match English are declared intentional, not accidental', () => {
    // "Audio" really is "Audio" in German. The placeholder ratchet cannot tell
    // that from an untranslated string, so the policy list is what separates
    // them — and leaving a genuine miss out of it is the failure this guards.
    const { REVIEWED_EXACT_MESSAGES } = require('../scripts/i18n-policy');
    const reviewed = new Set(REVIEWED_EXACT_MESSAGES);
    const en = readMessages('en');
    const declared = declaredSectionKeys();
    const unexplained = [];

    for (const locale of LOCALES) {
        const messages = readMessages(locale);
        for (const key of declared) {
            const source = en[key]?.message;
            const translated = messages[key]?.message;
            if (source && translated === source && !reviewed.has(source)) {
                unexplained.push(`${locale}:${key} (${source})`);
            }
        }
    }

    assert.deepEqual(unexplained, [],
        'these headings equal their English source without being reviewed as intentionally identical');
});
