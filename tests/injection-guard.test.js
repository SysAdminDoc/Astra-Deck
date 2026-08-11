'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const guardSource = fs.readFileSync(
    path.join(repoRoot, 'extension', 'core', 'injection-guard.js'),
    'utf8'
);

function makeContext(namespace) {
    const warnings = [];
    const context = {
        console: { warn: (...args) => warnings.push(args) },
        Date,
        Object,
        Number,
        String,
        TypeError,
        globalThis: null,
        YTKitCore: {},
        warnings,
        [namespace]: { runtime: {} }
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(guardSource, context, { filename: 'extension/core/injection-guard.js' });
    return context;
}

for (const namespace of ['chrome', 'browser']) {
    test(`injection guard keeps the ${namespace} runtime single across update re-entry`, () => {
        const context = makeContext(namespace);
        const createGuard = context.YTKitCore.createInjectionGuard;
        const first = createGuard({ key: '__ytkitTestRuntime', owner: `${namespace}-isolated` });
        first.markReady({ registrySize: 42 });

        const duplicate = createGuard({ key: '__ytkitTestRuntime', owner: `${namespace}-isolated` });
        assert.equal(duplicate.claimed, false);
        assert.equal(duplicate.duplicate, true);
        assert.equal(context.__ytkitTestRuntime.duplicateInjections, 1);
        assert.equal(context.__ytkitTestRuntime.registrySize, 42);
        assert.equal(context.warnings.length, 1,
            'a duplicate must leave an observable diagnostic warning');

        first.markFailed('simulated-update-failure', new Error('fixture failure'));
        const retry = createGuard({ key: '__ytkitTestRuntime', owner: `${namespace}-isolated` });
        assert.equal(retry.claimed, true, 'a failed generation must be recoverable');
        assert.equal(retry.state.generation, 2);
        assert.equal(retry.state.phase, 'starting');
    });
}

test('runtime and MAIN-world sources claim distinct world-local guards before work', () => {
    const isolated = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit.js'), 'utf8');
    const main = fs.readFileSync(path.join(repoRoot, 'extension', 'ytkit-main.js'), 'utf8');
    assert.match(isolated, /key:\s*'__ytkitIsolatedRuntime'/);
    assert.match(isolated, /if \(_runtimeGuard && !_runtimeGuard\.claimed\) return/);
    assert.match(main, /key:\s*'__ytkitMainRuntime'/);
    assert.match(main, /if \(_mainRuntimeGuard && !_mainRuntimeGuard\.claimed\) return/);
    assert.match(main, /observerHandlers/);
});
