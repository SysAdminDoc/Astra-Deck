(() => {
    'use strict';

    // extension/core/selector-packs/settingsOverlay.js
    //
    // Astra-owned in-page settings overlay. All selectors here MUST
    // be removable by the overlay's `destroy()` — `data-ytkit-*`
    // attributes and `.ytkit-*` classes are the only scoping
    // primitives allowed.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('settingsOverlay')) return;

    registry.set('settingsOverlay', Object.freeze({
        surface: 'settingsOverlay',
        stable: Object.freeze(['[data-ytkit-surface="control-center"]', '.ytkit-control-center', '#ytkit-panel']),
        fallback: Object.freeze(['.ytkit-panel', '.ytkit-modal']),
        // Astra-owned surface — the "evidence" is the source file
        // that owns the overlay markup, not an MHTML capture.
        captureEvidence: Object.freeze(['extension/ytkit.js#createControlCenter']),
        lastVerified: '2026-05-19',
        highChurn: false,
        needsFreshCapture: false,
        notes: 'Astra-owned UI must remain scoped and removable.'
    }));
})();
