'use strict';

// ESLint rule: require-catch-reason
//
// v3.14.0 hardening invariant: every "silent" catch block — one whose
// body has no executable statements — must carry a `// reason:` comment
// (case-insensitive) explaining why swallowing the error is correct.
// The audit pass cited at HARDENING.md "Empty `catch (_) {}` audit"
// rewrote 22 catches in ytkit.js / background.js / popup.js to either
// log through `DebugManager` (which means the body isn't empty) or
// annotate with `// reason:`. This rule pins the invariant so future
// drift fails CI.
//
// Triggers when:
//   - The `CatchClause` body is a `BlockStatement` with zero statements.
//   - AND none of the comments lexically inside the block contain
//     `reason:` (case-insensitive). Trailing comments on the same line
//     as the closing `}` also count.
//
// Does NOT trigger when:
//   - The catch body contains any statement (logging, returning,
//     re-throwing, fall-through, anything). Non-empty bodies aren't
//     "silent" by the v3.14.0 definition.
//   - A `// reason:` (or `/* reason: */`) comment lives anywhere inside
//     the empty block — including a trailing same-line comment such as
//     `} catch (_) { /* reason: best-effort */ }`.

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Empty catch blocks must explain themselves with a `// reason:` comment (v3.14.0 hardening invariant)',
            recommended: false,
        },
        schema: [],
        messages: {
            missingReason:
                'Empty catch block must include a `// reason:` (or `/* reason: */`) comment ' +
                'explaining why the error is safely ignored. Otherwise call `DebugManager.log()` ' +
                'or another logger so the failure leaves a trail.',
        },
    },

    create(context) {
        const sourceCode = context.getSourceCode
            ? context.getSourceCode()
            : context.sourceCode;
        if (!sourceCode) return {};

        function blockHasReasonComment(blockNode) {
            // Grab every comment whose range falls inside the block's
            // `{ ... }` span. `getCommentsInside` returns leading +
            // trailing + inline comments of the block's body. Empty
            // blocks still produce comments here because the comment's
            // parent is the block.
            const innerComments = typeof sourceCode.getCommentsInside === 'function'
                ? sourceCode.getCommentsInside(blockNode)
                : [];
            for (const c of innerComments) {
                if (/reason\s*:/i.test(c.value)) return true;
            }
            // Same-line trailing comment after `}` on the very same line.
            // ESLint stores those as the `closingComment` candidate via
            // getCommentsAfter when the comment shares a line with `}`.
            if (typeof sourceCode.getCommentsAfter === 'function') {
                const closing = blockNode.range && blockNode.range[1];
                const trailing = sourceCode.getCommentsAfter(blockNode);
                for (const c of trailing) {
                    if (c.range && c.range[0] >= closing) {
                        const blockEndLine = blockNode.loc && blockNode.loc.end.line;
                        const commentStartLine = c.loc && c.loc.start.line;
                        if (blockEndLine != null
                            && commentStartLine != null
                            && commentStartLine === blockEndLine
                            && /reason\s*:/i.test(c.value)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        return {
            CatchClause(node) {
                if (!node.body || node.body.type !== 'BlockStatement') return;
                if (node.body.body.length > 0) return; // non-empty body: not silent
                if (blockHasReasonComment(node.body)) return;
                context.report({ node: node.body, messageId: 'missingReason' });
            },
        };
    },
};
