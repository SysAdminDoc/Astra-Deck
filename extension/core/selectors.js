(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.findSurfaceElement && core.SurfaceSelectorMap) return;

    function freezeHookMap(hooks) {
        return Object.freeze(Object.fromEntries(
            Object.entries(hooks || {}).map(([hook, value]) => [
                hook,
                Object.freeze({
                    stable: Object.freeze(normalizeSelectorList(value?.stable)),
                    fallback: Object.freeze(normalizeSelectorList(value?.fallback)),
                    notes: value?.notes || ''
                })
            ])
        ));
    }

    function freezeEntry(entry) {
        return Object.freeze({
            stable: Object.freeze([...(entry.stable || [])]),
            fallback: Object.freeze([...(entry.fallback || [])]),
            hooks: freezeHookMap(entry.hooks),
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
    let SurfaceSelectorMap = Object.freeze(Object.fromEntries(
        [...surfaceNames].map((surface) => {
            const packEntry = packRegistry.get(surface);
            const source = packEntry || INLINE_SURFACES[surface];
            return [surface, freezeEntry(source)];
        })
    ));

    let SurfaceSelectors = Object.freeze(Object.fromEntries(
        Object.entries(SurfaceSelectorMap).map(([surface, entry]) => [
            surface,
            Object.freeze([...entry.stable, ...entry.fallback])
        ])
    ));
    const SHIPPED_SURFACE_SELECTOR_MAP = SurfaceSelectorMap;
    const SHIPPED_SURFACE_SELECTORS = SurfaceSelectors;

    const emittedMisses = new Set();
    const selectorStats = new Map();
    // Bound the diagnostic maps. Over a multi-hour YouTube session the resolver
    // can be called against many fragile fallbacks, and the (surface, selector)
    // tuple is unbounded — without a cap the diagnostic surface itself becomes
    // a slow memory leak. When we hit the cap we drop the oldest entry (Map
    // preserves insertion order so .keys().next() is the LRU-ish candidate).
    const SELECTOR_STATS_CAP = 512;
    const EMITTED_MISSES_CAP = 1024;

    // v4.68.0 — feature attribution.
    //
    // Selector telemetry above is keyed by SURFACE, which answers "is this
    // selector still matching?" but not the question users actually ask:
    // "which of my features stopped working?". Nothing in the codebase maps
    // a feature to the surfaces it depends on, and a hand-maintained table
    // over ~470 features would be stale within a release.
    //
    // Instead the mapping is observed: callers that run feature code wrap it
    // in withSelectorAttribution(featureId, fn), and every surface resolution
    // performed inside that window is credited to the feature. The two entry
    // points that matter are the mutation-rule dispatcher (navigation.js,
    // which already knows the feature id) and feature init/destroy
    // (ytkit.js). Anything queried outside such a window is simply not
    // attributed — an unattributed surface never invents a feature.
    //
    // Recording happens at SURFACE granularity, not per selector: a surface
    // whose stable selector misses but whose fallback hits is working, and
    // per-selector attribution would report it as broken.
    const attributionStats = new Map();
    const ATTRIBUTION_FEATURE_CAP = 256;
    const ATTRIBUTION_SURFACE_CAP = 32;
    let attributionDepth = 0;
    let attributionFeatureId = null;

    function withSelectorAttribution(featureId, fn) {
        if (typeof fn !== 'function') return undefined;
        const id = String(featureId || '').trim();
        if (!id) return fn();
        const previousId = attributionFeatureId;
        // Nested windows keep the OUTERMOST feature: a feature that calls a
        // shared helper which itself attributes would otherwise credit the
        // helper and lose the caller.
        if (attributionDepth === 0) attributionFeatureId = id;
        attributionDepth += 1;
        try {
            return fn();
        } finally {
            attributionDepth -= 1;
            if (attributionDepth === 0) attributionFeatureId = previousId;
        }
    }

    function getAttributedFeatureId() {
        return attributionFeatureId;
    }

    // Which half of a surface's chain actually matched.
    //
    // `SurfaceSelectors[surface]` is `[...stable, ...fallback]`, so the
    // resolver walked the fallbacks only because every stable selector missed.
    // Until v4.88.3 nothing recorded which half won, so a surface whose stable
    // chain had broken reported a clean hit and stayed invisible until the
    // fallback broke too — across 29 high-churn surfaces.
    function selectorTier(surface, selector) {
        if (!surface || !selector) return 'unknown';
        // Hook lookups record under `surface.hook`, and hooks carry their own
        // stable/fallback chains. Without this split every hook hit reported
        // 'unknown' and hook-chain erosion was invisible.
        //
        // Split ONCE: hook names are validated against [A-Za-z0-9._-] and 19 of
        // the 25 shipped hooks contain a dot (`watch.action.like`), so a plain
        // split() dropped everything after the first one and resolved 36 of 48
        // hook chains to 'unknown'.
        const key = String(surface);
        const dot = key.indexOf('.');
        const surfaceName = dot === -1 ? key : key.slice(0, dot);
        const hookName = dot === -1 ? '' : key.slice(dot + 1);
        const surfaceEntry = SurfaceSelectorMap[surfaceName];
        if (!surfaceEntry) return 'unknown';
        const entry = hookName ? surfaceEntry.hooks?.[hookName] : surfaceEntry;
        if (!entry) return 'unknown';
        if (Array.isArray(entry.stable) && entry.stable.includes(selector)) return 'stable';
        if (Array.isArray(entry.fallback) && entry.fallback.includes(selector)) return 'fallback';
        return 'unknown';
    }

    function recordSurfaceOutcome(surface, selector, outcome, error = null) {
        const featureId = attributionFeatureId;
        if (!featureId || !surface) return null;
        let surfaces = attributionStats.get(featureId);
        if (!surfaces) {
            surfaces = new Map();
            attributionStats.set(featureId, surfaces);
            _enforceMapCap(attributionStats, ATTRIBUTION_FEATURE_CAP);
        }
        let row = surfaces.get(surface);
        if (!row) {
            row = {
                surface,
                resolutions: 0,
                hits: 0,
                misses: 0,
                lastOutcome: 'untested',
                lastHitAt: null,
                lastMissAt: null,
                lastSelector: null,
                lastError: null,
                lastTier: null,
                stableHits: 0,
                fallbackHits: 0
            };
            surfaces.set(surface, row);
            _enforceMapCap(surfaces, ATTRIBUTION_SURFACE_CAP);
        }
        const now = Date.now();
        row.resolutions += 1;
        row.lastOutcome = outcome;
        row.lastSelector = selector ? String(selector).slice(0, 240) : null;
        if (outcome === 'hit') {
            row.hits += 1;
            row.lastHitAt = now;
            row.lastError = null;
            const tier = selectorTier(surface, selector);
            row.lastTier = tier;
            if (tier === 'stable') row.stableHits += 1;
            else if (tier === 'fallback') row.fallbackHits += 1;
        } else {
            row.misses += 1;
            row.lastMissAt = now;
            row.lastError = error ? String(error.message || error).slice(0, 240) : null;
        }
        return row;
    }

    function getSelectorAttributionSnapshot() {
        const rows = [];
        for (const [featureId, surfaces] of attributionStats) {
            rows.push({
                featureId,
                surfaces: Array.from(surfaces.values(), (row) => ({ ...row }))
            });
        }
        return rows;
    }

    function resetSelectorAttribution() {
        attributionStats.clear();
        attributionDepth = 0;
        attributionFeatureId = null;
    }

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

    // Selector assets are data-only JSON. They never contain executable code,
    // and the shipped JS packs above remain the synchronous offline default.
    // A verified asset can replace the active map for this page session; any
    // malformed, oversized, or digest-mismatched candidate leaves the prior
    // map untouched and records a rollback in selector health.
    const SELECTOR_ASSET_SCHEMA_VERSION = 1;
    const SELECTOR_ASSET_MAX_BYTES = 256 * 1024;
    const SELECTOR_ASSET_MAX_PACKS = 128;
    const SELECTOR_ASSET_MAX_HOOKS = 96;
    const SELECTOR_ASSET_MAX_SELECTORS_PER_CHAIN = 32;
    const SELECTOR_ASSET_MAX_SELECTOR_CHARS = 512;
    const SELECTOR_ASSET_MAX_TOTAL_SELECTORS = 4096;
    const SELECTOR_ASSET_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
    const UNSAFE_ASSET_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

    function selectorAssetByteLength(value) {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
        return unescape(encodeURIComponent(text)).length;
    }

    function sortJsonValue(value) {
        if (Array.isArray(value)) return value.map(sortJsonValue);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJsonValue(value[key])]));
    }

    function selectorAssetPayload(asset) {
        return sortJsonValue({
            schemaVersion: asset.schemaVersion,
            assetVersion: asset.assetVersion,
            packs: asset.packs
        });
    }

    function canonicalSelectorAsset(asset) {
        return JSON.stringify(selectorAssetPayload(asset));
    }

    function normalizeAssetSelectorList(value, label, limits) {
        if (typeof value !== 'string' && !Array.isArray(value)) {
            throw new Error(`${label} is malformed`);
        }
        const rawSelectors = typeof value === 'string' ? [value] : value;
        if (rawSelectors.some((selector) => typeof selector !== 'string')) {
            throw new Error(`${label} contains a non-string selector`);
        }
        const selectors = normalizeSelectorList(value);
        if (selectors.length > limits.maxChain) throw new Error(`${label} has too many selectors`);
        if (selectors.some((selector) => selector.length > limits.maxChars
            || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(selector))) {
            throw new Error(`${label} contains an invalid selector`);
        }
        return selectors;
    }

    function normalizeSelectorAssetEntry(value, surface, total) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`Selector asset surface "${surface}" is malformed`);
        }
        const stable = normalizeAssetSelectorList(value.stable, `${surface}.stable`, {
            maxChain: SELECTOR_ASSET_MAX_SELECTORS_PER_CHAIN,
            maxChars: SELECTOR_ASSET_MAX_SELECTOR_CHARS
        });
        const fallback = normalizeAssetSelectorList(value.fallback, `${surface}.fallback`, {
            maxChain: SELECTOR_ASSET_MAX_SELECTORS_PER_CHAIN,
            maxChars: SELECTOR_ASSET_MAX_SELECTOR_CHARS
        });
        total.count += stable.length + fallback.length;
        if (total.count > SELECTOR_ASSET_MAX_TOTAL_SELECTORS) throw new Error('Selector asset has too many selectors');

        const hooks = {};
        if (value.hooks != null) {
            if (typeof value.hooks !== 'object' || Array.isArray(value.hooks)) {
                throw new Error(`${surface}.hooks is malformed`);
            }
            const hookNames = Object.keys(value.hooks);
            if (hookNames.length > SELECTOR_ASSET_MAX_HOOKS) throw new Error(`${surface}.hooks has too many entries`);
            for (const hook of hookNames) {
                if (UNSAFE_ASSET_KEYS.has(hook) || !/^[A-Za-z0-9._-]{1,80}$/.test(hook)) {
                    throw new Error(`${surface}.hooks contains an invalid name`);
                }
                const hookValue = value.hooks[hook];
                if (!hookValue || typeof hookValue !== 'object' || Array.isArray(hookValue)) {
                    throw new Error(`${surface}.${hook} is malformed`);
                }
                const hookStable = normalizeAssetSelectorList(hookValue.stable, `${surface}.${hook}.stable`, {
                    maxChain: SELECTOR_ASSET_MAX_SELECTORS_PER_CHAIN,
                    maxChars: SELECTOR_ASSET_MAX_SELECTOR_CHARS
                });
                const hookFallback = normalizeAssetSelectorList(hookValue.fallback, `${surface}.${hook}.fallback`, {
                    maxChain: SELECTOR_ASSET_MAX_SELECTORS_PER_CHAIN,
                    maxChars: SELECTOR_ASSET_MAX_SELECTOR_CHARS
                });
                total.count += hookStable.length + hookFallback.length;
                if (total.count > SELECTOR_ASSET_MAX_TOTAL_SELECTORS) throw new Error('Selector asset has too many selectors');
                hooks[hook] = {
                    stable: hookStable,
                    fallback: hookFallback,
                    notes: typeof hookValue.notes === 'string' ? hookValue.notes.slice(0, 240) : ''
                };
            }
        }

        const evidence = Array.isArray(value.captureEvidence)
            ? value.captureEvidence.filter((item) => typeof item === 'string').slice(0, 16).map((item) => item.slice(0, 240))
            : [];
        const lastVerified = value.lastVerified == null ? null : String(value.lastVerified).slice(0, 32);
        return {
            stable,
            fallback,
            hooks,
            captureEvidence: evidence,
            lastVerified,
            highChurn: value.highChurn === true,
            needsFreshCapture: value.needsFreshCapture === true,
            notes: typeof value.notes === 'string' ? value.notes.slice(0, 240) : ''
        };
    }

    function normalizeSelectorAsset(asset) {
        let parsed = asset;
        if (typeof asset === 'string') {
            if (selectorAssetByteLength(asset) > SELECTOR_ASSET_MAX_BYTES) throw new Error('Selector asset exceeds the size limit');
            try { parsed = JSON.parse(asset); } catch (_) { throw new Error('Selector asset is not valid JSON'); }
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Selector asset must be an object');
        if (parsed.schemaVersion !== SELECTOR_ASSET_SCHEMA_VERSION) throw new Error('Unsupported selector asset schema');
        if (typeof parsed.assetVersion !== 'string' || !SELECTOR_ASSET_VERSION_PATTERN.test(parsed.assetVersion)) {
            throw new Error('Selector asset version is invalid');
        }
        if (typeof parsed.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(parsed.digest)) {
            throw new Error('Selector asset digest is missing or invalid');
        }
        if (!parsed.packs || typeof parsed.packs !== 'object' || Array.isArray(parsed.packs)) {
            throw new Error('Selector asset packs are malformed');
        }
        const packNames = Object.keys(parsed.packs);
        if (packNames.length === 0 || packNames.length > SELECTOR_ASSET_MAX_PACKS) throw new Error('Selector asset pack count is invalid');
        const total = { count: 0 };
        const packs = {};
        for (const surface of packNames) {
            if (UNSAFE_ASSET_KEYS.has(surface) || !/^[A-Za-z0-9._-]{1,80}$/.test(surface)) {
                throw new Error('Selector asset contains an invalid surface name');
            }
            packs[surface] = normalizeSelectorAssetEntry(parsed.packs[surface], surface, total);
        }
        for (const shippedSurface of Object.keys(SHIPPED_SURFACE_SELECTOR_MAP)) {
            if (!Object.prototype.hasOwnProperty.call(packs, shippedSurface)) {
                throw new Error(`Selector asset omits shipped surface "${shippedSurface}"`);
            }
        }
        const normalized = {
            schemaVersion: SELECTOR_ASSET_SCHEMA_VERSION,
            assetVersion: parsed.assetVersion,
            digest: parsed.digest.toLowerCase(),
            packs: Object.fromEntries(Object.keys(packs).sort().map((key) => [key, packs[key]]))
        };
        if (selectorAssetByteLength(normalized) > SELECTOR_ASSET_MAX_BYTES) throw new Error('Selector asset exceeds the size limit');
        return normalized;
    }

    async function selectorAssetDigest(asset) {
        const bytes = typeof TextEncoder === 'function'
            ? new TextEncoder().encode(canonicalSelectorAsset(asset))
            : Uint8Array.from(unescape(encodeURIComponent(canonicalSelectorAsset(asset))), (char) => char.charCodeAt(0));
        if (!globalThis.crypto?.subtle?.digest) throw new Error('Web Crypto is unavailable for selector asset verification');
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    function buildSelectorMapFromAsset(packs) {
        const map = Object.freeze(Object.fromEntries(
            Object.keys(packs).sort().map((surface) => [surface, freezeEntry(packs[surface])])
        ));
        const selectors = Object.freeze(Object.fromEntries(
            Object.entries(map).map(([surface, entry]) => [
                surface,
                Object.freeze([...entry.stable, ...entry.fallback])
            ])
        ));
        return { map, selectors };
    }

    let selectorAssetState = {
        source: 'shipped',
        status: 'offline-default',
        assetVersion: 'shipped',
        digest: null,
        sizeBytes: null,
        updatedAt: null,
        lastAttemptAt: null,
        lastError: null,
        failedAssetVersion: null,
        rollbackCount: 0,
        selectorCount: Object.values(SurfaceSelectors).reduce((sum, chain) => sum + chain.length, 0)
    };

    function getSelectorAssetState() {
        return { ...selectorAssetState };
    }

    async function applySelectorAsset(asset, options = {}) {
        const attemptedAt = Date.now();
        const attemptedVersion = typeof asset === 'object' && asset ? asset.assetVersion : null;
        try {
            const normalized = normalizeSelectorAsset(asset);
            const actualDigest = await selectorAssetDigest(normalized);
            const expectedDigest = normalized.digest.slice('sha256:'.length);
            if (actualDigest !== expectedDigest) throw new Error('Selector asset digest mismatch');
            const next = buildSelectorMapFromAsset(normalized.packs);
            SurfaceSelectorMap = next.map;
            SurfaceSelectors = next.selectors;
            core.SurfaceSelectorMap = SurfaceSelectorMap;
            core.SurfaceSelectors = SurfaceSelectors;
            selectorAssetState = {
                source: options.source === 'stored' ? 'stored' : 'remote',
                status: 'active',
                assetVersion: normalized.assetVersion,
                digest: normalized.digest,
                sizeBytes: selectorAssetByteLength(asset),
                updatedAt: attemptedAt,
                lastAttemptAt: attemptedAt,
                lastError: null,
                failedAssetVersion: null,
                rollbackCount: selectorAssetState.rollbackCount,
                selectorCount: Object.values(SurfaceSelectors).reduce((sum, chain) => sum + chain.length, 0)
            };
            return { ok: true, state: getSelectorAssetState() };
        } catch (error) {
            selectorAssetState = {
                ...selectorAssetState,
                status: 'rollback',
                lastAttemptAt: attemptedAt,
                lastError: String(error?.message || error).slice(0, 240),
                failedAssetVersion: attemptedVersion ? String(attemptedVersion).slice(0, 64) : null,
                rollbackCount: selectorAssetState.rollbackCount + 1
            };
            return { ok: false, error: selectorAssetState.lastError, state: getSelectorAssetState() };
        }
    }

    function resetSelectorAsset() {
        SurfaceSelectorMap = SHIPPED_SURFACE_SELECTOR_MAP;
        SurfaceSelectors = SHIPPED_SURFACE_SELECTORS;
        core.SurfaceSelectorMap = SurfaceSelectorMap;
        core.SurfaceSelectors = SurfaceSelectors;
        selectorAssetState = {
            ...selectorAssetState,
            source: 'shipped',
            status: 'offline-default',
            assetVersion: 'shipped',
            digest: null,
            sizeBytes: null,
            updatedAt: Date.now(),
            lastError: null,
            failedAssetVersion: null,
            selectorCount: Object.values(SurfaceSelectors).reduce((sum, chain) => sum + chain.length, 0)
        };
        return getSelectorAssetState();
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

        if (typeof options?.surface === 'string' && options.surface.trim()) {
            surface = options.surface.trim();
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
            // reason: CustomEvent is unavailable in some unit-test contexts.
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

    // v4.5+: DOM-shape drift recorder.
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
            // reason: extension context unavailable; fall through to CustomEvent.
        }

        globalThis[SHAPE_DRIFT_REENTRY_FLAG] = true;
        try {
            // Always dispatch the CustomEvent too — unit tests and the
            // userscript build rely on it. In a real extension context
            // the chrome.runtime message above is the authoritative
            // channel; the event is purely a same-frame fallback.
            globalThis.dispatchEvent?.(new CustomEvent('ytkit-selector-shape-drift', { detail }));
        } catch (_) {
            // reason: CustomEvent not available in some unit-test contexts.
        } finally {
            globalThis[SHAPE_DRIFT_REENTRY_FLAG] = false;
        }
        return { stat, drifted: true, previousShape, messagedExt };
    }

    function getQueryRoot(options = {}) {
        return options.root || document;
    }

    function _hashShapePart(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    // v4.5+: derive a default shape signature for
    // an Element so live resolver hits actually feed `recordSelectorShape`.
    // The L3 audit flagged that the recorder API existed but no live call
    // site invoked it. Default signature samples cheap, stable identifier
    // surfaces: video-id length, child count, tag name. Callers can pass
    // their own `options.shapeKey(node) -> string` for finer-grained
    // signatures (e.g. live chat may key on aria-label hashing). The
    // default signature keeps raw class/attribute names out of telemetry:
    // it records counts plus short hashes of sorted names so churn is
    // detectable without leaking page-owned identifiers.
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
            // counts give a coarse but useful surface fingerprint.
            const attrCount = node.attributes?.length;
            if (typeof attrCount === 'number') parts.push(`attrs:${attrCount}`);
            const attrNames = Array.from(node.attributes || [])
                .map(attr => String(attr?.name || '').toLowerCase())
                .filter(Boolean)
                .sort();
            if (attrNames.length) parts.push(`attr-sig:${_hashShapePart(attrNames.join(','))}`);
            const classNames = Array.from(node.classList || [])
                .map(cls => String(cls || '').toLowerCase())
                .filter(Boolean)
                .sort();
            if (classNames.length) {
                parts.push(`class-count:${classNames.length}`);
                parts.push(`class-sig:${_hashShapePart(classNames.join(','))}`);
            }
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
                    recordSurfaceOutcome(surface, selector, 'hit');
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

        // Every selector in the chain — stable and fallback — failed, so the
        // surface itself is unresolved for whichever feature is running. An
        // empty chain attempted nothing and is not evidence of breakage.
        if (selectors.length) recordSurfaceOutcome(surface, selectors[selectors.length - 1], 'miss');

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
                    recordSurfaceOutcome(surface, selector, 'hit');
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
        if (selectors.length) recordSurfaceOutcome(surface, selectors[selectors.length - 1], 'miss');
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
            let settle = null;
            const promise = new Promise((resolve) => {
                settle = resolve;
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
                // Cancellation must still settle the promise — clearing the
                // timer/observer without resolving leaves awaiting callers
                // hung forever. resolve() is idempotent, so a cancel after a
                // found-element resolve is a harmless no-op.
                settle?.(null);
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
            hooks: Object.fromEntries(Object.entries(entry.hooks || {}).map(([hook, hookEntry]) => [
                hook,
                {
                    stable: [...hookEntry.stable],
                    fallback: [...hookEntry.fallback],
                    selectors: [...hookEntry.stable, ...hookEntry.fallback],
                    notes: hookEntry.notes
                }
            ])),
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

    function getSurfaceHookSelectorEntry(surface, hook) {
        const entry = SurfaceSelectorMap[surface]?.hooks?.[hook];
        if (!entry) return null;
        return {
            surface,
            hook,
            stable: [...entry.stable],
            fallback: [...entry.fallback],
            selectors: [...entry.stable, ...entry.fallback],
            notes: entry.notes
        };
    }

    function getSurfaceHookSelectorChain(surface, hook) {
        const entry = getSurfaceHookSelectorEntry(surface, hook);
        return entry ? entry.selectors : [];
    }

    function findSurfaceHookElements(surface, hook, options = {}) {
        const selectors = getSurfaceHookSelectorChain(surface, hook);
        if (!selectors.length) return [];
        return findSurfaceElements(selectors, {
            ...options,
            surface: `${surface}.${hook}`
        });
    }

    function selectorHealthRow(surface, entry, selectors, stableSelectors) {
        const stable = new Set(stableSelectors || []);
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
                stable: stable.has(selector),
                attempts: stat.attempts,
                hits: stat.hits,
                misses: stat.misses,
                errors: stat.errors,
                firstMissAt: stat.firstMissAt,
                lastMissAt: stat.lastMissAt,
                lastHitAt: stat.lastHitAt,
                lastError: stat.lastError,
                lastOutcome: stat.lastOutcome,
                // v4.5+ shape-drift fields.
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
            highChurn: !!entry.highChurn,
            needsFreshCapture: !!entry.needsFreshCapture,
            stableSelectorCount: stableSelectors.length,
            fallbackSelectorCount: selectors.length - stableSelectors.length,
            selectorCount: selectors.length,
            hitCount: selectorEntries.reduce((sum, item) => sum + item.hits, 0),
            missCount: selectorEntries.reduce((sum, item) => sum + item.misses, 0),
            errorCount: selectorEntries.reduce((sum, item) => sum + item.errors, 0),
            selectors: selectorEntries
        };
    }

    function getSelectorHealthSnapshot() {
        const snapshots = [];
        for (const [surface, entry] of Object.entries(SurfaceSelectorMap)) {
            snapshots.push(selectorHealthRow(
                surface,
                entry,
                SurfaceSelectors[surface] || [],
                entry.stable
            ));
            for (const [hook, hookEntry] of Object.entries(entry.hooks || {})) {
                const hookSurface = `${surface}.${hook}`;
                const hookSelectors = [...hookEntry.stable, ...hookEntry.fallback];
                snapshots.push(selectorHealthRow(
                    hookSurface,
                    entry,
                    hookSelectors,
                    hookEntry.stable
                ));
            }
        }
        return snapshots;
    }

    function exportSelectorHealth() {
        return JSON.stringify({
            // schemaVersion 3 adds the active YouTube build and the bounded
            // route canary. Surface rows retain the v2 shape-drift fields.
            schemaVersion: 3,
            exportedAt: new Date().toISOString(),
            youtubeClientVersion: core.getActiveYouTubeClientVersion?.() || null,
            criticalCanary: core.getCriticalSelectorCanarySnapshot?.() || null,
            selectorAsset: getSelectorAssetState(),
            surfaces: getSelectorHealthSnapshot()
        }, null, 2);
    }

    Object.assign(core, {
        SurfaceSelectorMap,
        SurfaceSelectors,
        applySelectorAsset,
        exportSelectorHealth,
        findSurfaceElement,
        findSurfaceElements,
        getAttributedFeatureId,
        getSelectorAssetState,
        getSelectorAttributionSnapshot,
        selectorTier,
        getSelectorHealthSnapshot,
        resetSelectorAttribution,
        withSelectorAttribution,
        findSurfaceHookElements,
        getSurfaceSelectorChain,
        getSurfaceSelectorEntry,
        getSurfaceHookSelectorChain,
        getSurfaceHookSelectorEntry,
        normalizeSelectorList,
        recordSelectorShape,
        resetSelectorAsset,
        selectorAssetPayload,
        waitForSurfaceElement
    });
})();
