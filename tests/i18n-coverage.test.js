'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    buildCoverageReport,
    DEFAULT_FEATURE_WARNING_BASELINE,
    emitWarnings,
    parseArgs,
    renderMarkdown
} = require('../scripts/i18n-coverage');
const {
    DO_NOT_TRANSLATE_TERMS,
    missingProtectedTerms
} = require('../scripts/i18n-policy');

function writeLocaleFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-i18n-coverage-'));
    const localesDir = path.join(root, 'extension', '_locales');
    fs.mkdirSync(path.join(localesDir, 'en'), { recursive: true });
    fs.mkdirSync(path.join(localesDir, 'de'), { recursive: true });

    const en = {
        extName: { message: 'Astra Deck' },
        settingsTitle: { message: 'Settings workspace' },
        feature_alpha_name: { message: 'Transcript Sidebar' },
        feature_alpha_desc: { message: 'Clickable transcript + export' },
        feature_sponsorBlock_name: { message: 'SponsorBlock' },
        feature_sponsorBlock_desc: { message: 'SponsorBlock' }
    };
    const de = {
        extName: { message: 'Astra Deck' },
        settingsTitle: { message: 'Settings workspace' },
        feature_alpha_name: { message: 'Transkript-Seitenleiste' },
        feature_alpha_desc: { message: 'Clickable transcript + export' },
        feature_sponsorBlock_name: { message: 'SponsorBlock' },
        feature_sponsorBlock_desc: { message: 'SponsorBlock' }
    };

    fs.writeFileSync(path.join(localesDir, 'en', 'messages.json'), JSON.stringify(en, null, 2) + '\n');
    fs.writeFileSync(path.join(localesDir, 'de', 'messages.json'), JSON.stringify(de, null, 2) + '\n');
    return { localesDir };
}

test('i18n coverage separates reviewed exact matches from placeholders', () => {
    const { localesDir } = writeLocaleFixture();
    const report = buildCoverageReport({ localesDir });
    const de = report.rows.find((row) => row.name === 'de');

    assert.equal(report.totalKeys, 6);
    assert.equal(report.featureKeys, 4);
    assert.equal(de.translated, 1);
    assert.equal(de.intentionalIdentical, 3);
    assert.equal(de.placeholderIdentical, 2);
    assert.equal(de.feature.placeholderNames, 0);
    assert.equal(de.feature.placeholderDescriptions, 1);
    assert.equal(de.feature.intentionalIdentical, 2);
    assert.deepEqual(de.feature.samples, ['feature_alpha_desc']);

    const markdown = renderMarkdown(report, { warnFeatureIdenticalAbove: 0 });
    assert.match(markdown, /Feature-Copy Proofing Queue/);
    assert.match(markdown, /feature_alpha_desc/);
    assert.match(markdown, /Feature warning threshold: more than 0/);
});

test('i18n coverage parses warning threshold and emits non-fatal warnings', () => {
    const { localesDir } = writeLocaleFixture();
    const parsed = parseArgs([
        '--locales-dir', localesDir,
        '--output', path.join(os.tmpdir(), 'i18n-report.md'),
        '--warn-feature-identical-above', '0',
        '--no-write'
    ]);
    const report = buildCoverageReport({ localesDir: parsed.localesDir });
    const captured = [];
    const originalWarn = console.warn;
    console.warn = (message) => { captured.push(message); };
    let warnings;
    try {
        warnings = emitWarnings(report, parsed.warnFeatureIdenticalAbove);
    } finally {
        console.warn = originalWarn;
    }

    assert.equal(parsed.writeReport, false);
    assert.equal(parsed.warnFeatureIdenticalAbove, 0);
    assert.deepEqual(warnings, ['de: 1 unresolved feature messages exceed threshold 0']);
    assert.deepEqual(captured, ['[i18n-coverage] WARN de: 1 unresolved feature messages exceed threshold 0']);
    assert.throws(() => parseArgs(['--wat']), /unknown argument/);
    assert.throws(() => parseArgs(['--warn-feature-identical-above', 'bad']), /non-negative integer/);
});

test('i18n policy names protected terms and detects over-translation', () => {
    assert.ok(DO_NOT_TRANSLATE_TERMS.includes('Astra Deck'));
    assert.ok(DO_NOT_TRANSLATE_TERMS.includes('SponsorBlock'));
    assert.deepEqual(
        missingProtectedTerms('Open YouTube with SponsorBlock', 'YouTube mit SponsorBlock öffnen'),
        []
    );
    assert.deepEqual(
        missingProtectedTerms('YouTube', 'Videoportal'),
        ['YouTube']
    );
});

test('i18n warning command is exposed through package scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(DEFAULT_FEATURE_WARNING_BASELINE, 582);
    assert.match(pkg.scripts['i18n:coverage:warn'] || '', /--warn-feature-identical-above 582/);
});
