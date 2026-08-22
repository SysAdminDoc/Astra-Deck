#!/usr/bin/env node
'use strict';

// Raw failure text must not reach a user-facing surface. `error.message`,
// `error.stack` and a bare HTTP status are unactionable for the reader,
// untranslatable (the appended half is always English), and on the AI paths
// they can put a provider response body on screen. Converted files route every
// failure through `core/failure-copy.js`, which maps the throw onto a closed
// set of localized causes that each name a next action.
//
// This gate covers the files that have been converted. Diagnostic channels
// (DebugManager.log, DiagnosticLog.record, console.*) are exempt: that is
// where the raw text is supposed to go.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// Files whose user-facing surfaces have been converted. The list only grows.
const CONVERTED_FILES = Object.freeze([
    'extension/popup.js',
    'extension/ytkit.js',
    'extension/features/settings-panel/index.js',
    'extension/features/subscription-groups/index.js'
]);

// Sinks that put text in front of a person.
const UI_SINKS = Object.freeze([
    /\b(?:showToast|showStatus|setStatus|setPanelStatus|_showStatus|_showToast|setFilterListStatus|alert|confirm|prompt)\s*\(/,
    /\.(?:textContent|innerText|title|ariaLabel|placeholder|value)\s*=/,
    /\.setAttribute\(\s*['"](?:aria-label|aria-description|title|placeholder)['"]/
]);

// The raw fragments that must never appear inside a sink expression.
// Only an error-shaped receiver counts. `result.message` and `undo.message`
// are Astra's own already-localized outcome objects, not thrown text.
const RAW_FAILURE = /\b(?:e|ex|[\w$]*(?:[Ee]rr|[Ee]rror|[Ee]xception|[Ff]ailure)[\w$]*)\s*(?:\?\.|\.)\s*(?:message|stack|statusText|responseText)\b/;
const RAW_STATUS = /(?:\bHTTP\b[^\n]{0,8}\$\{|\$\{[^}\n]*\b(?:status|statusCode|httpStatus)\b[^}\n]*\})/i;

// Channels the raw text is allowed to reach.
const DIAGNOSTIC_SINKS = /\b(?:DebugManager\s*(?:\?\.)?\s*\.?\s*log|DiagnosticLog\s*\??\.?\s*(?:record|log)|console\s*\.\s*\w+|logFailure|failureDiagnosticText|recordCorruptionDiagnostic|recordSettingsMigrationDiagnostic)\s*\(/;

// An explicit, reviewed exception. Put `raw-error-copy: <reason>` in a comment
// on the offending line or the line above it.
const ALLOW_COMMENT = /raw-error-copy:\s*\S/;

// `const message = 'Import failed: ' + e.message;` on one line and
// `showToast(message)` on the next reaches the reader exactly like a direct
// concatenation does, so a local bound to raw text is tracked for a few lines.
const LOCAL_BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
const BINDING_REACH = 4;

function scanFile(relativePath) {
    const absolute = path.join(REPO_ROOT, relativePath);
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
    const violations = [];
    const taintedLocals = new Map();
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        for (const [name, definedAt] of taintedLocals) {
            if (index - definedAt > BINDING_REACH) taintedLocals.delete(name);
        }
        const binding = LOCAL_BINDING.exec(line);
        const bindingAllowed = ALLOW_COMMENT.test(line)
            || ALLOW_COMMENT.test(lines[index - 1] || '')
            || ALLOW_COMMENT.test(lines[index - 2] || '');
        if (binding && !bindingAllowed && !DIAGNOSTIC_SINKS.test(line)
            && (RAW_FAILURE.test(line) || RAW_STATUS.test(line))) {
            taintedLocals.set(binding[1], index);
        }

        if (!UI_SINKS.some((sink) => sink.test(line))) continue;
        if (DIAGNOSTIC_SINKS.test(line)) continue;
        if (ALLOW_COMMENT.test(line) || ALLOW_COMMENT.test(lines[index - 1] || '')) continue;
        // A sink call can wrap; read the expression up to its terminating
        // line so `showStatus(\n  label + err.message)` is not missed.
        const window = lines.slice(index, index + 4).join('\n');
        const expression = window.slice(0, window.indexOf(';') + 1 || window.length);
        if (DIAGNOSTIC_SINKS.test(expression)) continue;
        const tainted = [...taintedLocals.keys()]
            .some((name) => new RegExp(`\\b${name}\\b`).test(expression));
        if (!tainted && !RAW_FAILURE.test(expression) && !RAW_STATUS.test(expression)) continue;
        violations.push({ file: relativePath, line: index + 1, text: line.trim().slice(0, 160) });
    }
    return violations;
}

function main() {
    const violations = CONVERTED_FILES.flatMap(scanFile);
    if (violations.length > 0) {
        console.error('[check-raw-error-copy] raw failure text reaches a user-facing surface:');
        for (const violation of violations) {
            console.error(`  ${violation.file}:${violation.line}  ${violation.text}`);
        }
        console.error('');
        console.error('Route the failure through YTKitCore.describeFailure/describeFailureWithLabel');
        console.error('(extension/core/failure-copy.js) and send the raw text to the diagnostic log.');
        console.error('A reviewed exception needs a `raw-error-copy: <reason>` comment on the line.');
        process.exit(1);
    }
    console.log(`[check-raw-error-copy] OK — ${CONVERTED_FILES.length} converted file(s) clean`);
}

if (require.main === module) main();

module.exports = { CONVERTED_FILES, scanFile };
