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
//   - HTML-parsing sinks: `.innerHTML`/`.outerHTML` assignment (plain and
//     compound, dotted or bracketed), `insertAdjacentHTML(`,
//     `document.write(`, `document.writeln(`, `createContextualFragment(`,
//     `setHTMLUnsafe(`, `parseHTMLUnsafe(`
//
// The HTML sinks joined this gate in v4.88.3. `core/trusted-html.js` builds a
// real sanitizing Trusted Types policy for content scripts, but nothing
// stopped a contributor writing a raw assignment beside it, and the extension
// pages never loaded that module at all — the only guards were three per-file
// regexes buried in two test files. YouTube has enforced
// `require-trusted-types-for 'script'` on its own pages since 2024-07-25, and
// the userscript vehicle runs in that page context, so a raw sink there is not
// a style problem: it throws. Reads of `.innerHTML` are untouched; the
// sanitizer itself serializes through one.
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
    'extension/runtime-bootstrap.js',
    'extension/runtime-core-loader.mjs',
    'extension/sidepanel.js',
    'extension/live-chat.js',
    'YTKit.user.js',
    'YTKit-core.user.js',
    // Every root userscript ships to users with its own @updateURL, so the
    // gate's scope must not stop at the flagship one.
    'theater-split.user.js',
    'YT_Reaction_Spammer.user.js',
    // Glob extension/core/**/*.js and extension/features/**/*.js
    ...walk(path.join(REPO_ROOT, 'extension', 'core'), '.js'),
    ...walk(path.join(REPO_ROOT, 'extension', 'features'), '.js'),
];

// A floor on the gate's own scope. A hand-written list silently shrinks when a
// file is renamed or a directory moves, and a gate that scans nothing passes
// loudest of all. `check-userscript-symbols.js` set this pattern.
const MIN_SCAN_FILES = 120;

function walk(dir, ext) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) continue;
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
    // at runtime is not knowable by this source-text scan.
    { name: 'setTimeout(string)',  regex: /\bsetTimeout\s*\(\s*["'`]/g, allowComment: true },
    { name: 'setInterval(string)', regex: /\bsetInterval\s*\(\s*["'`]/g, allowComment: true },
    // HTML-parsing sinks. Route new HTML through `core/trusted-html.js`, or
    // build the tree with DOM calls.
    //
    // Plain and compound assignment both reach the sink: `el.innerHTML += x`
    // is every bit as much a TrustedHTML write as `el.innerHTML = x`, and it
    // is the more natural thing to type. `=(?!=)` keeps comparisons
    // (`el.innerHTML === x`) and the sanitizer's own serializing reads clear.
    { name: '.innerHTML =', regex: /\.innerHTML\s*(?:\+|\|\||&&|\?\?)?=(?!=)/g, allowComment: true },
    { name: '.outerHTML =', regex: /\.outerHTML\s*(?:\+|\|\||&&|\?\?)?=(?!=)/g, allowComment: true },
    // Bracket access reaches the same setter and reads as deliberate evasion.
    { name: "['innerHTML'] =", regex: /\[\s*(['"`])(?:inner|outer)HTML\1\s*\]\s*(?:\+|\|\||&&|\?\?)?=(?!=)/g, allowComment: true },
    { name: 'insertAdjacentHTML(', regex: /\.insertAdjacentHTML\s*\(/g, allowComment: true },
    { name: 'document.write(', regex: /\bdocument\s*\.\s*write(?:ln)?\s*\(/g, allowComment: true },
    // The rest of the TrustedHTML sink family. createContextualFragment parses
    // a string into nodes; the *Unsafe pair is the Sanitizer API's explicit
    // opt-out and is named that way for a reason.
    { name: 'createContextualFragment(', regex: /\.createContextualFragment\s*\(/g, allowComment: true },
    { name: 'setHTMLUnsafe(', regex: /\.setHTMLUnsafe\s*\(/g, allowComment: true },
    { name: 'parseHTMLUnsafe(', regex: /\.parseHTMLUnsafe\s*\(/g, allowComment: true },
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
    // Depth of nested `${ … }` template expressions. Code inside a template
    // expression is live JavaScript — an `eval(` there must NOT be stripped
    // with the surrounding string content or the scanner goes blind to it.
    let exprDepth = 0;
    for (let i = 0; i < lineText.length; i += 1) {
        const ch = lineText[i];
        if (quote) {
            if (ch === '\\') { i += 1; continue; }
            if (quote === '`' && ch === '$' && lineText[i + 1] === '{') {
                // Enter a template expression: keep its content visible.
                exprDepth = 1;
                quote = null;
                out += '${';
                i += 1;
                continue;
            }
            if (ch === quote) {
                quote = null;
                out += ch;
            }
            continue;
        }
        if (exprDepth > 0) {
            if (ch === '{') exprDepth += 1;
            else if (ch === '}') {
                exprDepth -= 1;
                if (exprDepth === 0) {
                    // Back inside the enclosing template literal body.
                    quote = '`';
                    out += ch;
                    continue;
                }
            }
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
        }
        out += ch;
    }
    return out;
}

// Wrapped so tests can require PATTERNS and exercise the real regexes
// rather than a copy that can drift from the shipped gate.
function main() {
    const findings = [];

    const presentScanFiles = SCAN_FILES.filter((f) => fs.existsSync(path.join(REPO_ROOT, f)));
    if (presentScanFiles.length < MIN_SCAN_FILES) {
        console.error(
            `[check-no-eval] FAILED — scope collapsed to ${presentScanFiles.length} file(s), below the `
            + `floor of ${MIN_SCAN_FILES}. A gate that scans almost nothing passes for the wrong reason. `
            + 'Fix the paths, or lower the floor deliberately if the tree really did shrink.'
        );
        process.exit(1);
    }

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
}

if (require.main === module) main();

module.exports = { PATTERNS, SCAN_FILES, MIN_SCAN_FILES, stripStringLiteralContents };
