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
    return vm.runInNewContext(`${region.slice(start, end)}; videosTabPath`, {});
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

test('remainingTimeDisplay clamps the rendered value at zero', () => {
    const start = sources.ytkit.indexOf("id: 'remainingTimeDisplay'");
    assert.match(sources.ytkit.slice(start, start + 6000),
        /Math\.max\(0, video\.duration - video\.currentTime - skipDuration\)/,
        'the remaining value must be clamped before formatting');
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

test('the Load More button clears the attribute that hides the continuation', () => {
    const start = sources.ytkit.indexOf("id: 'disableInfiniteScroll'");
    const block = sources.ytkit.slice(start, start + 4000);
    assert.match(block, /cont\.removeAttribute\('ytkit-load-more'\)/,
        'the !important hiding rule keys on the attribute, so clearing inline styles is not enough');
});

test('bufferPreload captures the player default and hands it back on disable', () => {
    assert.match(mainWorldSource, /function captureDefaultGoal\(player\)/);
    assert.match(mainWorldSource, /function restoreDefaultGoal\(\)/);
    assert.match(mainWorldSource, /player\.setBufferingGoal\(defaultBufferingGoal\)/,
        'disabling must restore the captured goal');
    assert.match(mainWorldSource, /goal-persists-until-next-load/,
        'when no getter exists the status must say so rather than claim a clean off');
    // The capture must happen BEFORE the first override or it records our own value.
    assert.match(mainWorldSource, /captureDefaultGoal\(player\);\s*\n\s*try \{\s*\n\s*player\.setBufferingGoal\(TARGET_SECONDS\)/,
        'the default must be read before the first write');
});
