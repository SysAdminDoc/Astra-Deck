'use strict';

// Selector-drift regression canary.
//
// YouTube re-renames CSS classes and element IDs without notice as A/B
// tests roll out (see HARDENING.md; memory youtube-kit.md notes YT filter
// chips replace grid via Polymer recycling without yt-navigate-finish).
// `mhtml/` holds Chrome-saved reference snapshots — captured at v3.20.1 —
// of the home grid and a watch page. The raw MHTML files are ~5 MB each
// and are gitignored by the blanket `*.mhtml` rule; their derived token
// signatures live in `tests/fixtures/*.tokens.txt` (regenerated via
// `npm run build:fixtures`).
//
// This harness asserts, for each critical selector our code depends on:
//   1. The selector appears as a token in the fixture signatures (i.e.
//      YouTube still exposes it in the reference pages).
//   2. The selector appears as a literal in extension/ytkit.js (i.e.
//      our code still references it).
//
// Both sides matter: if the fixture is refreshed and a selector has been
// renamed by YouTube, the token list loses it and this test fails —
// forcing us to update ytkit.js before shipping. If ytkit.js refactors
// drop the selector, the other side fails — forcing us to review whether
// the canary list is stale.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const REPO_ROOT = path.join(__dirname, '..');
const YTKIT_SOURCE = fs.readFileSync(
    path.join(REPO_ROOT, 'extension', 'ytkit.js'),
    'utf8'
);
const SELECTOR_PACK_SOURCES = fs.readdirSync(
    path.join(REPO_ROOT, 'extension', 'core', 'selector-packs')
)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => fs.readFileSync(
        path.join(REPO_ROOT, 'extension', 'core', 'selector-packs', file),
        'utf8'
    ));
const RUNTIME_SOURCE = [
    YTKIT_SOURCE,
    fs.readFileSync(path.join(REPO_ROOT, 'extension', 'core', 'selectors.js'), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, 'extension', 'core', 'player.js'), 'utf8'),
    ...SELECTOR_PACK_SOURCES,
].join('\n');

function loadTokens(fixtureName) {
    const p = path.join(REPO_ROOT, 'tests', 'fixtures', fixtureName);
    const raw = fs.readFileSync(p, 'utf8');
    return new Set(
        raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'))
    );
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sourceReferencesToken(selector) {
    const token = escapeRegExp(selector);
    return new RegExp(`(^|[^A-Za-z0-9_-])${token}($|[^A-Za-z0-9_-])`).test(RUNTIME_SOURCE);
}

function loadSelectorPackContext() {
    const ctx = {
        console,
        Date,
        Math,
        globalThis: null,
        dispatchEvent() {},
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    const packsDir = path.join(REPO_ROOT, 'extension', 'core', 'selector-packs');
    const packFiles = fs.readdirSync(packsDir)
        .filter((file) => file.endsWith('.js'))
        .sort();
    const files = [
        'extension/core/registry.js',
        ...packFiles.map((file) => `extension/core/selector-packs/${file}`),
        'extension/core/selectors.js',
    ];

    for (const rel of files) {
        const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        vm.runInContext(src, ctx, { filename: rel });
    }
    return ctx.globalThis.YTKitCore;
}

function loadSelectorSurfaceMatches() {
    const p = path.join(REPO_ROOT, 'tests', 'fixtures', 'selector-surface-matches.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function selectorMatchRow(surface, selector) {
    return [...surface.stable, ...surface.fallback]
        .find((row) => row.selector === selector);
}

const FIXTURES = {
    home: 'yt-home.tokens.txt',
    watch: 'yt-watch.tokens.txt',
    liveChat: 'yt-live-chat.tokens.txt',
};

// Critical selectors. Each must appear as a token in at least one fixture
// AND as a literal selector token in the extension runtime. Use bare
// identifiers (no `#` or `.`): tokens are raw ids/classes, runtime selector
// strings embed them.
//
// Coverage rationale (v3.20.3+ expansions):
//   - Layout selectors (ytd-app, ytd-watch-flexy, ytd-watch-metadata,
//     ytd-comments) catch SPA-shape changes that orphan our content
//     scripts.
//   - Player API surfaces (movie_player, html5-video-container) catch
//     the MAIN-world bridge breaking.
//   - Player CHROME controls (ytp-chrome-bottom, ytp-progress-bar,
//     ytp-progress-bar-padding, ytp-play-button, ytp-settings-button,
//     ytp-fullscreen-button, ytp-time-display, ytp-tooltip-text) catch
//     DOM rewrites of the control and overlay tier — the surface where
//     most ad-blocking + theater-split + SponsorBlock + per-feature
//     hooks live.
//   - Feed grid (ytd-rich-grid-renderer / ytd-rich-item-renderer) catches
//     home/subs/results renderer renames.
//   - Notifications (ytd-notification-topbar-button-renderer /
//     yt-icon-badge-shape) catch topbar and menu badge rewrites.
//   - Comments DOM in BOTH shapes:
//        * old: ytd-comment-thread-renderer
//        * new: ytd-comment-view-model
//     YouTube ships the new shape via A/B; theater-split v1.0.6 already
//     had to follow this rename. Canary keeps both alive until the old
//     shape is fully retired.
//   - Text rendering wrappers (yt-formatted-string, yt-attributed-string)
//     catch the recurring text-DOM rewrite that broke comment-text
//     selection in v1.0.6. yt-attributed-string is the newer shape;
//     yt-formatted-string is the older one still used widely.
const CRITICAL_SELECTORS = [
    // SPA + layout
    'ytd-app',
    'ytd-watch-flexy',
    'ytd-watch-metadata',
    'ytd-comments',
    // Player API
    'movie_player',
    'html5-video-container',
    // Player chrome / controls
    'ytp-chrome-bottom',
    'ytp-progress-bar',
    'ytp-progress-bar-padding',
    'ytp-play-button',
    'ytp-settings-button',
    'ytp-fullscreen-button',
    'ytp-time-display',
    'ytp-tooltip-text',
    // Delhi / liquid-glass player chrome (DOM-probed 2026-06-04)
    'ytp-delhi-modern',
    'ytp-overflow-panel',
    'ytp-time-wrapper-delhi',
    // Feed / grid
    'ytd-rich-grid-renderer',
    'ytd-rich-item-renderer',
    'yt-lockup-view-model',
    // Notifications
    'ytd-notification-topbar-button-renderer',
    'yt-icon-badge-shape',
    // Comments — both DOM shapes
    'ytd-comment-thread-renderer',
    'ytd-comment-view-model',
    // Text rendering wrappers — old + new shapes
    'yt-formatted-string',
    'yt-attributed-string',
];

// v3.23.0 N6: "Liquid glass" player chrome redesign — rollout watchlist.
//
// YouTube began rolling out a redesigned video player in late 2025 with a
// "liquid glass" aesthetic: pill-shaped action container in the chrome,
// no dim-on-pause, smaller double-tap-to-skip animation, dynamic like
// animations, threaded comments, simplified Watch Later flow.
// See: https://9to5google.com/2025/10/14/youtube-video-player-redesign-more/
//      https://www.techspot.com/news/109892-youtube-modernizes-video-player...
//
// The concrete DOM-probed shell tokens (`ytp-delhi-modern`,
// `ytp-overflow-panel`, `ytp-time-wrapper-delhi`) are now promoted to
// CRITICAL_SELECTORS. The list below keeps unresolved transition surfaces
// visible until a full MHTML capture succeeds; before a release that ships
// post-rollout changes the maintainer must:
//
//   1. Capture a fresh MHTML on a watch page that has the new chrome
//      enabled (toggle via the per-channel Lab opt-in or wait for full
//      rollout, then File → Save Page As → MHTML in Chrome).
//   2. `npm run build:fixtures` to regenerate tokens.
//   3. For each surface below, identify the new selector and promote it
//      to CRITICAL_SELECTORS (keep the old one too during the transition
//      window so users on the legacy chrome don't regress).
//   4. Document selector deltas in HARDENING.md H21.
//
// This array exists as a documentation anchor + a future-test surface;
// it doesn't drive assertions today.
const LIQUID_GLASS_WATCHLIST = [
    // Action container (formerly individual ytp-* buttons, now a pill).
    // Likely new wrapper: `ytp-action-pill`, `ytp-actions-container`, or
    // similar. Affects: download/PiP/speed buttons we inject into chrome.
    'ytp-action-pill (placeholder)',
    // Pause overlay — no longer dims; if we relied on the `ytp-paused-mode`
    // class for our overlay timing we need a new signal.
    'ytp-paused-mode (legacy)',
    // Threaded comments — the new comment-shape rollout extends the
    // ytd-comment-view-model that's already in CRITICAL_SELECTORS but may
    // introduce a `ytd-comment-thread-replies-renderer` rename.
    'ytd-comment-thread-replies-renderer (placeholder)',
    // Dynamic like animation host. May affect creator-comment-highlight
    // and any per-like CSS we inject.
    'ytd-like-button-renderer (legacy)',
];

const LIVE_CHAT_PLACEHOLDER_SELECTORS = [
    'ytd-live-chat-frame',
    'yt-live-chat-renderer',
    'yt-live-chat-text-message-renderer',
];

test('liquid-glass watchlist exists as a transition-period anchor (informational)', () => {
    // This test is a documentation hook, not an assertion of state. It
    // ensures the watchlist array is non-empty so future maintainers see
    // the audit deferment in CI output. Promote items here to
    // CRITICAL_SELECTORS once fresh MHTML captures land.
    assert.ok(LIQUID_GLASS_WATCHLIST.length >= 1,
        'LIQUID_GLASS_WATCHLIST must document at least one transition selector');
});

test('live-chat placeholder selectors remain promoted after the fresh fixture refresh', () => {
    for (const selector of LIVE_CHAT_PLACEHOLDER_SELECTORS) {
        assert.ok(
            sourceReferencesToken(selector),
            `Live-chat placeholder selector "${selector}" should remain referenced by runtime source until a live-chat MHTML capture lands.`
        );
    }
});

test('fresh-capture fixture workflow is documented', () => {
    const docPath = path.join(REPO_ROOT, 'docs', 'selector-fixture-workflow.md');
    const doc = fs.readFileSync(docPath, 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const captureScript = fs.readFileSync(
        path.join(REPO_ROOT, 'scripts', 'capture-watch-mhtml.js'),
        'utf8'
    );

    assert.match(doc, /File > Save Page As > Webpage, Single File/);
    assert.match(doc, /npm run capture:watch/);
    assert.match(doc, /Page\.stopLoading/);
    assert.match(doc, /npm run build:fixtures/);
    assert.match(doc, /ytkit\.exportSelectorHealth\(\)/);
    assert.equal(pkg.scripts['capture:watch'], 'node scripts/capture-watch-mhtml.js');
    assert.match(captureScript, /Page\.captureSnapshot/);
    assert.match(captureScript, /dom-mhtml-fallback/);
    assert.match(captureScript, /ytp-delhi-modern/);
});

test('selector fixtures exist and contain a non-trivial token set', () => {
    for (const [label, file] of Object.entries({
        home: FIXTURES.home,
        watch: FIXTURES.watch,
    })) {
        const tokens = loadTokens(file);
        assert.ok(
            tokens.size >= 30,
            `${label} fixture (${file}) has only ${tokens.size} tokens — likely stale or misbuilt. Run: npm run build:fixtures`
        );
        assert.ok(
            tokens.has('ytd-app'),
            `${label} fixture must include ytd-app as a sanity baseline`
        );
    }
});

test('live-chat fixture contains iframe-document selector tokens', () => {
    const tokens = loadTokens(FIXTURES.liveChat);
    const expected = [
        'yt-live-chat-app',
        'yt-live-chat-renderer',
        'yt-live-chat-item-list-renderer',
        'yt-live-chat-text-message-renderer',
        'yt-live-chat-message-input-renderer',
    ];

    assert.ok(
        tokens.size >= 50,
        `live-chat fixture (${FIXTURES.liveChat}) has only ${tokens.size} tokens — likely stale or misbuilt. Run: npm run build:fixtures`
    );

    for (const selector of expected) {
        assert.ok(
            tokens.has(selector),
            `live-chat fixture must include ${selector} from the popout chat MHTML capture`
        );
    }
});

test('selector surface match fixture stays synced to player-chrome and live-chat packs', () => {
    const fixture = loadSelectorSurfaceMatches();
    const core = loadSelectorPackContext();
    const expectedSurfaces = ['liveChat', 'playerChrome'];

    assert.equal(fixture.schemaVersion, 1);
    assert.equal(fixture.generatedBy, 'scripts/build-selector-fixtures.js');
    assert.equal(fixture.matcher, 'decoded-mhtml-dom-subset');
    assert.deepEqual(Object.keys(fixture.surfaces).sort(), expectedSurfaces);

    for (const surfaceName of expectedSurfaces) {
        const snapshot = fixture.surfaces[surfaceName];
        const live = core.SurfaceSelectorMap[surfaceName];
        assert.ok(snapshot, `${surfaceName} must exist in selector-surface-matches.json`);
        assert.ok(live, `${surfaceName} must exist in SurfaceSelectorMap`);
        assert.ok(snapshot.elementCount > 100,
            `${surfaceName} fixture parsed only ${snapshot.elementCount} elements`);
        assert.deepEqual(
            snapshot.stable.map((row) => row.selector),
            [...live.stable],
            `${surfaceName} stable selectors changed; regenerate with npm run build:fixtures`
        );
        assert.deepEqual(
            snapshot.fallback.map((row) => row.selector),
            [...live.fallback],
            `${surfaceName} fallback selectors changed; regenerate with npm run build:fixtures`
        );
    }
});

test('selector surface match fixture proves live-chat and liquid-glass selectors resolve', () => {
    const fixture = loadSelectorSurfaceMatches();
    const required = {
        playerChrome: [
            '.ytp-chrome-bottom',
            '.ytp-delhi-modern .ytp-chrome-bottom',
            '.ytp-delhi-modern',
            '.ytp-overflow-panel',
        ],
        liveChat: [
            'yt-live-chat-app',
            'yt-live-chat-renderer',
            'yt-live-chat-item-list-renderer',
            'yt-live-chat-text-message-renderer',
        ],
    };

    for (const [surfaceName, selectors] of Object.entries(required)) {
        const surface = fixture.surfaces[surfaceName];
        assert.ok(surface, `${surfaceName} must be present in selector-surface-matches.json`);

        for (const selector of selectors) {
            const row = selectorMatchRow(surface, selector);
            assert.ok(row, `${surfaceName} must record selector "${selector}"`);
            assert.equal(row.matched, true,
                `${surfaceName} selector "${selector}" no longer matches ${surface.source}; refresh selector packs before shipping`);
            assert.ok(row.matchCount > 0,
                `${surfaceName} selector "${selector}" must have a positive fixture match count`);
            assert.ok(surface.matchedSelectors.includes(selector),
                `${surfaceName} matchedSelectors must include "${selector}"`);
        }
    }
});

for (const selector of CRITICAL_SELECTORS) {
    test(`Selector "${selector}" survives in fixture signatures AND is referenced by runtime source`, () => {
        const home = loadTokens(FIXTURES.home);
        const watch = loadTokens(FIXTURES.watch);
        const inFixture = home.has(selector) || watch.has(selector);

        assert.ok(
            inFixture,
            `Selector "${selector}" is absent from both fixture token sets. ` +
            `If the mhtml/ captures were just refreshed and the fixtures rebuilt, ` +
            `YouTube likely renamed the selector — update extension/ytkit.js to match, ` +
            `then update this canary list.`
        );

        assert.ok(
            sourceReferencesToken(selector),
            `Selector "${selector}" is no longer referenced by extension runtime source. ` +
            `If the feature using it was retired, remove it from CRITICAL_SELECTORS in this test; ` +
            `otherwise the selector was lost in a refactor and needs to be restored.`
        );
    });
}
