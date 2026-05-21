(() => {
    'use strict';

    // extension/core/selector-packs/thumbnail.js
    //
    // Thumbnail surface inside a feed card. Always resolve from the
    // nearest card root — querying document-wide picks up unrelated
    // floating thumbnails (preview popovers, end screens, etc.) and
    // burns mutation budget.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('thumbnail')) return;

    registry.set('thumbnail', Object.freeze({
        surface: 'thumbnail',
        stable: Object.freeze(['ytd-thumbnail', 'yt-thumbnail-view-model', 'a#thumbnail']),
        fallback: Object.freeze(['ytThumbnailViewModelHost', 'ytd-thumbnail a#thumbnail']),
        captureEvidence: Object.freeze([
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Resolve from nearest card root before querying document-wide.'
    }));
})();
