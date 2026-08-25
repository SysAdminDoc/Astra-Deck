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
    'extension/core/userscript-ai-summary.js',
    'extension/features/download-ui/index.js',
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
// A health record carries the same thrown text under an error-shaped FIELD on
// an ordinary receiver, so the receiver-shaped rule above never sees it.
// `registry.setHealth` stores `String(error.message)` in `lastError`, and a
// feature card that put that in a tooltip shipped the raw exception to a
// reader. Match the field wherever it is read.
const RAW_FAILURE_FIELD = /\.\s*(?:lastError|lastErrorMessage|lastErrorText|errorMessage|errorText|failureMessage)\b/;

// Channels the raw text is allowed to reach.
const DIAGNOSTIC_SINKS = /\b(?:DebugManager\s*(?:\?\.)?\s*\.?\s*log|DiagnosticLog\s*\??\.?\s*(?:record|log)|console\s*\.\s*\w+|logFailure|failureDiagnosticText|recordCorruptionDiagnostic|recordSettingsMigrationDiagnostic)\s*\(/;

// An explicit, reviewed exception. Put `raw-error-copy: <reason>` in a comment
// on the offending line or the line above it.
const ALLOW_COMMENT = /raw-error-copy:\s*\S/;

// The approved exits. Raw text handed to one of these comes back as a closed,
// localized cause sentence, so the raw fragment INSIDE the call is not a
// violation — only text that reaches the sink around it is. Without this the
// gate flags the very fix it tells you to apply.
const SANITIZER_CALL = /\b(?:describeFailureCause|describeFailureWithLabel|describeFailureBadge|describeHealthBadgeCopy|describeFailure|failureText|classifyFailureCause)\s*\(/g;

// Remove each sanitizer call together with its balanced argument list, so the
// raw-fragment patterns only ever see what is left outside them.
function stripSanitizedCalls(text) {
    let out = text;
    for (let guard = 0; guard < 20; guard += 1) {
        SANITIZER_CALL.lastIndex = 0;
        const match = SANITIZER_CALL.exec(out);
        if (!match) break;
        let depth = 0;
        let end = -1;
        for (let i = match.index + match[0].length - 1; i < out.length; i += 1) {
            if (out[i] === '(') depth += 1;
            else if (out[i] === ')') {
                depth -= 1;
                if (depth === 0) { end = i; break; }
            }
        }
        // An unterminated call means the expression window cut it off; drop the
        // rest rather than leaving its arguments visible to the raw patterns.
        out = end === -1
            ? out.slice(0, match.index)
            : out.slice(0, match.index) + out.slice(end + 1);
    }
    return out;
}

// `const message = 'Import failed: ' + e.message;` on one line and
// `showToast(message)` on the next reaches the reader exactly like a direct
// concatenation does, so a local bound to raw text is tracked for a few lines.
const LOCAL_BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
const BINDING_REACH = 4;

// An absolute path is honoured so a caller can scan a file outside the repo.
// The gate's own test needs that: writing its fixture into extension/ made a
// transient file that the directory-walking tests, which run in parallel under
// `node --test`, could pick up and fail on.
function scanFile(filePath) {
    const absolute = path.resolve(REPO_ROOT, filePath);
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
    const violations = [];
    const taintedLocals = new Map();
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        for (const [name, definedAt] of taintedLocals) {
            if (index - definedAt > BINDING_REACH) taintedLocals.delete(name);
        }
        const bareLine = stripSanitizedCalls(line);
        const binding = LOCAL_BINDING.exec(line);
        const bindingAllowed = ALLOW_COMMENT.test(line)
            || ALLOW_COMMENT.test(lines[index - 1] || '')
            || ALLOW_COMMENT.test(lines[index - 2] || '');
        if (binding && !bindingAllowed && !DIAGNOSTIC_SINKS.test(line)
            && (RAW_FAILURE.test(bareLine) || RAW_STATUS.test(bareLine) || RAW_FAILURE_FIELD.test(bareLine))) {
            taintedLocals.set(binding[1], index);
        }

        if (!UI_SINKS.some((sink) => sink.test(line))) continue;
        if (DIAGNOSTIC_SINKS.test(line)) continue;
        if (ALLOW_COMMENT.test(line) || ALLOW_COMMENT.test(lines[index - 1] || '')) continue;
        // A sink call can wrap; read the expression up to its terminating
        // line so `showStatus(\n  label + err.message)` is not missed.
        const window = lines.slice(index, index + 4).join('\n');
        const rawExpression = window.slice(0, window.indexOf(';') + 1 || window.length);
        if (DIAGNOSTIC_SINKS.test(rawExpression)) continue;
        const expression = stripSanitizedCalls(rawExpression);
        const tainted = [...taintedLocals.keys()]
            .some((name) => new RegExp(`\\b${name}\\b`).test(expression));
        if (!tainted && !RAW_FAILURE.test(expression) && !RAW_STATUS.test(expression)
            && !RAW_FAILURE_FIELD.test(expression)) continue;
        violations.push({ file: filePath, line: index + 1, text: line.trim().slice(0, 160) });
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

module.exports = { CONVERTED_FILES, scanFile, stripSanitizedCalls };
