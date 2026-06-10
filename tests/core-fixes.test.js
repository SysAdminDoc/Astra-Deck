'use strict';

// Focused regression coverage for the verified audit fixes in
// extension/core/transcript-service.js, extension/core/predicate-sandbox.js,
// extension/core/selectors.js, extension/core/registry.js, and
// extension/features/chat-style-comments/index.js.
//
// Core modules are IIFEs that attach factories to globalThis.YTKitCore —
// load them the same way tests/core-transcript-service.test.js does:
// prime a fresh YTKitCore namespace, then eval the source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function loadCoreModule(relPath, primeCore = {}) {
    globalThis.YTKitCore = primeCore;
    const src = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(src);
    return globalThis.YTKitCore;
}

// ── Fix 1: method 5 must not fabricate a baseUrl from a continuation token ──

test('DOM panel scrape rejects continuation-token-only language menus instead of fabricating baseUrls', async () => {
    const core = loadCoreModule('extension/core/transcript-service.js');
    const svc = core.createTranscriptService({});

    const renderer = {
        data: {
            content: {
                transcriptSearchPanelRenderer: {
                    footer: {
                        transcriptFooterRenderer: {
                            languageMenu: {
                                sortFilterSubMenuRenderer: {
                                    subMenuItems: [{
                                        title: 'English',
                                        languageCode: 'en',
                                        continuation: {
                                            reloadContinuationData: {
                                                continuation: 'CikSJxIL_continuation_token'
                                            }
                                        }
                                    }]
                                }
                            }
                        }
                    }
                }
            }
        }
    };
    const hadDocument = 'document' in globalThis;
    const previousDocument = globalThis.document;
    globalThis.document = {
        querySelector(selector) {
            return selector === 'ytd-transcript-renderer' ? renderer : null;
        },
        querySelectorAll() { return []; }
    };
    try {
        await assert.rejects(
            () => svc._method5_DOMPanelScrape('abc123'),
            /no fetchable caption URLs/,
            'continuation tokens are not timedtext URLs — method 5 must report no tracks'
        );
    } finally {
        if (hadDocument) globalThis.document = previousDocument;
        else delete globalThis.document;
    }
});

// ── Fix 2: empty-but-valid json3 must not block the xml format fallback ──

test('_fetchTranscriptContent falls through to xml when json3 parses valid but empty', async () => {
    const core = loadCoreModule('extension/core/transcript-service.js');
    const fetchedUrls = [];
    const svc = core.createTranscriptService({
        extensionFetchText: async ({ url }) => {
            fetchedUrls.push(url);
            if (url.includes('fmt=json3')) {
                // Valid json3 body with zero usable events — previously this
                // returned [] immediately and the xml fallback never ran.
                return { text: JSON.stringify({ events: [] }) };
            }
            return { text: '<transcript><text start="1.0" dur="2.0">Hello world</text></transcript>' };
        }
    });

    const segments = await svc._fetchTranscriptContent('https://www.youtube.com/api/timedtext?v=abc');
    assert.equal(fetchedUrls.length, 2, 'both formats must be attempted');
    assert.ok(fetchedUrls[0].includes('fmt=json3'), 'json3 is tried first');
    assert.ok(!fetchedUrls[1].includes('fmt=json3'), 'xml fallback fetches the bare baseUrl');
    assert.equal(segments.length, 1);
    assert.equal(segments[0].text, 'Hello world');
    assert.equal(segments[0].startMs, 1000);
    assert.equal(segments[0].endMs, 3000);
});

test('_fetchTranscriptContent returns the empty parse only after every format was tried', async () => {
    const core = loadCoreModule('extension/core/transcript-service.js');
    const fetchedUrls = [];
    const svc = core.createTranscriptService({
        extensionFetchText: async ({ url }) => {
            fetchedUrls.push(url);
            if (url.includes('fmt=json3')) return { text: JSON.stringify({ events: [] }) };
            return { text: '<transcript></transcript>' };
        }
    });

    const segments = await svc._fetchTranscriptContent('https://www.youtube.com/api/timedtext?v=abc');
    assert.equal(fetchedUrls.length, 2, 'an empty parse must not short-circuit the failover loop');
    assert.deepEqual(segments, [], 'a genuinely empty transcript still surfaces as an empty result, not a throw');
});

// ── Fix 3: malformed number literals are a compile-time PredicateError ──

test('PredicateSandbox compile rejects malformed number literals like 1.2.3', () => {
    const core = loadCoreModule('extension/core/predicate-sandbox.js');
    const { compile } = core.createPredicateSandbox();

    const result = compile('ctx.durationSeconds > 1.2.3');
    assert.equal(result.ok, false, 'NaN literals must fail at compile time, not build an always-false predicate');
    assert.match(result.error, /Invalid number literal/);
    assert.equal(result.position, 'ctx.durationSeconds > '.length, 'error position must point at the bad literal');

    // Positive control: well-formed decimals still compile.
    const valid = compile('ctx.durationSeconds > 1.5');
    assert.equal(valid.ok, true);
});

// ── Fix 4: waitForSurfaceElement(...).cancel() must settle the promise ──

test('waitForSurfaceElement cancel() resolves null promptly instead of hanging awaiters', async () => {
    const core = loadCoreModule('extension/core/selectors.js', {
        // core.waitForElement path: never finds the element, returns a
        // cleanup function — exactly the shape ytkit.js provides.
        waitForElement() { return () => {}; }
    });

    const hadDocument = 'document' in globalThis;
    const previousDocument = globalThis.document;
    globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };
    try {
        const promise = core.waitForSurfaceElement(['#never-matches'], { timeout: 60000 });
        assert.equal(typeof promise.cancel, 'function');
        promise.cancel();

        const outcome = await Promise.race([
            promise,
            new Promise((resolve) => { setTimeout(() => resolve('hung'), 250); })
        ]);
        assert.equal(outcome, null, 'cancel() must resolve(null) — awaiting callers were hanging forever');
    } finally {
        if (hadDocument) globalThis.document = previousDocument;
        else delete globalThis.document;
    }
});

// ── Fix 5: registry clear() must also clear the health map ──

test('featureRegistry clear() drops health entries so the snapshot has no ghosts', () => {
    const core = loadCoreModule('extension/core/registry.js');
    const registry = core.createFeatureRegistry({ logger: { error() {} } });

    registry.register({ id: 'alpha', destroy() {} });
    registry.register({ id: 'beta' });
    assert.ok(registry.getHealthSnapshot().length >= 2, 'registration populates the health map');

    registry.clear();
    assert.deepEqual(registry.getHealthSnapshot(), [],
        'clear() must empty health alongside features/cleanups — ghost entries reported forever otherwise');
});

// ── Fix 6: queued rAF must not re-tag the DOM after runtime destroy() ──

test('chatStyleComments runtime ignores a rAF queued before destroy() and re-arms on init()', () => {
    const MODULE_PATH = '../extension/features/chat-style-comments/index.js';
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    globalThis.YTKitFeatures = originalFeatures;

    const rafQueue = [];
    let queryCalls = 0;
    let mutationHandler = null;
    const doc = { querySelectorAll() { queryCalls += 1; return []; } };
    const win = { addEventListener() {}, removeEventListener() {} };
    const runtime = mod.createChatStyleCommentsRuntime({
        document: doc,
        window: win,
        requestAnimationFrame(fn) { rafQueue.push(fn); },
        addMutationRule(id, handler) { mutationHandler = handler; },
        removeMutationRule() {}
    });

    runtime.init();
    assert.equal(typeof mutationHandler, 'function');

    // Queue a rAF, then destroy BEFORE it fires — the late callback must not
    // call back into processAllComments and re-tag what cleanup just stripped.
    mutationHandler();
    assert.equal(rafQueue.length, 1);
    runtime.destroy();
    const callsAfterDestroy = queryCalls;
    rafQueue.splice(0).forEach((fn) => fn());
    assert.equal(queryCalls, callsAfterDestroy,
        'a rAF queued before destroy() must be a no-op after destroy()');

    // The destroyed flag must reset on re-init so the runtime keeps working.
    runtime.init();
    mutationHandler();
    const callsBeforeRaf = queryCalls;
    rafQueue.splice(0).forEach((fn) => fn());
    assert.ok(queryCalls > callsBeforeRaf, 'after re-init the mutation pipeline must process again');
});
