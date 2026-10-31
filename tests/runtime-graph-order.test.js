'use strict';

// The foundation graph is classic IIFE modules that all attach to one
// globalThis.YTKitCore namespace, loaded by extension/runtime-core-loader.mjs.
// The loader imports them concurrently in two tiers, so the browser evaluates a
// tier in completion order rather than declaration order. That is only safe
// while no module reads a sibling from its own tier at evaluation time. What
// siblings do read goes in the first tier (READ_AT_EVALUATION in the generator).
//
// These tests are the guard on that property. A too-early read usually doesn't
// throw: the reader keeps a null or a short list and carries on, and the set of
// namespace keys comes out the same. So the tests record each read that happens
// before its export exists, and also check the values such a read captures.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { readUserscriptBuild } = require('./helpers/source');

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

function loadedFirstModules() {
    const match = loaderSource.match(
        /export const LOADED_FIRST = Object\.freeze\(\s*(\[[\s\S]*?\])\s*\);/
    );
    assert.ok(match, 'the core loader must publish its first tier');
    return JSON.parse(match[1]);
}

// The two tiers the loader awaits in turn, each flipped or not. A pair of modules
// lands in both relative orders across the two calls, so one call of each covers
// every way a tier's concurrent imports can finish.
function tieredOrder(reversed) {
    const first = loadedFirstModules();
    const rest = foundationModules().filter((modulePath) => !first.includes(modulePath));
    return reversed ? [...[...first].reverse(), ...[...rest].reverse()] : [...first, ...rest];
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

// Runs the modules in `order` and lists each read of a sibling's export that came
// before the export existed. The YTKitCore namespace and the graph's other globals
// (found with a plain forward load) are watched, since modules publish both.
function earlyReads(order, readSource = (modulePath) => fs.readFileSync(path.join(extensionDir, modulePath), 'utf8')) {
    const baseline = new Set(Object.keys(makeContext()));
    const graphGlobals = Object.keys(loadGraph(foundationModules()))
        .filter((name) => !baseline.has(name) && name !== 'YTKitCore');

    const context = makeContext();
    let current = '';
    const reads = [];
    const writers = new Map();
    const noteWrite = (name) => {
        if (!writers.has(name)) writers.set(name, current);
    };
    const core = new Proxy({}, {
        get(target, key) {
            if (typeof key === 'string' && !(key in target)) reads.push([current, `YTKitCore.${key}`]);
            return target[key];
        },
        has(target, key) {
            if (typeof key === 'string' && !(key in target)) reads.push([current, `YTKitCore.${key}`]);
            return key in target;
        },
        set(target, key, value) {
            if (typeof key === 'string') noteWrite(`YTKitCore.${key}`);
            target[key] = value;
            return true;
        },
        defineProperty(target, key, descriptor) {
            if (typeof key === 'string') noteWrite(`YTKitCore.${key}`);
            return Reflect.defineProperty(target, key, descriptor);
        },
    });
    Object.defineProperty(context, 'YTKitCore', { value: core, writable: true, configurable: true });
    for (const name of graphGlobals) {
        let value;
        let written = false;
        Object.defineProperty(context, name, {
            configurable: true,
            get() {
                if (!written) reads.push([current, name]);
                return value;
            },
            set(next) {
                noteWrite(name);
                written = true;
                value = next;
            },
        });
    }

    for (const modulePath of order) {
        current = modulePath;
        vm.runInContext(`(() => {\n${readSource(modulePath)}\n})();`, context, { filename: modulePath });
    }
    const found = new Set();
    for (const [reader, name] of reads) {
        const writer = writers.get(name);
        if (writer && writer !== reader) found.add(`${reader} reads ${name} from ${writer}`);
    }
    return [...found].sort();
}

test('no foundation module reads a sibling before the loader has settled it', () => {
    assert.deepEqual(earlyReads(tieredOrder(false)), [],
        'add what the module reads to READ_AT_EVALUATION in scripts/generate-runtime-bootstrap.js');
    assert.deepEqual(earlyReads(tieredOrder(true)), [],
        'add what the module reads to READ_AT_EVALUATION in scripts/generate-runtime-bootstrap.js');
});

test('the early-read check sees what a single concurrent tier would race on', () => {
    // Positive control: these are the reads the first tier exists for. Without it
    // the policy keeps a null schema and the selector map can lose a surface.
    const flat = earlyReads([...foundationModules()].reverse()).join('\n');
    assert.match(flat, /core\/policy-profile\.js reads __YTKIT_SETTINGS_SCHEMA__/);
    assert.match(flat, /core\/selectors\.js reads YTKitCore\.SurfacePackRegistry/);
    assert.match(flat, /features\/download-ui\/index\.js reads YTKitCore\.companionPorts/);
});

for (const [label, reversed] of [['in list order', false], ['with each tier reversed', true]]) {
    test(`modules capture the real schema and every selector pack ${label}`, () => {
        const context = loadGraph(tieredOrder(reversed));
        const core = context.YTKitCore;
        assert.equal(core.createPolicyProfile().isKeyAllowedInProfile('hideRelatedVideos', 'store-safe'), true,
            'the policy must find the schema it captured at evaluation');
        assert.equal(Object.keys(core.SurfaceSelectorMap).length, core.SurfacePackRegistry.size,
            'the frozen selector map must hold a surface for every pack');
    });
}

test('a read before the export exists is reported, and one after it is not', () => {
    const sources = {
        reader: 'const captured = globalThis.YTKitCore.fixtureExport;',
        writer: 'globalThis.YTKitCore.fixtureExport = 1;',
    };
    const readSource = (name) => sources[name];
    assert.deepEqual(earlyReads(['reader', 'writer'], readSource),
        ['reader reads YTKitCore.fixtureExport from writer']);
    assert.deepEqual(earlyReads(['writer', 'reader'], readSource), []);
});

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
    const host = fs.readFileSync(path.join(repoRoot, 'userscript', 'host.js'), 'utf8');

    // Self-installing on load is what made this module order-dependent, and it
    // no-ops silently (the installer returns false, it does not throw), so the
    // failure would be invisible: SPA route tokens simply stop advancing. The
    // userscript runs this same file, so one check covers both vehicles.
    assert.doesNotMatch(bridge, /^\s{4}installLifecycleRouteBridge\(\);$/m,
        'the module must not self-install the route bridge on load');

    // The extension arms it as soon as the foundation graph resolves...
    for (const [label, source] of [['bootstrap', bootstrap], ['userscript host', host]]) {
        assert.match(source, /installLifecycleRouteBridge\?\.\(\) === true/,
            `the ${label} must install the route bridge and check that it succeeded`);
        assert.match(source, /routeBridgeInstalled/,
            `a failed install in the ${label} must be observable, not silent`);
    }
    // ...the userscript host does the same, right after its foundation loop...
    const foundationLoop = host.indexOf('for (const path of BUILD.modules.foundation) runModule(path, contentScope);');
    const hostInstall = host.indexOf('installLifecycleRouteBridge?.()');
    assert.ok(foundationLoop > 0 && hostInstall > foundationLoop,
        'the userscript host must install the route bridge after the foundation modules run');
    const { modules } = readUserscriptBuild();
    assert.ok(modules.foundation.includes('core/lifecycle-route-bridge.js'),
        'the userscript foundation group must carry the route bridge module');

    // ...and main() backs both up. The userscript runs this same ytkit.js.
    const mainIndex = monolith.indexOf('_mainRan = true;');
    assert.ok(mainIndex > 0, 'monolith must have a main() entry point');
    const block = monolith.slice(mainIndex, mainIndex + 900);
    assert.match(block, /installLifecycleRouteBridge\?\.\(\)/,
        'monolith main() must install the route bridge');
    assert.equal(modules.app, 'ytkit.js', 'the userscript app module is the same ytkit.js');
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
