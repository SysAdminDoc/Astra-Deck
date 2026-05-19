(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createApiLimiter) return;

    function numberOption(value, fallback, floor = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(floor, parsed) : fallback;
    }

    function createApiLimiter(options = {}) {
        const defaults = {
            capacity: numberOption(options.capacity, 4, 1),
            refillMs: numberOption(options.refillMs, 1000, 0),
            maxQueue: numberOption(options.maxQueue, 100, 1),
            jitterMs: numberOption(options.jitterMs, 100, 0),
            now: typeof options.now === 'function' ? options.now : () => Date.now(),
            setTimeout: typeof options.setTimeout === 'function'
                ? options.setTimeout
                : (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : (callback) => { callback(); return 0; }),
            clearTimeout: typeof options.clearTimeout === 'function'
                ? options.clearTimeout
                : (typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout.bind(globalThis) : () => {})
        };
        const buckets = new Map();

        function getBucket(key) {
            const bucketKey = String(key || 'default');
            if (!buckets.has(bucketKey)) {
                buckets.set(bucketKey, {
                    key: bucketKey,
                    tokens: defaults.capacity,
                    updatedAt: defaults.now(),
                    queue: [],
                    running: false,
                    timer: null,
                    backoffUntil: 0
                });
            }
            return buckets.get(bucketKey);
        }

        function refill(bucket) {
            if (defaults.refillMs === 0) {
                bucket.tokens = defaults.capacity;
                bucket.updatedAt = defaults.now();
                return;
            }
            const elapsed = defaults.now() - bucket.updatedAt;
            if (elapsed < defaults.refillMs) return;
            const restored = Math.floor(elapsed / defaults.refillMs);
            bucket.tokens = Math.min(defaults.capacity, bucket.tokens + restored);
            bucket.updatedAt += restored * defaults.refillMs;
        }

        function scheduleDrain(bucket, delay = 0) {
            if (bucket.timer) return;
            const jitter = delay > 0 && defaults.jitterMs ? Math.floor(Math.random() * defaults.jitterMs) : 0;
            bucket.timer = defaults.setTimeout(() => {
                bucket.timer = null;
                drain(bucket);
            }, Math.max(0, delay + jitter));
        }

        function finish(bucket) {
            bucket.running = false;
            if (bucket.queue.length) scheduleDrain(bucket, 0);
        }

        function drain(bucket) {
            if (bucket.running || !bucket.queue.length) return;
            refill(bucket);

            const waitForBackoff = bucket.backoffUntil - defaults.now();
            if (waitForBackoff > 0) {
                scheduleDrain(bucket, waitForBackoff);
                return;
            }

            if (bucket.tokens <= 0) {
                const refillDelay = defaults.refillMs || 0;
                scheduleDrain(bucket, refillDelay);
                return;
            }

            const item = bucket.queue.shift();
            bucket.tokens -= 1;
            bucket.running = true;

            Promise.resolve()
                .then(item.task)
                .then(item.resolve)
                .catch((error) => {
                    const backoffMs = Number(item.options?.backoffMs) || 0;
                    if (backoffMs > 0) {
                        bucket.backoffUntil = Math.max(bucket.backoffUntil, defaults.now() + backoffMs);
                    }
                    item.reject(error);
                })
                .finally(() => finish(bucket));
        }

        function run(key, task, taskOptions = {}) {
            if (typeof task !== 'function') {
                return Promise.reject(new TypeError('API limiter tasks must be functions.'));
            }
            const bucket = getBucket(key);
            if (bucket.queue.length >= defaults.maxQueue) {
                return Promise.reject(new Error(`API limiter queue "${bucket.key}" is full.`));
            }
            return new Promise((resolve, reject) => {
                bucket.queue.push({
                    task,
                    resolve,
                    reject,
                    options: taskOptions
                });
                scheduleDrain(bucket, 0);
            });
        }

        function getState(key = 'default') {
            const bucket = getBucket(key);
            refill(bucket);
            return {
                key: bucket.key,
                tokens: bucket.tokens,
                queued: bucket.queue.length,
                running: bucket.running,
                backoffUntil: bucket.backoffUntil
            };
        }

        function _rejectQueuedTasks(bucket) {
            // Pending tasks must reject so awaiters don't hang forever.
            // Previously clear() dropped the queue and the held promises
            // never resolved or rejected — a silent resource leak whenever
            // a feature destroyed its limiter mid-flight.
            if (!bucket || !bucket.queue.length) return;
            const drained = bucket.queue;
            bucket.queue = [];
            for (const item of drained) {
                try {
                    item.reject(new Error('API limiter cleared'));
                } catch (_) {
                    // reason: caller's reject handler may itself throw;
                    // we still want to reject every other queued item.
                }
            }
        }

        function clear(key) {
            if (typeof key === 'undefined') {
                for (const bucket of buckets.values()) {
                    if (bucket.timer) defaults.clearTimeout(bucket.timer);
                    _rejectQueuedTasks(bucket);
                }
                buckets.clear();
                return;
            }
            const bucket = buckets.get(String(key));
            if (bucket?.timer) defaults.clearTimeout(bucket.timer);
            _rejectQueuedTasks(bucket);
            buckets.delete(String(key));
        }

        return Object.freeze({
            run,
            schedule: run,
            getState,
            clear
        });
    }

    const apiLimiter = createApiLimiter();

    Object.assign(core, {
        createApiLimiter,
        apiLimiter
    });
})();
