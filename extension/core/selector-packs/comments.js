(() => {
    'use strict';

    // extension/core/selector-packs/comments.js
    //
    // YouTube comments root. Keep the old `ytd-comment-renderer` +
    // new `ytd-comment-view-model` shapes both present in the chain
    // because the comments A/B rollout switches users between them
    // mid-session.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('comments')) return;

    registry.set('comments', Object.freeze({
        surface: 'comments',
        stable: Object.freeze(['ytd-comments', 'ytd-comment-thread-renderer', 'ytd-comment-view-model']),
        fallback: Object.freeze(['ytd-comment-thread-renderer.style-scope', 'ytd-comment-renderer']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Keep old and new comment shapes during A/B transition.'
    }));
})();
