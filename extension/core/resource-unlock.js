(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createResourceUnlockBridge) return;

    const MAX_QUEUED_LOCKS = 128;

    function createResourceUnlockBridge(options = {}) {
        const root = options.root || globalThis;
        const documentRef = options.document || root.document;
        const lockManager = options.lockManager || root.navigator?.locks || null;
        const indexedDb = options.indexedDB || root.indexedDB || null;
        const PromiseCtor = options.Promise || root.Promise || Promise;
        const schedule = options.setTimeout || root.setTimeout?.bind(root) || setTimeout;
        const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

        const originalLockRequest = typeof lockManager?.request === 'function'
            ? lockManager.request
            : null;
        const idbPrototype = indexedDb?.constructor?.prototype || null;
        const originalIdbOpen = typeof idbPrototype?.open === 'function'
            ? idbPrototype.open
            : null;

        let installed = false;
        let enabled = false;
        let hidden = documentRef?.visibilityState === 'hidden';
        let lockPatched = false;
        let indexedDbPatched = false;
        let releasedLocks = 0;
        let droppedLocks = 0;
        let closedDatabases = 0;
        const queuedLocks = [];
        const heldLocks = new Set();
        const databases = new Set();

        function snapshot() {
            return Object.freeze({
                enabled,
                hidden,
                lockPatched,
                indexedDbPatched,
                activeLocks: heldLocks.size,
                queuedLocks: queuedLocks.length,
                releasedLocks,
                droppedLocks,
                trackedDatabases: databases.size,
                closedDatabases
            });
        }

        function report() {
            try { onStatus(snapshot()); } catch (_) {
                // reason: status reporting must never break resource release
            }
        }

        function releaseHeldLocks() {
            for (const entry of [...heldLocks]) {
                if (entry.released) continue;
                entry.released = true;
                releasedLocks += 1;
                entry.release();
            }
            report();
        }

        function wrapCallback(callback) {
            return function wrappedLockCallback(lock) {
                if (!lock) return callback.call(this, lock);
                let release;
                const releasePromise = new PromiseCtor((resolve) => { release = resolve; });
                const entry = { release, released: false };
                heldLocks.add(entry);

                let callbackResult;
                try {
                    callbackResult = callback.call(this, lock);
                } catch (error) {
                    heldLocks.delete(entry);
                    report();
                    throw error;
                }

                if (enabled && hidden && !entry.released) {
                    entry.released = true;
                    releasedLocks += 1;
                    entry.release();
                }
                report();
                return PromiseCtor.race([
                    PromiseCtor.resolve(callbackResult),
                    releasePromise
                ]).finally(() => {
                    heldLocks.delete(entry);
                    report();
                });
            };
        }

        function callNativeLock(args) {
            if (!originalLockRequest) return PromiseCtor.resolve(undefined);
            const nextArgs = Array.from(args);
            const callbackIndex = nextArgs.length - 1;
            if (typeof nextArgs[callbackIndex] === 'function') {
                nextArgs[callbackIndex] = wrapCallback(nextArgs[callbackIndex]);
            }
            try {
                return originalLockRequest.apply(lockManager, nextArgs);
            } catch (error) {
                return PromiseCtor.reject(error);
            }
        }

        function queueLock(args) {
            if (queuedLocks.length >= MAX_QUEUED_LOCKS) {
                // Replace the oldest queued request instead of silently
                // swallowing the newest: later lock requests reflect the
                // page's current state, and the displaced caller still gets
                // the same completed-without-running resolution it would have
                // received under the old drop-newest policy.
                const oldest = queuedLocks.shift();
                droppedLocks += 1;
                oldest.resolve(undefined);
            }
            return new PromiseCtor((resolve, reject) => {
                queuedLocks.push({ args: Array.from(args), resolve, reject });
                report();
            });
        }

        function flushQueuedLocks() {
            if (enabled && hidden) return;
            const pending = queuedLocks.splice(0, queuedLocks.length);
            report();
            for (const entry of pending) {
                callNativeLock(entry.args).then(entry.resolve, entry.reject);
            }
        }

        function closeDatabase(db) {
            if (!databases.has(db)) return;
            databases.delete(db);
            try {
                db.close();
                closedDatabases += 1;
            } catch (_) {
                // reason: a database may close itself between tracking and release
            }
            report();
        }

        function closeTrackedDatabases() {
            for (const db of [...databases]) closeDatabase(db);
        }

        function onIdbSuccess(event) {
            const db = event?.target?.result;
            if (!db || typeof db.close !== 'function') return;
            databases.add(db);
            try {
                db.addEventListener?.('close', () => {
                    databases.delete(db);
                    report();
                }, { once: true });
            } catch (_) {
                // reason: legacy IDBDatabase implementations may reject options
            }
            report();
            if (enabled && hidden) schedule(() => closeDatabase(db), 0);
        }

        function patchLocks() {
            if (!originalLockRequest || !lockManager) return;
            const wrapped = function resourceAwareLockRequest(...args) {
                if (enabled && hidden) return queueLock(args);
                return callNativeLock(args);
            };
            try {
                lockManager.request = wrapped;
                lockPatched = lockManager.request === wrapped;
            } catch (_) {
                lockPatched = false;
            }
        }

        function patchIndexedDb() {
            if (!idbPrototype || !originalIdbOpen) return;
            const wrapped = function resourceAwareIdbOpen(...args) {
                const request = originalIdbOpen.apply(this, args);
                request?.addEventListener?.('success', onIdbSuccess, { once: true });
                return request;
            };
            try {
                idbPrototype.open = wrapped;
                indexedDbPatched = idbPrototype.open === wrapped;
            } catch (_) {
                indexedDbPatched = false;
            }
        }

        function handleVisibilityChange() {
            hidden = documentRef?.visibilityState === 'hidden';
            if (enabled && hidden) {
                releaseHeldLocks();
                closeTrackedDatabases();
            } else if (!hidden) {
                flushQueuedLocks();
            }
            report();
        }

        function install() {
            if (installed) return snapshot();
            installed = true;
            patchLocks();
            patchIndexedDb();
            documentRef?.addEventListener?.('visibilitychange', handleVisibilityChange, true);
            report();
            return snapshot();
        }

        function setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            hidden = documentRef?.visibilityState === 'hidden';
            if (enabled && hidden) {
                releaseHeldLocks();
                closeTrackedDatabases();
            } else if (!enabled) {
                flushQueuedLocks();
            }
            report();
            return snapshot();
        }

        function destroy() {
            if (!installed) return;
            enabled = false;
            flushQueuedLocks();
            documentRef?.removeEventListener?.('visibilitychange', handleVisibilityChange, true);
            if (lockPatched && lockManager?.request) lockManager.request = originalLockRequest;
            if (indexedDbPatched && idbPrototype?.open) idbPrototype.open = originalIdbOpen;
            lockPatched = false;
            indexedDbPatched = false;
            // Do not release or discard foreground callbacks during teardown.
            // Their native lock requests must settle exactly as they would have
            // without Astra; each callback's finally handler removes its entry.
            databases.clear();
            installed = false;
            report();
        }

        return Object.freeze({ destroy, getStats: snapshot, install, setEnabled });
    }

    Object.assign(core, { createResourceUnlockBridge });
})();
