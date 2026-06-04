(() => {
    'use strict';

    // extension/core/selector-packs/liveChat.js
    //
    // Inside the live chat iframe (selectors only resolve when the
    // content script is loaded in the iframe context — see the
    // dedicated all-frames content_scripts entry in manifest.json).
    // Capture-backed by the popout live-chat MHTML fixture generated from
    // a currently active stream on 2026-06-04.

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
        captureEvidence: Object.freeze(['mhtml/LiveChat.mhtml']),
        lastVerified: '2026-06-04',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Live chat iframe document surface verified from a popout chat MHTML capture.'
    }));
})();
