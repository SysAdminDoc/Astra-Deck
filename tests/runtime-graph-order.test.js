'use strict';

// The foundation graph is 75 classic IIFE modules that all attach to one
// globalThis.YTKitCore namespace, loaded by extension/runtime-core-loader.mjs.
// The loader imports them concurrently, so the browser evaluates them in
// completion order rather than declaration order. That is only safe while no
// module CALLS another module's export at evaluation time — every module must
// merely register its own functions and defer all cross-module calls to
// runtime.
//
// These tests are the guard on that property. If someone adds a module that
// invokes a sibling at evaluation time, loading the graph in a different order
// produces a different namespace (or throws), and this fails.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const extensionDir = path.join(repoRoot, 'extension');
const loaderSource = fs.readFileSync(path.join(extensionDir, 'runtime-core-loader.mjs'), 'utf8');

function foundationModules() {
    const match = loaderSource.match(
        /export const FOUNDATION_MODULES = Object\.freeze\(\s*(\[[\s\S]*?\])\s*\);/
    );
    assert.ok(match, 'the core loader must publish its foundation catalogue');
    return JSON.parse(match[1]);
}

// Enough of a browser for module top-level code to register itself. Anything a
// module actually *uses* at evaluation time will throw here, which is exactly
// the signal we want.
function makeContext() {
    const noop = () => {};
    const element = () => ({
        setAttribute: noop, getAttribute: () => null, appendChild: noop, remove: noop,
        addEventListener: noop, removeEventListener: noop, classList: { add: noop, remove: noop, contains: () => false },
        style: { setProperty: noop }, dataset: {}, textContent: '', isConnected: true
    });
    const context = {
        console: { log: noop, warn: noop, error: noop, debug: noop, info: noop },
        setTimeout, clearTimeout, setInterval, clearInterval,
        queueMicrotask, performance, URL, TextEncoder, TextDecoder,
        Intl, Date, Math, JSON, Promise, WeakSet, WeakMap, Set, Map,
        fetch: () => Promise.resolve({ ok: true, text: () => Promise.resolve(''), json: () => Promise.resolve({}) }),
        location: { href: 'https://www.youtube.com/', pathname: '/', search: '', hostname: 'www.youtube.com' },
        navigator: { userAgent: 'node', language: 'en-US', languages: ['en-US'] },
        matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
        requestAnimationFrame: (fn) => setTimeout(fn, 0),
        cancelAnimationFrame: clearTimeout,
        MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
        IntersectionObserver: class { observe() {} disconnect() {} },
        ResizeObserver: class { observe() {} disconnect() {} },
        CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
        Event: class { constructor(type) { this.type = type; } },
        addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
        chrome: {
            runtime: { getURL: (p) => `chrome-extension://test/${p}`, id: 'test', sendMessage: noop, onMessage: { addListener: noop } },
            storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve(), onChanged: { addListener: noop } } }
        }
    };
    context.window = context;
    context.self = context;
    context.globalThis = context;
    context.document = {
        documentElement: element(), head: element(), body: element(),
        createElement: element, createTextNode: () => ({ textContent: '' }),
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener: noop, removeEventListener: noop,
        getElementById: () => null, readyState: 'complete'
    };
    return vm.createContext(context);
}

function loadGraph(order) {
    const context = makeContext();
    for (const modulePath of order) {
        const source = fs.readFileSync(path.join(extensionDir, modulePath), 'utf8');
        // Each module is wrapped so its top-level declarations stay module-scoped,
        // matching how the browser evaluates them as separate ES modules.
        vm.runInContext(`(() => {\n${source}\n})();`, context, { filename: modulePath });
    }
    return context;
}

test('every foundation module registers without calling a sibling at evaluation time', () => {
    const modules = foundationModules();
    assert.ok(modules.length >= 70, `expected the full foundation graph, got ${modules.length}`);
    const forward = loadGraph(modules);
    const keys = Object.keys(forward.YTKitCore || {});
    assert.ok(keys.length > 50,
        `the graph must populate YTKitCore; got ${keys.length} keys`);
});

test('loading the foundation graph in reverse produces the same namespace', () => {
    // This is the property that lets the loader import concurrently. If it ever
    // fails, either restore a strictly ordered loader or fix the module that
    // reached for a sibling too early — do not weaken this test.
    const modules = foundationModules();
    const forward = Object.keys(loadGraph(modules).YTKitCore || {}).sort();
    const reverse = Object.keys(loadGraph([...modules].reverse()).YTKitCore || {}).sort();

    assert.deepEqual(reverse, forward,
        'foundation modules must be order-independent at evaluation time');
});

test('the lifecycle route bridge is installed by every vehicle, and never by itself', () => {
    const bridge = fs.readFileSync(path.join(extensionDir, 'core', 'lifecycle-route-bridge.js'), 'utf8');
    const bootstrap = fs.readFileSync(path.join(extensionDir, 'runtime-bootstrap.js'), 'utf8');
    const monolith = fs.readFileSync(path.join(extensionDir, 'ytkit.js'), 'utf8');
    const userscript = fs.readFileSync(path.join(repoRoot, 'YTKit.user.js'), 'utf8');
    const userscriptCore = fs.readFileSync(path.join(repoRoot, 'YTKit-core.user.js'), 'utf8');

    // Self-installing on load is what made this module order-dependent, and it
    // no-ops silently (the installer returns false, it does not throw), so the
    // failure would be invisible: SPA route tokens simply stop advancing.
    for (const [label, source] of [['module', bridge], ['userscript core bundle', userscriptCore]]) {
        assert.doesNotMatch(source, /^\s{4}installLifecycleRouteBridge\(\);$/m,
            `${label} must not self-install the route bridge on load`);
    }

    // The extension arms it as soon as the foundation graph resolves...
    assert.match(bootstrap, /installLifecycleRouteBridge\?\.\(\) === true/,
        'the bootstrap must install the route bridge and check that it succeeded');
    assert.match(bootstrap, /routeBridgeInstalled/,
        'a failed install must be observable, not silent');
    // ...and both monolith copies cover the userscript, which has no bootstrap.
    for (const [label, source] of [['monolith', monolith], ['userscript', userscript]]) {
        const mainIndex = source.indexOf('_mainRan = true;');
        assert.ok(mainIndex > 0, `${label} must have a main() entry point`);
        const block = source.slice(mainIndex, mainIndex + 900);
        assert.match(block, /installLifecycleRouteBridge\?\.\(\)/,
            `${label} main() must install the route bridge`);
    }
});

test('a module that calls a sibling at evaluation time is caught', () => {
    // Bait: prove the reverse-order check above can actually fail, rather than
    // passing because the harness swallows everything.
    const context = makeContext();
    vm.runInContext(`(() => {
        const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
        Object.assign(core, { early: () => 'ok' });
    })();`, context, { filename: 'fake-early.js' });
    assert.throws(
        () => vm.runInContext(`(() => {
            const core = globalThis.YTKitCore;
            core.missingSibling();
        })();`, context, { filename: 'fake-late.js' }),
        /not a function/,
        'an evaluation-time call to an unregistered sibling must throw'
    );
});
