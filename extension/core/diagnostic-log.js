(() => {
    'use strict';

    // DiagnosticLog moved out of the
    // 44k-line ytkit.js monolith into a focused core module.
    //
    // The log is a ring buffer that records context-tagged diagnostic
    // events (ctx: trusted-types / selector-health / storage-corruption /
    // settings-migration / console / window). added per-ctx
    // counters with O(1) record() bookkeeping + ring-trim decrement +
    // lazy resync from the persisted ring on first read.
    //
    // The log couples to two ytkit.js internals:
    // - `appState.settings` (the persisted ring lives at
    // `appState.settings._errors`)
    // - `settingsManager.saveDiagnosticEntries`, an `_errors`-only write this
    // module calls on its own bounded schedule after a record, and
    // `settingsManager.save` for the Clear path
    //
    // We pass both through as accessor callbacks at instantiation time —
    // the module itself stays free of any feature-monolith coupling and
    // works in unit tests with just plain object mocks.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createDiagnosticLog) return;

    const DEFAULT_CAP = 500;
    const CTX_MAX_LEN = 40;
    const MSG_MAX_LEN = 500;
    // A recorded entry is saved on its own, without waiting for an unrelated
    // settings edit: two seconds after the last one, never more than ten
    // after the first, and at most six writes a minute however hard errors
    // arrive. A failed save pauses saving for five minutes and is never
    // itself recorded, so a full quota can't feed the log that fills it.
    const FLUSH_DELAY_MS = 2000;
    const FLUSH_MAX_WAIT_MS = 10000;
    const WRITE_BUDGET = 6;
    const WRITE_WINDOW_MS = 60000;
    const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
    // A save that never settles (the worker died mid-write) counts as a
    // failure after this long, so the log doesn't stop saving for good.
    const SAVE_TIMEOUT_MS = 30000;

    function createDiagnosticLog(options = {}) {
        // Accessor callbacks — the caller (ytkit.js) wires these to its
        // own appState and settingsManager. Unit tests pass plain stubs.
        const getSettings = typeof options.getSettings === 'function'
            ? options.getSettings
            : () => null;
        const saveSettings = typeof options.saveSettings === 'function'
            ? options.saveSettings
            : () => {};
        // Writes only the saved ring. The timed flush prefers it to a whole
        // settings save, which would carry along unrelated unsaved edits and
        // answer a full quota with a rollback and a "could not be saved"
        // toast every few minutes.
        const saveEntries = typeof options.saveEntries === 'function'
            ? options.saveEntries
            : null;
        const getVersion = typeof options.getVersion === 'function'
            ? options.getVersion
            : () => 'unknown';
        const cap = Number.isFinite(options.cap) && options.cap > 0
            ? Math.floor(options.cap)
            : DEFAULT_CAP;
        // True in a private (or unknown) window. Entries there name the pages
        // and videos it visited, so they stay in this tab's memory instead of
        // riding the next settings save into regular storage.
        const keepInMemory = typeof options.keepInMemory === 'function'
            ? options.keepInMemory
            : () => false;
        const memoryEntries = [];
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        const setTimer = typeof options.setTimer === 'function'
            ? options.setTimer
            : (fn, ms) => setTimeout(fn, ms);
        const clearTimer = typeof options.clearTimer === 'function'
            ? options.clearTimer
            : (id) => clearTimeout(id);

        const state = {
            enabled: false,
            ctxCounts: Object.create(null),
            countsResynced: false
        };
        const journal = {
            pending: false,
            firstPendingAt: 0,
            timer: null,
            flushing: false,
            writes: [],
            blockedUntil: 0,
            warned: false
        };

        function _cancelFlush() {
            if (journal.timer !== null) clearTimer(journal.timer);
            journal.timer = null;
        }

        function _armFlush() {
            _cancelFlush();
            const at = now();
            journal.writes = journal.writes.filter((ts) => at - ts < WRITE_WINDOW_MS);
            let delay = Math.min(FLUSH_DELAY_MS, journal.firstPendingAt + FLUSH_MAX_WAIT_MS - at);
            if (journal.writes.length >= WRITE_BUDGET) {
                delay = Math.max(delay, journal.writes[0] + WRITE_WINDOW_MS - at);
            }
            if (journal.blockedUntil > at) delay = Math.max(delay, journal.blockedUntil - at);
            journal.timer = setTimer(() => {
                journal.timer = null;
                flush();
            }, Math.max(0, delay));
        }

        function _scheduleFlush() {
            if (!journal.pending) {
                journal.pending = true;
                journal.firstPendingAt = now();
            }
            if (!journal.flushing) _armFlush();
        }

        function _flushFailed(error) {
            journal.blockedUntil = now() + FAILURE_BACKOFF_MS;
            // Deliberately not record(): the entry would only schedule the
            // write that just failed.
            if (!journal.warned && typeof console !== 'undefined') {
                journal.warned = true;
                console.warn('[YTKit] DiagnosticLog could not save; entries stay in this tab for now:', error);
            }
        }

        // Writes the saved ring now. `force` (page hide) skips the write
        // budget but not a failure pause.
        function flush({ force = false } = {}) {
            _cancelFlush();
            if (!journal.pending || journal.flushing) return;
            const at = now();
            journal.writes = journal.writes.filter((ts) => at - ts < WRITE_WINDOW_MS);
            if (journal.blockedUntil > at || (!force && journal.writes.length >= WRITE_BUDGET)) {
                _armFlush();
                return;
            }
            journal.pending = false;
            const settings = getSettings();
            // Only an opted-in log is saved; the in-memory test switch isn't
            // the user's consent to write anything.
            if (!settings || !settings.diagnosticLog) return;
            journal.flushing = true;
            journal.writes.push(at);
            let settled = false;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                clearTimer(watchdog);
                journal.flushing = false;
                if (error !== undefined) _flushFailed(error);
                if (journal.pending) _armFlush();
            };
            const watchdog = setTimer(() => finish(new Error('DiagnosticLog save timed out')), SAVE_TIMEOUT_MS);
            let result;
            try {
                result = saveEntries
                    ? saveEntries(Array.isArray(settings._errors) ? settings._errors.slice() : [])
                    : saveSettings(settings);
            } catch (error) {
                finish(error);
                return;
            }
            Promise.resolve(result).then((outcome) => {
                finish(outcome && outcome.ok === false ? (outcome.error || outcome.reason || 'save failed') : undefined);
            }, (error) => finish(error === undefined ? 'save failed' : error));
        }

        function _resyncCounts() {
            const settings = getSettings();
            const persisted = settings && Array.isArray(settings._errors) ? settings._errors : null;
            if (!persisted && !memoryEntries.length) return;
            const arr = (persisted || []).concat(memoryEntries);
            const next = Object.create(null);
            for (let i = 0; i < arr.length; i++) {
                const ctx = arr[i] && typeof arr[i].ctx === 'string' ? arr[i].ctx : '';
                if (!ctx) continue;
                next[ctx] = (next[ctx] || 0) + 1;
            }
            state.ctxCounts = next;
            state.countsResynced = true;
        }

        function record(ctx, msg) {
            const settings = getSettings();
            // diagnosticLog setting acts as the user-facing enable gate;
            // the in-memory flag is the test/dev override.
            if (!state.enabled && !(settings && settings.diagnosticLog)) return;
            if (!settings) return;
            try {
                const inMemory = keepInMemory() === true;
                const arr = inMemory ? memoryEntries : (settings._errors || []);
                const ctxKey = String(ctx).slice(0, CTX_MAX_LEN);
                // Resync BEFORE push so cross-session entries already in
                // the persisted ring are counted exactly once. The
                // inline implementation had this in the wrong
                // order (push then resync then increment), which made
                // the first record on a fresh session double-count.
                // Confirmed by the new N11 unit tests.
                if (!state.countsResynced) _resyncCounts();
                arr.push({
                    ts: Date.now(),
                    ctx: ctxKey,
                    msg: String(msg).slice(0, MSG_MAX_LEN)
                });
                state.ctxCounts[ctxKey] = (state.ctxCounts[ctxKey] || 0) + 1;
                // Ring-trim with counter decrement so the derived view stays
                // consistent with the persisted ring.
                while (arr.length > cap) {
                    const dropped = arr.shift();
                    const dropCtx = dropped && typeof dropped.ctx === 'string' ? dropped.ctx : '';
                    if (dropCtx && state.ctxCounts[dropCtx]) {
                        state.ctxCounts[dropCtx] -= 1;
                        if (state.ctxCounts[dropCtx] <= 0) delete state.ctxCounts[dropCtx];
                    }
                }
                if (!inMemory) {
                    settings._errors = arr;
                    if (settings.diagnosticLog) _scheduleFlush();
                }
            } catch (e) {
                // Best-effort — never let diagnostic recording fail the
                // call site. console.warn matches the prior IIFE.
                if (typeof console !== 'undefined') {
                    console.warn('[YTKit] DiagnosticLog.record failed:', e);
                }
            }
        }

        function countsByCtx() {
            if (!state.countsResynced) _resyncCounts();
            return { ...state.ctxCounts };
        }

        function get() {
            const settings = getSettings();
            const persisted = settings && Array.isArray(settings._errors) ? settings._errors : [];
            return memoryEntries.length ? persisted.concat(memoryEntries) : persisted;
        }

        // Clears both rings. From a private window that still empties the
        // saved one, because the user asked for an empty log and the panel
        // shows both.
        function clear() {
            const settings = getSettings();
            if (!settings) return;
            settings._errors = [];
            memoryEntries.length = 0;
            state.ctxCounts = Object.create(null);
            state.countsResynced = true;
            _cancelFlush();
            journal.pending = false;
            try {
                Promise.resolve(saveSettings(settings)).catch(() => {
                    // reason: the settings save reports its own failure; a
                    // rejection here must not surface as an unhandled one.
                });
            } catch (_) {
                // reason: saveSettings is best-effort; clear() returns successfully
                // even if the persistence path throws (the in-memory ring is reset).
            }
        }

        function download() {
            const data = JSON.stringify({
                version: getVersion(),
                userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
                url: (typeof location !== 'undefined' && location.href) || '',
                entries: get()
            }, null, 2);
            if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof document === 'undefined') {
                // Unit-test contexts may not have a DOM; the caller can fall
                // back to its own export path if needed.
                return data;
            }
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ytkit-diagnostic-${Date.now()}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            return data;
        }

        return {
            enable() { state.enabled = true; },
            disable() { state.enabled = false; },
            // Test hook — surface internal state for assertions; not part
            // of the documented public API.
            _state: state,
            _journal: journal,
            _resyncCounts,
            record,
            flush,
            countsByCtx,
            get,
            clear,
            download
        };
    }

    Object.assign(core, {
        createDiagnosticLog
    });
})();
