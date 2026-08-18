(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.addNavigateRule) return;
    const isWatchPagePath = core.isWatchPagePath || ((path = window.location.pathname) => String(path).startsWith('/watch'));

    const runtime = {
        navDebounce: 50,
        elementTimeout: 3000,
        mutationRuleWindowMs: 5000,
        mutationRuleMaxInvocations: 120,
        mutationRuleMaxDurationMs: 120,
        mutationRuleMaxSingleDurationMs: 32
    };

    let mutationObserver = null;
    const mutationRules = new Map();
    const scopedMutationRules = new Map();
    const navigateRules = new Map();
    const mutationRuleHealth = new Map();
    const mutationRuleDiagnostics = [];
    const MUTATION_DIAGNOSTIC_CAP = 20;
    let mutationRouteGeneration = 0;
    let pendingMutationRouteReset = false;
    let isNavigateListenerAttached = false;
    let watchFlexyObserver = null;
    let watchFlexyObservedNode = null;
    let navigateDebounceTimer = null;
    let mutationScheduled = false;
    // Pending mutation records collected between observer fires, drained in
    // the rAF dispatch. Scoped rules inspect these to early-exit when no
    // newly-added node matches their selector.
    let pendingMutationRecords = [];

    function configureNavigationRuntime(options = {}) {
        if (Number.isFinite(options.navDebounce)) {
            runtime.navDebounce = Math.max(0, options.navDebounce);
        }
        if (Number.isFinite(options.elementTimeout)) {
            runtime.elementTimeout = Math.max(0, options.elementTimeout);
        }
        if (Number.isFinite(options.mutationRuleWindowMs)) {
            runtime.mutationRuleWindowMs = Math.max(1, options.mutationRuleWindowMs);
        }
        if (Number.isFinite(options.mutationRuleMaxInvocations)) {
            runtime.mutationRuleMaxInvocations = Math.max(1, Math.floor(options.mutationRuleMaxInvocations));
        }
        if (Number.isFinite(options.mutationRuleMaxDurationMs)) {
            runtime.mutationRuleMaxDurationMs = Math.max(1, options.mutationRuleMaxDurationMs);
        }
        if (Number.isFinite(options.mutationRuleMaxSingleDurationMs)) {
            runtime.mutationRuleMaxSingleDurationMs = Math.max(1, options.mutationRuleMaxSingleDurationMs);
        }
    }

    function waitForElement(selector, callback, timeout = runtime.elementTimeout) {
        if (!selector || typeof callback !== 'function') return () => {};
        const existing = document.querySelector(selector);
        if (existing) {
            callback(existing);
            return () => {};
        }

        let fired = false;
        let timeoutId = null;
        let observer = null;
        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            observer?.disconnect();
            observer = null;
        };
        observer = new MutationObserver((mutations) => {
            if (fired) return;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node.matches?.(selector)) {
                        fired = true;
                        cleanup();
                        callback(node);
                        return;
                    }
                }
            }

            const matched = document.querySelector(selector);
            if (matched) {
                fired = true;
                cleanup();
                callback(matched);
            }
        });

        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        timeoutId = setTimeout(() => {
            if (!fired) cleanup();
        }, timeout);
        return cleanup;
    }

    function waitForPageContent(callback, fallbackSelector = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer') {
        if (typeof callback !== 'function') return () => {};
        let fired = false;
        let fallbackTimer = null;
        let cancelElementWait = null;
        const onPageUpdated = () => fire();
        const fire = () => {
            if (fired) return;
            fired = true;
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
            }
            if (cancelElementWait) {
                cancelElementWait();
                cancelElementWait = null;
            }
            document.removeEventListener('yt-page-data-updated', onPageUpdated);
            callback();
        };
        const cancel = () => {
            if (fired) return;
            fired = true;
            if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
            if (cancelElementWait) { cancelElementWait(); cancelElementWait = null; }
            document.removeEventListener('yt-page-data-updated', onPageUpdated);
        };

        document.addEventListener('yt-page-data-updated', onPageUpdated, { once: true });
        cancelElementWait = waitForElement(fallbackSelector, fire);
        fallbackTimer = setTimeout(fire, 3000);
        return cancel;
    }

    function getIsWatchPage() {
        return isWatchPagePath(window.location.pathname);
    }

    function disconnectWatchFlexyObserver() {
        watchFlexyObserver?.disconnect();
        watchFlexyObserver = null;
        watchFlexyObservedNode = null;
    }

    function ensureWatchFlexyObserver() {
        const watchFlexy = document.querySelector('ytd-watch-flexy');
        if (!watchFlexy) {
            if (watchFlexyObservedNode && !document.contains(watchFlexyObservedNode)) {
                disconnectWatchFlexyObserver();
            }
            return;
        }

        if (watchFlexyObservedNode === watchFlexy && watchFlexyObserver) return;

        disconnectWatchFlexyObserver();
        watchFlexyObservedNode = watchFlexy;
        watchFlexyObserver = new MutationObserver(() => debouncedRunNavigateRules());
        watchFlexyObserver.observe(watchFlexy, {
            attributes: true,
            attributeFilter: ['video-id']
        });
    }

    function _executeNavigateRules() {
        const isWatch = getIsWatchPage();
        ensureWatchFlexyObserver();
        for (const rule of navigateRules.values()) {
            try {
                rule(document.body, isWatch);
            } catch (error) {
                console.error('[YTKit] Navigate rule error:', error);
            }
        }
    }

    let lastNavHref = (typeof location !== 'undefined') ? location.href : '';
    function runNavigateRules() {
        const href = (typeof location !== 'undefined') ? location.href : '';
        const urlChanged = href !== lastNavHref;
        lastNavHref = href;
        if (urlChanged || pendingMutationRouteReset) {
            resetMutationRuleHealthForRoute();
            // Hidden-card counts are per navigation: "42 cards hidden" only
            // means something against one feed. This is the same boundary the
            // mutation-rule budgets reset on, so the two always agree.
            core.resetHideAttribution?.();
        }
        pendingMutationRouteReset = false;
        // Only pay for a full-page view-transition snapshot on a real URL
        // change. `yt-page-data-updated` also fires as the feed appends items
        // during infinite scroll (same URL) — wrapping those in
        // startViewTransition froze rendering and cross-faded the whole
        // document mid-scroll. The navigate rules themselves still run every
        // time; only the (cosmetic) cross-fade is gated to genuine navigations.
        const reducedMotion = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!urlChanged || reducedMotion || typeof document.startViewTransition !== 'function') {
            _executeNavigateRules();
            return;
        }

        let executed = false;
        try {
            document.startViewTransition(() => {
                executed = true;
                _executeNavigateRules();
            });
        } catch (_) {
            // A transition can be rejected while another document transition
            // is active. Navigation rules are functional, so never let a
            // cosmetic API prevent them from running.
            if (!executed) _executeNavigateRules();
        }
    }

    function debouncedRunNavigateRules(event) {
        if (event?.type === 'yt-navigate-finish' || event?.type === 'popstate') {
            pendingMutationRouteReset = true;
        }
        if (navigateDebounceTimer) clearTimeout(navigateDebounceTimer);
        navigateDebounceTimer = setTimeout(runNavigateRules, runtime.navDebounce);
    }

    // v3.23.0 (L1): Navigation API self-detection for platform-owned SPA
    // route dispatch. YouTube's events remain the compatibility path for
    // browsers without `window.navigation` or for implementations that
    // expose the object but reject listener registration.
    // Refs:
    //   https://github.com/tampermonkey/tampermonkey/issues/2673
    //   https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API
    let navigationApiHandler = null;

    function attachNavigationApi() {
        if (navigationApiHandler) return true;
        if (typeof window.navigation?.addEventListener !== 'function') return false;
        navigationApiHandler = () => {
            pendingMutationRouteReset = true;
            debouncedRunNavigateRules({ type: 'navigate' });
        };
        try {
            // `navigatesuccess` — NOT `navigate`. The navigate event fires
            // BEFORE the navigation commits, so rules ran against the outgoing
            // page's DOM, and it also fires for things yt-navigate-finish never
            // signalled: downloads, cancelled navigations, replaceState and
            // cross-document link clicks, each of which forced a route-health
            // reset for a route change that never happened. navigatesuccess is
            // the platform's post-commit signal and the true analogue of the
            // yt-navigate-finish this path replaces.
            //
            // (The previous code tried to await `event.committed`, but that
            // property does not exist on NavigateEvent — {committed, finished}
            // is the RESULT of navigation.navigate(). The branch was dead in
            // every browser and only the test fake, which fabricated the
            // property, could enter it.)
            window.navigation.addEventListener('navigatesuccess', navigationApiHandler);
            return true;
        } catch (_) {
            // reason: Navigation API surface is experimental; some
            // browsers expose `navigation` but reject addEventListener.
            // Fall back to the existing yt-*/popstate chain silently.
            navigationApiHandler = null;
            return false;
        }
    }

    function detachNavigationApi() {
        if (!navigationApiHandler) return;
        try {
            window.navigation.removeEventListener('navigatesuccess', navigationApiHandler);
        } catch (_) {
            // reason: removeEventListener mismatch is harmless; the
            // listener will be GC'd when the page unloads.
        }
        navigationApiHandler = null;
    }

    function ensureNavigateListener() {
        if (isNavigateListenerAttached) return;

        const navigationApiAttached = attachNavigationApi();
        if (!navigationApiAttached) {
            document.addEventListener('yt-navigate-finish', debouncedRunNavigateRules);
            window.addEventListener('popstate', debouncedRunNavigateRules);
        }
        // This is a same-URL content refresh signal, not the primary route
        // detector; keep it active for feed/page-data re-renders.
        document.addEventListener('yt-page-data-updated', debouncedRunNavigateRules);

        ensureWatchFlexyObserver();
        runNavigateRules();
        isNavigateListenerAttached = true;
    }

    function stopNavigateListener() {
        if (!isNavigateListenerAttached) return;

        if (navigationApiHandler) {
            detachNavigationApi();
        } else {
            document.removeEventListener('yt-navigate-finish', debouncedRunNavigateRules);
            window.removeEventListener('popstate', debouncedRunNavigateRules);
        }
        document.removeEventListener('yt-page-data-updated', debouncedRunNavigateRules);
        if (navigateDebounceTimer) {
            clearTimeout(navigateDebounceTimer);
            navigateDebounceTimer = null;
        }
        disconnectWatchFlexyObserver();
        isNavigateListenerAttached = false;
    }

    function addNavigateRule(id, ruleFn) {
        if (!id || typeof ruleFn !== 'function') return;
        ensureNavigateListener();
        navigateRules.set(id, ruleFn);
        try {
            ruleFn(document.body, getIsWatchPage());
        } catch (error) {
            console.error('[YTKit] Navigate rule error:', error);
        }
    }

    function removeNavigateRule(id) {
        navigateRules.delete(id);
        if (navigateRules.size === 0 && !hasAnyMutationRule()) {
            stopNavigateListener();
        }
    }

    // Collect newly-added Element nodes from a mutation record batch so scoped
    // rules can selector-match once without each rule walking the tree again.
    function collectAddedElements(records) {
        const added = [];
        for (const record of records) {
            if (record.type !== 'childList') continue;
            for (const node of record.addedNodes) {
                if (node && node.nodeType === 1) added.push(node);
            }
        }
        return added;
    }

    function anyAddedMatchesSelector(addedElements, selector) {
        if (!addedElements.length) return false;
        for (const el of addedElements) {
            if (typeof el.matches === 'function' && el.matches(selector)) return true;
            if (typeof el.querySelector === 'function' && el.querySelector(selector)) return true;
        }
        return false;
    }

    function getRouteLabel() {
        return String((typeof location !== 'undefined' && location.pathname) || 'unknown').slice(0, 160);
    }

    function createMutationRuleHealth(id, kind) {
        const now = nowMs();
        return {
            featureId: String(id).slice(0, 100),
            kind,
            route: getRouteLabel(),
            routeGeneration: mutationRouteGeneration,
            invocations: 0,
            durationMs: 0,
            windowStartedAt: now,
            windowInvocations: 0,
            windowDurationMs: 0,
            ownedMutations: 0,
            windowOwnedMutations: 0,
            circuitOpen: false,
            reason: null,
            openedAt: null
        };
    }

    function getOrCreateMutationRuleHealth(id, kind) {
        let health = mutationRuleHealth.get(id);
        if (!health || health.routeGeneration !== mutationRouteGeneration || health.kind !== kind) {
            health = createMutationRuleHealth(id, kind);
            mutationRuleHealth.set(id, health);
        }
        return health;
    }

    function emitMutationRuleDiagnostic(health) {
        const diagnostic = {
            at: new Date().toISOString(),
            featureId: health.featureId,
            kind: health.kind,
            route: health.route,
            routeGeneration: health.routeGeneration,
            reason: health.reason,
            invocations: health.invocations,
            durationMs: Math.round(health.durationMs * 10) / 10,
            windowInvocations: health.windowInvocations,
            windowDurationMs: Math.round(health.windowDurationMs * 10) / 10,
            ownedMutations: health.ownedMutations
        };
        mutationRuleDiagnostics.push(diagnostic);
        while (mutationRuleDiagnostics.length > MUTATION_DIAGNOSTIC_CAP) {
            mutationRuleDiagnostics.shift();
        }
        if (typeof document?.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            document.dispatchEvent(new CustomEvent('ytkit-mutation-rule-circuit-open', {
                detail: diagnostic
            }));
        }
    }

    function openMutationRuleCircuit(health, reason) {
        if (health.circuitOpen) return;
        health.circuitOpen = true;
        health.reason = reason;
        health.openedAt = new Date().toISOString();
        emitMutationRuleDiagnostic(health);
    }

    function evaluateMutationRuleBudget(health, elapsedMs) {
        if (elapsedMs >= runtime.mutationRuleMaxSingleDurationMs) {
            openMutationRuleCircuit(health, 'single-duration');
            return;
        }
        if (health.windowDurationMs >= runtime.mutationRuleMaxDurationMs) {
            openMutationRuleCircuit(health, 'window-duration');
            return;
        }
        // Scoped rules are invoked only for their own selector. Broad rules
        // share every observer batch, so an invocation-only breaker would
        // disable innocent peers during a DOM storm. For broad rules, require
        // direct synchronous mutation evidence captured via takeRecords().
        if (health.windowInvocations >= runtime.mutationRuleMaxInvocations
            && (health.kind === 'scoped' || health.windowOwnedMutations > 0)) {
            openMutationRuleCircuit(health, 'window-invocations');
        }
    }

    function executeMutationRule(id, kind, ruleFn, args) {
        const health = getOrCreateMutationRuleHealth(id, kind);
        if (health.circuitOpen) return false;
        const startedAt = nowMs();
        if ((startedAt - health.windowStartedAt) >= runtime.mutationRuleWindowMs) {
            health.windowStartedAt = startedAt;
            health.windowInvocations = 0;
            health.windowDurationMs = 0;
            health.windowOwnedMutations = 0;
        }
        let error = null;
        try {
            // Mutation-rule ids ARE feature ids (addMutationRule(this.id, …)),
            // so this is the widest window in which selector resolutions can
            // be credited to the feature that depends on them. Guarded because
            // navigation.js and selectors.js are loaded concurrently and
            // either can be absent in a unit-test harness.
            const attribute = core.withSelectorAttribution;
            if (typeof attribute === 'function') attribute(id, () => ruleFn(...args));
            else ruleFn(...args);
        } catch (caught) {
            error = caught;
        }
        const ownedRecords = typeof mutationObserver?.takeRecords === 'function'
            ? mutationObserver.takeRecords()
            : [];
        const ownedMutationCount = Array.isArray(ownedRecords) ? ownedRecords.length : 0;
        const elapsedMs = Math.max(0, nowMs() - startedAt);
        health.invocations += 1;
        health.durationMs += elapsedMs;
        health.windowInvocations += 1;
        health.windowDurationMs += elapsedMs;
        health.ownedMutations += ownedMutationCount;
        health.windowOwnedMutations += ownedMutationCount;
        evaluateMutationRuleBudget(health, elapsedMs);
        if (ownedMutationCount > 0) observerCallback(ownedRecords);
        if (error) {
            console.error(
                kind === 'scoped' ? '[YTKit] Scoped mutation rule error:' : '[YTKit] Mutation rule error:',
                error
            );
        }
        return !health.circuitOpen;
    }

    function runMutationRules(targetNode, records) {
        for (const [id, rule] of mutationRules) {
            executeMutationRule(id, 'broad', rule, [targetNode]);
        }

        if (scopedMutationRules.size === 0) return;
        const addedElements = collectAddedElements(records);
        for (const [id, entry] of scopedMutationRules) {
            try {
                // Fast path: empty batch (observer fired from attribute-only
                // mutation) — skip the rule entirely.
                if (!addedElements.length) continue;
                if (!anyAddedMatchesSelector(addedElements, entry.selector)) continue;
                executeMutationRule(id, 'scoped', entry.ruleFn, [targetNode, addedElements]);
            } catch (error) {
                console.error('[YTKit] Scoped mutation rule error:', error);
            }
        }
    }

    // Cap pending records so a hidden tab (where rAF never fires) doesn't
    // grow the array indefinitely, pinning detached subtrees for hours.
    var PENDING_MUTATION_CAP = 2000;
    var mutationFallbackTimer = null;

    function drainMutationRecords() {
        mutationScheduled = false;
        if (mutationFallbackTimer) { clearTimeout(mutationFallbackTimer); mutationFallbackTimer = null; }
        const drained = pendingMutationRecords;
        pendingMutationRecords = [];
        runMutationRules(document.body, drained);
    }

    function observerCallback(records) {
        if (records && records.length) {
            for (const record of records) pendingMutationRecords.push(record);
            // Drop oldest records when the cap is exceeded — the alternative
            // (unbounded growth) pins detached DOM subtrees for the entire
            // background-tab lifetime and drains in one giant pass on refocus.
            if (pendingMutationRecords.length > PENDING_MUTATION_CAP) {
                pendingMutationRecords = pendingMutationRecords.slice(-PENDING_MUTATION_CAP);
            }
        }
        if (mutationScheduled) return;
        mutationScheduled = true;
        requestAnimationFrame(drainMutationRecords);
        // Fallback drain for hidden tabs where rAF doesn't fire: setTimeout
        // still runs (throttled to ~1 Hz) so records don't accumulate forever.
        if (!mutationFallbackTimer) {
            mutationFallbackTimer = setTimeout(() => {
                mutationFallbackTimer = null;
                if (mutationScheduled) drainMutationRecords();
            }, 2000);
        }
    }

    function startObserver() {
        if (mutationObserver) return;
        mutationObserver = new MutationObserver(observerCallback);
        mutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['theater', 'fullscreen', 'hidden', 'video-id', 'page-subtype']
        });
    }

    function stopObserver() {
        if (!mutationObserver) return;
        mutationObserver.disconnect();
        mutationObserver = null;
        pendingMutationRecords = [];
        // Reset scheduling state or an orphaned rAF/fallback drain fires
        // against rules registered later, and a stale-true flag suppresses
        // fresh drains until the old fallback timer lapses.
        mutationScheduled = false;
        if (mutationFallbackTimer) { clearTimeout(mutationFallbackTimer); mutationFallbackTimer = null; }
    }

    function hasAnyMutationRule() {
        return mutationRules.size > 0 || scopedMutationRules.size > 0;
    }

    function addMutationRule(id, ruleFn) {
        if (!id || typeof ruleFn !== 'function') return;
        if (!hasAnyMutationRule()) {
            startObserver();
            ensureNavigateListener();
        }
        mutationRules.set(id, ruleFn);
        mutationRuleHealth.set(id, createMutationRuleHealth(id, 'broad'));
        executeMutationRule(id, 'broad', ruleFn, [document.body]);
    }

    function removeMutationRule(id) {
        mutationRules.delete(id);
        mutationRuleHealth.delete(id);
        if (!hasAnyMutationRule()) {
            stopObserver();
            if (navigateRules.size === 0) stopNavigateListener();
        }
    }

    // Scoped mutation rule — only runs when a node matching `selector` is
    // added anywhere in the observed subtree. Massively cuts per-frame work
    // for feed-driven features that previously did `document.querySelectorAll`
    // on every mutation tick.
    //
    // `ruleFn` receives `(targetNode, addedElements)` where `addedElements`
    // is the array of Element nodes inserted in this batch. The rule can
    // scope its own work to that array instead of the whole document.
    function addScopedMutationRule(id, selector, ruleFn) {
        if (!id || typeof selector !== 'string' || typeof ruleFn !== 'function') return;
        if (!hasAnyMutationRule()) {
            startObserver();
            ensureNavigateListener();
        }
        scopedMutationRules.set(id, { selector, ruleFn });
        mutationRuleHealth.set(id, createMutationRuleHealth(id, 'scoped'));
        executeMutationRule(id, 'scoped', ruleFn, [document.body, []]);
    }

    function removeScopedMutationRule(id) {
        scopedMutationRules.delete(id);
        mutationRuleHealth.delete(id);
        if (!hasAnyMutationRule()) {
            stopObserver();
            if (navigateRules.size === 0) stopNavigateListener();
        }
    }

    function resetMutationRuleHealthForRoute() {
        mutationRouteGeneration += 1;
        for (const id of mutationRules.keys()) {
            mutationRuleHealth.set(id, createMutationRuleHealth(id, 'broad'));
        }
        for (const id of scopedMutationRules.keys()) {
            mutationRuleHealth.set(id, createMutationRuleHealth(id, 'scoped'));
        }
    }

    function retryMutationRule(id) {
        if (mutationRules.has(id)) {
            mutationRuleHealth.set(id, createMutationRuleHealth(id, 'broad'));
            return true;
        }
        if (scopedMutationRules.has(id)) {
            mutationRuleHealth.set(id, createMutationRuleHealth(id, 'scoped'));
            return true;
        }
        return false;
    }

    function getMutationRuleHealthSnapshot() {
        return Array.from(mutationRuleHealth.values(), (health) => ({
            featureId: health.featureId,
            kind: health.kind,
            route: health.route,
            routeGeneration: health.routeGeneration,
            invocations: health.invocations,
            durationMs: Math.round(health.durationMs * 10) / 10,
            windowInvocations: health.windowInvocations,
            windowDurationMs: Math.round(health.windowDurationMs * 10) / 10,
            ownedMutations: health.ownedMutations,
            circuitOpen: health.circuitOpen,
            reason: health.reason,
            openedAt: health.openedAt
        }));
    }

    function getMutationRuleDiagnostics() {
        return mutationRuleDiagnostics.slice();
    }

    const budgetedScanDiagnostics = [];

    function nowMs() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
            return performance.now();
        }
        return Date.now();
    }

    function recordBudgetedScanDiagnostic(entry) {
        budgetedScanDiagnostics.push({
            at: new Date().toISOString(),
            label: entry.label,
            total: entry.total,
            processed: entry.processed,
            chunks: entry.chunks,
            durationMs: Math.round(entry.durationMs * 10) / 10,
            budgetMs: entry.budgetMs,
            cancelled: !!entry.cancelled
        });
        while (budgetedScanDiagnostics.length > 20) budgetedScanDiagnostics.shift();
    }

    function runBudgetedElementBatch(items, callback, options = {}) {
        const list = Array.from(items || []);
        const label = String(options.label || 'budgeted-scan').slice(0, 80);
        const chunkSize = Math.max(1, Math.floor(Number(options.chunkSize) || 80));
        const budgetMs = Math.max(1, Number(options.budgetMs) || 8);
        const yieldMs = Math.max(0, Number(options.yieldMs) || 0);
        const warnAfterMs = Math.max(budgetMs, Number(options.warnAfterMs) || 16);
        let index = 0;
        let chunks = 0;
        let timer = null;
        let cancelled = false;
        let finished = false;
        const startedAt = nowMs();

        let resolvePromise;
        const promise = new Promise(resolve => { resolvePromise = resolve; });

        const finish = () => {
            if (finished) return;
            finished = true;
            const durationMs = nowMs() - startedAt;
            const result = {
                label,
                total: list.length,
                processed: index,
                chunks,
                durationMs,
                budgetMs,
                cancelled
            };
            if (chunks > 1 || durationMs > warnAfterMs || cancelled) recordBudgetedScanDiagnostic(result);
            resolvePromise(result);
        };

        const step = () => {
            timer = null;
            if (cancelled) { finish(); return; }
            const chunkStartedAt = nowMs();
            let processedInChunk = 0;
            while (index < list.length && processedInChunk < chunkSize) {
                // A throwing callback must not abandon the whole batch: that
                // would leave `promise` forever unsettled and strand callers
                // that gate cleanup on it. Skip the bad item and keep going.
                try {
                    callback(list[index], index, list);
                } catch (e) {
                    // reason: per-item batch failures are isolated so one bad
                    // element cannot stall the scan or leak the pending promise.
                }
                index += 1;
                processedInChunk += 1;
                if (cancelled) break;
                if ((nowMs() - chunkStartedAt) >= budgetMs) break;
            }
            chunks += 1;
            if (index < list.length && !cancelled) {
                timer = setTimeout(step, yieldMs);
                return;
            }
            finish();
        };

        timer = setTimeout(step, 0);

        return {
            cancel() {
                if (cancelled) return;
                cancelled = true;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                finish();
            },
            promise,
            get cancelled() { return cancelled; }
        };
    }

    function getBudgetedScanDiagnostics() {
        return budgetedScanDiagnostics.slice();
    }

    Object.assign(core, {
        addMutationRule,
        addNavigateRule,
        addScopedMutationRule,
        configureNavigationRuntime,
        getBudgetedScanDiagnostics,
        getMutationRuleDiagnostics,
        getMutationRuleHealthSnapshot,
        removeMutationRule,
        removeNavigateRule,
        removeScopedMutationRule,
        retryMutationRule,
        runBudgetedElementBatch,
        waitForElement,
        waitForPageContent
    });
})();
