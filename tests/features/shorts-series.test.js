'use strict';

// The three Shorts settings against what a Shorts series really is on desktop.
// Measured on 2026-11-01, signed out, at /show/VLPLOHLtX9hAwfo: four
// ytd-playlist-video-renderer rows and a "Play episode" ytd-button-renderer, every
// link a bare /shorts/<id> that doesn't name the series. The episode's player
// reads "Episodes • E1". YouTube keeps one reel and one <video> across Shorts,
// and sets controls and loop back on that same video for each new Short and
// after a seek.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFeature, fakeNode, fakeTreeDocument, selectorMatches } = require('../helpers/monolith');

// ── Remove Shorts ───────────────────────────────────────────────────────────

function removeShortsOn(pathname, { alreadyHidden = false } = {}) {
    const row = fakeNode({ tag: 'ytd-playlist-video-renderer' });
    row.style = { display: alreadyHidden ? 'none' : '' };
    if (alreadyHidden) row.dataset.ytkitShortsHidden = '1';
    const link = { row };
    const mutationRules = new Map();
    const feature = loadFeature('removeAllShorts', {
        document: fakeTreeDocument((selector) => {
            if (String(selector).includes('data-ytkit-shorts-hidden')) return row.dataset.ytkitShortsHidden ? [row] : [];
            if (selector === 'a[href^="/shorts"]') return [link];
            return [];
        }),
        appState: { settings: { removeAllShorts: true } },
        window: { location: { pathname } },
        location: { pathname },
        HTMLElement: Object,
        isWatchPagePath: () => false,
        findShortsHideTarget: (anchor) => anchor.row,
        getFeatureName: () => 'Remove Shorts',
        applyHideAttribution: () => {},
        addMutationRule: (id, rule) => mutationRules.set(id, rule),
        removeMutationRule: () => {},
        addNavigateRule: () => {},
        removeNavigateRule: () => {},
        injectStyle: () => ({ remove() {} }),
    });
    return { row, feature, mutationRules };
}

const OPENED_ON_PURPOSE = [
    '/show/VLPLOHLtX9hAwfo',
    '/playlist',
    '/playlist/',
    '/channel/UC9HvSOvNpFpjydzDkAQJCNw/shorts',
    '/c/SomeName/shorts',
    '/user/SomeName/shorts',
    '/@KinigraDeon/shorts',
    '/results',
];

for (const pathname of OPENED_ON_PURPOSE) {
    test(`Remove Shorts leaves ${pathname} alone`, () => {
        const page = removeShortsOn(pathname);
        page.feature.init();
        assert.equal(page.row.style.display, '', 'the first scan keeps the row');
        page.mutationRules.get('removeAllShorts')();
        assert.equal(page.row.style.display, '', 'and so does every later mutation');
        assert.equal(page.row.dataset.ytkitShortsHidden, undefined);
    });

    test(`moving to ${pathname} gives back a row hidden on the last page`, () => {
        const page = removeShortsOn(pathname, { alreadyHidden: true });
        page.feature.init();
        assert.equal(page.row.style.display, '');
        assert.equal(page.row.dataset.ytkitShortsHidden, undefined);
    });
}

for (const pathname of ['/', '/feed/subscriptions', '/playlists', '/showcase', '/channels', '/feed/playlist']) {
    test(`Remove Shorts still hides Shorts on ${pathname}`, () => {
        const page = removeShortsOn(pathname);
        page.feature.init();
        assert.equal(page.row.style.display, 'none');
        assert.equal(page.row.dataset.ytkitShortsHidden, '1');
    });
}

// ── Redirect Shorts ─────────────────────────────────────────────────────────

function redirectShortsSession() {
    const replaced = [];
    const location = {
        href: 'https://www.youtube.com/',
        pathname: '/',
        replace: (url) => replaced.push(url),
    };
    const navigateRules = new Map();
    const feature = loadFeature('redirectShorts', {
        window: { location },
        location,
        URL,
        URLSearchParams,
        addNavigateRule: (id, rule) => navigateRules.set(id, rule),
        removeNavigateRule: (id) => navigateRules.delete(id),
    });
    feature.init();
    return {
        replaced,
        navigateRules,
        feature,
        go(path) {
            const url = new URL(path, 'https://www.youtube.com');
            location.href = url.href;
            location.pathname = url.pathname;
            navigateRules.get('redirectShorts')();
        },
    };
}

test('an episode opened from its series page keeps the series, so the next episode comes next', () => {
    const session = redirectShortsSession();
    session.go('/show/VLPLOHLtX9hAwfo?sbp=QAE%253D');
    assert.equal(session.replaced.length, 0, 'the series page itself stays put');
    session.go('/shorts/XGK5rHmUVi0');
    assert.deepEqual([...session.replaced], ['https://www.youtube.com/watch?v=XGK5rHmUVi0&list=PLOHLtX9hAwfo']);
});

test('a season tab of a series page counts as that series', () => {
    const session = redirectShortsSession();
    session.go('/show/VLPLOHLtX9hAwfo?season=1&sbp=CgEx');
    session.go('/shorts/XGK5rHmUVi0');
    assert.deepEqual([...session.replaced], ['https://www.youtube.com/watch?v=XGK5rHmUVi0&list=PLOHLtX9hAwfo']);
});

test('a Short opened from anywhere else has no list', () => {
    const session = redirectShortsSession();
    session.go('/feed/subscriptions');
    session.go('/shorts/XGK5rHmUVi0');
    assert.deepEqual([...session.replaced], ['https://www.youtube.com/watch?v=XGK5rHmUVi0']);
});

test('leaving a series page forgets the series', () => {
    const session = redirectShortsSession();
    session.go('/show/VLPLOHLtX9hAwfo');
    session.go('/feed/subscriptions');
    session.go('/shorts/XGK5rHmUVi0');
    assert.deepEqual([...session.replaced], ['https://www.youtube.com/watch?v=XGK5rHmUVi0']);
});

test('a shared link keeps its own parameters as parameters, not glued to the video id', () => {
    const session = redirectShortsSession();
    session.go('/shorts/XGK5rHmUVi0?si=abc123&t=5');
    assert.deepEqual([...session.replaced], ['https://www.youtube.com/watch?v=XGK5rHmUVi0&si=abc123&t=5']);
});

test('a shared link cannot swap the video by naming its own v', () => {
    const session = redirectShortsSession();
    session.go('/shorts/XGK5rHmUVi0?v=somethingElse');
    assert.deepEqual([...session.replaced], ['https://www.youtube.com/watch?v=XGK5rHmUVi0']);
});

test('a Shorts path with no id stays where it is', () => {
    const session = redirectShortsSession();
    session.go('/shorts/');
    assert.equal(session.replaced.length, 0);
});

test('Redirect Shorts releases its rule on teardown', () => {
    const session = redirectShortsSession();
    session.feature.destroy();
    assert.equal(session.navigateRules.has('redirectShorts'), false);
});
