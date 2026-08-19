(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.storageRead) return;

    const extensionStateCache = Object.create(null);
    let pendingStorageWrites = Object.create(null);
    let pendingStorageFlush = null;
    let extensionStateReady = false;
    let extensionStateReadyPromise = null;
    let storageChangeListenerInstalled = false;
    let storageFlushGuardsInstalled = false;
    const STORAGE_WRITE_DEBOUNCE_MS = 140;
    // Exponential backoff on persistent storage failures (e.g. QUOTA_BYTES
    // exceeded, corrupted profile). Without a backoff, a single quota error
    // would retry every 140 ms forever, saturating the SW IPC channel and
    // flooding the console.
    const STORAGE_FLUSH_MIN_BACKOFF_MS = 500;
    const STORAGE_FLUSH_MAX_BACKOFF_MS = 60000;
    let storageFlushBackoffMs = 0;
    let storageFlushFailureCount = 0;
    let storageFlushInFlight = null;
    // Settings save() surfaces its own failures (rollback + role=alert toast)
    // and the flush retries with backoff, but fire-and-forget auxiliary writes
    // — watch progress, sticky-chat layout, the low-power backup — never
    // observed {ok:false}. On a persistently failing store their data was lost
    // at tab close behind nothing louder than a console.warn.
    //
    // Reported once per failure EPISODE, not once per failed flush: a full
    // disk fails every retry, and a toast per retry would be its own problem.
    // Cleared on the first success so a later episode reports again.
    const STORAGE_PERSISTENT_FAILURE_THRESHOLD = 3;
    let storagePersistentFailureReported = false;
    let onStoragePersistentFailure = null;

    function setStoragePersistentFailureHandler(handler) {
        onStoragePersistentFailure = typeof handler === 'function' ? handler : null;
    }

    function reportPersistentStorageFailure(error, keys) {
        if (storagePersistentFailureReported) return;
        if (storageFlushFailureCount < STORAGE_PERSISTENT_FAILURE_THRESHOLD) return;
        storagePersistentFailureReported = true;
        if (!onStoragePersistentFailure) return;
        try {
            onStoragePersistentFailure({
                error,
                failureCount: storageFlushFailureCount,
                // Bounded: this reaches a toast and a diagnostic ring entry.
                keys: Array.isArray(keys) ? keys.slice(0, 10) : []
            });
        } catch (_) {
            // reason: a reporting surface that throws must not take the
            // storage layer down with it — the retry loop still matters.
        }
    }

    // Support-only reset surface for stale YouTube page state. This is an
    // exact allowlist: never broaden it to prefixes because YouTube and other
    // extensions can store unrelated data on the same origin. In particular,
    // no `ytkit-*` / Astra settings, cookies, Cache Storage, or IndexedDB data
    // are in scope.
    const YOUTUBE_RESET_STATE_KEYS = Object.freeze([
        'yt.config_',
        'yt.global_',
        'yt.innertube::nextId',
        'yt.innertube::requests',
        'yt.logging.errors',
        'yt-player-audio-track-language',
        'yt-player-bandwidth',
        'yt-player-caption-display-settings',
        'yt-player-caption-language',
        'yt-player-live-latency',
        'yt-player-performance-cap',
        'yt-player-quality',
        'yt-player-volume',
        'yt-remote-cast-installed',
        'yt-remote-connected-devices',
        'yt-remote-device-id',
        'yt-remote-fast-check-period',
        'yt-remote-session-app',
        'yt-remote-session-browser-channel',
        'yt-remote-session-name'
    ]);
    const YOUTUBE_RESET_STATE_KEY_SET = new Set(YOUTUBE_RESET_STATE_KEYS);
    const YOUTUBE_RESET_MAX_VALUE_BYTES = 128 * 1024;
    const YOUTUBE_RESET_MAX_SNAPSHOT_BYTES = 512 * 1024;

    function createYouTubeStateManager(options = {}) {
        const localStore = options.localStorage;
        const sessionStore = options.sessionStorage;
        const origin = String(options.origin || '');
        if (!localStore || !sessionStore) throw new Error('YouTube storage is unavailable');
        if (!/^https:\/\/(?:(?:[a-z0-9-]+\.)?(?:youtube\.com|youtube-nocookie\.com)|youtu\.be)$/i.test(origin)) {
            throw new Error('YouTube state reset is restricted to YouTube origins');
        }

        const areas = Object.freeze({ local: localStore, session: sessionStore });

        function readRecords(store) {
            const records = [];
            const oversized = [];
            for (const key of YOUTUBE_RESET_STATE_KEYS) {
                const value = store.getItem(key);
                if (value === null) continue;
                if (new Blob([value]).size > YOUTUBE_RESET_MAX_VALUE_BYTES) {
                    // Bloated values (yt.innertube::requests is the usual
                    // offender) are exactly what reset targets. They cannot be
                    // snapshotted for Undo, but they must not block the reset —
                    // clear() removes them without a recovery record.
                    oversized.push(key);
                    continue;
                }
                records.push([key, value]);
            }
            return { records, oversized };
        }

        function validateRecords(records) {
            if (!Array.isArray(records) || records.length > YOUTUBE_RESET_STATE_KEYS.length) {
                throw new Error('YouTube state snapshot has an invalid record list');
            }
            const seen = new Set();
            return records.map((record) => {
                if (!Array.isArray(record) || record.length !== 2) throw new Error('YouTube state snapshot record is malformed');
                const [key, value] = record;
                if (!YOUTUBE_RESET_STATE_KEY_SET.has(key) || seen.has(key) || typeof value !== 'string') {
                    throw new Error('YouTube state snapshot contains an unsupported record');
                }
                if (new Blob([value]).size > YOUTUBE_RESET_MAX_VALUE_BYTES) {
                    throw new Error('YouTube state snapshot value exceeds the recovery limit');
                }
                seen.add(key);
                return [key, value];
            });
        }

        function validateSnapshot(snapshot) {
            if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.origin !== origin) {
                throw new Error('YouTube state snapshot does not match this tab');
            }
            const normalized = {
                schemaVersion: 1,
                origin,
                local: validateRecords(snapshot.local),
                session: validateRecords(snapshot.session)
            };
            if (new Blob([JSON.stringify(normalized)]).size > YOUTUBE_RESET_MAX_SNAPSHOT_BYTES) {
                throw new Error('YouTube state snapshot exceeds the recovery limit');
            }
            return normalized;
        }

        function snapshot() {
            const localRead = readRecords(localStore);
            const sessionRead = readRecords(sessionStore);
            const normalized = validateSnapshot({
                schemaVersion: 1,
                origin,
                local: localRead.records,
                session: sessionRead.records
            });
            // Advisory only — validateSnapshot() drops this field, so staged
            // clear/restore snapshots stay schema-exact.
            normalized.oversized = [
                ...localRead.oversized.map((key) => `local:${key}`),
                ...sessionRead.oversized.map((key) => `session:${key}`)
            ];
            return normalized;
        }

        function clear(snapshotValue) {
            const normalized = validateSnapshot(snapshotValue);
            const cleared = [];
            const skipped = [];
            try {
                for (const [area, records] of [['local', normalized.local], ['session', normalized.session]]) {
                    const store = areas[area];
                    for (const [key, value] of records) {
                        if (store.getItem(key) !== value) {
                            skipped.push(`${area}:${key}`);
                            continue;
                        }
                        store.removeItem(key);
                        cleared.push([area, key, value]);
                    }
                }
            } catch (error) {
                for (const [area, key, value] of cleared) areas[area].setItem(key, value);
                throw error;
            }
            // Oversized values were excluded from the snapshot (no Undo
            // record fits the recovery limit). Clear them anyway — after the
            // undoable clears committed — and report them as not-undoable.
            const notUndoable = [];
            for (const [area, records] of [['local', normalized.local], ['session', normalized.session]]) {
                const store = areas[area];
                const snapshotted = new Set(records.map(([key]) => key));
                for (const key of YOUTUBE_RESET_STATE_KEYS) {
                    if (snapshotted.has(key)) continue;
                    try {
                        const value = store.getItem(key);
                        if (value === null) continue;
                        if (new Blob([value]).size <= YOUTUBE_RESET_MAX_VALUE_BYTES) continue;
                        store.removeItem(key);
                        notUndoable.push(`${area}:${key}`);
                    } catch (_) {
                        skipped.push(`${area}:${key}`);
                    }
                }
            }
            return {
                cleared: cleared.map(([area, key]) => `${area}:${key}`),
                skipped,
                notUndoable
            };
        }

        function restore(snapshotValue) {
            const normalized = validateSnapshot(snapshotValue);
            const candidates = [
                ...normalized.local.map(([key, value]) => ['local', key, value]),
                ...normalized.session.map(([key, value]) => ['session', key, value])
            ];
            // Undo never overwrites state YouTube recreated after the reset.
            // Restore only keys that are still absent; this also makes the
            // original staged snapshot safe when clear() skipped a changed key.
            const targets = candidates.filter(([area, key]) => areas[area].getItem(key) === null);
            const skipped = candidates
                .filter(([area, key]) => areas[area].getItem(key) !== null)
                .map(([area, key]) => `${area}:${key}`);
            const before = targets.map(([area, key]) => [area, key, areas[area].getItem(key)]);
            const applied = [];
            try {
                for (const [area, key, value] of targets) {
                    areas[area].setItem(key, value);
                    applied.push(`${area}:${key}`);
                }
            } catch (error) {
                for (const [area, key, previous] of before) {
                    if (!applied.includes(`${area}:${key}`)) continue;
                    if (previous === null) areas[area].removeItem(key);
                    else areas[area].setItem(key, previous);
                }
                throw error;
            }
            return { restored: applied, skipped };
        }

        return Object.freeze({ clear, restore, snapshot });
    }

    function emitStorageUpdate(changes, source = 'chrome-storage') {
        try {
            window.dispatchEvent(new CustomEvent('ytkit-storage-changed', {
                detail: { changes, source }
            }));
        } catch (error) {
            console.warn('[YTKit] Failed to dispatch storage event:', error);
        }
    }

    // Keys deleted while the initial get(null) is in flight. Cleared once the
    // preload has resolved and the merge can no longer overwrite them.
    const preloadWindowDeletions = new Set();

    // Set when the one-shot preload read rejected. Read by ytkit.js after
    // settings load so the degraded state reaches the user and the diagnostic
    // ring, instead of only a console.warn nobody sees.
    let storagePreloadError = null;

    function getStoragePreloadError() {
        return storagePreloadError;
    }

    async function preloadExtensionState() {
        if (extensionStateReady) return;
        if (extensionStateReadyPromise) return extensionStateReadyPromise;
        extensionStateReadyPromise = (async () => {
            if (core.hasExtensionContext()) {
                try {
                    // Skip-if-present merge: the onChanged listener is installed
                    // before this preload resolves and may write a fresher value
                    // into the cache during the get(null) round-trip. Listener
                    // values are always at-or-newer than this snapshot, so never
                    // clobber a key the cache already holds.
                    const snapshot = await chrome.storage.local.get(null);
                    for (const k in snapshot) {
                        if (preloadWindowDeletions.has(k)) continue;
                        if (!Object.prototype.hasOwnProperty.call(extensionStateCache, k)) {
                            extensionStateCache[k] = snapshot[k];
                        }
                    }
                } catch (error) {
                    console.warn('[YTKit] Storage preload failed:', error);
                    // The cache stays empty and extensionStateReady still flips
                    // true, so settingsManager.load() merges {} over defaults and
                    // every feature runs at factory settings for the rest of this
                    // tab session — while the popup, which reads storage on its
                    // own, keeps showing the user's real values. Nothing is lost
                    // (save() diffs against the same-session baseline), but the
                    // two surfaces silently disagree. Record the failure so the
                    // page can say so instead of pretending these ARE the
                    // user's settings.
                    storagePreloadError = error instanceof Error
                        ? error
                        : new Error(String(error && error.message ? error.message : error));
                }
            }
            extensionStateReady = true;
            preloadWindowDeletions.clear();
        })();
        try {
            await extensionStateReadyPromise;
        } finally {
            extensionStateReadyPromise = null;
        }
    }

    function storageRead(key, defaultValue) {
        return Object.prototype.hasOwnProperty.call(extensionStateCache, key)
            ? extensionStateCache[key]
            : defaultValue;
    }

    function hasPendingStorageWrites() {
        return Object.keys(pendingStorageWrites).length > 0;
    }

    function schedulePendingStorageFlush() {
        if (pendingStorageFlush || !core.hasExtensionContext() || !hasPendingStorageWrites()) return;
        const delay = Math.max(STORAGE_WRITE_DEBOUNCE_MS, storageFlushBackoffMs);
        pendingStorageFlush = setTimeout(() => {
            pendingStorageFlush = null;
            void flushPendingStorageWrites();
        }, delay);
    }

    function flushPendingStorageWrites() {
        if (pendingStorageFlush) {
            clearTimeout(pendingStorageFlush);
            pendingStorageFlush = null;
        }
        if (!hasPendingStorageWrites()) {
            return storageFlushInFlight || Promise.resolve({ ok: true });
        }
        if (!core.hasExtensionContext()) {
            // The extension was updated, reloaded or disabled while this tab
            // stayed open. The panel keeps working against extensionStateCache,
            // so without this branch every setSync/immediate write resolved
            // { ok: true } and imports, undo/rollback confirmations and "Settings
            // saved" toasts all claimed success for writes that could never
            // reach disk. The { ok, error } contract exists precisely so a
            // persistence failure cannot be reported as success — the messaging
            // paths already reject with this same wording.
            return storageFlushInFlight || Promise.resolve({
                ok: false,
                error: new Error('Extension context invalidated. Reload the page.')
            });
        }
        if (storageFlushInFlight) {
            // Serialize flushes: with two set() calls in flight, an OLDER
            // failed flush could merge-back and retry its stale values over
            // a NEWER value the competing flush already persisted, leaving
            // disk and cache divergent until the next write.
            return storageFlushInFlight.then((result) => {
                if (result && result.ok === false && storageFlushBackoffMs > 0) {
                    // The in-flight flush failed and scheduled a backoff —
                    // flushing immediately here would cancel that timer and
                    // hammer a persistent quota error once per waiting
                    // caller. Wait out the backoff, then flush.
                    return new Promise((resolve) => {
                        setTimeout(() => resolve(flushPendingStorageWrites()), storageFlushBackoffMs);
                    });
                }
                return flushPendingStorageWrites();
            });
        }

        const writes = pendingStorageWrites;
        pendingStorageWrites = Object.create(null);

        // Never rejects: failures merge back for retry. The resolved
        // { ok, error } result is how callers that need write confirmation
        // (e.g. the settings-import transaction) observe a failed flush.
        storageFlushInFlight = chrome.storage.local.set(writes).then(() => {
            // Success — clear any backoff so the next flush runs on the
            // normal debounce schedule instead of the failure cadence.
            storageFlushBackoffMs = 0;
            storageFlushFailureCount = 0;
            storagePersistentFailureReported = false;
            return { ok: true };
        }).catch((error) => {
            console.warn('[YTKit] Storage flush failed:', error);
            // Merge back onto a prototype-less target so retries cannot
            // inherit Object.prototype entries. Newer pending writes that
            // arrived while the failing set() was in flight take precedence
            // over the ones that failed.
            const merged = Object.create(null);
            Object.assign(merged, writes);
            Object.assign(merged, pendingStorageWrites);
            pendingStorageWrites = merged;
            // Exponential backoff so persistent failures (QUOTA_BYTES,
            // corrupted profile) do not retry every 140 ms forever.
            storageFlushFailureCount += 1;
            storageFlushBackoffMs = Math.min(
                STORAGE_FLUSH_MAX_BACKOFF_MS,
                STORAGE_FLUSH_MIN_BACKOFF_MS * Math.pow(2, Math.min(storageFlushFailureCount - 1, 8))
            );
            schedulePendingStorageFlush();
            reportPersistentStorageFailure(error, Object.keys(writes));
            return { ok: false, error };
        }).finally(() => {
            storageFlushInFlight = null;
        });
        return storageFlushInFlight;
    }

    function storageWriteMany(entries, options = {}) {
        Object.assign(extensionStateCache, entries);
        Object.assign(pendingStorageWrites, entries);

        if (options.immediate) {
            return flushPendingStorageWrites();
        }

        schedulePendingStorageFlush();
        return Promise.resolve({ ok: true, queued: true });
    }

    function storageWrite(key, value, options = {}) {
        return storageWriteMany({ [key]: value }, options);
    }

    function storageReadJSON(key, defaultValue) {
        const rawValue = storageRead(key, undefined);
        if (rawValue === undefined || rawValue === null || rawValue === '') return defaultValue;
        if (typeof rawValue === 'string') {
            try {
                const parsed = JSON.parse(rawValue);
                return parsed ?? defaultValue;
            } catch (_) {
                return defaultValue;
            }
        }
        if (typeof rawValue === 'object') return rawValue;
        return defaultValue;
    }

    function storageWriteJSON(key, value, options = {}) {
        return storageWrite(key, value, options);
    }

    function installStorageFlushGuards() {
        if (storageFlushGuardsInstalled) return;
        const flush = () => { void flushPendingStorageWrites(); };
        window.addEventListener('beforeunload', flush, { capture: true });
        window.addEventListener('pagehide', flush, { capture: true });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flush();
        });
        storageFlushGuardsInstalled = true;
    }

    function installStorageChangeListener() {
        if (storageChangeListenerInstalled) return;
        if (!core.hasExtensionContext() || !chrome.storage?.onChanged) return;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            try {
                const normalizedChanges = {};
                for (const [key, change] of Object.entries(changes)) {
                    if ('newValue' in change) {
                        extensionStateCache[key] = change.newValue;
                        preloadWindowDeletions.delete(key);
                    } else {
                        delete extensionStateCache[key];
                        // The preload's skip-if-present merge only protects keys
                        // the cache HOLDS; a key deleted during the get(null)
                        // round-trip is absent, so the stale snapshot value used
                        // to come straight back. Record it for the merge.
                        if (!extensionStateReady) preloadWindowDeletions.add(key);
                    }
                    normalizedChanges[key] = {
                        oldValue: change.oldValue,
                        newValue: change.newValue
                    };
                }
                emitStorageUpdate(normalizedChanges);
            } catch (error) {
                console.error('[YTKit] Storage listener error:', error);
            }
        });
        storageChangeListenerInstalled = true;
    }

    Object.assign(core, {
        createYouTubeStateManager,
        flushPendingStorageWrites,
        getStoragePreloadError,
        installStorageChangeListener,
        installStorageFlushGuards,
        preloadExtensionState,
        storageRead,
        storageReadJSON,
        storageWrite,
        storageWriteJSON,
        storageWriteMany,
        setStoragePersistentFailureHandler
    });
    core.YOUTUBE_RESET_STATE_KEYS = YOUTUBE_RESET_STATE_KEYS;
})();
