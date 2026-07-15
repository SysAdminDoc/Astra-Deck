(() => {
    'use strict';

    const factory = globalThis.YTKitFeatures?.liveChat?.createLiveChatRuntime;
    const core = globalThis.YTKitCore;
    const browser = globalThis.YTKitBrowser?.ns;
    if (typeof factory !== 'function' || !core?.isLiveChatFrame?.() || !browser) return;

    const runtime = factory({ browser, core });
    globalThis.__YTKIT_LIVE_CHAT_RUNTIME__?.destroy?.();
    globalThis.__YTKIT_LIVE_CHAT_RUNTIME__ = runtime;
    void runtime.start().catch((error) => {
        console.warn('[Astra Deck] Live-chat runtime failed to start:', error);
        runtime.destroy();
    });
})();
