'use strict';

// Boot ordering in the monolith IIFE.
//
// `extension/ytkit.js` is one enormous async IIFE. Anything it calls at boot
// runs in the same scope as every `let`/`const` declared later in that body, so
// a call placed above a declaration it reads throws a TDZ ReferenceError —
// synchronously, before the function's first `await`, which means a `.catch()`
// attached to the returned promise swallows it and the feature is dead and
// silent.
//
// That is not hypothetical. The opt-in scheduled selector refresh shipped this
// way: `maybeAutoRefreshSelectorAsset()` sat beside `hydrateStoredSelectorAsset()`
// during early boot, read `appState.settings`, and `appState` is declared with
// `let` roughly forty-four thousand lines further down. It never once ran.
//
// Unit tests could not see it because they inject `appState` as a stub, so the
// live call site is never entered. This asserts the ordering itself, against
// the real parse tree rather than a string search, because that is the thing
// that was wrong.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const REPO_ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(REPO_ROOT, 'extension', 'ytkit.js'), 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest', ranges: true, locations: true });

// The body of the top-level async IIFE, which is the scope everything below
// shares.
function monolithBody() {
    for (const node of ast.body) {
        if (node.type !== 'ExpressionStatement') continue;
        let expression = node.expression;
        if (expression.type === 'UnaryExpression') expression = expression.argument;
        if (expression.type === 'AwaitExpression') expression = expression.argument;
        if (expression.type !== 'CallExpression') continue;
        const callee = expression.callee;
        if (callee.type !== 'FunctionExpression' && callee.type !== 'ArrowFunctionExpression') continue;
        if (callee.body?.type !== 'BlockStatement') continue;
        if (callee.body.body.length < 100) continue;
        return callee.body.body;
    }
    throw new Error('could not locate the monolith IIFE body');
}

const body = monolithBody();

/** Statement index of the `let`/`const` that declares `name` directly in the IIFE body. */
function declarationIndex(name) {
    for (let index = 0; index < body.length; index += 1) {
        const node = body[index];
        if (node.type !== 'VariableDeclaration') continue;
        if (node.kind !== 'let' && node.kind !== 'const') continue;
        if (node.declarations.some((d) => d.id?.type === 'Identifier' && d.id.name === name)) return index;
    }
    return -1;
}

/** Source offsets of every CallExpression to `name`, anywhere in the file. */
function callOffsets(name) {
    const found = [];
    const seen = new Set();
    const walk = (node) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) { for (const child of node) walk(child); return; }
        if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name) {
            found.push(node.range[0]);
        }
        for (const key of Object.keys(node)) {
            if (key === 'range' || key === 'loc') continue;
            walk(node[key]);
        }
    };
    walk(ast);
    return found;
}

/** Source offset where `name` is declared with let/const in the IIFE body. */
function declarationOffset(name) {
    const index = declarationIndex(name);
    return index < 0 ? -1 : body[index].range[0];
}

test('the monolith IIFE body is found and holds the shared bindings', () => {
    assert.ok(body.length > 100, 'the IIFE body should hold the whole runtime');
    assert.ok(declarationIndex('appState') >= 0, 'appState is declared directly in the IIFE body');
});

test('nothing at boot reads appState before appState exists', () => {
    const appStateAt = declarationOffset('appState');
    assert.ok(appStateAt > 0, 'appState must be declared in the IIFE body');

    // Functions that read appState synchronously before their first await.
    // A CALL to one of these placed above the declaration throws a TDZ
    // ReferenceError. Comparing source offsets rather than statement indexes
    // catches the call wherever it is nested.
    //
    // This is a source-position check, so it would not flag a call that is
    // written earlier but only invoked later through a callback. That is fine:
    // the defect it exists to stop is a direct boot-time call, which is exactly
    // what source position captures.
    const appStateReaders = ['maybeAutoRefreshSelectorAsset'];

    for (const name of appStateReaders) {
        const calls = callOffsets(name);
        assert.ok(calls.length > 0, `${name} must actually be called, or the feature is unreachable`);
        for (const offset of calls) {
            assert.ok(
                offset > appStateAt,
                `${name}() is called at offset ${offset}, before \`let appState\` at ${appStateAt}. `
                + 'It reads appState.settings synchronously, so this throws a TDZ ReferenceError that the '
                + 'attached .catch() swallows, and the feature never runs.'
            );
        }
    }
});

test('the scheduled refresh runs after the settings it reads are loaded', () => {
    // Ordering against the declaration is necessary but not sufficient: reading
    // `appState.settings` before `settingsManager.load()` has populated it
    // would leave the setting permanently undefined, which reads as "off".
    const loadIndex = source.indexOf('appState.settings = settingsManager.load();');
    const callIndex = source.indexOf('maybeAutoRefreshSelectorAsset().catch(');

    assert.ok(loadIndex > 0, 'the boot settings load must exist');
    assert.ok(callIndex > 0, 'the scheduled refresh must be called at boot');
    assert.ok(
        callIndex > loadIndex,
        'maybeAutoRefreshSelectorAsset() must run after appState.settings is populated, '
        + 'or selectorAutoRefresh always reads as off'
    );
});
