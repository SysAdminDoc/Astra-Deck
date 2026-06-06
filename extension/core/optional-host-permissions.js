(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createOptionalHostPermissions) return;

    function normalizeOrigins(origins) {
        if (!Array.isArray(origins)) return [];
        return Array.from(new Set(origins.filter((origin) =>
            typeof origin === 'string' && origin.trim()).map((origin) => origin.trim())));
    }

    function getDefaultPermissionsApi() {
        return globalThis.chrome?.permissions || globalThis.browser?.permissions || null;
    }

    function getDefaultRuntimeApi() {
        return globalThis.chrome?.runtime || globalThis.browser?.runtime || null;
    }

    function invokePermissionsMethod(api, runtime, methodName, payload) {
        if (!api || typeof api[methodName] !== 'function') {
            return Promise.reject(new Error('Optional host permissions API is unavailable'));
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const done = (value) => {
                if (settled) return;
                settled = true;
                const lastError = runtime?.lastError;
                if (lastError?.message) {
                    reject(new Error(lastError.message));
                    return;
                }
                resolve(Boolean(value));
            };
            try {
                const result = api[methodName](payload, done);
                if (result && typeof result.then === 'function') {
                    result.then(done, reject);
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    function createOptionalHostPermissions(options = {}) {
        const permissionsApi = options.permissionsApi || getDefaultPermissionsApi();
        const runtimeApi = options.runtimeApi || getDefaultRuntimeApi();

        function isSupported() {
            return Boolean(permissionsApi && typeof permissionsApi.request === 'function');
        }

        function contains(origins) {
            const normalized = normalizeOrigins(origins);
            if (!normalized.length) return Promise.resolve(true);
            return invokePermissionsMethod(permissionsApi, runtimeApi, 'contains', { origins: normalized });
        }

        function request(origins) {
            const normalized = normalizeOrigins(origins);
            if (!normalized.length) return Promise.resolve(true);
            return invokePermissionsMethod(permissionsApi, runtimeApi, 'request', { origins: normalized });
        }

        function remove(origins) {
            const normalized = normalizeOrigins(origins);
            if (!normalized.length) return Promise.resolve(true);
            return invokePermissionsMethod(permissionsApi, runtimeApi, 'remove', { origins: normalized });
        }

        function onAdded(listener) {
            if (!permissionsApi?.onAdded || typeof permissionsApi.onAdded.addListener !== 'function') return false;
            permissionsApi.onAdded.addListener(listener);
            return true;
        }

        function onRemoved(listener) {
            if (!permissionsApi?.onRemoved || typeof permissionsApi.onRemoved.addListener !== 'function') return false;
            permissionsApi.onRemoved.addListener(listener);
            return true;
        }

        return {
            contains,
            isSupported,
            onAdded,
            onRemoved,
            remove,
            request
        };
    }

    core.createOptionalHostPermissions = createOptionalHostPermissions;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createOptionalHostPermissions };
    }
})();
