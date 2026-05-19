(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createFeatureRegistry) return;

    function createFeatureRegistry(options = {}) {
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        const logger = options.logger || console;
        const features = new Map();
        const health = new Map();
        const cleanups = new Map();

        function normalizeId(id) {
            return String(id || '').trim();
        }

        function assertFeature(feature) {
            if (!feature || typeof feature !== 'object') {
                throw new TypeError('Feature registry entries must be objects.');
            }
            const id = normalizeId(feature.id);
            if (!id) {
                throw new TypeError('Feature registry entries require a stable id.');
            }
            return id;
        }

        function setHealth(id, patch = {}) {
            const featureId = normalizeId(id);
            if (!featureId) return null;
            const previous = health.get(featureId) || {
                id: featureId,
                status: 'registered',
                lastError: null,
                updatedAt: now()
            };
            const next = {
                ...previous,
                ...patch,
                id: featureId,
                updatedAt: now()
            };
            health.set(featureId, next);
            return { ...next };
        }

        function getHealth(id) {
            const featureId = normalizeId(id);
            const entry = featureId ? health.get(featureId) : null;
            return entry ? { ...entry } : null;
        }

        function getHealthSnapshot() {
            return Array.from(health.values(), (entry) => ({ ...entry }));
        }

        function register(feature, registerOptions = {}) {
            const id = assertFeature(feature);
            if (features.has(id) && !registerOptions.replace) {
                throw new Error(`Feature "${id}" is already registered.`);
            }
            features.set(id, feature);
            setHealth(id, {
                category: feature.category || null,
                status: 'registered',
                lastError: null
            });
            return feature;
        }

        function get(id) {
            return features.get(normalizeId(id)) || null;
        }

        function has(id) {
            return features.has(normalizeId(id));
        }

        function getAll() {
            return Array.from(features.values());
        }

        function addCleanup(id, cleanup) {
            const featureId = normalizeId(id);
            if (!featureId || typeof cleanup !== 'function') return () => {};
            const list = cleanups.get(featureId) || [];
            list.push(cleanup);
            cleanups.set(featureId, list);
            let removed = false;
            return () => {
                if (removed) return;
                removed = true;
                const activeList = cleanups.get(featureId);
                if (!activeList) return;
                const index = activeList.indexOf(cleanup);
                if (index >= 0) activeList.splice(index, 1);
                if (!activeList.length) cleanups.delete(featureId);
            };
        }

        function runCleanups(id) {
            const featureId = normalizeId(id);
            const list = featureId ? cleanups.get(featureId) : null;
            if (!list?.length) return { ok: true, errors: [] };
            const errors = [];
            while (list.length) {
                const cleanup = list.pop();
                try {
                    cleanup();
                } catch (error) {
                    errors.push(error);
                    logger?.error?.('[YTKit] Feature cleanup error:', error);
                }
            }
            cleanups.delete(featureId);
            if (errors.length) {
                setHealth(featureId, {
                    status: 'cleanup-error',
                    lastError: String(errors[errors.length - 1]?.message || errors[errors.length - 1] || 'Cleanup failed')
                });
            }
            return { ok: errors.length === 0, errors };
        }

        function destroy(id) {
            const featureId = normalizeId(id);
            if (!featureId) return false;
            const feature = features.get(featureId);
            const errors = [];

            if (typeof feature?.destroy === 'function') {
                try {
                    feature.destroy();
                } catch (error) {
                    errors.push(error);
                    logger?.error?.('[YTKit] Feature destroy error:', error);
                }
            }

            const cleanupResult = runCleanups(featureId);
            errors.push(...cleanupResult.errors);
            setHealth(featureId, {
                status: errors.length ? 'destroy-error' : 'destroyed',
                lastError: errors.length ? String(errors[errors.length - 1]?.message || errors[errors.length - 1]) : null
            });
            return errors.length === 0;
        }

        function unregister(id, unregisterOptions = {}) {
            const featureId = normalizeId(id);
            if (!featureId || !features.has(featureId)) return false;
            if (unregisterOptions.destroy) destroy(featureId);
            features.delete(featureId);
            cleanups.delete(featureId);
            setHealth(featureId, { status: 'unregistered', lastError: null });
            return true;
        }

        function clear() {
            for (const id of features.keys()) destroy(id);
            features.clear();
            cleanups.clear();
        }

        return Object.freeze({
            register,
            unregister,
            get,
            getAll,
            has,
            addCleanup,
            runCleanups,
            destroy,
            setHealth,
            getHealth,
            getHealthSnapshot,
            clear
        });
    }

    const featureRegistry = createFeatureRegistry();

    Object.assign(core, {
        createFeatureRegistry,
        featureRegistry,
        registerFeature: featureRegistry.register,
        unregisterFeature: featureRegistry.unregister,
        getRegisteredFeature: featureRegistry.get,
        getRegisteredFeatures: featureRegistry.getAll,
        addFeatureCleanup: featureRegistry.addCleanup,
        destroyRegisteredFeature: featureRegistry.destroy,
        setFeatureHealth: featureRegistry.setHealth,
        getFeatureHealth: featureRegistry.getHealth,
        getFeatureHealthSnapshot: featureRegistry.getHealthSnapshot
    });
})();
