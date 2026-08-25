'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const schemaModule = require('../extension/core/settings-schema');
const { createPolicyProfile } = require('../extension/core/policy-profile');
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
