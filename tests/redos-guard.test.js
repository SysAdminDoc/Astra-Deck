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
    vm.runInContext(read('extension', 'core', 'regex-safety.js'), context, {
        filename: 'extension/core/regex-safety.js'
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
        'core/regex-safety.js must export the guard for every call site');
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

test('the guard reaches every surface that compiles a filter regex', () => {
    // The first version of this fix put the guard in
    // core/predicate-sandbox.js, which check-userscript-drift.js classifies as
    // intentional-extension-only. Video Hider and the comment filter both ship
    // in the userscript bundle, so the guard was simply absent there and the
    // fail-closed branch silently disabled every userscript user's regex
    // keyword filters. It lives in its own shipped module now.
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    for (const contentScript of manifest.content_scripts) {
        const js = contentScript.js || [];
        if (!js.includes('features/video-hider/index.js')) continue;
        assert.ok(js.includes('core/regex-safety.js'),
            'a content script running Video Hider must also load the guard');
        assert.ok(js.indexOf('core/regex-safety.js') < js.indexOf('features/video-hider/index.js'),
            'and load it first');
    }

    const bundle = fs.readFileSync(path.join(repoRoot, 'sync-userscript.js'), 'utf8');
    assert.ok(bundle.includes("'extension/core/regex-safety.js',"),
        'the userscript bundle must ship the guard');

    const core = fs.readFileSync(path.join(repoRoot, 'YTKit-core.user.js'), 'utf8');
    assert.ok(core.includes('function hasUnsafeRegexQuantifiers(pattern) {'),
        'the built userscript library must contain the guard body, not just its callers');
    assert.ok(core.includes('features/video-hider/index.js'),
        'the built library ships Video Hider, which is why the guard has to be there');
});

test('the guard has exactly one implementation in the whole tree', () => {
    // Three copies existed before this release: video-hider, the monolith
    // comment filter, and a third inlined in YTKit.user.js, the script users
    // actually install. Each was a subset of the real guard, and the third
    // survived the first two rounds of this fix because nothing looked
    // outside extension/. Pin the shape, not a file list, so a fourth copy
    // anywhere fails.
    const GROUP_INNER = "[^()]*(?:[+*?]|";
    const carriers = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name === ".git"
                || entry.name === "build" || entry.name === "archive"
                || entry.name === "_locales") continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!full.endsWith(".js")) continue;
            const rel = path.relative(repoRoot, full).replace(/\\/g, "/");
            // The tests themselves quote the pattern in order to forbid it.
            if (rel.startsWith("tests/")) continue;
            if (fs.readFileSync(full, "utf8").includes(GROUP_INNER)) carriers.push(rel);
        }
    };
    walk(repoRoot);

    // core/regex-safety.js is the implementation; YTKit-core.user.js is its
    // generated copy in the userscript library. Nothing else may carry it.
    assert.deepEqual(carriers.sort(),
        ["YTKit-core.user.js", "extension/core/regex-safety.js"],
        "the ReDoS guard must exist in exactly one place plus its generated bundle");
});

test('the installed userscript uses the shared guard, not a private one', () => {
    // YTKit.user.js is hand-maintained: sync-userscript.js only rewrites its
    // metadata block, so a fix to extension/ does NOT reach it. It @requires
    // YTKit-core.user.js, which is where the guard now lives.
    const main = fs.readFileSync(path.join(repoRoot, "YTKit.user.js"), "utf8");
    assert.ok(main.includes("globalThis.YTKitCore?.hasUnsafeRegexQuantifiers"),
        "the installed userscript must read the shared guard");
    assert.ok(main.includes("if (typeof unsafeRegex !== 'function' || unsafeRegex(regexMatch[1])) {"),
        "and refuse the pattern when the core library did not load");
    assert.ok(main.includes("@require      https://raw.githubusercontent.com/SysAdminDoc/Astra-Deck/main/YTKit-core.user.js"),
        "which is only reachable because it requires the core library");
});
