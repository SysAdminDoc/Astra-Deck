(() => {
    'use strict';

    // extension/core/selector-packs/leftNav.js
    //
    // Left guide / sidebar / app drawer. The home capture renders the
    // mini-guide; subscriptions / watch capture render the full guide.
    // Keep both entry renderers in the fallback list.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('leftNav')) return;

    registry.set('leftNav', Object.freeze({
        surface: 'leftNav',
        stable: Object.freeze(['ytd-guide-renderer', 'ytd-mini-guide-renderer', 'yt-app-drawer']),
        fallback: Object.freeze([
            'ytd-mini-guide-entry-renderer.style-scope',
            'ytd-guide-entry-renderer.style-scope'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Subscriptions capture has full guide; home often has mini guide.'
    }));
})();
