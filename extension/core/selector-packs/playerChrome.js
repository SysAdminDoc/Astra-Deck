(() => {
    'use strict';

    // extension/core/selector-packs/playerChrome.js
    //
    // Player chrome (controls strip, progress bar, right controls).
    // The fallback list deliberately bundles legacy + new-player
    // ("Delhi modern", action-pill, overflow-panel) candidates so the
    // resolver still hits during the A/B transition. needsFreshCapture
    // stays false to match pre-peel behaviour even though roadmap.md
    // notes a fresh liquid-glass capture is desirable — flipping the
    // flag would change selector-health.js summary counts and belongs
    // in a separate slice paired with the actual fresh capture.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('playerChrome')) return;

    registry.set('playerChrome', Object.freeze({
        surface: 'playerChrome',
        stable: Object.freeze([
            '.ytp-chrome-bottom',
            '.ytp-right-controls',
            '.ytp-progress-bar',
            '.ytp-progress-bar-padding'
        ]),
        fallback: Object.freeze([
            '.ytp-delhi-modern .ytp-chrome-bottom',
            '.ytp-delhi-modern',
            '.ytp-overflow-panel',
            '.ytp-action-pill',
            '.ytp-actions-container'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml',
            'HARDENING.md#h21'
        ]),
        lastVerified: '2026-06-04',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Player redesign transition surface; 2026-06-04 DOM probe confirmed Delhi shell, overflow panel, and time-wrapper selectors.'
    }));
})();
