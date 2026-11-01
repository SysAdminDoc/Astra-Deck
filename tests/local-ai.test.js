'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'core', 'local-ai.js'), 'utf8');

function loadIsolated(globals = {}) {
    const sandbox = {
        setTimeout,
        clearTimeout,
        ...globals,
        module: { exports: {} }
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: 'local-ai.js' });
    return sandbox.module.exports;
}

test('local AI adapter recognizes current factories and reports active lanes', async () => {
    const summarizer = {
        availability: async () => 'available',
        create: async () => ({ summarize() {} })
    };
    const translator = {
        availability: async () => 'downloadable',
        create: async () => ({ translate() {} })
    };
    const localAi = loadIsolated({ Summarizer: summarizer, Translator: translator });
    assert.equal(localAi.has('summarizer'), true);
    assert.equal(localAi.has('translator'), true);
    assert.equal(localAi.getFactory('summarizer'), summarizer);
    assert.equal(localAi.normalizeAvailability('DOWNLOADABLE'), 'downloadable');
    assert.equal(localAi.normalizeAvailability('future-state'), 'unknown');

    const status = localAi.getLaneStatus();
    assert.equal(status.summary.activeLane, 'local');
    assert.equal(status.transcriptTranslation.activeLane, 'local');
    const resolved = await localAi.resolveLaneStatus();
    assert.equal(resolved.summary.availability, 'available');
    assert.equal(resolved.transcriptTranslation.availability, 'downloadable');
    assert.equal(resolved.transcriptTranslation.activeLane, 'local');
});

test('local AI adapter recognizes legacy window.ai factories and explicit fallbacks', async () => {
    const localAi = loadIsolated({ ai: {
        summarizer: { availability: async () => 'unavailable' },
        translator: {}
    } });
    assert.equal(localAi.has('summarizer'), true);
    assert.equal(localAi.has('translator'), true);
    const resolved = await localAi.resolveLaneStatus();
    assert.equal(resolved.summary.activeLane, 'byo-key');
    assert.equal(resolved.transcriptTranslation.activeLane, 'local');
    assert.equal(resolved.summary.availability, 'unavailable');
});

function fakeTimers() {
    const timers = { delays: [], cleared: 0, fire: null };
    timers.setTimeout = (fn, delay) => { timers.delays.push(delay); timers.fire = fn; return 7; };
    timers.clearTimeout = (id) => { if (id === 7) timers.cleared += 1; };
    return timers;
}

test('a browser that never answers the availability question reads as unavailable after a limit', async () => {
    const timers = fakeTimers();
    const localAi = loadIsolated({
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        Summarizer: { availability: () => new Promise(() => {}) }
    });
    const answer = localAi.availability('summarizer');
    await Promise.resolve();
    assert.deepEqual([...timers.delays], [5000]);
    timers.fire();
    assert.equal(await answer, 'unavailable');
});

test('the lanes move to their fallback when the question goes unanswered', async () => {
    const pending = () => new Promise(() => {});
    const started = [];
    const localAi = loadIsolated({
        setTimeout: (fn, delay) => { started.push(delay); fn(); return 1; },
        clearTimeout: () => {},
        Summarizer: { availability: pending },
        Translator: { availability: async () => 'available' },
        LanguageModel: { availability: pending }
    });
    const resolved = await localAi.resolveLaneStatus();
    assert.equal(resolved.summary.availability, 'unavailable');
    assert.equal(resolved.summary.activeLane, 'byo-key');
    assert.equal(resolved.transcriptQa.availability, 'unavailable');
    assert.equal(started.length, 3);
});

test('an answer in time wins and takes its timer with it', async () => {
    const timers = fakeTimers();
    const localAi = loadIsolated({
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        Summarizer: { availability: async () => 'available' }
    });
    assert.equal(await localAi.availability('summarizer'), 'available');
    assert.equal(timers.cleared, 1);
    assert.equal(timers.delays.length, 1);
});

test('a factory that throws still reads as unavailable and leaves no timer behind', async () => {
    const timers = fakeTimers();
    const localAi = loadIsolated({
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        Summarizer: { availability: async () => { throw new Error('no model'); } }
    });
    assert.equal(await localAi.availability('summarizer'), 'unavailable');
    assert.equal(timers.cleared, 1);
});
