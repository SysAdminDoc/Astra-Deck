(() => {
    'use strict';

    // extension/core/selector-packs/feedCard.js
    //
    // Individual feed card root. The 2026-04-23 captures introduced the
    // `yt-lockup-view-model` element as a new card shape alongside the
    // older `ytd-rich-item-renderer` / `ytd-video-renderer`. Keep all
    // three present so the resolver hits whichever shape YouTube is
    // currently serving the user.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('feedCard')) return;

    registry.set('feedCard', Object.freeze({
        surface: 'feedCard',
        stable: Object.freeze(['ytd-rich-item-renderer', 'yt-lockup-view-model', 'ytd-video-renderer']),
        fallback: Object.freeze(['yt-lockup-view-model.ytd-rich-item-renderer', 'ytd-rich-item-renderer.style-scope']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml',
            'mhtml/SearchResults.mhtml',
            'mhtml/Channel.mhtml'
        ]),
        lastVerified: '2026-06-05',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'New lockup view-model appears in current captures.'
    }));
})();
