(() => {
    'use strict';

    // extension/core/feature-lifecycle.js
    //
    // v5.0.0 contract module for features that want the full lifecycle
    // discipline laid out in ROADMAP.md:
    //
    //   init(ctx)    — wire observers/listeners, apply current state
    //   apply(ctx, value) — hot-apply a new setting value without
    //                       tearing the feature down
    //   destroy(ctx) — fully reverse init: DOM, observers, listeners,
    //                  timers, async work, body/html classes, injected
    //                  styles, storage listeners.
    //
    // Each feature instance carries:
    //   - id (string, must match a settings-schema key)
    //   - category (must match a CATEGORIES entry)
    //   - dependencies (other feature ids; resolved at start())
    //   - AbortController-backed signal so async work in init/apply can
    //     cancel cleanly on destroy or on SPA route change
    //   - a monotonic route token incremented on every SPA navigation;
    //     stale tokens drop their results
    //
    // The lifecycle does NOT subsume the existing core/registry.js —
    // registry handles cleanup buckets + health snapshots and stays the
    // low-level primitive. Features built on the new contract can keep
    // registering cleanups via registry; the lifecycle wraps the contract
    // so feature authors don't hand-roll the same boilerplate.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createLifecycle) return;

    const schemaScope = (typeof window !== 'undefined' && window.__YTKIT_SETTINGS_SCHEMA__)
        || (typeof module !== 'undefined' && module.exports && (function tryLoad() {
            try { return require('./settings-schema'); } catch (_) { return null; }
        })());

    const CATEGORIES = schemaScope ? schemaScope.CATEGORIES : null;

    function createLifecycle(options = {}) {
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        const logger = options.logger || console;
        const features = new Map();
        let routeToken = 0;

        function assertSpec(spec) {
            if (!spec || typeof spec !== 'object') {
                throw new TypeError('Lifecycle spec must be an object.');
            }
            if (typeof spec.id !== 'string' || !spec.id) {
                throw new TypeError('Lifecycle spec.id is required.');
            }
            if (typeof spec.init !== 'function') {
                throw new TypeError(`Lifecycle spec.init missing for "${spec.id}".`);
            }
            if (typeof spec.destroy !== 'function') {
                throw new TypeError(`Lifecycle spec.destroy missing for "${spec.id}".`);
            }
            if (CATEGORIES && spec.category && !CATEGORIES.includes(spec.category)) {
                throw new RangeError(
                    `Lifecycle spec.category "${spec.category}" is not in CATEGORIES (id=${spec.id}).`
                );
            }
        }

        function getRouteToken() {
            return routeToken;
        }

        function bumpRouteToken() {
            routeToken += 1;
            // Bumping the token signals to in-flight async work that
            // route-scoped results should be discarded. Features should
            // capture the token at the start of an async operation and
            // compare on completion.
            return routeToken;
        }

        function defineFeature(spec) {
            assertSpec(spec);
            if (features.has(spec.id)) {
                throw new Error(`Lifecycle feature "${spec.id}" already defined.`);
            }
            const record = {
                spec,
                started: false,
                controller: null,
                lastError: null,
                lastValue: undefined,
                startedAt: 0
            };
            features.set(spec.id, record);
            return record;
        }

        function getRecord(id) {
            const rec = features.get(id);
            if (!rec) throw new Error(`Lifecycle feature "${id}" not defined.`);
            return rec;
        }

        function buildContext(record, extra) {
            const controller = record.controller;
            return {
                id: record.spec.id,
                category: record.spec.category,
                signal: controller ? controller.signal : null,
                routeToken: getRouteToken(),
                ...extra
            };
        }

        function start(id, ctxExtra) {
            const record = getRecord(id);
            if (record.started) return;
            record.controller = new AbortController();
            record.startedAt = now();
            const ctx = buildContext(record, ctxExtra);
            try {
                record.spec.init(ctx);
                record.started = true;
            } catch (e) {
                record.lastError = e;
                logger.warn?.(`[lifecycle] init failed for ${id}: ${e?.message || e}`);
                // Abort to free any partially-attached async work.
                try { record.controller.abort(); } catch (_) { /* reason: controller may be torn down */ }
                throw e;
            }
        }

        function apply(id, value, ctxExtra) {
            const record = getRecord(id);
            if (!record.started) {
                // apply() on a not-yet-started feature is a no-op; the
                // value is captured so a subsequent start() can pick it up.
                record.lastValue = value;
                return;
            }
            record.lastValue = value;
            if (typeof record.spec.apply !== 'function') return;
            const ctx = buildContext(record, ctxExtra);
            try {
                record.spec.apply(ctx, value);
            } catch (e) {
                record.lastError = e;
                logger.warn?.(`[lifecycle] apply failed for ${id}: ${e?.message || e}`);
                throw e;
            }
        }

        function destroy(id, ctxExtra) {
            const record = getRecord(id);
            if (!record.started) return;
            // Abort first so any in-flight async observes the cancellation
            // before destroy() runs synchronous teardown.
            try { record.controller && record.controller.abort(); }
            catch (_) { /* reason: controller may already be torn down */ }
            const ctx = buildContext(record, ctxExtra);
            try {
                record.spec.destroy(ctx);
            } catch (e) {
                record.lastError = e;
                logger.warn?.(`[lifecycle] destroy failed for ${id}: ${e?.message || e}`);
                // Do not rethrow — destroy must be best-effort so callers
                // can always tear a feature down even if a sub-step fails.
            }
            record.started = false;
            record.controller = null;
        }

        // Convenience for the SPA navigation observer: bump the token and
        // give callers a chance to re-evaluate their route-scoped state.
        function notifyRouteChange() {
            return bumpRouteToken();
        }

        function snapshot() {
            const out = [];
            for (const [id, record] of features) {
                out.push({
                    id,
                    category: record.spec.category || null,
                    started: record.started,
                    startedAt: record.startedAt,
                    lastError: record.lastError ? String(record.lastError) : null,
                    routeToken: getRouteToken()
                });
            }
            return out;
        }

        return {
            defineFeature, start, apply, destroy,
            getRouteToken, notifyRouteChange, snapshot,
            // Expose for tests that need to introspect the registry.
            _features: features
        };
    }

    core.createLifecycle = createLifecycle;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createLifecycle };
    }
})();
