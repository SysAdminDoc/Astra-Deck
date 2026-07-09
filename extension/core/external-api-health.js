(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createExternalApiHealth) return;

    const SERVICE_META = Object.freeze({
        sponsorBlock: {
            label: 'SponsorBlock',
            origin: 'https://sponsor.ajay.app',
            feature: 'sponsorBlock'
        },
        deArrow: {
            label: 'DeArrow',
            origin: 'https://sponsor.ajay.app',
            feature: 'deArrow'
        },
        returnDislike: {
            label: 'Return YouTube Dislike',
            origin: 'https://returnyoutubedislikeapi.com',
            feature: 'returnDislike'
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
        const status = getStatus(error, detail);
        if (status === 429) return 'rate-limited';
        if (status >= 500) return 'server-error';
        if (status >= 400) return 'client-error';
        const message = cleanText(error?.message || detail.message || '').toLowerCase();
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

    function createRecord(id) {
        const meta = SERVICE_META[id] || { label: id, origin: '', feature: id };
        return {
            id,
            label: meta.label,
            origin: meta.origin,
            feature: meta.feature,
            state: 'unknown',
            lastSuccessTs: 0,
            lastSuccessSource: '',
            lastErrorTs: 0,
            lastErrorClass: '',
            lastErrorMessage: '',
            cacheState: 'unknown',
            fallbackState: '',
            requestBudget: null
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
        'invalid-payload': 'unexpected response',
        'network-error': 'network error',
        'unknown-error': 'unavailable'
    });

    // Pure helper for compact in-page degraded-state copy. Returns null when
    // the record is NOT actionably degraded (ok/unknown states stay silent).
    function describeDegradation(record, nowTs = Date.now()) {
        if (!record || record.state === 'ok' || record.state === 'unknown') return null;
        const reason = ERROR_CLASS_COPY[record.lastErrorClass] || ERROR_CLASS_COPY['unknown-error'];
        const parts = [];
        if (record.state === 'rate-limited') {
            const resetMs = record.requestBudget?.resetMs;
            parts.push(Number.isFinite(resetMs) && resetMs > 0
                ? `rate limited — retrying in ${formatAge(resetMs)}`
                : 'rate limited');
        } else {
            parts.push(reason);
        }
        if (record.state === 'degraded' && record.lastSuccessTs > 0) {
            parts.push(`showing ${formatAge(nowTs - record.lastSuccessTs)}-old cache`);
        } else if (record.cacheState === 'stale' && record.lastSuccessTs > 0) {
            parts.push(`cache is ${formatAge(nowTs - record.lastSuccessTs)} old`);
        }
        return {
            id: record.id,
            label: record.label,
            feature: record.feature,
            state: record.state,
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
            const ts = Number(detail.ts);
            rec.state = 'ok';
            rec.lastSuccessTs = Number.isFinite(ts) && ts > 0 ? ts : now();
            rec.lastSuccessSource = cleanText(detail.source || 'network');
            rec.cacheState = cleanText(detail.cacheState || (detail.source === 'cache' ? 'fresh' : 'refreshed'), 'unknown');
            rec.fallbackState = cleanText(detail.fallbackState || '');
            rec.requestBudget = normalizeBudget(detail.requestBudget);
            notify(rec);
            return rec;
        }

        function recordFailure(id, error, detail = {}) {
            const rec = ensure(id);
            const errorClass = classifyFailure(error, detail);
            const status = getStatus(error, detail);
            const message = cleanText(
                detail.message || error?.message || (status ? `HTTP ${status}` : 'request failed'),
                'request failed'
            );
            rec.state = errorClass === 'rate-limited' ? 'rate-limited' : 'error';
            rec.lastErrorTs = now();
            rec.lastErrorClass = errorClass;
            rec.lastErrorMessage = message;
            rec.cacheState = cleanText(detail.cacheState || rec.cacheState || 'none', 'none');
            rec.fallbackState = cleanText(detail.fallbackState || '');
            rec.requestBudget = normalizeBudget(detail.requestBudget);
            try {
                diagnosticLog?.record?.('external-api-health', `${rec.id} ${errorClass}: ${message}`);
            } catch (_) {
                // reason: diagnostics must never break a feature fetch path
            }
            notify(rec);
            return rec;
        }

        function recordCacheFallback(id, error, detail = {}) {
            const rec = recordFailure(id, error, {
                ...detail,
                cacheState: detail.cacheState || 'stale',
                fallbackState: detail.fallbackState || 'stale-cache'
            });
            rec.state = 'degraded';
            rec.cacheState = cleanText(detail.cacheState || 'stale');
            rec.fallbackState = cleanText(detail.fallbackState || 'stale-cache');
            rec.lastCacheFallbackTs = now();
            notify(rec);
            return rec;
        }

        function snapshot() {
            const ids = new Set([...Object.keys(SERVICE_META), ...Object.keys(records)]);
            return [...ids].map((id) => ({ ...ensure(id) }));
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
            describeDegradation
        };
    }

    Object.assign(core, {
        EXTERNAL_API_HEALTH_SERVICES: SERVICE_META,
        createExternalApiHealth,
        describeExternalApiDegradation: describeDegradation
    });
})();
