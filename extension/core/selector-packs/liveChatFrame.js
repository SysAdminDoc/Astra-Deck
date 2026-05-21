(() => {
    'use strict';

    // extension/core/selector-packs/liveChatFrame.js
    //
    // Watch-page wrapper for the live chat iframe. needsFreshCapture
    // stays true because the current MHTMLs don't preserve the live
    // chat iframe internals — see roadmap.md "Add live-chat iframe
    // capture workflow" for the v5.1.0+ follow-up.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('liveChatFrame')) return;

    registry.set('liveChatFrame', Object.freeze({
        surface: 'liveChatFrame',
        stable: Object.freeze(['ytd-live-chat-frame#chat', 'ytd-live-chat-frame', 'iframe#chatframe']),
        fallback: Object.freeze(['#chat.ytd-live-chat-frame', 'ytd-live-chat-frame iframe']),
        // No usable evidence in current captures — the MHTMLs don't
        // include the iframe contents. Reference the placeholder
        // capture spec instead.
        captureEvidence: Object.freeze(['ROADMAP.md#live-chat-iframe-capture-workflow']),
        lastVerified: null,
        highChurn: true,
        needsFreshCapture: true,
        notes: 'Watch-page live chat frame; raw captures do not include full live chat internals.'
    }));
})();
