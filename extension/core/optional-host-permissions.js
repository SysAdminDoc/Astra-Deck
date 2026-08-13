(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createOptionalHostPermissions) return;

    function normalizeOrigins(origins) {
        if (!Array.isArray(origins)) return [];
        return Array.from(new Set(origins.filter((origin) =>
            typeof origin === 'string' && origin.trim()).map((origin) => origin.trim())));
    }

    // Validate one exact filter-list permission pattern returned by
    // permissions.getAll(). This module is loaded by extension surfaces, not
    // the YouTube content-script startup path where the parser is unnecessary.
    function describeRemoteListOriginPattern(value) {
        const pattern = typeof value === 'string' ? value.trim() : '';
        const broadPattern = core.REMOTE_LIST_HOST_PATTERN || 'https://*/*';
        const describeUrl = core.describeRemoteListUrl;
        if (!pattern || pattern === broadPattern || !pattern.endsWith('/*')
            || typeof describeUrl !== 'function') {
            return { ok: false, reason: 'invalid-pattern' };
        }
        const described = describeUrl(pattern.slice(0, -1));
        if (!described.ok || described.originPattern !== pattern) {
            return { ok: false, reason: 'invalid-pattern' };
        }
        return described;
    }

    function getDefaultPermissionsApi() {
        return globalThis.YTKitBrowser?.permissions
            || globalThis.browser?.permissions
            || globalThis.chrome?.permissions
            || null;
    }

    function getDefaultRuntimeApi() {
        return globalThis.YTKitBrowser?.runtime
            || globalThis.browser?.runtime
            || globalThis.chrome?.runtime
            || null;
    }

    function invokePermissionsMethod(api, runtime, methodName, payload) {
        if (!api || typeof api[methodName] !== 'function') {
            return Promise.reject(new Error('Optional host permissions API is unavailable'));
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };
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
                    result.then(done, fail);
                }
            } catch (callbackError) {
                // Firefox's standards-track browser.* namespace can reject a
                // callback overload synchronously. Retry once with the
                // Promise-only signature; Chromium remains on the first path.
                try {
                    const result = api[methodName](payload);
                    if (result && typeof result.then === 'function') {
                        result.then(done, fail);
                    } else {
                        done(result);
                    }
                } catch (promiseError) {
                    fail(promiseError || callbackError);
                }
            }
        });
    }

    function invokePermissionsGetAll(api, runtime) {
        if (!api || typeof api.getAll !== 'function') {
            return Promise.reject(new Error('Optional host permissions API is unavailable'));
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const fail = (error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };
            const done = (value) => {
                if (settled) return;
                settled = true;
                const lastError = runtime?.lastError;
                if (lastError?.message) {
                    reject(new Error(lastError.message));
                    return;
                }
                resolve({
                    origins: normalizeOrigins(value?.origins),
                    permissions: normalizeOrigins(value?.permissions)
                });
            };
            try {
                const result = api.getAll(done);
                if (result && typeof result.then === 'function') {
                    result.then(done, fail);
                }
            } catch (callbackError) {
                try {
                    const result = api.getAll();
                    if (result && typeof result.then === 'function') {
                        result.then(done, fail);
                    } else {
                        done(result);
                    }
                } catch (promiseError) {
                    fail(promiseError || callbackError);
                }
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

        function getAll() {
            return invokePermissionsGetAll(permissionsApi, runtimeApi);
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
            getAll,
            isSupported,
            onAdded,
            onRemoved,
            remove,
            request
        };
    }

    core.createOptionalHostPermissions = createOptionalHostPermissions;
    core.describeRemoteListOriginPattern = describeRemoteListOriginPattern;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createOptionalHostPermissions, describeRemoteListOriginPattern };
    }
})();
