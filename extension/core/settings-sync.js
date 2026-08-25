(() => {
    'use strict';

    // Browser-account settings sync is deliberately owned by the background
    // worker. Content scripts and popup surfaces only talk to this controller
    // through runtime messages; they never receive the storage.sync payload.
    //
    // The wire format is a schema-versioned, diff-from-default snapshot. A
    // full settings bag is too large for Chrome's 8 KiB per-item limit, and
    // blocklists can be arbitrarily large, so the payload is split into small
    // UTF-8 chunks under a single metadata record. Metadata is written last so
    // a reader never treats a half-written chunk set as current.

    const root = globalThis;
    const core = root.YTKitCore || (root.YTKitCore = {});
    if (core.createSettingsSyncController) return;

    const schemaScope = root.__YTKIT_SETTINGS_SCHEMA__
        || (typeof module !== 'undefined' && module.exports && (() => {
            try { return require('./settings-schema'); } catch (_) { return null; }
        })());
    const persistedDomains = core.persistedDomains
        || (typeof module !== 'undefined' && module.exports && (() => {
            try { return require('./persisted-domains'); } catch (_) { return null; }
        })());

    const SETTINGS_STORAGE_KEY = 'ytSuiteSettings';
    const SYNC_SETTING_KEY = 'syncSettings';
    const SYNC_SCHEMA_VERSION = 1;
    const SYNC_META_KEY = 'ytkit-settings-sync-meta';
    const SYNC_CHUNK_PREFIX = 'ytkit-settings-sync-chunk-';
    const SYNC_UNDO_KEY = 'ytkit-settings-sync-undo';
    const SYNC_LAST_META_KEY = 'ytkit-settings-sync-last-meta';
    const SYNC_DEVICE_ID_KEY = 'ytkit-settings-sync-device-id';
    const SYNC_CLOCK_KEY = 'ytkit-settings-sync-clock';

    // Leave headroom below the browser's documented 100 KiB total quota. The
    // spare room covers the metadata record, JSON string quoting, browser
    // accounting differences, and future additions to the envelope.
    const SYNC_MAX_PAYLOAD_BYTES = 90 * 1024;
    const SYNC_CHUNK_BYTES = 6000;
    const SYNC_MAX_CHUNKS = 32;
    const SYNC_MAX_UNDO_BYTES = 512 * 1024;
    const SYNC_QUOTA = Object.freeze({
        totalBytes: 102400,
        bytesPerItem: 8192,
        maxItems: 512
    });

    const BLOCKLIST_DOMAINS = Object.freeze([
        Object.freeze({ id: 'hiddenVideos', key: 'ytkit-hidden-videos', cap: 2500 }),
        Object.freeze({ id: 'allowedVideos', key: 'ytkit-video-hider-allowed-videos', cap: 1500 }),
        Object.freeze({ id: 'markedWatchedVideos', key: 'ytkit-marked-watched-videos', cap: 1500 }),
        Object.freeze({ id: 'blockedChannels', key: 'ytkit-blocked-channels', cap: 800 }),
        Object.freeze({ id: 'allowedChannels', key: 'ytkit-allowed-channels', cap: 400 })
    ]);
    const BLOCKLIST_KEYS = Object.freeze(BLOCKLIST_DOMAINS.map((domain) => domain.key));

    // These settings are either local consent, executable/personal content,
    // or endpoint material that should not move with ordinary preferences.
    // Credential-shaped values are additionally scrubbed by policy-profile.
    const NON_SYNC_SETTING_KEYS = Object.freeze([
        SYNC_SETTING_KEY,
        'advancedLocalPredicateCode',
        'customCssCode',
        'quickLinkItems',
        'aiSummaryEndpoint',
        'downloadCobaltInstance',
        'alternativeFrontendInstance'
    ]);
    const NON_SYNC_SETTING_SET = new Set(NON_SYNC_SETTING_KEYS);

    function isPlainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    function clone(value) {
        if (value === undefined || value === null || typeof value !== 'object') return value;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (_) { /* reason: use JSON fallback */ }
        }
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return undefined; }
    }

    function sameValue(left, right) {
        if (Object.is(left, right)) return true;
        try { return JSON.stringify(left) === JSON.stringify(right); } catch (_) { return false; }
    }

    function copyPlainObject(value) {
        if (!isPlainObject(value)) return {};
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
            const copied = clone(item);
            if (copied !== undefined) out[key] = copied;
        }
        return out;
    }

    function utf8Bytes(value) {
        const text = String(value);
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
        try { return unescape(encodeURIComponent(text)).length; } catch (_) { return text.length * 2; }
    }

    function jsonBytes(value) {
        try { return utf8Bytes(JSON.stringify(value)); } catch (_) { return Infinity; }
    }

    function checksum(text) {
        // FNV-1a over UTF-16 code units is deterministic in every supported
        // runtime and avoids making Web Crypto an async dependency for this
        // small integrity check.
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function splitUtf8(text, maxBytes = SYNC_CHUNK_BYTES) {
        const chunks = [];
        let current = '';
        let currentBytes = 0;
        for (const character of String(text)) {
            const characterBytes = utf8Bytes(character);
            if (current && currentBytes + characterBytes > maxBytes) {
                chunks.push(current);
                current = '';
                currentBytes = 0;
            }
            current += character;
            currentBytes += characterBytes;
        }
        if (current || chunks.length === 0) chunks.push(current);
        return chunks;
    }

    function normalizeMeta(value) {
        if (!isPlainObject(value)) return null;
        if (value.schemaVersion !== SYNC_SCHEMA_VERSION) return null;
        const updatedAt = Number(value.updatedAt);
        const sequence = Number(value.sequence);
        const chunkCount = Number(value.chunkCount);
        const payloadBytes = Number(value.payloadBytes);
        const deviceId = typeof value.deviceId === 'string' ? value.deviceId.slice(0, 96) : '';
        const digest = typeof value.checksum === 'string' ? value.checksum.slice(0, 32) : '';
        if (!deviceId || !digest
            || !Number.isSafeInteger(updatedAt) || updatedAt < 1
            || !Number.isSafeInteger(sequence) || sequence < 1
            || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > SYNC_MAX_CHUNKS
            || !Number.isSafeInteger(payloadBytes) || payloadBytes < 1 || payloadBytes > SYNC_MAX_PAYLOAD_BYTES) {
            return null;
        }
        return {
            schemaVersion: SYNC_SCHEMA_VERSION,
            updatedAt,
            sequence,
            deviceId,
            chunkCount,
            payloadBytes,
            checksum: digest
        };
    }

    function compareSyncVersions(left, right) {
        const a = normalizeMeta(left);
        const b = normalizeMeta(right);
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 1 : -1;
        if (a.sequence !== b.sequence) return a.sequence > b.sequence ? 1 : -1;
        return a.deviceId === b.deviceId ? 0 : (a.deviceId > b.deviceId ? 1 : -1);
    }

    function createDeviceId() {
        try {
            if (root.crypto?.randomUUID) return root.crypto.randomUUID();
        } catch (_) {
            // reason: restricted test/runtime crypto object; use the fallback
        }
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    function getSchema(options = {}) {
        return Array.isArray(options.schema)
            ? options.schema
            : (schemaScope?.SETTINGS_SCHEMA || []);
    }

    function getDefaults(schema, options = {}) {
        if (isPlainObject(options.defaults)) return copyPlainObject(options.defaults);
        return Object.fromEntries(schema.map((entry) => [entry.key, clone(entry.defaultValue)]));
    }

    function getPolicy(options, schema) {
        if (options.policy && typeof options.policy.buildExportSnapshot === 'function') return options.policy;
        const factory = core.createPolicyProfile
            || (typeof module !== 'undefined' && module.exports && (() => {
                try { return require('./policy-profile').createPolicyProfile; } catch (_) { return null; }
            })());
        if (typeof factory === 'function') return factory({ schema });
        return null;
    }

    function sanitizeDomain(id, value, options = {}) {
        if (typeof options.sanitizeDomain === 'function') return options.sanitizeDomain(id, value);
        if (typeof persistedDomains?.sanitizeDomainValue === 'function') {
            return persistedDomains.sanitizeDomainValue(id, value);
        }
        if (id === 'blockedChannels' || id === 'allowedChannels') {
            return Array.isArray(value)
                ? value.filter((row) => isPlainObject(row) && typeof row.id === 'string')
                    .map((row) => ({ id: row.id.slice(0, 128), name: String(row.name || row.id).slice(0, 200) }))
                : [];
        }
        return Array.isArray(value)
            ? [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
            : [];
    }

    function buildSettingsDelta(settings, options = {}) {
        const schema = getSchema(options);
        const defaults = getDefaults(schema, options);
        const policy = getPolicy(options, schema);
        if (!policy || typeof policy.buildExportSnapshot !== 'function'
            || typeof policy.validateSettingsSnapshot !== 'function') {
            throw new Error('Settings sync policy is unavailable');
        }
        const source = isPlainObject(settings) ? settings : {};
        const snapshot = policy.buildExportSnapshot(source, {
            schemaOnly: true,
            excludeInternal: true,
            excludeKeys: NON_SYNC_SETTING_SET
        });
        const validation = policy.validateSettingsSnapshot(snapshot.settings);
        if (!validation.ok) throw new Error(`Settings sync validation failed: ${validation.errors.slice(0, 3).join('; ')}`);

        const values = {};
        const resetSettings = [];
        const skippedSettings = [];
        for (const entry of schema) {
            const key = entry?.key;
            if (typeof key !== 'string' || entry.internal || NON_SYNC_SETTING_SET.has(key)) continue;
            if (typeof policy.shouldScrubKey === 'function' && policy.shouldScrubKey(key)) continue;
            const value = Object.prototype.hasOwnProperty.call(validation.settings, key)
                ? validation.settings[key]
                : clone(entry.defaultValue);
            if (jsonBytes(value) > 24 * 1024) {
                // A single oversized preference cannot fit inside the bounded
                // account snapshot. Keep it local and make the omission
                // visible to the status surface instead of throwing away the
                // rest of the user's settings.
                skippedSettings.push(key);
                continue;
            }
            if (sameValue(value, defaults[key])) resetSettings.push(key);
            else values[key] = clone(value);
        }
        return {
            values,
            resetSettings,
            skippedSettings,
            scrubbedKeys: Array.isArray(snapshot.scrubbedKeys) ? [...snapshot.scrubbedKeys] : [],
            defaultedKeys: Array.isArray(snapshot.defaultedKeys) ? [...snapshot.defaultedKeys] : []
        };
    }

    function buildBlocklists(items, options = {}) {
        const blocklists = {};
        const truncatedDomains = [];
        for (const domain of BLOCKLIST_DOMAINS) {
            const raw = items?.[domain.key];
            const sanitized = sanitizeDomain(domain.id, raw, options);
            // Keep the NEWEST entries. These lists are appended to, and
            // applyRemotePayload replaces the peer's list wholesale, so cutting
            // from the front uploaded the oldest 2500 hides and made everything
            // the user had hidden since then reappear on every device.
            const capped = Array.isArray(sanitized) ? sanitized.slice(-domain.cap) : [];
            if (Array.isArray(sanitized) && sanitized.length > capped.length) truncatedDomains.push(domain.id);
            blocklists[domain.id] = capped;
        }
        return { blocklists, truncatedDomains };
    }

    function buildSyncPayload(settings, items = {}, options = {}) {
        const settingsDelta = buildSettingsDelta(settings, options);
        const lists = buildBlocklists(items, options);
        const payload = {
            schemaVersion: SYNC_SCHEMA_VERSION,
            settings: {
                values: settingsDelta.values,
                resetSettings: settingsDelta.resetSettings
            },
            blocklists: lists.blocklists,
            truncatedDomains: [...lists.truncatedDomains],
            skippedSettings: [...settingsDelta.skippedSettings]
        };

        const trimCandidates = BLOCKLIST_DOMAINS
            .map((domain) => domain.id)
            .filter((id) => Array.isArray(payload.blocklists[id]) && payload.blocklists[id].length > 0);
        while (jsonBytes(payload) > SYNC_MAX_PAYLOAD_BYTES && trimCandidates.length > 0) {
            trimCandidates.sort((left, right) => jsonBytes(payload.blocklists[right]) - jsonBytes(payload.blocklists[left]));
            const id = trimCandidates[0];
            const list = payload.blocklists[id];
            const nextLength = Math.max(0, list.length - Math.max(1, Math.ceil(list.length * 0.1)));
            // Keep the tail, like every other cap in this module. Trimming the
            // end here dropped the most recently hidden entries, and this is
            // the path a heavy user actually hits: the caps alone serialize
            // past SYNC_MAX_PAYLOAD_BYTES before the settings delta is added,
            // so the loop runs on every sync.
            // `slice(-0)` returns the WHOLE array, so zero needs its own case.
            payload.blocklists[id] = nextLength === 0 ? [] : list.slice(-nextLength);
            if (!payload.truncatedDomains.includes(id)) payload.truncatedDomains.push(id);
            if (nextLength === 0) trimCandidates.shift();
        }

        const payloadText = JSON.stringify(payload);
        const payloadBytes = utf8Bytes(payloadText);
        if (payloadBytes > SYNC_MAX_PAYLOAD_BYTES) {
            throw new Error('Settings and blocklists exceed the browser sync quota');
        }
        const chunks = splitUtf8(payloadText);
        if (chunks.length > SYNC_MAX_CHUNKS) throw new Error('Settings sync produced too many chunks');
        return {
            payload,
            payloadText,
            payloadBytes,
            chunks,
            scrubbedKeys: settingsDelta.scrubbedKeys,
            defaultedKeys: settingsDelta.defaultedKeys,
            truncatedDomains: payload.truncatedDomains,
            skippedSettings: payload.skippedSettings
        };
    }

    function validateSyncPayload(rawPayload, options = {}) {
        if (!isPlainObject(rawPayload) || rawPayload.schemaVersion !== SYNC_SCHEMA_VERSION) {
            throw new Error('Unsupported settings sync payload');
        }
        const schema = getSchema(options);
        const defaults = getDefaults(schema, options);
        const policy = getPolicy(options, schema);
        const rawSettings = isPlainObject(rawPayload.settings) ? rawPayload.settings : null;
        if (!rawSettings || !isPlainObject(rawSettings.values) || !Array.isArray(rawSettings.resetSettings)) {
            throw new Error('Settings sync settings delta is malformed');
        }
        const snapshot = policy?.buildExportSnapshot?.(rawSettings.values, {
            schemaOnly: true,
            excludeInternal: true,
            excludeKeys: NON_SYNC_SETTING_SET
        })?.settings || {};
        const validation = policy?.validateSettingsSnapshot?.(snapshot);
        if (!validation?.ok) throw new Error(`Settings sync payload failed schema validation: ${validation?.errors?.slice(0, 3).join('; ') || 'invalid settings'}`);

        const known = new Set(schema.map((entry) => entry.key));
        const resetSeen = new Set();
        const resetSettings = [];
        for (const key of rawSettings.resetSettings) {
            if (typeof key !== 'string' || !known.has(key) || resetSeen.has(key)) continue;
            const entry = schema.find((candidate) => candidate.key === key);
            if (!entry || entry.internal || NON_SYNC_SETTING_SET.has(key)
                || policy?.shouldScrubKey?.(key)) continue;
            resetSeen.add(key);
            resetSettings.push(key);
        }

        const rawBlocklists = isPlainObject(rawPayload.blocklists) ? rawPayload.blocklists : null;
        if (!rawBlocklists) throw new Error('Settings sync blocklists are malformed');
        const blocklists = {};
        for (const domain of BLOCKLIST_DOMAINS) {
            blocklists[domain.id] = sanitizeDomain(domain.id, rawBlocklists[domain.id], options)
                .slice(-domain.cap);
        }
        const truncatedDomains = Array.isArray(rawPayload.truncatedDomains)
            ? [...new Set(rawPayload.truncatedDomains.filter((id) => BLOCKLIST_DOMAINS.some((domain) => domain.id === id)))]
            : [];
        const skippedSettings = Array.isArray(rawPayload.skippedSettings)
            ? [...new Set(rawPayload.skippedSettings.filter((key) => typeof key === 'string').slice(0, 100))]
            : [];
        // Touch defaults here so callers can use the same validation helper
        // with a minimal test schema without accidentally accepting a missing
        // default map.
        void defaults;
        return {
            schemaVersion: SYNC_SCHEMA_VERSION,
            settings: {
                values: copyPlainObject(validation.settings),
                resetSettings
            },
            blocklists,
            truncatedDomains,
            skippedSettings
        };
    }

    function normalizeUndoState(state, options = {}) {
        if (!isPlainObject(state) || !isPlainObject(state.settings) || !isPlainObject(state.blocklists)) return null;
        const settings = copyPlainObject(state.settings);
        const blocklists = {};
        for (const domain of BLOCKLIST_DOMAINS) {
            blocklists[domain.id] = sanitizeDomain(domain.id, state.blocklists[domain.id], options)
                .slice(-domain.cap);
        }
        return { settings, blocklists };
    }

    function isSyncRelevantKey(key, settingsKey = SETTINGS_STORAGE_KEY) {
        return key === settingsKey || BLOCKLIST_KEYS.includes(key);
    }

    function createSettingsSyncController(options = {}) {
        const local = options.localStorage || options.local || null;
        const sync = options.syncStorage || options.sync || null;
        const settingsKey = options.settingsKey || SETTINGS_STORAGE_KEY;
        const invoke = typeof options.callApi === 'function'
            ? options.callApi
            : async (target, method, ...args) => target[method](...args);
        const schema = getSchema(options);
        const policy = getPolicy(options, schema);
        const settingsOptions = { ...options, schema, policy };
        let chain = Promise.resolve();
        let listenersInstalled = false;
        let lastMeta = null;
        let lastError = null;
        let lastResult = null;
        const suppressedLocalChanges = new Map();

        function enqueue(task) {
            const next = chain.catch(() => undefined).then(task);
            chain = next.catch(() => undefined);
            return next;
        }

        async function readLocal(keys) {
            if (!local?.get) throw new Error('Extension local storage is unavailable');
            return (await invoke(local, 'get', keys)) || {};
        }

        async function setLocal(entries) {
            if (!local?.set) throw new Error('Extension local storage is unavailable');
            return invoke(local, 'set', entries);
        }

        async function removeLocal(keys) {
            if (!local?.remove) return;
            return invoke(local, 'remove', keys);
        }

        async function readSync(keys) {
            if (!sync?.get) throw new Error('Browser account sync is unavailable');
            return (await invoke(sync, 'get', keys)) || {};
        }

        async function setSync(entries) {
            if (!sync?.set) throw new Error('Browser account sync is unavailable');
            return invoke(sync, 'set', entries);
        }

        async function removeSync(keys) {
            if (!sync?.remove) return;
            return invoke(sync, 'remove', keys);
        }

        function serialized(value) {
            try { return JSON.stringify(value); } catch (_) { return String(value); }
        }

        // A suppression mark is consumed by the matching storage.onChanged. But
        // `storage.local.set` omits keys whose value did not actually change, so
        // a mark written for an already-equal key never fires and never gets
        // consumed. With no reaper it lived for the life of the worker, holding
        // a full serialized blocklist, and the next genuine change that happened
        // to produce that same serialized value was filtered out and silently
        // never uploaded.
        //
        // Marks carry identity rather than a count, which is the shape
        // storage-manager.js uses for the same problem. A plain counter cannot
        // tell one mark from another, so a reaper armed for an earlier mark
        // would release a later one that reused the same serialized value.
        const SUPPRESSION_TTL_MS = 15000;

        function suppressionMarks(key, create = false) {
            let values = suppressedLocalChanges.get(key);
            if (!values && create) {
                values = new Map();
                suppressedLocalChanges.set(key, values);
            }
            return values || null;
        }

        function dropSuppressionMark(key, token, mark) {
            const values = suppressedLocalChanges.get(key);
            const marks = values?.get(token);
            if (!marks?.delete(mark)) return false;
            if (marks.size === 0) values.delete(token);
            if (values.size === 0) suppressedLocalChanges.delete(key);
            return true;
        }

        function takeSuppressionMark(key, token) {
            const values = suppressedLocalChanges.get(key);
            const marks = values?.get(token);
            if (!marks?.size) return false;
            const mark = marks.values().next().value;
            return dropSuppressionMark(key, token, mark);
        }

        function markSuppressed(entries) {
            for (const [key, value] of Object.entries(entries)) {
                const values = suppressionMarks(key, true);
                const token = serialized(value);
                let marks = values.get(token);
                if (!marks) {
                    marks = new Set();
                    values.set(token, marks);
                }
                const mark = {};
                marks.add(mark);
                setTimeout(() => dropSuppressionMark(key, token, mark), SUPPRESSION_TTL_MS);
            }
        }

        function clearSuppressed(entries) {
            for (const [key, value] of Object.entries(entries)) {
                takeSuppressionMark(key, serialized(value));
            }
        }

        function consumeSuppressed(key, value) {
            return takeSuppressionMark(key, serialized(value));
        }

        function localStateFromItems(items) {
            // Every cap in this module keeps the TAIL. This one feeds the Undo
            // snapshot, so head-truncating here meant undoing a sync restored
            // the oldest entries and permanently lost everything hidden since.
            const blocklists = {};
            for (const domain of BLOCKLIST_DOMAINS) {
                blocklists[domain.id] = sanitizeDomain(domain.id, items?.[domain.key], settingsOptions)
                    .slice(-domain.cap);
            }
            return {
                settings: copyPlainObject(items?.[settingsKey]),
                blocklists
            };
        }

        async function loadDeviceClock(items = null) {
            const stored = items || await readLocal([SYNC_DEVICE_ID_KEY, SYNC_CLOCK_KEY, SYNC_LAST_META_KEY]);
            const deviceId = typeof stored[SYNC_DEVICE_ID_KEY] === 'string' && stored[SYNC_DEVICE_ID_KEY]
                ? stored[SYNC_DEVICE_ID_KEY].slice(0, 96)
                : createDeviceId();
            const previousClock = Number(stored[SYNC_CLOCK_KEY]);
            const previousMeta = normalizeMeta(stored[SYNC_LAST_META_KEY]) || lastMeta;
            const sequence = Math.max(
                1,
                Number.isSafeInteger(previousClock) && previousClock > 0 ? previousClock + 1 : 1,
                (Number(previousMeta?.sequence) || 0) + 1,
                (Number(lastMeta?.sequence) || 0) + 1
            );
            const updatedAt = Math.max(
                Date.now(),
                Number(previousMeta?.updatedAt) || 0,
                Number(lastMeta?.updatedAt) || 0
            );
            await setLocal({
                [SYNC_DEVICE_ID_KEY]: deviceId,
                [SYNC_CLOCK_KEY]: sequence
            });
            return { deviceId, sequence, updatedAt, previousMeta };
        }

        async function readRemoteMeta() {
            const stored = await readSync(SYNC_META_KEY);
            return normalizeMeta(stored[SYNC_META_KEY]);
        }

        async function readRemotePayload(meta) {
            const normalized = normalizeMeta(meta);
            if (!normalized) throw new Error('Browser sync metadata is invalid');
            const keys = Array.from({ length: normalized.chunkCount }, (_, index) => `${SYNC_CHUNK_PREFIX}${index}`);
            const stored = await readSync(keys);
            const text = keys.map((key) => stored[key]).join('');
            if (!text || utf8Bytes(text) !== normalized.payloadBytes || checksum(text) !== normalized.checksum) {
                throw new Error('Browser sync payload is incomplete or corrupt');
            }
            let raw;
            try { raw = JSON.parse(text); } catch (_) { throw new Error('Browser sync payload is not valid JSON'); }
            return validateSyncPayload(raw, settingsOptions);
        }

        async function writeRemotePayload(meta, payloadInfo, previousMeta = null) {
            const entries = {};
            payloadInfo.chunks.forEach((chunk, index) => {
                entries[`${SYNC_CHUNK_PREFIX}${index}`] = chunk;
            });
            // Chunks first, metadata last. See the module header.
            await setSync(entries);
            await setSync({
                [SYNC_META_KEY]: {
                    ...meta,
                    schemaVersion: SYNC_SCHEMA_VERSION
                }
            });
            const staleKeys = [];
            const oldCount = Number(previousMeta?.chunkCount) || 0;
            for (let index = payloadInfo.chunks.length; index < oldCount; index += 1) {
                staleKeys.push(`${SYNC_CHUNK_PREFIX}${index}`);
            }
            if (staleKeys.length) await removeSync(staleKeys);
        }

        async function clearRemotePayload() {
            if (!sync?.get) return;
            const stored = await readSync(null);
            const keys = Object.keys(stored).filter((key) => key === SYNC_META_KEY || key.startsWith(SYNC_CHUNK_PREFIX));
            if (keys.length) await removeSync(keys);
        }

        async function buildCurrentPayload(items) {
            return buildSyncPayload(
                items?.[settingsKey],
                items,
                settingsOptions
            );
        }

        async function applyRemotePayload(payload, meta, source = 'remote') {
            const items = await readLocal([settingsKey, ...BLOCKLIST_KEYS]);
            const currentState = localStateFromItems(items);
            const currentPayload = await buildCurrentPayload(items);
            if (sameValue(currentPayload.payload, payload)) {
                lastMeta = meta;
                await setLocal({ [SYNC_LAST_META_KEY]: meta });
                return { changed: false, source, meta };
            }

            const nextSettings = { ...currentState.settings };
            for (const key of payload.settings.resetSettings) {
                const entry = schema.find((candidate) => candidate.key === key);
                if (entry) nextSettings[key] = clone(entry.defaultValue);
            }
            Object.assign(nextSettings, payload.settings.values);
            // Consent is a local decision and must never be activated by a
            // remote snapshot.
            nextSettings[SYNC_SETTING_KEY] = currentState.settings[SYNC_SETTING_KEY] === true;

            const entries = {
                [settingsKey]: nextSettings,
                ...Object.fromEntries(BLOCKLIST_DOMAINS.map((domain) => [
                    domain.key,
                    clone(payload.blocklists[domain.id])
                ]))
            };
            const undo = {
                schemaVersion: SYNC_SCHEMA_VERSION,
                createdAt: Date.now(),
                source,
                state: currentState
            };
            if (jsonBytes(undo) > SYNC_MAX_UNDO_BYTES) {
                throw new Error('Local sync Undo snapshot exceeds its recovery limit');
            }
            markSuppressed(entries);
            try {
                await setLocal({ ...entries, [SYNC_UNDO_KEY]: undo, [SYNC_LAST_META_KEY]: meta });
            } catch (error) {
                clearSuppressed(entries);
                throw error;
            }
            lastMeta = meta;
            lastResult = {
                ok: true,
                changed: true,
                source,
                meta,
                truncatedDomains: payload.truncatedDomains,
                skippedSettings: payload.skippedSettings
            };
            return lastResult;
        }

        async function pullRemote(meta, source = 'remote') {
            const payload = await readRemotePayload(meta);
            return applyRemotePayload(payload, meta, source);
        }

        async function disableSync() {
            await clearRemotePayload();
            lastMeta = null;
            lastError = null;
            await removeLocal([SYNC_LAST_META_KEY, SYNC_UNDO_KEY]);
            return { ok: true, enabled: false, cleared: true };
        }

        async function syncNowInternal() {
            const items = await readLocal([
                settingsKey,
                ...BLOCKLIST_KEYS,
                SYNC_DEVICE_ID_KEY,
                SYNC_CLOCK_KEY,
                SYNC_LAST_META_KEY
            ]);
            const enabled = items?.[settingsKey]?.[SYNC_SETTING_KEY] === true;
            if (!enabled) return { ok: true, enabled: false, skipped: true };
            if (!sync?.get || !sync?.set) {
                const error = new Error('Browser account sync is unavailable');
                error.code = 'SYNC_UNAVAILABLE';
                throw error;
            }

            const payloadInfo = await buildCurrentPayload(items);
            const remoteMeta = await readRemoteMeta();
            const clock = await loadDeviceClock(items);
            const candidate = {
                schemaVersion: SYNC_SCHEMA_VERSION,
                updatedAt: clock.updatedAt,
                sequence: clock.sequence,
                deviceId: clock.deviceId,
                chunkCount: payloadInfo.chunks.length,
                payloadBytes: payloadInfo.payloadBytes,
                checksum: checksum(payloadInfo.payloadText)
            };
            if (remoteMeta && compareSyncVersions(remoteMeta, candidate) > 0) {
                return pullRemote(remoteMeta, 'newest-wins');
            }

            await writeRemotePayload(candidate, payloadInfo, remoteMeta);
            lastMeta = candidate;
            lastError = null;
            await setLocal({ [SYNC_LAST_META_KEY]: candidate });
            lastResult = {
                ok: true,
                enabled: true,
                meta: candidate,
                payloadBytes: payloadInfo.payloadBytes,
                truncatedDomains: payloadInfo.truncatedDomains,
                skippedSettings: payloadInfo.skippedSettings
            };
            return lastResult;
        }

        async function syncNow() {
            return enqueue(async () => {
                try {
                    return await syncNowInternal();
                } catch (error) {
                    lastError = error;
                    const result = {
                        ok: false,
                        enabled: true,
                        error: { code: error?.code || 'SYNC_FAILED', message: error?.message || 'Settings sync failed.' }
                    };
                    lastResult = result;
                    return result;
                }
            });
        }

        async function handleLocalChanges(changes = {}) {
            const relevant = Object.entries(changes)
                .filter(([key, change]) => isSyncRelevantKey(key, settingsKey)
                    && !consumeSuppressed(key, change?.newValue));
            if (!relevant.length) return { ok: true, ignored: true };
            const settingsChange = relevant.find(([key]) => key === settingsKey)?.[1];
            const oldEnabled = settingsChange?.oldValue?.[SYNC_SETTING_KEY] === true;
            let currentEnabled = oldEnabled;
            return enqueue(async () => {
                try {
                    // A blocklist write does not include the settings bag in
                    // storage.onChanged. Read the current consent state so a
                    // list edit on an enabled device is still uploaded.
                    const current = await readLocal([settingsKey]);
                    const enabled = current?.[settingsKey]?.[SYNC_SETTING_KEY] === true;
                    currentEnabled = enabled;
                    if (settingsChange && oldEnabled && !enabled) return disableSync();
                    if (!enabled) return { ok: true, enabled: false, skipped: true };
                    return await syncNowInternal();
                } catch (error) {
                    lastError = error;
                    const result = {
                        ok: false,
                        enabled: currentEnabled,
                        error: { code: error?.code || 'SYNC_FAILED', message: error?.message || 'Settings sync failed.' }
                    };
                    lastResult = result;
                    return result;
                }
            });
        }

        async function handleSyncChanges(changes = {}) {
            const change = changes[SYNC_META_KEY];
            if (!change || !('newValue' in change)) return { ok: true, ignored: true };
            return enqueue(async () => {
                try {
                    const items = await readLocal([settingsKey, SYNC_LAST_META_KEY]);
                    if (items?.[settingsKey]?.[SYNC_SETTING_KEY] !== true) return { ok: true, enabled: false, skipped: true };
                    const meta = normalizeMeta(change.newValue);
                    if (!meta) throw new Error('Browser sync metadata is invalid');
                    const storedLast = normalizeMeta(items[SYNC_LAST_META_KEY]) || lastMeta;
                    if (storedLast && compareSyncVersions(meta, storedLast) <= 0) return { ok: true, ignored: true };
                    return await pullRemote(meta, 'remote');
                } catch (error) {
                    lastError = error;
                    const result = {
                        ok: false,
                        enabled: true,
                        error: { code: error?.code || 'SYNC_FAILED', message: error?.message || 'Settings sync failed.' }
                    };
                    lastResult = result;
                    return result;
                }
            });
        }

        async function undo() {
            return enqueue(async () => {
                const items = await readLocal([
                    settingsKey,
                    SYNC_UNDO_KEY,
                    ...BLOCKLIST_KEYS
                ]);
                const checkpoint = items[SYNC_UNDO_KEY];
                const state = normalizeUndoState(checkpoint?.state, settingsOptions);
                if (!state) return { ok: false, available: false, error: { code: 'NO_SYNC_UNDO', message: 'No sync change is available to undo.' } };
                const entries = {
                    [settingsKey]: state.settings,
                    ...Object.fromEntries(BLOCKLIST_DOMAINS.map((domain) => [domain.key, clone(state.blocklists[domain.id])]))
                };
                markSuppressed(entries);
                try {
                    await setLocal(entries);
                    await removeLocal(SYNC_UNDO_KEY);
                } catch (error) {
                    clearSuppressed(entries);
                    throw error;
                }
                let syncResult = null;
                if (state.settings[SYNC_SETTING_KEY] === true) {
                    try { syncResult = await syncNowInternal(); }
                    catch (error) {
                        lastError = error;
                        syncResult = { ok: false, error: { code: error?.code || 'SYNC_FAILED', message: error?.message || 'Undo could not be synced.' } };
                    }
                }
                return { ok: true, available: false, restored: true, sync: syncResult };
            });
        }

        async function getStatus() {
            const items = await readLocal([settingsKey, SYNC_UNDO_KEY, SYNC_LAST_META_KEY]);
            const enabled = items?.[settingsKey]?.[SYNC_SETTING_KEY] === true;
            const checkpoint = normalizeUndoState(items[SYNC_UNDO_KEY]?.state, settingsOptions);
            const storedLast = normalizeMeta(items[SYNC_LAST_META_KEY]);
            if (storedLast) lastMeta = storedLast;
            return {
                ok: true,
                enabled,
                available: !!sync?.get && !!sync?.set,
                hasUndo: !!checkpoint,
                lastSyncAt: storedLast?.updatedAt || null,
                payloadBytes: lastResult?.payloadBytes || storedLast?.payloadBytes || 0,
                truncatedDomains: lastResult?.truncatedDomains || [],
                skippedSettings: lastResult?.skippedSettings || [],
                error: lastError ? { code: lastError.code || 'SYNC_FAILED', message: lastError.message || String(lastError) } : null
            };
        }

        function installListeners() {
            if (listenersInstalled) return;
            if (local?.onChanged?.addListener) {
                local.onChanged.addListener((changes, areaName) => {
                    if (areaName && areaName !== 'local') return;
                    void handleLocalChanges(changes);
                });
            }
            if (sync?.onChanged?.addListener) {
                sync.onChanged.addListener((changes, areaName) => {
                    if (areaName && areaName !== 'sync') return;
                    void handleSyncChanges(changes);
                });
            }
            listenersInstalled = true;
        }

        async function initialize() {
            if (!sync?.get || !sync?.set) return { ok: true, skipped: true };
            return enqueue(async () => {
                try {
                    const items = await readLocal([settingsKey, SYNC_LAST_META_KEY]);
                    if (items?.[settingsKey]?.[SYNC_SETTING_KEY] !== true) return { ok: true, enabled: false, skipped: true };
                    const remoteMeta = await readRemoteMeta();
                    const storedLast = normalizeMeta(items[SYNC_LAST_META_KEY]);
                    if (!remoteMeta) return await syncNowInternal();
                    if (!storedLast || compareSyncVersions(remoteMeta, storedLast) > 0) {
                        return await pullRemote(remoteMeta, 'startup');
                    }
                    return await syncNowInternal();
                } catch (error) {
                    lastError = error;
                    return {
                        ok: false,
                        enabled: true,
                        error: { code: error?.code || 'SYNC_FAILED', message: error?.message || 'Settings sync failed.' }
                    };
                }
            });
        }

        return Object.freeze({
            buildPayload: (settings, items) => buildSyncPayload(settings, items, settingsOptions),
            getStatus,
            handleLocalChanges,
            handleSyncChanges,
            initialize,
            installListeners,
            syncNow,
            undo
        });
    }

    const api = Object.freeze({
        BLOCKLIST_DOMAINS,
        BLOCKLIST_KEYS,
        NON_SYNC_SETTING_KEYS,
        SETTINGS_STORAGE_KEY,
        SYNC_CHUNK_BYTES,
        SYNC_CHUNK_PREFIX,
        SYNC_LAST_META_KEY,
        SYNC_MAX_PAYLOAD_BYTES,
        SYNC_META_KEY,
        SYNC_QUOTA,
        SYNC_SCHEMA_VERSION,
        SYNC_SETTING_KEY,
        SYNC_UNDO_KEY,
        buildSettingsDelta,
        buildSyncPayload,
        compareSyncVersions,
        createSettingsSyncController,
        splitUtf8,
        validateSyncPayload
    });

    core.createSettingsSyncController = createSettingsSyncController;

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
