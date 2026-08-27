'use strict';

// docs/architecture.md is the file a store reviewer and a new contributor read
// first, and every number in it had rotted by v4.88.3 — most damagingly the
// trust-boundary section, which named 8 content-to-background message types
// while the worker handled 23, omitting the native token, the AI credential
// channel and the cookie handoff. Correcting them once fixes nothing durable;
// they went stale because nothing read them.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const gate = require('../scripts/check-architecture-doc.js');

const repoRoot = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(repoRoot, 'docs', 'architecture.md'), 'utf8');

test('the architecture doc matches source right now', () => {
    assert.deepEqual(gate.check(), [], 'update docs/architecture.md to match source');
});

test('every message type the worker handles is named in the trust boundary', () => {
    const handled = gate.backgroundMessageTypes();
    assert.ok(handled.length >= 20, 'the worker should handle a substantial message set');

    const line = doc.split('\n').find((candidate) =>
        candidate.includes('background service worker') && candidate.includes('typed messages'));
    assert.ok(line, 'the trust-boundary line must exist');

    // The three that made the old list a review problem rather than a typo.
    for (const sensitive of ['NATIVE_MSG_GET_TOKEN', 'YTKIT_COOKIE_HANDOFF', 'YTKIT_AI_CREDENTIAL_SET']) {
        assert.ok(handled.includes(sensitive), `${sensitive} must still be a real handler`);
        assert.ok(line.includes(`\`${sensitive}\``),
            `${sensitive} must be named in the trust-boundary section`);
    }
});

test('the doc does not present content-script-bound messages as worker handlers', () => {
    // The original list mixed in four messages the worker never handles, which
    // made its real surface look four names smaller than it is.
    const handled = new Set(gate.backgroundMessageTypes());
    for (const outbound of ['YTKIT_GET_SELECTOR_HEALTH', 'YTKIT_OPEN_PANEL', 'YTKIT_SETTING_CHANGED']) {
        assert.equal(handled.has(outbound), false,
            `${outbound} is sent to a content script, not handled by the worker`);
    }
    const line = doc.split('\n').find((candidate) =>
        candidate.includes('background service worker') && candidate.includes('typed messages'));
    const named = new Set([...line.matchAll(/`([A-Z_]+)`/g)].map((match) => match[1]));
    const declared = /handles (\d+) typed messages/.exec(line);
    assert.ok(declared, 'the line must state a count');
    assert.equal(Number(declared[1]), handled.size,
        'the stated count must be the number of real handlers');
    for (const type of handled) {
        assert.ok(named.has(type), `${type} must appear in the list`);
    }
});

test('the gate fails when the message list falls behind the worker', () => {
    // Proving it can fail: drop a handled type from the rendered list.
    const handled = gate.backgroundMessageTypes();
    const victim = handled[0];
    const staleDoc = doc.replace(`\`${victim}\`, `, '');
    assert.notEqual(staleDoc, doc, 'the mutation must apply');

    const problems = [];
    const line = staleDoc.split('\n').find((candidate) =>
        candidate.includes('background service worker') && candidate.includes('typed messages'));
    const named = new Set([...line.matchAll(/`([A-Z_]+)`/g)].map((match) => match[1]));
    for (const type of handled) if (!named.has(type)) problems.push(type);
    assert.deepEqual(problems, [victim],
        'a type dropped from the doc must be detectable — this is what the gate compares');
});

test('the test count and popup bundle claims are source-derived', () => {
    const tests = gate.testCount();
    assert.ok(tests > 2000, `the suite should define thousands of tests, saw ${tests}`);
    const claimed = /\((\d[\d,]*) JS tests/.exec(doc);
    assert.ok(claimed, 'the doc must state a test count');
    const stated = Number(claimed[1].replace(/,/g, ''));
    assert.ok(Math.abs(stated - tests) / tests <= 0.1,
        `the doc claims ${stated} tests against ${tests}`);

    const modules = gate.popupCoreModules();
    assert.ok(modules.length >= 10, 'the popup bundles a substantial core set');
    const bundled = /Bundles\s+(\d+) core modules/.exec(doc);
    assert.ok(bundled, 'the doc must state the popup core-module count');
    assert.equal(Number(bundled[1]), modules.length);
});

test('the architecture doc check is registered as a gate', () => {
    const { GATES } = require('../scripts/run-checks.js');
    const entry = GATES.find((candidate) => candidate.id === 'architecture-doc');
    assert.ok(entry, 'the doc must be verified by npm run check');
    assert.equal(entry.script, 'check-architecture-doc.js');
});

test('the README does not promise provenance the release cannot deliver', () => {
    // README.md claimed a "signed release manifest over the built artifacts"
    // two lines after an honest paragraph saying releases are unsigned.
    // allowed-signers carries no key, release-signature.js returns
    // no-published-key, and readiness downgrades that to a warning — so the
    // claim was false on every published release.
    const gate = require('../scripts/check-architecture-doc.js');
    assert.deepEqual(gate.checkSigningClaims(), [],
        'README.md must not claim a signed manifest while no signing key is published');
});

test('the signing-claim check is keyed to the actual key state', () => {
    const gate = require('../scripts/check-architecture-doc.js');
    const signers = fs.readFileSync(path.join(repoRoot, 'allowed-signers'), 'utf8');
    const hasKeyLine = signers.split('\n').some((line) => line.trim() && !line.trim().startsWith('#'));
    assert.equal(gate.signingKeyIsPublished(), hasKeyLine,
        'the check must read allowed-signers, not a hardcoded answer');

    // When a key IS published the claim becomes legitimate, so the check must
    // stop firing rather than block the release it is meant to enable.
    if (!hasKeyLine) {
        assert.equal(gate.checkSigningClaims().length, 0);
    }
});
