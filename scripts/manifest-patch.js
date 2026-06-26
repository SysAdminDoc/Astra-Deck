'use strict';

// v3.20.0: Extracted from build-extension.js so tests can assert the
// exact Firefox-side manifest delta without spawning a real build.
// Side-effect-free module — safe to `require()` from tests.

const FIREFOX_BUILTIN_DATA_CONSENT_MIN_VERSION = '142.0';
const FIREFOX_DATA_COLLECTION_REQUIRED = Object.freeze([
    'browsingActivity',
    'websiteContent',
    'websiteActivity',
    'authenticationInfo'
]);
const FIREFOX_SIDEBAR_ACTION = Object.freeze({
    default_title: '__MSG_extName__',
    default_panel: 'sidebar.html',
    default_icon: Object.freeze({
        '16': 'icons/16.png',
        '32': 'icons/32.png',
        '48': 'icons/48.png',
        '128': 'icons/128.png'
    })
});

// Mutates and returns `ffManifest`. Caller is responsible for writing
// the result back to disk.
function patchManifestForFirefox(ffManifest) {
    ffManifest.browser_specific_settings = {
        gecko: {
            id: 'ytkit@sysadmindoc.github.io',
            strict_min_version: FIREFOX_BUILTIN_DATA_CONSENT_MIN_VERSION,
            data_collection_permissions: {
                required: FIREFOX_DATA_COLLECTION_REQUIRED.slice()
            }
        }
    };

    if (ffManifest.background && ffManifest.background.service_worker) {
        const worker = ffManifest.background.service_worker;
        ffManifest.background = { scripts: [worker] };
    }

    // v4.5.3: the `commands` block was retired entirely (no keyboard
    // shortcuts policy). The previous Ctrl+Shift+Y → Ctrl+Alt+Y rebind for
    // Firefox's "Show Downloads" collision is moot — there is no shortcut
    // left to collide.

    // Chrome-only: side_panel API + sidePanel permission. Firefox uses
    // sidebar_action which has a different API surface. Strip both so
    // Firefox builds don't carry unsupported keys.
    delete ffManifest.side_panel;
    if (Array.isArray(ffManifest.permissions)) {
        ffManifest.permissions = ffManifest.permissions.filter(p => p !== 'sidePanel');
    }
    ffManifest.sidebar_action = {
        ...FIREFOX_SIDEBAR_ACTION,
        default_icon: { ...FIREFOX_SIDEBAR_ACTION.default_icon }
    };

    return ffManifest;
}

module.exports = {
    patchManifestForFirefox,
    FIREFOX_BUILTIN_DATA_CONSENT_MIN_VERSION,
    FIREFOX_DATA_COLLECTION_REQUIRED,
    FIREFOX_SIDEBAR_ACTION
};
