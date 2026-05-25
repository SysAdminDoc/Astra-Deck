'use strict';

// Flat config — requires eslint ≥ 8.57 (ships with ESLint 9 by default).
// Target: extension/background.js only (the MV3 service worker entry point).
//
// Two custom rules are enforced here:
//   • no-post-await-addlistener — chrome.*.addListener() must run at the
//     top level of the SW, not inside async / .then() callbacks.
//   • require-catch-reason (v4.47.0) — empty catch blocks must carry a
//     `// reason:` comment, pinning the v3.14.0 hardening invariant.
//     background.js is currently 100 % compliant; wider rollout
//     (popup.js, ytkit.js, core/*) is gated behind a per-file audit
//     and bulk-annotate pass.

const noPostAwaitAddListener = require('./scripts/eslint-rules/no-post-await-addlistener.js');
const requireCatchReason = require('./scripts/eslint-rules/require-catch-reason.js');

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
            globals: {
                chrome: 'readonly',
                self: 'readonly',
                fetch: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                Headers: 'readonly',
                AbortController: 'readonly',
                TextDecoder: 'readonly',
                URL: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                Promise: 'readonly',
                Error: 'readonly',
                Uint8Array: 'readonly',
            },
        },
    },
];
