(() => {
    'use strict';

    // extension/core/selector-packs/media.js
    //
    // Generic media resolver — `<video>` / `<img>` / `<ytd-thumbnail>` /
    // `yt-thumbnail-view-model` anywhere under `#content`. Last-resort
    // surface; feature code should prefer the more specific
    // `thumbnail`, `mainVideo`, or `feedCard` packs instead.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('media')) return;

    registry.set('media', Object.freeze({
        surface: 'media',
        stable: Object.freeze(['video', 'img', 'ytd-thumbnail', 'yt-thumbnail-view-model']),
        fallback: Object.freeze(['#content video', '#content img', '#content ytd-thumbnail']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml',
            'mhtml/Shorts.mhtml'
        ]),
        lastVerified: '2026-06-05',
        highChurn: false,
        needsFreshCapture: false,
        notes: 'Generic media resolver; prefer feature-specific roots.'
    }));
})();
