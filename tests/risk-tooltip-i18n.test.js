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
const enMessages = JSON.parse(fs.readFileSync(path.join(repoRoot, 'extension/_locales/en/messages.json'), 'utf8'));

// The real risk vocabulary, from the module that owns it.
const { RISKS } = require('../extension/core/settings-schema.js');

/**
 * The tooltip statement out of popup.js, run for one risk band.
 *
 * Recomputing `risk.replace(/-/g, '_')` in the test would prove only that the
 * TEST can normalize a hyphen — production could switch to stripping the
 * hyphen, or drop the normalization again, and the test would still pass
 * because it never asked production what key it looks up. So the statement
 * itself is lifted out, and `t` records the key it is handed.
 */
function tooltipFor(risk) {
    const at = popupSource.indexOf('const riskKeySuffix =');
    assert.ok(at > 0, 'the tooltip statement must exist');
    const close = popupSource.indexOf("span.setAttribute('aria-label', span.title);", at);
    assert.ok(close > at, 'and end where the accessible name is set');
    const body = popupSource.slice(at, close);

    const asked = [];
    const span = { title: null };
    new Function('entry', 'span', 't', body)(
        { risk },
        span,
        (key, fallback) => { asked.push(key); return fallback; },
    );
    return { key: asked[0], title: span.title };
}

test('the key the tooltip looks up is legal for every band in the vocabulary', () => {
    assert.ok(RISKS.length >= 5, `expected the full risk vocabulary, saw ${RISKS.join(',')}`);
    for (const risk of RISKS) {
        const { key } = tooltipFor(risk);
        assert.match(key, /^toggleRiskTooltip_[A-Za-z0-9_]+$/,
            `${risk} builds "${key}", which chrome.i18n can never resolve`);
    }
    // The two that were broken, named so a regression says which.
    assert.equal(tooltipFor('local-companion').key, 'toggleRiskTooltip_local_companion');
    assert.equal(tooltipFor('store-risk').key, 'toggleRiskTooltip_store_risk');
});

test('every risk band in the vocabulary resolves to a real key with real copy', () => {
    for (const risk of RISKS) {
        if (risk === 'safe') continue; // safe carries no badge and no tooltip
        const { key } = tooltipFor(risk);
        assert.ok(Object.prototype.hasOwnProperty.call(enMessages, key),
            `${risk} has no resolvable tooltip key (looked for ${key})`);
        assert.ok(String(enMessages[key].message || '').trim(), `${key} must carry copy`);
    }
});

test('an unlocalized band still says something, and never renders "undefined"', () => {
    // A band added to the schema before its copy lands must degrade to a
    // readable line rather than to a blank or a literal "undefined".
    const { title } = tooltipFor('some-new-band');
    assert.ok(String(title || '').trim(), 'the tooltip must not be empty');
    assert.doesNotMatch(String(title), /undefined/);
    assert.match(String(title), /some-new-band/, 'and should name the band it could not describe');

    for (const risk of RISKS) {
        if (risk === 'safe') continue; // carries no badge, so no tooltip renders
        const { title } = tooltipFor(risk);
        assert.ok(String(title || '').trim(), `${risk} must have an inline English tooltip`);
        assert.doesNotMatch(String(title), /undefined/);
        // The generic line is the safety net for a band nobody has written
        // copy for yet. A band that IS in the vocabulary has to describe what
        // it means, or the badge tells the user nothing they did not already
        // see on the badge itself.
        assert.doesNotMatch(String(title), /^Risk band: /,
            `${risk} is in the shipped vocabulary and needs copy of its own`);
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
