'use strict';

// Digital Wellbeing.
//
// This module had no test file of its own — it appeared only in the i18n
// ratchet, the light-theme lane and the peel inventory, none of which can tell a
// working timer from a broken one. What matters here is that it counts watch
// time only while something is actually playing and visible, that it survives a
// day boundary (the NF34 bug: sessionElapsed went negative across midnight and
// suppressed every break reminder for the rest of the day), and that its
// teardown actually releases the interval and the two document/window listeners
// it installs, since that is precisely what the steady-state budget now gates.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDigitalWellbeingFeature } = require('../../extension/features/digital-wellbeing');
const { fakeTreeDocument } = require('../helpers/monolith');

function stubEnvironment(t, { hasVideo = true, paused = false, hidden = false, pathname = '/watch' } = {}) {
    const documentListeners = new Map();
    const windowListeners = new Map();
    const video = { paused, pause() { this.paused = true; } };
    const documentRef = {
        hidden,
        visibilityState: hidden ? 'hidden' : 'visible',
        querySelector: (selector) => (selector === 'video' && hasVideo ? video : null),
        querySelectorAll: () => [],
        addEventListener: (type, handler) => {
            if (!documentListeners.has(type)) documentListeners.set(type, new Set());
            documentListeners.get(type).add(handler);
        },
        removeEventListener: (type, handler) => documentListeners.get(type)?.delete(handler),
        body: { appendChild() {}, contains: () => false }
    };
    const windowRef = {
        addEventListener: (type, handler) => {
            if (!windowListeners.has(type)) windowListeners.set(type, new Set());
            windowListeners.get(type).add(handler);
        },
        removeEventListener: (type, handler) => windowListeners.get(type)?.delete(handler)
    };

    // Timers are instrumented, not just observed through the feature's own
    // handle. Asserting `_timer === null` after destroy is satisfied by code
    // that nulls the field without ever calling clearInterval: the assertion
    // passes and the interval runs forever, which showed up as node --test
    // hanging rather than as a failure. Record the calls instead.
    const intervals = { started: [], cleared: [] };
    const previous = {
        document: global.document,
        window: global.window,
        location: globalThis.location,
        setInterval: global.setInterval,
        clearInterval: global.clearInterval
    };
    global.setInterval = (handler, ms) => {
        const handle = previous.setInterval(handler, ms);
        intervals.started.push(handle);
        return handle;
    };
    global.clearInterval = (handle) => {
        intervals.cleared.push(handle);
        return previous.clearInterval(handle);
    };
    global.document = documentRef;
    global.window = windowRef;
    Object.defineProperty(globalThis, 'location', {
        value: { pathname },
        configurable: true,
        writable: true
    });
    // Restoration is handed back rather than registered here. node runs after
    // hooks in registration order, so a hook registered inside this helper ran
    // BEFORE the caller's feature teardown and left destroy() reading
    // removeEventListener off an undefined window. One hook per test, tearing
    // the feature down first and restoring the globals second, is the only
    // order that works.
    const restore = () => {
        global.document = previous.document;
        global.window = previous.window;
        global.setInterval = previous.setInterval;
        global.clearInterval = previous.clearInterval;
        // Nothing may outlive the test, whatever the feature did or failed to do.
        for (const handle of intervals.started) previous.clearInterval(handle);
        Object.defineProperty(globalThis, 'location', {
            value: previous.location,
            configurable: true,
            writable: true
        });
    };

    return { documentRef, windowRef, video, documentListeners, windowListeners, intervals, restore };
}

function build({ settings = {}, store = {} } = {}) {
    const styles = [];
    const feature = createDigitalWellbeingFeature({
        appState: { settings },
        StorageManager: {
            get: (key, fallbackValue) => (key in store ? store[key] : fallbackValue),
            set: (key, value) => { store[key] = value; }
        },
        settingsManager: { save() {} },
        injectStyle: (css, id) => {
            const handle = { id, removed: false, remove() { this.removed = true; } };
            styles.push(handle);
            return handle;
        }
    });
    return { feature, styles, store };
}

test('watch time accrues only while something is actually playing and visible', (t) => {
    const playing = stubEnvironment(t, { paused: false });
    t.after(playing.restore);
    const { feature } = build();

    feature._pendingSeconds = 0;
    feature._tick();
    assert.equal(feature._pendingSeconds, 1, 'a playing, visible video counts a second');

    playing.video.paused = true;
    feature._tick();
    assert.equal(feature._pendingSeconds, 1, 'a paused video counts nothing');

    playing.video.paused = false;
    playing.documentRef.hidden = true;
    feature._tick();
    assert.equal(feature._pendingSeconds, 1, 'a hidden tab counts nothing');
});

test('a page with no video element counts nothing and does not throw', (t) => {
    const env = stubEnvironment(t, { hasVideo: false });
    t.after(env.restore);
    const { feature } = build();

    feature._pendingSeconds = 0;
    feature._tick();
    assert.equal(feature._pendingSeconds, 0);
});

test('crossing a day boundary re-anchors the session instead of going negative', (t) => {
    const env = stubEnvironment(t, { paused: false });
    t.after(env.restore);
    const { feature } = build();

    // Yesterday's session had accumulated well past anything the new day can
    // hold, which is the shape that made sessionElapsed negative and suppressed
    // every break reminder for the rest of the day.
    feature._sessionStart = 4000;
    feature._pendingSeconds = 120;
    feature._lastTodayKey = '2026-09-04';

    // _todayKey reads the real clock, so whatever it returns differs from the
    // key planted above. That is the rollover the fix has to catch.
    feature._tick();

    assert.notEqual(feature._lastTodayKey, '2026-09-04', 'the day key advances to the current day');
    const elapsed = feature._loadToday().seconds - feature._sessionStart;
    assert.ok(elapsed >= 0,
        `sessionElapsed must not be negative after a day boundary, got ${elapsed}`);
    assert.ok(feature._sessionStart < 4000,
        'the baseline is re-anchored to the new day rather than left on yesterday total');
});

test('the shorts route is recognised only as its own path segment', (t) => {
    const shorts = stubEnvironment(t, { pathname: '/shorts/abc123' });
    t.after(shorts.restore);
    const { feature } = build();
    assert.equal(feature._isShortsRoute(), true);

    shorts.documentRef.hidden = false;
    for (const pathname of ['/watch', '/shortsomething', '/results?q=shorts', '/']) {
        Object.defineProperty(globalThis, 'location', {
            value: { pathname }, configurable: true, writable: true
        });
        assert.equal(feature._isShortsRoute(), false, `${pathname} is not the shorts route`);
    }
});

test('destroy releases the interval and both listeners it installed', (t) => {
    const env = stubEnvironment(t);
    const { feature, styles } = build();

    feature.init();
    // Unconditional teardown, feature first and globals second. A failing
    // assertion below used to leave the one-second interval running, which held
    // node --test open long past the test itself and made a plain assertion
    // failure look like a hang.
    t.after(() => { feature.destroy(); env.restore(); });

    assert.ok(feature._timer, 'init starts the one-second timer');
    assert.equal(env.windowListeners.get('pagehide')?.size, 1, 'init listens for pagehide');
    assert.equal(env.documentListeners.get('visibilitychange')?.size, 1, 'init listens for visibilitychange');
    assert.equal(styles.length, 1);

    feature.destroy();

    assert.equal(env.intervals.started.length, 1, 'init started exactly one interval');
    assert.deepEqual(env.intervals.cleared, env.intervals.started,
        'destroy must call clearInterval on the handle it started, not merely null the field');
    assert.equal(feature._timer, null, 'destroy clears the timer handle');
    assert.equal(env.windowListeners.get('pagehide')?.size ?? 0, 0,
        'destroy removes the pagehide listener, or the page leaks one per teardown');
    assert.equal(env.documentListeners.get('visibilitychange')?.size ?? 0, 0,
        'destroy removes the visibilitychange listener');
    assert.equal(feature._flushHandler, null);
    assert.equal(feature._visibilityHandler, null);
    assert.equal(styles[0].removed, true, 'destroy removes the injected stylesheet');
    assert.equal(feature._sessionStart, 0);
    assert.equal(feature._pendingSeconds, 0);
    assert.equal(feature._lastTodayKey, null);
});

test('counted seconds are flushed to storage on pagehide rather than lost', (t) => {
    const env = stubEnvironment(t, { paused: false });
    const settings = {};
    const { feature } = build({ settings });

    feature.init();
    t.after(() => { feature.destroy(); env.restore(); });
    feature._pendingSeconds = 7;

    for (const handler of env.windowListeners.get('pagehide')) handler();

    assert.equal(feature._pendingSeconds, 0, 'the pending seconds are merged, not dropped');
    assert.equal(settings.dwWatchTimeToday?.seconds, 7,
        'the counted seconds land in the daily ledger rather than being dropped with the page');
});


// The reminder itself.
//
// Everything above measures the counter. An adversarial review pointed out that
// the counter is not the feature: pushing the break threshold out of reach
// disables the entire user-visible purpose of Digital Wellbeing and every test
// stayed green, because the lightweight stub above cannot build an overlay.
// These use the real fake-DOM helper so the overlay path is reachable.

function overlayEnvironment(t, { paused = false, pathname = '/watch' } = {}) {
    const documentRef = fakeTreeDocument(() => null);
    const video = { paused, pause() { this.paused = true; }, play() { this.paused = false; } };
    const realQuerySelector = documentRef.querySelector.bind(documentRef);
    documentRef.querySelector = (selector) => (selector === 'video' ? video : realQuerySelector(selector));
    documentRef.hidden = false;
    documentRef.visibilityState = 'visible';

    const windowListeners = new Map();
    const windowRef = {
        addEventListener: (type, handler) => {
            if (!windowListeners.has(type)) windowListeners.set(type, new Set());
            windowListeners.get(type).add(handler);
        },
        removeEventListener: (type, handler) => windowListeners.get(type)?.delete(handler)
    };

    const previous = {
        document: global.document,
        window: global.window,
        location: globalThis.location,
        requestAnimationFrame: global.requestAnimationFrame,
        cancelAnimationFrame: global.cancelAnimationFrame
    };
    global.document = documentRef;
    global.window = windowRef;
    // The overlay focuses its button on the next frame. Without this the whole
    // reminder path throws ReferenceError and the feature looks like it simply
    // never fired, which is how it stayed untested.
    global.requestAnimationFrame = (fn) => { fn(0); return 1; };
    global.cancelAnimationFrame = () => {};
    Object.defineProperty(globalThis, 'location', { value: { pathname }, configurable: true, writable: true });
    const restore = () => {
        global.document = previous.document;
        global.window = previous.window;
        global.requestAnimationFrame = previous.requestAnimationFrame;
        global.cancelAnimationFrame = previous.cancelAnimationFrame;
        Object.defineProperty(globalThis, 'location', { value: previous.location, configurable: true, writable: true });
    };
    t.after(restore);
    return { documentRef, video, restore };
}

test('the break reminder appears once the session passes the configured interval', (t) => {
    const env = overlayEnvironment(t, { paused: false });
    const { feature } = build({ settings: { dwBreakIntervalMin: 1 } });

    // One minute configured, so sixty counted seconds past the session baseline
    // must trigger it. _sessionStart of 0 means "not yet anchored" to this
    // module, so the baseline here is a real second rather than zero.
    feature._sessionStart = 1;
    feature._pendingSeconds = 59;
    feature._tick();

    assert.equal(feature._overlay, null, 'nothing one tick short of the interval');

    feature._tick();

    assert.ok(feature._overlay, 'the reminder is the feature, not a nice-to-have');
    assert.equal(feature._overlay.dataset.kind, 'break');
    assert.equal(env.video.paused, true, 'a break reminder pauses playback');

    feature._clearOverlay();
});

test('a break interval of zero never interrupts', (t) => {
    overlayEnvironment(t, { paused: false });
    const { feature } = build({ settings: { dwBreakIntervalMin: 0 } });

    feature._sessionStart = 1;
    feature._pendingSeconds = 100000;
    feature._tick();

    assert.equal(feature._overlay, null, 'off means off, however long the session ran');
});

test('the shorts ledger accrues separately from the all-video ledger', (t) => {
    overlayEnvironment(t, { paused: false, pathname: '/shorts/abc123' });
    const { feature } = build();

    feature._pendingSeconds = 0;
    feature._pendingShortsSeconds = 0;
    feature._tick();

    assert.equal(feature._pendingSeconds, 1, 'shorts time counts toward the overall day too');
    assert.equal(feature._pendingShortsSeconds, 1, 'and toward the separate shorts budget');
});

test('a new local day starts the persisted counter from zero', (t) => {
    overlayEnvironment(t);
    const settings = { dwWatchTimeToday: { date: '2001-01-01', seconds: 9999 } };
    const { feature } = build({ settings });

    // A stored bucket from another day must not be carried into today, or the
    // daily cap fires immediately every morning.
    assert.equal(feature._persistedToday().seconds, 0);
    assert.notEqual(feature._persistedToday().date, '2001-01-01');
});

test('destroy flushes counted seconds rather than dropping them', (t) => {
    overlayEnvironment(t);
    const settings = {};
    const { feature } = build({ settings });

    feature.init();
    feature._pendingSeconds = 11;
    feature.destroy();

    assert.equal(settings.dwWatchTimeToday?.seconds, 11,
        'closing the tab must not lose the time already counted');
});
