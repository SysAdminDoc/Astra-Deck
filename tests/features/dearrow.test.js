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
const { sources, extractFeatureBlock, readUserscriptBuild, userscriptBundles } = require('../helpers/source');
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
        // The userscript runs this same ytkit.js and settings panel, so one
        // check places the mask in both vehicles' panels.
        assert.match(sources.ytkit, new RegExp(`id: '${key}'[\\s\\S]{0,320}parentId: 'deArrow'`),
            `${key} must render under DeArrow in the settings panel`);
        assert.ok(englishMessages[`feature_${key}_name`]?.message,
            `${key} must have a user-facing name`);
        assert.ok(englishMessages[`feature_${key}_desc`]?.message,
            `${key} must explain what the mask excludes`);
    }
    const { modules } = readUserscriptBuild();
    assert.equal(modules.app, 'ytkit.js', 'the userscript must render the same settings panel');
    assert.ok(userscriptBundles('features/dearrow/index.js'), 'the userscript must ship the DeArrow module');
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

test('a second pass started mid-fetch never takes a card the first one owns', async () => {
    // The observer starts a pass while an earlier one awaits a fetch. Each
    // holds a snapshot of the cards, so the earlier pass reached cards the
    // later one had taken and rendered a second DeArrow title on them.
    const card = (videoId) => ({
        dataset: {},
        closest: () => null,
        querySelector: (selector) => (selector.includes('/watch')
            ? { href: `https://www.youtube.com/watch?v=${videoId}` }
            : null)
    });
    const cards = [card('abc123DEF45'), card('xyz789GHI01')];
    const fetched = [];
    const waiting = [];
    const feature = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        isWatchPagePath: () => false
    });
    feature._fetchBranding = (videoId) => {
        fetched.push(videoId);
        return new Promise((resolve) => waiting.push(resolve));
    };

    await withGlobals({
        document: pageDocument({ surface: 'home', renderers: cards }),
        location: { origin: 'https://www.youtube.com', pathname: '/' }
    }, async () => {
        const first = feature._processPage();
        const second = feature._processPage();
        while (waiting.length) {
            waiting.shift()(null);
            await new Promise((resolve) => setImmediate(resolve));
        }
        await Promise.all([first, second]);
        assert.deepEqual(fetched.sort(), ['abc123DEF45', 'xyz789GHI01'], 'each card is taken by one pass');
    });
});

test('a title gets one DeArrow replacement, and the announcement is translated', () => {
    let navigations = 0;
    const parent = {
        children: [],
        insertBefore(node, ref) {
            node.parentNode = parent;
            const at = parent.children.indexOf(ref);
            parent.children.splice(at < 0 ? parent.children.length : at, 0, node);
            return node;
        }
    };
    const make = () => {
        const attrs = new Map();
        const el = {
            tagName: 'A', listeners: new Map(),
            textContent: '', className: '', title: '', style: { display: '' }, dataset: {},
            addEventListener(type, listener) { el.listeners.set(type, listener); },
            click() { navigations++; },
            classList: { add() {} },
            setAttribute: (name, value) => attrs.set(name, String(value)),
            getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
            hasAttribute: (name) => attrs.has(name),
            removeAttribute: (name) => attrs.delete(name),
            remove() {
                const at = parent.children.indexOf(el);
                if (at >= 0) parent.children.splice(at, 1);
            },
            cloneNode: () => make(),
            get previousElementSibling() {
                const at = parent.children.indexOf(el);
                return at > 0 ? parent.children[at - 1] : null;
            }
        };
        return el;
    };
    const titleEl = make();
    titleEl.textContent = 'ORIGINAL TITLE';
    titleEl.parentNode = parent;
    parent.children.push(titleEl);
    const announced = [];
    const feature = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        announceA11y: (message) => announced.push(message),
        t: (key, fallback) => (key === 'deArrowTitleReplacedTpl' ? 'Titel von DeArrow ersetzt: {title}' : fallback)
    });

    feature._renderTitle(titleEl, 'First title', { fallback: true });
    feature._renderTitle(titleEl, 'Second title', { fallback: true, announce: true });
    const replacements = parent.children.filter((node) => node.getAttribute('data-ytkit-dearrow-title') === '1');
    assert.deepEqual(replacements.map((node) => node.textContent), ['Second title']);
    assert.deepEqual(announced, ['Titel von DeArrow ersetzt: Second title']);
    let prevented = false;
    const click = replacements[0].listeners.get('click');
    click({ button: 0, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(navigations, 1, 'a replacement forwards to the original native endpoint');
    click({ button: 0, ctrlKey: true, preventDefault() { throw new Error('modified links must keep native behavior'); } });
    assert.equal(navigations, 1, 'modified clicks open the replacement href normally');
});

test('a feed append keeps finished cards, and a reused card starts over', async () => {
    // Navigate rules also run on same-URL page-data updates, which YouTube
    // fires on every feed append. Each one stripped every DeArrow title, and
    // a renderer YouTube reused for another video kept the old video's title.
    const matches = (el, selector) => {
        if (selector.startsWith('.')) return el.classes.has(selector.slice(1));
        if (selector === '[data-da-processed]') return el.dataset.daProcessed !== undefined;
        if (selector === '[data-da-video-id]') return el.dataset.daVideoId !== undefined;
        if (selector.includes('[href*="/watch"]')) return String(el.href || '').includes('/watch');
        return false;
    };
    const node = ({ className = '', dataset = {}, href = null } = {}) => {
        const attrs = new Map();
        const el = {
            classes: new Set(className.split(' ').filter(Boolean)),
            dataset: { ...dataset }, style: { display: '' }, children: [], parent: null, href,
            getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
            setAttribute: (name, value) => attrs.set(name, String(value)),
            removeAttribute: (name) => attrs.delete(name),
            append(...kids) {
                for (const kid of kids) { kid.parent = el; el.children.push(kid); }
                return el;
            },
            remove() {
                if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1);
                el.parent = null;
            },
            descendants: () => el.children.flatMap((kid) => [kid, ...kid.descendants()]),
            querySelectorAll: (selector) => el.descendants()
                .filter((candidate) => selector.split(',').some((part) => matches(candidate, part.trim()))),
            querySelector: (selector) => el.querySelectorAll(selector)[0] || null
        };
        el.classList = { add: (name) => el.classes.add(name), remove: (name) => el.classes.delete(name) };
        return el;
    };
    const finishedCard = (shownId, renderedId) => {
        const original = node({ className: 'daOriginalTitle', dataset: { daProcessed: '1' } });
        original.setAttribute('data-da-original-display', '');
        return node({ dataset: { daProcessed: '1', daVideoId: renderedId } }).append(
            node({ href: `https://www.youtube.com/watch?v=${shownId}` }),
            node({ className: 'daCustomTitle' }),
            node({ className: 'ytkit-dearrow-attribution' }),
            original
        );
    };
    const doc = node();
    doc.body = {};
    const loc = { origin: 'https://www.youtube.com', pathname: '/', href: 'https://www.youtube.com/' };
    let navRule = null;
    const feature = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        injectStyle: () => ({ remove() {} }),
        addNavigateRule: (_id, rule) => { navRule = rule; }
    });
    feature._processPage = () => {};

    await withGlobals({
        document: doc,
        location: loc,
        MutationObserver: class { observe() {} disconnect() {} }
    }, () => {
        feature.init();
        navRule();
        const kept = finishedCard('abc123DEF45', 'abc123DEF45');
        const reused = finishedCard('xyz789GHI01', 'old45678901');
        doc.append(kept, reused);
        const route = feature._routeToken;

        navRule();
        assert.equal(feature._routeToken, route, 'a same-URL update is not a new route');
        assert.equal(kept.querySelectorAll('.daCustomTitle').length, 1, 'a finished card keeps its DeArrow title');
        assert.equal(kept.dataset.daVideoId, 'abc123DEF45');
        assert.equal(reused.querySelectorAll('.daCustomTitle, .ytkit-dearrow-attribution').length, 0,
            'a reused card drops the old title and its attribution');
        assert.equal(reused.dataset.daProcessed, undefined, 'a reused card is processed again');
        assert.equal(reused.querySelectorAll('.daOriginalTitle').length, 0, 'the original title shows again');

        loc.href = 'https://www.youtube.com/results?search_query=x';
        navRule();
        assert.equal(feature._routeToken, route + 1, 'a new URL is a new route');
        assert.equal(doc.querySelectorAll('.daCustomTitle').length, 0, 'a new route resets every card');
        feature.destroy();
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
        // Only the watch heading announces; a card never does (grid spam).
        assert.match(source, /async _processWatchTitle\(gen, route\) \{\s*if \(!isWatchPagePath\(\)[\s\S]*?this\._applyTitle\(titleEl, branding, \{ announce: true \}\)/,
            `DeArrow announcement must come from the watch-gated heading pass (${label})`);
        assert.match(source, /&& titleEl\) this\._applyTitle\(titleEl, branding\);/,
            `DeArrow card titles must not announce (${label})`);
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
        assert.match(source, /if \(!isWatchPagePath\(\) \|\| !this\._surfaceEnabled\('watch'\) \|\| !appState\.settings\.daReplaceTitles\) return;/,
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
    // Since 2026 Home, Subscriptions, channel grids, search and the watch
    // sidebar render yt-lockup-view-model cards with no #video-title, and
    // DeArrow replaced nothing on them until v4.99.0.
    const feature = createDeArrowFeature();
    assert.match(feature._CARD_SELECTORS, /yt-lockup-view-model/, 'DeArrow must walk lockup cards');
    assert.match(feature._TITLE_SELECTORS, /a\.ytLockupMetadataViewModelTitle:not\(\.daCustomTitle\)/,
        'a lockup title must be found, and never the replacement drawn beside it');
    assert.match(feature._CARD_THUMB_SELECTORS, /yt-thumbnail-view-model img/,
        'a lockup cover must be found inside its thumbnail, away from the channel avatar');

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
    assert.match(src, /deArrowCasualMode/,
        'casual mode must read from appState.settings.deArrowCasualMode');
    const rendered = [];
    const make = (casual) => {
        const feature = createDeArrowFeature({
            appState: { settings: surfaceSettings({ daFallbackFormat: true, deArrowCasualMode: casual }) }
        });
        feature._renderTitle = (_el, text, options) => { rendered.push([casual, text, options.fallback]); return true; };
        return feature;
    };
    const titleEl = { textContent: 'WHY THIS CHANGES EVERYTHING' };
    assert.equal(make(true)._applyTitle(titleEl, { titles: [] }), false,
        'casual mode leaves an original title without a submission alone');
    assert.equal(make(false)._applyTitle(titleEl, { titles: [] }), true);
    assert.deepEqual(rendered, [[false, 'Why this changes everything', true]]);
});

test('DeArrow writes the attributes its peek consumer and a vote surface need', () => {
    // dearrowPeekButton renders `attr(data-ytkit-orig-title)`. That attribute
    // and the submission UUID were once missing from the module that ships,
    // which left peek and the old voting toggle inert. Voting was retired in
    // v4.98.0 (it posted to a route DeArrow doesn't have); the UUID stays on
    // the title for the rebuild Roadmap_Blocked tracks.
    assert.match(dearrowModuleSource, /data-ytkit-dearrow-uuid/,
        'the submission UUID must reach the DOM so a vote surface can name the title');
    assert.match(dearrowModuleSource, /data-ytkit-orig-title/,
        'the original title must reach the DOM or the peek overlay renders empty');
    assert.doesNotMatch(sources.ytkit, /id: 'deArrowVoting'/,
        'the retired voting feature must not come back without its rebuild');
    assert.match(sources.ytkit, /html\.ytkit-peek \[data-ytkit-dearrow-title\]/,
        'peek CSS must still key on the marker attribute the replacement writes');
});

test('DeArrow credits its data in the settings, never with a badge on each card', () => {
    // v4.99.2: the "SponsorBlock data" badge under every replaced card was
    // removed at the maintainer's request. The licence credit lives in the
    // DeArrow setting's description and the README, privacy policy and
    // store copy (pinned in hardening.test.js), the way DeArrow itself
    // credits on a settings page rather than on the feed.
    const source = dearrowModuleSource;
    assert.doesNotMatch(source, /_ensureAttribution|_createAttribution|sponsorBlockDataAttribution/,
        'no card may get a credit badge again');
    assert.doesNotMatch(source, /\.ytkit-dearrow-attribution\s*\{/, 'the badge style is gone with the badge');
    assert.match(source, /root\.querySelectorAll\('\.daCustomTitle, \.ytkit-dearrow-attribution'\)\.forEach\(c => c\.remove\(\)\)/,
        'teardown still sweeps a badge an earlier build drew');
    assert.match(englishMessages.feature_deArrow_desc?.message || '', /CC BY-NC-SA 4\.0/,
        'the DeArrow setting must keep the data licence credit');
    assert.equal(englishMessages.sponsorBlockDataAttribution, undefined, 'the badge label is retired');
});

test('a ">" keep-case marker on any word is honored and never reaches the page', () => {
    // DeArrow puts ">" before a word its auto-formatter must leave alone
    // (">NASA", ">iPhone"). Only a leading marker was stripped, so a marked
    // word mid-title printed its ">" and lost its casing anyway.
    const feature = createDeArrowFeature();
    assert.equal(feature._formatTitle('How >NASA builds >SLS rockets', 'sentence'), 'How NASA builds SLS rockets');
    assert.equal(feature._formatTitle('>iPhone 17 REVIEW', 'sentence'), 'iPhone 17 review');
    assert.equal(feature._formatTitle('the >macOS guide FOR beginners', 'title_case'), 'The macOS Guide for Beginners');
    assert.equal(feature._formatTitle('Why >NASA waited', 'original'), 'Why NASA waited');
    // A question mark starts a new sentence, as in upstream's formatter.
    assert.equal(feature._formatTitle('Is 5 > 3? MATH', 'sentence'), 'Is 5 > 3? Math',
        'a spaced ">" is ordinary text, not a marker');
});

test('a thumbnail vote for the original keeps the creator thumbnail', () => {
    // DeArrow sends { original: true, timestamp: null } when voters chose the
    // creator's thumbnail. Number(null) is 0, so the card showed the video's
    // first frame (usually black) instead of keeping what it had.
    const feature = createDeArrowFeature();
    const time = (thumbnail) => feature._submittedThumbnailTime({ thumbnails: thumbnail ? [thumbnail] : [] });
    assert.equal(time({ original: true, timestamp: null, votes: 3, locked: false }), null);
    assert.equal(time({ original: false, timestamp: null, votes: 0, locked: false }), null);
    assert.equal(time({ original: false, timestamp: 'x&time=1', votes: 0, locked: false }), null);
    assert.equal(time({ original: false, timestamp: 42.5, votes: -1, locked: false }), null,
        'an untrusted submission (negative and unlocked) is not shown');
    assert.equal(time(null), null);
    assert.equal(time({ original: false, timestamp: 42.5, votes: 0, locked: false }), 42.5);
    assert.equal(time({ original: false, timestamp: 0, votes: -2, locked: true }), 0,
        'a locked submission is trusted whatever its score');
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
    const markerLine = (block.match(/'\.daCustomTitle[^']*'[^;]*?(?:;|\n)/) || [''])[0];
    assert.ok(markerLine.includes('daCustomTitle'),
        'marker class must keep the "da" prefix to avoid colliding with YouTube namespace');
});

// A card with just enough DOM for the card pass: a watch link, a cover, a
// duration badge, and the host it may be nested in.
function lockupCard({ videoId, parentHost = null, collection = false, cover = 'https://i.ytimg.com/vi/x/hq720.jpg', badge = '12:34' } = {}) {
    const classes = new Set();
    const img = {
        src: cover,
        dataset: {},
        classList: { contains: (name) => classes.has(name), add: (name) => classes.add(name) }
    };
    const selectors = createDeArrowFeature();
    const card = {
        dataset: {},
        parentElement: parentHost ? { closest: () => parentHost } : null,
        closest: () => null,
        querySelector(selector) {
            if (selector === selectors._CARD_THUMB_SELECTORS) return img;
            if (selector.includes('/playlist?list=')) return collection ? {} : null;
            if (selector.includes('/watch')) return { href: `https://www.youtube.com/watch?v=${videoId}` };
            return null;
        },
        querySelectorAll(selector) {
            return selector === selectors._DURATION_BADGE_SELECTORS && badge ? [{ textContent: ` ${badge} ` }] : [];
        }
    };
    return { card, img };
}

test('lockup cards are walked once, from the outer host, and playlists and mixes are left alone', async () => {
    const outer = lockupCard({ videoId: 'abc123DEF45' });
    const inner = lockupCard({ videoId: 'abc123DEF45', parentHost: outer.card });
    const mix = lockupCard({ videoId: 'mix123DEF45', collection: true });
    const fetched = [];
    const feature = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        isWatchPagePath: () => false
    });
    feature._fetchBranding = async (videoId) => { fetched.push(videoId); return null; };
    await withGlobals({
        document: pageDocument({ surface: 'home', renderers: [outer.card, inner.card, mix.card] }),
        location: { origin: 'https://www.youtube.com', pathname: '/' }
    }, async () => {
        await feature._processPage();
    });
    assert.deepEqual(fetched, ['abc123DEF45'], 'one lookup per card, none for a collection');
    assert.equal(inner.card.dataset.daProcessed, 'nested');
    assert.equal(mix.card.dataset.daVideoId, undefined);
});

test('a lookup that answers after its card was recycled paints nothing on the new video', async () => {
    // YouTube reuses card renderers in place. A's branding used to land on the
    // card after it had been reset and taken for B.
    let shown = 'abc123DEF45';
    const { card, img } = lockupCard({ videoId: 'unused' });
    const originalQuery = card.querySelector;
    const thumbSelectors = createDeArrowFeature()._CARD_THUMB_SELECTORS;
    card.querySelector = (selector) => (selector !== thumbSelectors && selector.includes('/watch')
        ? { href: `https://www.youtube.com/watch?v=${shown}` }
        : originalQuery(selector));
    const cover = img.src;
    const waiting = [];
    const feature = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        isWatchPagePath: () => false
    });
    feature._fetchBranding = () => new Promise((resolve) => waiting.push(resolve));
    const branding = (stamp) => ({ titles: [], thumbnails: [{ timestamp: stamp, votes: 1 }] });
    await withGlobals({
        document: pageDocument({ surface: 'home', renderers: [card] }),
        location: { origin: 'https://www.youtube.com', pathname: '/' }
    }, async () => {
        const pass = feature._processPage();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(waiting.length, 1, 'A is being looked up');
        shown = 'xyz789GHI01';
        card.dataset.daVideoId = shown;
        waiting.shift()(branding(11));
        await pass;
        assert.equal(img.src, cover, 'A\'s thumbnail never lands on the card now showing B');
        assert.ok(!img.classList.contains('da-replaced-thumb'), 'the card is not marked replaced');

        const forB = feature._applyCard(card, shown, feature._generation, feature._routeToken);
        waiting.shift()(branding(22));
        await forB;
        assert.match(img.src, /videoID=xyz789GHI01&time=22/, 'B still gets its own thumbnail');

        const removed = lockupCard({ videoId: 'abc123DEF45' });
        removed.card.dataset.daVideoId = 'abc123DEF45';
        const late = feature._applyCard(removed.card, 'abc123DEF45', feature._generation, feature._routeToken);
        removed.card.isConnected = false;
        waiting.shift()(branding(33));
        await late;
        assert.ok(!removed.img.classList.contains('da-replaced-thumb'), 'a card YouTube removed is never painted');

        // YouTube swaps the link before Astra's reset pass retags the card, and
        // a tag can change while the link is still the old one. Either alone stops it.
        for (const [label, retarget] of [
            ['link', (c) => { c.linkId = 'xyz789GHI01'; }],
            ['tag', (c) => { c.card.dataset.daVideoId = 'xyz789GHI01'; }]
        ]) {
            const reused = lockupCard({ videoId: 'abc123DEF45' });
            reused.linkId = 'abc123DEF45';
            const base = reused.card.querySelector;
            reused.card.querySelector = (selector) => (selector !== thumbSelectors && selector.includes('/watch')
                ? { href: `https://www.youtube.com/watch?v=${reused.linkId}` }
                : base(selector));
            reused.card.dataset.daVideoId = 'abc123DEF45';
            const pending = feature._applyCard(reused.card, 'abc123DEF45', feature._generation, feature._routeToken);
            retarget(reused);
            waiting.shift()(branding(44));
            await pending;
            assert.ok(!reused.img.classList.contains('da-replaced-thumb'), `a changed ${label} alone keeps A off the card`);
        }
    });
});

test('cards are looked up in parallel lanes, not one at a time', async () => {
    const cards = Array.from({ length: 9 }, (_, i) => lockupCard({ videoId: `abc123DEF0${i}` }).card);
    const waiting = [];
    const feature = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        isWatchPagePath: () => false
    });
    feature._fetchBranding = () => new Promise((resolve) => waiting.push(resolve));
    await withGlobals({
        document: pageDocument({ surface: 'home', renderers: cards }),
        location: { origin: 'https://www.youtube.com', pathname: '/' }
    }, async () => {
        const pass = feature._processPage();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(waiting.length, feature._FETCH_LANES, 'every lane starts a lookup before any answer');
        // Cards still waiting for a lane are hidden too, or they would show
        // their clickbait until a lane frees up.
        assert.deepEqual(cards.map((card) => card.dataset.daHide), cards.map(() => 'title thumb'));
        let answered = 0;
        while (waiting.length) {
            waiting.shift()(null);
            answered++;
            await new Promise((resolve) => setImmediate(resolve));
        }
        await pass;
        assert.equal(answered, cards.length);
        assert.ok(cards.every((card) => card.dataset.daHide === undefined), 'every card is shown once answered');
    });
});

test('a cover with no submission falls back the way the setting says', () => {
    const make = (mode) => createDeArrowFeature({ appState: { settings: surfaceSettings({ daThumbFallback: mode }) } });
    const id = 'abc123DEF45';
    const { card } = lockupCard({ videoId: id });
    const still = (code) => `https://i.ytimg.com/vi_webp/${id}/${code}.webp`;
    assert.equal(make('random')._fallbackThumbnailUrl(card, id),
        `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${id}&redirectUrl=${encodeURIComponent(still('hq1'))}`,
        'the random frame asks the cache without a time, so upstream never renders for it');
    assert.equal(make(undefined)._fallbackThumbnailUrl(card, id), make('random')._fallbackThumbnailUrl(card, id),
        'random frame is the default, as in DeArrow');
    assert.equal(make('start')._fallbackThumbnailUrl(card, id), still('hq1'));
    assert.equal(make('middle')._fallbackThumbnailUrl(card, id), still('hq2'));
    assert.equal(make('end')._fallbackThumbnailUrl(card, id), still('hq3'));
    assert.equal(make('original')._fallbackThumbnailUrl(card, id), null);
    for (const badge of ['LIVE', 'Upcoming', 'Premiere', null]) {
        assert.equal(make('random')._fallbackThumbnailUrl(lockupCard({ videoId: id, badge }).card, id), null,
            `a card without a running time (${badge}) keeps its cover`);
    }
    assert.notEqual(make('random')._fallbackThumbnailUrl(lockupCard({ videoId: id, badge: '1:04:42' }).card, id), null);
});

test('a submitted thumbnail beats the fallback, and an original vote keeps the cover', () => {
    const feature = createDeArrowFeature({ appState: { settings: surfaceSettings({ daThumbFallback: 'middle' }) } });
    const id = 'abc123DEF45';

    const submitted = lockupCard({ videoId: id });
    feature._applyThumbnail(submitted.card, id, { thumbnails: [{ timestamp: 70.08, original: false, votes: 1, locked: false }] });
    assert.equal(submitted.img.src, `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${id}&time=70.08`);
    assert.equal(submitted.img.dataset.daOrigSrc, 'https://i.ytimg.com/vi/x/hq720.jpg');

    const kept = lockupCard({ videoId: id });
    feature._applyThumbnail(kept.card, id, { thumbnails: [{ timestamp: null, original: true, votes: 2, locked: false }] });
    assert.equal(kept.img.src, 'https://i.ytimg.com/vi/x/hq720.jpg', 'voters chose the creator thumbnail');

    const bare = lockupCard({ videoId: id });
    feature._applyThumbnail(bare.card, id, { thumbnails: [], randomTime: 0.4, videoDuration: null });
    assert.equal(bare.img.src, `https://i.ytimg.com/vi_webp/${id}/hq2.webp`);
});

test('an off-screen cover waits for its image instead of reprocessing the card', async () => {
    // Reprocessing redrew the title, which woke the page observer, which
    // reprocessed every off-screen card again every 300 ms.
    const observers = [];
    class FakeMutationObserver {
        constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
        observe(target, options) { this.target = target; this.options = options; this.connected = true; }
        disconnect() { this.connected = false; }
    }
    const page = { querySelectorAll: () => [], title: '' };
    // The cover watcher rechecks the card's link, which resolves against location.
    const location = { origin: 'https://www.youtube.com', pathname: '/' };
    await withGlobals({ MutationObserver: FakeMutationObserver, document: page, location }, () => {
        const feature = createDeArrowFeature({ appState: { settings: surfaceSettings({ daThumbFallback: 'end' }) } });
        const id = 'abc123DEF45';
        const lazy = lockupCard({ videoId: id, cover: '' });
        lazy.card.dataset.daProcessed = '1';
        lazy.card.dataset.daVideoId = id;
        feature._applyThumbnail(lazy.card, id, { thumbnails: [] });
        feature._applyThumbnail(lazy.card, id, { thumbnails: [] });
        assert.equal(lazy.card.dataset.daProcessed, '1', 'the card is not handed back to the page pass');
        assert.equal(observers.length, 1, 'one watcher per cover, however many passes ask');
        assert.deepEqual(observers[0].options, { attributes: true, attributeFilter: ['src'] });

        lazy.img.src = 'https://i.ytimg.com/vi/x/hq720.jpg';
        observers[0].callback();
        assert.equal(lazy.img.src, `https://i.ytimg.com/vi_webp/${id}/hq3.webp`, 'the cover is swapped once YouTube loads it');
        assert.equal(lazy.img.dataset.daOrigSrc, 'https://i.ytimg.com/vi/x/hq720.jpg');
        assert.equal(observers[0].connected, false);

        const left = lockupCard({ videoId: id, cover: '' });
        left.card.dataset.daVideoId = id;
        feature._applyThumbnail(left.card, id, { thumbnails: [] });
        assert.equal(observers[1].connected, true);
        feature._resetCard(page);
        assert.equal(observers[1].connected, false, 'a route change disconnects every waiting cover');
    });
});

test('a lockup replacement keeps its inner span and reads the new title to screen readers', () => {
    const attrs = (initial = {}) => {
        const map = new Map(Object.entries(initial));
        return {
            getAttribute: (name) => (map.has(name) ? map.get(name) : null),
            setAttribute: (name, value) => map.set(name, String(value)),
            hasAttribute: (name) => map.has(name),
            removeAttribute: (name) => map.delete(name)
        };
    };
    const inserted = [];
    const parent = { insertBefore: (node) => { inserted.push(node); return node; } };
    const span = { tagName: 'SPAN', cloneNode: () => ({ tagName: 'SPAN', textContent: '' }) };
    const clone = {
        ...attrs({ 'aria-label': 'YOU WONT BELIEVE THIS 12 minutes' }),
        dataset: {}, children: [], textContent: '',
        append(node) { this.children.push(node); }
    };
    const titleEl = {
        ...attrs({ 'aria-label': 'YOU WONT BELIEVE THIS 12 minutes' }),
        textContent: 'YOU WONT BELIEVE THIS', className: 'ytLockupMetadataViewModelTitle', style: { display: '' },
        dataset: {}, children: [span], parentNode: parent, previousElementSibling: null,
        classList: { add() {} },
        cloneNode: () => clone
    };
    const feature = createDeArrowFeature({ appState: { settings: surfaceSettings() } });
    assert.equal(feature._renderTitle(titleEl, 'How the bridge was built'), true);
    assert.equal(inserted[0], clone);
    assert.equal(clone.textContent, '', 'the text lives in the copied span, not loose in the link');
    assert.equal(clone.children[0].textContent, 'How the bridge was built');
    assert.equal(clone.getAttribute('aria-label'), 'How the bridge was built 12 minutes');
});

test('the watch heading is drawn as a plain span, never a cloned yt-formatted-string', async () => {
    // Live probe 2026-10-12: the cloned custom element was upgraded by
    // YouTube's definition on insertion and rendered empty, so the watch
    // heading went blank and the tab title kept the clickbait.
    const inserted = [];
    const parent = { insertBefore: (node) => { inserted.push(node); return node; } };
    const created = [];
    const doc = {
        createElement(tag) {
            const attrs = new Map();
            const el = {
                tagName: tag.toUpperCase(), textContent: '', className: '', dataset: {},
                setAttribute: (name, value) => attrs.set(name, String(value)),
                getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
                removeAttribute: (name) => attrs.delete(name)
            };
            created.push(el);
            return el;
        }
    };
    const titleEl = {
        tagName: 'YT-FORMATTED-STRING', textContent: 'YOU WONT BELIEVE THIS',
        className: 'style-scope ytd-watch-metadata', style: { display: '' }, dataset: {},
        children: [], parentNode: parent, previousElementSibling: null,
        classList: { add() {} },
        hasAttribute: () => false, getAttribute: () => null, setAttribute() {},
        cloneNode() { throw new Error('a cloned yt-formatted-string renders empty'); }
    };
    const feature = createDeArrowFeature({ appState: { settings: surfaceSettings() } });
    await withGlobals({ document: doc }, () => {
        assert.equal(feature._renderTitle(titleEl, 'How the bridge was built', { announce: true }), true);
    });
    assert.equal(created.length, 1);
    assert.equal(created[0].tagName, 'SPAN');
    assert.equal(inserted[0], created[0]);
    assert.equal(created[0].textContent, 'How the bridge was built');
    assert.match(created[0].className, /^daCustomTitle style-scope ytd-watch-metadata$/);
    assert.equal(created[0].getAttribute('data-ytkit-orig-title'), 'YOU WONT BELIEVE THIS');
    assert.equal(titleEl.style.display, 'none', 'the original heading is hidden, not removed');
});

test('the tab title follows the watch heading and is restored on teardown', async () => {
    const shown = { textContent: 'How the bridge was built', getAttribute: () => 'YOU WONT BELIEVE THIS' };
    const doc = {
        title: 'YOU WONT BELIEVE THIS - YouTube',
        querySelector: (selector) => (selector.includes('[data-ytkit-dearrow-title]') ? shown : null),
        querySelectorAll: () => []
    };
    const feature = createDeArrowFeature({ appState: { settings: surfaceSettings() } });
    await withGlobals({ document: doc }, () => {
        feature._syncDocumentTitle();
        assert.equal(doc.title, 'How the bridge was built - YouTube');
        doc.title = '(2) YOU WONT BELIEVE THIS - YouTube';
        feature._syncDocumentTitle();
        assert.equal(doc.title, '(2) How the bridge was built - YouTube', 'a YouTube rewrite is caught on the next pass');
        feature._resetCard(doc);
        assert.equal(doc.title, '(2) YOU WONT BELIEVE THIS - YouTube');
    });
});

test('DeArrow ships on, with titles, covers and the random-frame fallback', () => {
    // Asked for on 2026-10-12: the feature used to ship switched off.
    for (const key of ['deArrow', 'daReplaceTitles', 'daReplaceThumbs']) {
        assert.equal(defaultSettings[key], true, `${key} must default on in default-settings.json`);
        assert.equal(findSettingEntry(key).defaultValue, true, `${key} must default on in the schema`);
    }
    assert.equal(defaultSettings.daThumbFallback, 'random');
    assert.equal(findSettingEntry('daThumbFallback').defaultValue, 'random');
    assert.match(sources.ytkit, /\n\s+deArrow: true,/, 'the ytkit.js defaults block must agree');
});

// Upstream's config (src/config/config.ts syncDefaults) and what Astra ships.
const UPSTREAM_OPTIONS = Object.freeze({
    daHideWhileFetching: true,
    daThumbSaturation: 100,
    daCleanEmojis: true,
    daCasualFunny: 1,
    daCasualCreative: 1,
    daCasualClever: 1,
    daCasualDescriptive: 1,
    daCasualOther: 1,
    daCasualFormat: true,
    daCasualOriginalThumb: false
});

test('the DeArrow options ship with upstream defaults, a panel row and a name in every locale', () => {
    const localeDir = path.join(__dirname, '..', '..', 'extension', '_locales');
    const locales = fs.readdirSync(localeDir).map((name) => require(path.join(localeDir, name, 'messages.json')));
    assert.equal(locales.length, 11);
    for (const [key, value] of Object.entries(UPSTREAM_OPTIONS)) {
        assert.equal(findSettingEntry(key)?.defaultValue, value, `${key} schema default`);
        assert.equal(defaultSettings[key], value, `${key} default-settings.json`);
        assert.match(sources.ytkit, new RegExp(`\\n\\s+${key}: ${value},`), `${key} ytkit.js default`);
        assert.match(sources.ytkit, new RegExp(`id: '${key}'[\\s\\S]{0,700}parentId: 'deArrow'`), `${key} panel row`);
        for (const messages of locales) {
            assert.ok(messages[`feature_${key}_name`]?.message && messages[`feature_${key}_desc`]?.message, `${key} strings`);
        }
    }
});

async function initCss(settings) {
    let css = '';
    const feature = createDeArrowFeature({
        appState: { settings: surfaceSettings(settings) },
        injectStyle: (text) => { css = text; return { remove() {} }; }
    });
    await withGlobals({
        MutationObserver: class { observe() {} disconnect() {} },
        document: pageDocument({ surface: 'home' }),
        location: { origin: 'https://www.youtube.com', pathname: '/', href: 'https://www.youtube.com/' }
    }, () => feature.init());
    return css;
}

test('hideDetailsWhileFetching hides a card until its lookup answers, and never longer than the timeout', async () => {
    const css = await initCss({});
    assert.match(css, /\[data-da-hide~="title"\] :is\(#video-title,[^)]*a\.ytLockupMetadataViewModelTitle\)/);
    assert.match(css, /\[data-da-hide~="thumb"\] :is\(yt-thumbnail-view-model img/);
    assert.match(css, /\[data-da-hide~="self"\] \{ visibility: hidden !important; \}/);

    const run = async (settings, answer) => {
        const { card } = lockupCard({ videoId: 'abc123DEF45' });
        card.dataset.daVideoId = 'abc123DEF45';
        let resolve;
        const feature = createDeArrowFeature({ appState: { settings: surfaceSettings(settings) } });
        feature._fetchBranding = () => new Promise((r) => { resolve = r; });
        const pass = feature._applyCard(card, 'abc123DEF45', feature._generation, feature._routeToken);
        const during = { hide: card.dataset.daHide, fetching: card.dataset.daFetching };
        resolve(answer);
        await pass;
        return { during, after: { hide: card.dataset.daHide, fetching: card.dataset.daFetching } };
    };
    const on = await run({}, { titles: [], thumbnails: [] });
    assert.deepEqual(on.during, { hide: 'title thumb', fetching: 'abc123DEF45' }, 'on by default, as upstream');
    assert.deepEqual(on.after, { hide: undefined, fetching: undefined }, 'shown again once the answer is in');
    assert.deepEqual((await run({}, null)).after, { hide: undefined, fetching: undefined }, 'a failed lookup shows the original');
    assert.deepEqual((await run({ daReplaceThumbs: false }, null)).during.hide, 'title', 'only what may change is hidden');
    assert.deepEqual((await run({ daHideWhileFetching: false }, null)).during, { hide: undefined, fetching: undefined });

    const { card } = lockupCard({ videoId: 'abc123DEF45' });
    card.dataset.daVideoId = 'abc123DEF45';
    const feature = createDeArrowFeature({ appState: { settings: surfaceSettings() } });
    feature._REVEAL_AFTER_MS = 5;
    feature._fetchBranding = () => new Promise(() => {});
    feature._applyCard(card, 'abc123DEF45', feature._generation, feature._routeToken);
    assert.equal(card.dataset.daHide, 'title thumb');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(card.dataset.daHide, undefined, 'a lookup that never answers stops hiding at the timeout');
    assert.equal(feature._revealTimers.size, 0);

    // The watch heading hides too, and asks by hash prefix.
    const heading = { dataset: {}, isConnected: true };
    let resolveWatch;
    let options;
    const watch = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        isWatchPagePath: () => true,
        getVideoId: () => 'abc123DEF45'
    });
    watch._fetchBranding = (_id, opts) => { options = opts; return new Promise((r) => { resolveWatch = r; }); };
    await withGlobals({ document: pageDocument({ watchTitle: heading }) }, async () => {
        const pass = watch._processWatchTitle(watch._generation, watch._routeToken);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(heading.dataset.daHide, 'self');
        resolveWatch(null);
        await pass;
    });
    assert.equal(heading.dataset.daHide, undefined);
    assert.deepEqual(options, { byHash: true });
});

test('thumbnailSaturationLevel fades covers on the cards DeArrow handles', async () => {
    assert.doesNotMatch(await initCss({}), /grayscale/, '100 leaves covers alone');
    const faded = await initCss({ daThumbSaturation: 40 });
    assert.match(faded, /\[data-da-video-id\]:not\(\[data-da-surface-skipped\]\):not\(\[data-da-override\]\) :is\(yt-thumbnail-view-model img, ytd-thumbnail img, #thumbnail img\) \{ filter: grayscale\(0\.6\) !important; \}/);
    assert.match(await initCss({ daThumbSaturation: 0 }), /grayscale\(1\)/);
});

test('shouldCleanEmojis strips emojis the way upstream does, before formatting', () => {
    const cp = String.fromCodePoint;
    const fire = cp(0x1F525);
    const make = (settings) => createDeArrowFeature({ appState: { settings: surfaceSettings(settings) } });
    const on = make({});
    assert.equal(on._formatTitle(`Best ${fire} video ${fire}${fire} EVER`, 'sentence'), 'Best video ever',
        'on by default; an emoji word goes with its space');
    assert.equal(on._formatTitle(`fire${fire}works`, 'original'), 'fire works', 'between letters it becomes a space');
    assert.equal(on._formatTitle(`${fire}${fire}`, 'original'), `${fire}${fire}`, 'a title of only emojis is kept');
    assert.equal(on._formatTitle(`Family ${cp(0x1F468, 0x200D, 0x1F469)} trip ${cp(0x1F44D, 0x1F3FD)}`, 'original'), 'Family trip',
        'joined and skin-tone sequences go whole');
    assert.equal(on._formatTitle(`Blood type ${cp(0x1F170, 0xFE0F)} wins`, 'original'), `Blood type ${cp(0x1F170, 0xFE0F)} wins`,
        'letter emojis stay');
    assert.equal(on._formatTitle(`${cp(0x1D407, 0x1D41E, 0x1D425, 0x1D425, 0x1D428)} world`, 'original'), 'Hello world',
        'bold math letters read as plain text');
    assert.equal(make({ daCleanEmojis: false })._formatTitle(`Best ${fire} video`, 'original'), `Best ${fire} video`);
});

test('the title formatter keeps acronyms and brand casing the way upstream titleFormatter.ts does', () => {
    const feature = createDeArrowFeature({ appState: { settings: surfaceSettings() } });
    const cases = [
        ['THIS IS INSANE!!!', 'sentence', 'This is insane'],
        ['I Bought The CHEAPEST iPhone On eBay', 'sentence', 'I bought the cheapest iPhone on eBay'],
        ['I Bought The CHEAPEST iPhone On eBay', 'title_case', 'I Bought the Cheapest iPhone on eBay'],
        ['why the US army uses this', 'title_case', 'Why the US Army Uses This'],
        ['Going to Paris with my GF - day 2', 'sentence', 'Going to Paris with my GF - Day 2'],
        ['the history of self-driving cars in the 1990s', 'title_case', 'The History of Self-Driving Cars in the 1990s'],
        ['My new 4K TV is here???', 'sentence', 'My new 4K TV is here?'],
        ['MrBeast vs. the U.S. army', 'title_case', 'MrBeast vs. the U.S. Army'],
        ["i think i'm lost", 'sentence', "I think I'm lost"],
        ['Top 10 GTA 5 Mods #shorts', 'sentence', 'Top 10 GTA 5 Mods #shorts'],
        ['you WON the NEW car', 'sentence', 'You won the new car'],
        // Trailing punctuation goes, except a dotted acronym's own period.
        ['Made in the U.S.', 'sentence', 'Made in the U.S.'],
        ['Wait for it...', 'sentence', 'Wait for it'],
        ['Why?!', 'title_case', 'Why?']
    ];
    for (const [input, format, expected] of cases) {
        assert.equal(feature._formatTitle(input, format), expected, `${format}: ${input}`);
    }
    // A crowd title's unusual capitals are trusted even when all caps
    // surround them; an uploader's are not.
    assert.equal(feature._formatTitle('HOW I FIXED my iPHONE', 'sentence', { isCustom: true }), 'How I fixed my iPHONE');
});

test('casual mode keeps the original title once a category reaches its vote threshold', () => {
    const rendered = [];
    const make = (settings) => {
        const feature = createDeArrowFeature({
            appState: { settings: surfaceSettings({ deArrowCasualMode: true, daFallbackFormat: true, ...settings }) }
        });
        feature._renderTitle = (_el, text, options) => { rendered.push([text, !!options.fallback]); return true; };
        return feature;
    };
    const titleEl = { textContent: 'MY TRIP TO PARIS' };
    const branding = (casualVotes) => ({ titles: [{ title: 'A week in Paris', votes: 2, UUID: 'u1' }], casualVotes });
    const apply = (settings, votes) => {
        rendered.length = 0;
        const drawn = make(settings)._applyTitle(titleEl, branding(votes));
        return { drawn, rendered: [...rendered] };
    };
    assert.deepEqual(apply({}, [{ id: 'funny', count: 1 }]).rendered, [['My trip to paris', true]],
        'a vote at the default threshold of 1 keeps the original, formatted');
    assert.deepEqual(apply({ daCasualFunny: 3 }, [{ id: 'funny', count: 2 }]).rendered, [['A week in Paris', false]],
        'below the threshold the crowd title wins');
    assert.deepEqual(apply({ daCasualFunny: 0 }, [{ id: 'funny', count: 9 }]).rendered, [['A week in Paris', false]],
        'a threshold of 0 ignores the category');
    assert.deepEqual(apply({ daCasualFunny: 3, daCasualClever: 2 }, [{ id: 'funny', count: 2 }, { id: 'clever', count: 2 }]).rendered,
        [['My trip to paris', true]], 'any one category is enough');
    assert.deepEqual(apply({}, [{ id: 'descriptive', count: 5, title: 'My trip to Rome' }]).rendered, [['A week in Paris', false]],
        'votes cast on a different original title do not count');
    assert.deepEqual(apply({}, [{ id: 'descriptive', count: 5, title: 'my trip to paris' }]).rendered, [['My trip to paris', true]],
        'the title match ignores case');
    assert.deepEqual(apply({ daCasualFormat: false }, [{ id: 'other', count: 1 }]), { drawn: false, rendered: [] },
        'with formatting off the original is left untouched');
    assert.deepEqual(apply({ deArrowCasualMode: false }, [{ id: 'funny', count: 5 }]).rendered, [['A week in Paris', false]],
        'votes mean nothing outside casual mode');
});

test('showOriginalThumbWhenCasual keeps the creator thumbnail when casual mode accepts the original', async () => {
    const run = async (settings, votes) => {
        const { card, img } = lockupCard({ videoId: 'abc123DEF45' });
        card.dataset.daVideoId = 'abc123DEF45';
        const feature = createDeArrowFeature({
            appState: { settings: surfaceSettings({ deArrowCasualMode: true, daReplaceTitles: false, ...settings }) }
        });
        feature._fetchBranding = async () => ({ titles: [], thumbnails: [{ timestamp: 42, votes: 1 }], casualVotes: votes });
        await withGlobals({ location: { origin: 'https://www.youtube.com', pathname: '/' } },
            () => feature._applyCard(card, 'abc123DEF45', feature._generation, feature._routeToken));
        return img.classList.contains('da-replaced-thumb');
    };
    assert.equal(await run({}, [{ id: 'funny', count: 1 }]), true, 'off by default, as upstream');
    assert.equal(await run({ daCasualOriginalThumb: true }, [{ id: 'funny', count: 1 }]), false);
    assert.equal(await run({ daCasualOriginalThumb: true }, []), true, 'without accepting votes the frame still replaces it');
});

test('the watch page looks itself up by SHA-256 hash prefix, cards by video ID', async () => {
    const id = 'abc123DEF45';
    const prefix = require('crypto').createHash('sha256').update(id).digest('hex').slice(0, 4);
    const urls = [];
    const make = (answer) => createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        extensionFetchJson: async ({ url }) => { urls.push(url); return answer(url); }
    });
    const entry = { titles: [{ title: 'Real title', votes: 3 }], thumbnails: [], casualVotes: [] };
    const hashed = await make(() => ({ data: { [id]: entry, zzzzzzzzzzz: { titles: [{ title: 'other' }] } } }))._fetchBranding(id, { byHash: true });
    assert.equal(urls.pop(), `https://sponsor.ajay.app/api/branding/${prefix}`);
    assert.equal(hashed.titles[0].title, 'Real title', 'the entry for this video is picked out');
    const missing = await make(() => ({ data: { zzzzzzzzzzz: entry } }))._fetchBranding(id, { byHash: true });
    assert.deepEqual([missing.titles, missing.thumbnails], [[], []], 'no entry is an empty answer');
    const notFound = await make(() => { throw Object.assign(new Error('404'), { response: { status: 404 }, data: {} }); })
        ._fetchBranding(id, { byHash: true });
    assert.deepEqual(notFound.titles, [], 'a 404 for the prefix is an empty answer');
    await make(() => ({ data: entry }))._fetchBranding(id);
    assert.equal(urls.pop(), `https://sponsor.ajay.app/api/branding?videoID=${id}`, 'cards keep the plain lookup');
    const noHash = createDeArrowFeature({
        appState: { settings: surfaceSettings() },
        sha256Hex: async () => { throw new Error('no subtle crypto'); },
        extensionFetchJson: async ({ url }) => { urls.push(url); return { data: entry }; }
    });
    await noHash._fetchBranding(id, { byHash: true });
    assert.equal(urls.pop(), `https://sponsor.ajay.app/api/branding?videoID=${id}`, 'without hashing it falls back to the plain lookup');
});
