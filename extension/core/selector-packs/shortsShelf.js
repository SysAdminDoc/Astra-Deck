(() => {
    'use strict';

    // extension/core/selector-packs/shortsShelf.js
    //
    // Shorts shelf + per-Shorts thumbnail. URL path (`/shorts`) is the
    // most stable signal — the shelf wrapper class churns constantly
    // and `ytd-reel-shelf-renderer` keeps re-appearing under different
    // names. Keep the URL-anchored selector first.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('shortsShelf')) return;

    registry.set('shortsShelf', Object.freeze({
        surface: 'shortsShelf',
        stable: Object.freeze(['a[href^="/shorts"]', 'ytd-rich-shelf-renderer']),
        fallback: Object.freeze(['yt-thumbnail-overlay-badge-view-model', 'ytd-reel-shelf-renderer']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'URL path is more stable than shelf wrapper names.'
    }));
})();
