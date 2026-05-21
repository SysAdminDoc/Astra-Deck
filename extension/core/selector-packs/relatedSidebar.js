(() => {
    'use strict';

    // extension/core/selector-packs/relatedSidebar.js
    //
    // Watch-page "Up next" + related-videos sidebar. Always resolve
    // the section root first and process added nodes scoped to it —
    // the compact-card renderers under here churn aggressively.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('relatedSidebar')) return;

    registry.set('relatedSidebar', Object.freeze({
        surface: 'relatedSidebar',
        stable: Object.freeze([
            '#secondary ytd-watch-next-secondary-results-renderer',
            'ytd-watch-next-secondary-results-renderer'
        ]),
        fallback: Object.freeze([
            'ytd-watch-next-secondary-results-renderer.style-scope',
            '#related'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Related and compact cards change often; resolve section root first.'
    }));
})();
