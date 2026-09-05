'use strict';

// Settings-panel category copy, and the language picker's honesty.
//
// CATEGORY_META was ten hardcoded English entries against seventeen feature
// groups. Seven groups rendered with no summary, and the ten that had one
// stayed English in every locale, which is the same problem as the picker
// implying that eleven locales are eleven translations when about 30% of each
// non-English catalogue is byte-identical English.
//
// These assert the two halves that can rot independently: every group the
// registry actually declares has copy, and the number the picker shows comes
// from the coverage report rather than being typed in.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const ytkitSource = read('extension', 'ytkit.js');

/** The [group, slug, summary, description] rows declared in ytkit.js. */
function categoryCopyRows() {
    const start = ytkitSource.indexOf('const CATEGORY_COPY = [');
    assert.ok(start > 0, 'CATEGORY_COPY must exist in ytkit.js');
    const end = ytkitSource.indexOf('];', start);
    const rows = [...ytkitSource.slice(start, end)
        .matchAll(/\['([^']+)', '([^']+)', '([^']*)', '([^']*)'\]/g)]
        .map((m) => ({ group: m[1], slug: m[2], summary: m[3], description: m[4] }));
    assert.ok(rows.length > 0, 'CATEGORY_COPY must parse');
    return rows;
}

/** Every distinct `group:` a feature declares, in the monolith and the modules. */
function declaredFeatureGroups() {
    const groups = new Set();
    const pattern = /^\s+group:\s*'([^']+)'/gm;
    const files = [path.join(REPO_ROOT, 'extension', 'ytkit.js')];
    const featuresDir = path.join(REPO_ROOT, 'extension', 'features');
    for (const entry of fs.readdirSync(featuresDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const modulePath = path.join(featuresDir, entry.name, 'index.js');
        if (fs.existsSync(modulePath)) files.push(modulePath);
    }
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(source)) !== null) groups.add(match[1]);
    }
    return [...groups].sort();
}

test('every feature group the registry declares has category copy', () => {
    const rows = categoryCopyRows();
    const covered = new Set(rows.map((row) => row.group));
    const declared = declaredFeatureGroups();

    const missing = declared.filter((group) => !covered.has(group));
    assert.deepEqual(missing, [],
        `these groups would render with no summary: ${missing.join(', ')}`);

    // And nothing stale: copy for a group no feature uses is dead weight that
    // survives a rename, which is exactly how the original drifted.
    const declaredSet = new Set(declared);
    const orphaned = rows.map((row) => row.group).filter((group) => !declaredSet.has(group));
    assert.deepEqual(orphaned, [],
        `these groups have copy but no feature declares them: ${orphaned.join(', ')}`);
});

test('category copy resolves through the translation layer, not as literals', () => {
    const rows = categoryCopyRows();
    const en = JSON.parse(read('extension', '_locales', 'en', 'messages.json'));

    // The lookup itself must be a t() call, or the copy is English forever.
    assert.match(ytkitSource, /summary: t\(`categoryMeta_\$\{slug\}_summary`, summary\)/,
        'the summary must be looked up through t()');
    assert.match(ytkitSource, /description: t\(`categoryMeta_\$\{slug\}_description`, description\)/,
        'the description must be looked up through t()');

    for (const row of rows) {
        for (const suffix of ['summary', 'description']) {
            const key = `categoryMeta_${row.slug}_${suffix}`;
            assert.ok(en[key], `${key} is missing from the English catalogue`);
            assert.equal(en[key].message, row[suffix],
                `${key} must match the fallback written beside it, or the two answers disagree`);
        }
    }
});

test('the shipped coverage figures come from the coverage report', () => {
    const coverage = JSON.parse(read('extension', 'i18n-coverage.json'));
    const locales = fs.readdirSync(path.join(REPO_ROOT, 'extension', '_locales'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    assert.equal(coverage.generatedBy, 'scripts/i18n-coverage.js',
        'the file must name its generator, so nobody hand-edits it');
    assert.equal(coverage.referenceLocale, 'en');
    assert.deepEqual(Object.keys(coverage.translatedPercent).sort(), locales,
        'every shipped locale needs a figure, and no figure may name a locale that is not shipped');
    assert.equal(coverage.translatedPercent.en, 100, 'the reference locale is complete by definition');

    for (const [locale, value] of Object.entries(coverage.translatedPercent)) {
        assert.ok(Number.isInteger(value) && value >= 0 && value <= 100,
            `${locale} must carry a whole percentage, got ${value}`);
    }

    // The reference key count must match the catalogue it claims to describe,
    // or the percentages describe a tree that no longer exists.
    const enKeys = Object.keys(JSON.parse(read('extension', '_locales', 'en', 'messages.json'))).length;
    assert.equal(coverage.referenceKeys, enKeys);
});

test('the picker annotates a locale only from the generated figure', () => {
    const popupSource = read('extension', 'popup.js');

    assert.match(popupSource, /getURL\('i18n-coverage\.json'\)/,
        'the percentage must be read from the generated file');
    assert.match(popupSource, /languageCoverageTpl/,
        'the annotation must be a translatable template, not a built string');
    // A locale at 100% gets no annotation; marking English "100% translated"
    // would be noise on the one option that never needs it.
    assert.match(popupSource, /value >= 100\) continue;/,
        'a complete locale must not be annotated');
});
