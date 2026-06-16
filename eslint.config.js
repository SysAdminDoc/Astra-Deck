'use strict';

// Flat config — requires eslint ≥ 10 (pinned in package.json).
//
// Two custom rules are enforced here:
//   • no-post-await-addlistener — chrome.*.addListener() must run at the
//     top level of the SW, not inside async / .then() callbacks. Only
//     applies to background.js (the MV3 service worker entry point).
//   • require-catch-reason (v4.47.0) — empty catch blocks must carry a
//     `// reason:` comment, pinning the v3.14.0 hardening invariant.
//     Enforced on background.js, popup.js, extension/core/*.js, and
//     ytkit.js after per-file audits confirmed full compliance.

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

const localPlugin = {
    rules: {
        'no-post-await-addlistener': noPostAwaitAddListener,
        'require-catch-reason': requireCatchReason,
    },
};

const sharedLanguageOptions = {
    ecmaVersion: 2022,
    sourceType: 'script',
    globals: sharedBrowserGlobals,
};

module.exports = [
    {
        files: ['extension/background.js'],
        plugins: { local: localPlugin },
        rules: {
            'local/no-post-await-addlistener': 'error',
            'local/require-catch-reason': 'error',
        },
        languageOptions: sharedLanguageOptions,
    },
    {
        files: [
            'extension/popup.js',
            'extension/core/*.js',
            'extension/ytkit.js',
        ],
        plugins: { local: localPlugin },
        rules: {
            'local/require-catch-reason': 'error',
        },
        languageOptions: sharedLanguageOptions,
    },
];
