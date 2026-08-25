'use strict';

// Every place that compiles a RegExp out of user or remote text must use the
// same guard. Two of them used to carry a hand-rolled subset with only the
// three flat heuristics, which let the polynomial shapes straight through:
// `.*.*.*.*.*.*z` and `(a+)(a+)(a+)(a+)(a+)(a+)b` each burn hundreds of
// milliseconds of main thread per `test()` on an ordinary-length video title,
// and Video Hider runs one per feed card against both the title and the
// channel name. A hostile community filter list, or a crafted settings backup,
// wedged the tab.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

function loadGuard() {
    const context = { globalThis: null, console };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('extension', 'core', 'predicate-sandbox.js'), context, {
        filename: 'extension/core/predicate-sandbox.js'
    });
    return context.globalThis.YTKitCore.hasUnsafeRegexQuantifiers;
}

// Patterns measured against a 47-character title on this machine. Each one
// passed the old three-heuristic guard.
const CATASTROPHIC = [
    '.*.*.*.*.*.*z',
    '(a+)(a+)(a+)(a+)(a+)(a+)b',
    '(.*)(.*)(.*)(.*)(.*)x',
    'a{0,40}a{0,40}a{0,40}a{0,40}a{0,40}b',
    '(?:a+){7}b',
    '(a|a)+$',
    '((ab)*)*c'
];

// Filters a real person writes. The guard must not become unusable.
const LEGITIMATE = [
    'sponsored|promo',
    '^Free .* Course$',
    '\\bshorts?\\b',
    '(react|vue|angular) tutorial',
    'FULL (ALBUM|MOVIE)',
    '[0-9]{4} highlights',
    'crypto.*giveaway'
];

test('the shared guard rejects every catastrophic pattern', () => {
    const hasUnsafeRegexQuantifiers = loadGuard();
    assert.equal(typeof hasUnsafeRegexQuantifiers, 'function',
        'predicate-sandbox must export the guard for the other call sites');
    for (const pattern of CATASTROPHIC) {
        assert.equal(hasUnsafeRegexQuantifiers(pattern), true,
            `${pattern} backtracks catastrophically and must be refused`);
    }
});

test('the shared guard still accepts filters people actually write', () => {
    const hasUnsafeRegexQuantifiers = loadGuard();
    for (const pattern of LEGITIMATE) {
        assert.equal(hasUnsafeRegexQuantifiers(pattern), false,
            `${pattern} is an ordinary filter and must keep working`);
    }
});

test('the guard bounds pattern length as well as shape', () => {
    const hasUnsafeRegexQuantifiers = loadGuard();
    assert.equal(hasUnsafeRegexQuantifiers('a'.repeat(200)), false);
    assert.equal(hasUnsafeRegexQuantifiers('a'.repeat(201)), true,
        'a filter list can send 20000 characters; bounded source bounds the worst case');
    assert.equal(hasUnsafeRegexQuantifiers(null), true, 'a non-string is not a safe pattern');
});

test('every RegExp built from filter text goes through the shared guard', () => {
    // The defect was two private copies drifting away from the real guard, so
    // pin the reuse rather than the heuristics.
    const sites = [
        ['video-hider', read('extension', 'features', 'video-hider', 'index.js')],
        ['ytkit.js CommentFilter', read('extension', 'ytkit.js')]
    ];
    for (const [label, source] of sites) {
        assert.ok(source.includes('globalThis.YTKitCore?.hasUnsafeRegexQuantifiers'),
            `${label} must use the shared guard, not a local subset`);
        assert.ok(!source.includes('const hasNestedQuantifiers ='),
            `${label} must not reintroduce a private nested-quantifier guard`);
    }
});

test('a missing guard refuses the pattern rather than compiling it', () => {
    // The first attempt at this fix kept an inline fallback copy. It could
    // not see `((ab)*)*` without duplicating the whole nesting scan, which is
    // how the two weak copies came about in the first place. Both sites fail
    // closed instead: no guard, no regex filter. Plain keyword filters are
    // unaffected either way.
    const sites = [
        ['video-hider', read('extension', 'features', 'video-hider', 'index.js')],
        ['ytkit.js CommentFilter', read('extension', 'ytkit.js')]
    ];
    for (const [label, source] of sites) {
        assert.ok(
            source.includes("if (typeof unsafeRegex !== 'function' || unsafeRegex(pat)) {"),
            `${label} must refuse the pattern when the shared guard is unavailable`
        );
        assert.ok(!/const unsafeRegex = [^;]*\?[\s\S]{0,400}?\|\|\s*\//.test(source),
            `${label} must not carry a second, weaker copy of the guard`);
    }
});
