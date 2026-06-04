(() => {
    'use strict';

    // iter-6 N11 (partial M-phase extraction): DiagnosticLog moved out of the
    // 44k-line ytkit.js monolith into a focused core module.
    //
    // The log is a ring buffer that records context-tagged diagnostic
    // events (ctx: trusted-types / selector-health / storage-corruption /
    // settings-migration / console / window). iter-6 N6 added per-ctx
    // counters with O(1) record() bookkeeping + ring-trim decrement +
    // lazy resync from the persisted ring on first read.
    //
    // The log couples to two ytkit.js internals:
    //   - `appState.settings` (the persisted ring lives at
    //     `appState.settings._errors` and is debounce-saved through
    //     `settingsManager`)
    //   - `settingsManager.save` for the Clear path
    //
    // We pass both through as accessor callbacks at instantiation time —
    // the module itself stays free of any feature-monolith coupling and
    // works in unit tests with just plain object mocks.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createDiagnosticLog) return;

    const DEFAULT_CAP = 500;
    const CTX_MAX_LEN = 40;
    const MSG_MAX_LEN = 500;

    function createDiagnosticLog(options = {}) {
        // Accessor callbacks — the caller (ytkit.js) wires these to its
        // own appState and settingsManager. Unit tests pass plain stubs.
        const getSettings = typeof options.getSettings === 'function'
            ? options.getSettings
            : () => null;
        const saveSettings = typeof options.saveSettings === 'function'
            ? options.saveSettings
            : () => {};
        const getVersion = typeof options.getVersion === 'function'
            ? options.getVersion
            : () => 'unknown';
        const cap = Number.isFinite(options.cap) && options.cap > 0
            ? Math.floor(options.cap)
            : DEFAULT_CAP;

        const state = {
            enabled: false,
            ctxCounts: Object.create(null),
            countsResynced: false
        };

        function _resyncCounts() {
            const settings = getSettings();
            const arr = settings && Array.isArray(settings._errors) ? settings._errors : null;
            if (!arr) return;
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
                const arr = settings._errors || [];
                const ctxKey = String(ctx).slice(0, CTX_MAX_LEN);
                // Resync BEFORE push so cross-session entries already in
                // the persisted ring are counted exactly once. The
                // iter-6 N6 inline implementation had this in the wrong
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
                settings._errors = arr;
                // Debounced save handled by settingsManager on next settings
                // touch; we don't force a write here to avoid thrashing.
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
            return settings && Array.isArray(settings._errors) ? settings._errors : [];
        }

        function clear() {
            const settings = getSettings();
            if (!settings) return;
            settings._errors = [];
            state.ctxCounts = Object.create(null);
            state.countsResynced = true;
            try { saveSettings(settings); } catch (_) {
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
            _resyncCounts,
            record,
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
