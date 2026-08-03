(() => {
    'use strict';

    // extension/core/selector-packs/nav.js
    //
    // Owns both 'nav' and the 'masthead' alias. The two surfaces have
    // shared a selector list since v3.6.0 and YouTube has never split
    // the masthead from the rest of the top nav, so they ship as one
    // pack with a shared selector spine.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('nav')) return;

    const stable = Object.freeze(['ytd-masthead', '#masthead-container']);
    const fallback = Object.freeze(['ytd-masthead div.style-scope', '#masthead-container div.style-scope']);
    const captureEvidence = Object.freeze([
        'mhtml/WatchPage.mhtml',
        'mhtml/YouTube.mhtml',
        'Subscriptions - YouTube.mhtml',
        'Worldwide Societal Collapse... - YouTube.mhtml',
        'mhtml/SearchResults.mhtml'
    ]);
    const hooks = Object.freeze({
        createButton: Object.freeze({
            stable: Object.freeze([
                'ytd-masthead #buttons ytd-button-renderer:has(path[d^="M12 3a1 1 0 00-1 1v7H4"])',
                'ytd-masthead #buttons ytd-button-renderer:has(svg path[d^="M12 3a1 1 0 00-1 1v7H4"])'
            ]),
            fallback: Object.freeze([
                'ytd-masthead ytd-button-renderer:has(button[aria-label="Create"])'
            ])
        })
    });

    registry.set('nav', Object.freeze({
        surface: 'nav',
        stable: stable,
        fallback: fallback,
        captureEvidence: captureEvidence,
        lastVerified: '2026-06-05',
        highChurn: false,
        needsFreshCapture: false,
        hooks,
        notes: 'Top navigation and masthead actions.'
    }));

    registry.set('masthead', Object.freeze({
        surface: 'masthead',
        stable: stable,
        fallback: fallback,
        captureEvidence: captureEvidence,
        lastVerified: '2026-06-05',
        highChurn: false,
        needsFreshCapture: false,
        hooks,
        notes: 'Alias for nav so feature code can use either term.'
    }));
})();
