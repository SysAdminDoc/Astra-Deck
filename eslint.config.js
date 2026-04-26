'use strict';

// Flat config — requires eslint ≥ 8.57 (ships with ESLint 9 by default).
// Target: extension/background.js only (the MV3 service worker entry point).
//
// The custom rule enforces that chrome.*.addListener() calls are registered
// at the top level of the SW script, not inside async functions or promise
// callbacks. See scripts/eslint-rules/no-post-await-addlistener.js.

const noPostAwaitAddListener = require('./scripts/eslint-rules/no-post-await-addlistener.js');

module.exports = [
    {
        files: ['extension/background.js'],
        plugins: {
            local: {
                rules: {
                    'no-post-await-addlistener': noPostAwaitAddListener,
                },
            },
        },
        rules: {
            'local/no-post-await-addlistener': 'error',
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
