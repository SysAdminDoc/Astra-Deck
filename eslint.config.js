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

// The tooling tier runs under Node, not a browser. It is the highest-leverage
// code in the repository -- 28 gate scripts, the build script and the
// userscript sync script enforce every invariant the extension relies on --
// and until v4.70.0 it was the only JavaScript here that was never linted.
const sharedNodeGlobals = {
    require: 'readonly',
    module: 'writable',
    exports: 'writable',
    process: 'readonly',
    console: 'readonly',
    Buffer: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    URL: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    globalThis: 'readonly',
    structuredClone: 'readonly',
    fetch: 'readonly',
    AbortController: 'readonly',
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
            'no-constant-binary-expression': ['error', { checkRelationalComparisons: true }],
        },
        languageOptions: sharedLanguageOptions,
    },
    {
        files: [
            'extension/popup.js',
            'extension/runtime-bootstrap.js',
            'extension/core/*.js',
            'extension/core/selector-packs/*.js',
            'extension/features/**/*.js',
            'extension/live-chat.js',
            'extension/sidepanel.js',
            'extension/ytkit.js',
            'extension/ytkit-main.js',
        ],
        plugins: { local: localPlugin },
        rules: {
            'local/require-catch-reason': 'error',
            'no-constant-binary-expression': ['error', { checkRelationalComparisons: true }],
        },
        languageOptions: sharedLanguageOptions,
    },
    {
        // The gates, the build, and the userscript sync. `require-catch-reason`
        // applies here too: a silently swallowed error in a gate script is how
        // a gate starts passing without checking anything.
        files: [
            'scripts/**/*.js',
            'build-extension.js',
            'sync-userscript.js',
        ],
        plugins: { local: localPlugin },
        rules: {
            'local/require-catch-reason': 'error',
            'no-constant-binary-expression': ['error', { checkRelationalComparisons: true }],
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: sharedNodeGlobals,
        },
    },
    {
        // ESM: the runtime core loader is a module, not a script.
        files: ['extension/runtime-core-loader.mjs'],
        plugins: { local: localPlugin },
        rules: {
            'local/require-catch-reason': 'error',
            'no-constant-binary-expression': ['error', { checkRelationalComparisons: true }],
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: sharedBrowserGlobals,
        },
    },
];
