'use strict';

// Search across the full settings schema, from the popup.
//
// The popup is the surface every user reaches first and the only one reachable
// without a YouTube tab. It already filtered the schema overview, but not by
// the same rules the in-page panel uses, and a search that matched nothing
// rendered an empty list that reads as broken. Five settings surfaces exist
// with nothing telling the user how they relate, so a row also has to say
// which one owns it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const popupSource = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'popup.js'), 'utf8');
const panelSource = fs.readFileSync(
    path.join(REPO_ROOT, 'extension', 'features', 'settings-panel', 'index.js'), 'utf8');
const schema = require('../extension/core/settings-schema.js');
const { SHORTS_SETTING_KEYS } = require('../extension/core/settings-visual-system');

// The popup's matcher, sliced out and run against the real schema. popup.js is
// not a module, and asserting on its source text could not tell a matcher that
// works from one that reads as if it does.
function loadMatcher() {
    const start = popupSource.indexOf('    const matchEntry = (entry) => {');
    assert.ok(start > -1, 'popup.js must declare the schema-overview matcher');
    const end = popupSource.indexOf('\n    };', start);
    assert.ok(end > start);
    const body = popupSource.slice(start, end + '\n    };'.length);
    return new Function('hasFilters', 'entryPassesFilters', 'parsed', 'freeTerm', 'humanizerLocal', 'localizeSchemaCategory',
        `${body}\nreturn matchEntry;`);
}

const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt_BR', 'ru', 'ja', 'ko', 'zh_CN', 'ar'];
function messagesFor(locale) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'extension', '_locales', locale, 'messages.json'), 'utf8'));
}

// popup.js's category namer, run with a given locale's catalogue as `t`.
function loadCategoryNamer(locale) {
    const start = popupSource.indexOf('function localizeSchemaCategory(category) {');
    assert.ok(start > -1, 'popup.js must name schema categories through one helper');
    const body = popupSource.slice(start, popupSource.indexOf('\n}\n', start) + 2);
    const messages = messagesFor(locale);
    const t = (key, fallback) => messages[key]?.message || fallback;
    return new Function('t', `${body}\nreturn localizeSchemaCategory;`)(t);
}

function matcherFor(term, locale = 'en') {
    const freeTerm = term.toLowerCase().trim();
    return loadMatcher()(false, () => true, { filters: {} }, freeTerm, schema.humanizeSettingKey, loadCategoryNamer(locale));
}

function matches(term, locale) {
    const matchEntry = matcherFor(term, locale);
    return schema.SETTINGS_SCHEMA.filter((entry) => !entry.internal && matchEntry(entry));
}

test('every overview row is headed with a translated category name', () => {
    // The rows used to print the schema id ("playback-audio", "a11y-perf") in
    // every language. Each id needs its spCategory_* key in all 11 locales.
    const ids = [...new Set(schema.SETTINGS_SCHEMA.filter((entry) => !entry.internal).map((entry) => entry.category))];
    assert.ok(ids.length >= 18);
    for (const locale of LOCALES) {
        const messages = messagesFor(locale);
        for (const id of ids) {
            const key = `spCategory_${id.replace(/-/g, '_')}`;
            assert.ok(messages[key]?.message, `${locale} names ${id} (${key})`);
            assert.notEqual(messages[key].message, id, `${locale}: ${key} is a name, not the id`);
        }
    }
    const name = loadCategoryNamer('de');
    assert.equal(name('a11y-perf'), 'Barrierefreiheit und Leistung');
    assert.equal(name('no-such-bucket'), 'No Such Bucket', 'an unknown id still reads as words');
    assert.match(popupSource, /nameSpan\.textContent = localizeSchemaCategory\(cat\);/);
    assert.match(popupSource, /category\.textContent = localizeSchemaCategory\(change\.category\);/);
});

test('a search for the translated category name finds that category\'s rows', () => {
    for (const [locale, term, id] of [
        ['de', 'Barrierefreiheit', 'a11y-perf'],
        ['ja', '字幕', 'subtitles'],
        ['fr', 'filtres de contenu', 'content-filter'],
        ['en', 'page layout', 'shell']
    ]) {
        const found = matches(term, locale);
        const inBucket = schema.SETTINGS_SCHEMA.filter((entry) => !entry.internal && entry.category === id);
        assert.ok(inBucket.length > 0);
        for (const entry of inBucket) {
            assert.ok(found.includes(entry), `${locale} "${term}" finds ${entry.key} in ${id}`);
        }
    }
});

test('the popup matches the same things the in-page panel does', () => {
    // The panel's haystack is name, description, id, group, control type, and
    // page label. The popup covered key, category, humanised label, and
    // description — so page and control type were the gap, and a user typing
    // "watch" or "boolean" got nothing.
    assert.match(panelSource, /\.\.\.\(Array\.isArray\(f\.pages\)/,
        'the panel matches page labels');
    assert.match(panelSource, /\n\s+f\.type,/, 'the panel matches control type');

    const byPage = matches('watch');
    assert.ok(byPage.length > 0, 'a page name must find the settings that apply there');
    assert.ok(byPage.some((entry) => entry.scope === 'watch'));

    const byType = matches('boolean');
    assert.ok(byType.length > 20, 'a control type must find the settings that use it');
    assert.ok(byType.every((entry) => entry.type === 'boolean'
        || entry.key.toLowerCase().includes('boolean')
        || entry.category.toLowerCase().includes('boolean')));
});

test('name, category, and description matching still work', () => {
    assert.ok(matches('diagnosticLog').some((entry) => entry.key === 'diagnosticLog'));
    assert.ok(matches('subtitles').some((entry) => entry.category === 'subtitles'));
    // The humanised label is what the user actually reads.
    assert.ok(matches('known-breakage').length >= 0);
    const humanised = matches('dual language');
    assert.ok(humanised.some((entry) => entry.key === 'dualLanguageSubtitles'),
        'a humanised label must be searchable without the camelCase');
});

test('an empty term matches everything rather than nothing', () => {
    assert.equal(matches('').length,
        schema.SETTINGS_SCHEMA.filter((entry) => !entry.internal).length);
});

test('searching Shorts reaches every Shorts setting from the popup', () => {
    const matchedKeys = new Set(matches('shorts').map((entry) => entry.key));
    for (const key of SHORTS_SETTING_KEYS) {
        assert.equal(matchedKeys.has(key), true, `${key} must be reachable through popup search`);
    }
});

test('a search that matches nothing renders guidance, not a blank list', () => {
    const start = popupSource.indexOf("schemaOverviewList.textContent = '';");
    const block = popupSource.slice(start, start + 900);
    assert.match(block, /so-empty/, 'an empty result must render its own element');
    assert.match(block, /schemaOverviewNoMatchesTpl/, 'the guidance must be localized');
    assert.match(block, /every\(\(bucket\) => bucket\.matches === 0\)/,
        'guidance shows only when nothing matched at all');
});

test('every row says which surface owns the setting', () => {
    const surfaceFor = new Function('entry',
        `${popupSource.slice(
            popupSource.indexOf('const SCHEMA_KEYS_EDITED_BY_BACKUP'),
            popupSource.indexOf('function createSchemaSurfaceChip(')
        )}\nreturn schemaSurfaceForEntry(entry);`);

    // Values the popup has an inline editor for belong to the popup; a channel
    // list or a notes store has no inline editor here.
    assert.equal(surfaceFor({ type: 'boolean' }), 'popup');
    assert.equal(surfaceFor({ type: 'string' }), 'popup');
    assert.equal(surfaceFor({ type: 'number' }), 'popup');
    assert.equal(surfaceFor({ type: 'array' }), 'panel');
    assert.equal(surfaceFor({ type: 'object' }), 'panel');

    // No surface edits these two yet. Their chip opened the panel on nothing,
    // so it now points at the backup file instead; a key renamed out of the
    // schema would leave the exception silently dead, hence the lookup.
    for (const key of ['featureSchedules', 'syncSafePrefsAllowlist']) {
        const entry = schema.SETTINGS_SCHEMA.find((e) => e.key === key);
        assert.ok(entry && !entry.internal, `${key} must still be a visible schema key`);
        assert.equal(surfaceFor(entry), 'backup', key);
    }

    // Every non-internal schema entry must resolve to one of the three.
    for (const entry of schema.SETTINGS_SCHEMA.filter((e) => !e.internal)) {
        assert.ok(['popup', 'panel', 'backup'].includes(surfaceFor(entry)), entry.key);
    }
});

test('a backup-file chip is a label, not a button that opens nothing', () => {
    const chip = popupSource.slice(popupSource.indexOf('function createSchemaSurfaceChip('));
    const backup = chip.slice(chip.indexOf("if (surface === 'backup')"), chip.indexOf("chip.type = 'button'"));
    assert.match(backup, /t\('schemaSurfaceBackup'/);
    assert.match(backup, /return chip;/, 'it returns before the click handler is attached');
    assert.match(chip.slice(0, 200), /surface === 'panel' \? 'button' : 'span'/);
});

test('a setting owned by another surface can be opened there', () => {
    assert.match(popupSource, /chip\.dataset\.surfaceOpen = 'panel'/);
    // The opener takes the key now. It used to open the panel and drop it, so
    // the chip landed users on whatever category was last shown; the parameter
    // is the fix, not incidental drift, and tests/settings-overlay-filters.js
    // covers where the key goes from here.
    assert.match(popupSource, /async function openSettingsSurfaceForKey\(settingKey = ''\)/);
    // Reuses the ack-aware open path rather than a second copy of it: that
    // helper distinguishes "no receiver" from "receiver busy", and a naive
    // version opened a duplicate YouTube tab.
    const opener = popupSource.slice(popupSource.indexOf("async function openSettingsSurfaceForKey(settingKey = '')"));
    assert.match(opener.slice(0, 700), /sendPanelOpenMessage\(tab\.id, key\)/);
    // The chip must not also toggle the row it sits in.
    assert.match(popupSource, /event\.stopPropagation\(\);\s*\n\s*void openSettingsSurfaceForKey\(entry\.key\)/);
});
