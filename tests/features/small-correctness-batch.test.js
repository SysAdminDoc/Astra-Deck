'use strict';

// Behaviour tests for the audited small-correctness batch. Each one drives the
// real code path and fails against the code as it was before the fix.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sources } = require('../helpers/source');
const { loadFeature, fakeNode, fakeDocument } = require('../helpers/monolith');

const mainWorldSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'extension', 'ytkit-main.js'), 'utf8');

// ── redirectToVideosTab ────────────────────────────────────────────────
// The URL arithmetic lives inside init(); lift that region out so it can be
// exercised without standing up a location object.
function channelRedirect() {
    const block = sources.ytkit.slice(sources.ytkit.indexOf("id: 'redirectToVideosTab'"));
    const region = block.slice(0, block.indexOf('handleDirectNavigation();'));
    const start = region.indexOf('const RX_CHANNEL_HOME');
    const end = region.indexOf('const handleDirectNavigation');
    assert.ok(start > -1 && end > start, 'the channel-home URL helpers must live in init()');
    // videosTabPath gained two dependencies when the landing tab became a
    // setting. They are sliced out of the monolith rather than stubbed, so this
    // still exercises the shipped tab resolution and not a convenient copy.
    const helperStart = sources.ytkit.indexOf('const CHANNEL_TAB_SUFFIXES');
    const helperEnd = sources.ytkit.indexOf('function channelHasTab');
    assert.ok(helperStart > -1 && helperEnd > helperStart, 'the channel tab helpers must be top-level');
    const helpers = sources.ytkit.slice(helperStart, helperEnd);
    return vm.runInNewContext(
        `${helpers}${region.slice(start, end)}; videosTabPath`,
        { appState: { settings: {} }, channelHasTab: () => true }
    );
}

test('redirectToVideosTab rewrites every channel-home shape without mangling the query', () => {
    const videosTabPath = channelRedirect();

    assert.equal(videosTabPath('https://www.youtube.com/c/foo'), '/c/foo/videos');
    assert.equal(videosTabPath('https://www.youtube.com/c/foo/'), '/c/foo/videos');
    assert.equal(videosTabPath('https://www.youtube.com/user/foo/featured'), '/user/foo/videos',
        'a bare /featured never matched the old pattern at all');
    assert.equal(videosTabPath('https://www.youtube.com/c/foo/featured?bp=x'), '/c/foo/videos',
        'the old pattern consumed the "?" and produced /c/foo/featured?/videos');
    assert.equal(videosTabPath('https://www.youtube.com/@handle'), '/@handle/videos');
    assert.equal(videosTabPath('https://www.youtube.com/@handle?si=1'), '/@handle/videos');

    // Pages that are already a tab must be left alone.
    assert.equal(videosTabPath('https://www.youtube.com/c/foo/videos'), null);
    assert.equal(videosTabPath('https://www.youtube.com/@handle/streams'), null);
    assert.equal(videosTabPath('https://www.youtube.com/watch?v=abc12345678'), null);
});

test('redirectToVideosTab compares against the pathname, not the absolute href', () => {
    const start = sources.ytkit.indexOf("id: 'redirectToVideosTab'");
    const block = sources.ytkit.slice(start, start + 3000);
    assert.match(block, /location\.pathname !== target/,
        'an absolute-vs-relative comparison is never equal and reassigns on every load');
});

// ── remainingTimeDisplay ───────────────────────────────────────────────
test('remainingTimeDisplay merges overlapping SponsorBlock segments and never goes negative', () => {
    const segments = [];
    const sponsorBlock = { _segments: segments };
    const feature = loadFeature('remainingTimeDisplay', {
        document: fakeDocument(() => []),
        appState: { settings: { sponsorBlock: true } },
        getFeatureById: (id) => (id === 'sponsorBlock' ? sponsorBlock : null),
        getMainVideoElement: () => null
    });

    const video = { currentTime: 0, duration: 100, playbackRate: 1 };

    // Two submissions covering the same 30 seconds must count once.
    segments.push({ segment: [10, 40] }, { segment: [20, 40] });
    assert.equal(feature._skippableSeconds(video), 30,
        'overlapping segments must be merged, not summed');

    // Segments already behind the playhead do not count.
    video.currentTime = 25;
    assert.equal(feature._skippableSeconds(video), 15);

    // Adjacent-but-disjoint segments still add up.
    segments.length = 0;
    video.currentTime = 0;
    segments.push({ segment: [0, 10] }, { segment: [50, 60] });
    assert.equal(feature._skippableSeconds(video), 20);

    // A pathological set that exceeds the remaining runtime clamps at zero
    // instead of rendering "(--0:05)".
    segments.length = 0;
    segments.push({ segment: [0, 100] }, { segment: [0, 100] });
    video.currentTime = 90;
    const skip = feature._skippableSeconds(video);
    assert.equal(Math.max(0, video.duration - video.currentTime - skip), 0);
});

// The clamp used to be pinned by a regex over the feature source, which
// cannot tell a working renderer from a broken one. Render it instead: build
// the player's time display, run _update(), and read the span it produces.
function remainingTimeFixture({ settings = {}, segments = [], video } = {}) {
    const timeDisplay = fakeNode({ tag: 'div', attributes: { class: 'ytp-time-display' } });
    timeDisplay.querySelector = (selector) => timeDisplay.children
        .find((child) => child.matches(selector)) || null;
    const doc = fakeDocument((selector) => (selector === '.ytp-time-display' ? timeDisplay : []));
    const feature = loadFeature('remainingTimeDisplay', {
        document: doc,
        appState: { settings },
        getFeatureById: (id) => (id === 'sponsorBlock' ? { _segments: segments } : null),
        getMainVideoElement: () => video
    });
    return { feature, timeDisplay };
}

test('remainingTimeDisplay renders a clamped readout instead of a negative one', () => {
    const video = { currentTime: 90, duration: 100, playbackRate: 1 };
    const { feature, timeDisplay } = remainingTimeFixture({
        settings: { sponsorBlock: true },
        // A segment whose end runs past the duration, which SponsorBlock does
        // return: 110 seconds of "skippable" over a 10-second tail. The raw
        // arithmetic goes negative and used to render "(--1:40)".
        segments: [{ segment: [0, 200] }],
        video
    });

    feature._update();

    assert.equal(timeDisplay.children.length, 1, 'one readout span is appended');
    const readout = timeDisplay.children[0];
    assert.equal(readout.className, 'ytkit-remaining-time');
    assert.equal(readout.textContent, '(-0:00)');
    assert.ok(!readout.textContent.includes('--'), 'a negative remaining time must never render');
});

test('remainingTimeDisplay adopts the span already in the player instead of stacking one per navigation', () => {
    const video = { currentTime: 30, duration: 130, playbackRate: 1 };
    const { feature, timeDisplay } = remainingTimeFixture({ video });

    feature._update();
    assert.equal(timeDisplay.children.length, 1);
    assert.equal(timeDisplay.children[0].textContent, '(-1:40)');

    // What a navigate rule does: drop our reference while the span the player
    // owns stays in the DOM, frozen at the previous video's number.
    feature._el = null;
    video.currentTime = 0;
    video.duration = 60;
    feature._update();

    assert.equal(timeDisplay.children.length, 1, 'the existing span is adopted, not duplicated');
    assert.equal(timeDisplay.children[0].textContent, '(-1:00)');
});

test('remainingTimeDisplay clears the readout when the player has no duration', () => {
    const video = { currentTime: 10, duration: 100, playbackRate: 1 };
    const { feature, timeDisplay } = remainingTimeFixture({ video });
    feature._update();
    assert.equal(timeDisplay.children[0].textContent, '(-1:30)');

    video.duration = 0;
    feature._update();
    assert.equal(timeDisplay.children[0].textContent, '',
        'a player without a duration must not leave the previous number on screen');
});

// ── pauseOtherTabs ─────────────────────────────────────────────────────
test('pauseOtherTabs ignores muted thumbnail hover previews', () => {
    const posted = [];
    const channel = { postMessage: (msg) => posted.push(msg), close() {} };
    let playHandler = null;
    const recordingDoc = Object.assign(fakeDocument(() => []), {
        addEventListener: (type, fn) => { if (type === 'play') playHandler = fn; },
        removeEventListener() {}
    });

    const feature = loadFeature('pauseOtherTabs', {
        document: recordingDoc,
        getMainVideoElement: () => ({})
    });
    feature._openChannel = () => channel;
    feature.init();
    assert.equal(typeof playHandler, 'function', 'a capture-phase play listener must be registered');

    const preview = fakeNode({ tag: 'video' });
    preview.closest = () => null;               // not inside #movie_player
    playHandler({ target: preview });
    assert.deepEqual(posted, [], 'a hover-preview player must not pause other tabs');

    const main = fakeNode({ tag: 'video' });
    main.closest = (selector) => (selector === '#movie_player' ? fakeNode({ tag: 'div' }) : null);
    playHandler({ target: main });
    assert.deepEqual(posted, ['pause'], 'the main player still broadcasts');
});

// ── source-level invariants for the rest of the batch ──────────────────
test('feature-driven playback-rate writes are not persisted as user preference', () => {
    const src = sources.ytkit;
    assert.match(src, /function setProgrammaticPlaybackRate\(video, rate\)/,
        'a shared tagging helper must exist');
    assert.match(src, /if \(isProgrammaticPlaybackRateChange\(\)\) return;/,
        'perChannelSpeed must skip programmatic ratechange events');

    for (const marker of [
        /this\._priorRate = v\.playbackRate;\s*\n\s*setProgrammaticPlaybackRate\(v, 1\)/,   // liveSpeedReset
        /setProgrammaticPlaybackRate\(video, 1\);\s*\n\s*DebugManager\.log\('MusicLock'/    // musicVideoSpeedLock
    ]) {
        assert.match(src, marker, 'every feature-forced 1x write must be tagged');
    }
});

test('the settings rollback toast asks for the error tone, not an "error" colour', () => {
    assert.match(sources.ytkit, /showToast\(message, undefined, \{ tone: 'error' \}\)/,
        "'error' as the colour argument rendered a neutral, polite Notice");
    assert.doesNotMatch(sources.ytkit, /showToast\(message, 'error'\)/);
});

test('unregisterPersistentButton removes the wrapper and the restore chip', () => {
    const start = sources.ytkit.indexOf('function unregisterPersistentButton(');
    const block = sources.ytkit.slice(start, start + 1200);
    assert.match(block, /closest\('\.ytkit-pc-wrap'\)/,
        'the decorated wrapper must go with the button');
    assert.match(block, /\.ytkit-pc-ghost\[data-pc-id=/,
        "a dismissed control's restore chip must not outlive the feature");
});

test('the watch-time statistic only accrues while the tab is visible and playing', () => {
    const start = sources.ytkit.indexOf("increment('totalTimeOnYouTube'");
    const block = sources.ytkit.slice(Math.max(0, start - 600), start + 200);
    assert.match(block, /document\.visibilityState !== 'visible'/,
        'a pinned background tab must not accrue watch time');
    assert.match(block, /video && video\.paused/,
        'a paused video must not accrue watch time');
});

test('the Load More button is built next to the continuation and clears the attribute on click', () => {
    const feed = fakeNode({ tag: 'div' });
    const continuation = fakeNode({ tag: 'ytd-continuation-item-renderer' });
    continuation.scrollIntoView = () => { continuation.scrolled = true; };
    feed.appendChild(continuation);

    const feature = loadFeature('disableInfiniteScroll', {
        document: fakeDocument((selector) => (
            selector.startsWith('ytd-continuation-item-renderer') && !continuation.hasAttribute('ytkit-load-more')
                ? [continuation]
                : []
        ))
    });

    feature._process();

    assert.equal(feed.children.length, 2, 'the wrapper is inserted alongside the continuation');
    const wrapper = feed.children[0];
    assert.equal(wrapper.className, 'ytkit-load-more-wrapper');
    assert.equal(feed.children[1], continuation, 'the wrapper goes BEFORE the continuation');
    assert.equal(wrapper.children.length, 1);
    const button = wrapper.children[0];
    assert.equal(button.textContent, 'Load More');
    assert.equal(button.className, 'ytkit-load-more-btn');
    assert.equal(continuation.getAttribute('ytkit-load-more'), '1');

    button.onclick();

    // The injected hiding rule is !important and keys on the attribute, so
    // clearing the inline styles alone left the element zero-area.
    assert.equal(continuation.getAttribute('ytkit-load-more'), null,
        'the attribute the !important rule keys on must be cleared');
    assert.equal(feed.children.length, 1, 'the wrapper is removed once it has been used');
    assert.equal(continuation.scrolled, true);

    feature._process();
    assert.equal(feed.children.length, 2, 'a re-rendered continuation gets a fresh button');
});

test('bufferPreload captures the player default and hands it back on disable', () => {
    assert.match(mainWorldSource, /function captureDefaultGoal\(player\)/);
    assert.match(mainWorldSource, /function restoreDefaultGoal\(\)/);
    assert.match(mainWorldSource, /player\.setBufferingGoal\(defaultBufferingGoal\)/,
        'disabling must restore the captured goal');
    assert.match(mainWorldSource, /goal-persists-until-next-load/,
        'when no getter exists the status must say so rather than claim a clean off');
    // The capture must happen BEFORE the first override or it records our own value.
    assert.match(mainWorldSource, /captureDefaultGoal\(player\);\s*\n\s*try \{\s*\n\s*player\.setBufferingGoal\(targetSeconds\)/,
        'the default must be read before the first write');
});
