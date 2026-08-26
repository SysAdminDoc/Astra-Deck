(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('searchResults')) return;

    registry.set('searchResults', Object.freeze({
        surface: 'searchResults',
        stable: Object.freeze([
            'ytd-search[page-subtype="search"]',
            'ytd-two-column-search-results-renderer[is-search]',
            'ytd-section-list-renderer[page-subtype="search"]'
        ]),
        fallback: Object.freeze([
            'ytd-search',
            'ytd-two-column-search-results-renderer'
        ]),
        captureEvidence: Object.freeze(['mhtml/SearchResults.mhtml']),
        lastVerified: '2026-07-14',
        highChurn: true,
        needsFreshCapture: false,
        canary: Object.freeze({
            routes: Object.freeze(['search']),
            featureIds: Object.freeze(['hideVideosFromHome', 'deArrow'])
        }),
        notes: 'Scope result hygiene to the search page; preserve filters, spelling corrections, and no-results renderers.'
    }));
})();
