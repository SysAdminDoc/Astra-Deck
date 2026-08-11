(() => {
    'use strict';

    // extension/core/selector-packs/shortsShelf.js
    //
    // Shorts shelf + player action bar. URL path (`/shorts`) is the most
    // stable signal for the shelf — the wrapper class churns constantly and
    // `ytd-reel-shelf-renderer` keeps re-appearing under different names.
    // The player hook is kept here because Shorts uses the same route-owned
    // surface while recycling reel renderers during vertical navigation.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('shortsShelf')) return;

    const hooks = Object.freeze({
        'action.dislike': Object.freeze({
            stable: Object.freeze([
                'ytd-reel-video-renderer[is-active] reel-action-bar-view-model dislike-button-view-model',
                'ytd-reel-video-renderer reel-action-bar-view-model dislike-button-view-model'
            ]),
            fallback: Object.freeze([
                'ytd-reel-video-renderer dislike-button-view-model',
                'reel-action-bar-view-model dislike-button-view-model'
            ])
        })
    });

    registry.set('shortsShelf', Object.freeze({
        surface: 'shortsShelf',
        stable: Object.freeze(['a[href^="/shorts"]', 'ytd-rich-shelf-renderer']),
        fallback: Object.freeze(['yt-thumbnail-overlay-badge-view-model', 'ytd-reel-shelf-renderer']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml',
            'mhtml/Shorts.mhtml'
        ]),
        lastVerified: '2026-06-05',
        highChurn: true,
        needsFreshCapture: false,
        hooks,
        notes: 'URL path is more stable than shelf wrapper names; action.dislike targets the current Shorts reel action bar.'
    }));
})();
