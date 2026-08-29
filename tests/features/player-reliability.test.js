'use strict';

// Three player-reliability features, all previously held by regex pins on an
// 8000-character window of ytkit.js. All three are stateful — a retry budget, a
// resume record, a fullscreen guard — which is exactly what a pin cannot check,
// so each one now runs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadFeature, fakeNode, fakeTreeDocument } = require('../helpers/monolith');

const repoRoot = path.join(__dirname, '..', '..');

// ── autoExitFullscreen ──────────────────────────────────────────────────────

/** A watch page with a video, optional fullscreen, and an optional up-next. */
function watchPage({ fullscreen = true, playlist = null, queue = null } = {}) {
    const scratch = fakeTreeDocument(() => null);
    const video = scratch.createElement('video');
    const exits = [];

    let panel = null;
    if (playlist) {
        panel = fakeNode({ tag: 'ytd-playlist-panel-renderer' });
        const items = playlist.map((selected, index) => {
            const item = fakeNode({ tag: 'ytd-playlist-panel-video-renderer' });
            if (selected) item.setAttribute('selected', '');
            item.index = index;
            return item;
        });
        // Routed on the exact selector. A panel that answered every selector
        // with the same list would let the item selector be replaced by one
        // that matches nothing, and the up-next check would still "work".
        // Substring routing is not enough either: it accepts a selector that
        // merely CONTAINS the real one, which a real querySelectorAll would
        // find nothing for.
        panel.querySelectorAll = (selector) =>
            (String(selector) === 'ytd-playlist-panel-video-renderer' ? items : []);
    }

    const documentRef = fakeTreeDocument((selector) => {
        if (String(selector).includes('playlist-panel-renderer')) return panel;
        return null;
    });
    documentRef.fullscreenElement = fullscreen ? fakeNode({ tag: 'div' }) : null;
    documentRef.exitFullscreen = () => exits.push(Date.now());

    return {
        video,
        exits,
        globals: {
            document: documentRef,
            appState: { settings: queue ? { persistentQueue: true } : {} },
            storageReadJSON: (_key, fallback) => (queue ? { items: queue } : fallback),
            getMainVideoElement: () => video,
            addNavigateRule: () => {},
            removeNavigateRule: () => {},
        },
    };
}

const endVideo = (page) => page.video.listeners.get('ended').forEach((handler) => handler());

test('a finished video leaves fullscreen', () => {
    const page = watchPage({ fullscreen: true });
    const feature = loadFeature('autoExitFullscreen', page.globals);
    feature.init();
    endVideo(page);
    assert.equal(page.exits.length, 1, 'the whole point of the feature');
});

test('a finished video outside fullscreen changes nothing', () => {
    const page = watchPage({ fullscreen: false });
    const feature = loadFeature('autoExitFullscreen', page.globals);
    feature.init();
    endVideo(page);
    assert.deepEqual(page.exits, [], 'there is no fullscreen to leave');
});

test('fullscreen is kept when a playlist has another entry to play', () => {
    // Selected entry is not the last one, so YouTube will advance.
    const midPlaylist = watchPage({ playlist: [false, true, false] });
    const midFeature = loadFeature('autoExitFullscreen', midPlaylist.globals);
    midFeature.init();
    endVideo(midPlaylist);
    assert.deepEqual(midPlaylist.exits, [], 'dropping out of fullscreen mid-playlist is the bug');

    // Selected entry IS the last one, so nothing follows.
    const lastPlaylist = watchPage({ playlist: [false, false, true] });
    const lastFeature = loadFeature('autoExitFullscreen', lastPlaylist.globals);
    lastFeature.init();
    endVideo(lastPlaylist);
    assert.equal(lastPlaylist.exits.length, 1, 'the end of a playlist is still the end');
});

test('fullscreen is kept when the persistent queue has something waiting', () => {
    const page = watchPage({ queue: [{ id: 'next' }] });
    const feature = loadFeature('autoExitFullscreen', page.globals);
    feature.init();
    endVideo(page);
    assert.deepEqual(page.exits, [], 'the queue advances, so fullscreen stays');
});

test('teardown detaches the ended listener and the navigate rule', () => {
    const page = watchPage({ fullscreen: true });
    const removed = [];
    const feature = loadFeature('autoExitFullscreen', {
        ...page.globals,
        removeNavigateRule: (id) => removed.push(id),
    });
    feature.init();
    feature.destroy();
    endVideo(page);
    assert.deepEqual(page.exits, [], 'a torn-down feature must not still be exiting fullscreen');
    assert.deepEqual(removed, ['autoExitFullscreen']);
});

// ── playbackErrorRecovery ───────────────────────────────────────────────────

/** A watch page showing (or not showing) the player error screen. */
function erroringPlayer({ error = true, videoId = 'dQw4w9WgXcQ', stored = null, now = Date.now() } = {}) {
    const session = new Map();
    if (stored) session.set('ytkit-playback-recovery', JSON.stringify(stored));
    const reloads = [];
    const logs = [];
    const toasts = [];
    const scratch = fakeTreeDocument(() => null);
    const video = scratch.createElement('video');
    video.duration = 600;
    video.currentTime = 0;
    video.playbackRate = 1;

    const documentRef = fakeTreeDocument((selector) =>
        (String(selector).includes('ytp-error') && error ? fakeNode({ tag: 'div' }) : null));

    return {
        session,
        reloads,
        logs,
        toasts,
        video,
        globals: {
            document: documentRef,
            location: { search: `?v=${videoId}`, reload: () => reloads.push(Date.now()) },
            URLSearchParams,
            sessionStorage: {
                getItem: (key) => (session.has(key) ? session.get(key) : null),
                setItem: (key, value) => session.set(key, value),
                removeItem: (key) => session.delete(key),
            },
            Date: { now: () => now },
            getMainVideoElement: () => video,
            DebugManager: { log: (area, message) => logs.push(`${area}: ${message}`) },
            showToast: (message) => toasts.push(message),
            addMutationRule: () => {},
            removeMutationRule: () => {},
            addNavigateRule: () => {},
            removeNavigateRule: () => {},
            setTimeout: () => 1,
            clearTimeout: () => {},
        },
    };
}

test('the error screen reloads the page and records the attempt', () => {
    const page = erroringPlayer({ error: true });
    const feature = loadFeature('playbackErrorRecovery', page.globals);
    feature._detectError();

    assert.equal(page.reloads.length, 1, 'recovery is a reload');
    const state = JSON.parse(page.session.get('ytkit-playback-recovery'));
    assert.equal(state.videoId, 'dQw4w9WgXcQ');
    assert.equal(state.attempts, 1, 'the first attempt is recorded before the reload');
    assert.ok(page.logs.some((line) => line.startsWith('PlaybackRecovery:')), 'and left in the log');
});

test('the retry budget is capped and the give-up is logged', () => {
    const page = erroringPlayer({
        error: true,
        stored: { videoId: 'dQw4w9WgXcQ', t: 0, rate: 1, attempts: 3, at: Date.now() },
    });
    const feature = loadFeature('playbackErrorRecovery', page.globals);
    feature._detectError();

    assert.deepEqual(page.reloads, [], 'three reloads that did not help must not become four');
    assert.ok(page.logs.some((line) => /giving up/i.test(line)), 'and the user-visible log must say so');
});

test('the budget is three attempts, spent one at a time', () => {
    // Only asserting that 3 gives up leaves any smaller cap passing too, and a
    // cap of 1 turns a transient decode error into a single failed reload.
    const spent = (attempts) => {
        const page = erroringPlayer({
            error: true,
            stored: { videoId: 'dQw4w9WgXcQ', t: 0, rate: 1, attempts, at: Date.now() },
        });
        loadFeature('playbackErrorRecovery', page.globals)._detectError();
        return page.reloads.length;
    };

    assert.equal(spent(0), 1, 'the first error reloads');
    assert.equal(spent(1), 1, 'so does the second');
    assert.equal(spent(2), 1, 'and the third, which is the last one the budget buys');
    assert.equal(spent(3), 0, 'the fourth is refused');
});

test('the recovery toast names the budget it is spending', () => {
    const now = 1_800_000_000_000;
    const page = erroringPlayer({
        error: false,
        stored: { videoId: 'dQw4w9WgXcQ', t: 120, rate: 1, attempts: 2, at: now - 1000 },
        now,
    });
    loadFeature('playbackErrorRecovery', page.globals)._maybeResume();
    assert.equal(page.toasts.length, 1);
    assert.match(page.toasts[0], /attempt 2\/3/,
        'a user watching a video reload twice needs to know how many tries are left');
});

test('an attempt count belonging to another video does not spend this one budget', () => {
    const page = erroringPlayer({
        error: true,
        videoId: 'dQw4w9WgXcQ',
        stored: { videoId: 'SOMETHINGELSE', t: 0, rate: 1, attempts: 3, at: Date.now() },
    });
    const feature = loadFeature('playbackErrorRecovery', page.globals);
    feature._detectError();

    assert.equal(page.reloads.length, 1, 'a fresh video gets a fresh budget');
    assert.equal(JSON.parse(page.session.get('ytkit-playback-recovery')).attempts, 1);
});

test('no error screen means no reload', () => {
    const page = erroringPlayer({ error: false });
    const feature = loadFeature('playbackErrorRecovery', page.globals);
    feature._detectError();
    assert.deepEqual(page.reloads, [], 'a working player must never be reloaded under the user');
});

test('a resume record for another video, or an expired one, is discarded', () => {
    const now = 1_800_000_000_000;

    const otherVideo = erroringPlayer({
        error: false,
        videoId: 'dQw4w9WgXcQ',
        stored: { videoId: 'SOMETHINGELSE', t: 120, rate: 2, attempts: 1, at: now },
        now,
    });
    loadFeature('playbackErrorRecovery', otherVideo.globals)._maybeResume();
    assert.equal(otherVideo.session.has('ytkit-playback-recovery'), false, 'stale state is cleared');
    assert.equal(otherVideo.video.currentTime, 0, 'and never applied to the wrong video');

    const expired = erroringPlayer({
        error: false,
        stored: { videoId: 'dQw4w9WgXcQ', t: 120, rate: 2, attempts: 1, at: now - 60001 },
        now,
    });
    loadFeature('playbackErrorRecovery', expired.globals)._maybeResume();
    assert.equal(expired.session.has('ytkit-playback-recovery'), false, 'a record older than 60s expires');
    assert.equal(expired.video.currentTime, 0);
});

test('a fresh resume record restores the position and the speed', () => {
    const now = 1_800_000_000_000;
    const page = erroringPlayer({
        error: false,
        stored: { videoId: 'dQw4w9WgXcQ', t: 120, rate: 2, attempts: 1, at: now - 1000 },
        now,
    });
    loadFeature('playbackErrorRecovery', page.globals)._maybeResume();

    assert.equal(page.video.currentTime, 120, 'the user comes back where they were');
    assert.equal(page.video.playbackRate, 2, 'at the speed they had chosen');
    assert.equal(page.toasts.length, 1, 'and is told the recovery happened');
});

test('teardown removes both rules', () => {
    const removed = [];
    const page = erroringPlayer({ error: false });
    const feature = loadFeature('playbackErrorRecovery', {
        ...page.globals,
        removeMutationRule: (id) => removed.push(`mutation:${id}`),
        removeNavigateRule: (id) => removed.push(`nav:${id}`),
    });
    feature.init();
    feature.destroy();
    assert.deepEqual(removed.sort(),
        ['mutation:playbackErrorRecovery', 'nav:playbackErrorRecovery']);
});

// ── fullscreenScroll ────────────────────────────────────────────────────────

test('fullscreen scroll restores the page only while the document is fullscreen', () => {
    const injected = [];
    const feature = loadFeature('fullscreenScroll', {
        document: fakeTreeDocument(() => null),
        injectStyle: (css) => { injected.push(css); return { remove() {} }; },
    });
    feature.init();
    assert.equal(injected.length, 1);
    const css = injected[0];

    assert.match(css, /html:fullscreen body \{ overflow-y: auto !important; \}/,
        'body scroll is restored only under :fullscreen, or the watch page scrolls normally');
    assert.match(css, /ytd-app\[fullscreen\] ytd-watch-flexy\[fullscreen\] #columns \{ display: flex !important/,
        'columns come back only under the fullscreen attributes');
    assert.match(css, /--yt-spec-base-background/,
        'a theme-aware background, or light theme renders unreadable text on white');
});

test('autoExitFullscreen is registered off by default across catalog surfaces', () => {
    // Defaults and the schema are data; reading them is the claim.
    const defaults = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'extension', 'default-settings.json'), 'utf8'));
    assert.equal(defaults.autoExitFullscreen, false);
    const schemaSrc = fs.readFileSync(
        path.join(repoRoot, 'extension', 'core', 'settings-schema.js'), 'utf8');
    assert.match(schemaSrc, /key: "autoExitFullscreen"/);
});
