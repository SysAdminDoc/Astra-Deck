(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.YTKitCore = root.YTKitCore || {};
    root.YTKitCore.cookieHandoff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Version 1 is intentionally the smallest cookie set yt-dlp's YouTube
    // extractor uses to decide whether a browser session is authenticated:
    // LOGIN_INFO plus at least one SAPISID variant. Any future expansion must
    // bump this protocol version so the browser and companion can review the
    // larger credential surface independently.
    const PROTOCOL_VERSION = 1;
    const MINIMUM_COMPANION_API = 2;
    const QUERY_DOMAIN = '.youtube.com';
    const ALLOWED_DOMAINS = Object.freeze(['.youtube.com', 'youtube.com']);
    const ALLOWED_COOKIE_NAMES = Object.freeze([
        'LOGIN_INFO',
        'SAPISID',
        '__Secure-1PAPISID',
        '__Secure-3PAPISID'
    ]);
    const SID_COOKIE_NAMES = Object.freeze(ALLOWED_COOKIE_NAMES.slice(1));
    const MAX_COOKIE_VALUE_BYTES = 4096;
    const MAX_HANDOFF_VALUE_BYTES = ALLOWED_COOKIE_NAMES.length * MAX_COOKIE_VALUE_BYTES;
    const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

    const allowedNameSet = new Set(ALLOWED_COOKIE_NAMES);

    function normalizeCookieExpiry(value) {
        const normalized = Number(value);
        return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
    }

    function utf8ByteLength(value) {
        const text = String(value);
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;

        // All supported browsers expose TextEncoder. Keep a deterministic
        // fallback for direct tooling and reject no valid Unicode merely
        // because an older JS host is inspecting the contract.
        let bytes = 0;
        for (const character of text) {
            const codePoint = character.codePointAt(0);
            if (codePoint <= 0x7f) bytes += 1;
            else if (codePoint <= 0x7ff) bytes += 2;
            else if (codePoint <= 0xffff) bytes += 3;
            else bytes += 4;
        }
        return bytes;
    }

    function emptyReasonCounts() {
        return {
            invalidCookie: 0,
            unknownName: 0,
            invalidDomain: 0,
            invalidPath: 0,
            insecure: 0,
            invalidValue: 0,
            oversizedValue: 0,
            duplicate: 0,
            totalTooLarge: 0,
            incompleteSet: 0
        };
    }

    function incrementReason(reasons, reason, count = 1) {
        reasons[reason] = (reasons[reason] || 0) + count;
    }

    function validateCookie(cookie) {
        if (!cookie || typeof cookie !== 'object' || Array.isArray(cookie)) {
            return { ok: false, reason: 'invalidCookie' };
        }
        if (typeof cookie.name !== 'string' || !allowedNameSet.has(cookie.name)) {
            return { ok: false, reason: 'unknownName' };
        }
        const domain = typeof cookie.domain === 'string' ? cookie.domain.toLowerCase() : '';
        if (!ALLOWED_DOMAINS.includes(domain)) {
            return { ok: false, reason: 'invalidDomain' };
        }
        if (cookie.path !== '/') {
            return { ok: false, reason: 'invalidPath' };
        }
        if (cookie.secure !== true) {
            return { ok: false, reason: 'insecure' };
        }
        if (typeof cookie.value !== 'string' || !cookie.value || CONTROL_CHARACTERS.test(cookie.value)) {
            return { ok: false, reason: 'invalidValue' };
        }
        const valueBytes = utf8ByteLength(cookie.value);
        if (valueBytes > MAX_COOKIE_VALUE_BYTES) {
            return { ok: false, reason: 'oversizedValue' };
        }
        return {
            ok: true,
            valueBytes,
            cookie: {
                domain,
                name: cookie.name,
                value: cookie.value,
                path: '/',
                secure: true,
                httpOnly: cookie.httpOnly === true,
                expirationDate: normalizeCookieExpiry(cookie.expirationDate)
            }
        };
    }

    function domainPreference(domain) {
        return domain === QUERY_DOMAIN ? 2 : 1;
    }

    function diagnosticsFor(examinedCount, acceptedCount, acceptedBytes, reasons) {
        return {
            protocolVersion: PROTOCOL_VERSION,
            examinedCount,
            acceptedCount,
            acceptedBytes,
            droppedCount: Math.max(0, examinedCount - acceptedCount),
            reasons: { ...reasons }
        };
    }

    function sanitizeCookieHandoff(cookies) {
        const source = Array.isArray(cookies) ? cookies : [];
        const reasons = emptyReasonCounts();
        const selected = new Map();

        for (const candidate of source) {
            const validated = validateCookie(candidate);
            if (!validated.ok) {
                incrementReason(reasons, validated.reason);
                continue;
            }

            const existing = selected.get(validated.cookie.name);
            if (existing) {
                incrementReason(reasons, 'duplicate');
                if (domainPreference(validated.cookie.domain) <= domainPreference(existing.cookie.domain)) continue;
            }
            selected.set(validated.cookie.name, validated);
        }

        const hasPrimary = selected.has('LOGIN_INFO');
        const hasSid = SID_COOKIE_NAMES.some((name) => selected.has(name));
        if (!hasPrimary || !hasSid) {
            incrementReason(reasons, 'incompleteSet', selected.size || 1);
            return {
                cookies: [],
                diagnostics: diagnosticsFor(source.length, 0, 0, reasons)
            };
        }

        const ordered = ALLOWED_COOKIE_NAMES
            .filter((name) => selected.has(name))
            .map((name) => selected.get(name));
        const acceptedBytes = ordered.reduce((total, entry) => total + entry.valueBytes, 0);
        if (acceptedBytes > MAX_HANDOFF_VALUE_BYTES) {
            incrementReason(reasons, 'totalTooLarge', ordered.length);
            return {
                cookies: [],
                diagnostics: diagnosticsFor(source.length, 0, 0, reasons)
            };
        }

        return {
            cookies: ordered.map((entry) => entry.cookie),
            diagnostics: diagnosticsFor(source.length, ordered.length, acceptedBytes, reasons)
        };
    }

    return Object.freeze({
        PROTOCOL_VERSION,
        MINIMUM_COMPANION_API,
        QUERY_DOMAIN,
        ALLOWED_DOMAINS,
        ALLOWED_COOKIE_NAMES,
        SID_COOKIE_NAMES,
        MAX_COOKIE_VALUE_BYTES,
        MAX_HANDOFF_VALUE_BYTES,
        normalizeCookieExpiry,
        sanitizeCookieHandoff,
        utf8ByteLength
    });
});
