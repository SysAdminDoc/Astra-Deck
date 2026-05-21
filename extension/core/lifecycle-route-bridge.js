(() => {
    'use strict';

    // extension/core/lifecycle-route-bridge.js
    //
    // v4.9.0 SPA-navigation bridge. Hooks YouTube's navigation event
    // stream (driven by core/navigation.js's addNavigateRule) into the
    // v4.7.0 feature-lifecycle singleton so every yt-navigate-finish /
    // yt-page-data-updated / popstate / watch-flexy[video-id] change
    // increments the lifecycle route token exactly once.
    //
    // Why bridging matters: any future feature that adopts the lifecycle
    // contract can capture lc.getRouteToken() at the start of an async
    // op (transcript fetch, DeArrow branding lookup, RYD ratio call) and
    // compare on completion to drop stale results from the previous
    // route. Without this bridge each feature would have to subscribe to
    // navigation directly and remember to call notifyRouteChange().
    //
    // The bridge is idempotent and degrades gracefully — if either
    // dependency is missing (because the module hasn't loaded yet, or
    // because the bridge is required from Node tests in isolation) it
    // becomes a no-op rather than throwing.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.__lifecycleRouteBridgeInstalled) return;

    function installLifecycleRouteBridge(options = {}) {
        const logger = options.logger || console;
        const addNavigateRule = options.addNavigateRule || core.addNavigateRule;
        const getLifecycle = options.getLifecycle || core.getLifecycle;

        if (typeof addNavigateRule !== 'function') return false;
        if (typeof getLifecycle !== 'function') return false;

        addNavigateRule('astra-lifecycle-route-bridge', () => {
            try {
                getLifecycle().notifyRouteChange();
            } catch (e) {
                // reason: route-token bump must never propagate — feature
                // teardown observes the stale token instead.
                logger.warn?.('[Astra Deck] lifecycle route-bridge: ' + (e?.message || e));
            }
        });

        core.__lifecycleRouteBridgeInstalled = true;
        return true;
    }

    // Auto-install on production load (manifest order guarantees that
    // navigation.js + feature-lifecycle.js are present by this point).
    installLifecycleRouteBridge();

    core.installLifecycleRouteBridge = installLifecycleRouteBridge;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { installLifecycleRouteBridge };
    }
})();
