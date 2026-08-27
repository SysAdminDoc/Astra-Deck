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

// A published signing key is what makes a "signed" claim true. Until
// allowed-signers carries one, `SHA256SUMS.sig` is never produced and
// README.md must not promise provenance it cannot deliver — it did, two lines
// after an honest paragraph saying the opposite.
function signingKeyIsPublished() {
    const signers = read('allowed-signers');
    return signers
        .split('\n')
        .some((line) => line.trim() && !line.trim().startsWith('#'));
}

// Files that make provenance promises to a reader.
// Deliberately narrow: files where a line is a promise to a user about what a
// release carries. docs/signing-keys.md is a maintainer procedure that is
// supposed to describe signing at length and claims nothing about today.
// README.md only. It is the page that makes promises to a user about what a
// release carries. allowed-signers and docs/signing-keys.md exist to describe
// signing and are supposed to discuss it at length; scanning them produced
// noise on their own titles and verify instructions.
const SIGNING_CLAIM_FILES = Object.freeze(['README.md']);

// A claim is "signature-ish language near a release noun". The first cut
// matched only `signed release manifest`, which missed "the release manifest
// is signed with our maintainer key", "a cryptographically signed
// SHA256SUMS", and "a signature over the release manifest".
const SIGNING_WORD = /\bsign(?:ed|ature|s|ing)\b/i;
const RELEASE_NOUN = /\b(?:manifest|SHA256SUMS|artifacts?|releases?|checksums?)\b/i;

// Exempting on any stray "no" or "not" let "No competing extension ships a
// signed manifest like ours" through. A line is exempt only when it carries
// this explicit marker, which a writer has to mean.
const CLAIM_EXEMPT_MARKER = /signing-claim:\s*unverified/i;

function isSigningClaim(line) {
    if (!SIGNING_WORD.test(line) || !RELEASE_NOUN.test(line)) return false;
    // No free-text exemption. A negation-proximity rule let "No competing
    // extension ships a signed manifest like ours" and "We have not stopped
    // shipping a signed release manifest" straight through, because both put a
    // negation next to the signature word while still making the claim. The
    // marker is the only escape, and a writer has to mean it.
    return !CLAIM_EXEMPT_MARKER.test(line);
}

function checkSigningClaims() {
    if (signingKeyIsPublished()) return [];
    const problems = [];
    for (const rel of SIGNING_CLAIM_FILES) {
        let text;
        try {
            text = read(rel);
        } catch (_) {
            // reason: an absent optional doc is not a claim
            continue;
        }
        for (const [index, line] of text.split(/\r?\n/).entries()) {
            if (!isSigningClaim(line)) continue;
            problems.push(`${rel}:${index + 1} claims a release signature, but allowed-signers `
                + 'publishes no key and no SHA256SUMS.sig is produced. Restate it, or mark the '
                + 'line "signing-claim: unverified" if it is deliberately aspirational.');
        }
    }
    return problems;
}

function check() {
    const doc = fs.readFileSync(DOC_PATH, 'utf8');
    const problems = [...checkSigningClaims()];

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
    console.log('[architecture-doc] OK — message types, test count, popup bundle and '
        + 'release-signing claims match source');
}

if (require.main === module) main();

module.exports = {
    backgroundMessageTypes,
    check,
    checkSigningClaims,
    isSigningClaim,
    popupCoreModules,
    signingKeyIsPublished,
    testCount
};
