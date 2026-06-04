(() => {
    'use strict';

    // extension/core/selector-packs/liveChatFrame.js
    //
    // Watch-page wrapper for the live chat iframe. The full watch-page
    // MHTML capture is too heavy for headless Chrome, but the wrapper
    // selectors were verified in the rendered watch-page DOM during the
    // same 2026-06-04 live-chat refresh that produced mhtml/LiveChat.mhtml.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('liveChatFrame')) return;

    registry.set('liveChatFrame', Object.freeze({
        surface: 'liveChatFrame',
        stable: Object.freeze(['ytd-live-chat-frame#chat', 'ytd-live-chat-frame', 'iframe#chatframe']),
        fallback: Object.freeze(['#chat.ytd-live-chat-frame', 'ytd-live-chat-frame iframe']),
        captureEvidence: Object.freeze([
            'mhtml/LiveChat.mhtml',
            'docs/selector-fixture-workflow.md#watch-page-wrapper-probe'
        ]),
        lastVerified: '2026-06-04',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Watch-page live chat frame verified by rendered DOM probe; iframe internals are capture-backed by LiveChat.mhtml.'
    }));
})();
