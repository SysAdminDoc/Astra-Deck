(() => {
    'use strict';

    // extension/core/selector-packs/liveChat.js
    //
    // Inside the live chat iframe (selectors only resolve when the
    // content script is loaded in the iframe context — see the
    // dedicated all-frames content_scripts entry in manifest.json).
    // needsFreshCapture stays true because the iframe DOM was never
    // captured.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('liveChat')) return;

    registry.set('liveChat', Object.freeze({
        surface: 'liveChat',
        stable: Object.freeze([
            'yt-live-chat-app',
            'yt-live-chat-renderer',
            'yt-live-chat-item-list-renderer'
        ]),
        fallback: Object.freeze([
            'yt-live-chat-text-message-renderer',
            'yt-live-chat-message-input-renderer'
        ]),
        captureEvidence: Object.freeze(['ROADMAP.md#live-chat-iframe-capture-workflow']),
        lastVerified: null,
        highChurn: true,
        needsFreshCapture: true,
        notes: 'Live chat iframe document surface; capture required before major live-chat rewrites.'
    }));
})();
