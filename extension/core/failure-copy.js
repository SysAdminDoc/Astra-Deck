(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.describeFailure) return;

    // User-facing failure copy. Surfaces used to append `error.message` or a
    // raw HTTP status to their own label, which is unactionable, untranslatable
    // (the appended half is always English) and on the AI paths can leak a
    // provider response body into the UI. Every surface now maps the failure
    // into this closed set of causes; the raw text goes to the diagnostic log.
    const FAILURE_CAUSES = Object.freeze({
        offline: { key: 'failureCauseOffline', fallback: 'Your device looks offline. Reconnect, then try again.' },
        network: { key: 'failureCauseNetwork', fallback: 'The service could not be reached. Check your connection, then try again.' },
        timeout: { key: 'failureCauseTimeout', fallback: 'The request took too long. Try again in a moment.' },
        permission: { key: 'failureCausePermission', fallback: 'Access was not granted. Allow it, then retry.' },
        storage: { key: 'failureCauseStorage', fallback: 'There is not enough storage space. Free some space, then try again.' },
        auth: { key: 'failureCauseAuth', fallback: 'The credentials were rejected. Check the key in Settings, then retry.' },
        rateLimit: { key: 'failureCauseRateLimit', fallback: 'Too many requests were sent. Wait a minute, then try again.' },
        server: { key: 'failureCauseServer', fallback: 'The service reported an error on its side. Try again later.' },
        notFound: { key: 'failureCauseNotFound', fallback: 'That item was not found. It may have moved or been removed.' },
        badData: { key: 'failureCauseBadData', fallback: 'The data could not be read. Check the file, then try again.' },
        tooLarge: { key: 'failureCauseTooLarge', fallback: 'The data is too large to handle. Use a smaller file.' },
        unsupported: { key: 'failureCauseUnsupported', fallback: 'This browser cannot run that feature. Update it, then retry.' },
        cancelled: { key: 'failureCauseCancelled', fallback: 'The request was cancelled.' },
        unknown: { key: 'failureCauseUnknown', fallback: 'Something unexpected went wrong. The diagnostic log has the details.' }
    });

    const FAILURE_CAUSE_CODES = Object.freeze(Object.keys(FAILURE_CAUSES));

    // Codes already produced elsewhere in the codebase (the filter-list
    // classifier, companion download failures) map straight onto a cause so a
    // caller that already has a code never has to re-derive one from prose.
    const CODE_ALIASES = Object.freeze({
        'too-large': 'tooLarge',
        'bad-format': 'badData',
        'integrity-error': 'badData',
        'not-modified-without-cache': 'badData',
        unreachable: 'network',
        'http-error': 'server',
        expired: 'badData',
        storage: 'storage',
        timeout: 'timeout',
        aborted: 'cancelled',
        'permission-denied': 'permission',
        'quota-exceeded': 'storage',
        // The external API health classes (core/external-api-health.js). A
        // caller holding one of these already knows the cause structurally, so
        // it must never fall through to prose matching on the raw throw.
        'rate-limited': 'rateLimit',
        'server-error': 'server',
        'client-error': 'badData',
        'invalid-payload': 'badData',
        'network-error': 'network',
        'no-data': 'notFound',
        'unknown-error': 'unknown'
    });

    const NAME_MAP = Object.freeze({
        AbortError: 'cancelled',
        TimeoutError: 'timeout',
        QuotaExceededError: 'storage',
        NotAllowedError: 'permission',
        SecurityError: 'permission',
        NotSupportedError: 'unsupported',
        SyntaxError: 'badData',
        NetworkError: 'network'
    });

    function readStatus(error) {
        const candidates = [
            error?.status,
            error?.httpStatus,
            error?.statusCode,
            error?.response?.status
        ];
        for (const candidate of candidates) {
            const status = Number(candidate);
            if (Number.isFinite(status) && status >= 100 && status <= 599) return status;
        }
        const match = /\b(?:http|status)\D{0,3}(\d{3})\b/i.exec(String(error?.message || ''));
        const parsed = match ? Number(match[1]) : NaN;
        return Number.isFinite(parsed) && parsed >= 100 && parsed <= 599 ? parsed : 0;
    }

    function causeFromStatus(status) {
        if (status === 401 || status === 403) return 'auth';
        if (status === 404 || status === 410) return 'notFound';
        if (status === 408) return 'timeout';
        if (status === 413) return 'tooLarge';
        if (status === 429) return 'rateLimit';
        if (status >= 500) return 'server';
        if (status >= 400) return 'badData';
        return '';
    }

    function isOffline() {
        try {
            return typeof navigator !== 'undefined' && navigator.onLine === false;
        } catch (_) {
            // reason: navigator is absent in the worker test harness.
            return false;
        }
    }

    function causeFromMessage(message) {
        if (!message) return '';
        if (/\baborted\b|\bcancell?ed\b/.test(message)) return 'cancelled';
        if (/\btimed out\b|\btimeout\b/.test(message)) return 'timeout';
        if (/quota|storage full|exceeded the storage/.test(message)) return 'storage';
        if (/too large|exceeds|payload too/.test(message)) return 'tooLarge';
        if (/permission|not allowed|denied|forbidden/.test(message)) return 'permission';
        if (/api key|unauthorized|invalid credential|token/.test(message)) return 'auth';
        if (/rate limit|too many requests/.test(message)) return 'rateLimit';
        if (/not supported|unsupported|no such api|is not a function/.test(message)) return 'unsupported';
        if (/invalid json|unexpected token|malformed|parse|invalid .*format|corrupt/.test(message)) return 'badData';
        if (/failed to fetch|network|econnrefused|dns|unreachable|offline/.test(message)) {
            return isOffline() ? 'offline' : 'network';
        }
        if (/not found|no such/.test(message)) return 'notFound';
        return '';
    }

    // Reduce any thrown value to one of FAILURE_CAUSE_CODES. Explicit codes win
    // over an HTTP status, which wins over the error name, which wins over
    // prose matching — the earlier signals are structured, the last one is not.
    function classifyFailureCause(error) {
        const code = typeof error?.code === 'string' ? error.code : '';
        if (code && Object.prototype.hasOwnProperty.call(CODE_ALIASES, code)) return CODE_ALIASES[code];
        if (code && Object.prototype.hasOwnProperty.call(FAILURE_CAUSES, code)) return code;

        const status = readStatus(error);
        const statusCause = causeFromStatus(status);
        if (statusCause) return statusCause;

        const name = typeof error?.name === 'string' ? error.name : '';
        if (Object.prototype.hasOwnProperty.call(NAME_MAP, name)) return NAME_MAP[name];

        const messageCause = causeFromMessage(String(error?.message || error || '').toLowerCase());
        if (messageCause) return messageCause;

        return isOffline() ? 'offline' : 'unknown';
    }

    function resolveTranslator(translate) {
        if (typeof translate === 'function') return translate;
        return (_key, fallback) => fallback;
    }

    // The localized cause sentence on its own, for surfaces that already carry
    // their own label.
    function describeFailure(error, translate) {
        const cause = classifyFailureCause(error);
        const entry = FAILURE_CAUSES[cause] || FAILURE_CAUSES.unknown;
        const t = resolveTranslator(translate);
        const copy = t(entry.key, entry.fallback);
        return copy || entry.fallback;
    }

    // `<label>: <cause sentence>` for the common "Import failed: …" shape.
    function describeFailureWithLabel(label, error, translate) {
        const sentence = describeFailure(error, translate);
        const prefix = String(label || '').trim();
        if (!prefix) return sentence;
        return `${prefix.replace(/[.:]\s*$/, '')}: ${sentence}`;
    }

    // A status badge needs two strings for the same failure: the tooltip, and
    // an accessible name that still leads with the badge's own visible label.
    // Composing them at the call site put the joiners in front of the
    // hardcoded-copy gate, so the composition lives here beside the one in
    // describeFailureWithLabel that it reuses.
    function describeFailureBadge(badgeLabel, subject, error, translate) {
        const detail = describeFailureWithLabel(subject, error, translate);
        const label = String(badgeLabel || '').trim();
        return {
            detail,
            // WCAG 2.5.3: the visible label has to survive into the accessible
            // name, so it leads and the cause follows as its own sentence.
            announcement: label ? `${label.replace(/[.:]\s*$/, '')}. ${detail}` : detail
        };
    }

    // Everything the surface must not show. Callers hand this to their own
    // diagnostic channel so the raw text stays out of the UI.
    function failureDiagnosticText(error) {
        const cause = classifyFailureCause(error);
        const status = readStatus(error);
        const raw = String(error?.message || error || '').slice(0, 300);
        const statusPart = status ? ` http=${status}` : '';
        return `${cause}${statusPart} ${raw}`.trim();
    }

    Object.assign(core, {
        FAILURE_CAUSES,
        FAILURE_CAUSE_CODES,
        classifyFailureCause,
        describeFailure,
        describeFailureWithLabel,
        describeFailureBadge,
        failureDiagnosticText
    });
})();
