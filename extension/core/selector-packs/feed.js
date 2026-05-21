(() => {
    'use strict';

    // extension/core/selector-packs/feed.js
    //
    // Home / subscriptions / browse feed root. Filter chips can
    // recycle feed content without firing yt-navigate-finish, so any
    // observer mounted here MUST process added nodes incrementally
    // (no full-document scan per mutation).

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('feed')) return;

    registry.set('feed', Object.freeze({
        surface: 'feed',
        stable: Object.freeze(['ytd-browse ytd-rich-grid-renderer', 'ytd-rich-grid-renderer']),
        fallback: Object.freeze(['ytd-rich-grid-renderer.style-scope', '#contents.ytd-rich-grid-renderer']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Process added nodes only; filter chips can recycle grid content without route events.'
    }));
})();
