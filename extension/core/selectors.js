(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.findSurfaceElement && core.SurfaceSelectorMap) return;

    function freezeEntry(entry) {
        return Object.freeze({
            stable: Object.freeze([...(entry.stable || [])]),
            fallback: Object.freeze([...(entry.fallback || [])]),
            // v4.31.0: capture provenance + last-verified date promoted to
            // public entry shape so the popup health surface (and any
            // future selector-pack inspector) can show "verified
            // 2026-05-19 against 4 captures" alongside the live miss
            // counts already shown by selector-health.js.
            captureEvidence: Object.freeze([...(entry.captureEvidence || [])]),
            lastVerified: entry.lastVerified || null,
            highChurn: !!entry.highChurn,
            needsFreshCapture: !!entry.needsFreshCapture,
            notes: entry.notes || ''
        });
    }

    // v4.31.0 → v4.37.0 selector-pack file split. All 28 surfaces now
    // live in extension/core/selector-packs/<surface>.js and register
    // themselves into globalThis.YTKitCore.SurfacePackRegistry before
    // this file runs (manifest content_scripts ordering enforces it).
    // INLINE_SURFACES remains as the override hook — any future
    // diagnostic / temporary surface can be declared here without
    // having to add a pack file. Packs win when both define a surface
    // so a v5.1.x+ pack file can override an inline entry without
    // touching this file.
    const INLINE_SURFACES = {};

    const packRegistry = core.SurfacePackRegistry || new Map();
    const surfaceNames = new Set([...Object.keys(INLINE_SURFACES), ...packRegistry.keys()]);
    const SurfaceSelectorMap = Object.freeze(Object.fromEntries(
        [...surfaceNames].map((surface) => {
            const packEntry = packRegistry.get(surface);
            const source = packEntry || INLINE_SURFACES[surface];
            return [surface, freezeEntry(source)];
        })
    ));

    const SurfaceSelectors = Object.freeze(Object.fromEntries(
        Object.entries(SurfaceSelectorMap).map(([surface, entry]) => [
            surface,
            Object.freeze([...entry.stable, ...entry.fallback])
        ])
    ));

    const emittedMisses = new Set();
    const selectorStats = new Map();
    // Bound the diagnostic maps. Over a multi-hour YouTube session the resolver
    // can be called against many fragile fallbacks, and the (surface, selector)
    // tuple is unbounded — without a cap the diagnostic surface itself becomes
    // a slow memory leak. When we hit the cap we drop the oldest entry (Map
    // preserves insertion order so .keys().next() is the LRU-ish candidate).
    const SELECTOR_STATS_CAP = 512;
    const EMITTED_MISSES_CAP = 1024;

    function _enforceMapCap(map, cap) {
        while (map.size > cap) {
            const first = map.keys().next().value;
            if (first == null) break;
            map.delete(first);
        }
    }
    function _enforceSetCap(set, cap) {
        while (set.size > cap) {
            const first = set.values().next().value;
            if (first == null) break;
            set.delete(first);
        }
    }

    function normalizeSelectorList(selectors) {
        if (!selectors) return [];
        if (typeof selectors === 'string') return selectors.trim() ? [selectors.trim()] : [];
        if (!Array.isArray(selectors)) return [];
        return selectors
            .map((selector) => String(selector || '').trim())
            .filter(Boolean);
    }

    function normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        let surface = 'custom';
        let selectors = surfaceOrSelectors;
        let options = selectorsOrOptions || {};

        if (typeof surfaceOrSelectors === 'string' && SurfaceSelectors[surfaceOrSelectors]) {
            surface = surfaceOrSelectors;
            selectors = selectorsOrOptions;
            if (!selectors || (typeof selectors === 'object' && !Array.isArray(selectors))) {
                options = selectors || {};
                selectors = SurfaceSelectors[surface];
            } else {
                options = maybeOptions || {};
            }
        } else if (Array.isArray(surfaceOrSelectors) && selectorsOrOptions && !Array.isArray(selectorsOrOptions)) {
            options = selectorsOrOptions;
        }

        return {
            surface,
            selectors: normalizeSelectorList(selectors),
            options: options || {}
        };
    }

    function getSelectorStat(surface, selector) {
        const key = `${surface}:${selector}`;
        if (!selectorStats.has(key)) {
            selectorStats.set(key, {
                surface,
                selector,
                attempts: 0,
                hits: 0,
                misses: 0,
                errors: 0,
                firstMissAt: null,
                lastMissAt: null,
                lastHitAt: null,
                lastError: null,
                lastOutcome: 'untested',
                // v4.5+: DOM-shape drift tracking. The selector may keep
                // hitting (no miss/error) while the matched node's identifier
                // shape silently changes (iSponsorBlockTV signal: YouTube
                // changed a paired device-screen-id from 26 chars to 64).
                // firstShape: shape signature at first hit. lastShape: most
                // recent observation. shapeDrifts: count of transitions. The
                // signatures are short opaque strings produced by the caller
                // (recordSelectorShape) so this module doesn't need to know
                // what 'shape' means for each surface.
                firstShape: null,
                lastShape: null,
                shapeDrifts: 0,
                lastShapeAt: null,
                firstShapeAt: null
            });
            _enforceMapCap(selectorStats, SELECTOR_STATS_CAP);
        }
        return selectorStats.get(key);
    }

    function recordSelectorAttempt(surface, selector, outcome, error = null) {
        const stat = getSelectorStat(surface, selector);
        stat.attempts += 1;
        stat.lastOutcome = outcome;
        const now = Date.now();
        if (outcome === 'hit') {
            stat.hits += 1;
            stat.lastHitAt = now;
            return stat;
        }
        if (outcome === 'error') {
            stat.errors += 1;
            stat.lastError = error ? String(error.message || error).slice(0, 240) : null;
        } else {
            stat.misses += 1;
        }
        if (!stat.firstMissAt) stat.firstMissAt = now;
        stat.lastMissAt = now;
        return stat;
    }

    function emitSelectorMiss(surface, selector, error, options = {}) {
        const key = `${surface}:${selector}`;
        if (emittedMisses.has(key)) return;
        emittedMisses.add(key);
        _enforceSetCap(emittedMisses, EMITTED_MISSES_CAP);
        const stat = getSelectorStat(surface, selector);
        const detail = {
            surface,
            selector,
            error: error ? String(error.message || error) : null,
            attempts: stat.attempts,
            misses: stat.misses,
            errors: stat.errors,
            firstMissAt: stat.firstMissAt,
            at: Date.now()
        };
        try {
            globalThis.dispatchEvent?.(new CustomEvent('ytkit-selector-miss', { detail }));
        } catch (_) {
            // CustomEvent is unavailable in some unit-test contexts.
        }
        if (options.debug) {
            console.debug('[YTKit] Selector miss:', detail);
        }
    }

    function recordMiss(surface, selector, error, options = {}) {
        recordSelectorAttempt(surface, selector, error ? 'error' : 'miss', error);
        emitSelectorMiss(surface, selector, error, options);
    }

    function recordHit(surface, selector) {
        recordSelectorAttempt(surface, selector, 'hit');
    }

    // v4.5+ (iter-5 N5): DOM-shape drift recorder.
    //
    // Callers compute a short opaque "shape signature" for the matched node —
    // e.g. `attr-len:11` for an 11-char [video-id], `children-count:5` for a
    // shelf with 5 cards, `tag:DIV` for an element-tag fingerprint. The
    // signature is opaque to this module: any consistent string works.
    //
    // When the signature differs from the prior recorded shape for the same
    // (surface, selector) pair, we count a drift and emit a
    // `ytkit-selector-shape-drift` CustomEvent. The popup-side health surface
    // can listen for this and surface "iSponsorBlockTV-class drift" to the
    // user before a hashed-class refactor silently breaks a feature.
    //
    // Defensive properties:
    //   - shapeKey clamped to 120 chars at the boundary (no payload bloat)
    //   - same-shape repeat is silent (just refresh lastSeen — no event)
    //   - per-(surface, selector) cooldown suppresses event storms from
    //     oscillating nodes (Q1 S3 WARN). shapeDrifts still increments so
    //     suppressed drifts remain visible in the health snapshot.
    //   - re-entrancy guarded — a listener that synchronously calls
    //     recordSelectorShape() will NOT recurse into a second dispatch
    //     within the same call stack (Q1 S5 WARN).
    //   - prefer chrome.runtime.sendMessage when available so the drift
    //     signal stays extension-internal (Q1 S2 WARN: a CustomEvent on
    //     globalThis is observable to page-context scripts in the same
    //     frame, which leaks selector names). Falls back to CustomEvent
    //     dispatch only when no extension messaging context exists
    //     (userscript / unit-test contexts).
    const SHAPE_DRIFT_COOLDOWN_MS = 1000;
    const SHAPE_DRIFT_REENTRY_FLAG = Symbol('ytkit-shape-drift-reentry');
    function recordSelectorShape(surface, selector, shapeKey) {
        if (typeof shapeKey !== 'string' || !shapeKey) return null;
        if (shapeKey.length > 120) shapeKey = shapeKey.slice(0, 120);
        const stat = getSelectorStat(surface, selector);
        const now = Date.now();
        if (stat.firstShape == null) {
            stat.firstShape = shapeKey;
            stat.firstShapeAt = now;
            stat.lastShape = shapeKey;
            stat.lastShapeAt = now;
            return { stat, drifted: false };
        }
        if (stat.lastShape === shapeKey) {
            // Same shape — quiet path; just refresh last-seen.
            stat.lastShapeAt = now;
            return { stat, drifted: false };
        }
        // Real drift: shape changed since last observation.
        const previousShape = stat.lastShape;
        stat.lastShape = shapeKey;
        stat.lastShapeAt = now;
        stat.shapeDrifts += 1;

        // Cooldown: suppress event emission if the same (surface, selector)
        // pair already emitted within SHAPE_DRIFT_COOLDOWN_MS. The drift
        // count still increments so the saturation is visible in the
        // health snapshot — we just don't broadcast every alternation.
        if (stat._lastEmitAt && (now - stat._lastEmitAt) < SHAPE_DRIFT_COOLDOWN_MS) {
            return { stat, drifted: true, previousShape, suppressed: 'cooldown' };
        }

        // Re-entrancy: if a listener for `ytkit-selector-shape-drift`
        // synchronously calls back into recordSelectorShape, do not
        // recurse into a second dispatch on this call stack.
        if (globalThis[SHAPE_DRIFT_REENTRY_FLAG]) {
            return { stat, drifted: true, previousShape, suppressed: 'reentry' };
        }

        stat._lastEmitAt = now;
        const detail = {
            surface,
            selector,
            previousShape,
            currentShape: shapeKey,
            drifts: stat.shapeDrifts,
            firstShape: stat.firstShape,
            firstShapeAt: stat.firstShapeAt,
            at: now
        };

        // Prefer extension-internal messaging when available — keeps the
        // drift signal off the shared DOM where page scripts can listen.
        // chrome.runtime is the actual extension surface; the background
        // service worker is the natural drift-event consumer.
        let messagedExt = false;
        try {
            const runtime = (typeof chrome !== 'undefined' && chrome?.runtime)
                || (typeof browser !== 'undefined' && browser?.runtime)
                || null;
            if (runtime?.sendMessage) {
                runtime.sendMessage({
                    type: 'YTKIT_SELECTOR_SHAPE_DRIFT',
                    detail
                }, () => {
                    // swallow lastError — no receiver in popup is OK
                    void (runtime.lastError || null);
                });
                messagedExt = true;
            }
        } catch (_) {
            // Extension context unavailable; fall through to CustomEvent.
        }

        globalThis[SHAPE_DRIFT_REENTRY_FLAG] = true;
        try {
            // Always dispatch the CustomEvent too — unit tests and the
            // userscript build rely on it. In a real extension context
            // the chrome.runtime message above is the authoritative
            // channel; the event is purely a same-frame fallback.
            globalThis.dispatchEvent?.(new CustomEvent('ytkit-selector-shape-drift', { detail }));
        } catch (_) {
            // CustomEvent not available in some unit-test contexts.
        } finally {
            globalThis[SHAPE_DRIFT_REENTRY_FLAG] = false;
        }
        return { stat, drifted: true, previousShape, messagedExt };
    }

    function getQueryRoot(options = {}) {
        return options.root || document;
    }

    // v4.5+ (iter-5 N5 L3 follow-up): derive a default shape signature for
    // an Element so live resolver hits actually feed `recordSelectorShape`.
    // The L3 audit flagged that the recorder API existed but no live call
    // site invoked it. Default signature samples cheap, stable identifier
    // surfaces: video-id length, child count, tag name. Callers can pass
    // their own `options.shapeKey(node) -> string` for finer-grained
    // signatures (e.g. live chat may key on aria-label hashing).
    //
    // Returns null on non-Element or any throw so the resolver pipeline is
    // never broken by a shape-extraction edge case.
    function _defaultShapeKey(node) {
        try {
            if (!node || node.nodeType !== 1) return null;
            const parts = [];
            const tag = node.tagName ? String(node.tagName).toLowerCase() : '';
            if (tag) parts.push(`t:${tag}`);
            // [video-id] length is the canonical iSponsorBlockTV-class
            // drift signal — a stable selector that suddenly matches a
            // 32-char id where it used to match an 11-char id is exactly
            // the surface this detector exists for.
            const vid = node.getAttribute?.('video-id');
            if (typeof vid === 'string') parts.push(`vid-len:${vid.length}`);
            // [data-context-menu] / [data-stream-type] etc. attribute
            // counts give a coarse but useful surface fingerprint without
            // burning a full attribute walk.
            const attrCount = node.attributes?.length;
            if (typeof attrCount === 'number') parts.push(`attrs:${attrCount}`);
            const childCount = node.childElementCount;
            if (typeof childCount === 'number') parts.push(`children:${childCount}`);
            return parts.join('|') || null;
        } catch (_) {
            return null;
        }
    }

    function findSurfaceElement(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        const { surface, selectors, options } = normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions);
        const root = getQueryRoot(options);

        for (const selector of selectors) {
            try {
                const match = root.querySelector?.(selector);
                if (match) {
                    recordHit(surface, selector);
                    // v4.5+: live shape sampling. Custom shapeKey takes
                    // precedence so callers can pass surface-specific
                    // fingerprints; otherwise the default signature.
                    const sample = typeof options.shapeKey === 'function'
                        ? (function () { try { return options.shapeKey(match); } catch (_) { return null; } })()
                        : _defaultShapeKey(match);
                    if (sample) recordSelectorShape(surface, selector, sample);
                    return match;
                }
                recordMiss(surface, selector, null, options);
            } catch (error) {
                recordMiss(surface, selector, error, options);
            }
        }

        if (options.required) {
            throw new Error(`Required selector surface "${surface}" was not found.`);
        }
        return null;
    }

    function findSurfaceElements(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        const { surface, selectors, options } = normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions);
        const root = getQueryRoot(options);

        for (const selector of selectors) {
            try {
                const matches = Array.from(root.querySelectorAll?.(selector) || []);
                if (matches.length) {
                    recordHit(surface, selector);
                    // v4.5+: sample shape of the first match. Multi-match
                    // surfaces (feed cards, comment threads) have collection
                    // drift too — node count changes can be a drift signal
                    // distinct from any individual node's shape — so we
                    // fold `count:N` into the default signature.
                    const head = matches[0];
                    const sample = typeof options.shapeKey === 'function'
                        ? (function () { try { return options.shapeKey(head, matches); } catch (_) { return null; } })()
                        : (function () {
                            const base = _defaultShapeKey(head);
                            return base ? `${base}|set-count:${matches.length}` : `set-count:${matches.length}`;
                        })();
                    if (sample) recordSelectorShape(surface, selector, sample);
                    return matches;
                }
                recordMiss(surface, selector, null, options);
            } catch (error) {
                recordMiss(surface, selector, error, options);
            }
        }
        return [];
    }

    function waitForSurfaceElement(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        const { surface, selectors, options } = normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions);
        const immediate = findSurfaceElement(surface, selectors, { ...options, required: false });
        if (immediate) {
            options.onFound?.(immediate);
            return Promise.resolve(immediate);
        }

        const timeout = Number.isFinite(options.timeout) ? options.timeout : 3000;
        const selector = selectors.join(', ');
        if (!selector) return Promise.resolve(null);

        if (typeof core.waitForElement === 'function') {
            let cancel = null;
            let timeoutHandle = null;
            const promise = new Promise((resolve) => {
                cancel = core.waitForElement(selector, (element) => {
                    if (timeoutHandle != null) {
                        clearTimeout(timeoutHandle);
                        timeoutHandle = null;
                    }
                    options.onFound?.(element);
                    resolve(element);
                }, timeout);
                // Belt-and-suspenders timeout — `core.waitForElement` already
                // accepts a timeout, but bugs in its cleanup path used to leak
                // observers. We clear our own timer when the element resolves
                // so a found element doesn't fire a no-op resolve(null) later.
                timeoutHandle = setTimeout(() => {
                    timeoutHandle = null;
                    cancel?.();
                    resolve(null);
                }, timeout);
            });
            promise.cancel = () => {
                if (timeoutHandle != null) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }
                cancel?.();
            };
            return promise;
        }

        return new Promise((resolve) => {
            if (typeof MutationObserver !== 'function') {
                resolve(null);
                return;
            }
            const root = options.root || document.body || document.documentElement;
            if (!root) {
                resolve(null);
                return;
            }
            let observer = null;
            const timer = setTimeout(() => {
                observer?.disconnect();
                resolve(null);
            }, timeout);
            observer = new MutationObserver((records) => {
                for (const record of records) {
                    for (const node of record.addedNodes || []) {
                        if (node.nodeType !== 1) continue;
                        const found = findSurfaceElement(surface, selectors, { ...options, root: node });
                        if (found || selectors.some((candidate) => {
                            try { return node.matches?.(candidate); } catch (_) { return false; }
                        })) {
                            const element = found || node;
                            clearTimeout(timer);
                            observer.disconnect();
                            options.onFound?.(element);
                            resolve(element);
                            return;
                        }
                    }
                }
            });
            observer.observe(root, { childList: true, subtree: true });
        });
    }

    function getSurfaceSelectorEntry(surface) {
        const entry = SurfaceSelectorMap[surface];
        if (!entry) return null;
        return {
            surface,
            stable: [...entry.stable],
            fallback: [...entry.fallback],
            selectors: [...SurfaceSelectors[surface]],
            captureEvidence: [...(entry.captureEvidence || [])],
            lastVerified: entry.lastVerified,
            highChurn: entry.highChurn,
            needsFreshCapture: entry.needsFreshCapture,
            notes: entry.notes
        };
    }

    function getSurfaceSelectorChain(surface) {
        return SurfaceSelectors[surface] ? [...SurfaceSelectors[surface]] : [];
    }

    function getSelectorHealthSnapshot() {
        return Object.entries(SurfaceSelectorMap).map(([surface, entry]) => {
            const selectors = SurfaceSelectors[surface] || [];
            const selectorEntries = selectors.map((selector) => {
                // Read-only snapshot: never fall back to getSelectorStat (a
                // writer that .sets + _enforceMapCap). Synthesize a zero-stat
                // mirroring getSelectorStat's initializer field-for-field so a
                // diagnostics read can't create/evict telemetry.
                const stat = selectorStats.get(`${surface}:${selector}`) || {
                    surface,
                    selector,
                    attempts: 0,
                    hits: 0,
                    misses: 0,
                    errors: 0,
                    firstMissAt: null,
                    lastMissAt: null,
                    lastHitAt: null,
                    lastError: null,
                    lastOutcome: 'untested',
                    firstShape: null,
                    lastShape: null,
                    shapeDrifts: 0,
                    lastShapeAt: null,
                    firstShapeAt: null
                };
                return {
                    selector,
                    stable: entry.stable.includes(selector),
                    attempts: stat.attempts,
                    hits: stat.hits,
                    misses: stat.misses,
                    errors: stat.errors,
                    firstMissAt: stat.firstMissAt,
                    lastMissAt: stat.lastMissAt,
                    lastHitAt: stat.lastHitAt,
                    lastError: stat.lastError,
                    lastOutcome: stat.lastOutcome,
                    // v4.5+ shape-drift fields (iter-5 N5).
                    // hasShapeSample disambiguates "shapeDrifts:0 because the
                    // shape has been stable since first observation" from
                    // "shapeDrifts:0 because no live caller has invoked
                    // recordSelectorShape yet" — the L3 audit flagged that
                    // a poller could otherwise misread "no data" as "healthy".
                    hasShapeSample: stat.firstShape != null,
                    firstShape: stat.firstShape,
                    lastShape: stat.lastShape,
                    shapeDrifts: stat.shapeDrifts,
                    firstShapeAt: stat.firstShapeAt,
                    lastShapeAt: stat.lastShapeAt
                };
            });
            return {
                surface,
                highChurn: entry.highChurn,
                needsFreshCapture: entry.needsFreshCapture,
                stableSelectorCount: entry.stable.length,
                fallbackSelectorCount: entry.fallback.length,
                selectorCount: selectors.length,
                hitCount: selectorEntries.reduce((sum, item) => sum + item.hits, 0),
                missCount: selectorEntries.reduce((sum, item) => sum + item.misses, 0),
                errorCount: selectorEntries.reduce((sum, item) => sum + item.errors, 0),
                selectors: selectorEntries
            };
        });
    }

    function exportSelectorHealth() {
        return JSON.stringify({
            // v4.5+: schemaVersion bumped to 2 — health snapshot rows now carry
            // shape-drift fields (firstShape/lastShape/shapeDrifts/...).
            // Consumers parsing schemaVersion 1 ignore the new keys safely.
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            surfaces: getSelectorHealthSnapshot()
        }, null, 2);
    }

    Object.assign(core, {
        SurfaceSelectorMap,
        SurfaceSelectors,
        exportSelectorHealth,
        findSurfaceElement,
        findSurfaceElements,
        getSelectorHealthSnapshot,
        getSurfaceSelectorChain,
        getSurfaceSelectorEntry,
        normalizeSelectorList,
        recordSelectorShape,
        waitForSurfaceElement
    });
})();
