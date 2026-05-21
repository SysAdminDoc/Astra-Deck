(() => {
    'use strict';

    // extension/core/selector-packs/watch.js
    //
    // Watch page root. `ytd-watch-flexy[video-id]` is the best route-
    // state probe — the `video-id` attribute mutates on SPA navigation
    // and is observed by core/lifecycle-route-bridge.js to feed the
    // lifecycle route-token machinery.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('watch')) return;

    registry.set('watch', Object.freeze({
        surface: 'watch',
        stable: Object.freeze(['ytd-watch-flexy[video-id]', 'ytd-watch-flexy', 'ytd-watch-metadata', '#below']),
        fallback: Object.freeze(['ytd-watch-metadata.watch-active-metadata', 'ytd-watch-flexy[flexy]']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Route state is best read from ytd-watch-flexy[video-id].'
    }));
})();
