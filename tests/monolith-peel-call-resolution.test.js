'use strict';

// A call into a peeled module that ytkit.js cannot see.
//
// The peel moves a function out of `ytkit.js` into a module with its own
// closure, and `ytkit.js` reaches back in through `getSettingsPanelRuntime()`
// and the other runtime accessors. Writing the bare name instead still lints,
// still bundles, and still passes every gate, because nothing resolves
// identifiers across that boundary. It throws a ReferenceError the first time
// the code runs, and if the call sits inside a message listener or a `.catch()`
// the throw is swallowed and the feature is simply dead.
//
// Found 2026-09-05: the YTKIT_OPEN_PANEL handler called `requestSettingFocus`,
// which exists only in extension/features/settings-panel/index.js. The full
// 38-gate run passed with that in the tree.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const REPO_ROOT = path.join(__dirname, '..');
const FEATURES_DIR = path.join(REPO_ROOT, 'extension', 'features');

// A plain recursive walk. acorn-walk is not a dependency of this repo and one
// visitor is not worth adding it for.
function eachNode(node, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'loc' || key === 'range') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach((entry) => eachNode(entry, visit));
        else if (child && typeof child === 'object') eachNode(child, visit);
    }
}

/** Every identifier this source declares, at any depth. */
function declaredNames(ast) {
    const names = new Set();
    const add = (node) => {
        if (!node) return;
        if (node.type === 'Identifier') names.add(node.name);
        else if (node.type === 'ObjectPattern') node.properties.forEach((p) => add(p.value || p.argument));
        else if (node.type === 'ArrayPattern') node.elements.forEach(add);
        else if (node.type === 'AssignmentPattern') add(node.left);
        else if (node.type === 'RestElement') add(node.argument);
    };
    eachNode(ast, (node) => {
        if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression'
            || node.type === 'ArrowFunctionExpression') {
            add(node.id);
            node.params.forEach(add);
        } else if (node.type === 'VariableDeclarator') {
            add(node.id);
        } else if (node.type === 'ClassDeclaration') {
            add(node.id);
        } else if (node.type === 'CatchClause') {
            add(node.param);
        } else if (node.type === 'ImportDefaultSpecifier' || node.type === 'ImportSpecifier') {
            add(node.local);
        }
    });
    return names;
}

/** Names called as a bare `foo(...)`, ignoring `a.foo(...)`. */
function bareCallNames(ast) {
    const names = new Set();
    eachNode(ast, (node) => {
        if (node.type !== 'CallExpression') return;
        const callee = node.callee;
        if (callee?.type === 'Identifier') names.add(callee.name);
    });
    return names;
}

function parse(file) {
    return acorn.parse(fs.readFileSync(file, 'utf8'), {
        ecmaVersion: 'latest', allowReturnOutsideFunction: true
    });
}

function listPeeledModules() {
    return fs.readdirSync(FEATURES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(FEATURES_DIR, entry.name, 'index.js'))
        .filter((file) => fs.existsSync(file));
}

test('ytkit.js never calls a bare name only a peeled module declares', () => {
    const monolith = parse(path.join(REPO_ROOT, 'extension', 'ytkit.js'));
    const monolithDeclares = declaredNames(monolith);
    const monolithCalls = bareCallNames(monolith);

    // Anything the monolith itself declares is fine, whatever else also
    // declares it: the peel deliberately leaves compatibility copies behind.
    const unresolved = [...monolithCalls].filter((name) => !monolithDeclares.has(name));

    const offenders = [];
    for (const file of listPeeledModules()) {
        const moduleDeclares = declaredNames(parse(file));
        for (const name of unresolved) {
            if (moduleDeclares.has(name)) {
                offenders.push(`${name}() is declared only in ${path.relative(REPO_ROOT, file)}`);
            }
        }
    }

    assert.deepEqual(offenders, [],
        'reach the module through its runtime accessor instead of calling the name directly');
});

test('the gate fails when a peeled-only name is called bare', () => {
    // A gate nobody has watched fail is a gate that might be checking nothing.
    // Prove it on a planted pair rather than on the real tree.
    const monolith = acorn.parse('function local() {} local(); peeledOnly();',
        { ecmaVersion: 'latest' });
    const peeled = acorn.parse('function peeledOnly() {} function alsoLocal() {}',
        { ecmaVersion: 'latest' });

    const unresolved = [...bareCallNames(monolith)].filter((n) => !declaredNames(monolith).has(n));
    assert.deepEqual(unresolved, ['peeledOnly'], 'the local call resolves, the peeled one does not');
    assert.ok(declaredNames(peeled).has('peeledOnly'),
        'and the peeled module is where that name actually lives');
});

test('a name the monolith also declares is not reported', () => {
    // The peel leaves compatibility copies in ytkit.js on purpose. Flagging
    // those would make the gate fire on every peeled function there is.
    const monolith = acorn.parse('function setSettingsPanelOpen() {} setSettingsPanelOpen(true);',
        { ecmaVersion: 'latest' });
    const unresolved = [...bareCallNames(monolith)].filter((n) => !declaredNames(monolith).has(n));
    assert.deepEqual(unresolved, []);
});
