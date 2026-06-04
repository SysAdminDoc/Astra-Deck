(() => {
    'use strict';

    // extension/core/selector-packs/liveChatPlaceholder.js
    //
    // Canary surface for top-level pages where the live chat iframe
    // exists in the DOM but the chat document is isolated from the
    // top-level frame's scripts (so the `liveChat` surface above
    // would never resolve from here). Used by feature code to detect
    // "chat is available but I'm not the right frame" without
    // touching iframe internals.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('liveChatPlaceholder')) return;

    registry.set('liveChatPlaceholder', Object.freeze({
        surface: 'liveChatPlaceholder',
        stable: Object.freeze(['ytd-live-chat-frame', '#chat']),
        fallback: Object.freeze(['iframe#chatframe', 'ytd-live-chat-frame iframe']),
        captureEvidence: Object.freeze([
            'mhtml/LiveChat.mhtml',
            'docs/selector-fixture-workflow.md#watch-page-wrapper-probe'
        ]),
        lastVerified: '2026-06-04',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Placeholder canary verified by rendered watch-page DOM probe; iframe internals are capture-backed by LiveChat.mhtml.'
    }));
})();
