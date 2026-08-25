'use strict';

// Per-area test bed for the DeArrow feature.
//
// NX12 modularization seed (v3.23.0). This file is the canonical home
// for future DeArrow-specific regressions; existing DeArrow tests in
// `tests/hardening.test.js` may migrate here incrementally — until then,
// keep new DeArrow regressions HERE and old ones THERE rather than
// duplicating.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { sources, extractFeatureBlock } = require('../helpers/source');
const { createDeArrowFeature } = require('../../extension/features/dearrow');
const {
    findSettingEntry,
    getStoreSafeKeys,
    getGithubFullKeys
} = require('../../extension/core/settings-schema');
const defaultSettings = require('../../extension/default-settings.json');
const englishMessages = require('../../extension/_locales/en/messages.json');

const dearrowModulePath = path.join(
    __dirname, '..', '..', 'extension', 'features', 'dearrow', 'index.js'
);
const dearrowModuleSource = fs.readFileSync(dearrowModulePath, 'utf8');
const userscriptSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'YTKit.user.js'), 'utf8'
);

const SURFACE_KEYS = Object.freeze([
    'daSurfaceWatch',
    'daSurfaceRelated',
    'daSurfaceHome',
    'daSurfaceSearch',
    'daSurfaceSubscriptions',
    'daSurfacePlaylist'
]);

function withGlobals(values, callback) {
    const prior = new Map();
    for (const [key, value] of Object.entries(values)) {
        prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, {
            configurable: true,
            writable: true,
            value
        });
    }
    return Promise.resolve()
        .then(callback)
        .finally(() => {
            for (const [key, descriptor] of prior) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete globalThis[key];
            }
        });
}

function surfaceSettings(overrides = {}) {
    return {
        daSurfaceWatch: true,
        daSurfaceRelated: true,
        daSurfaceHome: true,
        daSurfaceSearch: true,
        daSurfaceSubscriptions: true,
        daSurfacePlaylist: true,
        daReplaceTitles: true,
        daReplaceThumbs: true,
        daTitleFormat: 'sentence',
        daFallbackFormat: false,
        daCacheTTL: '4',
        ...overrides
    };
}

function pageDocument({ surface = '', renderers = [], watchTitle = null } = {}) {
    const browse = ['home', 'subscriptions', 'playlist'].includes(surface)
        ? { getAttribute: (name) => name === 'page-subtype' ? surface : null }
        : null;
    return {
        body: {},
        querySelector(selector) {
            if (selector === 'ytd-search') return surface === 'search' ? {} : null;
            if (selector === 'ytd-browse[page-subtype], ytd-browse') return browse;
            return watchTitle;
        },
        querySelectorAll(selector) {
            return selector.startsWith('ytd-rich-item-renderer') ? renderers : [];
        }
    };
}

test('DeArrow surface masks are visible, portable settings in both vehicles', () => {
    const storeSafeKeys = new Set(getStoreSafeKeys());
    for (const key of SURFACE_KEYS) {
        const entry = findSettingEntry(key);
        assert.ok(entry, `${key} must be part of the settings schema`);
        assert.equal(entry.defaultValue, true, `${key} must preserve existing behaviour by default`);
        assert.equal(entry.risk, 'api', `${key} controls network-backed work`);
        assert.equal(entry.profile, 'both', `${key} must import and export in both build profiles`);
        assert.equal(entry.vehicle, 'both', `${key} must be classified for extension and userscript`);
        assert.equal(entry.internal, false, `${key} must remain visible in the settings panel`);
        assert.equal(defaultSettings[key], true, `${key} must round-trip through default settings`);
        assert.ok(storeSafeKeys.has(key), `${key} must survive store-safe import and export`);
        assert.match(sources.ytkit, new RegExp(`id: '${key}'[\\s\\S]{0,320}parentId: 'deArrow'`),
            `${key} must render under DeArrow in the extension settings panel`);
        assert.match(userscriptSource, new RegExp(`id: '${key}'[\\s\\S]{0,320}parentId: 'deArrow'`),
            `${key} must render under DeArrow in the userscript settings panel`);
        assert.ok(englishMessages[`feature_${key}_name`]?.message,
            `${key} must have a user-facing name`);
        assert.ok(englishMessages[`feature_${key}_desc`]?.message,
            `${key} must explain what the mask excludes`);
    }
});

test('DeArrow attributes all six supported surfaces structurally', () => {
    const cases = [
        ['related', false, (selector) => selector === 'ytd-watch-next-secondary-results-renderer' ? {} : null],
        ['playlist', true, (selector) => selector.includes('ytd-playlist-panel-renderer') ? {} : null],
        ['search', false, (selector) => selector === 'ytd-search' ? {} : null],
        ['home', false, (selector) => selector === 'ytd-browse'
            ? { getAttribute: () => 'home' } : null],
        ['subscriptions', false, (selector) => selector === 'ytd-browse'
            ? { getAttribute: () => 'subscriptions' } : null],
        ['watch', true, () => null]
    ];
    for (const [expected, watch, closest] of cases) {
        const feature = createDeArrowFeature({
            appState: { settings: surfaceSettings() },
            isWatchPagePath: () => watch
        });
        assert.equal(feature._surfaceOf({ closest }), expected);
    }
});

test('an excluded feed surface attaches no observer', async () => {
    const cases = [
        ['home', '/', 'daSurfaceHome'],
        ['search', '/results', 'daSurfaceSearch'],
        ['subscriptions', '/feed/subscriptions', 'daSurfaceSubscriptions'],
        ['playlist', '/playlist', 'daSurfacePlaylist']
    ];
    for (const [surface, pathname, key] of cases) {
        let observeCalls = 0;
        class FakeMutationObserver {
            constructor(callback) { this.callback = callback; }
            observe() { observeCalls++; }
            disconnect() {}
        }
        await withGlobals({
            document: pageDocument({ surface }),
            location: { origin: 'https://www.youtube.com', pathname },
            MutationObserver: FakeMutationObserver
        }, () => {
            const makeFeature = (enabled) => createDeArrowFeature({
                appState: { settings: surfaceSettings({ [key]: enabled }) },
                storageReadJSON: (_storageKey, fallback) => fallback,
                injectStyle: () => ({ remove() {} }),
                isWatchPagePath: () => false
            });

            const excluded = makeFeature(false);
            excluded.init();
            assert.equal(observeCalls, 0, `${surface} must not register an observer when excluded`);
            excluded.destroy();

            const included = makeFeature(true);
            included.init();
            assert.equal(observeCalls, 1, `${surface} must register one observer when included`);
            included.destroy();
        });
    }
});

test('surface masks stop fetches before per-channel overrides compose', async () => {
    const videoLink = { href: 'https://www.youtube.com/watch?v=abc123DEF45' };
    const channelLink = { getAttribute: () => '/@creator' };
    const card = {
        dataset: {},
        closest(selector) {
            return selector === 'ytd-watch-next-secondary-results-renderer' ? {} : null;
        },
        querySelector(selector) {
            if (selector.includes('/watch')) return videoLink;
            if (selector.includes('/channel/')) return channelLink;
            return null;
        }
    };
    const settings = surfaceSettings({
        daSurfaceRelated: false,
        deArrowChannelOverrides: { creator: { mode: 'off' } }
    });
    let fetchCalls = 0;
    const feature = createDeArrowFeature({
        appState: { settings },
        isWatchPagePath: () => true
    });
    feature._fetchBranding = async () => {
        fetchCalls++;
        return null;
    };

    await withGlobals({
        document: pageDocument({ renderers: [card] }),
        location: { origin: 'https://www.youtube.com', pathname: '/watch' },
        YTKitCore: { channelSettingsKey: () => 'creator' }
    }, async () => {
        await feature._processPage();
        assert.equal(fetchCalls, 0, 'the disabled related surface must stop before any request');
        assert.equal(card.dataset.daSurfaceSkipped, 'related');

        settings.daSurfaceRelated = true;
        card.dataset = {};
        await feature._processPage();
        assert.equal(fetchCalls, 0, 'an off channel override must still win on an enabled surface');
        assert.equal(card.dataset.daOverride, 'off');

        settings.deArrowChannelOverrides.creator.mode = 'dearrow';
        card.dataset = {};
        await feature._processPage();
        assert.equal(fetchCalls, 1, 'an enabled surface plus DeArrow channel mode may fetch');
    });
});

test('the watch mask blocks primary-title requests without blocking related cards', async () => {
    const settings = surfaceSettings({ daSurfaceWatch: false, daSurfaceRelated: true });
    const watchTitle = { dataset: {} };
    let fetchCalls = 0;
    const feature = createDeArrowFeature({
        appState: { settings },
        isWatchPagePath: () => true,
        getVideoId: () => 'abc123DEF45'
    });
    feature._fetchBranding = async () => {
        fetchCalls++;
        return null;
    };

    await withGlobals({
        document: pageDocument({ watchTitle }),
        location: { origin: 'https://www.youtube.com', pathname: '/watch' }
    }, async () => {
        await feature._processPage();
        assert.equal(fetchCalls, 0, 'the disabled watch surface must not request primary-title branding');

        settings.daSurfaceWatch = true;
        await feature._processPage();
        assert.equal(fetchCalls, 1, 're-enabling watch must restore the primary-title lookup');
    });
});

// The ytkit.js `|| { … }` object used to be a full second copy of the feature,
// reached only when the module content script failed to load. It drifted from
// the module for months (the module never wrote the voting/peek attributes; the
// copy never learned the route token or the lazy-image guard), and the remedy
// was a character-identical pin. v4.72.0 deleted the copy instead, which is the
// only way the drift cannot come back. What is left must stay a descriptor: the
// settings list still needs a name, a group, and isParent when the module is
// missing.
test('DeArrow monolith keeps only a descriptor stub', () => {
    const factoryIndex = sources.ytkit.indexOf('createDeArrowFeature');
    assert.ok(factoryIndex > -1, 'ytkit.js must construct DeArrow through the module factory');
    const stubStart = sources.ytkit.indexOf('|| {', factoryIndex);
    const stubEnd = sources.ytkit.indexOf('\n        }),', stubStart);
    assert.ok(stubEnd > stubStart, 'DeArrow stub must terminate');
    const stub = sources.ytkit.slice(stubStart, stubEnd);
    assert.ok(stub.length < 1400,
        `DeArrow fallback must stay a descriptor stub, got ${stub.length} bytes`);
    for (const key of ['id', 'name', 'description', 'group', 'icon', 'isParent']) {
        assert.match(stub, new RegExp(`\\b${key}:`), `stub must still declare ${key}`);
    }
    assert.doesNotMatch(stub, /_renderTitle|_fetchBranding|_processPage/,
        'stub must not re-inline the implementation the module owns');
});

test('DeArrow feature block is reachable via the shared helper', () => {
    // Sanity: the helper-based extraction works for DeArrow. If this
    // ever fails, the feature id was renamed and every DeArrow
    // regression in this file is suspect.
    const [block] = extractFeatureBlock(sources.ytkit, 'deArrow');
    assert.ok(block.length > 100,
        'DeArrow feature block must contain non-trivial source');
    assert.match(block, /name:\s*(?:t\(['"]feature_deArrow_name['"],\s*)?['"]DeArrow['"]/,
        'DeArrow feature block must carry the user-facing name');
});

test('DeArrow watch-page title replacement announces via aria-live (NX5)', () => {
    // The watch-page-gated aria-live announcement lives in the title-
    // replace path. Pin both the announce call and the page gate so a
    // refactor can't silently regress the assistive-tech surface.
    // Anchor on the shared title renderer rather than a prose comment: the
    // module and the ytkit.js fallback are kept identical.
    for (const [label, source] of [['module', dearrowModuleSource]]) {
        const start = source.indexOf('_renderTitle(titleEl, formatted');
        assert.ok(start > -1, `DeArrow primary-title path must exist in ${label}`);
        const region = source.slice(start, start + 4200);
        assert.match(region, /announceA11y\(/,
            `DeArrow primary-title replacement must call announceA11y (${label})`);
        assert.match(source, /announce:\s*isWatchPagePath\(\)/,
            `DeArrow card announcement must be gated on isWatchPagePath() — grid spam would be unacceptable (${label})`);
        assert.match(region, /daTogether/,
            `DeArrow title renderer must mark the opt-in paired-title mode (${label})`);
    }
});

test('DeArrow paired-title mode covers cards, the watch title, and teardown', () => {
    for (const [label, source] of [['module', dearrowModuleSource]]) {
        assert.match(source, /daShowOriginalTitle/,
            `paired-title mode must read daShowOriginalTitle (${label})`);
        assert.match(source, /_WATCH_TITLE_SELECTORS:[\s\S]*?not\(\.daCustomTitle\)/,
            `watch title lookup must ignore an already-rendered DeArrow clone (${label})`);
        assert.match(source, /if \(isWatchPagePath\(\) && this\._surfaceEnabled\('watch'\) && replaceTitles\)/,
            `paired-title mode must process the primary watch title (${label})`);
        assert.match(source, /data-da-original-display/,
            `paired-title mode must remember original display state for teardown (${label})`);
        assert.match(source, /removeAttribute\('data-da-original-title'\)/,
            `paired-title teardown must remove its marker (${label})`);
    }
});

test('DeArrow selectors are resilient to YouTube class-name churn', () => {
    // Upstream DeArrow shipped v2.3.4 (2026-04-08), v2.3.5 (2026-04-11), and
    // v2.3.6 (2026-04-23) — three rapid patches for YouTube swapping one
    // CSS class at a time on the title/thumb nodes. Our DeArrow integration
    // uses durable primitives instead:
    //
    //   - Custom-element tags (Polymer/LIT — durable):
    //       ytd-rich-item-renderer, ytd-video-renderer,
    //       ytd-compact-video-renderer, ytd-grid-video-renderer
    //   - ID selectors (durable — YT keeps these stable for a11y):
    //       #video-title, #video-title-link, #thumbnail
    //   - Attribute selectors (durable):
    //       a[href*="/watch"], a[href*="/channel/"], a[href*="/@"]
    //   - Our own marker classes (we own these):
    //       .daCustomTitle, .da-replaced-thumb, [data-da-processed]
    //   - YT core class (resilient, not hashed):
    //       img.yt-core-image
    //
    // This test pins the resilient surface so a future "optimization" that
    // swaps in a hashed class would fail loudly.
    const block = dearrowModuleSource;

    // Custom-element tags must be the primary card walker.
    assert.match(block, /ytd-rich-item-renderer/,
        'DeArrow must walk ytd-rich-item-renderer (the home/subs grid card)');
    assert.match(block, /ytd-video-renderer/,
        'DeArrow must walk ytd-video-renderer (search results)');
    assert.match(block, /ytd-compact-video-renderer/,
        'DeArrow must walk ytd-compact-video-renderer (watch page sidebar)');
    assert.match(block, /ytd-grid-video-renderer/,
        'DeArrow must walk ytd-grid-video-renderer (channel grid)');

    // ID-based selection for the title element (no hashed-class dependency).
    assert.match(block, /#video-title-link/,
        'DeArrow must select the title link via its stable ID');
    assert.match(block, /#video-title/,
        'DeArrow must fall back to the #video-title ID');
    assert.match(block, /a#thumbnail|#thumbnail/,
        'DeArrow must select the thumbnail anchor via its stable ID');

    // Attribute-based watch-link detection — survives URL parsing changes.
    assert.match(block, /href\*=["']\/watch["']/,
        'DeArrow must match watch URLs via [href*="/watch"]');

    // No hashed-class regression. The pattern that bit upstream DeArrow
    // is a class name like ".Mb_class_abc123" — random alphanumeric
    // suffix on a CSS class. We should never lean on those.
    assert.equal(/\.[A-Z][a-zA-Z_]+_[a-z0-9]{6,}/.test(block), false,
        'DeArrow must NEVER target a hashed/obfuscated CSS class (e.g. ".Mb_xyz_abc123") — ' +
        'YouTube rolls these every few weeks. Use custom-element tags or stable IDs instead.');
});

test('DeArrow Casual Mode gates fallback formatting on the deArrowCasualMode setting', () => {
    const src = dearrowModuleSource;
    assert.match(src, /casualMode/,
        'peeled DeArrow module must reference casualMode');
    assert.match(src, /deArrowCasualMode/,
        'casual mode must read from appState.settings.deArrowCasualMode');
    assert.match(src, /fallback && !casualMode/,
        'fallback formatting path must be gated on !casualMode');
});

test('DeArrow writes the attributes its voting and peek consumers query', () => {
    // deArrowVoting selects `[data-ytkit-dearrow-uuid]` and dearrowPeekButton
    // renders `attr(data-ytkit-orig-title)`. Neither attribute was written by
    // the module that actually ships, so both features were inert.
    assert.match(dearrowModuleSource, /data-ytkit-dearrow-uuid/,
        'the submission UUID must reach the DOM or DeArrow voting finds nothing to vote on');
    assert.match(dearrowModuleSource, /data-ytkit-orig-title/,
        'the original title must reach the DOM or the peek overlay renders empty');
    const voteSelector = sources.ytkit.indexOf('.daCustomTitle[data-ytkit-dearrow-uuid]');
    assert.ok(voteSelector > -1, 'deArrowVoting must still select on the UUID attribute');
    assert.match(sources.ytkit, /html\.ytkit-peek \[data-ytkit-dearrow-title\]/,
        'peek CSS must still key on the marker attribute the replacement writes');
});

test('DeArrow attributes remote titles and thumbnails but not local fallback formatting', () => {
    const source = dearrowModuleSource;
    assert.match(source, /if \(!fallback\) this\._ensureAttribution\(clone\)/,
        'remote title replacements must receive attribution while local formatting stays unattributed');
    assert.match(source, /const attribution = this\._ensureAttribution\(img\)/,
        'remote thumbnail replacements must receive attribution');
    assert.match(source, /\.ytkit-dearrow-attribution[\s\S]*?CC BY-NC-SA 4\.0/,
        'the visible attribution surface must identify the licensed SponsorBlock data');
    assert.match(source, /document\.querySelectorAll\('\.ytkit-dearrow-attribution'\)\.forEach\(c => c\.remove\(\)\)/,
        'navigation and teardown must remove attribution when transformed data disappears');
    assert.match(source, /href = 'https:\/\/sponsor\.ajay\.app\/'/,
        'the attribution must link to the upstream data source');
    assert.match(source, /rel = 'noopener noreferrer'/,
        'the external attribution link must isolate its opener');
});

test('DeArrow marker classes are unique to YTKit (no YouTube namespace collision)', () => {
    // The .daCustomTitle / .da-replaced-thumb / [data-da-processed]
    // markers are how we know we've already touched a node. They MUST
    // stay unique to us (the "da" prefix is short for "DeArrow"). If
    // YouTube ever shipped a class named .daCustomTitle natively, our
    // duplicate-detection would false-positive.
    const block = dearrowModuleSource;
    assert.match(block, /\.daCustomTitle/);
    assert.match(block, /\.da-replaced-thumb/);
    assert.match(block, /\[data-da-processed\]|data-da-processed/);
    // Be defensive: marker classes must NOT be generic words like "title"
    // or "thumb" alone. They must keep the "da" / "da-" prefix.
    const markerLine = (block.match(/'\.daCustomTitle'[^;]*?(?:;|\n)/) || [''])[0];
    assert.ok(markerLine.includes('daCustomTitle'),
        'marker class must keep the "da" prefix to avoid colliding with YouTube namespace');
});
