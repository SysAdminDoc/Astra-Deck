(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('subscriptions')) return;

    registry.set('subscriptions', Object.freeze({
        surface: 'subscriptions',
        stable: Object.freeze([
            'ytd-browse ytd-rich-grid-renderer',
            'ytd-rich-grid-renderer ytd-rich-item-renderer[lockup]',
            'ytd-rich-item-renderer yt-lockup-view-model'
        ]),
        fallback: Object.freeze([
            'ytd-browse',
            'ytd-section-list-renderer ytd-video-renderer'
        ]),
        captureEvidence: Object.freeze(['Subscriptions - YouTube.mhtml']),
        lastVerified: '2026-07-14',
        highChurn: true,
        needsFreshCapture: false,
        canary: Object.freeze({
            routes: Object.freeze(['subscriptions']),
            featureIds: Object.freeze(['subscriptionGroups', 'hideVideosFromHome', 'deArrow'])
        }),
        notes: 'New lockup-view-model cards and classic video renderers are both supported; never replace native card semantics or actions.'
    }));
})();
