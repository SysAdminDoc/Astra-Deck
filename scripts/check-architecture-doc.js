#!/usr/bin/env node
'use strict';

// docs/architecture.md carries numbers that only a human keeps current, and
// they had all rotted by v4.88.3:
//
//   - the trust-boundary section named 8 content-to-background message types
//     while the worker handled 23, omitting the native token, the AI
//     credential channel and the cookie handoff — the three a reviewer would
//     most want listed, in the section written for reviewers;
//   - the test-suite row said 1,330 tests against roughly 2,800;
//   - the popup row named 4 bundled core modules against 15.
//
// Correcting them once fixes nothing durable: they went stale because nothing
// read them. This gate recomputes each from source and fails on drift, in the
// same spirit as the generated project-facts block.
//
// It deliberately does NOT try to verify every prose claim in the file. It
// covers the three that are mechanically derivable and that have already
// demonstrated they will rot.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const DOC_PATH = path.join(REPO_ROOT, 'docs', 'architecture.md');

function read(rel) {
    return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// Types the service worker actually dispatches on. The worker uses one
// `onMessage` listener and a chain of `msg.type === '...'` guards.
function backgroundMessageTypes() {
    const source = read('extension/background.js');
    return [...new Set([...source.matchAll(/msg\.type === '([A-Z_]+)'/g)].map((m) => m[1]))].sort();
}

function testCount() {
    const dirs = [path.join(REPO_ROOT, 'tests'), path.join(REPO_ROOT, 'tests', 'features')];
    let total = 0;
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.test.js')) continue;
            const body = fs.readFileSync(path.join(dir, name), 'utf8');
            total += (body.match(/^test\(/gm) || []).length;
        }
    }
    return total;
}

function popupCoreModules() {
    const popup = read('extension/popup.html');
    return [...new Set([...popup.matchAll(/(core\/[a-z-]+\.js)/g)].map((m) => m[1]))].sort();
}

function check() {
    const doc = fs.readFileSync(DOC_PATH, 'utf8');
    const problems = [];

    // 1. Message types. Every handled type must be named, and the doc must not
    //    name a type the worker does not handle — the original defect was a
    //    list that mixed in four content-script-bound messages.
    const handled = backgroundMessageTypes();
    const boundaryLine = doc.split('\n').find((line) =>
        line.includes('background service worker') && line.includes('typed messages'));
    if (!boundaryLine) {
        problems.push('the trust-boundary line naming the background message types is gone; '
            + 'restore it or update scripts/check-architecture-doc.js');
    } else {
        const named = new Set([...boundaryLine.matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]));
        const missing = handled.filter((type) => !named.has(type));
        if (missing.length) {
            problems.push(`docs/architecture.md does not name ${missing.length} handled message type(s): `
                + `${missing.join(', ')}`);
        }
        const declaredCount = /handles (\d+) typed messages/.exec(boundaryLine);
        if (!declaredCount) {
            problems.push('the trust-boundary line must state how many typed messages the worker handles');
        } else if (Number(declaredCount[1]) !== handled.length) {
            problems.push(`docs/architecture.md says the worker handles ${declaredCount[1]} typed messages; `
                + `extension/background.js handles ${handled.length}`);
        }
    }

    // 2. Test count. Allowed to trail slightly so every new test does not
    //    force a doc edit, but not to drift by more than a tenth.
    const tests = testCount();
    const claimed = /\((\d[\d,]*) JS tests/.exec(doc);
    if (!claimed) {
        problems.push('the test-suite row must state a JS test count');
    } else {
        const stated = Number(claimed[1].replace(/,/g, ''));
        const drift = Math.abs(stated - tests) / Math.max(tests, 1);
        if (drift > 0.1) {
            problems.push(`docs/architecture.md claims ${stated} JS tests; the suite defines ${tests} `
                + `(${Math.round(drift * 100)}% drift)`);
        }
    }

    // 3. Popup core bundle.
    const modules = popupCoreModules();
    const bundled = /Bundles\s+(\d+) core modules/.exec(doc);
    if (!bundled) {
        problems.push('the popup row must state how many core modules it bundles');
    } else if (Number(bundled[1]) !== modules.length) {
        problems.push(`docs/architecture.md says the popup bundles ${bundled[1]} core modules; `
            + `extension/popup.html loads ${modules.length}`);
    }

    return problems;
}

function main() {
    const problems = check();
    if (problems.length) {
        console.error('[architecture-doc] drift detected:');
        for (const problem of problems) console.error(`  ${problem}`);
        console.error('');
        console.error('Update docs/architecture.md to match source.');
        process.exitCode = 1;
        return;
    }
    console.log('[architecture-doc] OK — message types, test count and popup bundle match source');
}

if (require.main === module) main();

module.exports = { backgroundMessageTypes, check, popupCoreModules, testCount };
