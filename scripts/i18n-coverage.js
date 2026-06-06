#!/usr/bin/env node
'use strict';

// scripts/i18n-coverage.js - locale coverage and feature proofing report.
//
// check-i18n.js enforces structural parity: every EN key is present in every
// non-EN locale, and no locale ships orphan keys. This report focuses on
// content depth: how much copy differs from EN, which exact brand/technical
// terms are intentionally unchanged, and which feature name/description strings
// still need native-speaker proofing.

const fs = require('fs');
const path = require('path');

const {
    DO_NOT_TRANSLATE_TERMS,
    isFeatureMessageKey,
    isIntentionallyIdenticalMessage
} = require('./i18n-policy');

const REPO_ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(REPO_ROOT, 'extension', '_locales');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'i18n-coverage.md');
const SAMPLE_LIMIT = 8;
const DEFAULT_FEATURE_WARNING_BASELINE = 582;

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function readLocale(localesDir, name) {
    const filePath = path.join(localesDir, name, 'messages.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listLocales(localesDir) {
    return fs.readdirSync(localesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
}

function messageOf(entry) {
    if (!entry || typeof entry !== 'object') return '';
    return typeof entry.message === 'string' ? entry.message : '';
}

function pct(numerator, denominator) {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 1000) / 10;
}

function parseNonNegativeInt(raw, flag) {
    if (!/^\d+$/.test(String(raw))) {
        throw new Error(`${flag} must be a non-negative integer`);
    }
    return Number(raw);
}

function parseArgs(argv = process.argv.slice(2), repoRoot = REPO_ROOT) {
    const args = {
        localesDir: path.join(repoRoot, 'extension', '_locales'),
        reportPath: path.join(repoRoot, 'docs', 'i18n-coverage.md'),
        warnFeatureIdenticalAbove: null,
        writeReport: true
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--locales-dir') {
            i += 1;
            if (!argv[i]) throw new Error('--locales-dir requires a path');
            args.localesDir = path.resolve(argv[i]);
        } else if (arg === '--output') {
            i += 1;
            if (!argv[i]) throw new Error('--output requires a path');
            args.reportPath = path.resolve(argv[i]);
        } else if (arg === '--warn-feature-identical-above') {
            i += 1;
            args.warnFeatureIdenticalAbove = parseNonNegativeInt(argv[i], arg);
        } else if (arg === '--no-write') {
            args.writeReport = false;
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    return args;
}

function analyzeLocale(name, en, locale, enKeys) {
    const row = {
        name,
        translated: 0,
        intentionalIdentical: 0,
        placeholderIdentical: 0,
        missing: 0,
        feature: {
            translated: 0,
            intentionalIdentical: 0,
            placeholderNames: 0,
            placeholderDescriptions: 0,
            missingNames: 0,
            missingDescriptions: 0,
            samples: []
        }
    };

    for (const key of enKeys) {
        const enMsg = messageOf(en[key]);
        const locHasKey = Object.prototype.hasOwnProperty.call(locale, key);
        const locMsg = messageOf(locale[key]);
        const featureKey = isFeatureMessageKey(key);
        const isDescription = key.endsWith('_desc');

        if (!locHasKey) {
            row.missing += 1;
            if (featureKey && isDescription) row.feature.missingDescriptions += 1;
            else if (featureKey) row.feature.missingNames += 1;
            continue;
        }

        if (locMsg !== enMsg) {
            row.translated += 1;
            if (featureKey) row.feature.translated += 1;
            continue;
        }

        if (isIntentionallyIdenticalMessage(enMsg)) {
            row.intentionalIdentical += 1;
            if (featureKey) row.feature.intentionalIdentical += 1;
            continue;
        }

        row.placeholderIdentical += 1;
        if (featureKey) {
            if (isDescription) row.feature.placeholderDescriptions += 1;
            else row.feature.placeholderNames += 1;
            if (row.feature.samples.length < SAMPLE_LIMIT) {
                row.feature.samples.push(key);
            }
        }
    }
    return row;
}

function buildCoverageReport({ localesDir = LOCALES_DIR } = {}) {
    const locales = listLocales(localesDir);
    if (!locales.includes('en')) {
        throw new Error('_locales/en/messages.json is required as the reference locale');
    }

    const en = readLocale(localesDir, 'en');
    const enKeys = Object.keys(en);
    const featureKeys = enKeys.filter(isFeatureMessageKey);
    const rows = locales
        .filter((name) => name !== 'en')
        .map((name) => analyzeLocale(name, en, readLocale(localesDir, name), enKeys))
        .map((row) => ({
            ...row,
            translatedPct: pct(row.translated, enKeys.length),
            intentionalPct: pct(row.intentionalIdentical, enKeys.length),
            placeholderPct: pct(row.placeholderIdentical, enKeys.length),
            missingPct: pct(row.missing, enKeys.length),
            feature: {
                ...row.feature,
                placeholderTotal: row.feature.placeholderNames + row.feature.placeholderDescriptions,
                translatedPct: pct(row.feature.translated, featureKeys.length)
            }
        }));

    return {
        referenceLocale: 'en',
        totalKeys: enKeys.length,
        featureKeys: featureKeys.length,
        rows
    };
}

function renderMarkdown(report, options = {}) {
    const lines = [];
    const threshold = options.warnFeatureIdenticalAbove;
    const protectedTerms = DO_NOT_TRANSLATE_TERMS.map((term) => `\`${term}\``).join(', ');

    lines.push('# Astra Deck - i18n Coverage');
    lines.push('');
    lines.push('Auto-generated by `node scripts/i18n-coverage.js` (or `npm run i18n:coverage`). Do not hand-edit.');
    lines.push('');
    lines.push(`Reference locale: **${report.referenceLocale}** (${report.totalKeys} keys; ${report.featureKeys} feature name/description keys).`);
    lines.push('');
    lines.push('| Locale | Translated | Intentional identical | Placeholder identical | Missing | Coverage |');
    lines.push('| --- | ---:| ---:| ---:| ---:| ---:|');
    for (const r of report.rows) {
        lines.push(
            `| ${r.name} | ${r.translated} (${r.translatedPct}%) | ${r.intentionalIdentical} (${r.intentionalPct}%) | ${r.placeholderIdentical} (${r.placeholderPct}%) | ${r.missing} (${r.missingPct}%) | ${r.translatedPct.toFixed(1)}% |`
        );
    }
    lines.push('');
    lines.push('## Feature-Copy Proofing Queue');
    lines.push('');
    lines.push('The queue below lists `feature_*_(name|desc)` messages that still match EN after excluding exact reviewed do-not-translate messages. These rows are the native-speaker proofing backlog.');
    lines.push('');
    lines.push('| Locale | Identical names | Identical descriptions | Total unresolved | Reviewed exact matches | Sample keys |');
    lines.push('| --- | ---:| ---:| ---:| ---:| --- |');
    for (const r of report.rows) {
        const sample = r.feature.samples.length ? r.feature.samples.join(', ') : 'None';
        lines.push(
            `| ${r.name} | ${r.feature.placeholderNames} | ${r.feature.placeholderDescriptions} | ${r.feature.placeholderTotal} | ${r.feature.intentionalIdentical} | ${sample} |`
        );
    }
    lines.push('');
    lines.push('Reviewed exact do-not-translate messages:');
    lines.push('');
    lines.push(protectedTerms);
    lines.push('');
    lines.push('## Warning Mode');
    lines.push('');
    if (Number.isInteger(threshold)) {
        lines.push(`Feature warning threshold: more than ${threshold} unresolved feature messages per locale.`);
    } else {
        lines.push(`Run \`node scripts/i18n-coverage.js --warn-feature-identical-above ${DEFAULT_FEATURE_WARNING_BASELINE}\` to warn when a locale exceeds the current unresolved feature-copy baseline.`);
    }
    lines.push('');
    lines.push('## Reading the Columns');
    lines.push('');
    lines.push('- **Translated** - keys whose value is different from the EN message.');
    lines.push('- **Intentional identical** - keys whose EN value is an exact reviewed brand or technical term that should stay unchanged.');
    lines.push('- **Placeholder identical** - keys that still ship byte-identical to EN and need translation review unless intentionally added to the reviewed list.');
    lines.push('- **Missing** - keys absent from the locale file. `chrome.i18n.getMessage` will fall through to EN for these.');
    lines.push('- **Coverage** - same as the Translated percentage; restated as the headline number.');
    lines.push('');
    lines.push('## How to Improve Coverage');
    lines.push('');
    lines.push('1. Open `scripts/generate-locales.js` and find the locale\'s `T[\'<locale>\']` translation table.');
    lines.push('2. Add entries mapping English messages to translated messages. Preserve the exact reviewed brand and technical terms above.');
    lines.push('3. Re-run `node scripts/generate-locales.js` to rewrite `extension/_locales/<locale>/messages.json`.');
    lines.push('4. Re-run `node scripts/i18n-coverage.js` to refresh this report and review the feature-copy queue.');
    lines.push('5. For zh_CN, the locale is hand-maintained outside the generator; edit `extension/_locales/zh_CN/messages.json` directly.');
    lines.push('');

    return lines.join('\n');
}

function printSummary(report, reportPath, repoRoot = REPO_ROOT) {
    console.log(`[i18n-coverage] wrote ${toPosix(path.relative(repoRoot, reportPath))} - ${report.rows.length} locale(s) profiled against ${report.totalKeys} EN keys`);
    for (const r of report.rows) {
        console.log(
            `  ${r.name.padEnd(8)}  ${r.translatedPct.toFixed(1).padStart(5)}% translated  (` +
            `${r.placeholderIdentical} placeholder-identical, ${r.intentionalIdentical} intentional-identical, ${r.missing} missing; ` +
            `${r.feature.placeholderTotal} feature placeholders)`
        );
    }
}

function emitWarnings(report, threshold) {
    if (!Number.isInteger(threshold)) return [];
    const warnings = [];
    for (const r of report.rows) {
        if (r.feature.placeholderTotal > threshold) {
            warnings.push(`${r.name}: ${r.feature.placeholderTotal} unresolved feature messages exceed threshold ${threshold}`);
        }
    }
    for (const warning of warnings) {
        console.warn(`[i18n-coverage] WARN ${warning}`);
    }
    return warnings;
}

function printHelp() {
    console.log([
        'Usage: node scripts/i18n-coverage.js [options]',
        '',
        'Options:',
        '  --locales-dir <path>                 Locale directory to scan',
        '  --output <path>                      Markdown report path',
        '  --warn-feature-identical-above <n>   Warn when unresolved feature copy exceeds n',
        '  --no-write                           Analyze without writing the report',
        '  -h, --help                           Show this help'
    ].join('\n'));
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        printHelp();
        return;
    }
    const report = buildCoverageReport({ localesDir: options.localesDir });
    const markdown = renderMarkdown(report, options);
    if (options.writeReport) {
        fs.writeFileSync(options.reportPath, `${markdown}\n`, 'utf8');
        printSummary(report, options.reportPath, REPO_ROOT);
    } else {
        console.log(`[i18n-coverage] analyzed ${report.rows.length} locale(s) against ${report.totalKeys} EN keys`);
    }
    emitWarnings(report, options.warnFeatureIdenticalAbove);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[i18n-coverage]', err.message || err);
        process.exit(1);
    }
}

module.exports = {
    analyzeLocale,
    buildCoverageReport,
    DEFAULT_FEATURE_WARNING_BASELINE,
    emitWarnings,
    parseArgs,
    renderMarkdown
};
