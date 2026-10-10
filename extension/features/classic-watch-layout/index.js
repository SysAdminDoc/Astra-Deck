(() => {
    'use strict';

    // Classic Watch Layout, isolated-world half.
    //
    // YouTube's 2026-10 watch page test (comments and description in a
    // right-hand side panel, a recommendation grid under the player, no
    // theater button) is decided by ytcfg experiment flags and by properties
    // on the live ytd-watch-flexy. Both live in the page world, so the work
    // is core/classic-watch-layout.js, reached through the sealed bridge.
    // This half publishes the switch and the user's flag list, and hides the
    // left-hand Description/Comments/Ask rail with CSS so it is gone before
    // the page-world fix lands.

    const ENABLE_ATTR = 'data-ytkit-classic-watch-layout';
    const FLAGS_ATTR = 'data-ytkit-classic-watch-layout-flags';
    const FLAGS_KEY = 'watchLayoutFlagOverrides';
    const STYLE_ID = 'restoreClassicWatchLayout';
    const MAX_FLAG_TEXT = 4000;

    function buildClassicWatchLayoutCss() {
        return [
            'ytd-watch-flexy { --ytd-watch-flexy-fixed-side-menu-width: 0px !important; }',
            'ytd-watch-flexy #fixed-side-menu { display: none !important; }'
        ].join('\n');
    }

    function normalizeFlagText(value) {
        return String(value ?? '').slice(0, MAX_FLAG_TEXT).trim();
    }

    function createClassicWatchLayoutFeatures(deps = {}) {
        const {
            documentRef = typeof document !== 'undefined' ? document : null,
            injectStyle = () => ({ remove() {} }),
            publishBridgeAttribute = () => {},
            clearBridgeAttribute = () => {},
            readSetting = () => '',
            t = (_key, fallback) => fallback
        } = deps;

        const layoutFeature = {
            id: 'restoreClassicWatchLayout',
            name: t('feature_restoreClassicWatchLayout_name', 'Classic Watch Layout'),
            description: t('feature_restoreClassicWatchLayout_desc', 'Undoes the side-panel watch page YouTube started testing in October 2026. Comments and the description go back under the video, recommendations go back to the right and the theater button returns.'),
            group: 'Watch Page',
            icon: 'layout',
            _styleEl: null,
            _settingsHandler: null,

            _publishFlags() {
                const text = normalizeFlagText(readSetting(FLAGS_KEY));
                if (text) publishBridgeAttribute(FLAGS_ATTR, text);
                else clearBridgeAttribute(FLAGS_ATTR);
            },

            init() {
                this._styleEl = injectStyle(buildClassicWatchLayoutCss(), STYLE_ID, true);
                // The list goes first so the page world's first look at the
                // switch already has it.
                this._publishFlags();
                publishBridgeAttribute(ENABLE_ATTR, 'on');
                this._settingsHandler = (event) => {
                    const detail = event?.detail || {};
                    const keys = Array.isArray(detail.keys) ? detail.keys : [];
                    if (detail.key === FLAGS_KEY || keys.includes(FLAGS_KEY)) this._publishFlags();
                };
                documentRef?.addEventListener?.('ytkit-settings-changed', this._settingsHandler);
            },

            destroy() {
                if (this._settingsHandler) {
                    documentRef?.removeEventListener?.('ytkit-settings-changed', this._settingsHandler);
                }
                this._settingsHandler = null;
                clearBridgeAttribute(ENABLE_ATTR);
                clearBridgeAttribute(FLAGS_ATTR);
                this._styleEl?.remove?.();
                this._styleEl = null;
            }
        };

        const flagsFeature = {
            id: 'watchLayoutFlagOverrides',
            name: t('feature_watchLayoutFlagOverrides_name', 'Extra Layout Flags'),
            description: t('feature_watchLayoutFlagOverrides_desc', 'Astra already turns off the flags behind the side-panel page. Add a flag name per line to turn off more of them, or put a minus sign in front of one of Astra\'s to leave it on.'),
            group: 'Watch Page',
            icon: 'layout',
            isSubFeature: true,
            parentId: 'restoreClassicWatchLayout',
            type: 'textarea',
            settingKey: FLAGS_KEY,
            // i18n-static: example flag names, not prose
            placeholder: 'web_watch_hero_list\n-kevlar_watch_cinematics',
            dependsOn: 'restoreClassicWatchLayout',
            init() { /* the parent publishes the list on every settings change */ },
            destroy() { /* textarea, no runtime side effects of its own */ }
        };

        return [layoutFeature, flagsFeature];
    }

    const api = Object.freeze({
        createClassicWatchLayoutFeatures,
        buildClassicWatchLayoutCss,
        normalizeFlagText,
        ENABLE_ATTR,
        FLAGS_ATTR
    });
    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.classicWatchLayout = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
