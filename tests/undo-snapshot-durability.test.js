'use strict';

// Reset and Import are the two most destructive actions in the product, and
// their undo used to be staged in chrome.storage.session — which the browser
// wipes on exit. The bulk payload was always durable (extension IndexedDB via
// persistedDomains.writeExtensionSnapshot), so "dies with the session" only
// ever killed the *pointer* to it: reset, quit the browser, reopen, and the
// user had no path back while the payload sat orphaned in IndexedDB.
//
// These tests run the real pointer helpers sliced out of popup.js against a
// fake storage layer, wipe session storage between staging and undo the way a
// browser restart does, and assert the undo still resolves. The retention
// bound gets the same treatment from the other side: an expired pointer must
// take its IndexedDB payload with it rather than leaking one snapshot per
// forgotten undo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const popupSource = fs.readFileSync(
    path.join(__dirname, '..', 'extension', 'popup.js'),
    'utf8'
);

// Same source-slicing pattern as the popup migration harness: popup.js is not
// a module, so running its helpers without a DOM means evaluating the vetted
// declarations in isolation.
function extractUndoPointerHelpers() {
    const retentionStart = popupSource.indexOf('const UNDO_SNAPSHOT_RETENTION_MS');
    assert.ok(retentionStart > -1, 'popup.js must declare UNDO_SNAPSHOT_RETENTION_MS');
    const retentionBlock = popupSource.slice(
        retentionStart,
        popupSource.indexOf('\n', retentionStart) + 1
    );

    const keysStart = popupSource.indexOf("const IMPORT_SNAPSHOT_KEY = '_importSnapshot'");
    assert.ok(keysStart > -1, 'popup.js must declare IMPORT_SNAPSHOT_KEY');
    const keysBlock = popupSource.slice(keysStart, retentionStart);

    const fnStart = popupSource.indexOf('function undoSnapshotExpired(');
    const fnEnd = popupSource.indexOf('function setUndoImportVisible(');
    assert.ok(fnStart > -1 && fnEnd > fnStart,
        'popup.js must declare the undo pointer helpers before setUndoImportVisible');
    const fnBlock = popupSource.slice(fnStart, fnEnd);

    const availStart = popupSource.indexOf('function undoPointerStorageAvailable(');
    const availEnd = popupSource.indexOf('\n}\n', availStart) + 3;
    assert.ok(availStart > -1, 'popup.js must declare undoPointerStorageAvailable');
    const availBlock = popupSource.slice(availStart, availEnd);

    // eslint-disable-next-line no-new-func
    return new Function('ext', 'callExtensionApi', 'discardCoordinatedSnapshot',
        keysBlock + retentionBlock + availBlock + fnBlock
        + '; return { readImportSnapshot, writeImportSnapshot, clearImportSnapshot,'
        + ' readResetSnapshot, writeResetSnapshot, clearResetSnapshot,'
        + ' undoSnapshotExpired, IMPORT_SNAPSHOT_KEY, RESET_SNAPSHOT_KEY,'
        + ' UNDO_SNAPSHOT_RETENTION_MS };'
    );
}

const buildHelpers = extractUndoPointerHelpers();

// Minimal stand-in for the two storage areas plus the IndexedDB snapshot
// store the pointer refers to. `restartBrowser()` does what a browser does on
// exit: session storage is gone, local storage and IndexedDB are not.
function createEnvironment() {
    const local = new Map();
    const session = new Map();
    const indexedDbSnapshots = new Map();
    const area = (store) => ({
        get: (key) => (store.has(key) ? { [key]: store.get(key) } : {}),
        set: (items) => { for (const [k, v] of Object.entries(items)) store.set(k, v); },
        remove: (key) => { store.delete(key); }
    });
    const ext = { storage: { local: area(local), session: area(session) } };
    const callExtensionApi = async (target, method, arg) => target[method](arg);
    const discarded = [];
    const discardCoordinatedSnapshot = async (snapshot) => {
        if (!snapshot?.snapshotId) return;
        discarded.push(snapshot.snapshotId);
        indexedDbSnapshots.delete(snapshot.snapshotId);
    };
    return {
        local,
        session,
        indexedDbSnapshots,
        discarded,
        helpers: buildHelpers(ext, callExtensionApi, discardCoordinatedSnapshot),
        restartBrowser() { session.clear(); }
    };
}

function stageSnapshot(env, kind, { createdAt = Date.now() } = {}) {
    const snapshot = {
        schemaVersion: 2,
        kind,
        snapshotId: `${kind}-fixture`,
        pageSnapshotId: '',
        pageOrigin: '',
        createdAt
    };
    env.indexedDbSnapshots.set(snapshot.snapshotId, { 'ytSuiteSettings': { theme: 'dark' } });
    return snapshot;
}

test('a reset undo point still resolves after the browser restarts', async () => {
    const env = createEnvironment();
    const snapshot = stageSnapshot(env, 'reset');

    assert.equal(await env.helpers.writeResetSnapshot(snapshot), true,
        'staging the reset undo pointer must succeed');
    // Reset itself calls storageClear() right after staging, and re-stamps the
    // pointer. Model both so the test exercises the same ordering.
    env.local.clear();
    env.local.set(env.helpers.RESET_SNAPSHOT_KEY, snapshot);

    env.restartBrowser();

    const recovered = await env.helpers.readResetSnapshot();
    assert.ok(recovered, 'the reset undo point must survive a browser restart');
    assert.equal(recovered.snapshotId, snapshot.snapshotId);
    assert.ok(env.indexedDbSnapshots.has(recovered.snapshotId),
        'the payload the pointer names must still be there to restore from');
    assert.deepEqual(env.discarded, [],
        'a live pointer must not have its payload collected');
});

test('an import undo point still resolves after the browser restarts', async () => {
    const env = createEnvironment();
    const snapshot = stageSnapshot(env, 'import');

    assert.equal(await env.helpers.writeImportSnapshot(snapshot), true,
        'staging the import undo pointer must succeed');
    env.restartBrowser();

    const recovered = await env.helpers.readImportSnapshot();
    assert.ok(recovered, 'the import undo point must survive a browser restart');
    assert.equal(recovered.snapshotId, snapshot.snapshotId);

    await env.helpers.clearImportSnapshot();
    assert.equal(await env.helpers.readImportSnapshot(), null,
        'a consumed undo point must not be offered again');
});

test('an undo point past the retention bound is dropped with its payload', async () => {
    const env = createEnvironment();
    const retention = env.helpers.UNDO_SNAPSHOT_RETENTION_MS;
    const snapshot = stageSnapshot(env, 'reset', { createdAt: Date.now() - retention - 1000 });
    await env.helpers.writeResetSnapshot(snapshot);

    assert.equal(await env.helpers.readResetSnapshot(), null,
        'an expired undo point must not be offered');
    assert.equal(env.local.has(env.helpers.RESET_SNAPSHOT_KEY), false,
        'the expired pointer must be removed, not left to be re-read every open');
    assert.deepEqual(env.discarded, [snapshot.snapshotId],
        'expiry must collect the IndexedDB payload rather than orphan it');
    assert.equal(env.indexedDbSnapshots.size, 0);
});

test('an undo point just inside the retention bound is still offered', async () => {
    const env = createEnvironment();
    const retention = env.helpers.UNDO_SNAPSHOT_RETENTION_MS;
    const snapshot = stageSnapshot(env, 'import', { createdAt: Date.now() - retention + 60_000 });
    await env.helpers.writeImportSnapshot(snapshot);

    const recovered = await env.helpers.readImportSnapshot();
    assert.ok(recovered, 'a snapshot inside the window must survive');
    assert.equal(recovered.snapshotId, snapshot.snapshotId);
});

test('the retention bound is seven days and rejects an undated pointer', () => {
    const env = createEnvironment();
    assert.equal(env.helpers.UNDO_SNAPSHOT_RETENTION_MS, 7 * 24 * 60 * 60 * 1000,
        'the documented retention window is 7 days');
    // An undated pointer has no way to expire, so it must not be trusted at
    // all — otherwise a malformed write becomes an immortal undo point.
    assert.equal(env.helpers.undoSnapshotExpired({}), true);
    assert.equal(env.helpers.undoSnapshotExpired({ createdAt: 0 }), true);
    assert.equal(env.helpers.undoSnapshotExpired({ createdAt: 'yesterday' }), true);
    // A clock that jumped backwards must not delete a good snapshot.
    assert.equal(env.helpers.undoSnapshotExpired({ createdAt: Date.now() + 86_400_000 }), false);
});

test('staging a second undo point of the same kind collects the first payload', async () => {
    const env = createEnvironment();
    const first = stageSnapshot(env, 'reset');
    await env.helpers.writeResetSnapshot(first);

    const second = { ...stageSnapshot(env, 'reset'), snapshotId: 'reset-fixture-2' };
    env.indexedDbSnapshots.set(second.snapshotId, { 'ytSuiteSettings': {} });
    await env.helpers.writeResetSnapshot(second);

    assert.deepEqual(env.discarded, [first.snapshotId],
        'the superseded payload must be collected so IndexedDB does not grow per reset');
    const recovered = await env.helpers.readResetSnapshot();
    assert.equal(recovered.snapshotId, second.snapshotId);
});
