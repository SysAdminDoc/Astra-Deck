(() => {
    'use strict';

    // Cross-browser extension API wrapper.
    //
    // Firefox has always exposed the standards-track `browser.*` namespace;
    // Chrome 148 ships it too. Resolution prefers `browser` and falls back
    // to `chrome`, so call sites stop caring which vendor namespace the
    // host provides. New code should consume `globalThis.YTKitBrowser`
    // (or `YTKitCore.createBrowserApi()` with an explicit scope in tests)
    // instead of touching `chrome.*` directly; existing direct call sites
    // migrate in bounded batches — sidepanel.js and popup.js use this wrapper;
    // background.js carries the equivalent inline resolver because service
    // workers cannot load this file as a classic page script.
    //
    // Loaded before every other core module in the manifest content-script
    // lists AND directly by popup.html / sidepanel.html / sidebar.html, so
    // extension pages and content scripts share one resolver.

    function resolveBrowserNamespace(scope = globalThis) {
        const standard = scope.browser;
        if (standard && standard.runtime) return standard;
        const vendor = scope.chrome;
        if (vendor && vendor.runtime) return vendor;
        return null;
    }

    function createBrowserApi(scope = globalThis) {
        const ns = resolveBrowserNamespace(scope);

        function call(target, method, args = []) {
            return new Promise((resolve, reject) => {
                if (!target || typeof target[method] !== 'function') {
                    reject(new Error(`Extension API unavailable: ${method}`));
                    return;
                }
                let settled = false;
                const finish = (handler, value) => {
                    if (settled) return;
                    settled = true;
                    handler(value);
                };
                const callback = (value) => {
                    const lastError = ns?.runtime?.lastError;
                    if (lastError) {
                        finish(reject, new Error(lastError.message || String(lastError)));
                        return;
                    }
                    finish(resolve, value);
                };
                try {
                    const result = target[method](...args, callback);
                    if (result && typeof result.then === 'function') {
                        result.then(
                            (value) => finish(resolve, value),
                            (error) => finish(reject, error)
                        );
                    }
                } catch (callbackError) {
                    // Standards-track `browser.*` implementations can reject
                    // callback-shaped overloads synchronously. Retry once with
                    // the Promise-only signature; Chromium stays on the first
                    // callback path and is never invoked twice.
                    try {
                        const result = target[method](...args);
                        if (result && typeof result.then === 'function') {
                            result.then(
                                (value) => finish(resolve, value),
                                (error) => finish(reject, error)
                            );
                        } else {
                            // Non-thenable, no throw: a void API with no
                            // callback parameter (e.g. downloads.show on
                            // Chromium). The retry succeeded — resolve.
                            finish(resolve, result);
                        }
                    } catch (promiseError) {
                        finish(reject, promiseError);
                    }
                }
            });
        }

        async function sendTabMessage(tabId, message, options = {}) {
            if (!ns?.tabs?.sendMessage || !tabId) return null;
            const timeoutMs = Math.max(250, Number(options.timeoutMs) || 2000);
            let timeoutId;
            const timeout = new Promise((resolve) => {
                timeoutId = setTimeout(() => resolve(null), timeoutMs);
            });
            try {
                const response = await Promise.race([
                    call(ns.tabs, 'sendMessage', [tabId, message]).catch(() => null),
                    timeout
                ]);
                return response ?? null;
            } finally {
                clearTimeout(timeoutId);
            }
        }
        return Object.freeze({
            ns,
            hasNamespace: Boolean(ns),
            runtime: ns?.runtime ?? null,
            storage: ns?.storage ?? null,
            tabs: ns?.tabs ?? null,
            permissions: ns?.permissions ?? null,
            downloads: ns?.downloads ?? null,
            i18n: ns?.i18n ?? null,
            call,
            sendTabMessage
        });
    }

    if (!globalThis.YTKitBrowser) {
        globalThis.YTKitBrowser = createBrowserApi();
    }
    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (!core.createBrowserApi) {
        core.createBrowserApi = createBrowserApi;
        core.resolveBrowserNamespace = resolveBrowserNamespace;
    }
})();
