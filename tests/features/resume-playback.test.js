'use strict';

// Resume Playback runs its restore after an await, and YouTube reuses one
// <video> element across navigations. A restore that was still waiting for the
// player when the user moved on used to seek the next video to the old one's
// saved spot, and an init that resolved after a newer one installed a second
// pagehide listener that destroy never removed.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFeature } = require('../helpers/monolith');

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';

function listenerTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        fire(type) { for (const fn of [...(listeners.get(type) || [])]) fn(); },
        count(type) { return listeners.get(type)?.size || 0; }
    };
}

function harness(saved) {
    const timers = new Map();
    let nextTimer = 1;
    const intervals = new Set();
    const loads = [];
    const location = { href: `https://www.youtube.com/watch?v=${A}` };
    const video = Object.assign(listenerTarget(), { readyState: 0, currentTime: 0, duration: 600 });
    const win = listenerTarget();
    let navigate = null;
    const feature = loadFeature('resumePlayback', {
        URL,
        location,
        window: win,
        document: { querySelector: (selector) => (selector === 'video' ? video : null) },
        setTimeout: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
        clearTimeout: (id) => { timers.delete(id); },
        setInterval: () => { const id = nextTimer++; intervals.add(id); return id; },
        clearInterval: (id) => { intervals.delete(id); },
        VIDEO_ID_PATTERN: /^[A-Za-z0-9_-]{11}$/,
        isSafeObjectKey: (key) => !['__proto__', 'constructor', 'prototype'].includes(key),
        StorageManager: {
            get: () => new Promise((resolve) => loads.push(() => resolve(saved))),
            set: async () => {}
        },
        addNavigateRule: (_id, fn) => { navigate = fn; },
        removeNavigateRule: () => { navigate = null; }
    });
    const runTimers = () => {
        const due = [...timers.entries()];
        timers.clear();
        for (const [, fn] of due) fn();
    };
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    return { feature, timers, intervals, loads, location, video, win, runTimers, settle, navigate: () => navigate?.() };
}

test('a restore still waiting for the player never seeks the video that replaced it', async () => {
    const h = harness({ [A]: { time: 123, ts: 1 }, [B]: { time: 40, ts: 1 } });
    h.feature._initialized = true;
    const init = h.feature.init();
    h.loads.shift()();
    await init;

    h.runTimers();
    await h.settle();
    assert.equal(h.video.count('loadeddata'), 1, 'the restore for A waits on the player');

    h.location.href = `https://www.youtube.com/watch?v=${B}`;
    h.navigate();
    assert.equal(h.video.count('loadeddata'), 0, 'navigating cancels the wait for A');
    h.runTimers();
    await h.settle();
    h.video.fire('loadeddata');
    await h.settle();
    assert.equal(h.video.currentTime, 40, 'B resumes at its own saved spot, not at A\'s 123 s');

    h.feature._initialized = false;
    h.feature.destroy();
});

test('an init superseded during its load installs nothing, and destroy leaves nothing behind', async () => {
    const h = harness({ [A]: { time: 123, ts: 1 } });
    h.feature._initialized = true;
    const first = h.feature.init();
    h.feature._initialized = false;
    h.feature.destroy();
    h.feature._initialized = true;
    const second = h.feature.init();
    h.loads.shift()();
    h.loads.shift()();
    await Promise.all([first, second]);
    assert.equal(h.win.count('pagehide'), 1, 'only the newest init installs a pagehide listener');

    h.runTimers();
    await h.settle();
    h.feature._initialized = false;
    h.feature.destroy();
    assert.equal(h.win.count('pagehide'), 0, 'destroy removes the listener');
    assert.equal(h.video.count('loadeddata'), 0, 'destroy cancels a pending player wait');
    assert.equal(h.timers.size, 0, 'no restore timer survives destroy');
    assert.equal(h.intervals.size, 0, 'no save interval survives destroy');
    h.video.fire('loadeddata');
    await h.settle();
    assert.equal(h.video.currentTime, 0, 'nothing seeks after destroy');
});
