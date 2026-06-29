(() => {
    'use strict';

    // extension/core/selector-packs/feedExperimentChips.js
    //
    // Feed filter/category chips are high-churn because YouTube uses them
    // for home, search, and experiment-driven custom feed pivots. Keep this
    // as a standalone canary so chip-bar drift is visible even if the main
    // feed grid still resolves.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('feedExperimentChips')) return;

    registry.set('feedExperimentChips', Object.freeze({
        surface: 'feedExperimentChips',
        stable: Object.freeze(['yt-chip-cloud-chip-renderer', 'yt-chip-cloud-renderer', 'ytd-feed-filter-chip-bar-renderer']),
        fallback: Object.freeze(['ytd-rich-grid-renderer yt-chip-cloud-chip-renderer', 'ytd-rich-grid-renderer ytd-feed-filter-chip-bar-renderer']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'mhtml/SearchResults.mhtml'
        ]),
        lastVerified: '2026-06-29',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Category chips and prompt-generated feed pivots recycle cards without route events.'
    }));
})();
