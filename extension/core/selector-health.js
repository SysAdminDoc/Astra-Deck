(() => {
    'use strict';

    // extension/core/selector-health.js
    //
    // v5.1.0 selector-health surface. Layers on top of the existing
    // per-selector telemetry in core/selectors.js (getSelectorHealthSnapshot
    // and exportSelectorHealth) to give the popup diagnostics panel +
    // future bug-filing flows three things the raw snapshot doesn't:
    //
    //   1. summarize(snapshot) — high-level rollup (counts, top problem
    //      surfaces, fresh-capture flags) suitable for at-a-glance UI.
    //   2. rankProblemSurfaces(snapshot, limit) — worst-N by miss/error
    //      rate plus shape drift, filtering out surfaces with zero attempts
    //      and no drift so untested entries do not crowd out actual
    //      regressions.
    //   3. formatCopyReport(snapshot, options) — multi-line plain-text
    //      report ready for the popup "Copy selector report" button. The
    //      output is line-oriented, ASCII-safe, and always begins with a
    //      version line so bug filers can pin which snapshot version a
    //      report came from.
    //
    // The module does NOT mutate any selectors.js state. It only reads.
    // Tests should be able to feed in synthetic snapshots without
    // touching the global YTKitCore.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createSelectorHealth) return;

    const CLIENT_VERSION_PATTERN = /^\d{1,2}\.\d{6,10}\.\d{1,2}\.\d{1,2}$/;
    const MAX_CLIENT_VERSION_SCRIPTS = 80;
    const MAX_CANARY_SURFACES = 8;
    const MAX_CANARY_SELECTORS = 8;
    const MAX_CANARY_CANDIDATES_PER_SELECTOR = 64;
    let latestCriticalCanary = null;

    function safeNumber(n) {
        return Number.isFinite(n) ? n : 0;
    }

    function normalizeClientVersion(value) {
        const version = String(value || '').trim();
        return CLIENT_VERSION_PATTERN.test(version) ? version : null;
    }

    function getActiveYouTubeClientVersion(options = {}) {
        const config = options.ytcfg || globalThis.ytcfg;
        try {
            const configured = normalizeClientVersion(config?.get?.('INNERTUBE_CLIENT_VERSION'));
            if (configured) return configured;
        } catch (_) {
            // reason: the isolated extension world cannot always read page globals
        }

        const documentRef = options.document || globalThis.document;
        let scripts = [];
        try {
            scripts = Array.from(documentRef?.querySelectorAll?.('script') || []);
        } catch (_) {
            return null;
        }
        for (const script of scripts.slice(0, MAX_CLIENT_VERSION_SCRIPTS)) {
            const source = String(script?.textContent || '');
            if (!source.includes('INNERTUBE_CLIENT_VERSION')) continue;
            const match = source.match(/["']INNERTUBE_CLIENT_VERSION["']\s*:\s*["'](\d{1,2}\.\d{6,10}\.\d{1,2}\.\d{1,2})["']/);
            const version = normalizeClientVersion(match?.[1]);
            if (version) return version;
        }
        return null;
    }

    function nodeIsInInactiveTree(node) {
        if (!node || node.isConnected === false) return true;
        let current = node;
        const seen = new Set();
        while (current && !seen.has(current)) {
            seen.add(current);
            const tag = String(current.tagName || current.nodeName || '').toLowerCase();
            if (tag === 'template') return true;
            if (current.hidden === true || current.inert === true) return true;
            try {
                if (current.hasAttribute?.('hidden')) return true;
                if (String(current.getAttribute?.('aria-hidden') || '').toLowerCase() === 'true') return true;
            } catch (_) {
                return true;
            }
            const style = current.style;
            if (style && (
                String(style.display || '').toLowerCase() === 'none'
                || String(style.visibility || '').toLowerCase() === 'hidden'
                || String(style.contentVisibility || '').toLowerCase() === 'hidden'
            )) return true;
            try {
                const view = current.ownerDocument?.defaultView;
                const readComputedStyle = view?.getComputedStyle || globalThis.getComputedStyle;
                const computed = typeof readComputedStyle === 'function'
                    ? readComputedStyle.call(view || globalThis, current)
                    : null;
                if (computed) {
                    const display = String(computed.display || computed.getPropertyValue?.('display') || '').toLowerCase();
                    const visibility = String(computed.visibility || computed.getPropertyValue?.('visibility') || '').toLowerCase();
                    const contentVisibility = String(
                        computed.contentVisibility || computed.getPropertyValue?.('content-visibility') || ''
                    ).toLowerCase();
                    if (display === 'none'
                        || visibility === 'hidden'
                        || visibility === 'collapse'
                        || contentVisibility === 'hidden') return true;
                }
            } catch (_) {
                return true;
            }
            current = current.parentElement || current.parentNode || null;
        }
        return false;
    }

    function findActiveSelectorMatch(root, selectors, options = {}) {
        const candidateLimit = Number.isFinite(options.maxCandidatesPerSelector)
            ? Math.max(1, Math.min(MAX_CANARY_CANDIDATES_PER_SELECTOR, Math.floor(options.maxCandidatesPerSelector)))
            : MAX_CANARY_CANDIDATES_PER_SELECTOR;
        const isInactive = options.isInactive || nodeIsInInactiveTree;
        for (const selector of (Array.isArray(selectors) ? selectors : []).slice(0, MAX_CANARY_SELECTORS)) {
            let matches;
            try {
                if (typeof root?.querySelectorAll === 'function') {
                    matches = root.querySelectorAll(selector) || [];
                } else {
                    const match = root?.querySelector?.(selector);
                    if (match) matches = [match];
                }
            } catch (_) {
                continue;
            }
            let inspected = 0;
            for (const candidate of matches || []) {
                if (inspected >= candidateLimit) break;
                inspected += 1;
                if (!isInactive(candidate)) return { node: candidate, selector };
            }
        }
        return null;
    }

    function getCriticalSelectorCanaryRules(route, options = {}) {
        const routeName = String(route || '').trim();
        if (!routeName) return [];
        const registry = options.registry || core.SurfacePackRegistry;
        const selectorProvider = options.selectorProvider
            || ((surface) => core.getSurfaceSelectorChain?.(surface) || []);
        const entries = registry instanceof Map
            ? Array.from(registry.entries())
            : Object.entries(registry || {});
        const rules = [];
        for (const [surface, pack] of entries) {
            const canary = pack?.canary;
            if (!Array.isArray(canary?.routes) || !canary.routes.includes(routeName)) continue;
            const selectors = selectorProvider(surface).slice(0, MAX_CANARY_SELECTORS);
            if (!selectors.length) continue;
            rules.push({
                surface,
                selectors,
                featureIds: Array.from(new Set(
                    (Array.isArray(canary.featureIds) ? canary.featureIds : [])
                        .map((id) => String(id || '').trim())
                        .filter(Boolean)
                )).slice(0, 12)
            });
            if (rules.length >= MAX_CANARY_SURFACES) break;
        }
        return rules;
    }

    function probeCriticalSelectorSurfaces(options = {}) {
        const root = options.root || globalThis.document;
        const route = String(options.route || 'other').slice(0, 40);
        const rules = (Array.isArray(options.rules)
            ? options.rules
            : getCriticalSelectorCanaryRules(route, options)).slice(0, MAX_CANARY_SURFACES);
        const includeFeature = typeof options.includeFeature === 'function'
            ? options.includeFeature
            : () => true;
        const resolveFeatureName = typeof options.resolveFeatureName === 'function'
            ? options.resolveFeatureName
            : (id) => id;
        const checked = [];
        const failed = [];

        for (const rule of rules) {
            const selectors = (Array.isArray(rule?.selectors) ? rule.selectors : []).slice(0, MAX_CANARY_SELECTORS);
            if (!selectors.length) continue;
            const declaredFeatureIds = Array.from(new Set(
                (Array.isArray(rule.featureIds) ? rule.featureIds : [])
                    .map((id) => String(id || '').trim())
                    .filter(Boolean)
            ));
            const featureIds = declaredFeatureIds.filter((id) => includeFeature(id));
            if (declaredFeatureIds.length && !featureIds.length) continue;
            const match = findActiveSelectorMatch(root, selectors, options);
            const row = {
                surface: String(rule.surface || 'unknown').slice(0, 80),
                status: match ? 'healthy' : 'missing',
                selector: match?.selector || null,
                selectors: match ? undefined : selectors.slice(0, 4),
                featureIds
            };
            checked.push(row);
            if (!match) failed.push(row);
        }

        const affected = new Map();
        for (const failure of failed) {
            for (const id of failure.featureIds) {
                if (affected.has(id)) continue;
                affected.set(id, {
                    id,
                    name: String(resolveFeatureName(id) || id).slice(0, 120)
                });
            }
        }
        const clientVersion = normalizeClientVersion(options.clientVersion)
            || getActiveYouTubeClientVersion(options);
        const affectedFeatures = Array.from(affected.values());
        const failureKey = failed.map((row) => row.surface).sort().join(',');
        const featureKey = affectedFeatures.map((feature) => feature.id).sort().join(',');
        return {
            schemaVersion: 1,
            status: failed.length ? 'degraded' : 'healthy',
            route,
            youtubeClientVersion: clientVersion,
            checkedAt: Number.isFinite(options.now) ? options.now : Date.now(),
            checked,
            failedSurfaces: failed.map((row) => ({
                surface: row.surface,
                selectors: row.selectors,
                featureIds: row.featureIds
            })),
            affectedFeatures,
            fingerprint: [route, clientVersion || 'unknown', failureKey, featureKey].join('|')
        };
    }

    function setCriticalSelectorCanarySnapshot(report) {
        if (!report || typeof report !== 'object') {
            latestCriticalCanary = null;
            return null;
        }
        latestCriticalCanary = {
            ...report,
            checked: Array.isArray(report.checked)
                ? report.checked.map((row) => ({
                    ...row,
                    selectors: Array.isArray(row.selectors) ? [...row.selectors] : undefined,
                    featureIds: Array.isArray(row.featureIds) ? [...row.featureIds] : []
                }))
                : [],
            failedSurfaces: Array.isArray(report.failedSurfaces)
                ? report.failedSurfaces.map((row) => ({
                    ...row,
                    selectors: Array.isArray(row.selectors) ? [...row.selectors] : [],
                    featureIds: Array.isArray(row.featureIds) ? [...row.featureIds] : []
                }))
                : [],
            affectedFeatures: Array.isArray(report.affectedFeatures)
                ? report.affectedFeatures.map((feature) => ({ ...feature }))
                : []
        };
        return getCriticalSelectorCanarySnapshot();
    }

    function getCriticalSelectorCanarySnapshot() {
        if (!latestCriticalCanary) return null;
        return {
            ...latestCriticalCanary,
            checked: latestCriticalCanary.checked.map((row) => ({
                ...row,
                selectors: Array.isArray(row.selectors) ? [...row.selectors] : undefined,
                featureIds: [...row.featureIds]
            })),
            failedSurfaces: latestCriticalCanary.failedSurfaces.map((row) => ({
                ...row,
                selectors: [...row.selectors],
                featureIds: [...row.featureIds]
            })),
            affectedFeatures: latestCriticalCanary.affectedFeatures.map((feature) => ({ ...feature }))
        };
    }

    function getSurfaceShapeDrifts(surface) {
        const selectors = Array.isArray(surface?.selectors) ? surface.selectors : [];
        if (selectors.length) {
            return selectors.reduce((sum, selector) => sum + safeNumber(selector.shapeDrifts), 0);
        }
        return safeNumber(surface?.shapeDrifts);
    }

    function hasSurfaceShapeSample(surface) {
        const selectors = Array.isArray(surface?.selectors) ? surface.selectors : [];
        if (selectors.length) {
            return selectors.some(selector =>
                selector.hasShapeSample === true
                || selector.firstShape != null
                || selector.lastShape != null);
        }
        return surface?.hasShapeSample === true;
    }

    function summarize(snapshot) {
        const surfaces = Array.isArray(snapshot) ? snapshot : [];
        let totalAttempts = 0;
        let totalHits = 0;
        let totalMisses = 0;
        let totalErrors = 0;
        let totalShapeDrifts = 0;
        let highChurnSurfaces = 0;
        let needsFreshCapture = 0;
        let surfacesWithMisses = 0;
        let surfacesWithShapeDrift = 0;
        let surfacesWithoutShapeSample = 0;

        for (const s of surfaces) {
            const hits = safeNumber(s.hitCount);
            const misses = safeNumber(s.missCount);
            const errors = safeNumber(s.errorCount);
            const attempts = hits + misses + errors;
            const shapeDrifts = getSurfaceShapeDrifts(s);
            totalHits += hits;
            totalMisses += misses;
            totalErrors += errors;
            totalAttempts += attempts;
            totalShapeDrifts += shapeDrifts;
            if (s.highChurn) highChurnSurfaces += 1;
            if (s.needsFreshCapture) needsFreshCapture += 1;
            if (misses > 0 || errors > 0) surfacesWithMisses += 1;
            if (shapeDrifts > 0) surfacesWithShapeDrift += 1;
            if (attempts > 0 && !hasSurfaceShapeSample(s)) surfacesWithoutShapeSample += 1;
        }

        const missRate = totalAttempts > 0
            ? Math.round((totalMisses / totalAttempts) * 10000) / 100
            : 0;

        return {
            surfaces: surfaces.length,
            highChurnSurfaces,
            needsFreshCapture,
            surfacesWithMisses,
            totalAttempts,
            totalHits,
            totalMisses,
            totalErrors,
            totalShapeDrifts,
            surfacesWithShapeDrift,
            surfacesWithoutShapeSample,
            missRate
        };
    }

    function rankProblemSurfaces(snapshot, limit = 5) {
        const surfaces = Array.isArray(snapshot) ? snapshot : [];
        const scored = [];
        for (const s of surfaces) {
            const hits = safeNumber(s.hitCount);
            const misses = safeNumber(s.missCount);
            const errors = safeNumber(s.errorCount);
            const attempts = hits + misses + errors;
            const shapeDrifts = getSurfaceShapeDrifts(s);
            // Skip untested surfaces (zero attempts). They are not problems —
            // they have nothing to report unless shape drift was recorded by
            // an external snapshot provider.
            if (attempts === 0 && shapeDrifts === 0) continue;
            const failures = misses + errors;
            if (failures === 0 && shapeDrifts === 0) continue;
            const failureRate = attempts > 0 ? failures / attempts : 0;
            const churnRate = attempts > 0 ? shapeDrifts / attempts : shapeDrifts;
            const problemScore = failureRate + churnRate;
            scored.push({
                surface: s.surface,
                attempts,
                hits,
                misses,
                errors,
                failures,
                failureRate,
                shapeDrifts,
                hasShapeSample: hasSurfaceShapeSample(s),
                problemScore,
                highChurn: !!s.highChurn,
                needsFreshCapture: !!s.needsFreshCapture
            });
        }
        scored.sort((a, b) => {
            // Primary key: combined failure + shape-drift score descending.
            if (b.problemScore !== a.problemScore) return b.problemScore - a.problemScore;
            // Tie-break: more raw failures first.
            if (b.failures !== a.failures) return b.failures - a.failures;
            // Then more observed shape drift.
            if (b.shapeDrifts !== a.shapeDrifts) return b.shapeDrifts - a.shapeDrifts;
            // Stable: alphabetic by surface.
            return a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0;
        });
        const cap = Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : 5);
        return cap > 0 ? scored.slice(0, cap) : scored;
    }

    function formatCopyReport(snapshot, options = {}) {
        const exportedAt = options.exportedAt || new Date().toISOString();
        const productVersion = options.productVersion || 'unknown';
        const browserUA = options.browserUA || 'unknown';
        const youtubeClientVersion = normalizeClientVersion(options.youtubeClientVersion)
            || getActiveYouTubeClientVersion(options)
            || 'unknown';
        const budgetedScans = Array.isArray(options.budgetedScans) ? options.budgetedScans : [];
        const mutationRules = Array.isArray(options.mutationRules) ? options.mutationRules : [];
        const selectorAsset = options.selectorAsset && typeof options.selectorAsset === 'object'
            ? options.selectorAsset
            : null;
        const lines = [];
        const summary = summarize(snapshot);
        const top = rankProblemSurfaces(snapshot, options.topN || 5);

        lines.push('Astra Deck selector-health report');
        lines.push('product: ' + productVersion);
        lines.push('youtubeClientVersion: ' + youtubeClientVersion);
        lines.push('exportedAt: ' + exportedAt);
        lines.push('browserUA: ' + browserUA);
        lines.push('');
        lines.push('summary:');
        lines.push('  surfaces tracked:        ' + summary.surfaces);
        lines.push('  high-churn surfaces:     ' + summary.highChurnSurfaces);
        lines.push('  needs fresh capture:     ' + summary.needsFreshCapture);
        lines.push('  surfaces with misses:    ' + summary.surfacesWithMisses);
        lines.push('  surfaces with drift:     ' + summary.surfacesWithShapeDrift);
        lines.push('  unsampled hit surfaces:   ' + summary.surfacesWithoutShapeSample);
        lines.push('  total attempts:          ' + summary.totalAttempts);
        lines.push('  total hits:              ' + summary.totalHits);
        lines.push('  total misses:            ' + summary.totalMisses);
        lines.push('  total errors:            ' + summary.totalErrors);
        lines.push('  total shape drifts:      ' + summary.totalShapeDrifts);
        lines.push('  miss rate:               ' + summary.missRate + '%');
        lines.push('');

        if (selectorAsset) {
            lines.push('selector asset:');
            lines.push('  status:                  ' + String(selectorAsset.status || 'unknown'));
            lines.push('  source:                  ' + String(selectorAsset.source || 'unknown'));
            lines.push('  version:                 ' + String(selectorAsset.assetVersion || 'unknown'));
            lines.push('  digest:                  ' + String(selectorAsset.digest || 'none'));
            lines.push('  rollbacks:               ' + safeNumber(selectorAsset.rollbackCount));
            if (selectorAsset.lastError) lines.push('  last error:              ' + String(selectorAsset.lastError).slice(0, 240));
            lines.push('');
        }

        if (budgetedScans.length) {
            lines.push('budgeted scan diagnostics:');
            for (const scan of budgetedScans.slice(-5)) {
                const label = String(scan.label || 'scan');
                const processed = safeNumber(scan.processed);
                const total = safeNumber(scan.total);
                const chunks = safeNumber(scan.chunks);
                const durationMs = safeNumber(scan.durationMs);
                const cancelled = scan.cancelled ? '; cancelled' : '';
                lines.push('  - ' + label + ': ' + processed + '/' + total +
                    ' cards in ' + chunks + ' chunk' + (chunks === 1 ? '' : 's') +
                    ' (' + durationMs + 'ms' + cancelled + ')');
            }
            lines.push('');
        }

        const degradedMutationRules = mutationRules.filter(rule => rule?.circuitOpen);
        if (degradedMutationRules.length) {
            lines.push('degraded mutation rules:');
            for (const rule of degradedMutationRules.slice(0, 10)) {
                lines.push('  - ' + String(rule.featureId || 'unknown') +
                    ': ' + String(rule.reason || 'budget') +
                    '; ' + safeNumber(rule.invocations) + ' invocation(s)' +
                    '; ' + safeNumber(rule.durationMs) + 'ms');
            }
            lines.push('');
        }

        if (top.length === 0) {
            lines.push('No problem surfaces. Every tracked selector is hitting.');
            return lines.join('\n');
        }

        lines.push('top ' + top.length + ' problem surface(s) by failure/drift score:');
        for (const t of top) {
            const flags = [];
            if (t.highChurn) flags.push('high-churn');
            if (t.needsFreshCapture) flags.push('needs-fresh-capture');
            const flagStr = flags.length ? '  [' + flags.join(', ') + ']' : '';
            const ratePct = Math.round(t.failureRate * 10000) / 100;
            const driftStr = t.shapeDrifts > 0
                ? '; ' + t.shapeDrifts + ' shape drift' + (t.shapeDrifts === 1 ? '' : 's')
                : '';
            lines.push('  - ' + t.surface + ': ' + t.failures + '/' + t.attempts +
                ' attempts failed (' + ratePct + '%)' + driftStr + flagStr);
        }
        lines.push('');
        lines.push('Investigate by:');
        lines.push('  1. Capturing a fresh MHTML of the failing surface (subscriptions/watch/live-chat).');
        lines.push('  2. Running scripts/build-selector-fixtures.js against the new capture.');
        lines.push('  3. Comparing shape drift for class/attribute churn before updating selector packs.');
        lines.push('  4. Updating extension/core/selectors.js stable/fallback selectors.');
        return lines.join('\n');
    }

    function createSelectorHealth(options = {}) {
        // Pluggable provider for tests; production callers fall back to the
        // global selectors.js exports if available.
        const snapshotProvider = options.snapshotProvider
            || (() => (core.getSelectorHealthSnapshot ? core.getSelectorHealthSnapshot() : []));
        const exporter = options.exporter
            || (() => (core.exportSelectorHealth ? core.exportSelectorHealth() : null));
        const budgetedScanProvider = options.budgetedScanProvider
            || (() => (core.getBudgetedScanDiagnostics ? core.getBudgetedScanDiagnostics() : []));
        const mutationRuleProvider = options.mutationRuleProvider
            || (() => (core.getMutationRuleHealthSnapshot ? core.getMutationRuleHealthSnapshot() : []));
        const selectorAssetProvider = options.selectorAssetProvider
            || (() => (core.getSelectorAssetState ? core.getSelectorAssetState() : null));
        const clientVersionProvider = options.clientVersionProvider
            || (() => getActiveYouTubeClientVersion(options));
        const criticalCanaryProvider = options.criticalCanaryProvider
            || (() => getCriticalSelectorCanarySnapshot());

        function getReport() {
            const snap = snapshotProvider();
            return {
                summary: summarize(snap),
                topProblems: rankProblemSurfaces(snap, options.topN || 5),
                snapshot: snap,
                budgetedScans: budgetedScanProvider(),
                mutationRules: mutationRuleProvider(),
                selectorAsset: selectorAssetProvider(),
                youtubeClientVersion: clientVersionProvider(),
                criticalCanary: criticalCanaryProvider()
            };
        }

        function getCopyReport(extra = {}) {
            const snap = snapshotProvider();
            const budgetedScans = Array.isArray(extra.budgetedScans)
                ? extra.budgetedScans
                : budgetedScanProvider();
            const mutationRules = Array.isArray(extra.mutationRules)
                ? extra.mutationRules
                : mutationRuleProvider();
            const selectorAsset = extra.selectorAsset || selectorAssetProvider();
            const youtubeClientVersion = extra.youtubeClientVersion || clientVersionProvider();
            return formatCopyReport(snap, {
                ...options,
                ...extra,
                budgetedScans,
                mutationRules,
                selectorAsset,
                youtubeClientVersion
            });
        }

        function exportSnapshotJson() {
            return exporter();
        }

        return { getReport, getCopyReport, exportSnapshotJson, summarize, rankProblemSurfaces, formatCopyReport };
    }

    core.createSelectorHealth = createSelectorHealth;
    core.findActiveSelectorMatch = findActiveSelectorMatch;
    core.getActiveYouTubeClientVersion = getActiveYouTubeClientVersion;
    core.getCriticalSelectorCanaryRules = getCriticalSelectorCanaryRules;
    core.getCriticalSelectorCanarySnapshot = getCriticalSelectorCanarySnapshot;
    core.probeCriticalSelectorSurfaces = probeCriticalSelectorSurfaces;
    core.setCriticalSelectorCanarySnapshot = setCriticalSelectorCanarySnapshot;
    // Stand-alone surface for direct callers that don't need the closure.
    core.summarizeSelectorHealth = summarize;
    core.rankSelectorProblems = rankProblemSurfaces;
    core.formatSelectorCopyReport = formatCopyReport;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createSelectorHealth,
            findActiveSelectorMatch,
            getActiveYouTubeClientVersion,
            getCriticalSelectorCanaryRules,
            getCriticalSelectorCanarySnapshot,
            probeCriticalSelectorSurfaces,
            setCriticalSelectorCanarySnapshot,
            summarizeSelectorHealth: summarize,
            rankSelectorProblems: rankProblemSurfaces,
            formatSelectorCopyReport: formatCopyReport
        };
    }
})();
