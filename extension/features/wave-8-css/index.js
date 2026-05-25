(() => {
    'use strict';

    // extension/features/wave-8-css/index.js
    //
    // v4.38.0 bundled peel for five wave-8 CSS-only features that share
    // a single pattern: zero parameters, one static CSS string each.
    // The monolith block (cssFeature helper at ytkit.js:~4328) passes
    // the CSS through `injectStyle`. Centralising the strings here
    // gives them a single point of test coverage + makes them
    // reusable from any preview surface (future settings overlay,
    // popup live preview, etc.).
    //
    // Schema keys touched (all default off):
    //   hideNotificationButton (boolean)
    //   noFrostedGlass         (boolean)
    //   hideLatestPosts        (boolean)
    //   disableMiniPlayer      (boolean)
    //   nyanCatProgressBar     (boolean)

    function buildHideNotificationButtonCss() {
        return 'ytd-notification-topbar-button-renderer, ytd-topbar-menu-button-renderer:has(a[href="/notifications"]) { display: none !important; }';
    }

    function buildNoFrostedGlassCss() {
        return '* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
    }

    function buildHideLatestPostsCss() {
        return 'ytd-rich-section-renderer:has(ytd-post-renderer), ytd-rich-section-renderer:has(ytd-backstage-post-thread-renderer), ytd-post-renderer, ytd-backstage-post-thread-renderer, ytd-reel-shelf-renderer:has(ytd-backstage-post-thread-renderer) { display: none !important; }';
    }

    function buildDisableMiniPlayerCss() {
        return 'ytd-miniplayer[active] { display: none !important; } .ytp-miniplayer-button { display: none !important; }';
    }

    // Multi-rule CSS with a keyframes block. The interior whitespace
    // matches the monolith's template-literal indentation exactly so a
    // byte-stable parity check holds.
    function buildNyanCatProgressBarCss() {
        return `.ytp-play-progress {
                background: linear-gradient(180deg, #ff0000 0%, #ff9900 16.6%, #ffff00 33.3%, #33ff00 50%, #0099ff 66.6%, #6633ff 83.3%, #ff0000 100%) !important;
                background-size: 100% 600% !important;
                animation: ytkit-nyan-rainbow 1s linear infinite !important;
                height: 100% !important;
            }
            .ytp-scrubber-container .ytp-scrubber-button {
                background: radial-gradient(circle, #ff69b4, #ffcc00, #66ff66) !important;
                border-radius: 50% !important;
                width: 16px !important; height: 16px !important;
                box-shadow: 0 0 8px rgba(255,105,180,0.6) !important;
            }
            @keyframes ytkit-nyan-rainbow { 0% { background-position: 0% 0%; } 100% { background-position: 0% 100%; } }`;
    }

    // v4.47.0 NF5 wave 1: lifecycle specs for the five wave-8 CSS-only
    // feature ids this module owns. Register-only; inline ytkit.js
    // cssFeature() blocks still own init/destroy. Category sourced
    // from the settings-schema entries.
    const LIFECYCLE_SPECS = Object.freeze([
        { id: 'hideNotificationButton', category: 'comments'      },
        { id: 'noFrostedGlass',         category: 'shell'         },
        { id: 'hideLatestPosts',        category: 'feed'          },
        { id: 'disableMiniPlayer',      category: 'watch-player'  },
        { id: 'nyanCatProgressBar',     category: 'shell'         },
    ]);

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.wave8Css = Object.freeze({
        buildHideNotificationButtonCss,
        buildNoFrostedGlassCss,
        buildHideLatestPostsCss,
        buildDisableMiniPlayerCss,
        buildNyanCatProgressBarCss,
        LIFECYCLE_SPECS
    });

    try {
        if (globalThis.YTKitCore && typeof globalThis.YTKitCore.getLifecycle === 'function') {
            const lc = globalThis.YTKitCore.getLifecycle();
            for (const spec of LIFECYCLE_SPECS) {
                try {
                    lc.defineFeature({
                        id: spec.id,
                        category: spec.category,
                        init() { /* reason: wave-1 register-only; inline ytkit.js owns init */ },
                        destroy() { /* reason: wave-1 register-only; inline ytkit.js owns destroy */ }
                    });
                } catch (_) {
                    // reason: duplicate id from a prior load — safe to skip
                }
            }
        }
    } catch (_) {
        // reason: lifecycle unavailable in this context (e.g. test harness)
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildHideNotificationButtonCss,
            buildNoFrostedGlassCss,
            buildHideLatestPostsCss,
            buildDisableMiniPlayerCss,
            buildNyanCatProgressBarCss,
            LIFECYCLE_SPECS
        };
    }
})();
