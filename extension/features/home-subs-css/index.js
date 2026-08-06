(() => {
    'use strict';

    // extension/features/home-subs-css/index.js
    //
    // v4.43.0 bundled peel for CSS-only "Home / Subscriptions"
    // features that share the cssFeature() helper's static-CSS
    // pattern. Each builder is parameter-less; the value of the peel
    // is centralising the CSS strings + their parity guards so a
    // future redesign (Premium-only thumbnail hover preview, etc.)
    // is a one-file edit instead of an inline literal hunt.
    //
    // Schema keys touched (all default off):
    //   hideCreateButton, hideVoiceSearch, widenSearchBar,
    //   disablePlayOnHover, fullWidthSubscriptions,
    //   hideSubscriptionOptions, listFeedLayout

    function buildHideCreateButtonCss() {
        const core = globalThis.YTKitCore;
        const chain = core?.getSurfaceHookSelectorChain?.('nav', 'createButton');
        if (Array.isArray(chain) && chain.length) return chain.join(', ');
        // The leading "+" glyph is stable across locales and is more
        // specific than the masthead button row, which also holds Sign in.
        return 'ytd-masthead #buttons ytd-button-renderer:has(path[d^="M12 3a1 1 0 00-1 1v7H4"])';
    }

    function buildHideVoiceSearchCss() {
        return '#voice-search-button';
    }

    function buildWidenSearchBarCss() {
        return `ytd-masthead yt-searchbox { margin-left: -180px; margin-right: -300px; }`;
    }

    function buildDisablePlayOnHoverCss() {
        return `ytd-video-preview, #preview, #mouseover-overlay,
                    ytd-moving-thumbnail-renderer,
                    ytd-thumbnail-overlay-loading-preview-renderer {
                        display: none !important;
                    }`;
    }

    function buildFullWidthSubscriptionsCss() {
        return `ytd-browse[page-subtype="subscriptions"] #grid-container.ytd-two-column-browse-results-renderer {
                        max-width: 100% !important;
                    }`;
    }

    function buildHideSubscriptionOptionsCss() {
        return 'ytd-browse[page-subtype="subscriptions"] ytd-rich-section-renderer:has(.grid-subheader)';
    }

    function buildListFeedLayoutCss() {
        return `
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer {
                display: flex !important;
                flex-direction: column !important;
                gap: 12px !important;
                width: 100% !important;
            }
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row,
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row > #contents,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row > #contents {
                display: contents !important;
            }
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-item-renderer,
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row ytd-rich-item-renderer,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-item-renderer,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row ytd-rich-item-renderer,
            ytd-search[page-subtype="search"] ytd-video-renderer,
            ytd-search[page-subtype="search"] yt-lockup-view-model {
                display: block !important;
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible,
            ytd-browse[page-subtype="home"] yt-lockup-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model,
            ytd-search[page-subtype="search"] yt-lockup-view-model {
                display: grid !important;
                grid-template-columns: minmax(180px, min(32vw, 360px)) minmax(0, 1fr) !important;
                align-items: start !important;
                column-gap: 16px !important;
                width: 100% !important;
                min-width: 0 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible > #thumbnail,
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible > ytd-thumbnail,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible > #thumbnail,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible > ytd-thumbnail,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible > #thumbnail,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible > ytd-thumbnail,
            ytd-browse[page-subtype="home"] yt-lockup-view-model > yt-thumbnail-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model > yt-thumbnail-view-model,
            ytd-search[page-subtype="search"] yt-lockup-view-model > yt-thumbnail-view-model,
            ytd-browse[page-subtype="home"] yt-lockup-view-model > a.yt-lockup-view-model__content-image,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model > a.yt-lockup-view-model__content-image,
            ytd-search[page-subtype="search"] yt-lockup-view-model > a.yt-lockup-view-model__content-image {
                grid-column: 1 !important;
                grid-row: 1 !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: none !important;
                margin: 0 !important;
                aspect-ratio: 16 / 9 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible > #details,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible > #details,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible > #details,
            ytd-browse[page-subtype="home"] yt-lockup-view-model > yt-lockup-metadata-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model > yt-lockup-metadata-view-model,
            ytd-search[page-subtype="search"] yt-lockup-view-model > yt-lockup-metadata-view-model {
                grid-column: 2 !important;
                grid-row: 1 !important;
                min-width: 0 !important;
                padding: 4px 0 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #video-title,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #video-title,
            ytd-search[page-subtype="search"] ytd-video-renderer #video-title,
            ytd-browse[page-subtype="home"] yt-lockup-view-model a[title],
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model a[title],
            ytd-search[page-subtype="search"] yt-lockup-view-model a[title] {
                display: -webkit-box !important;
                -webkit-box-orient: vertical !important;
                -webkit-line-clamp: 3 !important;
                overflow: hidden !important;
                white-space: normal !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #metadata-line,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #metadata-line,
            ytd-search[page-subtype="search"] ytd-video-renderer #metadata-line,
            ytd-browse[page-subtype="home"] yt-lockup-metadata-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-metadata-view-model,
            ytd-search[page-subtype="search"] yt-lockup-metadata-view-model {
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }
            @media (max-width: 700px) {
                ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible,
                ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible,
                ytd-search[page-subtype="search"] ytd-video-renderer #dismissible,
                ytd-browse[page-subtype="home"] yt-lockup-view-model,
                ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model,
                ytd-search[page-subtype="search"] yt-lockup-view-model {
                    grid-template-columns: minmax(128px, 38vw) minmax(0, 1fr) !important;
                    column-gap: 10px !important;
                }
            }
        `;
    }

    function createLifecycleSpec(id, category, buildCss, pageScopes = ['all']) {
        const factory = globalThis.YTKitCore
            && typeof globalThis.YTKitCore.createCssLifecycleSpec === 'function'
            && globalThis.YTKitCore.createCssLifecycleSpec;
        if (factory) return factory({ id, category, buildCss, pageScopes });
        return {
            id,
            category,
            buildCss,
            pageScopes: Object.freeze([...pageScopes]),
            init() { /* reason: styles core helper unavailable in this context */ },
            destroy() { /* reason: styles core helper unavailable in this context */ }
        };
    }

    // v4.47.0 NF5 wave 3: lifecycle specs for the home-subs CSS-only
    // feature ids this module owns. These specs now own style injection
    // and body-class teardown via core/styles.js; ytkit.js's cssFeature()
    // is only the compatibility wrapper/fallback.
    const LIFECYCLE_SPECS = Object.freeze([
        createLifecycleSpec('hideCreateButton',        'nav',          buildHideCreateButtonCss,        ['all']),
        createLifecycleSpec('hideVoiceSearch',         'nav',          buildHideVoiceSearchCss,         ['all']),
        createLifecycleSpec('widenSearchBar',          'shell',        buildWidenSearchBarCss,          ['all']),
        createLifecycleSpec('disablePlayOnHover',      'shorts',       buildDisablePlayOnHoverCss,      ['home', 'subscriptions', 'search', 'channel']),
        createLifecycleSpec('fullWidthSubscriptions',  'shell',        buildFullWidthSubscriptionsCss,  ['subscriptions']),
        createLifecycleSpec('hideSubscriptionOptions', 'watch-player', buildHideSubscriptionOptionsCss, ['subscriptions']),
        createLifecycleSpec('listFeedLayout',           'feed',         buildListFeedLayoutCss,          ['home', 'subscriptions', 'search']),
    ]);

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.homeSubsCss = Object.freeze({
        buildHideCreateButtonCss,
        buildHideVoiceSearchCss,
        buildWidenSearchBarCss,
        buildDisablePlayOnHoverCss,
        buildFullWidthSubscriptionsCss,
        buildHideSubscriptionOptionsCss,
        buildListFeedLayoutCss,
        LIFECYCLE_SPECS
    });

    try {
        if (globalThis.YTKitCore && typeof globalThis.YTKitCore.getLifecycle === 'function') {
            const lc = globalThis.YTKitCore.getLifecycle();
            for (const spec of LIFECYCLE_SPECS) {
                try {
                    lc.defineFeature(spec);
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
            buildHideCreateButtonCss,
            buildHideVoiceSearchCss,
            buildWidenSearchBarCss,
            buildDisablePlayOnHoverCss,
            buildFullWidthSubscriptionsCss,
            buildHideSubscriptionOptionsCss,
            buildListFeedLayoutCss,
            LIFECYCLE_SPECS
        };
    }
})();
