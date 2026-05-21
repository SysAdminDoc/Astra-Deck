(() => {
    'use strict';

    // extension/core/selector-packs/commentComposer.js
    //
    // Comment input box. Must preserve native accessibility behaviour
    // — never overwrite contenteditable focus handling or strip
    // YouTube's IME / paste handlers. Resolve from below `ytd-comments`
    // to avoid matching reply composers in distant threads.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('commentComposer')) return;

    registry.set('commentComposer', Object.freeze({
        surface: 'commentComposer',
        stable: Object.freeze(['ytd-comment-simplebox-renderer', 'ytd-commentbox', '#contenteditable-root']),
        fallback: Object.freeze([
            'ytd-comments ytd-comment-simplebox-renderer div.style-scope',
            'ytd-comment-simplebox-renderer #placeholder-area'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Prefer structural lookup below ytd-comments.'
    }));
})();
