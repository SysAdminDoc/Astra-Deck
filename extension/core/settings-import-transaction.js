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
            try {
                const value = operation.apply(snapshot);
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
            } catch (error) {
                try {
                    operation.restore(snapshot);
                    checkpoint = null;
                    return { ok: false, phase: 'apply', rolledBack: true, error };
                } catch (rollbackError) {
                    // Retain a retryable checkpoint when immediate rollback
                    // fails. A later Undo attempt can still restore the exact
                    // pre-import snapshot instead of losing the recovery path.
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
                }
            }
        }

        function undo() {
            if (!checkpoint) return { ok: false, phase: 'undo', message: 'No import undo is available.' };
            try {
                checkpoint.restore(checkpoint.snapshot);
                const restored = checkpoint.snapshot;
                const summary = checkpoint.summary;
                const createdAt = checkpoint.createdAt;
                checkpoint = null;
                return { ok: true, phase: 'undone', restored, summary, createdAt };
            } catch (error) {
                return { ok: false, phase: 'undo', error, canRetry: true };
            }
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
