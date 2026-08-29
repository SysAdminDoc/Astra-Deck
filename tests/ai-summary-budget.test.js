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
//
// The budget and the binding are now RUN — a throttle that is only read about
// is a throttle nobody has ever seen refuse anything. Two ordering claims about
// performAiSummaryRequest stay scans and say why.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadDeclarationsFrom } = require('./helpers/monolith');
const { sources } = require('./helpers/source');

const repoRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension/background.js'), 'utf8');

const BUDGET_CHAIN = [
    'AI_MAX_IN_FLIGHT_PER_TAB',
    'AI_MIN_REQUEST_INTERVAL_MS',
    'AI_TAB_BUDGET_TTL_MS',
    '_aiTabBudgets',
    '_pruneAiTabBudgets',
    'acquireAiRequestSlot',
];

/** The real budget, with a clock the test drives. */
function budget() {
    let now = 1_800_000_000_000;
    const api = loadDeclarationsFrom(sources.background, BUDGET_CHAIN, {
        Date: { now: () => now },
    });
    return {
        api,
        advance: (ms) => { now += ms; },
        acquire: (tabId) => api.acquireAiRequestSlot(tabId === undefined ? {} : { tab: { id: tabId } }),
    };
}

function refusal(fn) {
    try { fn(); } catch (error) { return error; }
    return null;
}

test('a tab cannot hold more AI requests in flight than the cap allows', () => {
    const { api, acquire, advance } = budget();
    assert.ok(api.AI_MAX_IN_FLIGHT_PER_TAB >= 1 && api.AI_MAX_IN_FLIGHT_PER_TAB <= 8,
        `in-flight cap ${api.AI_MAX_IN_FLIGHT_PER_TAB} is not a sane bound`);

    const releases = [];
    for (let i = 0; i < api.AI_MAX_IN_FLIGHT_PER_TAB; i += 1) {
        releases.push(acquire(7));
        advance(api.AI_MIN_REQUEST_INTERVAL_MS);
    }

    const refused = refusal(() => acquire(7));
    assert.ok(refused, 'the cap must refuse, not queue silently');
    assert.equal(refused.code, 'AI_RATE_LIMITED', 'and the refusal must be distinguishable');
    assert.match(refused.message, /in flight/i);

    // Releasing one makes room again, which is what makes this a cap and not a
    // permanent lockout.
    releases[0]();
    assert.doesNotThrow(() => acquire(7));
});

test('a burst from one tab is spaced by the minimum interval', () => {
    const { api, acquire, advance } = budget();
    assert.ok(api.AI_MIN_REQUEST_INTERVAL_MS >= 500,
        `a ${api.AI_MIN_REQUEST_INTERVAL_MS}ms floor does not throttle a burst`);

    acquire(7)();
    const tooSoon = refusal(() => acquire(7));
    assert.ok(tooSoon, 'a second request in the same instant must be refused');
    assert.equal(tooSoon.code, 'AI_RATE_LIMITED');
    assert.match(tooSoon.message, /too quickly/i);

    advance(api.AI_MIN_REQUEST_INTERVAL_MS);
    assert.doesNotThrow(() => acquire(7), 'and allowed once the interval has passed');
});

test('the budget is per tab, so one tab cannot starve another', () => {
    const { api, acquire, advance } = budget();
    for (let i = 0; i < api.AI_MAX_IN_FLIGHT_PER_TAB; i += 1) {
        acquire(7);
        advance(api.AI_MIN_REQUEST_INTERVAL_MS);
    }
    assert.ok(refusal(() => acquire(7)), 'tab 7 is at its cap');
    assert.doesNotThrow(() => acquire(8), 'tab 8 has spent nothing');
});

test('a popup-originated request has no tab and is not throttled', () => {
    const { acquire } = budget();
    for (let i = 0; i < 20; i += 1) {
        assert.doesNotThrow(() => acquire(undefined),
            'a popup caller is already trust-gated and must not be rate limited');
    }
});

test('releasing twice does not hand back a slot that was never taken', () => {
    // The counter is clamped at zero, so a double release only shows up while
    // another request is genuinely in flight: hold two, drop one of them twice,
    // and the second slot comes back for free.
    const { api, acquire, advance } = budget();
    const releaseFirst = acquire(7);
    advance(api.AI_MIN_REQUEST_INTERVAL_MS);
    acquire(7);

    releaseFirst();
    releaseFirst();

    advance(api.AI_MIN_REQUEST_INTERVAL_MS);
    assert.doesNotThrow(() => acquire(7), 'the one real release made room for one request');
    advance(api.AI_MIN_REQUEST_INTERVAL_MS);
    assert.ok(refusal(() => acquire(7)),
        'a double release must not inflate the budget past the cap');
});

test('the tab budget map is pruned so it cannot grow unbounded', () => {
    const { api } = budget();
    const now = 1_800_000_000_000;
    const stale = now - api.AI_TAB_BUDGET_TTL_MS - 1;
    for (let tabId = 0; tabId < 100; tabId += 1) {
        api._aiTabBudgets.set(tabId, { inFlight: 0, lastStart: stale });
    }
    // A slow request that started before the TTL is still in flight. Its entry
    // is old but dropping it loses the count, and the release that follows
    // then decrements a budget that no longer exists.
    api._aiTabBudgets.set(999, { inFlight: 1, lastStart: stale });

    api._pruneAiTabBudgets(now);
    assert.equal(api._aiTabBudgets.size, 1, 'idle, expired tabs are dropped');
    assert.ok(api._aiTabBudgets.has(999), 'a tab with a request in flight is kept');
});

test('the slot is always released, including on failure', () => {
    // The release call sits in the message handler's `finally`, which needs the
    // whole background message router to run; the acquire/release contract
    // itself is exercised above.
    const at = source.indexOf("msg.type === 'YTKIT_AI_SUMMARY_REQUEST'");
    assert.ok(at > 0);
    const body = source.slice(at, at + 1200);
    assert.match(body, /const release = acquireAiRequestSlot\(sender\)/);
    assert.match(body, /finally \{\s*release\(\);/,
        'a thrown request must not leak an in-flight slot forever');
});

test('the AI request goes through the same grant door as EXT_FETCH, before it spends', () => {
    // An ordering claim inside one async function. Running it would need the
    // credential vault, the provider allowlist and the runtime permission API;
    // the order of two statements is what the fix was, so the order is pinned.
    const at = source.indexOf('async function performAiSummaryRequest');
    assert.ok(at > 0, 'performAiSummaryRequest must exist');
    const body = source.slice(at, at + 3000);
    assert.match(body, /await requireRuntimeOptionalHostGrant\(validated\.url\)/,
        'an ungranted provider origin must not be reachable just because a credential exists');
    const grantAt = body.indexOf('requireRuntimeOptionalHostGrant');
    const fetchAt = body.indexOf('await fetch(validated.url');
    assert.ok(grantAt > 0 && fetchAt > 0);
    assert.ok(grantAt < fetchAt, 'the grant must be proven before the request is sent');
});

// ── cookie handoff binding ──────────────────────────────────────────────────

const BINDING_CHAIN = ['cookieHandoffSenderBinding', 'sameCookieHandoffBinding'];

const senderOn = (url, extra = {}) => ({ tab: { id: 4, url }, frameId: 0, url, ...extra });

test('a handoff binding still distinguishes documents when the host omits documentId', () => {
    const api = loadDeclarationsFrom(sources.background, BINDING_CHAIN, { URL });

    // Both sides hold documentId null, which is the degradation: `null === null`
    // used to pass and leave only tab+container bound.
    const issued = api.cookieHandoffSenderBinding(senderOn('https://www.youtube.com/watch?v=AAAAAAAAAAA'));
    const consumed = api.cookieHandoffSenderBinding(senderOn('https://www.youtube.com/watch?v=BBBBBBBBBBB'));
    assert.ok(issued && consumed, 'both senders must produce a binding');
    assert.equal(issued.documentId, null, 'this is the no-documentId host');
    assert.equal(consumed.documentId, null);

    assert.equal(api.sameCookieHandoffBinding(issued, consumed), false,
        'a same-tab navigation inside the TTL must not satisfy another document binding');
    assert.equal(api.sameCookieHandoffBinding(issued, issued), true,
        'and the same document must still match itself');
});

test('every advertised binding leg actually separates two senders', () => {
    const api = loadDeclarationsFrom(sources.background, BINDING_CHAIN, { URL });
    const base = api.cookieHandoffSenderBinding(
        senderOn('https://www.youtube.com/watch?v=AAAAAAAAAAA', { documentId: 'doc-1' }));
    assert.ok(base);

    const differing = {
        tabId: { ...base, tabId: base.tabId + 1 },
        frameId: { ...base, frameId: 1 },
        documentId: { ...base, documentId: 'doc-2' },
        documentUrl: { ...base, documentUrl: `${base.documentUrl}#other` },
        cookieStoreId: { ...base, cookieStoreId: 'container-2' },
    };
    for (const [leg, candidate] of Object.entries(differing)) {
        assert.equal(api.sameCookieHandoffBinding(base, candidate), false,
            `${leg} must be bound, or it is advertised and not enforced`);
    }
    assert.equal(api.sameCookieHandoffBinding(base, { ...base }), true,
        'an identical binding must still match');
});

test('a binding is refused for anything that is not a top-level YouTube frame', () => {
    const api = loadDeclarationsFrom(sources.background, BINDING_CHAIN, { URL });
    const refusals = [
        [senderOn('http://www.youtube.com/watch?v=A'), 'plain http'],
        [senderOn('https://youtube.com.evil.example/watch'), 'a lookalike host'],
        [senderOn('https://example.com/'), 'an unrelated origin'],
        [senderOn('not a url'), 'an unparseable url'],
        [{ ...senderOn('https://www.youtube.com/'), frameId: 3 }, 'a subframe'],
        [{ ...senderOn('https://www.youtube.com/'), tab: { id: -1 } }, 'no real tab'],
    ];
    for (const [sender, why] of refusals) {
        assert.equal(api.cookieHandoffSenderBinding(sender), null, `${why} must not bind`);
    }
});
