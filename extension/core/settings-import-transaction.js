(() => {
    'use strict';

    function createSettingsImportTransaction(options = {}) {
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        let checkpoint = null;

        function validateOperation(operation) {
            if (!operation || typeof operation !== 'object') throw new TypeError('Import operation is required');
            for (const key of ['snapshot', 'apply', 'restore']) {
                if (typeof operation[key] !== 'function') throw new TypeError(`Import operation ${key}() is required`);
            }
        }

        function run(operation) {
            try {
                validateOperation(operation);
            } catch (error) {
                return { ok: false, phase: 'validation', rolledBack: false, error };
            }

            let snapshot;
            try {
                snapshot = operation.snapshot();
            } catch (error) {
                return { ok: false, phase: 'snapshot', rolledBack: false, error };
            }

            const createdAt = now();
            const finalize = (value) => {
                checkpoint = {
                    snapshot,
                    summary: operation.summary || null,
                    restore: operation.restore,
                    createdAt
                };
                return {
                    ok: true,
                    phase: 'applied',
                    rolledBack: false,
                    summary: operation.summary || null,
                    createdAt,
                    value
                };
            };
            const rollback = (error) => {
                // Retain a retryable checkpoint when rollback fails. A later
                // Undo attempt can still restore the exact pre-import snapshot
                // instead of losing the recovery path.
                const keepCheckpoint = (rollbackError) => {
                    checkpoint = {
                        snapshot,
                        summary: operation.summary || null,
                        restore: operation.restore,
                        createdAt
                    };
                    return {
                        ok: false,
                        phase: 'rollback',
                        rolledBack: false,
                        error,
                        rollbackError,
                        canUndo: true
                    };
                };
                const settle = () => {
                    checkpoint = null;
                    return { ok: false, phase: 'apply', rolledBack: true, error };
                };
                let restored;
                try {
                    restored = operation.restore(snapshot);
                } catch (rollbackError) {
                    return keepCheckpoint(rollbackError);
                }
                // restore() may surface its persistence promise. Reporting
                // rolledBack on the synchronous return would claim recovery
                // from the very storage failure that forced the rollback.
                if (restored && typeof restored.then === 'function') {
                    return Promise.resolve(restored).then(settle, keepCheckpoint);
                }
                return settle();
            };
            try {
                const value = operation.apply(snapshot);
                if (value && typeof value.then === 'function') {
                    // apply() surfaced its persistence promise — commit only
                    // once the writes confirm, and roll back on rejection so a
                    // real IO failure cannot report a successful import.
                    return Promise.resolve(value).then(finalize, rollback);
                }
                return finalize(value);
            } catch (error) {
                return rollback(error);
            }
        }

        function undo() {
            if (!checkpoint) return { ok: false, phase: 'undo', message: 'No import undo is available.' };
            const active = checkpoint;
            // The checkpoint is only cleared once the restore writes confirm;
            // a failed undo must stay retryable.
            const settle = () => {
                checkpoint = null;
                return {
                    ok: true,
                    phase: 'undone',
                    restored: active.snapshot,
                    summary: active.summary,
                    createdAt: active.createdAt
                };
            };
            const fail = (error) => ({ ok: false, phase: 'undo', error, canRetry: true });
            let restored;
            try {
                restored = active.restore(active.snapshot);
            } catch (error) {
                return fail(error);
            }
            if (restored && typeof restored.then === 'function') {
                return Promise.resolve(restored).then(settle, fail);
            }
            return settle();
        }

        return Object.freeze({
            run,
            undo,
            hasUndo: () => checkpoint !== null,
            inspect: () => checkpoint ? {
                summary: checkpoint.summary,
                createdAt: checkpoint.createdAt
            } : null
        });
    }

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    core.createSettingsImportTransaction = createSettingsImportTransaction;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createSettingsImportTransaction };
    }
})();
