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
    // migrate in bounded batches — sidepanel.js first, popup.js and
    // background.js in follow-up batches.
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
        return Object.freeze({
            ns,
            hasNamespace: Boolean(ns),
            runtime: ns?.runtime ?? null,
            storage: ns?.storage ?? null,
            tabs: ns?.tabs ?? null,
            permissions: ns?.permissions ?? null,
            downloads: ns?.downloads ?? null,
            i18n: ns?.i18n ?? null
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
