#!/usr/bin/env node
'use strict';

// Ratchet for user-visible literals that predate the locale system. Existing
// debt is fingerprinted per file; adding or changing a literal at a UI sink
// fails until the copy is routed through t()/data-i18n. Intentional static
// technical copy can use an adjacent `i18n-static: reason` comment.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isIntentionallyIdenticalMessage } = require('./i18n-policy');

const REPO_ROOT = path.join(__dirname, '..');
const EXTENSION_DIR = path.join(REPO_ROOT, 'extension');
const BASELINE_PATH = path.join(__dirname, 'i18n-ui-copy-baseline.json');
const JS_SINKS = Object.freeze([
    { name: 'assignment', re: /\b(textContent|innerText|placeholder|title|ariaLabel|ariaDescription)\s*=\s*/g },
    { name: 'property', re: /(?:^|[,{]\s*)(name|description|label|copy|emptyText|buttonLabel|placeholder|title)\s*:\s*/gm },
    { name: 'feedback', re: /\b(showToast|showStatus|setStatus|alert|confirm|prompt)\s*\(\s*/g },
    { name: 'attribute', re: /\.setAttribute\(\s*(['"])(aria-label|aria-description|title|placeholder)\1\s*,\s*/g }
]);

function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

function collectFiles(dir, extensions, files = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) collectFiles(fullPath, extensions, files);
        else if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(fullPath);
    }
    return files;
}

function readLiteralAt(source, start) {
    let index = start;
    while (/\s/.test(source[index] || '')) index += 1;
    const quote = source[index];
    if (!['\'', '"', '`'].includes(quote)) return null;
    const valueStart = index + 1;
    index = valueStart;
    let escaped = false;
    while (index < source.length) {
        const char = source[index];
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) {
            return { raw: source.slice(valueStart, index), start: valueStart - 1, end: index + 1 };
        }
        index += 1;
    }
    return null;
}

function isCandidateText(raw) {
    const text = String(raw || '').trim();
    return text.length > 0 && /\p{L}/u.test(text) && !isIntentionallyIdenticalMessage(text);
}

function isSuppressed(source, literalStart) {
    const lineStart = source.lastIndexOf('\n', literalStart - 1) + 1;
    const previousLineStart = source.lastIndexOf('\n', Math.max(0, lineStart - 2)) + 1;
    return /i18n-static:\s*\S+/i.test(source.slice(previousLineStart, literalStart));
}

function collectJsLiterals(source) {
    const findings = [];
    for (const sink of JS_SINKS) {
        sink.re.lastIndex = 0;
        let match;
        while ((match = sink.re.exec(source)) !== null) {
            const literal = readLiteralAt(source, sink.re.lastIndex);
            if (!literal || !isCandidateText(literal.raw) || isSuppressed(source, literal.start)) continue;
            const sinkName = sink.name === 'attribute' ? match[2] : match[1];
            findings.push({ sink: `${sink.name}:${sinkName || ''}`, value: literal.raw });
        }
    }
    return findings;
}

function collectHtmlLiterals(source) {
    const findings = [];
    const directText = /<([a-z][\w-]*)([^>]*)>([^<]+)<\/\1>/gi;
    let match;
    while ((match = directText.exec(source)) !== null) {
        const attrs = match[2];
        const text = match[3].trim();
        if (attrs.includes('data-i18n=') || !isCandidateText(text) || isSuppressed(source, match.index)) continue;
        findings.push({ sink: `html-text:${match[1].toLowerCase()}`, value: text });
    }

    const tag = /<([a-z][\w-]*)([^>]*)>/gi;
    while ((match = tag.exec(source)) !== null) {
        const attrs = match[2];
        for (const attr of ['aria-label', 'aria-description', 'title', 'placeholder']) {
            const valueMatch = attrs.match(new RegExp(`\\s${attr}=(['"])([\\s\\S]*?)\\1`, 'i'));
            if (!valueMatch || !isCandidateText(valueMatch[2])) continue;
            if (attrs.includes(`data-i18n-attr-${attr}=`) || isSuppressed(source, match.index)) continue;
            findings.push({ sink: `html-attr:${attr}`, value: valueMatch[2] });
        }
    }
    return findings;
}

function buildUiCopyBaseline(extensionDir = EXTENSION_DIR) {
    const files = collectFiles(extensionDir, new Set(['.js', '.html'])).sort();
    const entries = {};
    for (const filePath of files) {
        const source = fs.readFileSync(filePath, 'utf8');
        const findings = path.extname(filePath) === '.html'
            ? collectHtmlLiterals(source)
            : collectJsLiterals(source);
        if (!findings.length) continue;
        const rel = toPosix(path.relative(REPO_ROOT, filePath));
        const canonical = findings
            .map(({ sink, value }) => `${sink}\0${value}`)
            .sort()
            .join('\n');
        entries[rel] = {
            count: findings.length,
            digest: crypto.createHash('sha256').update(canonical).digest('hex')
        };
    }
    return { schemaVersion: 1, entries };
}

function checkUiCopyBaseline(current, baseline) {
    if (!baseline || baseline.schemaVersion !== 1 || !baseline.entries) {
        return ['UI-copy baseline schema is invalid'];
    }
    const failures = [];
    const files = new Set([...Object.keys(baseline.entries), ...Object.keys(current.entries)]);
    for (const file of [...files].sort()) {
        const expected = baseline.entries[file];
        const actual = current.entries[file];
        if (!expected) failures.push(`${file}: new hardcoded UI copy detected (${actual.count} literal(s))`);
        else if (!actual) failures.push(`${file}: hardcoded UI copy was removed; ratchet the baseline`);
        else if (expected.count !== actual.count || expected.digest !== actual.digest) {
            failures.push(`${file}: UI-copy fingerprint changed (${expected.count} -> ${actual.count}); route new copy through locale keys or ratchet after removals`);
        }
    }
    return failures;
}

function parseArgs(argv = process.argv.slice(2)) {
    const options = { extensionDir: EXTENSION_DIR, baselinePath: BASELINE_PATH, update: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--extension-dir') {
            i += 1;
            if (!argv[i]) throw new Error('--extension-dir requires a path');
            options.extensionDir = path.resolve(argv[i]);
        } else if (arg === '--baseline') {
            i += 1;
            if (!argv[i]) throw new Error('--baseline requires a path');
            options.baselinePath = path.resolve(argv[i]);
        } else if (arg === '--update-baseline') {
            options.update = true;
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    return options;
}

function main() {
    const options = parseArgs();
    const current = buildUiCopyBaseline(options.extensionDir);
    if (options.update) {
        fs.writeFileSync(options.baselinePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
        console.log(`[check-localizable-ui-copy] updated ${toPosix(path.relative(REPO_ROOT, options.baselinePath))}`);
        return;
    }
    if (!fs.existsSync(options.baselinePath)) throw new Error('UI-copy baseline is missing');
    const baseline = JSON.parse(fs.readFileSync(options.baselinePath, 'utf8'));
    const failures = checkUiCopyBaseline(current, baseline);
    if (failures.length) {
        for (const failure of failures) console.error(`[check-localizable-ui-copy] FAIL ${failure}`);
        process.exitCode = 1;
        return;
    }
    const total = Object.values(current.entries).reduce((sum, entry) => sum + entry.count, 0);
    console.log(`[check-localizable-ui-copy] OK — ${total} legacy literal(s) ratcheted across ${Object.keys(current.entries).length} file(s)`);
}

if (require.main === module) {
    try { main(); } catch (error) {
        console.error('[check-localizable-ui-copy]', error.message || error);
        process.exitCode = 1;
    }
}

module.exports = {
    buildUiCopyBaseline,
    checkUiCopyBaseline,
    collectHtmlLiterals,
    collectJsLiterals,
    parseArgs,
    readLiteralAt
};
