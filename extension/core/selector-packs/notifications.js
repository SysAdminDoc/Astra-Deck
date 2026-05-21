(() => {
    'use strict';

    // extension/core/selector-packs/notifications.js
    //
    // Notification bell + popup list. The bell wraps a
    // `yt-icon-badge-shape` that frequently churns its generated
    // class suffix; the popup root is the multi-page-menu renderer.
    // Always wait for the popup root before sorting or transforming
    // individual renderers.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('notifications')) return;

    registry.set('notifications', Object.freeze({
        surface: 'notifications',
        stable: Object.freeze([
            'ytd-notification-topbar-button-renderer',
            'yt-icon-badge-shape',
            'ytd-notification-renderer'
        ]),
        fallback: Object.freeze([
            '.ytd-notification-topbar-button-renderer .badge-shape-wiz',
            'ytd-multi-page-menu-renderer ytd-notification-renderer'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'mhtml/YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Wait for popup menu root before sorting or transforming notifications.'
    }));
})();
