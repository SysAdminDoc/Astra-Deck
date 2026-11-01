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

// ── Shorts Player Controls ──────────────────────────────────────────────────

const REEL_VIDEO = { tag: 'video', ancestors: [{ tag: 'ytd-reel-video-renderer' }] };

// An observer that delivers what the player sets, for the attributes it was told to watch.
function fakeAttributeObservers() {
    const observers = [];
    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.watching = [];
            observers.push(this);
        }
        observe(target, options) {
            this.watching = this.watching.filter((entry) => entry.target !== target);
            this.watching.push({ target, attributes: options.attributeFilter });
        }
        disconnect() { this.watching = []; }
    }
    return {
        FakeMutationObserver,
        deliver(target, attribute) {
            observers.forEach((observer) => {
                if (observer.watching.some((entry) => entry.target === target && entry.attributes.includes(attribute))) {
                    observer.callback([]);
                }
            });
        },
    };
}

function shortsPlayer({ videoReady = true } = {}) {
    const state = { videoReady };
    const attributeObservers = fakeAttributeObservers();
    const documentRef = fakeTreeDocument((selector) => {
        if (selectorMatches(selector, REEL_VIDEO)) return state.videoReady ? [state.video] : [];
        return null;
    });
    state.video = documentRef.createElement('video');
    state.video.controls = false;
    state.video.loop = true;
    const mutationRules = new Map();
    state.documentRef = documentRef;
    state.mutationRules = mutationRules;
    state.feature = loadFeature('shortsAsRegularVideo', {
        document: documentRef,
        MutationObserver: attributeObservers.FakeMutationObserver,
        addMutationRule: (id, rule) => mutationRules.set(id, rule),
        removeMutationRule: (id) => mutationRules.delete(id),
        injectStyle: () => ({ remove() {} }),
    });
    // What the player does to the video it keeps: for each new Short and after
    // a seek. Measured live, with no other mutation on the page to follow it.
    state.playerSets = (attribute, value) => {
        state.video[attribute] = value;
        attributeObservers.deliver(state.video, attribute);
    };
    return state;
}

function assertEnhanced(video, when) {
    assert.equal(video.controls, true, `controls ${when}`);
    assert.equal(video.loop, false, `no loop ${when}`);
    assert.equal(video.style.objectFit, 'contain', `contain ${when}`);
}

test('Shorts Player Controls covers the Short on screen when it turns on', () => {
    const player = shortsPlayer();
    player.feature.init();
    player.mutationRules.get('shortsAsRegularVideo')();
    assertEnhanced(player.video, 'on the first Short');
});

test('the controls come back on every next Short, since YouTube resets the one video it keeps', () => {
    const player = shortsPlayer();
    player.feature.init();
    player.mutationRules.get('shortsAsRegularVideo')();

    player.video.controls = false;
    player.video.loop = true;
    player.mutationRules.get('shortsAsRegularVideo')();
    assertEnhanced(player.video, 'after a page change');
});

test('a reset with nothing else on the page changing is undone too, as after a seek', () => {
    const player = shortsPlayer();
    player.feature.init();
    player.mutationRules.get('shortsAsRegularVideo')();

    player.playerSets('loop', true);
    assert.equal(player.video.loop, false, 'a looping video never ends');
    player.playerSets('controls', false);
    assert.equal(player.video.controls, true, 'and the controls stay');
});

test('a reel that had no video yet gets the controls once the video shows up', () => {
    const player = shortsPlayer({ videoReady: false });
    player.feature.init();
    player.mutationRules.get('shortsAsRegularVideo')();
    player.videoReady = true;
    player.mutationRules.get('shortsAsRegularVideo')();
    assertEnhanced(player.video, 'on a late video');
});

test('turning it off hands the player back and stops listening', () => {
    const player = shortsPlayer();
    player.feature.init();
    player.mutationRules.get('shortsAsRegularVideo')();
    player.feature.destroy();

    assert.equal(player.video.controls, false);
    assert.equal(player.video.loop, true, 'a Short loops again');
    assert.equal(player.video.style.objectFit, '');
    assert.equal(player.mutationRules.has('shortsAsRegularVideo'), false);

    player.playerSets('loop', true);
    player.playerSets('controls', false);
    assert.equal(player.video.loop, true, 'a torn-down feature leaves the next Short alone');
    assert.equal(player.video.controls, false);
});
