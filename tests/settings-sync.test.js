'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const schemaModule = require('../extension/core/settings-schema');
const { createPolicyProfile } = require('../extension/core/policy-profile');
const fs = require('node:fs');
const path = require('node:path');
const repoRoot = path.join(__dirname, '..');
const sync = require('../extension/core/settings-sync');

const schema = schemaModule.SETTINGS_SCHEMA;
const policy = createPolicyProfile({ schema });
const settingsOptions = { schema, policy };

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function makeStorage(initial = {}, areaName = 'local') {
    const state = clone(initial);
    const listeners = new Set();

    function select(keys) {
        if (keys === null || keys === undefined) return clone(state);
        const requested = typeof keys === 'string'
            ? [keys]
            : Array.isArray(keys) ? keys : Object.keys(keys || {});
        const out = {};
        for (const key of requested) {
            if (Object.hasOwn(state, key)) out[key] = clone(state[key]);
            else if (keys && typeof keys === 'object' && !Array.isArray(keys)
                && Object.hasOwn(keys, key)) out[key] = clone(keys[key]);
        }
        return out;
    }

    function emit(changes) {
        if (Object.keys(changes).length === 0) return;
        for (const listener of listeners) listener(changes, areaName);
    }

    return {
        onChanged: {
            addListener(listener) { listeners.add(listener); },
            removeListener(listener) { listeners.delete(listener); }
        },
        async get(keys) {
            return select(keys);
        },
        async set(entries) {
            const changes = {};
            for (const [key, value] of Object.entries(entries || {})) {
                const oldValue = clone(state[key]);
                if (same(oldValue, value)) continue;
                state[key] = clone(value);
                changes[key] = { oldValue, newValue: clone(value) };
            }
            emit(changes);
        },
        async remove(keys) {
            const names = typeof keys === 'string' ? [keys] : (keys || []);
            const changes = {};
            for (const key of names) {
                if (!Object.hasOwn(state, key)) continue;
                const oldValue = clone(state[key]);
                delete state[key];
                changes[key] = { oldValue };
            }
            emit(changes);
        },
        setSilently(entries) {
            for (const [key, value] of Object.entries(entries || {})) state[key] = clone(value);
        },
        snapshot() {
            return clone(state);
        }
    };
}

function digest(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function readRemotePayload(storage) {
    const state = storage.snapshot();
    const meta = state[sync.SYNC_META_KEY];
    const text = Array.from({ length: meta.chunkCount }, (_, index) => state[`${sync.SYNC_CHUNK_PREFIX}${index}`]).join('');
    return { meta, payload: JSON.parse(text) };
}

function makeMeta(info, overrides = {}) {
    return {
        schemaVersion: sync.SYNC_SCHEMA_VERSION,
        updatedAt: 1000,
        sequence: 1,
        deviceId: 'test-device',
        chunkCount: info.chunks.length,
        payloadBytes: info.payloadBytes,
        checksum: digest(info.payloadText),
        ...overrides
    };
}

test('settings sync builds a schema-validated, secret-scrubbed diff within chunk limits', () => {
    const info = sync.buildSyncPayload({
        syncSettings: true,
        privacyDataFlowPanel: true,
        aiSummaryApiKey: 'never-upload-this',
        customCssCode: 'body { color: red; }'
    }, {
        'ytkit-hidden-videos': ['aaaaaaaaaaa', 'not-a-video-id'],
        'ytkit-blocked-channels': [{ id: 'UC123', name: 'Example' }, { id: 7 }]
    }, settingsOptions);

    assert.equal(info.payload.settings.values.syncSettings, undefined);
    assert.equal(info.payload.settings.values.privacyDataFlowPanel, true);
    assert.equal(JSON.stringify(info.payload).includes('never-upload-this'), false);
    assert.equal(JSON.stringify(info.payload).includes('customCssCode'), false);
    assert.deepEqual(info.payload.blocklists.hiddenVideos, ['aaaaaaaaaaa']);
    assert.deepEqual(info.payload.blocklists.blockedChannels, [{ id: 'UC123', name: 'Example' }]);
    assert.ok(info.payloadBytes <= sync.SYNC_MAX_PAYLOAD_BYTES);
    assert.ok(info.chunks.length > 0);
    for (const chunk of info.chunks) {
        assert.ok(Buffer.byteLength(chunk, 'utf8') <= sync.SYNC_CHUNK_BYTES);
    }

    assert.throws(() => sync.validateSyncPayload({
        ...info.payload,
        settings: {
            ...info.payload.settings,
            values: { privacyDataFlowPanel: 'yes' }
        }
    }, settingsOptions), /schema validation/);
    assert.throws(() => sync.validateSyncPayload({ ...info.payload, schemaVersion: 99 }, settingsOptions), /Unsupported/);
});

test('sync version comparison rejects foreign schema versions and orders newest writes deterministically', () => {
    const current = {
        schemaVersion: sync.SYNC_SCHEMA_VERSION,
        updatedAt: 20,
        sequence: 2,
        deviceId: 'b-device',
        chunkCount: 1,
        payloadBytes: 10,
        checksum: 'deadbeef'
    };
    assert.equal(sync.compareSyncVersions({ ...current, schemaVersion: 0 }, current), -1);
    assert.equal(sync.compareSyncVersions({ ...current, updatedAt: 19 }, current), -1);
    assert.equal(sync.compareSyncVersions({ ...current, deviceId: 'a-device' }, current), -1);
    assert.equal(sync.compareSyncVersions(current, current), 0);
});

test('settings sync uploads blocklist-only changes, applies newer remote state, and offers Undo', async () => {
    const baseSettings = {
        syncSettings: true,
        privacyDataFlowPanel: false,
        sponsorBlock: false,
        safeStoreProfile: true,
        githubFullProfile: false
    };
    const originalLists = {
        'ytkit-hidden-videos': ['aaaaaaaaaaa'],
        'ytkit-video-hider-allowed-videos': [],
        'ytkit-marked-watched-videos': [],
        'ytkit-blocked-channels': [],
        'ytkit-allowed-channels': []
    };
    const local = makeStorage({ ytSuiteSettings: baseSettings, ...originalLists });
    const account = makeStorage({}, 'sync');
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        ...settingsOptions,
        callApi: (target, method, ...args) => target[method](...args)
    });
    controller.installListeners();

    const started = await controller.initialize();
    assert.equal(started.ok, true);
    const initialRemote = readRemotePayload(account);
    assert.equal(initialRemote.meta.schemaVersion, sync.SYNC_SCHEMA_VERSION);

    // The storage event contains only the list key. The controller must read
    // current consent rather than treating the missing settings change as
    // opt-out.
    await local.set({
        'ytkit-hidden-videos': ['aaaaaaaaaaa', 'bbbbbbbbbbb']
    });
    const uploaded = await controller.syncNow();
    assert.equal(uploaded.ok, true);
    assert.deepEqual(readRemotePayload(account).payload.blocklists.hiddenVideos, [
        'aaaaaaaaaaa', 'bbbbbbbbbbb'
    ]);

    const remoteInfo = sync.buildSyncPayload({
        ...baseSettings,
        privacyDataFlowPanel: true
    }, {
        ...originalLists,
        'ytkit-hidden-videos': ['ccccccccccc']
    }, settingsOptions);
    const remoteMeta = makeMeta(remoteInfo, {
        updatedAt: readRemotePayload(account).meta.updatedAt + 1000,
        sequence: readRemotePayload(account).meta.sequence + 1,
        deviceId: 'remote-device'
    });
    const remoteEntries = {};
    remoteInfo.chunks.forEach((chunk, index) => {
        remoteEntries[`${sync.SYNC_CHUNK_PREFIX}${index}`] = chunk;
    });
    remoteEntries[sync.SYNC_META_KEY] = remoteMeta;
    account.setSilently(remoteEntries);

    const pulled = await controller.handleSyncChanges({
        [sync.SYNC_META_KEY]: { newValue: remoteMeta }
    });
    assert.equal(pulled.ok, true);
    assert.equal(pulled.changed, true);
    assert.equal(local.snapshot().ytSuiteSettings.privacyDataFlowPanel, true);
    assert.deepEqual(local.snapshot()['ytkit-hidden-videos'], ['ccccccccccc']);
    assert.equal((await controller.getStatus()).hasUndo, true);

    const undone = await controller.undo();
    assert.equal(undone.ok, true);
    assert.deepEqual(local.snapshot().ytSuiteSettings, baseSettings);
    assert.deepEqual(local.snapshot()['ytkit-hidden-videos'], ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    assert.equal((await controller.getStatus()).hasUndo, false);
});

function instrumentAccount(account) {
    const calls = [];
    const original = account.set.bind(account);
    const control = { failMetaWrite: false };
    account.set = async (entries) => {
        calls.push(Object.keys(entries || {}));
        if (control.failMetaWrite && Object.hasOwn(entries || {}, sync.SYNC_META_KEY)) {
            const error = new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
            error.code = 'SYNC_QUOTA';
            throw error;
        }
        return original(entries);
    };
    return { calls, control };
}

function syncFixture(hiddenVideos, extra = {}) {
    return makeStorage({
        ytSuiteSettings: { syncSettings: true, privacyDataFlowPanel: true },
        'ytkit-hidden-videos': hiddenVideos,
        'ytkit-video-hider-allowed-videos': [],
        'ytkit-marked-watched-videos': [],
        'ytkit-blocked-channels': [],
        'ytkit-allowed-channels': [],
        ...extra
    });
}

function videoIds(count, seed) {
    return Array.from({ length: count }, (_, index) => (seed + String(index).padStart(6, '0')).slice(0, 11));
}

// WHEN the metadata write of a push fails after its chunks have landed, the
// controller SHALL restore the chunk set the previous metadata describes, so a
// peer reading the account still assembles the payload it read before.
//
// Metadata-last only protects a peer from a torn chunk set mid-write. It does
// nothing when the second write is the one that fails: the account is then
// holding the new chunk bytes under the old metadata, and every peer's
// checksum check rejects that as a corrupt payload until some device manages a
// clean push.
test('a failed metadata write leaves peers reading the previous payload', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const { control } = instrumentAccount(account);
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 0,
        ...settingsOptions
    });

    assert.equal((await controller.initialize()).ok, true);
    const before = readRemotePayload(account);
    assert.deepEqual(before.payload.blocklists.hiddenVideos, ['aaaaaaaaaaa']);

    control.failMetaWrite = true;
    await local.set({ 'ytkit-hidden-videos': ['aaaaaaaaaaa', 'bbbbbbbbbbb'] });
    const failed = await controller.syncNow();
    assert.equal(failed.ok, false);

    const after = readRemotePayload(account);
    assert.deepEqual(after.meta, before.meta);
    assert.deepEqual(after.payload, before.payload);
    assert.equal(JSON.stringify(account.snapshot()).includes('bbbbbbbbbbb'), false);

    // And the account is not poisoned: the next push succeeds and carries the
    // change the failed one dropped.
    control.failMetaWrite = false;
    const recovered = await controller.syncNow();
    assert.equal(recovered.ok, true);
    assert.deepEqual(readRemotePayload(account).payload.blocklists.hiddenVideos, [
        'aaaaaaaaaaa', 'bbbbbbbbbbb'
    ]);
});

// WHEN the failed push would have grown the payload past the previous chunk
// count, the controller SHALL remove the chunk keys it added, because those
// indexes have no previous value to restore and would otherwise be read as
// part of a later, shorter payload.
test('a failed metadata write removes the chunk keys that push added', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const { control } = instrumentAccount(account);
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 0,
        ...settingsOptions
    });

    assert.equal((await controller.initialize()).ok, true);
    const before = readRemotePayload(account);
    const baseChunks = before.meta.chunkCount;

    // Enough ids to spill well past the chunk count the account holds now.
    const many = videoIds(Math.ceil((sync.SYNC_CHUNK_BYTES * (baseChunks + 2)) / 14), 'ccccc');
    control.failMetaWrite = true;
    await local.set({ 'ytkit-hidden-videos': many });
    assert.equal((await controller.syncNow()).ok, false);

    const state = account.snapshot();
    assert.ok(readRemotePayload(account).meta.chunkCount === baseChunks);
    assert.equal(Object.hasOwn(state, `${sync.SYNC_CHUNK_PREFIX}${baseChunks}`), false,
        'the chunk indexes the failed push added must not survive it');
    assert.deepEqual(readRemotePayload(account).payload, before.payload);
});

// WHEN local changes arrive in a burst, the controller SHALL collapse them
// into one push. chrome.storage.sync allows 120 write operations per minute
// and each push is two or more of them, so hiding videos one after another
// used to reach the limit at around 60 of them.
test('a burst of local changes produces one push, not one per change', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const { calls } = instrumentAccount(account);
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 25,
        ...settingsOptions
    });
    controller.installListeners();
    assert.equal((await controller.initialize()).ok, true);

    const baseline = calls.length;
    const hidden = ['aaaaaaaaaaa'];
    for (const id of videoIds(12, 'ddddd')) {
        hidden.push(id);
        await local.set({ 'ytkit-hidden-videos': hidden.slice() });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    const writes = calls.length - baseline;
    assert.ok(writes > 0, 'the burst must still be pushed');
    assert.ok(writes <= 3, `12 changes must not cost 12 pushes (saw ${writes} account writes)`);
    assert.deepEqual(readRemotePayload(account).payload.blocklists.hiddenVideos, hidden);
});

// WHEN an explicit push runs while the debounce is holding a burst, the
// controller SHALL not push again afterwards: syncNow re-reads local storage,
// so the pending changes ship with it.
test('an explicit syncNow supersedes the pending debounced push', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const { calls } = instrumentAccount(account);
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 300,
        ...settingsOptions
    });
    controller.installListeners();
    assert.equal((await controller.initialize()).ok, true);

    // The flush is synchronous at the top of syncNow, so the pending timer is
    // cancelled before it can fire. The wait below is longer than the debounce
    // on purpose: without the flush the timer lands inside it.
    await local.set({ 'ytkit-hidden-videos': ['aaaaaaaaaaa', 'eeeeeeeeeee'] });
    const baseline = calls.length;
    assert.equal((await controller.syncNow()).ok, true);
    const afterExplicit = calls.length;
    assert.deepEqual(readRemotePayload(account).payload.blocklists.hiddenVideos, [
        'aaaaaaaaaaa', 'eeeeeeeeeee'
    ]);

    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(calls.length, afterExplicit,
        'the superseded timer must not fire a second push');
    assert.ok(afterExplicit > baseline);
});

// ── the debounce, and what it must never swallow ──

// WHEN the user turns settings sync off, the account SHALL be wiped even if
// another local change lands inside the debounce window.
//
// The debounce keeps one slot and the newest run wins. A blocklist write
// arriving after the opt-out replaced the closure that carried the transition;
// the survivor read consent, found it already false, and returned "skipped".
// disableSync never ran, and settings the user had just asked to stop sharing
// stayed on their account.
test('opting out clears the account even when another change lands in the debounce window', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 200,
        ...settingsOptions
    });
    controller.installListeners();
    assert.equal((await controller.initialize()).ok, true);
    assert.ok(readRemotePayload(account).meta, 'the account must hold a payload to start');

    await local.set({ ytSuiteSettings: { syncSettings: false, privacyDataFlowPanel: true } });
    // A list edit arriving before the timer fires. This is the write that used
    // to replace the opt-out.
    await local.set({ 'ytkit-hidden-videos': ['aaaaaaaaaaa', 'bbbbbbbbbbb'] });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const state = account.snapshot();
    assert.equal(Object.hasOwn(state, sync.SYNC_META_KEY), false,
        'withdrawing consent must remove the payload, not be coalesced away');
    const chunkKeys = Object.keys(state).filter((key) => key.startsWith(sync.SYNC_CHUNK_PREFIX));
    assert.deepEqual(chunkKeys, [], 'no chunk may survive the opt-out');
});

// WHEN an explicit push supersedes a debounced one, the waiters it displaces
// SHALL receive that push's real result. Telling a caller "ok" for a push that
// never ran, and whose replacement then failed, is a lie it cannot detect.
test('a superseded waiter is told the truth about the push that replaced it', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const { control } = instrumentAccount(account);
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 400,
        ...settingsOptions
    });
    controller.installListeners();
    assert.equal((await controller.initialize()).ok, true);

    const waiter = controller.handleLocalChanges({
        'ytkit-hidden-videos': { oldValue: ['aaaaaaaaaaa'], newValue: ['aaaaaaaaaaa', 'bbbbbbbbbbb'] }
    });
    control.failMetaWrite = true;
    const explicit = await controller.syncNow();
    assert.equal(explicit.ok, false, 'the superseding push must actually fail here');

    const settled = await waiter;
    assert.equal(settled.ok, false,
        'the displaced waiter must carry the failure of the push that replaced it');
});

// ── the rollback ──

// WHEN this device has no record of the account's payload, a failed push SHALL
// NOT delete the chunk keys a peer wrote. previousMeta is read from LOCAL
// storage — what this device last recorded — so on a fresh device, or after an
// opt-out removed that key, it is null while the account still holds a peer's
// payload. Counting that as "zero previous chunks" made every index look like
// one this push had added, and the rollback deleted the peer's data.
test('a failed push does not delete a peer payload this device has no record of', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const { control } = instrumentAccount(account);

    // A peer's chunks, with no metadata this device could have recorded.
    account.setSilently({
        [`${sync.SYNC_CHUNK_PREFIX}0`]: 'PEER-CHUNK-0',
        [`${sync.SYNC_CHUNK_PREFIX}1`]: 'PEER-CHUNK-1',
        [`${sync.SYNC_CHUNK_PREFIX}2`]: 'PEER-CHUNK-2'
    });

    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 0,
        ...settingsOptions
    });
    control.failMetaWrite = true;
    const failed = await controller.syncNow();
    assert.equal(failed.ok, false);

    const state = account.snapshot();
    const survivors = [0, 1, 2].filter((index) =>
        Object.hasOwn(state, `${sync.SYNC_CHUNK_PREFIX}${index}`));
    assert.deepEqual(survivors, [0, 1, 2],
        'the rollback must not remove chunk keys whose owner it cannot identify');
});

// WHEN the rollback itself cannot run — which is the normal case, because the
// write quota that killed the metadata write kills the restore too — the error
// SHALL say the account may be inconsistent rather than reporting a clean undo.
test('a rollback that could not run says so', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const original = account.set.bind(account);
    let ceilingReached = false;
    account.set = async (entries) => {
        if (ceilingReached || Object.hasOwn(entries || {}, sync.SYNC_META_KEY)) {
            ceilingReached = true;
            const error = new Error('MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded');
            error.code = 'SYNC_QUOTA';
            throw error;
        }
        return original(entries);
    };

    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 0,
        ...settingsOptions
    });

    let thrown = null;
    try {
        await controller.handleSyncChanges({});
    } catch (_) { /* not the path under test */ }
    const result = await controller.syncNow();
    assert.equal(result.ok, false);
    // The controller wraps the error; the flag has to survive to the surface
    // that decides whether to re-push.
    thrown = result.error;
    assert.ok(thrown, 'the failure must be reported');
    assert.equal(result.error?.remoteMayBeInconsistent, true,
    'a rollback that could not run must not be reported as a clean undo');
});

// WHEN a locally-stored value fails the schema and the push repairs it, the
// user SHALL be told which setting is not being shared as they wrote it.
test('the push reports the settings it had to repair', async () => {
    const local = syncFixture(['aaaaaaaaaaa'], {
        ytSuiteSettings: {
            syncSettings: true,
            privacyDataFlowPanel: true,
            chatKeywordFilter: 'x'.repeat(20050)
        }
    });
    const account = makeStorage({}, 'sync');
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 0,
        ...settingsOptions
    });

    const result = await controller.syncNow();
    assert.equal(result.ok, true, 'an over-long value must not stop the push');
    assert.deepEqual(result.repairedSettings, ['chatKeywordFilter'],
        'the user has to be told the value they typed is not the one being shared');
    assert.equal((await controller.getStatus()).repairedSettings.includes('chatKeywordFilter'), true,
        'and the status surface has to carry it too');
});

// WHEN the service worker is about to be suspended, a pending debounced push
// SHALL be forced out. The timer lives in the worker and dies with it, so
// without this a change made in the last moments before teardown is written
// locally and never reaches the account.
test('a pending push can be forced out before the worker is torn down', async () => {
    const local = syncFixture(['aaaaaaaaaaa']);
    const account = makeStorage({}, 'sync');
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 60000,
        ...settingsOptions
    });
    controller.installListeners();
    assert.equal((await controller.initialize()).ok, true);

    assert.equal(controller.flushLocalChanges(), null,
        'with nothing pending it must not start a push, or the worker is kept alive for nothing');

    await local.set({ 'ytkit-hidden-videos': ['aaaaaaaaaaa', 'bbbbbbbbbbb'] });
    const flushed = controller.flushLocalChanges();
    assert.ok(flushed, 'a pending push must be forceable');
    assert.equal((await flushed).ok, true);
    assert.deepEqual(readRemotePayload(account).payload.blocklists.hiddenVideos,
        ['aaaaaaaaaaa', 'bbbbbbbbbbb']);
});

// WHEN the default debounce is chosen, it SHALL stay short enough that the MV3
// teardown window is small. This is a judgement pinned deliberately: a burst of
// hides lands in well under half a second, so anything past a second buys no
// extra coalescing and only widens the window where a change is lost.
test('the default debounce window stays under a second', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'extension', 'core', 'settings-sync.js'), 'utf8');
    const match = source.match(/:\s*(\d+);\s*\n\s*let pendingLocalPush/);
    assert.ok(match, 'the default debounce must still be a literal here');
    assert.ok(Number(match[1]) <= 1000,
        `the default debounce is ${match[1]} ms; every millisecond is a window the worker can die in`);
});

// WHEN the worker is told it is about to be suspended, the background script
// SHALL use that notice.
test('the service worker flushes settings sync on suspend', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'extension', 'background.js'), 'utf8');
    assert.match(source, /ext\.runtime\?\.onSuspend\?\.addListener/,
        'onSuspend is the only notice the worker gets before its timers die');
    assert.match(source, /_settingsSync\?\.flushLocalChanges\?\.\(\)/);
});

// WHEN this device's local record of the account disagrees with what the
// account actually holds, the rollback SHALL follow the ACCOUNT. previousMeta
// is SYNC_LAST_META_KEY from local storage, so on a fresh device or after an
// opt-out cleared it, it is null or stale while a peer's payload is live.
// Restoring from the stale record put back the wrong number of chunks and left
// the rest of this push's bytes sitting under the peer's metadata.
test('the rollback restores what the account holds, not what this device remembered', async () => {
    // A peer's payload, complete and valid, that this device has no record of.
    const peerInfo = sync.buildSyncPayload(
        { syncSettings: true, privacyDataFlowPanel: true },
        {
            'ytkit-hidden-videos': videoIds(400, 'peeee'),
            'ytkit-video-hider-allowed-videos': [],
            'ytkit-marked-watched-videos': [],
            'ytkit-blocked-channels': [],
            'ytkit-allowed-channels': []
        },
        settingsOptions
    );
    const peerMeta = makeMeta(peerInfo, { deviceId: 'peer-device' });
    const account = makeStorage({}, 'sync');
    const seeded = { [sync.SYNC_META_KEY]: peerMeta };
    peerInfo.chunks.forEach((chunk, index) => {
        seeded[`${sync.SYNC_CHUNK_PREFIX}${index}`] = chunk;
    });
    account.setSilently(seeded);

    // This device pushes something strictly larger, and has no local record of
    // the account at all.
    const local = syncFixture(videoIds(3000, 'mineee'));
    const { control } = instrumentAccount(account);
    const controller = sync.createSettingsSyncController({
        localStorage: local,
        syncStorage: account,
        localChangeDebounceMs: 0,
        ...settingsOptions
    });

    control.failMetaWrite = true;
    const failed = await controller.syncNow();
    assert.equal(failed.ok, false);

    const after = account.snapshot();
    assert.deepEqual(after[sync.SYNC_META_KEY], peerMeta, 'the metadata write failed, so it must be unchanged');
    const restored = Array.from({ length: peerMeta.chunkCount },
        (_, index) => after[`${sync.SYNC_CHUNK_PREFIX}${index}`]).join('');
    assert.equal(restored, peerInfo.payloadText,
        'a peer reading this account must still assemble the payload it read before');
    const strays = Object.keys(after)
        .filter((key) => key.startsWith(sync.SYNC_CHUNK_PREFIX))
        .filter((key) => Number(key.slice(sync.SYNC_CHUNK_PREFIX.length)) >= peerMeta.chunkCount);
    assert.deepEqual(strays, [], 'the chunk indexes this push added must not outlive it');
});
