'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSettingsImportTransaction } = require('../extension/core/settings-import-transaction');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test('settings import transaction loads before every in-page settings consumer', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
    const consumers = manifest.content_scripts.filter((entry) => Array.isArray(entry.js) && entry.js.includes('ytkit.js'));
    assert.ok(consumers.length > 0);
    for (const entry of consumers) {
        const transactionIndex = entry.js.indexOf('core/settings-import-transaction.js');
        assert.ok(transactionIndex > -1);
        assert.ok(transactionIndex < entry.js.indexOf('ytkit.js'));
    }
});

test('settings import transaction commits and restores the exact snapshot through undo', () => {
    let state = { settings: { compactLayout: true }, hiddenVideos: ['aaaaaaaaaaa'] };
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });
    const summary = { settingsUpdated: 1, hiddenVideos: 1 };
    const result = transaction.run({
        snapshot: () => clone(state),
        summary,
        apply: () => {
            state = { settings: { compactLayout: false }, hiddenVideos: ['bbbbbbbbbbb'] };
        },
        restore: (snapshot) => { state = clone(snapshot); }
    });

    assert.deepEqual(result, {
        ok: true,
        phase: 'applied',
        rolledBack: false,
        summary,
        createdAt: 1720972800000,
        value: undefined
    });
    assert.equal(transaction.hasUndo(), true);
    assert.deepEqual(transaction.inspect(), { summary, createdAt: 1720972800000 });
    assert.deepEqual(state.hiddenVideos, ['bbbbbbbbbbb']);

    const undone = transaction.undo();
    assert.equal(undone.ok, true);
    assert.equal(undone.phase, 'undone');
    assert.deepEqual(state, { settings: { compactLayout: true }, hiddenVideos: ['aaaaaaaaaaa'] });
    assert.equal(transaction.hasUndo(), false);
    assert.equal(transaction.undo().ok, false);
});

test('settings import transaction rolls back partial writes and does not expose stale undo', () => {
    const original = { settings: { compactLayout: true }, allowedVideos: ['aaaaaaaaaaa'] };
    let state = clone(original);
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });
    const failure = new Error('quota exceeded');

    const result = transaction.run({
        snapshot: () => clone(state),
        apply: () => {
            state.settings.compactLayout = false;
            throw failure;
        },
        restore: (snapshot) => { state = clone(snapshot); }
    });

    assert.equal(result.ok, false);
    assert.equal(result.phase, 'apply');
    assert.equal(result.rolledBack, true);
    assert.equal(result.error, failure);
    assert.deepEqual(state, original);
    assert.equal(transaction.hasUndo(), false);
});

test('async apply commits only after the persistence promise resolves', async () => {
    let state = { settings: { compactLayout: true } };
    let persisted = false;
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });

    const pending = transaction.run({
        snapshot: () => clone(state),
        apply: () => {
            state.settings.compactLayout = false;
            return Promise.resolve().then(() => { persisted = true; });
        },
        restore: (snapshot) => { state = clone(snapshot); }
    });

    assert.equal(typeof pending.then, 'function');
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(result.phase, 'applied');
    assert.equal(persisted, true);
    assert.equal(transaction.hasUndo(), true);
});

test('async apply rejection rolls back instead of reporting phantom success', async () => {
    const original = { settings: { compactLayout: true } };
    let state = clone(original);
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });
    const failure = new Error('storage flush failed');

    const result = await transaction.run({
        snapshot: () => clone(state),
        apply: () => {
            state.settings.compactLayout = false;
            return Promise.reject(failure);
        },
        restore: (snapshot) => { state = clone(snapshot); }
    });

    assert.equal(result.ok, false);
    assert.equal(result.phase, 'apply');
    assert.equal(result.rolledBack, true);
    assert.equal(result.error, failure);
    assert.deepEqual(state, original);
    assert.equal(transaction.hasUndo(), false);
});

test('failed rollback keeps a retryable checkpoint until undo succeeds', () => {
    let restoreAttempts = 0;
    let state = { settings: { compactLayout: true } };
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });

    const result = transaction.run({
        snapshot: () => clone(state),
        apply: () => {
            state.settings.compactLayout = false;
            throw new Error('write failed');
        },
        restore: (snapshot) => {
            restoreAttempts += 1;
            if (restoreAttempts === 1) throw new Error('disk busy');
            state = clone(snapshot);
        }
    });

    assert.equal(result.phase, 'rollback');
    assert.equal(result.canUndo, true);
    assert.equal(transaction.hasUndo(), true);
    assert.equal(transaction.undo().ok, true);
    assert.deepEqual(state, { settings: { compactLayout: true } });
});

test('async restore rejection keeps the rollback retryable instead of claiming recovery', async () => {
    // restore() fires the same setSync writes as apply(), which resolve
    // { ok, error } without rejecting. Reporting rolledBack on the synchronous
    // return meant the exact storage failure that forced the rollback could
    // silently fail the rollback too.
    const original = { settings: { compactLayout: true } };
    let state = clone(original);
    let restoreAttempts = 0;
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });
    const failure = new Error('quota exceeded');

    const result = await transaction.run({
        snapshot: () => clone(state),
        apply: () => {
            state.settings.compactLayout = false;
            return Promise.reject(failure);
        },
        restore: (snapshot) => {
            restoreAttempts += 1;
            if (restoreAttempts === 1) return Promise.reject(new Error('quota still exceeded'));
            state = clone(snapshot);
            return Promise.resolve();
        }
    });

    assert.equal(result.ok, false);
    assert.equal(result.phase, 'rollback', 'a rejected restore is not a completed rollback');
    assert.equal(result.rolledBack, false);
    assert.equal(result.canUndo, true);
    assert.equal(transaction.hasUndo(), true, 'the recovery path must survive');

    const undone = await transaction.undo();
    assert.equal(undone.ok, true);
    assert.deepEqual(state, original);
    assert.equal(transaction.hasUndo(), false);
});

test('async restore commits the rollback only once the writes resolve', async () => {
    const original = { settings: { compactLayout: true } };
    let state = clone(original);
    let restored = false;
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });

    const result = await transaction.run({
        snapshot: () => clone(state),
        apply: () => {
            state.settings.compactLayout = false;
            return Promise.reject(new Error('write failed'));
        },
        restore: (snapshot) => Promise.resolve().then(() => {
            state = clone(snapshot);
            restored = true;
        })
    });

    assert.equal(result.rolledBack, true);
    assert.equal(restored, true, 'rolledBack must not be reported before the restore lands');
    assert.deepEqual(state, original);
    assert.equal(transaction.hasUndo(), false);
});

test('undo keeps its checkpoint when the restore writes reject', async () => {
    const original = { settings: { compactLayout: true } };
    let state = clone(original);
    let attempts = 0;
    const transaction = createSettingsImportTransaction({ now: () => 1720972800000 });

    await transaction.run({
        snapshot: () => clone(state),
        apply: () => { state.settings.compactLayout = false; return Promise.resolve(); },
        restore: (snapshot) => {
            attempts += 1;
            if (attempts === 1) return Promise.reject(new Error('storage offline'));
            state = clone(snapshot);
            return Promise.resolve();
        }
    });

    const firstUndo = await transaction.undo();
    assert.equal(firstUndo.ok, false);
    assert.equal(firstUndo.canRetry, true);
    assert.equal(transaction.hasUndo(), true, 'a failed undo must stay retryable');
    assert.deepEqual(state.settings, { compactLayout: false }, 'nothing was restored yet');

    const secondUndo = await transaction.undo();
    assert.equal(secondUndo.ok, true);
    assert.deepEqual(state, original);
});
