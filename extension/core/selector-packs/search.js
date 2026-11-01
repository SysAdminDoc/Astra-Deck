(() => {
    'use strict';

    // extension/core/selector-packs/search.js
    //
    // Search box in the masthead. The component wrapper class
    // (`ytSearchboxComponent*`) churns frequently — keep the
    // role + element fallback list together so a hashed-class
    // refactor falls through cleanly.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('search')) return;

    registry.set('search', Object.freeze({
        surface: 'search',
        stable: Object.freeze(['yt-searchbox', 'yt-searchbox input[name="search_query"]']),
        fallback: Object.freeze(['input#search', 'form[role="search"] input', 'yt-searchbox-input', 'ytd-searchbox #container.ytd-searchbox']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml',
            'mhtml/SearchResults.mhtml'
        ]),
        lastVerified: '2026-10-31',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'The box opens with a hidden file input for image search, so name the field rather than the first input. Prefer roles and labels where present; avoid raw wrapper classes.'
    }));
})();
