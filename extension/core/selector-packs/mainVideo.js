(() => {
    'use strict';

    // extension/core/selector-packs/mainVideo.js
    //
    // The main `<video>` element. Always scope queries through the
    // current player root — global `video` matches in-feed inline
    // previews and Shorts player elements that aren't the
    // currently-watching media.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('mainVideo')) return;

    registry.set('mainVideo', Object.freeze({
        surface: 'mainVideo',
        stable: Object.freeze(['video.html5-main-video', '#movie_player video']),
        fallback: Object.freeze(['video.video-stream', '.html5-video-container video']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml',
            'mhtml/EmbedPlayer.mhtml'
        ]),
        lastVerified: '2026-06-05',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Main media element; should stay scoped to the current player.'
    }));
})();
