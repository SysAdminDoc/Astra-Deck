(() => {
    'use strict';

    // extension/core/selector-packs/player.js
    //
    // HTML5 player root. ISOLATED-world content scripts must never
    // reach into `window.movie_player` directly — that global lives in
    // MAIN world. Use ytkit-main.js (the MAIN-world bridge) for player
    // API calls; this selector resolves the DOM root only.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('player')) return;

    registry.set('player', Object.freeze({
        surface: 'player',
        stable: Object.freeze(['#movie_player', '.html5-video-player']),
        fallback: Object.freeze(['ytd-player #movie_player', '#player-container #movie_player']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml',
            'mhtml/EmbedPlayer.mhtml'
        ]),
        lastVerified: '2026-06-05',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Use window.movie_player only from the MAIN-world bridge.'
    }));
})();
