(() => {
    'use strict';

    // extension/core/selector-packs/feedPlayables.js
    //
    // Playables/game shelves share feed real estate with video cards but use
    // separate card and shelf shells. Keep game-card tokens capture-backed so
    // hide/filter features do not silently miss Playables rollouts.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('feedPlayables')) return;

    registry.set('feedPlayables', Object.freeze({
        surface: 'feedPlayables',
        stable: Object.freeze(['ytd-mini-game-card-view-model', 'ytd-rich-shelf-renderer']),
        fallback: Object.freeze(['ytd-game-card-renderer', 'ytd-game-details-renderer', 'yt-mini-app-game-info-dialog-view-model', 'ytd-rich-grid-renderer ytd-rich-shelf-renderer']),
        captureEvidence: Object.freeze([
            'docs/selector-fixture-workflow.md#rendered-surface-probe',
            'mhtml/YouTube.mhtml',
            'mhtml/SearchResults.mhtml'
        ]),
        lastVerified: '2026-10-31',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Playables and mini-game shelves are capture-backed separately from organic video feed cards.'
    }));
})();
