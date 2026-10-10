(() => {
    'use strict';

    // Hide AI Chapters, isolated-world half.
    //
    // The work happens in the page world: core/auto-chapters.js takes the
    // auto-generated chapters out of each watch response before YouTube
    // renders it, reached through the sealed bridge. This half publishes the
    // switch, and hides the AI chapters panel with CSS for the one case the
    // response filter can't reach, the first video of a hard load (the bridge
    // only publishes once the page has already rendered it).
    //
    // Creator chapters live in a different panel
    // (engagement-panel-macro-markers-description-chapters) and are never
    // touched.

    const ENABLE_ATTR = 'data-ytkit-hide-auto-chapters';
    const STYLE_ID = 'hideAutoChapters';
    const PANEL_ID = 'engagement-panel-macro-markers-auto-chapters';

    function buildHideAutoChaptersCss() {
        return `ytd-engagement-panel-section-list-renderer[target-id="${PANEL_ID}"] { display: none !important; }`;
    }

    function createHideAutoChaptersFeature(deps = {}) {
        const {
            injectStyle = () => ({ remove() {} }),
            publishBridgeAttribute = () => {},
            clearBridgeAttribute = () => {},
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'hideAutoChapters',
            name: t('feature_hideAutoChapters_name', 'Hide AI Chapters'),
            description: t('feature_hideAutoChapters_desc', 'Removes the chapters YouTube generates on its own, from the progress bar and the chapters panel. Chapters the creator wrote in the description stay.'),
            group: 'Watch Page',
            icon: 'list',
            _styleEl: null,

            init() {
                this._styleEl = injectStyle(buildHideAutoChaptersCss(), STYLE_ID, true);
                publishBridgeAttribute(ENABLE_ATTR, 'on');
            },

            destroy() {
                clearBridgeAttribute(ENABLE_ATTR);
                this._styleEl?.remove?.();
                this._styleEl = null;
            }
        };
    }

    const api = Object.freeze({
        createHideAutoChaptersFeature,
        buildHideAutoChaptersCss,
        ENABLE_ATTR,
        PANEL_ID
    });
    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.hideAutoChapters = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
