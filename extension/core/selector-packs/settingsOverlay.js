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
        stable: Object.freeze(['#ytkit-settings-panel', '[data-ytkit-surface="control-center"]', '.ytkit-control-center', '#ytkit-panel']),
        fallback: Object.freeze(['.ytkit-panel', '.ytkit-modal']),
        // Astra-owned surface — the "evidence" is the source file
        // that owns the overlay markup, not an MHTML capture.
        // 2026-07-09: the rendered smoke (scripts/smoke-settings-overlay.js)
        // verified the live overlay root is #ytkit-settings-panel; the older
        // stable entries did not match the rendered DOM.
        captureEvidence: Object.freeze(['extension/ytkit.js#createControlCenter']),
        lastVerified: '2026-07-09',
        highChurn: false,
        needsFreshCapture: false,
        notes: 'Astra-owned UI must remain scoped and removable.'
    }));
})();
