(() => {
    'use strict';

    // extension/core/selector-packs/playerSettings.js
    //
    // Player settings gear + open panel. Prefer MAIN-world player APIs
    // where they exist instead of forcing the settings menu open via
    // DOM click — opening the panel triggers focus side effects and
    // hides the player chrome.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('playerSettings')) return;

    registry.set('playerSettings', Object.freeze({
        surface: 'playerSettings',
        stable: Object.freeze(['.ytp-settings-button', '.ytp-panel', '.ytp-menuitem']),
        fallback: Object.freeze([
            '.ytp-popup',
            '.ytp-panel-menu',
            '.ytp-overflow-panel',
            '#movie_player .ytp-panel-menu'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Avoid forced menu opening where MAIN APIs exist.'
    }));
})();
