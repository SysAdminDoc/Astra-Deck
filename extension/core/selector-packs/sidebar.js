(() => {
    'use strict';

    // extension/core/selector-packs/sidebar.js
    //
    // Watch-page secondary column. Container for related videos,
    // live chat frame, and any secondary engagement panel. Distinct
    // from `relatedSidebar` (which is the related-videos renderer
    // INSIDE this container).

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('sidebar')) return;

    registry.set('sidebar', Object.freeze({
        surface: 'sidebar',
        stable: Object.freeze(['#secondary', 'ytd-watch-flexy #secondary']),
        fallback: Object.freeze(['#secondary.style-scope', 'ytd-watch-flexy[is-two-columns_] #secondary']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: false,
        needsFreshCapture: false,
        notes: 'Watch sidebar container for related, chat, and secondary panels.'
    }));
})();
