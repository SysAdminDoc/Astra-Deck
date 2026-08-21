(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createExternalApiHealth) return;

    const SERVICE_META = Object.freeze({
        sponsorBlock: {
            label: 'SponsorBlock',
            origin: 'https://sponsor.ajay.app',
            feature: 'sponsorBlock',
            defaultCacheTtlMs: 12 * 60 * 60 * 1000,
            privacy: 'hashed video prefix only',
            localFallback: 'no crowd segments; native playback continues'
        },
        deArrow: {
            label: 'DeArrow',
            origin: 'https://sponsor.ajay.app',
            feature: 'deArrow',
            defaultCacheTtlMs: 4 * 60 * 60 * 1000,
            privacy: 'video ID sent only while enabled',
            localFallback: 'keep the original YouTube title and thumbnail'
        },
        videoInsights: {
            // i18n-static: stable provider diagnostic identity
            label: 'YouTube video insights',
            origin: 'https://www.youtube.com',
            feature: 'videoInsights',
            defaultCacheTtlMs: 5 * 60 * 1000,
            privacy: 'video ID sent only in the GitHub-full profile',
            localFallback: 'use metadata already present in the page'
        },
        returnDislike: {
            label: 'Return YouTube Dislike',
            origin: 'https://returnyoutubedislikeapi.com',
            feature: 'returnDislike',
            defaultCacheTtlMs: 24 * 60 * 60 * 1000,
            privacy: 'video ID sent only while enabled; no cookies',
            localFallback: 'show YouTube’s native like/dislike controls'
        }
    });

    const MSG_MAX_LEN = 220;

    function cleanText(value, fallback = '') {
        const text = String(value ?? fallback).trim();
        return text.slice(0, MSG_MAX_LEN);
    }

    function getStatus(error, detail = {}) {
        return Number(error?.response?.status ?? error?.status ?? detail.status ?? 0) || 0;
    }

    function classifyFailure(error, detail = {}) {
        if (detail.errorClass) return cleanText(detail.errorClass, 'unknown-error');
        const message = cleanText(error?.message || detail.message || '').toLowerCase();
        if (error?.code === 'OPTIONAL_HOST_PERMISSION_DENIED'
            || /runtime host permission not granted|optional host permission|host access (?:was )?(?:not granted|denied)/.test(message)) {
            return 'permission-denied';
        }
        const status = getStatus(error, detail);
        if (status === 429) return 'rate-limited';
        if (status >= 500) return 'server-error';
        // A 404 from an enrichment API means "we have nothing for this video",
        // which is the normal case for most videos on most of these services.
        // It is not an outage, and telling a user their extension is broken
        // because SponsorBlock has no segments for a two-view upload would be
        // the exact false alarm this classification exists to avoid.
        if (status === 404) return 'no-data';
        if (status >= 400) return 'client-error';
        if (/invalid|json|payload|schema/.test(message)) return 'invalid-payload';
        if (/timeout|network|offline|fetch|failed/.test(message)) return 'network-error';
        return 'unknown-error';
    }

    function normalizeBudget(budget) {
        if (!budget || typeof budget !== 'object') return null;
        const limit = Number(budget.limit);
        const used = Number(budget.used);
        const resetMs = Number(budget.resetMs);
        return {
            limit: Number.isFinite(limit) && limit >= 0 ? Math.round(limit) : null,
            used: Number.isFinite(used) && used >= 0 ? Math.round(used) : null,
            resetMs: Number.isFinite(resetMs) && resetMs >= 0 ? Math.round(resetMs) : null
        };
    }

    function normalizeDuration(value) {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    }

    function createRecord(id) {
        const meta = SERVICE_META[id] || { label: id, origin: '', feature: id };
        return {
            id,
            label: meta.label,
            origin: meta.origin,
            feature: meta.feature,
            privacy: meta.privacy || '',
            localFallback: meta.localFallback || '',
            state: 'unknown',
            lastSuccessTs: 0,
            lastRefreshTs: 0,
            lastObservedTs: 0,
            lastSuccessSource: '',
            lastHost: '',
            lastErrorTs: 0,
            lastErrorClass: '',
            lastErrorMessage: '',
            cacheState: 'unknown',
            cacheTtlMs: normalizeDuration(meta.defaultCacheTtlMs),
            fallbackState: '',
            requestBudget: null,
            cooldownUntilTs: 0,
            cooldownReason: '',
            // Consecutive failures since the last success. A single failure is
            // a transient; this is what lets a caller wait for a pattern.
            consecutiveFailures: 0
        };
    }

    function formatAge(ms) {
        if (!Number.isFinite(ms) || ms < 0) return '';
        if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}s`;
        if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
        if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
        return `${Math.round(ms / 86400000)}d`;
    }

    const ERROR_CLASS_COPY = Object.freeze({
        'rate-limited': 'rate limited',
        'server-error': 'server error',
        'client-error': 'request rejected',
        'permission-denied': 'host access needed — re-enable in Settings',
        'invalid-payload': 'unexpected response',
        'network-error': 'network error',
        'no-data': 'nothing for this video',
        'unknown-error': 'unavailable'
    });

    // How many consecutive failures make an outage worth putting on the page.
    // One is a transient — a dropped packet, a cold cache, a single 500 — and
    // interrupting someone's video for it is how an enrichment tool teaches
    // people to distrust it.
    const OUTAGE_MIN_CONSECUTIVE_FAILURES = 2;

    // Error classes that mean the SERVICE is not answering, as opposed to
    // answering and having nothing to say about this video.
    const OUTAGE_ERROR_CLASSES = new Set([
        'network-error', 'server-error', 'rate-limited', 'unknown-error',
        'invalid-payload', 'permission-denied', 'client-error'
    ]);

    /**
     * Should a page-level outage notice be shown for this service?
     *
     * Separate from describeDegradation above, which answers a different
     * question: that one describes any non-ok state for the diagnostics
     * surfaces, where completeness is the goal. This one decides whether to
     * interrupt someone watching a video, where restraint is.
     *
     * Returns null when nothing should be shown.
     */
    function describeServiceOutage(record, options = {}) {
        if (!record) return null;
        const minFailures = Number.isFinite(options.minFailures)
            ? options.minFailures
            : OUTAGE_MIN_CONSECUTIVE_FAILURES;
        const failures = Number(record.consecutiveFailures) || 0;
        if (failures < minFailures) return null;
        // "Nothing for this video" is a successful answer with an empty body.
        if (!OUTAGE_ERROR_CLASSES.has(record.lastErrorClass)) return null;
        return {
            id: record.id,
            label: record.label,
            feature: record.feature,
            errorClass: record.lastErrorClass,
            failures,
            // Two different sentences for the user. A revoked host permission
            // is theirs to fix; an upstream that is down is not, and the only
            // useful thing to say is that it is the service and not Astra Deck.
            kind: record.lastErrorClass === 'permission-denied' ? 'permission' : 'unreachable'
        };
    }

    // Pure helper for compact in-page degraded-state copy. Returns null when
    // the record is NOT actionably degraded (ok/unknown states stay silent).
    function describeDegradation(record, nowTs) {
        if (!record || record.state === 'unknown') return null;
        const effectiveNow = Number.isFinite(Number(nowTs))
            ? Number(nowTs)
            : (Number(record.lastObservedTs) || Date.now());
        const cacheTtlMs = normalizeDuration(record.cacheTtlMs);
        const lastSuccessTs = Number(record.lastSuccessTs) || 0;
        const cacheAgeMs = lastSuccessTs > 0 ? Math.max(0, effectiveNow - lastSuccessTs) : 0;
        const cacheExpired = cacheAgeMs > 0
            && cacheTtlMs > 0
            && cacheAgeMs >= cacheTtlMs
            && ['fresh', 'refreshed', 'stale'].includes(record.cacheState);
        if (record.state === 'ok' && !cacheExpired && record.cacheState !== 'stale') return null;
        const reason = ERROR_CLASS_COPY[record.lastErrorClass] || ERROR_CLASS_COPY['unknown-error'];
        const parts = [];
        if (record.state === 'rate-limited' || Number(record.cooldownUntilTs) > effectiveNow) {
            const resetMs = record.requestBudget?.resetMs;
            parts.push(Number.isFinite(resetMs) && resetMs > 0
                ? `rate limited — retrying in ${formatAge(resetMs)}`
                : 'rate limited');
        } else if (record.state !== 'ok') {
            parts.push(reason);
        }
        if ((record.state === 'degraded' || cacheExpired || record.cacheState === 'stale') && lastSuccessTs > 0) {
            parts.push(record.state === 'degraded'
                ? `showing ${formatAge(cacheAgeMs)}-old cache`
                : `cache is ${formatAge(cacheAgeMs)} old`);
        }
        if (!parts.length) return null;
        return {
            id: record.id,
            label: record.label,
            feature: record.feature,
            state: record.state,
            // Whether the user can DO anything about it. A revoked host
            // permission is fixed in Settings; a third-party API being rate
            // limited, briefly 5xx-ing, or serving a stale cache is not
            // something the reader can act on, and putting it on screen over
            // their video is noise. Callers decide what to render; the health
            // record and the diagnostic log keep every state either way.
            actionable: record.lastErrorClass === 'permission-denied',
            text: `${record.label}: ${parts.join(' · ')}`
        };
    }

    function createExternalApiHealth(options = {}) {
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        const diagnosticLog = options.DiagnosticLog || options.diagnosticLog || null;
        const records = Object.create(null);
        const listeners = new Set();

        function ensure(id) {
            const key = cleanText(id, 'unknown') || 'unknown';
            if (!records[key]) records[key] = createRecord(key);
            return records[key];
        }

        function isCacheExpired(rec, nowTs) {
            const ttlMs = normalizeDuration(rec.cacheTtlMs);
            const ts = Number(rec.lastRefreshTs || rec.lastSuccessTs) || 0;
            return ts > 0
                && ttlMs > 0
                && nowTs - ts >= ttlMs
                && ['fresh', 'refreshed', 'stale'].includes(rec.cacheState);
        }

        function availabilityFor(rec, nowTs) {
            if (rec.state === 'rate-limited' || Number(rec.cooldownUntilTs) > nowTs) return 'cooldown';
            if (rec.state === 'error') return 'unavailable';
            if (rec.state === 'degraded' || rec.cacheState === 'stale' || isCacheExpired(rec, nowTs)) return 'stale';
            if (rec.state === 'ok') return 'available';
            return 'unknown';
        }

        function decorate(rec) {
            const nowTs = now();
            const refreshTs = Number(rec.lastRefreshTs || rec.lastSuccessTs) || 0;
            const cooldownUntilTs = Number(rec.cooldownUntilTs) || 0;
            const cooldownRemainingMs = Math.max(0, cooldownUntilTs - nowTs);
            const expired = isCacheExpired(rec, nowTs);
            return {
                ...rec,
                cacheState: expired && rec.cacheState !== 'stale' ? 'stale' : rec.cacheState,
                lastRefreshTs: refreshTs,
                lastRefreshAgeMs: refreshTs > 0 ? Math.max(0, nowTs - refreshTs) : null,
                cooldownRemainingMs,
                availability: availabilityFor(rec, nowTs)
            };
        }

        function notify(rec) {
            for (const listener of listeners) {
                try {
                    listener({ ...rec });
                } catch (_) {
                    // reason: a broken indicator subscriber must never poison feature fetch paths
                }
            }
        }

        function recordSuccess(id, detail = {}) {
            const rec = ensure(id);
            const observedTs = now();
            const ts = Number(detail.ts);
            rec.state = 'ok';
            rec.lastObservedTs = observedTs;
            rec.lastSuccessTs = Number.isFinite(ts) && ts > 0 ? ts : observedTs;
            rec.lastRefreshTs = rec.lastSuccessTs;
            rec.lastSuccessSource = cleanText(detail.source || 'network');
            if (detail.host) rec.lastHost = cleanText(detail.host);
            rec.cacheState = cleanText(detail.cacheState || (detail.source === 'cache' ? 'fresh' : 'refreshed'), 'unknown');
            const cacheTtlMs = normalizeDuration(detail.cacheTtlMs);
            if (cacheTtlMs > 0) rec.cacheTtlMs = cacheTtlMs;
            rec.fallbackState = cleanText(detail.fallbackState || '');
            rec.requestBudget = normalizeBudget(detail.requestBudget);
            rec.cooldownUntilTs = 0;
            rec.cooldownReason = '';
            rec.consecutiveFailures = 0;
            const snapshot = decorate(rec);
            notify(snapshot);
            return snapshot;
        }

        function recordFailure(id, error, detail = {}, options = {}) {
            const rec = ensure(id);
            const observedTs = now();
            const errorClass = classifyFailure(error, detail);
            const status = getStatus(error, detail);
            const message = cleanText(
                detail.message || error?.message || (status ? `HTTP ${status}` : 'request failed'),
                'request failed'
            );
            rec.state = errorClass === 'rate-limited' ? 'rate-limited' : 'error';
            rec.lastObservedTs = observedTs;
            rec.lastErrorTs = observedTs;
            rec.lastErrorClass = errorClass;
            rec.lastErrorMessage = message;
            if (detail.host) rec.lastHost = cleanText(detail.host);
            rec.cacheState = cleanText(detail.cacheState || rec.cacheState || 'none', 'none');
            rec.fallbackState = cleanText(detail.fallbackState || '');
            rec.requestBudget = normalizeBudget(detail.requestBudget);
            const cacheTtlMs = normalizeDuration(detail.cacheTtlMs);
            if (cacheTtlMs > 0) rec.cacheTtlMs = cacheTtlMs;
            const budgetResetMs = Number(rec.requestBudget?.resetMs) || 0;
            const cooldownMs = normalizeDuration(detail.cooldownMs) || budgetResetMs;
            rec.cooldownUntilTs = cooldownMs > 0 ? observedTs + cooldownMs : 0;
            rec.cooldownReason = cleanText(detail.cooldownReason || (errorClass === 'rate-limited' ? 'rate-limited' : ''));
            // A service that answers "nothing for this video" is working, so
            // it must not accumulate toward an outage.
            rec.consecutiveFailures = errorClass === 'no-data'
                ? 0
                : (Number(rec.consecutiveFailures) || 0) + 1;
            try {
                diagnosticLog?.record?.('external-api-health', `${rec.id} ${errorClass}: ${message}`);
            } catch (_) {
                // reason: diagnostics must never break a feature fetch path
            }
            const snapshot = decorate(rec);
            if (!options.skipNotify) notify(snapshot);
            return snapshot;
        }

        function recordCacheFallback(id, error, detail = {}) {
            // Single notification with the FINAL degraded state — notifying
            // from recordFailure first flashed 'error' at every subscriber
            // (in-page pills, popup health center) on each stale-cache serve.
            recordFailure(id, error, {
                ...detail,
                cacheState: detail.cacheState || 'stale',
                fallbackState: detail.fallbackState || 'stale-cache'
            }, { skipNotify: true });
            const rec = ensure(id);
            rec.state = 'degraded';
            rec.cacheState = cleanText(detail.cacheState || 'stale');
            rec.fallbackState = cleanText(detail.fallbackState || 'stale-cache');
            rec.lastCacheFallbackTs = now();
            const snapshot = decorate(rec);
            notify(snapshot);
            return snapshot;
        }

        function snapshot() {
            const ids = new Set([...Object.keys(SERVICE_META), ...Object.keys(records)]);
            return [...ids].map((id) => decorate(ensure(id)));
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            listeners.add(listener);
            return () => listeners.delete(listener);
        }

        return {
            recordSuccess,
            recordFailure,
            recordCacheFallback,
            snapshot,
            subscribe,
            classifyFailure,
            describeDegradation,
            describeServiceOutage
        };
    }

    Object.assign(core, {
        EXTERNAL_API_HEALTH_SERVICES: SERVICE_META,
        OUTAGE_MIN_CONSECUTIVE_FAILURES,
        createExternalApiHealth,
        describeExternalApiDegradation: describeDegradation,
        describeExternalApiOutage: describeServiceOutage
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            EXTERNAL_API_HEALTH_SERVICES: SERVICE_META,
            OUTAGE_MIN_CONSECUTIVE_FAILURES,
            createExternalApiHealth,
            describeExternalApiDegradation: describeDegradation,
            describeExternalApiOutage: describeServiceOutage
        };
    }
})();
