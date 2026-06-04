'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const coreFiles = [
    'diagnostic-log.js',
    'navigation.js'
];

function createLongSessionHarness() {
    const documentListeners = new Map();
    const windowListeners = new Map();
    const observers = [];
    const rafQueue = [];
    const timers = new Map();
    let nextTimerId = 1;

    function addListener(map, type, callback) {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type).add(callback);
    }

    function removeListener(map, type, callback) {
        map.get(type)?.delete(callback);
    }

    function dispatch(map, type) {
        const listeners = Array.from(map.get(type) || []);
        for (const callback of listeners) callback({ type });
    }

    const body = { nodeType: 1, nodeName: 'BODY' };
    const documentElement = { nodeType: 1, nodeName: 'HTML' };
    const document = {
        body,
        documentElement,
        querySelector() { return null; },
        contains() { return false; },
        addEventListener(type, callback) { addListener(documentListeners, type, callback); },
        removeEventListener(type, callback) { removeListener(documentListeners, type, callback); },
        dispatchEvent(event) {
            dispatch(documentListeners, event.type);
            return true;
        }
    };

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.connected = false;
            this.targets = [];
            observers.push(this);
        }

        observe(target, options) {
            this.connected = true;
            this.targets.push({ target, options });
        }

        disconnect() {
            this.connected = false;
            this.targets = [];
        }

        emit(records) {
            this.callback(records);
        }
    }

    const context = {
        console,
        Date,
        Math,
        Promise,
        Set,
        Map,
        MutationObserver: FakeMutationObserver,
        document,
        location: { pathname: '/watch', href: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
        requestAnimationFrame(callback) {
            rafQueue.push(callback);
            return rafQueue.length;
        },
        setTimeout(callback) {
            const id = nextTimerId++;
            timers.set(id, callback);
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        addEventListener(type, callback) { addListener(windowListeners, type, callback); },
        removeEventListener(type, callback) { removeListener(windowListeners, type, callback); },
        globalThis: null,
        window: null
    };
    context.globalThis = context;
    context.window = context;

    vm.createContext(context);
    for (const fileName of coreFiles) {
        const source = fs.readFileSync(path.join(repoRoot, 'extension', 'core', fileName), 'utf8');
        vm.runInContext(source, context, { filename: `extension/core/${fileName}` });
    }

    function flushTimers(limit = 10000) {
        let rounds = 0;
        while (timers.size) {
            const callbacks = Array.from(timers.values());
            timers.clear();
            for (const callback of callbacks) callback();
            rounds += 1;
            if (rounds > limit) throw new Error('timer queue did not drain');
        }
    }

    function flushRaf() {
        const callbacks = rafQueue.splice(0, rafQueue.length);
        for (const callback of callbacks) callback(Date.now());
    }

    function activeObservers() {
        return observers.filter((observer) => observer.connected);
    }

    function sharedMutationObserver() {
        return activeObservers().find((observer) => (
            observer.targets.some((entry) => entry.target === documentElement)
        ));
    }

    function listenerCount(scope, type) {
        const map = scope === 'window' ? windowListeners : documentListeners;
        return (map.get(type) || new Set()).size;
    }

    return {
        core: context.globalThis.YTKitCore,
        document,
        flushRaf,
        flushTimers,
        activeObservers,
        sharedMutationObserver,
        listenerCount
    };
}

function addedNode(matchesCard) {
    return {
        nodeType: 1,
        matches(selector) {
            return matchesCard && selector === 'ytd-rich-item-renderer';
        },
        querySelector() {
            return null;
        }
    };
}

test('long-session route/mutation stress keeps observers and diagnostics bounded', () => {
    const harness = createLongSessionHarness();
    const { core } = harness;
    core.configureNavigationRuntime({ navDebounce: 0 });

    const settings = { diagnosticLog: true, _errors: [] };
    const log = core.createDiagnosticLog({
        getSettings: () => settings,
        cap: 64
    });

    let navRuns = 0;
    let broadRuns = 0;
    let scopedRuns = 0;

    core.addNavigateRule('long-session-nav', () => { navRuns += 1; });
    core.addMutationRule('long-session-broad', () => { broadRuns += 1; });
    core.addScopedMutationRule('long-session-scoped', 'ytd-rich-item-renderer', (_target, added) => {
        scopedRuns += added.length;
    });

    assert.equal(harness.listenerCount('document', 'yt-navigate-finish'), 1);
    assert.equal(harness.listenerCount('document', 'yt-page-data-updated'), 1);
    assert.equal(harness.listenerCount('window', 'popstate'), 1);
    assert.equal(harness.activeObservers().length, 1,
        'one shared mutation observer should fan out all mutation rules');

    const initialBroadRuns = broadRuns;
    const routeChanges = 1000;
    for (let i = 0; i < routeChanges; i++) {
        harness.document.dispatchEvent({ type: 'yt-navigate-finish' });
        harness.flushTimers();

        log.record('long-session', `route ${i}`);

        const observer = harness.sharedMutationObserver();
        assert.ok(observer, 'shared mutation observer must stay connected during stress loop');
        observer.emit([{
            type: 'childList',
            addedNodes: [addedNode(i % 25 === 0)]
        }]);
        harness.flushRaf();
    }

    assert.equal(navRuns, routeChanges + 1,
        'navigation rule should run once at registration plus once per route event');
    assert.equal(broadRuns, initialBroadRuns + routeChanges,
        'broad mutation rule should run once per animation-frame drain, not multiply');
    assert.equal(scopedRuns, 40,
        'scoped mutation rule should run only for matching added card nodes');
    assert.equal(harness.activeObservers().length, 1,
        'observer count must stay flat after a long session');
    assert.equal(settings._errors.length, 64,
        'diagnostic ring must stay capped after many route records');
    assert.deepEqual(
        JSON.parse(JSON.stringify(log.countsByCtx())),
        { 'long-session': 64 },
        'diagnostic context counter map must reflect the capped ring, not total history'
    );

    core.removeMutationRule('long-session-broad');
    assert.equal(harness.activeObservers().length, 1,
        'shared observer stays alive while a scoped rule remains');
    core.removeScopedMutationRule('long-session-scoped');
    assert.equal(harness.activeObservers().length, 0,
        'removing the last mutation rule disconnects the shared observer');

    core.removeNavigateRule('long-session-nav');
    assert.equal(harness.listenerCount('document', 'yt-navigate-finish'), 0);
    assert.equal(harness.listenerCount('document', 'yt-page-data-updated'), 0);
    assert.equal(harness.listenerCount('window', 'popstate'), 0);
});
