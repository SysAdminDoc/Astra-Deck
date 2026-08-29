'use strict';

// These were two scans: does the file mention "YTKitFeatures", and does it
// mention at least two of five feature names. Neither could tell working CSS
// from a typo, so each builder now runs and its rule is read.

const test = require('node:test');
const assert = require('node:assert/strict');

const wave8 = require('../../extension/features/wave-8-css');

test('every wave-8 feature has a spec and a builder that produces CSS', () => {
    const ids = wave8.LIFECYCLE_SPECS.map((spec) => spec.id);
    assert.deepEqual(ids.slice().sort(), [
        'disableMiniPlayer',
        'hideLatestPosts',
        'hideNotificationButton',
        'noFrostedGlass',
        'nyanCatProgressBar',
    ], 'the wave-8 set is fixed; adding or dropping one has to be deliberate');

    for (const spec of wave8.LIFECYCLE_SPECS) {
        const css = spec.buildCss({});
        assert.equal(typeof css, 'string', `${spec.id} must build CSS`);
        assert.ok(css.includes('{') && css.includes('}'), `${spec.id} must build a real rule`);
    }
});

test('the hiding features hide, rather than merely mentioning a selector', () => {
    const notifications = wave8.buildHideNotificationButtonCss();
    assert.match(notifications, /ytd-notification-topbar-button-renderer[^{]*\{[^}]*display: none !important/);

    const posts = wave8.buildHideLatestPostsCss();
    assert.match(posts, /display: none !important/);
    assert.match(posts, /ytd-post-renderer/, 'the post renderer itself, not only its section wrapper');
    assert.match(posts, /ytd-backstage-post-thread-renderer/);

    const miniPlayer = wave8.buildDisableMiniPlayerCss();
    assert.match(miniPlayer, /ytd-miniplayer\[active\][^{]*\{[^}]*display: none !important/,
        'only the ACTIVE miniplayer: hiding the element outright breaks its own teardown');
    assert.match(miniPlayer, /\.ytp-miniplayer-button[^{]*\{[^}]*display: none !important/,
        'and the button that opens it, or the control is a dead end');
});

test('the frosted-glass removal is scoped, not a universal selector', () => {
    const css = wave8.buildNoFrostedGlassCss();
    assert.doesNotMatch(css, /^\s*\*\s*\{/,
        'a universal rule re-matches every element on every DOM mutation');
    assert.match(css, /backdrop-filter: none !important/);
    assert.match(css, /-webkit-backdrop-filter: none !important/,
        'the prefixed property has to go too or the blur survives');
    for (const surface of ['ytd-masthead', 'tp-yt-iron-dropdown', 'ytd-popup-container', '.ytp-chrome-bottom']) {
        assert.ok(css.includes(surface), `${surface} is one of the surfaces YouTube actually blurs`);
    }
});

test('the nyan progress bar animates a gradient rather than a static fill', () => {
    const css = wave8.buildNyanCatProgressBarCss();
    assert.match(css, /@keyframes ytkit-nyan-rainbow/, 'the keyframes it references must exist');
    assert.match(css, /animation: ytkit-nyan-rainbow [^;]*infinite !important/);
    assert.match(css, /background-size: 100% 600% !important/,
        'the gradient has to be taller than the bar for the animation to move through it');
});
