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
        const categoryCleanups = new Map();

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

        function getValueType(value) {
            if (Array.isArray(value)) return 'array';
            if (value === null) return 'null';
            return typeof value;
        }

        function getControlType(feature, defaultValue) {
            if (feature?.type) return feature.type;
            const valueType = getValueType(defaultValue);
            if (valueType === 'boolean') return 'toggle';
            if (valueType === 'number') return 'range';
            if (valueType === 'string') return 'text';
            if (valueType === 'array') return 'list';
            if (valueType === 'object') return 'json';
            return 'value';
        }

        function createSchemaEntry(feature, defaultSource, options = {}) {
            const key = normalizeId(feature?.settingKey || feature?.id || options.key);
            if (!key) return null;
            const hasDefault = Object.prototype.hasOwnProperty.call(defaultSource, key);
            const defaultValue = hasDefault ? defaultSource[key] : undefined;
            return {
                key,
                featureId: feature?.id || null,
                name: feature?.name || options.name || key,
                description: feature?.description || options.description || '',
                nameKey: feature?.nameKey || options.nameKey || null,
                descriptionKey: feature?.descriptionKey || options.descriptionKey || null,
                category: feature?.category || feature?.group || options.category || null,
                control: getControlType(feature, defaultValue),
                valueType: getValueType(defaultValue),
                defaultValue,
                hasDefault,
                pages: Array.isArray(feature?.pages) ? [...feature.pages] : null,
                dependsOn: feature?.dependsOn || null,
                parentId: feature?.parentId || null,
                isSubFeature: !!feature?.isSubFeature,
                source: feature?.source || options.source || 'registry'
            };
        }

        function createSettingsSchema(defaults = {}, options = {}) {
            const defaultSource = defaults && typeof defaults === 'object' && !Array.isArray(defaults)
                ? defaults
                : {};
            const seenKeys = new Set();
            const entries = [];

            for (const feature of features.values()) {
                const entry = createSchemaEntry(feature, defaultSource);
                if (!entry) continue;
                seenKeys.add(entry.key);
                entries.push(entry);
            }

            for (const key of Object.keys(defaultSource)) {
                if (seenKeys.has(key)) continue;
                const entry = createSchemaEntry(null, defaultSource, {
                    key,
                    name: key,
                    category: key.startsWith('_') ? 'Internal' : 'Uncatalogued',
                    source: 'defaults'
                });
                if (entry) entries.push(entry);
            }

            return {
                settingsVersion: Number.isFinite(options.settingsVersion) ? options.settingsVersion : null,
                featureCount: features.size,
                entryCount: entries.length,
                entries
            };
        }

        function register(feature, registerOptions = {}) {
            const id = assertFeature(feature);
            if (features.has(id) && !registerOptions.replace) {
                throw new Error(`Feature "${id}" is already registered.`);
            }
            // Audit pass: when replacing an already-registered feature without
            // having destroyed it first, drop any orphaned per-feature cleanups
            // so we don't leak them onto the new feature's destroy() call.
            // Category cleanups are intentionally preserved — those are
            // category-level lifecycle, not per-feature.
            if (features.has(id) && registerOptions.replace) {
                if (cleanups.has(id)) cleanups.delete(id);
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

        function normalizeCategory(category) {
            return normalizeId(category) || 'Uncategorized';
        }

        function getFeatureCategory(feature) {
            return normalizeCategory(feature?.category || feature?.group);
        }

        function addCategoryCleanup(category, cleanup) {
            const categoryId = normalizeCategory(category);
            if (typeof cleanup !== 'function') return () => {};
            const list = categoryCleanups.get(categoryId) || [];
            list.push(cleanup);
            categoryCleanups.set(categoryId, list);
            let removed = false;
            return () => {
                if (removed) return;
                removed = true;
                const activeList = categoryCleanups.get(categoryId);
                if (!activeList) return;
                const index = activeList.indexOf(cleanup);
                if (index >= 0) activeList.splice(index, 1);
                if (!activeList.length) categoryCleanups.delete(categoryId);
            };
        }

        function runCategoryCleanups(category) {
            const categoryId = normalizeCategory(category);
            const list = categoryCleanups.get(categoryId);
            if (!list?.length) return { ok: true, errors: [] };
            const errors = [];
            while (list.length) {
                const cleanup = list.pop();
                try {
                    cleanup();
                } catch (error) {
                    errors.push(error);
                    logger?.error?.('[YTKit] Category cleanup error:', error);
                }
            }
            categoryCleanups.delete(categoryId);
            return { ok: errors.length === 0, errors };
        }

        function destroyCategory(category) {
            const categoryId = normalizeCategory(category);
            const errors = [];
            for (const feature of features.values()) {
                if (getFeatureCategory(feature) !== categoryId) continue;
                if (!destroy(feature.id)) {
                    const entry = health.get(feature.id);
                    errors.push(entry?.lastError || `Destroy failed for ${feature.id}`);
                }
            }
            const cleanupResult = runCategoryCleanups(categoryId);
            errors.push(...cleanupResult.errors);
            return { ok: errors.length === 0, errors };
        }

        function getCategoryHealthSnapshot() {
            const categories = new Map();
            const ensureCategory = (categoryId) => {
                if (!categories.has(categoryId)) {
                    categories.set(categoryId, {
                        category: categoryId,
                        featureCount: 0,
                        initializedCount: 0,
                        cleanupCount: categoryCleanups.get(categoryId)?.length || 0,
                        statuses: Object.create(null)
                    });
                }
                return categories.get(categoryId);
            };

            for (const feature of features.values()) {
                const categoryId = getFeatureCategory(feature);
                const summary = ensureCategory(categoryId);
                const entry = health.get(feature.id);
                const status = entry?.status || 'registered';
                summary.featureCount += 1;
                if (entry?.initialized || feature._initialized) summary.initializedCount += 1;
                summary.statuses[status] = (summary.statuses[status] || 0) + 1;
            }

            for (const categoryId of categoryCleanups.keys()) {
                ensureCategory(categoryId);
            }

            return Array.from(categories.values(), (summary) => ({
                ...summary,
                statuses: { ...summary.statuses }
            }));
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
            for (const category of categoryCleanups.keys()) runCategoryCleanups(category);
            features.clear();
            cleanups.clear();
            categoryCleanups.clear();
            // Drop health entries too — otherwise getHealthSnapshot() reports
            // ghost features forever after a full registry reset.
            health.clear();
        }

        return Object.freeze({
            register,
            unregister,
            get,
            getAll,
            has,
            addCleanup,
            addCategoryCleanup,
            runCleanups,
            runCategoryCleanups,
            destroy,
            destroyCategory,
            setHealth,
            getHealth,
            getHealthSnapshot,
            getCategoryHealthSnapshot,
            createSettingsSchema,
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
        addCategoryCleanup: featureRegistry.addCategoryCleanup,
        destroyRegisteredFeature: featureRegistry.destroy,
        destroyFeatureCategory: featureRegistry.destroyCategory,
        setFeatureHealth: featureRegistry.setHealth,
        getFeatureHealth: featureRegistry.getHealth,
        getFeatureHealthSnapshot: featureRegistry.getHealthSnapshot,
        getCategoryHealthSnapshot: featureRegistry.getCategoryHealthSnapshot,
        generateSettingsSchema: featureRegistry.createSettingsSchema
    });
})();
