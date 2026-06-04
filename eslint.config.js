'use strict';

// Flat config — requires eslint ≥ 8.57 (ships with ESLint 9 by default).
//
// Two custom rules are enforced here:
//   • no-post-await-addlistener — chrome.*.addListener() must run at the
//     top level of the SW, not inside async / .then() callbacks. Only
//     applies to background.js (the MV3 service worker entry point).
//   • require-catch-reason (v4.47.0) — empty catch blocks must carry a
//     `// reason:` comment, pinning the v3.14.0 hardening invariant.
//     background.js was the initial scope; popup.js joined in v4.47.0
//     after a per-file audit confirmed 100 % compliance (8 empty
//     catches total, 7 already documented, 1 annotated in the same
//     commit). The v4.47.0 core pass extends the invariant to direct
//     extension/core/*.js modules after annotating the remaining silent
//     catches. Further widening to ytkit.js stays gated behind a
//     monolith annotation pass.

const noPostAwaitAddListener = require('./scripts/eslint-rules/no-post-await-addlistener.js');
const requireCatchReason = require('./scripts/eslint-rules/require-catch-reason.js');

const sharedBrowserGlobals = {
    chrome: 'readonly',
    self: 'readonly',
    window: 'readonly',
    document: 'readonly',
    fetch: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    Headers: 'readonly',
    AbortController: 'readonly',
    TextDecoder: 'readonly',
    URL: 'readonly',
    Blob: 'readonly',
    FileReader: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    navigator: 'readonly',
    HTMLElement: 'readonly',
    customElements: 'readonly',
    crypto: 'readonly',
    Promise: 'readonly',
    Error: 'readonly',
    Uint8Array: 'readonly',
    btoa: 'readonly',
    atob: 'readonly',
    globalThis: 'readonly',
    structuredClone: 'readonly',
};

module.exports = [
    {
        files: ['extension/background.js'],
        plugins: {
            local: {
                rules: {
                    'no-post-await-addlistener': noPostAwaitAddListener,
                    'require-catch-reason': requireCatchReason,
                },
            },
        },
        rules: {
            'local/no-post-await-addlistener': 'error',
            'local/require-catch-reason': 'error',
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: sharedBrowserGlobals,
        },
    },
    {
        // v4.47.0 Phase L: require-catch-reason now also enforced on
        // popup.js. The popup carries 8 empty catches total, 7 already
        // carried explanatory comments and the 8th was annotated in
        // the same commit that landed this rule extension. The
        // no-post-await-addlistener rule does not apply to the popup
        // (no chrome.*.addListener calls).
        files: ['extension/popup.js'],
        plugins: {
            local: {
                rules: {
                    'require-catch-reason': requireCatchReason,
                },
            },
        },
        rules: {
            'local/require-catch-reason': 'error',
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: sharedBrowserGlobals,
        },
    },
    {
        // v4.47.0 Phase L follow-up: direct core modules now enforce the
        // same silent-catch invariant. Selector-pack files are generated-like
        // data modules with no catch surface and are intentionally outside
        // this glob; the roadmap item is extension/core/*.js.
        files: ['extension/core/*.js'],
        plugins: {
            local: {
                rules: {
                    'require-catch-reason': requireCatchReason,
                },
            },
        },
        rules: {
            'local/require-catch-reason': 'error',
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: sharedBrowserGlobals,
        },
    },
];
