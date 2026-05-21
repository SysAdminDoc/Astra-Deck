(() => {
    'use strict';

    // extension/core/selector-packs/appShell.js
    //
    // v4.31.0 first selector-pack split out of core/selectors.js. Each
    // file under selector-packs/ owns one surface (or a tightly aliased
    // pair) so we can roll a single surface back without touching the
    // others, and so capture provenance / last-verified dates live next
    // to the selectors themselves rather than buried in a 700-line map.
    //
    // The pack registers itself with globalThis.YTKitCore.SurfacePackRegistry
    // before core/selectors.js runs (manifest content_scripts loads
    // selector-packs/*.js first). selectors.js then merges every
    // registered pack into the SurfaceSelectorMap it exposes.
    //
    // Schema:
    //   { surface, stable, fallback, captureEvidence, lastVerified,
    //     highChurn, needsFreshCapture, notes }

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('appShell')) return;

    registry.set('appShell', Object.freeze({
        surface: 'appShell',
        stable: Object.freeze(['ytd-app', 'ytd-page-manager']),
        fallback: Object.freeze(['body > ytd-app', 'ytd-page-manager.style-scope']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'mhtml/YouTube.mhtml',
            'Subscriptions - YouTube.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: false,
        needsFreshCapture: false,
        notes: 'Primary SPA shell. Mount observers here only until target containers exist.'
    }));
})();
