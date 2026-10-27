'use strict';

// The diagnostic ring is saved on its own bounded schedule, so an error
// recorded on this page is still there after a reload even when no setting
// was edited in between. These drive the module on a fake clock.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'extension', 'core', 'diagnostic-log.js'), 'utf8');

function fakeClock() {
    let at = 1_000_000;
    let nextId = 1;
    const timers = new Map();
    return {
        now: () => at,
        setTimer(fn, ms) {
            const id = nextId++;
            timers.set(id, { fn, due: at + ms });
            return id;
        },
        clearTimer(id) { timers.delete(id); },
        pending: () => timers.size,
        // Runs every timer due by `at + ms`, in order, letting promise
        // callbacks settle between them.
        async advance(ms) {
            const end = at + ms;
            for (;;) {
                let next = null;
                for (const [id, timer] of timers) {
                    if (timer.due <= end && (!next || timer.due < next[1].due)) next = [id, timer];
                }
                if (!next) break;
                timers.delete(next[0]);
                at = Math.max(at, next[1].due);
                next[1].fn();
                for (let i = 0; i < 5; i++) await Promise.resolve();
            }
            at = end;
            for (let i = 0; i < 5; i++) await Promise.resolve();
        }
    };
}

function createLog({ settings, save, saveEntries, clock, keepInMemory, cap } = {}) {
    const sandbox = { YTKitCore: {}, console: { warn: (...args) => sandbox.warnings.push(args) }, warnings: [] };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(SOURCE, sandbox);
    const log = sandbox.YTKitCore.createDiagnosticLog({
        getSettings: () => settings,
        saveSettings: save,
        saveEntries,
        now: clock.now,
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        keepInMemory,
        cap
    });
    return { log, warnings: sandbox.warnings };
}

// A storage area that keeps a JSON copy of each saved ring, like a reload would.
function fakeStore() {
    const store = { writes: [], saved: null };
    store.save = (settings) => {
        store.writes.push(settings._errors.length);
        store.saved = JSON.parse(JSON.stringify(settings._errors));
        return Promise.resolve({ ok: true });
    };
    return store;
}

test('a recorded error survives a reload without any settings edit', async () => {
    const clock = fakeClock();
    const store = fakeStore();
    const { log } = createLog({ settings: { diagnosticLog: true, _errors: [] }, save: store.save, clock });
    log.record('window', 'TypeError in ytkit.js');
    assert.equal(store.writes.length, 0, 'nothing is written synchronously');
    await clock.advance(2000);
    assert.equal(store.writes.length, 1);

    const reloaded = createLog({ settings: { diagnosticLog: true, _errors: store.saved }, save: store.save, clock });
    const entries = JSON.parse(JSON.stringify(reloaded.log.get()));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].msg, 'TypeError in ytkit.js');
});

test('writes are debounced and a steady trickle still saves within ten seconds', async () => {
    const clock = fakeClock();
    const store = fakeStore();
    const { log } = createLog({ settings: { diagnosticLog: true, _errors: [] }, save: store.save, clock });
    log.record('a', '1');
    await clock.advance(500);
    log.record('a', '2');
    await clock.advance(500);
    log.record('a', '3');
    await clock.advance(1999);
    assert.equal(store.writes.length, 0, 'still inside the quiet period');
    await clock.advance(1);
    assert.deepEqual(store.writes, [3], 'three records, one write');

    for (let i = 0; i < 15; i++) {
        log.record('b', String(i));
        await clock.advance(1000);
    }
    assert.ok(store.writes.length >= 2, 'the ten-second ceiling forces a write during a trickle');
    assert.ok(store.writes.length <= 3);
});

test('an error storm stays inside the ring cap and the write budget', async () => {
    const clock = fakeClock();
    const store = fakeStore();
    const settings = { diagnosticLog: true, _errors: [] };
    const writeTimes = [];
    const save = (s) => { writeTimes.push(clock.now()); return store.save(s); };
    const { log } = createLog({ settings, save, clock, cap: 50 });
    for (let i = 0; i < 10000; i++) {
        log.record('storm', `error ${i}`);
        await clock.advance(30);
    }
    await clock.advance(120000);
    assert.equal(settings._errors.length, 50, 'the ring cap holds');
    assert.ok(store.saved.length <= 50);
    for (const start of writeTimes) {
        const inWindow = writeTimes.filter((ts) => ts >= start && ts < start + 60000).length;
        assert.ok(inWindow <= 6, `at most six writes a minute, saw ${inWindow}`);
    }
    assert.ok(writeTimes.length >= 25, 'a five-minute storm is still saved regularly');
});

test('a failed save pauses saving, logs nothing about itself and never throws', async () => {
    const clock = fakeClock();
    const settings = { diagnosticLog: true, _errors: [] };
    let attempts = 0;
    let log;
    // Like the storage failure handler: a failing write records an entry.
    const save = () => {
        attempts += 1;
        log.record('storage-write-failure', 'quota exceeded');
        return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
    };
    const created = createLog({ settings, save, clock });
    log = created.log;
    log.record('window', 'first');
    await clock.advance(2000);
    assert.equal(attempts, 1);
    const entriesAfterFailure = settings._errors.length;

    await clock.advance(4 * 60 * 1000);
    assert.equal(attempts, 1, 'no retry inside the five-minute pause');
    assert.equal(settings._errors.length, entriesAfterFailure, 'the failure itself was not recorded by the log');
    await clock.advance(10 * 60 * 1000);
    assert.ok(attempts <= 4, `retries stay paced, saw ${attempts}`);
    assert.equal(created.warnings.length, 1, 'one console warning, not one per attempt');

    const throwing = createLog({ settings: { diagnosticLog: true, _errors: [] }, save: () => { throw new Error('sync'); }, clock });
    assert.doesNotThrow(() => throwing.log.record('window', 'x'));
    await clock.advance(2000);
    assert.doesNotThrow(() => throwing.log.record('window', 'y'));
});

test('a save that answers ok:false counts as a failure too', async () => {
    const clock = fakeClock();
    let attempts = 0;
    const { log, warnings } = createLog({
        settings: { diagnosticLog: true, _errors: [] },
        save: () => { attempts += 1; return Promise.resolve({ ok: false, error: 'quota' }); },
        clock
    });
    log.record('a', '1');
    await clock.advance(2000);
    log.record('a', '2');
    await clock.advance(60000);
    assert.equal(attempts, 1);
    assert.equal(warnings.length, 1);
});

test('a private window and a log that is not opted in never write', async () => {
    const clock = fakeClock();
    const store = fakeStore();
    const privateSettings = { diagnosticLog: true, _errors: [] };
    const priv = createLog({ settings: privateSettings, save: store.save, clock, keepInMemory: () => true });
    priv.log.record('window', 'watched /watch?v=abc');
    assert.equal(priv.log._journal.pending, false, 'a private record schedules nothing');
    assert.equal(clock.pending(), 0);
    priv.log.flush({ force: true });
    await clock.advance(60000);
    assert.equal(store.writes.length, 0);
    assert.equal(privateSettings._errors.length, 0, 'the saved ring is untouched');

    const off = createLog({ settings: { diagnosticLog: false, _errors: [] }, save: store.save, clock });
    off.log.enable();
    off.log.record('window', 'dev switch only');
    assert.equal(off.log._journal.pending, false, 'the dev switch schedules nothing');
    assert.equal(clock.pending(), 0);
    off.log.flush({ force: true });
    await clock.advance(60000);
    assert.equal(store.writes.length, 0, 'the in-memory test switch is not consent to save');
});

test('a page hide saves at once, past the budget but not past a failure pause', async () => {
    const clock = fakeClock();
    const store = fakeStore();
    const { log } = createLog({ settings: { diagnosticLog: true, _errors: [] }, save: store.save, clock });
    for (let i = 0; i < 6; i++) {
        log.record('a', String(i));
        log.flush({ force: true });
        await clock.advance(10);
    }
    log.record('a', 'last before reload');
    log.flush();
    assert.equal(store.writes.length, 6, 'an ordinary flush waits for the budget');
    log.flush({ force: true });
    await clock.advance(0);
    assert.equal(store.writes.length, 7, 'the page-hide flush does not');
    assert.equal(store.saved.at(-1).msg, 'last before reload');

    let attempts = 0;
    const failing = createLog({
        settings: { diagnosticLog: true, _errors: [] },
        save: () => { attempts += 1; return Promise.reject(new Error('quota')); },
        clock
    });
    failing.log.record('a', '1');
    await clock.advance(2000);
    assert.equal(attempts, 1);
    failing.log.record('a', '2');
    failing.log.flush({ force: true });
    assert.equal(attempts, 1, 'a forced flush still respects the failure pause');
});

test('clearing the log cancels a pending save', async () => {
    const clock = fakeClock();
    const saves = [];
    const settings = { diagnosticLog: true, _errors: [] };
    const { log } = createLog({ settings, save: (s) => { saves.push(s._errors.length); return Promise.resolve({ ok: true }); }, clock });
    log.record('a', '1');
    log.clear();
    await clock.advance(60000);
    assert.deepEqual(saves, [0], 'only the clear itself was written');
    assert.equal(clock.pending(), 0);
});

test('the timed write sends only the ring and keeps entries recorded while it is in flight', async () => {
    const clock = fakeClock();
    const settings = { diagnosticLog: true, _errors: [], theme: 'half-edited' };
    const sent = [];
    let wholeSaves = 0;
    let settle;
    const { log } = createLog({
        settings,
        save: () => { wholeSaves += 1; return Promise.resolve({ ok: true }); },
        saveEntries: (entries) => {
            sent.push(entries);
            return new Promise((resolve) => { settle = resolve; });
        },
        clock
    });
    log.record('a', 'first');
    await clock.advance(2000);
    assert.equal(sent.length, 1);
    assert.equal(wholeSaves, 0, 'no whole-settings save, so unrelated edits are not flushed');
    log.record('a', 'during the write');
    sent[0].push({ ctx: 'x', msg: 'mutated by the receiver' });
    assert.equal(settings._errors.length, 2, 'the sent copy is not the live ring');
    settle({ ok: true });
    await clock.advance(0);
    await clock.advance(2000);
    assert.equal(sent.length, 2, 'the entry recorded mid-write gets its own write');
    assert.deepEqual(sent[1].map((entry) => entry.msg), ['first', 'during the write']);
});

test('a failed ring write never falls back to a whole-settings save', async () => {
    const clock = fakeClock();
    let wholeSaves = 0;
    let attempts = 0;
    const { log } = createLog({
        settings: { diagnosticLog: true, _errors: [] },
        save: () => { wholeSaves += 1; return Promise.resolve({ ok: true }); },
        saveEntries: () => { attempts += 1; return Promise.resolve({ ok: false, error: 'QUOTA_BYTES' }); },
        clock
    });
    log.record('a', '1');
    await clock.advance(2000);
    log.record('a', '2');
    await clock.advance(6 * 60 * 1000);
    assert.equal(attempts, 2, 'one try, then one more after the pause');
    assert.equal(wholeSaves, 0);
});

test('a save that never settles stops blocking the log after thirty seconds', async () => {
    const clock = fakeClock();
    const sent = [];
    const { log, warnings } = createLog({
        settings: { diagnosticLog: true, _errors: [] },
        saveEntries: (entries) => {
            sent.push(entries.length);
            return sent.length === 1 ? new Promise(() => {}) : Promise.resolve({ ok: true });
        },
        clock
    });
    log.record('a', '1');
    await clock.advance(2000);
    log.record('a', '2');
    await clock.advance(29000);
    assert.equal(log._journal.flushing, true, 'still waiting inside the timeout');
    await clock.advance(1000);
    assert.equal(log._journal.flushing, false);
    assert.equal(warnings.length, 1, 'the hung write counts as a failure');
    await clock.advance(5 * 60 * 1000);
    assert.deepEqual(sent, [1, 2], 'saving resumes after the failure pause');
    assert.equal(clock.pending(), 0, 'no watchdog timer is left behind');
});

test('clearing the log swallows a rejected save', async () => {
    const clock = fakeClock();
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
        const { log } = createLog({
            settings: { diagnosticLog: true, _errors: [] },
            save: () => Promise.reject(new Error('quota')),
            clock
        });
        log.clear();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
    assert.equal(unhandled.length, 0);
});

test('the page flushes the log when it is hidden', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'ytkit.js'), 'utf8');
    const start = src.indexOf("id: 'diagnosticLog'");
    const block = src.slice(start, src.indexOf("id: 'selectorHealthPanel'", start));
    assert.match(block, /addEventListener\('pagehide', this\._onPageHide = \(\) => DiagnosticLog\.flush\?\.\(\{ force: true \}\)\)/);
    assert.match(block, /removeEventListener\('pagehide', this\._onPageHide\)/);
    assert.match(src, /return settingsManager\.save\(settings\);/,
        'the save result reaches the log so a failed write can pause it');
    assert.match(src, /saveEntries: \(entries\) => \{\s*if \(typeof settingsManager !== 'undefined' && settingsManager\?\.saveDiagnosticEntries\) \{\s*return settingsManager\.saveDiagnosticEntries\(entries\);/,
        'the timed write goes through the ring-only path');
    const method = src.slice(src.indexOf('saveDiagnosticEntries(entries) {'), src.indexOf('getFirstRunStatus() {'));
    assert.match(method, /controller\.mutate\('_errors', snapshot\)/, 'only the ring key is written');
    assert.match(method, /_rememberLocalWrite\(STORAGE_KEYS\.settings, settingsEchoForm\(expected\)\)/,
        'the write is remembered so its own echo does not replace the page settings');
    assert.doesNotMatch(method, /applyExternalSettingsUpdate|showToast|setPanelStatus/,
        'a failed ring write neither rolls the page back nor toasts');
});
