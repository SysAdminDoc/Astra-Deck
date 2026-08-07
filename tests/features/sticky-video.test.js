'use strict';

// Behaviour tests for the largest feature module in the repo (5,016 lines).
//
// sticky-video had no test file of its own — it was covered only indirectly,
// through theater-split.test.js and next-monolith-peel.test.js. These drive the
// real handlers through the factory's own dependency injection rather than
// pinning source text, because a source pin cannot tell a working handler from
// a broken one.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULE_PATH = '../../extension/features/sticky-video/index.js';

function loadModule() {
    const originalFeatures = globalThis.YTKitFeatures;
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.YTKitFeatures = {};
    const mod = require(MODULE_PATH);
    globalThis.YTKitFeatures = originalFeatures;
    return mod;
}

/** A node that answers querySelector from a caller-supplied selector map. */
function node(options = {}) {
    const {
        attrs = {},
        text = '',
        matchMap = {},
        hidden = undefined
    } = options;
    const attributes = new Map(Object.entries(attrs));
    return {
        textContent: text,
        hidden,
        hasAttribute: (name) => attributes.has(name),
        getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
        querySelector(selector) {
            for (const [key, value] of Object.entries(matchMap)) {
                if (selector.includes(key)) return value;
            }
            return null;
        },
        querySelectorAll(selector) {
            for (const [key, value] of Object.entries(matchMap)) {
                if (selector.includes(key)) return Array.isArray(value) ? value : [value];
            }
            return [];
        }
    };
}

function feature(deps = {}) {
    return loadModule().createStickyVideoFeature(deps);
}

// ── Panel-type resolution ──
//
// This is the decision that broke on premiered videos: a hidden/collapsed chat
// frame left the split pane transparent and empty because the code took the
// live branch anyway.

test('stickyVideo resolves a premiered video with collapsed chat to the comments panel', () => {
    const f = feature();
    const collapsedChat = node({ attrs: { collapsed: '' } });
    const below = node({ matchMap: { 'ytd-comments': node() } });

    assert.equal(f._resolveSplitPanelType('premiere', collapsedChat, below), 'standard',
        'a collapsed chat frame must not win over a real comments surface');
});

test('stickyVideo keeps the live pane only when a usable chat frame exists', () => {
    const f = feature();
    const liveChat = node();
    const below = node({ matchMap: { 'ytd-comments': node() } });

    assert.equal(f._resolveSplitPanelType('live', liveChat, below), 'live',
        'a live stream with open chat keeps the live pane');
    assert.equal(f._resolveSplitPanelType('live', node({ attrs: { collapsed: '' } }), below), 'standard',
        'chat disabled or members-only must fall back to comments, not an empty pane');
    assert.equal(f._resolveSplitPanelType('live', null, null), 'live',
        'with no comments surface to fall back to, the live pane is still correct');
});

test('stickyVideo treats hidden and aria-hidden chat frames as unusable', () => {
    const f = feature();
    assert.equal(f._isSplitChatCandidate(null), false);
    assert.equal(f._isSplitChatCandidate(node({ hidden: true })), false, 'hidden property');
    assert.equal(f._isSplitChatCandidate(node({ attrs: { hidden: '' } })), false, 'hidden attribute');
    assert.equal(f._isSplitChatCandidate(node({ attrs: { 'aria-hidden': 'true' } })), false, 'aria-hidden');
    assert.equal(f._isSplitChatCandidate(node()), true, 'a plain frame is usable');
});

test('stickyVideo detects a comments surface only from real comment renderers', () => {
    const f = feature();
    assert.equal(f._hasSplitCommentsSurface(node({ matchMap: { 'ytd-comments': node() } })), true);
    assert.equal(f._hasSplitCommentsSurface(node()), false);
    assert.equal(f._hasSplitCommentsSurface(null), false, 'a missing #below must not throw');
});

// ── Header metadata ──

test('stickyVideo formats view counts and rejects nonsense values', () => {
    const f = feature();
    assert.match(f._formatSplitViewCount(1234567), /views$/);
    assert.equal(f._formatSplitViewCount(0), new Intl.NumberFormat().format(0) + ' views');
    assert.equal(f._formatSplitViewCount(-5), '', 'a negative count renders nothing, not "-5 views"');
    assert.equal(f._formatSplitViewCount('not a number'), '');
    assert.equal(f._formatSplitViewCount(undefined), '');
    // Documented sharp edge: Number(null) is 0, not NaN, so an explicit null
    // renders "0 views". Callers must pass undefined for "unknown".
    assert.equal(f._formatSplitViewCount(null), `${new Intl.NumberFormat().format(0)} views`);
});

test('stickyVideo extracts an upload date from the localised metadata line', () => {
    const f = feature();

    // The real anchor text is a bullet-separated run; the date segment is the
    // one carrying a year or a streaming verb.
    const premiered = f._extractSplitFallbackDate('1,234 views • Premiered Mar 3, 2024');
    assert.ok(premiered instanceof Date, 'a "Premiered" segment must parse');
    assert.equal(premiered.getFullYear(), 2024);

    const streamed = f._extractSplitFallbackDate('Streamed live on Jan 5, 2023');
    assert.equal(streamed.getFullYear(), 2023, 'the streaming prefix must be stripped before parsing');

    // Non-breaking spaces are what YouTube actually emits here.
    const nbsp = f._extractSplitFallbackDate('1,234 views • Published on Feb 2, 2022');
    assert.equal(nbsp.getFullYear(), 2022);

    assert.equal(f._extractSplitFallbackDate(''), null);
    assert.equal(f._extractSplitFallbackDate('no date here at all'), null,
        'an unparseable string must return null rather than an Invalid Date');
    assert.equal(f._extractSplitFallbackDate(null), null);
});

test('stickyVideo formats a parsed date without throwing on locale differences', () => {
    const f = feature();
    const formatted = f._formatSplitUploadDate(new Date(Date.UTC(2024, 2, 3)));
    assert.equal(typeof formatted, 'string');
    assert.ok(formatted.length > 0);
    assert.match(formatted, /2024/);
});

// ── Dependency injection is real ──

test('stickyVideo reads its identity and page scope from injected PageTypes', () => {
    const f = feature({ PageTypes: { WATCH: 'watch-page-token' } });
    assert.equal(f.id, 'stickyVideo');
    assert.deepEqual(f.pages, ['watch-page-token'],
        'the feature must scope itself from the injected PageTypes, not a hardcoded string');
});

test('stickyVideo destroy is safe to call before init and unregisters its nav rule', () => {
    const removed = [];
    const originalDocument = globalThis.document;
    // destroy() reaches for document during teardown; a feature that was never
    // mounted must still tear down cleanly rather than throwing on a page it
    // never touched.
    globalThis.document = {
        body: { classList: { add() {}, remove() {}, contains: () => false } },
        documentElement: { classList: { add() {}, remove() {}, contains: () => false }, style: {} },
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {}
    };
    try {
        const f = feature({
            removeNavigateRule: (id) => removed.push(id),
            injectStyle: () => ({ remove() {} })
        });
        assert.doesNotThrow(() => f.destroy());
        assert.equal(f._isActive, false);
        assert.equal(f._isSplit, false);
        assert.deepEqual(removed, ['_theaterSplit'],
            'destroy must unregister the navigate rule it owns, or the rule leaks across features');
    } finally {
        globalThis.document = originalDocument;
    }
});
