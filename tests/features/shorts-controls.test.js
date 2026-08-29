'use strict';

// These were ten regex pins on the two Shorts features' source. Both are
// stateful and both are route-gated, which a pin cannot check at all, so they
// now run against a fake reel: the speed chip is cycled, the auto-advance
// handler is fired, and both are torn down.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFeature, fakeTreeDocument } = require('../helpers/monolith');

/**
 * A Shorts page. The reel carousel keeps several `<video>` elements mounted
 * and only one carries `is-active`, so the fixture answers the two selectors
 * separately: a fixture that returned the same node for any selector
 * containing "video" would let the active-reel targeting be deleted without a
 * single test noticing.
 */
function shortsPage({ pathname = '/shorts/abc12345678', settings = {}, activeReel = true } = {}) {
    // Built through the tree document so they record listeners the way a real
    // node does; a bare fakeNode swallows addEventListener.
    const scratch = fakeTreeDocument(() => null);
    const newVideo = () => {
        const node = scratch.createElement('video');
        node.playbackRate = 1;
        node.loop = true;
        return node;
    };
    // The reel that is on screen, and the neighbour the carousel keeps mounted
    // under #shorts-player. Driving the wrong one changes a Short the user
    // cannot see.
    const video = newVideo();
    const offscreenVideo = newVideo();
    const nextButton = scratch.createElement('button');
    const documentRef = fakeTreeDocument((selector) => {
        const text = String(selector);
        if (text.includes('navigation-button-down')) return nextButton;
        if (text.includes('ytd-reel-video-renderer[is-active]')) return activeReel ? video : null;
        if (text.includes('#shorts-player')) return offscreenVideo;
        return null;
    });
    const timers = [];
    const rates = [];
    const navigateRules = new Map();
    return {
        video,
        offscreenVideo,
        nextButton,
        documentRef,
        timers,
        rates,
        navigateRules,
        globals: {
            document: documentRef,
            location: { pathname },
            appState: { settings },
            setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
            clearTimeout: () => {},
            addMutationRule: () => {},
            removeMutationRule: () => {},
            addNavigateRule: (id, rule) => navigateRules.set(id, rule),
            removeNavigateRule: (id) => navigateRules.delete(id),
            injectStyle: () => ({ remove() {} }),
            registerCornerStackElement: () => () => {},
            setProgrammaticPlaybackRate: (target, rate) => { rates.push(rate); target.playbackRate = rate; },
            getMainVideoElement: () => video,
        },
    };
}

test('the Shorts speed chip starts at the persistent default and cycles from there', () => {
    const page = shortsPage({ settings: { persistentSpeed: true, persistentSpeedValue: 1.5 } });
    const feature = loadFeature('shortsSpeedControl', page.globals);

    feature._apply();
    assert.equal(page.video.playbackRate, 1.5, 'the persistent speed is the starting point');

    feature._cycle();
    assert.equal(page.video.playbackRate, 2, '1.5x steps up to 2x');
    feature._cycle();
    assert.equal(page.video.playbackRate, 0.5, 'and wraps around the end of the list');
});

test('a persistent speed that is not one of the steps advances upward, never snapping down', () => {
    // 1.75 is reachable through the persistent-speed setting but is not a step.
    const page = shortsPage({ settings: { persistentSpeed: true, persistentSpeedValue: 1.75 } });
    const feature = loadFeature('shortsSpeedControl', page.globals);

    feature._apply();
    assert.equal(page.video.playbackRate, 1.75);
    feature._cycle();
    assert.equal(page.video.playbackRate, 2, 'the next step ABOVE 1.75, not a snap back to 0.5x');
});

test('with no persistent speed the chip starts at 1x', () => {
    const page = shortsPage({ settings: {} });
    const feature = loadFeature('shortsSpeedControl', page.globals);
    feature._apply();
    assert.equal(page.video.playbackRate, 1);

    const disabled = shortsPage({ settings: { persistentSpeed: false, persistentSpeedValue: 2 } });
    const off = loadFeature('shortsSpeedControl', disabled.globals);
    off._apply();
    assert.equal(disabled.video.playbackRate, 1, 'the value only counts while the toggle is on');
});

test('the speed chip does nothing off the Shorts route', () => {
    const page = shortsPage({ pathname: '/watch', settings: { persistentSpeed: true, persistentSpeedValue: 2 } });
    const feature = loadFeature('shortsSpeedControl', page.globals);
    feature._apply();
    assert.equal(page.video.playbackRate, 1, 'a watch-page video must keep its own rate');
});

test('the speed chip restores 1x on teardown without persisting it', () => {
    const page = shortsPage({ settings: { persistentSpeed: true, persistentSpeedValue: 1.5 } });
    const feature = loadFeature('shortsSpeedControl', page.globals);
    feature._apply();
    feature.destroy();
    assert.deepEqual(page.rates, [1],
        'teardown goes through the programmatic setter, so perChannelSpeed does not learn 1x as a choice');
});

test('auto-advance unloops the reel and clicks the native next control when it ends', () => {
    const page = shortsPage();
    const feature = loadFeature('shortsAutoAdvance', page.globals);

    feature.init();
    assert.equal(page.video.loop, false, 'a looping video never fires ended');
    assert.ok(page.video.listeners?.get('ended')?.size > 0, 'and the advance rides that event');

    page.video.listeners.get('ended').forEach((handler) => handler());
    assert.equal(page.nextButton.clicked, 1, 'the native down-navigation control is what advances the reel');
});

test('auto-advance leaves a watch page alone and detaches on teardown', () => {
    const watch = shortsPage({ pathname: '/watch' });
    const off = loadFeature('shortsAutoAdvance', watch.globals);
    off.init();
    assert.equal(watch.video.loop, true, 'a watch-page video must keep its own loop setting');
    assert.equal(watch.video.listeners?.get('ended'), undefined);

    const page = shortsPage();
    const feature = loadFeature('shortsAutoAdvance', page.globals);
    feature.init();
    feature.destroy();
    page.video.listeners.get('ended')?.forEach((handler) => handler());
    assert.equal(page.nextButton.clicked, 0, 'a torn-down feature must not still be advancing reels');
});

test('the chip cycles the whole published step list, in order', () => {
    // The description promises 0.5x-2x. Proving only that 1.5 steps to 2 and 2
    // wraps to 0.5 leaves every step between them free to disappear.
    const page = shortsPage({ settings: { persistentSpeed: true, persistentSpeedValue: 0.5 } });
    const feature = loadFeature('shortsSpeedControl', page.globals);
    feature._apply();

    const seen = [page.video.playbackRate];
    for (let i = 0; i < 8 && !(seen.length > 1 && seen[seen.length - 1] === seen[0]); i += 1) {
        feature._cycle();
        seen.push(page.video.playbackRate);
    }
    assert.equal(seen[seen.length - 1], seen[0], 'the cycle must return to where it started');
    assert.deepEqual(seen.slice(0, -1), [0.5, 0.75, 1, 1.25, 1.5, 2],
        'every advertised step is reachable by clicking the chip');
});

test('the chip drives the reel that is on screen, not a neighbour the carousel kept mounted', () => {
    const page = shortsPage({ settings: { persistentSpeed: true, persistentSpeedValue: 1.5 } });
    const feature = loadFeature('shortsSpeedControl', page.globals);
    feature._apply();

    assert.equal(page.video.playbackRate, 1.5, 'the active reel is the one that changes speed');
    assert.equal(page.offscreenVideo.playbackRate, 1,
        'a mounted-but-offscreen Short must keep its own rate');
});

test('the chip falls back to the player video when no reel is marked active', () => {
    const page = shortsPage({ activeReel: false, settings: { persistentSpeed: true, persistentSpeedValue: 1.5 } });
    const feature = loadFeature('shortsSpeedControl', page.globals);
    feature._apply();
    assert.equal(page.offscreenVideo.playbackRate, 1.5,
        'the fallback selector is what keeps the chip working mid-transition');
});

test('auto-advance rides the active reel and re-attaches on navigation', () => {
    const page = shortsPage();
    const feature = loadFeature('shortsAutoAdvance', page.globals);
    feature.init();

    assert.equal(page.video.loop, false, 'the reel on screen is unlooped');
    assert.equal(page.offscreenVideo.loop, true, 'a neighbour reel is left alone');
    assert.ok(page.navigateRules.has('shortsAutoAdvance'),
        'Shorts are an SPA route; without a navigate rule the handler stays on the first reel');

    // The navigate rule schedules the re-attach rather than doing it inline.
    page.navigateRules.get('shortsAutoAdvance')();
    const scheduled = page.timers[page.timers.length - 1];
    assert.ok(scheduled && scheduled.delay > 0, 'the re-attach is deferred, not immediate');
});

test('auto-advance releases its navigate rule on teardown', () => {
    const page = shortsPage();
    const feature = loadFeature('shortsAutoAdvance', page.globals);
    feature.init();
    feature.destroy();
    assert.equal(page.navigateRules.has('shortsAutoAdvance'), false,
        'a rule left registered keeps firing after the feature is switched off');
});
