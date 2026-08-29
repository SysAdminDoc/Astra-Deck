'use strict';

// These were ten regex pins on the two Shorts features' source. Both are
// stateful and both are route-gated, which a pin cannot check at all, so they
// now run against a fake reel: the speed chip is cycled, the auto-advance
// handler is fired, and both are torn down.

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadFeature, fakeTreeDocument } = require('../helpers/monolith');

/** A Shorts page with one active reel. */
function shortsPage({ pathname = '/shorts/abc12345678', settings = {} } = {}) {
    // Built through the tree document so they record listeners the way a real
    // node does; a bare fakeNode swallows addEventListener.
    const scratch = fakeTreeDocument(() => null);
    const video = scratch.createElement('video');
    video.playbackRate = 1;
    video.loop = true;
    const nextButton = scratch.createElement('button');
    const documentRef = fakeTreeDocument((selector) => {
        if (String(selector).includes('video')) return video;
        if (String(selector).includes('navigation-button-down')) return nextButton;
        return null;
    });
    const timers = [];
    const rates = [];
    return {
        video,
        nextButton,
        documentRef,
        timers,
        rates,
        globals: {
            document: documentRef,
            location: { pathname },
            appState: { settings },
            setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
            clearTimeout: () => {},
            addMutationRule: () => {},
            removeMutationRule: () => {},
            addNavigateRule: () => {},
            removeNavigateRule: () => {},
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
