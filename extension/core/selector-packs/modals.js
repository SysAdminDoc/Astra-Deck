(() => {
    'use strict';

    // extension/core/selector-packs/modals.js
    //
    // YouTube native dialogs + iron-dropdown popups. The
    // `tp-yt-paper-dialog` shell is from Polymer's paper-dialog; the
    // `tp-yt-iron-dropdown` shell is the share/menu dropdown. Both
    // sit under `ytd-popup-container`. Astra overlays must keep
    // focus-safe + inert behaviour when these are active.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('modals')) return;

    registry.set('modals', Object.freeze({
        surface: 'modals',
        stable: Object.freeze([
            'tp-yt-paper-dialog',
            'ytd-popup-container tp-yt-paper-dialog',
            'tp-yt-iron-dropdown'
        ]),
        fallback: Object.freeze([
            '.ytp-popup',
            '.ytd-popup-container',
            'ytd-popup-container .style-scope'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'mhtml/YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Native YouTube popups and dialogs.'
    }));
})();
