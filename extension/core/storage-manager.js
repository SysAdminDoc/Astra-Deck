(() => {
    'use strict';

    // the StorageManager cache+debounce layer
    // moved out of the 44k-line ytkit.js monolith into a focused core
    // module. NOTE: there are TWO storage layers in this codebase and this
    // module is the HIGH-LEVEL one:
    //
    // - extension/core/storage.js  -> low-level cache + chrome.storage
    // wire-up + debounced background
    // writes + change-listener fan-out.
    // Exposes storageRead / storageWrite /
    // storageWriteMany / flushPendingStorageWrites.
    //
    // - this module (storage-manager.js) -> per-monolith convenience layer
    // on top of the low-level functions:
    // in-memory cache, dirty set, debounce,
    // local-write echo dedupe for the
    // background.js relay loop, and an
    // unload-flush guard.
    //
    // The name collision between core.storageRead (low-level) and the
    // monolith's `StorageManager.get` (high-level) is a known confusion;
    // the new export is named `createStorageCache` to disambiguate, while
    // the call site in ytkit.js keeps the local variable name
    // `StorageManager` for minimal-diff continuity with and earlier.
    //
    // Dependencies are passed in as accessor callbacks so unit tests can
    // stub the chrome.storage round-trip with plain object mocks.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createStorageCache) return;

    const DEFAULT_ECHO_TTL_MS = 1500;
    const DEFAULT_SAVE_DEBOUNCE_MS = 500;

    function createStorageCache(options = {}) {
        const storageRead = typeof options.storageRead === 'function'
            ? options.storageRead
            : () => null;
        const storageWrite = typeof options.storageWrite === 'function'
            ? options.storageWrite
            : () => Promise.resolve();
        const storageWriteMany = typeof options.storageWriteMany === 'function'
            ? options.storageWriteMany
            : () => Promise.resolve();
        const flushPendingStorageWrites = typeof options.flushPendingStorageWrites === 'function'
            ? options.flushPendingStorageWrites
            : () => Promise.resolve();
        const getSaveDebounceMs = typeof options.getSaveDebounceMs === 'function'
            ? options.getSaveDebounceMs
            : () => DEFAULT_SAVE_DEBOUNCE_MS;
        const echoTtlMs = Number.isFinite(options.echoTtlMs) && options.echoTtlMs > 0
            ? options.echoTtlMs
            : DEFAULT_ECHO_TTL_MS;
        // Re-entrancy guard so _initUnloadFlush() is idempotent across
        // multiple factory invocations (production = one; tests = N).
        const _installedUnloadHooks = new WeakSet();

        const manager = {
            _cache: {},
            _dirty: new Set(),
            _saveTimeout: null,
            _recentLocalWrites: new Map(),

            _serialize(value) {
                try {
                    return JSON.stringify(value);
                } catch (_) {
                    return String(value);
                }
            },

            _rememberLocalWrite(key, value) {
                const serialized = this._serialize(value);
                this._recentLocalWrites.set(key, serialized);
                setTimeout(() => {
                    if (this._recentLocalWrites.get(key) === serialized) {
                        this._recentLocalWrites.delete(key);
                    }
                }, echoTtlMs);
            },

            consumeLocalEcho(key, value) {
                const serialized = this._serialize(value);
                if (this._recentLocalWrites.get(key) === serialized) {
                    this._recentLocalWrites.delete(key);
                    return true;
                }
                return false;
            },

            get(key, defaultVal = null) {
                if (Object.prototype.hasOwnProperty.call(this._cache, key)) {
                    return this._cache[key];
                }
                const val = storageRead(key, defaultVal);
                this._cache[key] = val;
                return val;
            },

            set(key, value) {
                this._cache[key] = value;
                this._dirty.add(key);
                this._rememberLocalWrite(key, value);
                this._scheduleSave();
            },

            _scheduleSave() {
                if (this._saveTimeout) return;
                this._saveTimeout = setTimeout(() => this._flush(), getSaveDebounceMs());
            },

            _flush() {
                this._saveTimeout = null;
                const toSave = [...this._dirty];
                if (toSave.length === 0) return;

                const payload = {};
                for (const key of toSave) {
                    payload[key] = this._cache[key];
                    this._dirty.delete(key);
                }

                void storageWriteMany(payload, { immediate: true });
            },

            setSync(key, value) {
                this._cache[key] = value;
                this._dirty.delete(key);
                this._rememberLocalWrite(key, value);
                void storageWrite(key, value, { immediate: true });
            },

            syncFromExternal(key, value) {
                if (value === undefined) delete this._cache[key];
                else this._cache[key] = value;
                this._dirty.delete(key);
            },

            // Idempotent install of beforeunload / yt-navigate-start hooks
            // that flush pending writes. The WeakSet guard means calling
            // this twice on the same window object is a no-op.
            _initUnloadFlush() {
                if (typeof window === 'undefined' || typeof document === 'undefined') return;
                if (_installedUnloadHooks.has(window)) return;
                _installedUnloadHooks.add(window);
                const self = this;
                window.addEventListener('beforeunload', () => {
                    if (self._saveTimeout) {
                        clearTimeout(self._saveTimeout);
                        self._saveTimeout = null;
                    }
                    if (self._dirty.size > 0) self._flush();
                    void flushPendingStorageWrites();
                });
                document.addEventListener('yt-navigate-start', () => {
                    if (self._dirty.size > 0) self._flush();
                    void flushPendingStorageWrites();
                });
            }
        };

        return manager;
    }

    Object.assign(core, {
        createStorageCache
    });
})();
