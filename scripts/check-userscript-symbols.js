#!/usr/bin/env node
'use strict';

// scripts/check-userscript-symbols.js — CI guard for cross-boundary symbol
// resolution between the userscript's required core library and its monolith.
//
// check-userscript-drift.js proves the bundled modules are byte-identical to
// their extension sources. That is necessary but not sufficient: a bundled
// module can call a method on a monolith singleton that the *extension*
// defines and the *userscript* does not. The bundle is then perfectly
// faithful and the shipped control still throws TypeError on click.
//
// That is not hypothetical. v4.50.7 shipped five such calls — Import,
// import-Undo, Takeout import, companion install-assist and
// copy-install-command — every one of them dead for every Tampermonkey user
// since 2026-07-09, past a byte-for-byte parity gate, a 1,446-test suite and
// a 20-gate `npm run check`.
//
// What this checks: every `<singleton>.<method>(` call inside the generated
// core library resolves to a member the main userscript monolith defines.
//
// Scope is DERIVED, not listed. The singleton set is read out of the monolith
// itself (every top-level `const X = {` object literal below the bundle), so
// adding a new singleton puts it under the gate automatically. A hand-listed
// scope goes stale exactly when new work makes it matter.
//
// Exit 0: every call resolves. Exit 1: unresolved call(s). Exit 2: parse failure.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const USERSCRIPT_PATH = path.join(REPO_ROOT, 'YTKit.user.js');
const CORE_LIBRARY_PATH = path.join(REPO_ROOT, 'YTKit-core.user.js');

const BEGIN_MARKER = /── BEGIN v5\.0\.0 bundled core modules ──/;
const END_MARKER = /── END v5\.0\.0 bundled core modules ──/;

// Top-level singleton object literals live at exactly 4-space indent inside the
// userscript's IIFE and close on a bare `    };` line.
const SINGLETON_DEF_RE = /^ {4}(?:const|let|var) ([A-Za-z_$][\w$]*) = \{$/;
const SINGLETON_CLOSE = '    };';
// Members sit one level deeper. Covers `name(`, `async name(`, `get name(`,
// `*name(` and `name:` value properties.
const MEMBER_RE = /^ {8}(?:async\s+)?(?:get\s+|set\s+)?\*?\s*(?:([A-Za-z_$][\w$]*)|'([^']+)'|"([^"]+)")\s*[(:]/;

// Members attached after definition (`settingsManager.foo = function ...`).
// Counted as defined so a legitimate dynamic attachment is not a false positive.
const DYNAMIC_ASSIGN_RE = /(?<![.\w$])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;

// Known-dynamic members that genuinely cannot be resolved statically. Keep this
// empty unless there is a real one; every entry is a hole in the gate and must
// carry the reason it cannot be proven.
const ALLOWED_UNRESOLVED = new Set([
    // 'Singleton.method', // reason
]);

function fail(msg) {
    console.error(`[check-userscript-symbols] ${msg}`);
    process.exit(2);
}

const source = fs.readFileSync(USERSCRIPT_PATH, 'utf8');
const lines = source.split(/\r?\n/);
if (!fs.existsSync(CORE_LIBRARY_PATH)) {
    fail('Generated YTKit-core.user.js is missing — run `node sync-userscript.js`');
}
const coreSource = fs.readFileSync(CORE_LIBRARY_PATH, 'utf8');
const coreLines = coreSource.split(/\r?\n/);
const monolithEndIdx = lines.findIndex((l) => END_MARKER.test(l));
if (monolithEndIdx < 0) {
    fail('Cannot locate the v5.0.0 dependency manifest end marker in YTKit.user.js');
}

const beginIdx = coreLines.findIndex((l) => BEGIN_MARKER.test(l));
const endIdx = coreLines.findIndex((l) => END_MARKER.test(l));
if (beginIdx < 0 || endIdx < 0 || endIdx <= beginIdx) {
    fail('Cannot locate the v5.0.0 bundle markers in YTKit-core.user.js');
}

// ── 1. Derive the singleton set and its members from the monolith body ──

const singletons = new Map(); // name -> Set(member)

for (let i = monolithEndIdx + 1; i < lines.length; i++) {
    const def = lines[i].match(SINGLETON_DEF_RE);
    if (!def) continue;

    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] === SINGLETON_CLOSE) { close = j; break; }
        // A new definition before a close means our indentation assumption
        // broke; skip rather than silently mis-scoping the member set.
        if (SINGLETON_DEF_RE.test(lines[j])) break;
    }
    if (close < 0) continue;

    const members = new Set();
    for (let j = i + 1; j < close; j++) {
        const m = lines[j].match(MEMBER_RE);
        if (m) members.add(m[1] || m[2] || m[3]);
    }
    singletons.set(def[1], members);
}

if (singletons.size === 0) {
    fail('Derived zero monolith singletons — the extraction is broken, not the code');
}

// Scope is DERIVED by matching a source shape, so drift in that shape (a
// trailing comment on the definition line, a re-indented close) silently drops
// a singleton and every bundle call into it goes unchecked. A zero-check alone
// cannot see that. Pin the floor and the singletons whose missing members have
// actually shipped dead controls before.
const MIN_DERIVED_SINGLETONS = 12;
if (singletons.size < MIN_DERIVED_SINGLETONS) {
    fail(`Derived only ${singletons.size} monolith singletons (expected at least ${MIN_DERIVED_SINGLETONS}) — `
        + 'the extraction lost scope; check for formatting drift on a singleton definition');
}
for (const required of ['settingsManager', 'StorageManager', 'DebugManager']) {
    if (!singletons.has(required)) {
        fail(`Singleton "${required}" fell out of the derived scope — its bundle calls would go unchecked`);
    }
}

// ── 2. Fold in members attached dynamically anywhere in the file ──

let dyn;
DYNAMIC_ASSIGN_RE.lastIndex = 0;
while ((dyn = DYNAMIC_ASSIGN_RE.exec(source)) !== null) {
    const bucket = singletons.get(dyn[1]);
    if (bucket) bucket.add(dyn[2]);
}

// ── 3. Resolve every singleton call inside the bundle region ──

const names = [...singletons.keys()].join('|');
const callRe = new RegExp(`(?<![.\\w$])(${names})\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g');

const unresolved = [];
let callCount = 0;

for (let i = beginIdx; i <= endIdx; i++) {
    const line = coreLines[i];
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(line)) !== null) {
        callCount++;
        const [, singleton, method] = m;
        if (singletons.get(singleton).has(method)) continue;
        if (ALLOWED_UNRESOLVED.has(`${singleton}.${method}`)) continue;
        unresolved.push({ line: i + 1, singleton, method });
    }
}

// ── 4. Report ──

if (unresolved.length > 0) {
    console.error('[check-userscript-symbols] Unresolved cross-boundary call(s) —');
    console.error('  a required core module calls a monolith method that YTKit.user.js does not define.');
    console.error('  These throw TypeError on click for every userscript user.\n');
    for (const u of unresolved) {
        const defined = singletons.get(u.singleton).size;
        console.error(`  YTKit.user.js:${u.line}  ${u.singleton}.${u.method}()  — not among ${defined} members of ${u.singleton}`);
    }
    console.error('\n  Fix: port the method into the monolith singleton, or stop calling it from the bundle.');
    process.exit(1);
}

console.log(`[check-userscript-symbols] OK — ${callCount} singleton call(s) in the core library all resolve`);
console.log(`[check-userscript-symbols] Scope derived from the monolith: ${singletons.size} singleton(s), ${[...singletons.values()].reduce((n, s) => n + s.size, 0)} member(s)`);
