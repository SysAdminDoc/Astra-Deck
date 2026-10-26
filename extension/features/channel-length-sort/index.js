(() => {
    'use strict';

    // Sort by Length, the isolated half: the switch and the menu label. The
    // sort itself runs in the page world (core/channel-length-sort.js, wired
    // in ytkit-main.js), because only that world can read the channel grid's
    // data and page through it.

    const ENABLE_ATTR = 'data-ytkit-channel-length-sort';
    const LABEL_ATTR = 'data-ytkit-channel-length-sort-label';

    function createChannelLengthSortFeature(deps = {}) {
        const {
            publishBridgeAttribute = () => {},
            clearBridgeAttribute = () => {},
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'channelLengthSort',
            name: t('feature_channelLengthSort_name', 'Sort Channel Videos by Length'),
            description: t('feature_channelLengthSort_desc', 'Adds Length to the sort menu on a channel\'s Videos tab. Picking it loads every video and puts the longest first.'),
            group: 'Home / Subscriptions',
            icon: 'clock',
            init() {
                publishBridgeAttribute(LABEL_ATTR, t('channelLengthSort_option', 'Length'));
                publishBridgeAttribute(ENABLE_ATTR, 'on');
            },
            destroy() {
                clearBridgeAttribute(ENABLE_ATTR);
                clearBridgeAttribute(LABEL_ATTR);
            }
        };
    }

    const api = Object.freeze({ createChannelLengthSortFeature, ENABLE_ATTR, LABEL_ATTR });
    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.channelLengthSort = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
