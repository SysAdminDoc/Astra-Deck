(() => {
    'use strict';

    // Shared across the isolated and MAIN worlds independently. A content
    // script update can execute classic scripts again in a document that still
    // contains the prior runtime, so a module-local boolean is not enough.
    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createInjectionGuard) return;

    const now = () => {
        try { return Date.now(); }
        catch (_) { return 0; }
    };

    function normalizeError(error) {
        if (!error) return null;
        return String(error?.message || error).slice(0, 240);
    }

    function createInjectionGuard(options = {}) {
        const key = String(options.key || '').trim();
        const owner = String(options.owner || key || 'runtime').trim();
        if (!key) throw new TypeError('Injection guard requires a stable key.');

        const existing = globalThis[key];
        if (existing && typeof existing === 'object'
            && (existing.phase === 'starting' || existing.phase === 'ready')) {
            existing.duplicateInjections = Number(existing.duplicateInjections || 0) + 1;
            existing.lastDuplicateAt = now();
            existing.lastDuplicateOwner = owner;
            const detail = {
                key,
                owner,
                duplicateInjections: existing.duplicateInjections,
                phase: existing.phase
            };
            try { existing.onDuplicate?.(detail); }
            catch (_) { /* reason: diagnostics must not unblock a duplicate runtime */ }
            try {
                console.warn(`[YTKit] Duplicate ${owner} injection ignored.`, detail);
            } catch (_) {
                // reason: a page may replace console methods with throwing stubs
            }
            return Object.freeze({
                claimed: false,
                duplicate: true,
                state: existing,
                snapshot: () => ({ ...existing })
            });
        }

        const generation = Number(existing?.generation || 0) + 1;
        const state = {
            schemaVersion: 1,
            key,
            owner,
            generation,
            phase: 'starting',
            active: true,
            duplicateInjections: 0,
            startedAt: now(),
            completedAt: null,
            failure: null,
            onDuplicate: null
        };
        globalThis[key] = state;

        const controller = {
            claimed: true,
            duplicate: false,
            state,
            snapshot() {
                const out = { ...state };
                delete out.onDuplicate;
                return out;
            },
            onDuplicate(handler) {
                state.onDuplicate = typeof handler === 'function' ? handler : null;
                return () => {
                    if (state.onDuplicate === handler) state.onDuplicate = null;
                };
            },
            update(patch = {}) {
                if (state.phase === 'failed' || !patch || typeof patch !== 'object') return;
                Object.assign(state, patch);
            },
            markReady(details = {}) {
                if (state.phase === 'failed') return;
                Object.assign(state, details && typeof details === 'object' ? details : {});
                state.phase = 'ready';
                state.active = true;
                state.completedAt = now();
                state.failure = null;
            },
            markFailed(reason, error) {
                state.phase = 'failed';
                state.active = false;
                state.failure = {
                    reason: String(reason || 'unknown').slice(0, 80),
                    message: normalizeError(error)
                };
                state.completedAt = now();
            }
        };
        return Object.freeze(controller);
    }

    core.createInjectionGuard = createInjectionGuard;
})();
