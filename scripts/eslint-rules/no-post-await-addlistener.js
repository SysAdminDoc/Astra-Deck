'use strict';

// ESLint rule: no-post-await-addlistener
//
// Flags chrome.*.addListener() calls that appear inside an async function
// body or inside a .then() callback. In a MV3 service worker, listeners
// MUST be registered at the top level of the script — i.e. synchronously
// during the initial evaluation of background.js. Registering inside an
// async function or .then() is unreliable: the SW may have been terminated
// before the awaited work finishes, so the listener registration never runs.
//
// Correct: top-level registration (all four existing calls in background.js).
// Wrong:   chrome.runtime.onMessage.addListener inside an async function.
//
// The rule targets: <any-chain>.addListener(...)
// and reports when the call is inside:
//   - An async function declaration, expression, or method
//   - A .then() / .catch() / .finally() callback argument
//
// It does NOT flag:
//   - Top-level addListener (correct SW pattern)
//   - Non-async function bodies (synchronous init helpers are fine)
//   - addEventListener on DOM elements (not a SW lifecycle concern)

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow chrome.*.addListener() inside async functions or promise callbacks (MV3 service-worker lifecycle)',
            recommended: false,
        },
        schema: [],
        messages: {
            postAwaitAddListener:
                '`addListener` must be registered at the top level of the service worker script. ' +
                'Registering inside an async function or `.then()` callback is unreliable because ' +
                'the SW may be terminated before this code runs.',
        },
    },

    create(context) {
        // Walk up the ancestor list to determine if the current node is nested
        // inside an async function or a promise-handler callback.
        function isInsideAsyncOrThenContext(node) {
            let current = node.parent;
            while (current) {
                // async function declaration / expression / arrow
                if (
                    (current.type === 'FunctionDeclaration' ||
                        current.type === 'FunctionExpression' ||
                        current.type === 'ArrowFunctionExpression') &&
                    current.async
                ) {
                    return true;
                }

                // .then() / .catch() / .finally() callback
                if (
                    current.type === 'CallExpression' &&
                    current.callee &&
                    current.callee.type === 'MemberExpression' &&
                    typeof current.callee.property.name === 'string' &&
                    ['then', 'catch', 'finally'].includes(current.callee.property.name)
                ) {
                    // Only flag if this node (or an ancestor) is a direct argument
                    // of the .then/.catch/.finally — i.e. a callback, not the object
                    // the method is called on.
                    const args = current.arguments || [];
                    for (const arg of args) {
                        if (isAncestorOrSelf(arg, node)) return true;
                    }
                }

                current = current.parent;
            }
            return false;
        }

        function isAncestorOrSelf(potentialAncestor, node) {
            let current = node;
            while (current) {
                if (current === potentialAncestor) return true;
                current = current.parent;
            }
            return false;
        }

        return {
            CallExpression(node) {
                // Match <expr>.addListener(...)
                if (
                    node.callee.type !== 'MemberExpression' ||
                    node.callee.property.type !== 'Identifier' ||
                    node.callee.property.name !== 'addListener'
                ) {
                    return;
                }

                // Only care about chrome.*.addListener chains, not DOM addEventListener.
                // Walk the callee chain to see if it roots at `chrome`.
                function rootsAtChrome(expr) {
                    if (!expr) return false;
                    if (expr.type === 'Identifier') return expr.name === 'chrome';
                    if (expr.type === 'MemberExpression') return rootsAtChrome(expr.object);
                    return false;
                }
                if (!rootsAtChrome(node.callee)) return;

                if (isInsideAsyncOrThenContext(node)) {
                    context.report({ node, messageId: 'postAwaitAddListener' });
                }
            },
        };
    },
};
