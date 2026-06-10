#!/usr/bin/env node
'use strict';

// scripts/check-no-eval.js — v4.47.0 NF20 remote-code-execution gate.
//
// The extension's CSP forbids 'unsafe-eval' (see manifest.json
// content_security_policy.extension_pages). This script provides a
// belt-and-suspenders source-level grep so a contributor introducing
// `eval(` or `new Function(...)` is flagged at npm-run-check time
// instead of at runtime CSP rejection time — when the violation may
// already have shipped.
//
// Scope: every JS file the extension ships to the user. We DO scan
// the userscript build (YTKit.user.js) because it bundles core
// modules + features verbatim and is published as a release artifact.
// We do NOT scan tests/ or scripts/ themselves — those are
// developer-time tooling that legitimately needs eval/Function for
// sandbox evaluation. Same goes for archive/, mhtml/, build/, and
// node_modules/.
//
// Patterns flagged:
//   - bare `eval(` calls (whitespace-tolerant)
//   - `new Function(` constructor invocations (whitespace-tolerant)
//   - `setTimeout(string` / `setInterval(string` first-arg strings
//     (the legacy implicit-eval interface)
//
// Exit 0 on no findings; exit 1 with per-finding line/column otherwise.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

// Files to scan. Add more here as new release artifacts join the bundle.
const SCAN_FILES = [
    'extension/ytkit.js',
    'extension/ytkit-main.js',
    'extension/background.js',
    'extension/popup.js',
    'YTKit.user.js',
    // Glob extension/core/**/*.js and extension/features/**/*.js
    ...walk(path.join(REPO_ROOT, 'extension', 'core'), '.js'),
    ...walk(path.join(REPO_ROOT, 'extension', 'features'), '.js'),
];

function walk(dir, ext) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            out.push(...walk(full, ext));
        } else if (full.endsWith(ext)) {
            out.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
        }
    }
    return out;
}

// Patterns. Each entry: { name, regex, allowComment }. allowComment
// means a match preceded on the same line by `//` or `/*` is skipped
// (avoids false positives on documentation that references the patterns
// by name, like this file).
const PATTERNS = [
    { name: 'eval(',          regex: /(^|[^.\w])eval\s*\(/g, allowComment: true },
    { name: 'new Function(',  regex: /\bnew\s+Function\s*\(/g, allowComment: true },
    // setTimeout/setInterval with a string first arg — the legacy
    // implicit-eval interface. We catch the simple `setTimeout("…"`
    // form; setTimeout(varName) where varName happens to be a string
    // at runtime is undetectable statically and out of scope.
    { name: 'setTimeout(string)',  regex: /\bsetTimeout\s*\(\s*["'`]/g, allowComment: true },
    { name: 'setInterval(string)', regex: /\bsetInterval\s*\(\s*["'`]/g, allowComment: true },
];

// Blank out the CONTENTS of string literals (single, double, backtick) so a
// `//` inside a string — most commonly a URL like 'https://…' — cannot be
// mistaken for a line comment by the suppression check below. Quote chars are
// preserved; escaped quotes are honored. An unterminated string (the match
// itself sits inside one) leaves the remainder stripped, which is the
// conservative direction: the finding stays flagged.
function stripStringLiteralContents(lineText) {
    let out = '';
    let quote = null;
    for (let i = 0; i < lineText.length; i += 1) {
        const ch = lineText[i];
        if (quote) {
            if (ch === '\\') { i += 1; continue; }
            if (ch === quote) {
                quote = null;
                out += ch;
            }
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
        }
        out += ch;
    }
    return out;
}

const findings = [];

for (const rel of SCAN_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    const lines = src.split('\n');
    for (const { name, regex, allowComment } of PATTERNS) {
        // Reset lastIndex because we're reusing the regex across files.
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(src)) !== null) {
            const offset = m.index;
            const lineIdx = src.slice(0, offset).split('\n').length - 1;
            const colIdx = offset - src.lastIndexOf('\n', offset - 1) - 1;
            const lineText = lines[lineIdx] || '';
            // Skip if the match sits inside a line comment. String-literal
            // contents are stripped first so `fetch('https://x'); eval(` is
            // NOT false-greened by the `//` inside the URL.
            if (allowComment) {
                const beforeMatchOnLine = stripStringLiteralContents(lineText.slice(0, colIdx));
                if (beforeMatchOnLine.includes('//')) continue;
                // Block-comment check is structurally hard; we accept
                // the false-positive risk and document an // eslint-
                // disable-style escape hatch below.
            }
            // Manual opt-out: a same-line `// allow-eval` annotation
            // suppresses the finding. Useful for the rare case where
            // eval-shaped code is actually safe (e.g. building a
            // sandbox + intentional metaprogramming).
            if (lineText.includes('// allow-eval')) continue;
            findings.push({
                file: rel,
                line: lineIdx + 1,
                column: colIdx + 1,
                pattern: name,
                snippet: lineText.trim().slice(0, 100),
            });
        }
    }
}

if (findings.length === 0) {
    console.log(`[check-no-eval] OK — scanned ${SCAN_FILES.filter((f) => fs.existsSync(path.join(REPO_ROOT, f))).length} files; no eval / Function / string-timer patterns found`);
    process.exit(0);
}

console.error(`[check-no-eval] FAIL — ${findings.length} finding(s):`);
for (const f of findings) {
    console.error(`  ${f.file}:${f.line}:${f.column}  ${f.pattern}`);
    console.error(`    ${f.snippet}`);
}
console.error('');
console.error('If a finding is intentional + safe, add the comment `// allow-eval`');
console.error('on the same line. Otherwise rewrite to avoid the pattern.');
process.exit(1);
