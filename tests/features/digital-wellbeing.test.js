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
