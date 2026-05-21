(() => {
    'use strict';

    // extension/features/home-subs-css/index.js
    //
    // v4.43.0 bundled peel for six CSS-only "Home / Subscriptions"
    // features that share the cssFeature() helper's static-CSS
    // pattern. Each builder is parameter-less; the value of the peel
    // is centralising the CSS strings + their parity guards so a
    // future redesign (Premium-only thumbnail hover preview, etc.)
    // is a one-file edit instead of an inline literal hunt.
    //
    // Schema keys touched (all default off):
    //   hideCreateButton, hideVoiceSearch, widenSearchBar,
    //   disablePlayOnHover, fullWidthSubscriptions,
    //   hideSubscriptionOptions

    function buildHideCreateButtonCss() {
        return 'ytd-masthead ytd-button-renderer:has(button[aria-label="Create"])';
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

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.homeSubsCss = Object.freeze({
        buildHideCreateButtonCss,
        buildHideVoiceSearchCss,
        buildWidenSearchBarCss,
        buildDisablePlayOnHoverCss,
        buildFullWidthSubscriptionsCss,
        buildHideSubscriptionOptionsCss
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildHideCreateButtonCss,
            buildHideVoiceSearchCss,
            buildWidenSearchBarCss,
            buildDisablePlayOnHoverCss,
            buildFullWidthSubscriptionsCss,
            buildHideSubscriptionOptionsCss
        };
    }
})();
