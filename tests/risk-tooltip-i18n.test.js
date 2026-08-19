'use strict';

// The risk badge's tooltip is built from a DYNAMIC key:
// `t('toggleRiskTooltip_' + entry.risk, ...)`.
//
// chrome.i18n message names allow only [A-Za-z0-9_]. Two of the five risk
// bands are hyphenated (`local-companion`, `store-risk`), so for those the key
// could never resolve — no matter what was added to the locale files. The
// tooltip rendered inline English in all 11 locales, and naively adding keys
// later would have silently fixed only the two unhyphenated bands.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const popupSource = fs.readFileSync(path.join(repoRoot, 'extension/popup.js'), 'utf8');
const schemaSource = fs.readFileSync(path.join(repoRoot, 'extension/core/settings-schema.js'), 'utf8');
const enMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8'));

function riskVocabulary() {
    const match = /const RISKS = Object\.freeze\(\[([^\]]+)\]\)/.exec(schemaSource);
    assert.ok(match, 'the schema must declare the risk vocabulary');
    return match[1].split(',').map(part => part.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('the dynamic tooltip key is normalized before lookup', () => {
    assert.match(popupSource, /replace\(\/-\/g, '_'\)/,
        'a hyphenated risk band can never be a chrome.i18n message name');
    assert.match(popupSource, /t\('toggleRiskTooltip_' \+ riskKeySuffix/);
});

test('every risk band in the vocabulary resolves to a real key after normalization', () => {
    const risks = riskVocabulary();
    assert.ok(risks.length >= 5, `expected the full risk vocabulary, saw ${risks.join(',')}`);
    for (const risk of risks) {
        if (risk === 'safe') continue; // safe carries no badge and no tooltip
        const key = 'toggleRiskTooltip_' + risk.replace(/-/g, '_');
        assert.ok(Object.prototype.hasOwnProperty.call(enMessages, key),
            `${risk} has no resolvable tooltip key (looked for ${key})`);
        assert.ok(String(enMessages[key].message || '').trim(), `${key} must carry copy`);
    }
});

test('no tooltip key contains a character chrome.i18n forbids', () => {
    for (const key of Object.keys(enMessages)) {
        if (!key.startsWith('toggleRiskTooltip_')) continue;
        assert.match(key, /^[A-Za-z0-9_]+$/, `${key} is not a legal chrome.i18n message name`);
    }
});

test('all ten non-EN locales carry the normalized keys', () => {
    const localeDir = path.join(repoRoot, 'extension/_locales');
    const locales = fs.readdirSync(localeDir).filter(name => name !== 'en');
    assert.ok(locales.length >= 10, `expected the shipped locale set, saw ${locales.length}`);
    for (const locale of locales) {
        const messages = JSON.parse(fs.readFileSync(path.join(localeDir, locale, 'messages.json'), 'utf8'));
        for (const risk of ['api', 'local_companion', 'experimental', 'store_risk']) {
            const key = 'toggleRiskTooltip_' + risk;
            assert.ok(Object.prototype.hasOwnProperty.call(messages, key), `${locale} is missing ${key}`);
        }
    }
});
