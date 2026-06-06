'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    buildProofingQueue,
    csvSafeValue,
    parseArgs,
    renderCsv,
    writeProofingExport
} = require('../scripts/export-i18n-proofing');

function writeLocaleFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-i18n-proofing-'));
    const localesDir = path.join(root, 'extension', '_locales');
    fs.mkdirSync(path.join(localesDir, 'en'), { recursive: true });
    fs.mkdirSync(path.join(localesDir, 'de'), { recursive: true });
    fs.mkdirSync(path.join(localesDir, 'fr'), { recursive: true });

    const en = {
        feature_alpha_name: { message: 'Transcript Sidebar' },
        feature_alpha_desc: { message: 'Clickable transcript + export' },
        feature_beta_name: { message: 'SponsorBlock' },
        feature_beta_desc: { message: 'Needs "quotes", commas' },
        plainKey: { message: 'Not a feature key' }
    };
    const de = {
        feature_alpha_name: { message: 'Transcript Sidebar' },
        feature_alpha_desc: { message: 'Transkript öffnen und exportieren' },
        feature_beta_name: { message: 'SponsorBlock' },
        feature_beta_desc: { message: 'Needs "quotes", commas' },
        plainKey: { message: 'Not a feature key' }
    };
    const fr = {
        feature_alpha_name: { message: 'Barre de transcription' },
        feature_alpha_desc: { message: 'Clickable transcript + export' },
        feature_beta_name: { message: 'SponsorBlock' },
        plainKey: { message: 'Not a feature key' }
    };

    fs.writeFileSync(path.join(localesDir, 'en', 'messages.json'), JSON.stringify(en, null, 2) + '\n');
    fs.writeFileSync(path.join(localesDir, 'de', 'messages.json'), JSON.stringify(de, null, 2) + '\n');
    fs.writeFileSync(path.join(localesDir, 'fr', 'messages.json'), JSON.stringify(fr, null, 2) + '\n');
    return { root, localesDir };
}

test('i18n proofing export lists unresolved feature placeholders only', () => {
    const { localesDir } = writeLocaleFixture();
    const report = buildProofingQueue({ localesDir });
    const de = report.locales.find((locale) => locale.locale === 'de');
    const fr = report.locales.find((locale) => locale.locale === 'fr');

    assert.equal(report.featureKeyCount, 4);
    assert.deepEqual(de.entries.map((entry) => entry.key), [
        'feature_alpha_name',
        'feature_beta_desc'
    ]);
    assert.deepEqual(fr.entries.map((entry) => `${entry.key}:${entry.status}`), [
        'feature_alpha_desc:placeholder',
        'feature_beta_desc:missing'
    ]);
    assert.equal(report.totalEntries, 4);
});

test('i18n proofing export renders CSV and writes per-locale files', () => {
    const { root, localesDir } = writeLocaleFixture();
    const report = buildProofingQueue({ localesDir, locales: ['de'] });
    const csv = renderCsv(report.locales[0].entries);
    const outputDir = path.join(root, 'out');
    const written = writeProofingExport(report, outputDir);

    assert.match(csv, /"Needs ""quotes"", commas"/);
    assert.ok(fs.existsSync(path.join(outputDir, 'index.json')));
    assert.ok(fs.existsSync(path.join(outputDir, 'README.md')));
    assert.ok(fs.existsSync(path.join(outputDir, 'de.csv')));
    assert.equal(written.length, 3);
});

test('i18n proofing export neutralizes spreadsheet formulas in CSV cells', () => {
    const csv = renderCsv([{
        locale: 'de',
        key: 'feature_formula_name',
        kind: 'name',
        status: 'placeholder',
        english: '=IMPORTXML("https://example.test")',
        current: '+cmd',
        proposedTranslation: '-todo',
        notes: '@review'
    }]);

    assert.equal(csvSafeValue('=SUM(1,1)'), "'=SUM(1,1)");
    assert.match(csv, /"'=IMPORTXML\(""https:\/\/example\.test""\)"/);
    assert.match(csv, /'\+cmd/);
    assert.match(csv, /'-todo/);
    assert.match(csv, /'@review/);
});

test('i18n proofing export parses strict CLI options and package script', () => {
    const { localesDir } = writeLocaleFixture();
    const outputDir = path.join(os.tmpdir(), 'proofing-out');
    const parsed = parseArgs([
        '--locales-dir', localesDir,
        '--output-dir', outputDir,
        '--locale', 'de',
        '--locale', 'fr'
    ]);
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    assert.deepEqual(parsed.locales, ['de', 'fr']);
    assert.equal(parsed.outputDir, outputDir);
    assert.match(pkg.scripts['i18n:proofing-export'] || '', /scripts\/export-i18n-proofing\.js/);
    assert.throws(() => parseArgs(['--locale']), /requires a locale code/);
    assert.throws(() => parseArgs(['--unknown']), /unknown argument/);
});
