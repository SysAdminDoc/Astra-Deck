(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.isTopLevelFrame) return;

    function isTopLevelFrame() {
        try {
            return window.top === window;
        } catch (_) {
            return false;
        }
    }

    function isLiveChatPath(path = window.location.pathname) {
        return String(path).startsWith('/live_chat');
    }

    function isLiveChatFrame() {
        return isLiveChatPath();
    }

    function shouldBuildPrimaryUI() {
        return isTopLevelFrame() && !isLiveChatFrame();
    }

    function hasExtensionContext() {
        try {
            return !!chrome.runtime?.id;
        } catch (_) {
            return false;
        }
    }

    // 'private', 'regular' or 'unknown'. Content code reads the browser's own
    // extension.inIncognitoContext (the userscript adapter fills it from the
    // manager's GM_info.isIncognito). Anything that isn't a boolean is
    // unknown, and unknown is treated like private: automatic records stay in
    // memory rather than risk landing in regular storage.
    function privateContextState() {
        try {
            const flag = chrome.extension?.inIncognitoContext;
            if (typeof flag === 'boolean') return flag ? 'private' : 'regular';
        } catch (_) {
            // reason: an invalidated context reads as unknown
        }
        return 'unknown';
    }

    Object.assign(core, {
        hasExtensionContext,
        privateContextState,
        isLiveChatFrame,
        isLiveChatPath,
        isTopLevelFrame,
        shouldBuildPrimaryUI
    });
})();
