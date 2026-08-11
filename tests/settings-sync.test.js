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
