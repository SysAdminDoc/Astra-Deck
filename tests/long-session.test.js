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

function createLongSessionHarness({ navigationApi = false } = {}) {
    const documentListeners = new Map();
    const windowListeners = new Map();
    const navigationListeners = new Map();
    const observers = [];
    const rafQueue = [];
    const timers = new Map();
    let nextTimerId = 1;
    let viewTransitions = 0;
    let viewTransitionThrows = false;
    let reducedMotion = false;

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

    const navigation = navigationApi ? {
        addEventListener(type, callback) { addListener(navigationListeners, type, callback); },
        removeEventListener(type, callback) { removeListener(navigationListeners, type, callback); },
        dispatchNavigate() { dispatch(navigationListeners, 'navigatesuccess'); },
        // The pre-commit event, which must NOT drive route dispatch: it also
        // fires for downloads, cancelled navigations and replaceState.
        dispatchPreCommitNavigate() { dispatch(navigationListeners, 'navigate'); }
    } : undefined;

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
        },
        startViewTransition(callback) {
            viewTransitions += 1;
            if (viewTransitionThrows) throw new Error('transition already active');
            callback();
            return { finished: Promise.resolve() };
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
        matchMedia(query) {
            return { matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion };
        },
        addEventListener(type, callback) { addListener(windowListeners, type, callback); },
        removeEventListener(type, callback) { removeListener(windowListeners, type, callback); },
        navigation,
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
        listenerCount,
        navigationListenerCount(type) { return (navigationListeners.get(type) || new Set()).size; },
        dispatchNavigation() { navigation?.dispatchNavigate(); },
        dispatchPreCommitNavigation() { navigation?.dispatchPreCommitNavigate(); },
        location: context.location,
        viewTransitionCount: () => viewTransitions,
        setViewTransitionThrows(value) { viewTransitionThrows = !!value; },
        setReducedMotion(value) { reducedMotion = !!value; }
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

test('navigation transitions only run for URL changes and respect reduced motion', () => {
    const harness = createLongSessionHarness();
    const { core } = harness;
    core.configureNavigationRuntime({ navDebounce: 0 });
    let navRuns = 0;
    core.addNavigateRule('transition-policy', () => { navRuns += 1; });

    harness.document.dispatchEvent({ type: 'yt-page-data-updated' });
    harness.flushTimers();
    assert.equal(navRuns, 2, 'same-URL page updates must still run functional navigation rules');
    assert.equal(harness.viewTransitionCount(), 0,
        'same-URL feed updates must not snapshot and cross-fade the document');

    harness.location.href = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';
    harness.document.dispatchEvent({ type: 'yt-navigate-finish' });
    harness.flushTimers();
    assert.equal(navRuns, 3);
    assert.equal(harness.viewTransitionCount(), 1, 'real URL changes may use the cosmetic transition');

    harness.setReducedMotion(true);
    harness.location.href = 'https://www.youtube.com/watch?v=ccccccccccc';
    harness.document.dispatchEvent({ type: 'yt-navigate-finish' });
    harness.flushTimers();
    assert.equal(navRuns, 4, 'reduced motion must not suppress navigation behavior');
    assert.equal(harness.viewTransitionCount(), 1, 'reduced motion must suppress the transition');

    harness.setReducedMotion(false);
    harness.setViewTransitionThrows(true);
    harness.location.href = 'https://www.youtube.com/watch?v=ddddddddddd';
    harness.document.dispatchEvent({ type: 'yt-navigate-finish' });
    harness.flushTimers();
    assert.equal(navRuns, 5, 'a rejected cosmetic transition must fall back to navigation rules');
    assert.equal(harness.viewTransitionCount(), 2, 'the rejected transition should be attempted once');
});

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

test('Navigation API is the primary route signal and remains bounded over 1000 cycles', () => {
    const harness = createLongSessionHarness({ navigationApi: true });
    const { core } = harness;
    core.configureNavigationRuntime({ navDebounce: 0 });

    let navRuns = 0;
    core.addNavigateRule('navigation-api-primary', () => { navRuns += 1; });
    core.addScopedMutationRule('navigation-api-scoped', 'ytd-rich-item-renderer', () => {});

    assert.equal(harness.navigationListenerCount('navigatesuccess'), 1,
        'Navigation API should own route dispatch when available');
    assert.equal(harness.navigationListenerCount('navigate'), 0,
        'the pre-commit navigate event must not drive route dispatch');
    assert.equal(harness.listenerCount('document', 'yt-navigate-finish'), 0,
        'YouTube route events should remain dormant on the API path');
    assert.equal(harness.listenerCount('window', 'popstate'), 0,
        'popstate should remain dormant on the API path');
    assert.equal(harness.activeObservers().length, 1);

    for (let i = 0; i < 1000; i++) {
        harness.location.href = `https://www.youtube.com/watch?v=api-${i}`;
        harness.dispatchNavigation();
        harness.flushTimers();
        const observer = harness.sharedMutationObserver();
        assert.ok(observer, 'shared mutation observer must stay connected on API routes');
        observer.emit([{ type: 'childList', addedNodes: [] }]);
        harness.flushRaf();
    }

    assert.equal(navRuns, 1001,
        'Navigation API route dispatch should run once per cycle plus registration');
    assert.equal(harness.activeObservers().length, 1,
        'Navigation API cycles must not multiply observers');

    core.removeScopedMutationRule('navigation-api-scoped');
    core.removeNavigateRule('navigation-api-primary');
    assert.equal(harness.navigationListenerCount('navigatesuccess'), 0,
        'Navigation API listener must be removed after the last rule');
    assert.equal(harness.activeObservers().length, 0);
});

test('mutation-rule circuit isolates a self-triggering rule and resets on navigation or retry', () => {
    const harness = createLongSessionHarness();
    const { core } = harness;
    core.configureNavigationRuntime({
        navDebounce: 0,
        mutationRuleMaxInvocations: 3,
        mutationRuleMaxDurationMs: 1000,
        mutationRuleMaxSingleDurationMs: 1000
    });

    let selfRuns = 0;
    let unrelatedRuns = 0;
    core.addScopedMutationRule('self-trigger', 'self-node', () => { selfRuns += 1; });
    core.addScopedMutationRule('unrelated', 'other-node', () => { unrelatedRuns += 1; });

    const emitMatching = (selector) => {
        harness.sharedMutationObserver().emit([{
            type: 'childList',
            addedNodes: [{
                nodeType: 1,
                matches(candidate) { return candidate === selector; },
                querySelector() { return null; }
            }]
        }]);
        harness.flushRaf();
    };

    emitMatching('self-node');
    emitMatching('self-node');
    let health = core.getMutationRuleHealthSnapshot();
    assert.equal(health.find(rule => rule.featureId === 'self-trigger').circuitOpen, true);
    assert.equal(health.find(rule => rule.featureId === 'unrelated').circuitOpen, false);
    assert.equal(core.getMutationRuleDiagnostics().length, 1,
        'opening one circuit must record exactly one bounded local diagnostic');

    const runsAtOpen = selfRuns;
    emitMatching('self-node');
    assert.equal(selfRuns, runsAtOpen, 'an open circuit must suppress only its owning rule');
    emitMatching('other-node');
    assert.equal(unrelatedRuns, 2, 'unrelated matching rules must keep running');

    harness.location.href = 'https://www.youtube.com/watch?v=route-reset';
    harness.document.dispatchEvent({ type: 'yt-navigate-finish' });
    harness.flushTimers();
    health = core.getMutationRuleHealthSnapshot();
    assert.equal(health.find(rule => rule.featureId === 'self-trigger').circuitOpen, false,
        'SPA navigation must reset route-scoped mutation circuits');
    emitMatching('self-node');
    assert.equal(selfRuns, runsAtOpen + 1);

    emitMatching('self-node');
    emitMatching('self-node');
    assert.equal(
        core.getMutationRuleHealthSnapshot().find(rule => rule.featureId === 'self-trigger').circuitOpen,
        true
    );
    assert.equal(core.retryMutationRule('self-trigger'), true);
    assert.equal(
        core.getMutationRuleHealthSnapshot().find(rule => rule.featureId === 'self-trigger').circuitOpen,
        false,
        'explicit retry must reset the selected rule without touching peers'
    );
});

test('mutation-rule circuit diagnostics stay capped across repeated degraded routes', () => {
    const harness = createLongSessionHarness();
    const { core } = harness;
    core.configureNavigationRuntime({
        mutationRuleMaxInvocations: 1,
        mutationRuleMaxDurationMs: 1000,
        mutationRuleMaxSingleDurationMs: 1000
    });
    for (let index = 0; index < 25; index += 1) {
        core.addScopedMutationRule(`noisy-${index}`, `.noisy-${index}`, () => {});
    }
    const diagnostics = core.getMutationRuleDiagnostics();
    assert.equal(diagnostics.length, 20);
    assert.equal(diagnostics[0].featureId, 'noisy-5');
    assert.equal(diagnostics.at(-1).featureId, 'noisy-24');
});

test('the pre-commit navigate event does not dispatch route rules', () => {
    // `navigate` fires before the navigation commits, and also for downloads,
    // cancelled navigations, replaceState and cross-document link clicks. The
    // previous implementation dispatched from it and tried to await
    // `event.committed` — a property NavigateEvent does not have ({committed,
    // finished} is the result of navigation.navigate()), so the guard was dead
    // in every browser and only this harness could enter it. Route rules must
    // run on the platform's post-commit signal instead.
    const harness = createLongSessionHarness({ navigationApi: true });
    const { core } = harness;
    core.configureNavigationRuntime({ navDebounce: 0 });

    let navRuns = 0;
    core.addNavigateRule('post-commit-only', () => { navRuns += 1; });
    const atRegistration = navRuns;

    harness.location.href = 'https://www.youtube.com/watch?v=precommit';
    harness.dispatchPreCommitNavigation();
    harness.flushTimers();
    assert.equal(navRuns, atRegistration,
        'a pre-commit navigate event must not run route rules');

    harness.dispatchNavigation();
    harness.flushTimers();
    assert.equal(navRuns, atRegistration + 1,
        'the post-commit signal must run route rules exactly once');

    core.removeNavigateRule('post-commit-only');
});
