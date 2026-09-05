(() => {
    'use strict';

    // extension/core/feature-health.js
    //
    // v4.68.0 — one answer to "which of my features are working right now?".
    //
    // Astra Deck already collects four independent health signals, none of
    // which is keyed by the thing the user cares about:
    //
    //   registry.js          per-feature lifecycle status (init-error, …)
    //   selectors.js         per-SURFACE selector hit/miss telemetry
    //   navigation.js        per-rule mutation budget circuit breakers
    //   external-api-health  per-SERVICE availability
    //
    // The join is the whole point of this module. It is pure: every input is
    // passed in, nothing is read from globals, and the output is a plain
    // array the popup, the side panel, and the diagnostics bundle all render
    // from the same way.
    //
    // Status ladder, worst wins:
    //
    //   failed    the feature's own lifecycle threw (init-error /
    //             destroy-error / cleanup-error), or its mutation rule's
    //             circuit is open. It is not doing its job at all.
    //   degraded  the feature initialised, but something it depends on is
    //             not answering: a selector surface whose entire chain now
    //             misses, or an external service reporting unavailable.
    //             This is the silent-failure case that makes breakage
    //             unbearable in competitor reviews — it is the reason this
    //             module exists.
    //   healthy   enabled, initialised, and nothing it touched is failing.
    //   idle      enabled but not active here — page-scoped features off
    //             their page, or nothing sampled yet this navigation.
    //
    // Disabled features are not reported at all. "Off" is not a health state
    // and listing 400 of them would bury the four that matter.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.buildFeatureHealthReport) return;

    const STATUS_FAILED = 'failed';
    const STATUS_DEGRADED = 'degraded';
    const STATUS_HEALTHY = 'healthy';
    const STATUS_IDLE = 'idle';

    // Worst-first so a single comparison resolves the row status.
    const STATUS_RANK = Object.freeze({
        [STATUS_FAILED]: 3,
        [STATUS_DEGRADED]: 2,
        [STATUS_HEALTHY]: 1,
        [STATUS_IDLE]: 0
    });

    // Registry statuses that mean the feature's own code threw.
    const FAILED_LIFECYCLE_STATUSES = new Set(['init-error', 'destroy-error', 'cleanup-error']);

    // external-api-health availability values that stop a feature working.
    const UNAVAILABLE_API_STATES = new Set(['unavailable', 'cooldown']);

    const MAX_REASONS_PER_FEATURE = 5;

    function text(value, max = 240) {
        if (value == null) return null;
        const str = String(value).trim();
        if (!str) return null;
        return str.length > max ? str.slice(0, max) : str;
    }

    // Timestamps arrive as epoch ms from selectors.js and the registry, and
    // as an ISO string from navigation.js. Normalise to epoch ms or null so
    // the reason list can be sorted newest-first across all of them.
    function parseTimestamp(value) {
        if (Number.isFinite(value)) return value > 0 ? value : null;
        if (typeof value !== 'string' || !value) return null;
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function worse(a, b) {
        return (STATUS_RANK[b] || 0) > (STATUS_RANK[a] || 0) ? b : a;
    }

    function toMap(list, key) {
        const map = new Map();
        for (const entry of Array.isArray(list) ? list : []) {
            const id = text(entry?.[key], 120);
            if (!id) continue;
            map.set(id, entry);
        }
        return map;
    }

    // A surface counts as broken only when its most recent resolution missed.
    // A surface that missed an hour ago and has hit since is not a problem,
    // and reporting it would train users to ignore this screen.
    function isSurfaceBroken(row) {
        return row?.lastOutcome === 'miss';
    }

    // Stable-chain erosion: the surface still resolves, but only because a
    // fallback selector caught it. That is the state immediately before a
    // break, and until v4.88.3 it was indistinguishable from a healthy hit —
    // the resolver walks `[...stable, ...fallback]` and recorded only that
    // something matched. Reported as degraded, because the feature works today
    // and will stop working when the fallback goes too.
    function isSurfaceOnFallback(row) {
        return row?.lastOutcome === 'hit' && row?.lastTier === 'fallback';
    }

    // Which player rollout the surfaces actually resolved against, and which
    // surfaces are not on their pack's primary one. Reads the selector rows
    // that resolution already recorded, so it issues no query of its own.
    //
    // The player refresh is served per account and per device, so two users on
    // the same version can be looking at different pages. Without this a
    // diagnostics bundle cannot distinguish "the selector broke" from "this
    // user is on the other rollout", which are different bugs with different
    // fixes.
    function summarizeSurfaceVariants(attributionRows, resolveVariant) {
        const resolve = typeof resolveVariant === 'function'
            ? resolveVariant
            : core.resolveSurfaceVariant;
        const nonPrimary = [];
        // Every player variant any playerChrome surface resolved to, not just
        // the last one seen. Features are iterated in whatever order attribution
        // recorded them, so assigning on each hit made the headline field
        // order-dependent: the same evidence reported 'delhi' or 'classic'
        // depending on which feature happened to resolve first.
        const playerVariants = new Set();
        let primaryPlayerVariant = null;
        if (typeof resolve !== 'function') {
            return { playerVariant: 'unknown', surfacesOnNonPrimaryVariant: nonPrimary };
        }
        for (const entry of Array.isArray(attributionRows) ? attributionRows : []) {
            for (const row of Array.isArray(entry?.surfaces) ? entry.surfaces : []) {
                if (row?.lastOutcome !== 'hit' || !row.lastSelector) continue;
                const resolved = resolve(row.surface, row.lastSelector);
                if (!resolved || resolved.variant === 'unknown') continue;
                if (String(row.surface).split('.')[0] === 'playerChrome') {
                    playerVariants.add(resolved.variant);
                    if (resolved.primary) primaryPlayerVariant = resolved.primary;
                }
                if (resolved.isPrimary === false) {
                    nonPrimary.push({
                        surface: row.surface,
                        variant: resolved.variant,
                        primary: resolved.primary,
                        selector: row.lastSelector
                    });
                }
            }
        }
        // A newer player still matches some of the older selectors, so seeing a
        // non-primary variant anywhere is the stronger signal and the primary
        // alongside it proves nothing. Sorted, so a set built in either order
        // gives the same answer.
        const seen = [...playerVariants].sort();
        const offPrimary = seen.filter((name) => name !== primaryPlayerVariant);
        const playerVariant = offPrimary[0] || seen[0] || 'unknown';
        nonPrimary.sort((a, b) => (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0));
        return { playerVariant, surfacesOnNonPrimaryVariant: nonPrimary };
    }

    function buildFeatureHealthReport(input = {}) {
        const now = Number.isFinite(input.now) ? input.now : Date.now();
        const features = Array.isArray(input.features) ? input.features : [];
        const registryHealth = toMap(input.registryHealth, 'id');
        const attribution = toMap(input.attribution, 'featureId');
        const mutationRules = toMap(input.mutationRules, 'featureId');
        const externalApis = Array.isArray(input.externalApis) ? input.externalApis : [];
        const criticalCanary = input.criticalCanary && typeof input.criticalCanary === 'object'
            ? input.criticalCanary
            : null;
        const antiAdblock = input.antiAdblock && typeof input.antiAdblock === 'object'
            && text(input.antiAdblock.selector, 240)
            ? input.antiAdblock
            : null;

        // external-api-health records already declare their driving feature
        // (SERVICE_META[x].feature), so the join is a lookup, not a guess. A
        // record whose feature is unknown to the registry is dropped rather
        // than attached to whichever feature has a similar-looking id.
        const apisByFeature = new Map();
        for (const service of externalApis) {
            const featureId = text(service?.feature, 120);
            if (!featureId) continue;
            const list = apisByFeature.get(featureId) || [];
            list.push(service);
            apisByFeature.set(featureId, list);
        }

        // The route canary probes a small set of critical selector chains
        // without emitting normal per-selector telemetry. Collapse every
        // failed surface for a feature into one reason so a YouTube rollout
        // cannot create duplicate feature rows or a selector-by-selector wall.
        const canaryByFeature = new Map();
        if (criticalCanary?.status === STATUS_DEGRADED) {
            for (const failure of Array.isArray(criticalCanary.failedSurfaces)
                ? criticalCanary.failedSurfaces
                : []) {
                const surface = text(failure?.surface, 120);
                if (!surface) continue;
                for (const rawId of Array.isArray(failure?.featureIds) ? failure.featureIds : []) {
                    const featureId = text(rawId, 120);
                    if (!featureId) continue;
                    const surfaces = canaryByFeature.get(featureId) || new Set();
                    surfaces.add(surface);
                    canaryByFeature.set(featureId, surfaces);
                }
            }
        }

        const rows = [];
        const counts = {
            [STATUS_FAILED]: 0,
            [STATUS_DEGRADED]: 0,
            [STATUS_HEALTHY]: 0,
            [STATUS_IDLE]: 0
        };

        for (const feature of features) {
            const id = text(feature?.id, 120);
            if (!id) continue;
            if (feature.enabled === false) continue;

            const health = registryHealth.get(id) || null;
            const lifecycleStatus = text(health?.status, 60) || 'registered';
            const initialized = health?.initialized === true;

            const reasons = [];
            let status = initialized ? STATUS_HEALTHY : STATUS_IDLE;

            if (FAILED_LIFECYCLE_STATUSES.has(lifecycleStatus)) {
                status = STATUS_FAILED;
                reasons.push({
                    kind: 'runtime',
                    detail: text(health?.lastError) || lifecycleStatus,
                    at: parseTimestamp(health?.updatedAt)
                });
            } else if (lifecycleStatus === 'degraded') {
                status = worse(status, STATUS_DEGRADED);
                reasons.push({
                    kind: 'runtime',
                    detail: text(health?.lastError) || 'Reported degraded',
                    at: parseTimestamp(health?.updatedAt)
                });
            }

            const rule = mutationRules.get(id);
            if (rule?.circuitOpen) {
                status = STATUS_FAILED;
                reasons.push({
                    kind: 'budget',
                    detail: text(rule.reason) || 'Suspended after exceeding its work budget',
                    // navigation.js stamps openedAt as an ISO string.
                    at: parseTimestamp(rule.openedAt)
                });
            }

            const attributed = attribution.get(id);
            for (const surfaceRow of Array.isArray(attributed?.surfaces) ? attributed.surfaces : []) {
                if (isSurfaceBroken(surfaceRow)) {
                    status = worse(status, STATUS_DEGRADED);
                    reasons.push({
                        kind: 'selector',
                        surface: text(surfaceRow.surface, 120),
                        detail: text(surfaceRow.lastError)
                            || text(surfaceRow.lastSelector)
                            || text(surfaceRow.surface, 120),
                        at: parseTimestamp(surfaceRow.lastMissAt)
                    });
                    continue;
                }
                if (isSurfaceOnFallback(surfaceRow)) {
                    status = worse(status, STATUS_DEGRADED);
                    reasons.push({
                        kind: 'selector-fallback',
                        surface: text(surfaceRow.surface, 120),
                        tier: 'fallback',
                        detail: text(surfaceRow.lastSelector) || text(surfaceRow.surface, 120),
                        at: parseTimestamp(surfaceRow.lastHitAt)
                    });
                }
            }

            const canarySurfaces = canaryByFeature.get(id);
            if (canarySurfaces?.size) {
                status = worse(status, STATUS_DEGRADED);
                const surfaces = Array.from(canarySurfaces).slice(0, 8);
                reasons.push({
                    kind: 'selector-canary',
                    surface: surfaces.join(', '),
                    surfaces,
                    youtubeClientVersion: text(criticalCanary.youtubeClientVersion, 40),
                    detail: surfaces.join(', '),
                    at: parseTimestamp(criticalCanary.checkedAt)
                });
            }

            if (id === 'sponsorBlock' && antiAdblock) {
                const selector = text(antiAdblock.selector, 240);
                const playbackState = ['advancing', 'stalled', 'blocked', 'unknown']
                    .includes(antiAdblock.playbackState)
                    ? antiAdblock.playbackState
                    : 'unknown';
                status = worse(status, STATUS_DEGRADED);
                reasons.push({
                    kind: 'anti-adblock',
                    selector,
                    playbackState,
                    detail: `${selector} · ${playbackState}`,
                    at: parseTimestamp(antiAdblock.observedAt)
                });
            }

            for (const service of apisByFeature.get(id) || []) {
                // `stale` means a cached answer is still being served, which
                // is the fallback working as designed — not a degradation the
                // user needs to see. Only a service that cannot answer at all
                // (or is sitting out a rate-limit cooldown) counts.
                if (!UNAVAILABLE_API_STATES.has(service.availability)) continue;
                status = worse(status, STATUS_DEGRADED);
                reasons.push({
                    kind: 'api',
                    service: text(service.label, 120) || text(service.id, 120),
                    detail: text(service.lastErrorMessage)
                        || text(service.lastErrorClass)
                        || text(service.localFallback)
                        || 'Service unavailable',
                    at: parseTimestamp(service.lastErrorTs)
                });
            }

            // A feature can only be idle when nothing is wrong with it; the
            // reason loops above never downgrade, so this only catches the
            // uninitialised-and-clean case.
            if (reasons.length === 0 && !initialized) status = STATUS_IDLE;

            // Newest evidence first — the report is read top-down when
            // something just broke — then capped. A feature that touches
            // thirty broken surfaces is diagnosed by the first few; carrying
            // all of them only bloats the message payload.
            reasons.sort((a, b) => (b.at || 0) - (a.at || 0));
            const reasonCount = reasons.length;
            if (reasons.length > MAX_REASONS_PER_FEATURE) reasons.length = MAX_REASONS_PER_FEATURE;

            counts[status] += 1;
            rows.push({
                id,
                name: text(feature.name, 120) || id,
                category: text(feature.category, 120) || null,
                status,
                lifecycleStatus,
                initialized,
                reasonCount,
                reasons
            });
        }

        // Worst first, then alphabetically by display name so the ordering is
        // stable across refreshes and the broken rows never move.
        rows.sort((a, b) => {
            const rank = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
            if (rank !== 0) return rank;
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });

        return {
            generatedAt: now,
            counts,
            total: rows.length,
            // The single line the surface leads with.
            worstStatus: rows.length
                ? rows[0].status
                : STATUS_HEALTHY,
            criticalCanary,
            antiAdblock,
            ...summarizeSurfaceVariants(input.attribution, input.resolveSurfaceVariant),
            features: rows
        };
    }

    function formatFeatureHealthLine(report, translate) {
        const t = typeof translate === 'function' ? translate : (_key, fallback) => fallback;
        const counts = report?.counts || {};
        const failed = counts[STATUS_FAILED] || 0;
        const degraded = counts[STATUS_DEGRADED] || 0;
        const healthy = counts[STATUS_HEALTHY] || 0;
        if (!report || !report.total) {
            return t('featureHealthEmpty', 'No enabled features sampled yet.');
        }
        if (failed === 0 && degraded === 0) {
            return t('featureHealthAllWellTpl', '{healthy} features working')
                .replace('{healthy}', String(healthy));
        }
        const parts = [];
        if (failed > 0) {
            parts.push(t('featureHealthFailedTpl', '{count} failed').replace('{count}', String(failed)));
        }
        if (degraded > 0) {
            parts.push(t('featureHealthDegradedTpl', '{count} degraded').replace('{count}', String(degraded)));
        }
        parts.push(t('featureHealthHealthyTpl', '{count} working').replace('{count}', String(healthy)));
        return parts.join(' · ');
    }

    core.buildFeatureHealthReport = buildFeatureHealthReport;
    core.formatFeatureHealthLine = formatFeatureHealthLine;
    core.FEATURE_HEALTH_STATUSES = Object.freeze({
        FAILED: STATUS_FAILED,
        DEGRADED: STATUS_DEGRADED,
        HEALTHY: STATUS_HEALTHY,
        IDLE: STATUS_IDLE
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildFeatureHealthReport,
            formatFeatureHealthLine,
            summarizeSurfaceVariants,
            FEATURE_HEALTH_STATUSES: core.FEATURE_HEALTH_STATUSES
        };
    }
})();
