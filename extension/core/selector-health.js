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

    function safeNumber(n) {
        return Number.isFinite(n) ? n : 0;
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
        const budgetedScans = Array.isArray(options.budgetedScans) ? options.budgetedScans : [];
        const lines = [];
        const summary = summarize(snapshot);
        const top = rankProblemSurfaces(snapshot, options.topN || 5);

        lines.push('Astra Deck selector-health report');
        lines.push('product: ' + productVersion);
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

        if (top.length === 0) {
            lines.push('No problem surfaces — every tracked selector is hitting.');
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

        function getReport() {
            const snap = snapshotProvider();
            return {
                summary: summarize(snap),
                topProblems: rankProblemSurfaces(snap, options.topN || 5),
                snapshot: snap,
                budgetedScans: budgetedScanProvider()
            };
        }

        function getCopyReport(extra = {}) {
            const snap = snapshotProvider();
            const budgetedScans = Array.isArray(extra.budgetedScans)
                ? extra.budgetedScans
                : budgetedScanProvider();
            return formatCopyReport(snap, { ...options, ...extra, budgetedScans });
        }

        function exportSnapshotJson() {
            return exporter();
        }

        return { getReport, getCopyReport, exportSnapshotJson, summarize, rankProblemSurfaces, formatCopyReport };
    }

    core.createSelectorHealth = createSelectorHealth;
    // Stand-alone surface for direct callers that don't need the closure.
    core.summarizeSelectorHealth = summarize;
    core.rankSelectorProblems = rankProblemSurfaces;
    core.formatSelectorCopyReport = formatCopyReport;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createSelectorHealth,
            summarizeSelectorHealth: summarize,
            rankSelectorProblems: rankProblemSurfaces,
            formatSelectorCopyReport: formatCopyReport
        };
    }
})();
