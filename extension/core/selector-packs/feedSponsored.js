(() => {
    'use strict';

    // extension/core/selector-packs/feedSponsored.js
    //
    // Sponsored cards and ad-feedback wrappers change independently from
    // organic feed cards. Video-hiding and clean-feed features need a canary
    // that fails when YouTube renames the ad card shell while the normal
    // feedCard surface still passes.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('feedSponsored')) return;

    registry.set('feedSponsored', Object.freeze({
        surface: 'feedSponsored',
        stable: Object.freeze(['ytd-in-feed-ad-layout-renderer', 'ytd-ad-feedback-renderer', 'ytd-page-top-ad-layout-renderer']),
        fallback: Object.freeze(['ytd-rich-grid-renderer ytd-in-feed-ad-layout-renderer', 'ytd-promoted-video-renderer', 'ytd-display-ad-renderer']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'mhtml/SearchResults.mhtml'
        ]),
        lastVerified: '2026-06-29',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Sponsored-card and ad-feedback shells are tracked separately from organic feedCard selectors.'
    }));
})();
