#!/usr/bin/env node
'use strict';

// Export unresolved feature-copy locale placeholders into translator-ready CSV
// files. Generated output goes under build/ by default and is not committed.

const fs = require('fs');
const path = require('path');

const {
    isFeatureMessageKey,
    isIntentionallyIdenticalMessage
} = require('./i18n-policy');

const REPO_ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(REPO_ROOT, 'extension', '_locales');
const OUTPUT_DIR = path.join(REPO_ROOT, 'build', 'i18n-proofing');

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function messageOf(entry) {
    if (!entry || typeof entry !== 'object') return '';
    return typeof entry.message === 'string' ? entry.message : '';
}

function readLocale(localesDir, locale) {
    return JSON.parse(fs.readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8'));
}

function listLocales(localesDir) {
    return fs.readdirSync(localesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

function parseArgs(argv = process.argv.slice(2), repoRoot = REPO_ROOT) {
    const args = {
        localesDir: path.join(repoRoot, 'extension', '_locales'),
        outputDir: path.join(repoRoot, 'build', 'i18n-proofing'),
        locales: []
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--locales-dir') {
            i += 1;
            if (!argv[i]) throw new Error('--locales-dir requires a path');
            args.localesDir = path.resolve(argv[i]);
        } else if (arg === '--output-dir') {
            i += 1;
            if (!argv[i]) throw new Error('--output-dir requires a path');
            args.outputDir = path.resolve(argv[i]);
        } else if (arg === '--locale') {
            i += 1;
            if (!argv[i]) throw new Error('--locale requires a locale code');
            args.locales.push(argv[i]);
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    return args;
}

function featureKind(key) {
    return key.endsWith('_desc') ? 'description' : 'name';
}

function buildProofingQueue({ localesDir = LOCALES_DIR, locales = [] } = {}) {
    const available = listLocales(localesDir);
    if (!available.includes('en')) {
        throw new Error('_locales/en/messages.json is required as the reference locale');
    }

    const selected = locales.length ? locales : available.filter((locale) => locale !== 'en');
    for (const locale of selected) {
        if (locale === 'en') {
            throw new Error('en is the reference locale and cannot be exported for proofing');
        }
        if (!available.includes(locale)) {
            throw new Error(`unknown locale: ${locale}`);
        }
    }

    const en = readLocale(localesDir, 'en');
    const featureKeys = Object.keys(en).filter(isFeatureMessageKey).sort();
    const localeReports = selected.map((locale) => {
        const messages = readLocale(localesDir, locale);
        const entries = [];
        for (const key of featureKeys) {
            const english = messageOf(en[key]);
            const current = messageOf(messages[key]);
            const hasKey = Object.prototype.hasOwnProperty.call(messages, key);
            const status = hasKey ? 'placeholder' : 'missing';
            if (hasKey && (current !== english || isIntentionallyIdenticalMessage(english))) {
                continue;
            }
            entries.push({
                locale,
                key,
                kind: featureKind(key),
                status,
                english,
                current,
                proposedTranslation: '',
                notes: ''
            });
        }
        return {
            locale,
            total: entries.length,
            entries
        };
    });

    return {
        schemaVersion: 1,
        referenceLocale: 'en',
        featureKeyCount: featureKeys.length,
        totalEntries: localeReports.reduce((sum, locale) => sum + locale.total, 0),
        locales: localeReports
    };
}

function csvSafeValue(value) {
    const text = String(value ?? '');
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvEscape(value) {
    const text = csvSafeValue(value);
    if (!/[",\r\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function renderCsv(entries) {
    const headers = [
        'locale',
        'key',
        'kind',
        'status',
        'english',
        'current',
        'proposed_translation',
        'notes'
    ];
    const lines = [headers.join(',')];
    for (const entry of entries) {
        lines.push([
            entry.locale,
            entry.key,
            entry.kind,
            entry.status,
            entry.english,
            entry.current,
            entry.proposedTranslation,
            entry.notes
        ].map(csvEscape).join(','));
    }
    return `${lines.join('\n')}\n`;
}

function renderReadme(report) {
    const lines = [];
    lines.push('# Astra Deck i18n Proofing Export');
    lines.push('');
    lines.push('Generated by `npm run i18n:proofing-export`.');
    lines.push('');
    lines.push(`Reference locale: ${report.referenceLocale}`);
    lines.push(`Feature keys scanned: ${report.featureKeyCount}`);
    lines.push(`Total proofing entries: ${report.totalEntries}`);
    lines.push('');
    lines.push('Fill `proposed_translation` and `notes`, then port accepted strings into `scripts/generate-locales.js` or the hand-maintained zh_CN locale file.');
    lines.push('');
    lines.push('| Locale | Entries | CSV |');
    lines.push('| --- | ---:| --- |');
    for (const locale of report.locales) {
        lines.push(`| ${locale.locale} | ${locale.total} | ${locale.locale}.csv |`);
    }
    lines.push('');
    return lines.join('\n');
}

function writeProofingExport(report, outputDir = OUTPUT_DIR) {
    fs.mkdirSync(outputDir, { recursive: true });
    const written = [];
    const summaryPath = path.join(outputDir, 'index.json');
    fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    written.push(summaryPath);

    const readmePath = path.join(outputDir, 'README.md');
    fs.writeFileSync(readmePath, renderReadme(report), 'utf8');
    written.push(readmePath);

    for (const locale of report.locales) {
        const csvPath = path.join(outputDir, `${locale.locale}.csv`);
        fs.writeFileSync(csvPath, renderCsv(locale.entries), 'utf8');
        written.push(csvPath);
    }
    return written;
}

function printSummary(report, written, repoRoot = REPO_ROOT) {
    console.log(`[i18n-proofing] exported ${report.totalEntries} entries across ${report.locales.length} locale(s)`);
    for (const locale of report.locales) {
        console.log(`  ${locale.locale.padEnd(8)} ${String(locale.total).padStart(4)} entries`);
    }
    for (const filePath of written) {
        console.log(`  wrote ${toPosix(path.relative(repoRoot, filePath))}`);
    }
}

function printHelp() {
    console.log([
        'Usage: node scripts/export-i18n-proofing.js [options]',
        '',
        'Options:',
        '  --locales-dir <path>   Locale directory to scan',
        '  --output-dir <path>    Output directory (default: build/i18n-proofing)',
        '  --locale <code>        Export one locale; repeat for multiple locales',
        '  -h, --help             Show this help'
    ].join('\n'));
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) {
        printHelp();
        return;
    }
    const report = buildProofingQueue({
        localesDir: options.localesDir,
        locales: options.locales
    });
    const written = writeProofingExport(report, options.outputDir);
    printSummary(report, written);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error('[i18n-proofing]', err.message || err);
        process.exit(1);
    }
}

module.exports = {
    buildProofingQueue,
    csvSafeValue,
    parseArgs,
    renderCsv,
    renderReadme,
    writeProofingExport
};
