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
        stable: Object.freeze(['yt-searchbox', 'input#search', 'form[role="search"] input']),
        fallback: Object.freeze(['yt-searchbox-input', 'ytd-searchbox #container.ytd-searchbox']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Prefer roles and labels where present; avoid raw wrapper classes.'
    }));
})();
