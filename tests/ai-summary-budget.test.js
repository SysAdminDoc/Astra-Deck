'use strict';

// Two hardening asymmetries in background.js.
//
// 1. YTKIT_AI_SUMMARY_REQUEST is reachable from the isolated content script by
//    design (the in-page summary button calls it), but unlike EXT_FETCH it had
//    no requireRuntimeOptionalHostGrant re-check and no throttle. The key
//    itself was never exfiltratable — origin-locked vault, response scanned
//    for credential material — but the SPEND was unbounded: a compromised
//    content script could drive the user's paid provider key for arbitrary
//    completions at any rate.
//
// 2. The cookie-handoff capability advertises a tab+frame+document+container
//    binding. When the host omits sender.documentId, both sides hold null,
//    `null === null` passes, and the document leg silently disappears.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension/background.js'), 'utf8');

function slice(startNeedle, length) {
    const at = source.indexOf(startNeedle);
    assert.ok(at > 0, `${startNeedle} must exist`);
    return source.slice(at, at + length);
}

test('the AI request goes through the same grant door as EXT_FETCH', () => {
    const body = slice('async function performAiSummaryRequest', 3000);
    assert.match(body, /await requireRuntimeOptionalHostGrant\(validated\.url\)/,
        'an ungranted provider origin must not be reachable just because a credential exists');
});

test('the grant check runs before the credentialed fetch, not after', () => {
    const body = slice('async function performAiSummaryRequest', 3000);
    const grantAt = body.indexOf('requireRuntimeOptionalHostGrant');
    const fetchAt = body.indexOf('await fetch(validated.url');
    assert.ok(grantAt > 0 && fetchAt > 0);
    assert.ok(grantAt < fetchAt, 'the grant must be proven before the request is sent');
});

test('a per-tab in-flight cap and a minimum interval both exist', () => {
    assert.match(source, /AI_MAX_IN_FLIGHT_PER_TAB\s*=\s*(\d+)/);
    assert.match(source, /AI_MIN_REQUEST_INTERVAL_MS\s*=\s*(\d+)/);
    const cap = Number(/AI_MAX_IN_FLIGHT_PER_TAB\s*=\s*(\d+)/.exec(source)[1]);
    const interval = Number(/AI_MIN_REQUEST_INTERVAL_MS\s*=\s*(\d+)/.exec(source)[1]);
    assert.ok(cap >= 1 && cap <= 8, `in-flight cap ${cap} is not a sane bound`);
    assert.ok(interval >= 500, `a ${interval}ms floor does not throttle a burst`);
});

test('the budget is keyed per tab and popup callers are exempt', () => {
    const body = slice('function acquireAiRequestSlot', 1400);
    assert.match(body, /sender\?\.tab\?\.id/);
    assert.match(body, /if \(!Number\.isInteger\(tabId\)\) return \(\) => \{\}/,
        'a popup-originated request has no tab and is already trust-gated');
});

test('the slot is always released, including on failure', () => {
    const at = source.indexOf("msg.type === 'YTKIT_AI_SUMMARY_REQUEST'");
    assert.ok(at > 0);
    const body = source.slice(at, at + 1200);
    assert.match(body, /const release = acquireAiRequestSlot\(sender\)/);
    assert.match(body, /finally \{\s*release\(\);/,
        'a thrown request must not leak an in-flight slot forever');
});

test('rate-limit refusals carry a distinguishable code', () => {
    const body = slice('function acquireAiRequestSlot', 1400);
    const codes = Array.from(body.matchAll(/error\.code = '([A-Z_]+)'/g)).map(m => m[1]);
    assert.ok(codes.length >= 2, 'both refusal paths must be coded');
    for (const code of codes) {
        assert.equal(code, 'AI_RATE_LIMITED');
    }
});

test('the tab budget map is pruned so it cannot grow unbounded', () => {
    assert.match(source, /function _pruneAiTabBudgets/);
    const body = slice('function _pruneAiTabBudgets', 500);
    assert.match(body, /_aiTabBudgets\.delete\(tabId\)/);
});

test('the cookie-handoff binding no longer degrades when documentId is absent', () => {
    const body = slice('function cookieHandoffSenderBinding', 1600);
    assert.match(body, /documentUrl:/,
        'a second document-identity leg must survive a host that omits documentId');
    const compare = slice('function sameCookieHandoffBinding', 500);
    assert.match(compare, /left\.documentUrl === right\.documentUrl/,
        'the new leg must actually be compared, not just recorded');
});

test('every advertised binding leg is compared', () => {
    const compare = slice('function sameCookieHandoffBinding', 500);
    for (const leg of ['tabId', 'frameId', 'documentId', 'documentUrl', 'cookieStoreId']) {
        assert.match(compare, new RegExp(`left\\.${leg} === right\\.${leg}`), `${leg} must be bound`);
    }
});
