(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.getVideoId) return;

    let cachedVideoId = null;
    let cachedHref = '';
    let cachedSearchHref = '';
    let cachedSearchParams = null;

    function getUrlSearchParams() {
        const href = window.location.href;
        if (href !== cachedSearchHref) {
            cachedSearchHref = href;
            cachedSearchParams = new URLSearchParams(window.location.search);
        }
        return cachedSearchParams;
    }

    function getUrlParam(name) {
        return getUrlSearchParams().get(name);
    }

    function getVideoId() {
        const href = window.location.href;
        if (href === cachedHref) return cachedVideoId;
        cachedHref = href;
        cachedVideoId = getUrlParam('v');
        return cachedVideoId;
    }

    Object.assign(core, {
        getUrlParam,
        getUrlSearchParams,
        getVideoId
    });
})();
