(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.YTKitCore = root.YTKitCore || {};
    root.YTKitCore.persistedDomains = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // Browser surfaces load core/remote-list-scope.js ahead of this module via
    // the manifest. Direct Node consumers (tests, build tooling) get it here so
    // the filter-list URL rules cannot silently differ between the two.
    if (!globalThis.YTKitCore?.describeRemoteListUrl
        && typeof module !== 'undefined' && module.exports
        && typeof require === 'function') {
        try {
            require('./remote-list-scope');
        } catch (_) {
            // reason: the scope module is optional here; normalizeFilterListUrl
            // fails closed when it is absent.
        }
    }

    if (!globalThis.YTKitCore?.sanitizeZapperRules
        && typeof module !== 'undefined' && module.exports
        && typeof require === 'function') {
        try {
            require('./element-zapper');
        } catch (_) {
            // reason: same posture as the scope module above. When it is
            // absent the zapper domain sanitizes to an empty rule list rather
            // than passing selectors through a generic clone that knows
            // nothing about the grammar.
        }
    }

    const BACKUP_EXPORT_VERSION = 5;
    const BACKUP_SCHEMA_VERSION = 2;
    const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
    const MAX_MESSAGE_BYTES = 1024 * 1024;
    const FILTER_LIST_VERSION = 1;
    const FILTER_LIST_KIND = 'video-hider-rules';
    const FILTER_LIST_MAX_BYTES = 1024 * 1024;
    const FILTER_LIST_MAX_KEYWORD_CHARS = 20000;
    const FILTER_LIST_SUBSCRIPTION_KEY = 'ytkit-video-filter-list-subscription';
    const FILTER_LIST_SUBSCRIPTION_VERSION = 2;
    const FILTER_LIST_STALE_MS = 7 * 24 * 60 * 60 * 1000;
    const FILTER_LIST_REFRESH_MODES = new Set(['daily', 'weekly', 'manual']);
    const FILTER_LIST_STATES = new Set(['disabled', 'pending', 'active', 'stale', 'error']);
    const FILTER_LIST_ERROR_CODES = new Set([
        'unreachable', 'bad-format', 'too-large', 'http-error', 'storage-error',
        'integrity-error', 'not-modified-without-cache', 'unknown'
    ]);
    const HIGHLIGHT_EXPORT_VERSION = 1;
    const HIGHLIGHT_EXPORT_KIND = 'video-highlight-bundle';
    const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
    const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
    const SENSITIVE_KEYS = new Set([
        '_errors',
        'aiSummaryApiKey',
        'apiKey',
        'authorization',
        'cookie',
        'cookies',
        'password',
        'secret',
        'token'
    ]);

    function isSensitiveKey(key) {
        const raw = String(key || '');
        const normalized = raw.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (SENSITIVE_KEYS.has(raw.toLowerCase())) return true;
        return /(?:apikey|authorization|cookie|password|secret|token)(?:hash|value)?$/.test(normalized);
    }

    // This is the single inventory for durable Astra state. Entries marked
    // exclude are intentional: they are either rebuildable, runtime-only, or
    // security identities that must never travel in a portable backup.
    const DURABLE_DOMAIN_REGISTRY = Object.freeze([
        { id: 'settings', location: 'extension-local', key: 'ytSuiteSettings', backup: 'include', strategy: 'merge-defaults-then-replace', credentialScrub: 'schema-and-sensitive-keys', migration: 'settings-schema' },
        { id: 'hiddenVideos', location: 'extension-local', key: 'ytkit-hidden-videos', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'video-id-list' },
        { id: 'allowedVideos', location: 'extension-local', key: 'ytkit-video-hider-allowed-videos', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'video-id-list' },
        { id: 'markedWatchedVideos', location: 'extension-local', key: 'ytkit-marked-watched-videos', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'video-id-list-lru' },
        { id: 'blockedChannels', location: 'extension-local', key: 'ytkit-blocked-channels', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'blocked-channel-list' },
        { id: 'allowedChannels', location: 'extension-local', key: 'ytkit-allowed-channels', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'allowed-channel-list' },
        { id: 'videoFilterListSubscription', location: 'extension-local', key: FILTER_LIST_SUBSCRIPTION_KEY, backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'video-filter-list-subscription-v2' },
        { id: 'bookmarks', location: 'extension-local', key: 'ytkit-bookmarks', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'timestamp-bookmarks' },
        { id: 'watchProgress', location: 'extension-local', key: 'ytkit-watch-progress', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'watch-progress-v1' },
        { id: 'watchTime', location: 'extension-local', key: 'ytkit-watch-time', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'watch-time-v1' },
        { id: 'channelSpeeds', location: 'extension-local', key: 'ytkit-channel-speeds', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'channel-speed-v1' },
        { id: 'resumePositions', location: 'extension-local', key: 'ytkit_resume_positions', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'resume-position-v1' },
        { id: 'playlistResume', location: 'extension-local', key: 'ytkit-playlist-resume', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'playlist-resume-v1' },
        { id: 'persistentQueue', location: 'extension-local', key: 'ytkit-queue', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'queue-v1' },
        { id: 'reactionSpammerState', location: 'extension-local', key: 'ytkitReactionSpammerState', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'reaction-state-v1' },
        { id: 'watchLaterRemovalLog', location: 'extension-local', key: 'ytkit-wl-removal-log', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'bounded-log-v1' },
        { id: 'recommendationScrubSessions', location: 'extension-local', key: 'ytkit-scrub-sessions', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'bounded-log-v1' },
        { id: 'subscriptionUnsubscribeSessions', location: 'extension-local', key: 'ytkit-subscription-unsubscribe-sessions', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'bounded-log-v1' },
        { id: 'usageStats', location: 'extension-local', key: 'ytkit_stats', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'bounded-object-v1' },
        { id: 'localeOverride', location: 'extension-local', key: '_localeOverride', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'locale-tag-v1' },
        { id: 'debugPreference', location: 'extension-local', key: 'ytkit_debug', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'boolean-v1' },
        { id: 'playerControlDismissals', location: 'extension-local-prefix', keyPrefix: 'ytkit_pc_', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'boolean-map-v1' },
        { id: 'theaterSplitRatio', location: 'extension-local', key: 'ytkit_split_ratio', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'percentage-v1' },
        { id: 'digitalWellbeingDismissal', location: 'extension-local', key: 'ytkit_dw_cap_dismissed_date', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'date-string-v1' },
        { id: 'feedTriageRecovery', location: 'extension-local', key: 'ytkit-feed-triage-backup', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'recovery-v1' },
        { id: 'lowPowerRecovery', location: 'extension-local', key: 'ytkit-low-power-backup', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'recovery-v1' },
        { id: 'privacyPresetRecovery', location: 'extension-local', key: 'ytkit-preset-privacy-backup', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'recovery-v1' },
        { id: 'researcherPresetRecovery', location: 'extension-local', key: 'ytkit-preset-researcher-backup', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'recovery-v1' },
        { id: 'powerPresetRecovery', location: 'extension-local', key: 'ytkit-preset-power-backup', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'recovery-v1' },
        { id: 'focusPresetRecovery', location: 'extension-local', key: 'ytkit-preset-focus-backup', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'recovery-v1' },
        { id: 'transcriptIndex', location: 'youtube-indexeddb', db: 'ytkit-transcript-index', store: 'transcripts', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'transcript-index-v1' },
        { id: 'aiSummaries', location: 'extension-local', key: 'ytkit-ai-summaries', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'ai-summary-store-v1' },
        { id: 'aiTranscriptQa', location: 'extension-local', key: 'ytkit-ai-transcript-qa', backup: 'include', strategy: 'replace', credentialScrub: 'sensitive-keys', migration: 'transcript-qa-store-v1' },
        { id: 'elementZapperRules', location: 'extension-local', key: 'ytkit-element-zapper-rules', backup: 'include', strategy: 'replace', credentialScrub: 'not-applicable', migration: 'element-zapper-rules-v1' },

        { id: 'credentialVault', location: 'extension-session-and-indexeddb', key: 'ytkit-credential-vault', backup: 'exclude', reason: 'Credentials are intentionally non-portable and write-only.', credentialScrub: 'entire-domain', migration: 'none' },
        { id: 'deArrowIdentity', location: 'extension-local', key: 'ytkit-da-user-id', backup: 'exclude', reason: 'Pseudonymous API identity must rotate with a new installation.', credentialScrub: 'entire-domain', migration: 'none' },
        { id: 'deArrowCache', location: 'extension-local', key: 'da_branding_cache', backup: 'exclude', reason: 'Rebuildable network cache.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'sponsorBlockCache', location: 'extension-local', key: 'sb_segments_cache', backup: 'exclude', reason: 'Rebuildable network cache.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'returnDislikeCache', location: 'extension-local', key: 'ytkit-ryd-cache', backup: 'exclude', reason: 'Rebuildable network cache.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'featureCrashCounts', location: 'extension-local', key: 'ytkit_crash_counts', backup: 'exclude', reason: 'Installation-specific diagnostics.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'safeModeState', location: 'extension-local', key: 'ytkit_safe_mode', backup: 'exclude', reason: 'Installation-specific crash recovery state.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'diagnosticErrors', location: 'settings-nested', key: '_errors', backup: 'exclude', reason: 'Installation-specific diagnostics are scrubbed from settings.', credentialScrub: 'entire-domain', migration: 'none' },
        { id: 'firstRunState', location: 'extension-local', key: 'ytSuiteHasRun', backup: 'exclude', reason: 'Installation lifecycle flag.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'popupOnboardingState', location: 'extension-local', key: 'ytkit_first_run_seen', backup: 'exclude', reason: 'Installation lifecycle flag.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'popupReleaseState', location: 'extension-local', key: 'ytkit_last_seen_version', backup: 'exclude', reason: 'Installation lifecycle flag.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'popupDisclosureState', location: 'extension-local', key: 'ytkit_popup_schema_overview_expanded', backup: 'exclude', reason: 'Ephemeral popup presentation state.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'stickyChatLayout', location: 'extension-local', key: 'ytkit-sticky-chat-layout', backup: 'exclude', reason: 'Device-specific floating-panel position and opacity.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'companionPromptState', location: 'extension-local', key: 'ytkit_mediadl_prompt_dismissed', backup: 'exclude', reason: 'Installation-specific companion availability state.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'cookieHandoffDisclosure', location: 'extension-local', key: 'ytkit_cookie_handoff_disclosed_v1', backup: 'exclude', reason: 'Installation-specific acknowledgement of the local authenticated-download disclosure.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'pendingDownloadReveals', location: 'extension-session', key: '_pendingReveals', backup: 'exclude', reason: 'Service-worker recovery state, not user data.', credentialScrub: 'sensitive-keys', migration: 'none' },
        { id: 'serviceWorkerLifecycle', location: 'extension-session', key: '_swLifecycle', backup: 'exclude', reason: 'Service-worker diagnostics.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'updateRecovery', location: 'extension-local', key: '_updateRecovery', backup: 'exclude', reason: 'Service-worker update checkpoint; importing stale operations could replay completed recovery.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'resetUndoPointer', location: 'extension-local', key: '_resetSnapshot', backup: 'exclude', reason: 'Pointer to a local IndexedDB undo payload; it means nothing in another browser profile.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'importUndoPointer', location: 'extension-local', key: '_importSnapshot', backup: 'exclude', reason: 'Pointer to a local IndexedDB undo payload; it means nothing in another browser profile.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'playbackRecovery', location: 'youtube-session-storage', key: 'ytkit-playback-recovery', backup: 'exclude', reason: 'Short-lived tab recovery state expires after one minute.', credentialScrub: 'not-applicable', migration: 'none' },
        { id: 'pageCrashGuard', location: 'youtube-local-storage', key: '_ytkit_crash_guard', backup: 'exclude', reason: 'Installation-specific crash-loop guard.', credentialScrub: 'not-applicable', migration: 'none' }
    ].map(Object.freeze));

    const INCLUDED_DOMAINS = Object.freeze(DURABLE_DOMAIN_REGISTRY.filter((entry) => entry.backup === 'include'));
    const EXCLUDED_DOMAINS = Object.freeze(DURABLE_DOMAIN_REGISTRY.filter((entry) => entry.backup === 'exclude'));
    const DOMAIN_BY_ID = new Map(DURABLE_DOMAIN_REGISTRY.map((entry) => [entry.id, entry]));

    function isPlainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    // Array length, key count and depth were all bounded; string length was
    // not, so a crafted or corrupt backup could carry multi-megabyte strings
    // through sanitisation and either bloat storage or push every later write
    // into the 60s quota backoff for the rest of the session.
    const MAX_CLONED_STRING_LENGTH = 64 * 1024;

    function safeClone(value, depth = 0) {
        if (depth > 24) return null;
        if (value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'string') {
            return value.length > MAX_CLONED_STRING_LENGTH
                ? value.slice(0, MAX_CLONED_STRING_LENGTH)
                : value;
        }
        if (Array.isArray(value)) return value.slice(0, 10000).map((item) => safeClone(item, depth + 1));
        if (!isPlainObject(value)) return null;
        const out = {};
        let count = 0;
        for (const [key, item] of Object.entries(value)) {
            if (UNSAFE_KEYS.has(key) || isSensitiveKey(key) || count >= 10000) continue;
            out[key] = safeClone(item, depth + 1);
            count += 1;
        }
        return out;
    }

    function sanitizeVideoIds(value, max = 5000) {
        if (!Array.isArray(value)) return [];
        return [...new Set(value.filter((id) => typeof id === 'string').map((id) => id.trim()).filter((id) => VIDEO_ID_PATTERN.test(id)))].slice(0, max);
    }

    function sanitizeBlockedChannels(value) {
        if (!Array.isArray(value)) return [];
        const seen = new Set();
        const out = [];
        for (const row of value) {
            if (!isPlainObject(row)) continue;
            const id = typeof row.id === 'string' ? row.id.trim().slice(0, 128) : '';
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const name = typeof row.name === 'string' ? row.name.trim().slice(0, 200) : id;
            out.push({ id, name: name || id });
            if (out.length >= 2000) break;
        }
        return out;
    }

    // Single source of truth for "may Astra Deck fetch this?" — core/remote-list-scope.js.
    // Delegating means a settings import cannot persist a loopback or RFC1918
    // filter-list URL that the background worker would then have to refuse:
    // the value never survives sanitization in the first place.
    //
    // Fails CLOSED when the scope module is absent. The only surface without
    // it is the standalone userscript, where the filter-list URL setting does
    // not exist (schema vehicle: 'extension'), so an empty string is the
    // correct answer there rather than a second, weaker copy of the rules.
    function normalizeFilterListUrl(value) {
        const describe = globalThis.YTKitCore?.describeRemoteListUrl;
        if (typeof describe !== 'function') return '';
        const described = describe(value);
        return described.ok === true ? described.url : '';
    }

    function sanitizeFilterListRules(value) {
        const raw = isPlainObject(value) ? value : {};
        const keywordFilter = typeof raw.keywordFilter === 'string'
            ? raw.keywordFilter.trim().slice(0, FILTER_LIST_MAX_KEYWORD_CHARS)
            : '';
        const predicateCode = typeof raw.predicateCode === 'string'
            ? raw.predicateCode.slice(0, FILTER_LIST_MAX_KEYWORD_CHARS)
            : '';
        return {
            keywordFilter,
            predicateEnabled: raw.predicateEnabled === true && !!predicateCode,
            predicateCode,
            hiddenVideos: sanitizeVideoIds(raw.hiddenVideos, 5000),
            allowedVideos: sanitizeVideoIds(raw.allowedVideos, 5000),
            blockedChannels: sanitizeBlockedChannels(raw.blockedChannels),
            allowedChannels: sanitizeBlockedChannels(raw.allowedChannels)
        };
    }

    function sanitizeRemoteFilterListRules(value) {
        const rules = sanitizeFilterListRules(value);
        // Remote filter lists are data, never code. Strip these fields before
        // persistence so backups, diagnostics, and future call sites cannot
        // accidentally revive a publisher-supplied predicate.
        rules.predicateEnabled = false;
        rules.predicateCode = '';
        return rules;
    }

    function sanitizeTimestamp(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    }

    function sanitizeHttpStatus(value) {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : 0;
    }

    function sanitizeHeaderValue(value, maxLength) {
        if (typeof value !== 'string') return '';
        return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
    }

    function sanitizeSha256(value) {
        const digest = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return /^[a-f0-9]{64}$/.test(digest) ? digest : '';
    }

    function invalidRemoteFilterList() {
        const error = new Error('Unsupported or invalid Astra Deck filter-list format');
        error.code = 'bad-format';
        return error;
    }

    function hasOnlyKeys(value, allowed) {
        return Object.keys(value).every((key) => allowed.has(key));
    }

    function validateRemoteChannelList(value) {
        if (value === undefined) return true;
        if (!Array.isArray(value) || value.length > 2000) return false;
        return value.every((row) => isPlainObject(row)
            && hasOnlyKeys(row, new Set(['id', 'name']))
            && typeof row.id === 'string'
            && row.id.trim().length > 0
            && row.id.trim().length <= 128
            && (row.name === undefined || (typeof row.name === 'string' && row.name.length <= 200)));
    }

    function validateRemoteVideoIdList(value) {
        if (value === undefined) return true;
        return Array.isArray(value)
            && value.length <= 5000
            && value.every((id) => typeof id === 'string' && VIDEO_ID_PATTERN.test(id.trim()));
    }

    function parseRemoteVideoFilterList(value) {
        const topLevelKeys = new Set(['astraDeckFilterList', 'filterListVersion', 'kind', 'exportedAt', 'rules']);
        const ruleKeys = new Set([
            'keywordFilter', 'predicateEnabled', 'predicateCode', 'hiddenVideos',
            'allowedVideos', 'blockedChannels', 'allowedChannels'
        ]);
        if (!isPlainObject(value)
            || !hasOnlyKeys(value, topLevelKeys)
            || value.astraDeckFilterList !== true
            || value.kind !== FILTER_LIST_KIND
            || value.filterListVersion !== FILTER_LIST_VERSION
            || (value.exportedAt !== undefined && (typeof value.exportedAt !== 'string' || value.exportedAt.length > 64))
            || !isPlainObject(value.rules)
            || !hasOnlyKeys(value.rules, ruleKeys)) {
            throw invalidRemoteFilterList();
        }

        const rules = value.rules;
        if ((rules.keywordFilter !== undefined
                && (typeof rules.keywordFilter !== 'string' || rules.keywordFilter.length > FILTER_LIST_MAX_KEYWORD_CHARS))
            || (rules.predicateEnabled !== undefined && typeof rules.predicateEnabled !== 'boolean')
            || (rules.predicateCode !== undefined
                && (typeof rules.predicateCode !== 'string' || rules.predicateCode.length > FILTER_LIST_MAX_KEYWORD_CHARS))
            || !validateRemoteVideoIdList(rules.hiddenVideos)
            || !validateRemoteVideoIdList(rules.allowedVideos)
            || !validateRemoteChannelList(rules.blockedChannels)
            || !validateRemoteChannelList(rules.allowedChannels)) {
            throw invalidRemoteFilterList();
        }

        return {
            version: FILTER_LIST_VERSION,
            kind: FILTER_LIST_KIND,
            exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
            rules: sanitizeRemoteFilterListRules(rules)
        };
    }

    function sanitizeVideoFilterListSubscription(value) {
        const raw = isPlainObject(value) ? value : {};
        const sourceUrl = normalizeFilterListUrl(raw.sourceUrl || raw.url);
        const attemptedAt = sanitizeTimestamp(raw.attemptedAt);
        const latestStatus = sanitizeHttpStatus(raw.httpStatus);
        const rawGood = isPlainObject(raw.lastKnownGood) ? raw.lastKnownGood : null;
        const fetchedAt = sanitizeTimestamp(rawGood?.fetchedAt ?? raw.fetchedAt);
        const validatedAt = sanitizeTimestamp(rawGood?.validatedAt ?? raw.validatedAt) || fetchedAt;
        const hasLastKnownGood = Boolean(sourceUrl && fetchedAt);
        const legacyError = typeof raw.error === 'string' && raw.error.length > 0;
        const rawErrorCode = typeof raw.errorCode === 'string' ? raw.errorCode : '';
        const errorCode = FILTER_LIST_ERROR_CODES.has(rawErrorCode)
            ? rawErrorCode
            : (legacyError ? 'unknown' : '');
        const requestedState = FILTER_LIST_STATES.has(raw.state) ? raw.state : '';
        let state = requestedState;
        if (!sourceUrl) state = 'disabled';
        else if (!hasLastKnownGood) state = errorCode ? 'error' : 'pending';
        else if (errorCode || requestedState === 'stale' || requestedState === 'error') state = 'stale';
        else state = 'active';

        const rawRules = rawGood?.rules ?? raw.rules;
        const lastKnownGood = hasLastKnownGood ? {
            filterListVersion: FILTER_LIST_VERSION,
            fetchedAt,
            validatedAt,
            httpStatus: sanitizeHttpStatus(rawGood?.httpStatus) || 200,
            contentSha256: sanitizeSha256(rawGood?.contentSha256 ?? raw.contentSha256),
            etag: sanitizeHeaderValue(rawGood?.etag ?? raw.etag, 256),
            lastModified: sanitizeHeaderValue(rawGood?.lastModified ?? raw.lastModified, 128),
            rules: sanitizeRemoteFilterListRules(rawRules)
        } : null;

        return {
            schemaVersion: FILTER_LIST_SUBSCRIPTION_VERSION,
            sourceUrl,
            attemptedAt,
            httpStatus: latestStatus,
            state,
            staleEnabled: raw.staleEnabled !== false,
            refreshMode: FILTER_LIST_REFRESH_MODES.has(raw.refreshMode) ? raw.refreshMode : 'daily',
            errorCode: state === 'stale' || state === 'error' ? errorCode : '',
            lastKnownGood
        };
    }

    function resolveVideoFilterListSubscriptionState(value, now = Date.now()) {
        const subscription = sanitizeVideoFilterListSubscription(value);
        const good = subscription.lastKnownGood;
        const checkedAt = good?.validatedAt || good?.fetchedAt || 0;
        const nowMs = sanitizeTimestamp(now);
        const ageMs = checkedAt && nowMs ? Math.max(0, nowMs - checkedAt) : 0;
        const expired = Boolean(good && ageMs > FILTER_LIST_STALE_MS);
        const state = good && (subscription.state === 'stale' || expired)
            ? 'stale'
            : subscription.state;
        return {
            subscription,
            state,
            expired,
            ageMs,
            reasonCode: expired && !subscription.errorCode ? 'expired' : subscription.errorCode,
            rulesActive: Boolean(good && (state === 'active' || (state === 'stale' && subscription.staleEnabled)))
        };
    }

    function buildVideoFilterListSubscriptionMetadata(value, options = {}) {
        const resolved = resolveVideoFilterListSubscriptionState(value, options.now);
        const subscription = resolved.subscription;
        const good = subscription.lastKnownGood;
        let source = subscription.sourceUrl;
        if (options.redactSource === true && source) {
            try {
                const parsed = new URL(source);
                source = `${parsed.origin}${parsed.pathname}`;
            } catch (_) {
                source = '';
            }
        }
        const rules = good?.rules || {};
        return {
            schemaVersion: subscription.schemaVersion,
            source,
            attemptedAt: subscription.attemptedAt,
            httpStatus: subscription.httpStatus,
            state: resolved.state,
            staleEnabled: subscription.staleEnabled,
            refreshMode: subscription.refreshMode,
            errorCode: resolved.reasonCode,
            lastKnownGood: good ? {
                filterListVersion: good.filterListVersion,
                fetchedAt: good.fetchedAt,
                validatedAt: good.validatedAt,
                httpStatus: good.httpStatus,
                contentSha256: good.contentSha256,
                etag: good.etag,
                lastModified: good.lastModified,
                ruleCounts: {
                    keywordCharacters: typeof rules.keywordFilter === 'string' ? rules.keywordFilter.length : 0,
                    hiddenVideos: Array.isArray(rules.hiddenVideos) ? rules.hiddenVideos.length : 0,
                    allowedVideos: Array.isArray(rules.allowedVideos) ? rules.allowedVideos.length : 0,
                    blockedChannels: Array.isArray(rules.blockedChannels) ? rules.blockedChannels.length : 0,
                    allowedChannels: Array.isArray(rules.allowedChannels) ? rules.allowedChannels.length : 0
                }
            } : null
        };
    }

    function buildVideoFilterListRules(source = {}) {
        const raw = isPlainObject(source) ? source : {};
        const settings = isPlainObject(raw.settings) ? raw.settings : raw;
        return sanitizeFilterListRules({
            keywordFilter: settings.hideVideosKeywordFilter,
            predicateEnabled: settings.advancedLocalPredicate,
            predicateCode: settings.advancedLocalPredicateCode,
            hiddenVideos: raw.hiddenVideos,
            allowedVideos: raw.allowedVideos,
            blockedChannels: raw.blockedChannels,
            allowedChannels: raw.allowedChannels
        });
    }

    function createVideoFilterList(rules, options = {}) {
        return {
            astraDeckFilterList: true,
            filterListVersion: FILTER_LIST_VERSION,
            kind: FILTER_LIST_KIND,
            exportedAt: typeof options.exportedAt === 'string' ? options.exportedAt : new Date().toISOString(),
            rules: sanitizeFilterListRules(rules)
        };
    }

    function parseVideoFilterList(value) {
        if (!isPlainObject(value)
            || value.astraDeckFilterList !== true
            || value.kind !== FILTER_LIST_KIND
            || Number(value.filterListVersion) !== FILTER_LIST_VERSION
            || !isPlainObject(value.rules)) {
            throw new Error('Unsupported or invalid Astra Deck filter-list format');
        }
        return {
            version: FILTER_LIST_VERSION,
            kind: FILTER_LIST_KIND,
            exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt.slice(0, 64) : '',
            rules: sanitizeFilterListRules(value.rules)
        };
    }

    function sanitizeBookmarks(value) {
        if (!isPlainObject(value)) return {};
        const videos = [];
        for (const [videoId, rawEntries] of Object.entries(value)) {
            if (!VIDEO_ID_PATTERN.test(videoId) || !Array.isArray(rawEntries)) continue;
            const byTime = new Map();
            for (const raw of rawEntries) {
                if (!isPlainObject(raw)) continue;
                const time = Math.floor(Number(raw.t));
                if (!Number.isFinite(time) || time < 0 || byTime.has(time)) continue;
                byTime.set(time, {
                    t: time,
                    n: typeof raw.n === 'string' ? raw.n.slice(0, 500) : '',
                    d: Number.isFinite(Number(raw.d)) && Number(raw.d) > 0 ? Math.floor(Number(raw.d)) : 0
                });
            }
            const entries = [...byTime.values()].sort((a, b) => b.d - a.d || a.t - b.t).slice(0, 100).sort((a, b) => a.t - b.t);
            if (entries.length) videos.push([videoId, entries, Math.max(...entries.map((row) => row.d))]);
        }
        videos.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
        return Object.fromEntries(videos.slice(0, 400).map(([videoId, entries]) => [videoId, entries]));
    }

    function sanitizeChannelSpeeds(value) {
        if (!isPlainObject(value)) return {};
        const out = {};
        for (const [id, raw] of Object.entries(value).slice(-500)) {
            if (UNSAFE_KEYS.has(id) || !id || id.length > 160) continue;
            const speed = Number(raw);
            if (Number.isFinite(speed) && speed >= 0.05 && speed <= 16) out[id] = speed;
        }
        return out;
    }

    function formatLocalDateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function sanitizeWatchProgress(value, now = Date.now()) {
        if (!isPlainObject(value)) return {};
        const cutoff = now - (30 * 24 * 60 * 60 * 1000);
        const rows = [];
        for (const [videoId, raw] of Object.entries(value)) {
            if (!VIDEO_ID_PATTERN.test(videoId) || !isPlainObject(raw)) continue;
            const percent = Number(raw.p);
            const updatedAt = Number(raw.t);
            if (!Number.isFinite(percent) || !Number.isFinite(updatedAt) || updatedAt < cutoff) continue;
            rows.push([videoId, { p: Math.max(0, Math.min(100, Math.round(percent))), t: Math.floor(updatedAt) }]);
        }
        rows.sort((a, b) => b[1].t - a[1].t || a[0].localeCompare(b[0]));
        return Object.fromEntries(rows.slice(0, 2000));
    }

    function sanitizeWatchTime(value, now = new Date()) {
        const raw = isPlainObject(value) ? value : {};
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffKey = formatLocalDateKey(cutoff);
        const todayKey = formatLocalDateKey(now);
        const days = [];
        for (const [day, secondsRaw] of Object.entries(isPlainObject(raw.days) ? raw.days : {})) {
            const seconds = Number(secondsRaw);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day <= cutoffKey || day > todayKey || !Number.isFinite(seconds) || seconds <= 0) continue;
            days.push([day, seconds]);
        }
        days.sort((a, b) => b[0].localeCompare(a[0]));
        const importedRows = [];
        for (const [key, row] of Object.entries(isPlainObject(raw.imported) ? raw.imported : {})) {
            if (UNSAFE_KEYS.has(key) || !isPlainObject(row) || !VIDEO_ID_PATTERN.test(String(row.videoId || ''))) continue;
            const watchedAtMs = Date.parse(row.watchedAt || '');
            const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(row.dayKey || '') ? row.dayKey : '';
            if (!Number.isFinite(watchedAtMs) || !dayKey || dayKey <= cutoffKey || dayKey > todayKey) continue;
            importedRows.push([key.slice(0, 160), {
                videoId: row.videoId,
                watchedAt: new Date(watchedAtMs).toISOString(),
                dayKey,
                title: String(row.title || 'Untitled YouTube video').slice(0, 180),
                seconds: Math.max(1, Math.min(86400, Math.floor(Number(row.seconds) || 60)))
            }]);
        }
        importedRows.sort((a, b) => b[1].watchedAt.localeCompare(a[1].watchedAt));
        const total = Number(raw.total);
        return {
            days: Object.fromEntries(days.slice(0, 90)),
            total: Number.isFinite(total) && total > 0 ? total : 0,
            imported: Object.fromEntries(importedRows.slice(0, 5000))
        };
    }

    function sanitizeResumePositions(value) {
        if (!isPlainObject(value)) return {};
        const rows = [];
        for (const [id, raw] of Object.entries(value)) {
            if (!VIDEO_ID_PATTERN.test(id) || !isPlainObject(raw)) continue;
            const time = Number(raw.time);
            const ts = Number(raw.ts);
            if (Number.isFinite(time) && time > 0 && Number.isFinite(ts) && ts > 0) rows.push([id, { time, ts }]);
        }
        rows.sort((a, b) => a[1].ts - b[1].ts);
        return Object.fromEntries(rows.slice(-500));
    }

    function sanitizePlaylistResume(value) {
        if (!isPlainObject(value)) return {};
        const rows = [];
        for (const [playlistId, raw] of Object.entries(value)) {
            if (!/^[A-Za-z0-9_-]{1,128}$/.test(playlistId) || !isPlainObject(raw)) continue;
            const videoId = String(raw.videoId || '');
            const ts = Number(raw.ts);
            if (!VIDEO_ID_PATTERN.test(videoId) || !Number.isFinite(ts) || ts <= 0) continue;
            rows.push([playlistId, { videoId, ts }]);
        }
        rows.sort((left, right) => left[1].ts - right[1].ts);
        return Object.fromEntries(rows.slice(-200));
    }

    function sanitizeQueue(value) {
        if (!isPlainObject(value)) return { v: 1, items: [] };
        const seen = new Set();
        const items = [];
        for (const row of Array.isArray(value.items) ? value.items : []) {
            if (!isPlainObject(row) || !VIDEO_ID_PATTERN.test(String(row.id || '')) || seen.has(row.id)) continue;
            seen.add(row.id);
            items.push({
                id: row.id,
                title: String(row.title || row.id).slice(0, 300),
                channel: String(row.channel || '').slice(0, 200),
                addedAt: Number.isFinite(Number(row.addedAt)) ? Number(row.addedAt) : 0
            });
            if (items.length >= 200) break;
        }
        return { v: 1, items, updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0 };
    }

    function sanitizeReactionState(value) {
        const raw = isPlainObject(value) ? value : {};
        const pos = isPlainObject(raw.pos) ? raw.pos : {};
        return {
            selected: [...new Set((Array.isArray(raw.selected) ? raw.selected : []).filter((item) => typeof item === 'string').map((item) => item.slice(0, 100)))].slice(0, 64),
            intervalMs: Math.max(500, Math.min(60000, Number(raw.intervalMs) || 600)),
            pos: {
                x: Math.max(0, Math.min(10000, Number(pos.x) || 20)),
                y: Math.max(0, Math.min(10000, Number(pos.y) || 80))
            },
            collapsed: !!raw.collapsed
        };
    }

    function sanitizeTranscriptRecords(value) {
        const records = Array.isArray(value) ? value : (Array.isArray(value?.records) ? value.records : []);
        const byId = new Map();
        for (const row of records) {
            if (!isPlainObject(row) || !VIDEO_ID_PATTERN.test(String(row.videoId || ''))) continue;
            const text = typeof row.text === 'string' ? row.text.slice(0, 200000) : '';
            if (text.length < 1) continue;
            const provenance = typeof globalThis.YTKitCore?.sanitizeTranscriptProvenance === 'function'
                ? globalThis.YTKitCore.sanitizeTranscriptProvenance(row.provenance)
                : {
                    source: 'none', language: '', fetchedAt: 0, expiresAt: 0,
                    staleReason: '', fallbackReason: ''
                };
            byId.set(row.videoId, {
                videoId: row.videoId,
                title: typeof row.title === 'string' ? row.title.slice(0, 200) : '',
                text,
                indexedAt: Number.isFinite(Number(row.indexedAt)) ? Number(row.indexedAt) : 0,
                provenance
            });
        }
        return [...byId.values()].sort((a, b) => a.indexedAt - b.indexedAt).slice(-1000);
    }

    function sanitizeDomainValue(id, value) {
        switch (id) {
        case 'hiddenVideos': return sanitizeVideoIds(value, 5000);
        case 'allowedVideos': return sanitizeVideoIds(value, 5000);
        case 'markedWatchedVideos': return sanitizeVideoIds(Array.isArray(value) ? value.slice(-5000) : value, 5000);
        case 'blockedChannels': return sanitizeBlockedChannels(value);
        case 'allowedChannels': return sanitizeBlockedChannels(value);
        case 'videoFilterListSubscription': return sanitizeVideoFilterListSubscription(value);
        case 'bookmarks': return sanitizeBookmarks(value);
        case 'watchProgress': return sanitizeWatchProgress(value);
        case 'watchTime': return sanitizeWatchTime(value);
        case 'channelSpeeds': return sanitizeChannelSpeeds(value);
        case 'resumePositions': return sanitizeResumePositions(value);
        case 'playlistResume': return sanitizePlaylistResume(value);
        case 'persistentQueue': return sanitizeQueue(value);
        case 'reactionSpammerState': return sanitizeReactionState(value);
        case 'watchLaterRemovalLog': return (Array.isArray(value) ? value : []).slice(-500).map((row) => safeClone(row));
        case 'recommendationScrubSessions': return (Array.isArray(value) ? value : []).slice(-20).map((row) => safeClone(row));
        case 'subscriptionUnsubscribeSessions': return (Array.isArray(value) ? value : []).slice(-20).map((row) => safeClone(row));
        case 'localeOverride': return typeof value === 'string' && /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})?$/.test(value) ? value.slice(0, 16) : '';
        case 'debugPreference': return value === true;
        case 'playerControlDismissals': {
            if (!isPlainObject(value)) return {};
            return Object.fromEntries(Object.entries(value).filter(([key]) => /^ytkit_pc_[A-Za-z0-9_-]{1,80}$/.test(key)).slice(0, 100).map(([key, item]) => [key, item === true]));
        }
        case 'theaterSplitRatio': return Math.max(20, Math.min(85, Number(value) || 75));
        case 'digitalWellbeingDismissal': return typeof value === 'string' ? value.slice(0, 32) : '';
        case 'transcriptIndex': return sanitizeTranscriptRecords(value);
        case 'elementZapperRules': {
            const zapperSanitizer = globalThis.YTKitCore?.sanitizeZapperRules;
            return typeof zapperSanitizer === 'function' ? zapperSanitizer(value) : [];
        }
        case 'aiSummaries': {
            // Delegates to the artifact service's bounded/validated store
            // sanitizer when it is loaded; falls back to a plain-object clone.
            const summarySanitizer = globalThis.YTKitCore?.aiSummaryArtifacts?.sanitizeArtifactStore;
            if (typeof summarySanitizer === 'function') return summarySanitizer(value);
            return isPlainObject(value) ? safeClone(value) : {};
        }
        case 'aiTranscriptQa': {
            const qaSanitizer = globalThis.YTKitCore?.aiSummaryArtifacts?.sanitizeQaStore;
            if (typeof qaSanitizer === 'function') return qaSanitizer(value);
            return isPlainObject(value) ? safeClone(value) : {};
        }
        default: return safeClone(value);
        }
    }

    function countItems(value) {
        if (Array.isArray(value)) return value.length;
        if (isPlainObject(value)) return Object.keys(value).length;
        return value === undefined || value === null ? 0 : 1;
    }

    function defaultDomainValue(id) {
        if (['hiddenVideos', 'allowedVideos', 'markedWatchedVideos', 'blockedChannels', 'allowedChannels', 'watchLaterRemovalLog', 'recommendationScrubSessions', 'subscriptionUnsubscribeSessions', 'transcriptIndex', 'elementZapperRules'].includes(id)) return [];
        if (id === 'videoFilterListSubscription') return sanitizeVideoFilterListSubscription({});
        if (id === 'persistentQueue') return { v: 1, items: [] };
        if (id === 'reactionSpammerState') return sanitizeReactionState({});
        if (id === 'localeOverride' || id === 'digitalWellbeingDismissal') return '';
        if (id === 'debugPreference') return false;
        if (id === 'theaterSplitRatio') return 75;
        if (['feedTriageRecovery', 'lowPowerRecovery', 'privacyPresetRecovery', 'researcherPresetRecovery', 'powerPresetRecovery', 'focusPresetRecovery'].includes(id)) return null;
        return {};
    }

    function buildIncludedDomainPayload(allStorage, overrides = {}) {
        const storage = isPlainObject(allStorage) ? allStorage : {};
        const out = {};
        for (const domain of INCLUDED_DOMAINS) {
            if (domain.location === 'youtube-indexeddb') continue;
            const value = Object.prototype.hasOwnProperty.call(overrides, domain.id)
                ? overrides[domain.id]
                : (domain.keyPrefix
                    ? Object.fromEntries(Object.entries(storage).filter(([key]) => key.startsWith(domain.keyPrefix)))
                    : (Object.prototype.hasOwnProperty.call(storage, domain.key) ? storage[domain.key] : defaultDomainValue(domain.id)));
            out[domain.id] = sanitizeDomainValue(domain.id, value);
        }
        return out;
    }

    // A highlight pack is a focused, import-compatible backup. It carries
    // only the durable domains needed to restore the current video's notes,
    // bookmarks, and summaries, while the rendered transcript remains a
    // portable artifact rather than replacing the full transcript index.
    function createHighlightExport(domains, highlightBundle, options = {}) {
        const source = isPlainObject(domains) ? domains : {};
        const included = {};
        for (const domain of INCLUDED_DOMAINS) {
            if (!Object.prototype.hasOwnProperty.call(source, domain.id)) continue;
            included[domain.id] = sanitizeDomainValue(domain.id, source[domain.id]);
        }
        const settingsVersion = Number(options.settingsSchemaVersion);
        const unavailable = Array.isArray(options.unavailableDomains)
            ? [...new Set(options.unavailableDomains.filter((id) => typeof id === 'string').slice(0, 20))]
            : ['transcriptIndex'];
        return {
            astraDeckBackup: true,
            astraDeckHighlightExport: true,
            highlightExportVersion: HIGHLIGHT_EXPORT_VERSION,
            highlightExportKind: HIGHLIGHT_EXPORT_KIND,
            exportVersion: BACKUP_EXPORT_VERSION,
            backupSchemaVersion: BACKUP_SCHEMA_VERSION,
            settingsSchemaVersion: Number.isInteger(settingsVersion) && settingsVersion > 0 ? settingsVersion : 1,
            // Keep the legacy top-level mirrors for the userscript importer
            // and older Astra builds; the current popup uses `domains`.
            settings: included.settings || {},
            bookmarks: included.bookmarks || {},
            aiSummaries: included.aiSummaries || {},
            domains: included,
            unavailableDomains: unavailable,
            highlightBundle: safeClone(highlightBundle),
            exportDate: typeof options.exportDate === 'string' ? options.exportDate.slice(0, 64) : new Date().toISOString(),
            ytkitVersion: typeof options.ytkitVersion === 'string' ? options.ytkitVersion.slice(0, 32) : ''
        };
    }

    function domainsToExtensionWrites(domains) {
        const writes = {};
        if (!isPlainObject(domains)) return writes;
        for (const domain of INCLUDED_DOMAINS) {
            if (!domain.location.startsWith('extension-local') || !Object.prototype.hasOwnProperty.call(domains, domain.id)) continue;
            if (domain.keyPrefix && isPlainObject(domains[domain.id])) Object.assign(writes, domains[domain.id]);
            else writes[domain.key] = domains[domain.id];
        }
        return writes;
    }

    function extensionKeysToRemove(domains, currentStorage) {
        const removals = [];
        if (!isPlainObject(domains) || !isPlainObject(currentStorage)) return removals;
        for (const domain of INCLUDED_DOMAINS) {
            if (!domain.keyPrefix || !Object.prototype.hasOwnProperty.call(domains, domain.id)) continue;
            const incoming = isPlainObject(domains[domain.id]) ? domains[domain.id] : {};
            for (const key of Object.keys(currentStorage)) {
                if (key.startsWith(domain.keyPrefix) && !Object.prototype.hasOwnProperty.call(incoming, key)) removals.push(key);
            }
        }
        return removals;
    }

    function migrateBackup(raw) {
        if (!isPlainObject(raw)) throw new Error('Invalid backup format');
        const version = Number(raw.exportVersion || 1);
        if (!Number.isInteger(version) || version < 1) throw new Error('Invalid backup version');
        if (version > BACKUP_EXPORT_VERSION) {
            throw new Error(`Backup version ${version} is newer than this Astra Deck build supports (${BACKUP_EXPORT_VERSION})`);
        }
        const domains = {};
        if (version === BACKUP_EXPORT_VERSION) {
            if (Number(raw.backupSchemaVersion) !== BACKUP_SCHEMA_VERSION || !isPlainObject(raw.domains)) {
                throw new Error('Invalid current-version backup schema');
            }
            for (const domain of INCLUDED_DOMAINS) {
                if (Object.prototype.hasOwnProperty.call(raw.domains, domain.id)) domains[domain.id] = raw.domains[domain.id];
            }
        } else {
            if (isPlainObject(raw.settings)) domains.settings = raw.settings;
            else if (version === 1) domains.settings = raw;
            const hidden = Array.isArray(raw.hiddenVideos) ? raw.hiddenVideos : raw.filteredVideoPosts;
            if (Array.isArray(hidden)) domains.hiddenVideos = hidden;
            if (version >= 3 && Array.isArray(raw.allowedVideos)) domains.allowedVideos = raw.allowedVideos;
            if (version >= 3 && Array.isArray(raw.markedWatchedVideos)) domains.markedWatchedVideos = raw.markedWatchedVideos;
            if (version >= 2 && Array.isArray(raw.blockedChannels)) domains.blockedChannels = raw.blockedChannels;
            if (version >= 3 && Array.isArray(raw.allowedChannels)) domains.allowedChannels = raw.allowedChannels;
            if (version >= 3 && isPlainObject(raw.bookmarks)) domains.bookmarks = raw.bookmarks;
            // v4 backups: new-style top-level store, or the legacy in-settings
            // aiSummaryArtifactsData copy from builds before v4.49.7.
            const legacySummaries = isPlainObject(raw.aiSummaries)
                ? raw.aiSummaries
                : (isPlainObject(raw.settings?.aiSummaryArtifactsData) ? raw.settings.aiSummaryArtifactsData : null);
            if (legacySummaries) domains.aiSummaries = legacySummaries;
        }
        return {
            sourceVersion: version,
            settingsSchemaVersion: Number(raw.settingsSchemaVersion || raw.backupSchemaVersion || 1),
            domains,
            exclusions: EXCLUDED_DOMAINS.map(({ id, reason }) => ({ id, reason }))
        };
    }

    function parseHighlightExport(raw) {
        if (!isPlainObject(raw)
            || raw.astraDeckHighlightExport !== true
            || raw.highlightExportKind !== HIGHLIGHT_EXPORT_KIND
            || Number(raw.highlightExportVersion) !== HIGHLIGHT_EXPORT_VERSION) {
            throw new Error('Unsupported or invalid Astra Deck highlight export');
        }
        const migrated = migrateBackup(raw);
        return {
            ...migrated,
            highlightExportVersion: HIGHLIGHT_EXPORT_VERSION,
            highlightExportKind: HIGHLIGHT_EXPORT_KIND,
            highlightBundle: safeClone(raw.highlightBundle)
        };
    }

    function sanitizeMigratedDomains(migrated, settingsSanitizer) {
        const source = isPlainObject(migrated?.domains) ? migrated.domains : {};
        const domains = {};
        const droppedByDomain = {};
        const appliedByDomain = {};
        for (const [id, value] of Object.entries(source)) {
            const domain = DOMAIN_BY_ID.get(id);
            if (!domain || domain.backup !== 'include') continue;
            const rawCount = countItems(id === 'transcriptIndex' && isPlainObject(value) ? value.records : value);
            const sanitized = id === 'settings' && typeof settingsSanitizer === 'function'
                ? settingsSanitizer(value)
                : sanitizeDomainValue(id, value);
            domains[id] = sanitized;
            const appliedCount = id === 'settings' && isPlainObject(value) && isPlainObject(sanitized)
                ? Object.keys(value).filter((key) => Object.prototype.hasOwnProperty.call(sanitized, key) && !isSensitiveKey(key)).length
                : countItems(sanitized);
            appliedByDomain[id] = appliedCount;
            droppedByDomain[id] = Math.max(0, rawCount - appliedCount);
        }
        return { domains, droppedByDomain, appliedByDomain };
    }

    function buildImportPreview(domains, droppedByDomain = {}, appliedByDomain = {}) {
        let replace = 0;
        let merge = 0;
        for (const [id, value] of Object.entries(domains || {})) {
            const domain = DOMAIN_BY_ID.get(id);
            if (!domain) continue;
            const applied = Object.prototype.hasOwnProperty.call(appliedByDomain, id)
                ? Math.max(0, Number(appliedByDomain[id]) || 0)
                : countItems(value);
            if (domain.strategy.startsWith('merge')) merge += applied;
            else replace += applied;
        }
        const drop = Object.values(droppedByDomain).reduce((sum, value) => sum + (Number(value) || 0), 0);
        return {
            replace,
            merge,
            drop,
            exclusions: EXCLUDED_DOMAINS.map(({ id, reason }) => ({ id, reason }))
        };
    }

    function formatImportPreview(preview) {
        const p = preview || {};
        return `${Number(p.replace) || 0} items replace, ${Number(p.merge) || 0} settings merge, ${Number(p.drop) || 0} dropped; ${(p.exclusions || []).length} cache, runtime, diagnostic, or credential domains intentionally excluded`;
    }

    function estimateJsonBytes(value) {
        const json = JSON.stringify(value);
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).byteLength;
        return json.length * 2;
    }

    const PAGE_DB = Object.freeze({
        name: 'ytkit-transcript-index',
        version: 3,
        records: 'transcripts',
        snapshots: 'backupSnapshots',
        metadata: 'metadata',
        snapshotIndex: 'bySnapshot',
        termIndex: 'byTerm',
        ageIndex: 'byIndexedAt'
    });
    const SNAPSHOT_META_VIDEO_ID = '__astra_snapshot_meta__';
    const EXTENSION_SNAPSHOT_DB = Object.freeze({ name: 'ytkit-extension-snapshots', version: 1, store: 'entries', index: 'bySnapshot' });
    const EXTENSION_SNAPSHOT_META_KEY = '__astra_snapshot_meta__';

    function requestPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
        });
    }

    function transactionPromise(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
    }

    async function openPageDb(indexedDb = globalThis.indexedDB) {
        if (!indexedDb) throw new Error('IndexedDB is unavailable');
        const request = indexedDb.open(PAGE_DB.name, PAGE_DB.version);
        request.onupgradeneeded = () => {
            const db = request.result;
            const records = db.objectStoreNames.contains(PAGE_DB.records)
                ? request.transaction.objectStore(PAGE_DB.records)
                : db.createObjectStore(PAGE_DB.records, { keyPath: 'videoId' });
            if (!records.indexNames.contains(PAGE_DB.termIndex)) records.createIndex(PAGE_DB.termIndex, 'searchTerms', { unique: false, multiEntry: true });
            if (!records.indexNames.contains(PAGE_DB.ageIndex)) records.createIndex(PAGE_DB.ageIndex, 'indexedAt', { unique: false });
            if (!db.objectStoreNames.contains(PAGE_DB.snapshots)) {
                const store = db.createObjectStore(PAGE_DB.snapshots, { keyPath: ['snapshotId', 'videoId'] });
                store.createIndex(PAGE_DB.snapshotIndex, 'snapshotId', { unique: false });
            }
            if (!db.objectStoreNames.contains(PAGE_DB.metadata)) db.createObjectStore(PAGE_DB.metadata, { keyPath: 'key' });
        };
        return requestPromise(request);
    }

    function preparePageTranscriptRecord(record) {
        const prepare = globalThis.YTKitCore?.transcriptIndex?.prepareTranscriptRecord;
        return typeof prepare === 'function' ? prepare(record) : record;
    }

    async function readTranscriptChunk(options = {}) {
        const db = await openPageDb(options.indexedDB);
        const afterKey = typeof options.afterKey === 'string' ? options.afterKey : '';
        const byteLimit = Math.max(65536, Math.min(MAX_MESSAGE_BYTES, Number(options.maxBytes) || MAX_MESSAGE_BYTES));
        const records = [];
        let bytes = 2;
        let nextCursor = null;
        let done = true;
        try {
            const tx = db.transaction(PAGE_DB.records, 'readonly');
            const completion = transactionPromise(tx);
            const store = tx.objectStore(PAGE_DB.records);
            const keyRange = afterKey && globalThis.IDBKeyRange ? globalThis.IDBKeyRange.lowerBound(afterKey, true) : undefined;
            await new Promise((resolve, reject) => {
                const request = store.openCursor(keyRange);
                request.onerror = () => reject(request.error || new Error('Transcript export cursor failed'));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) { resolve(); return; }
                    const record = sanitizeTranscriptRecords([cursor.value])[0];
                    if (!record) { cursor.continue(); return; }
                    const recordBytes = estimateJsonBytes(record) + 1;
                    if (records.length && bytes + recordBytes > byteLimit) {
                        done = false;
                        resolve();
                        return;
                    }
                    records.push(record);
                    bytes += recordBytes;
                    nextCursor = String(cursor.primaryKey);
                    cursor.continue();
                };
            });
            await completion;
            return { records, nextCursor, done };
        } finally {
            db.close();
        }
    }

    async function replaceTranscriptRecords(records, options = {}) {
        const sanitized = sanitizeTranscriptRecords(records).map(preparePageTranscriptRecord);
        const db = await openPageDb(options.indexedDB);
        try {
            const tx = db.transaction(PAGE_DB.records, 'readwrite');
            const completion = transactionPromise(tx);
            const store = tx.objectStore(PAGE_DB.records);
            if (options.clearFirst) store.clear();
            for (const record of sanitized) store.put(record);
            await completion;
            return sanitized.length;
        } finally {
            db.close();
        }
    }

    async function clearTranscriptRecords(options = {}) {
        return replaceTranscriptRecords([], { ...options, clearFirst: true });
    }

    async function snapshotTranscriptRecords(snapshotId, options = {}) {
        if (!snapshotId) throw new Error('Snapshot id is required');
        const db = await openPageDb(options.indexedDB);
        try {
            const tx = db.transaction([PAGE_DB.records, PAGE_DB.snapshots], 'readwrite');
            const completion = transactionPromise(tx);
            const source = tx.objectStore(PAGE_DB.records);
            const snapshots = tx.objectStore(PAGE_DB.snapshots);
            const index = snapshots.index(PAGE_DB.snapshotIndex);
            const oldKeys = await requestPromise(index.getAllKeys(snapshotId));
            oldKeys.forEach((key) => snapshots.delete(key));
            // A marker distinguishes a valid empty snapshot from an expired or
            // corrupt token. Without it, retrying Undo after cleanup could
            // misread "not found" as "restore an empty transcript index".
            snapshots.put({ snapshotId, videoId: SNAPSHOT_META_VIDEO_ID, snapshotMeta: true });
            await new Promise((resolve, reject) => {
                const request = source.openCursor();
                request.onerror = () => reject(request.error || new Error('Transcript snapshot cursor failed'));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) { resolve(); return; }
                    const record = sanitizeTranscriptRecords([cursor.value])[0];
                    if (record) snapshots.put({ snapshotId, ...record });
                    cursor.continue();
                };
            });
            await completion;
            return true;
        } finally {
            db.close();
        }
    }

    async function deleteTranscriptSnapshot(snapshotId, options = {}) {
        const db = await openPageDb(options.indexedDB);
        try {
            const tx = db.transaction(PAGE_DB.snapshots, 'readwrite');
            const completion = transactionPromise(tx);
            const store = tx.objectStore(PAGE_DB.snapshots);
            const keys = await requestPromise(store.index(PAGE_DB.snapshotIndex).getAllKeys(snapshotId));
            keys.forEach((key) => store.delete(key));
            await completion;
        } finally {
            db.close();
        }
    }

    async function restoreTranscriptSnapshot(snapshotId, options = {}) {
        const db = await openPageDb(options.indexedDB);
        try {
            const tx = db.transaction([PAGE_DB.records, PAGE_DB.snapshots], 'readwrite');
            const completion = transactionPromise(tx);
            const records = tx.objectStore(PAGE_DB.records);
            const snapshots = tx.objectStore(PAGE_DB.snapshots);
            const rows = await requestPromise(snapshots.index(PAGE_DB.snapshotIndex).getAll(snapshotId));
            if (!rows.some((row) => row?.snapshotMeta === true && row.videoId === SNAPSHOT_META_VIDEO_ID)) {
                tx.abort();
                await completion.catch(() => {});
                throw new Error('Transcript recovery snapshot is missing or expired');
            }
            const transcriptRows = rows.filter((row) => row?.snapshotMeta !== true);
            // Prepare EVERY record before queueing the clear, the way
            // replaceTranscriptRecords does. A prepare throw after clear() left
            // the function without aborting, so the transaction committed the
            // wipe plus whatever partial restore had been queued.
            let prepared;
            try {
                prepared = transcriptRows.map((row) => {
                    const { snapshotId: _ignored, ...record } = row;
                    return preparePageTranscriptRecord(record);
                });
            } catch (error) {
                tx.abort();
                await completion.catch(() => {});
                throw error;
            }
            records.clear();
            for (const record of prepared) records.put(record);
            if (options.keepSnapshot !== true) rows.forEach((row) => snapshots.delete([snapshotId, row.videoId]));
            await completion;
            return transcriptRows.length;
        } finally {
            db.close();
        }
    }

    async function openExtensionSnapshotDb(indexedDb = globalThis.indexedDB) {
        if (!indexedDb) throw new Error('IndexedDB is unavailable');
        const request = indexedDb.open(EXTENSION_SNAPSHOT_DB.name, EXTENSION_SNAPSHOT_DB.version);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(EXTENSION_SNAPSHOT_DB.store)) {
                const store = db.createObjectStore(EXTENSION_SNAPSHOT_DB.store, { keyPath: ['snapshotId', 'key'] });
                store.createIndex(EXTENSION_SNAPSHOT_DB.index, 'snapshotId', { unique: false });
            }
        };
        return requestPromise(request);
    }

    async function deleteExtensionSnapshot(snapshotId, options = {}) {
        const db = await openExtensionSnapshotDb(options.indexedDB);
        try {
            const tx = db.transaction(EXTENSION_SNAPSHOT_DB.store, 'readwrite');
            const completion = transactionPromise(tx);
            const store = tx.objectStore(EXTENSION_SNAPSHOT_DB.store);
            const keys = await requestPromise(store.index(EXTENSION_SNAPSHOT_DB.index).getAllKeys(snapshotId));
            keys.forEach((key) => store.delete(key));
            await completion;
        } finally {
            db.close();
        }
    }

    async function writeExtensionSnapshot(snapshotId, snapshot, options = {}) {
        if (!snapshotId || !isPlainObject(snapshot)) throw new Error('Invalid extension snapshot');
        const db = await openExtensionSnapshotDb(options.indexedDB);
        try {
            const tx = db.transaction(EXTENSION_SNAPSHOT_DB.store, 'readwrite');
            const completion = transactionPromise(tx);
            const store = tx.objectStore(EXTENSION_SNAPSHOT_DB.store);
            const oldKeys = await requestPromise(store.index(EXTENSION_SNAPSHOT_DB.index).getAllKeys(snapshotId));
            oldKeys.forEach((key) => store.delete(key));
            store.put({ snapshotId, key: EXTENSION_SNAPSHOT_META_KEY, snapshotMeta: true });
            for (const [key, value] of Object.entries(snapshot)) store.put({ snapshotId, key, value });
            await completion;
            return true;
        } finally {
            db.close();
        }
    }

    async function readExtensionSnapshot(snapshotId, options = {}) {
        const db = await openExtensionSnapshotDb(options.indexedDB);
        try {
            const tx = db.transaction(EXTENSION_SNAPSHOT_DB.store, 'readonly');
            const completion = transactionPromise(tx);
            const rows = await requestPromise(tx.objectStore(EXTENSION_SNAPSHOT_DB.store).index(EXTENSION_SNAPSHOT_DB.index).getAll(snapshotId));
            await completion;
            if (!rows.some((row) => row?.snapshotMeta === true && row.key === EXTENSION_SNAPSHOT_META_KEY)) {
                throw new Error('Extension recovery snapshot is missing or expired');
            }
            return Object.fromEntries(rows.filter((row) => row?.snapshotMeta !== true).map((row) => [row.key, row.value]));
        } finally {
            db.close();
        }
    }

    return Object.freeze({
        BACKUP_EXPORT_VERSION,
        BACKUP_SCHEMA_VERSION,
        MAX_BACKUP_BYTES,
        MAX_MESSAGE_BYTES,
        FILTER_LIST_VERSION,
        FILTER_LIST_KIND,
        FILTER_LIST_MAX_BYTES,
        FILTER_LIST_SUBSCRIPTION_KEY,
        FILTER_LIST_SUBSCRIPTION_VERSION,
        FILTER_LIST_STALE_MS,
        HIGHLIGHT_EXPORT_VERSION,
        HIGHLIGHT_EXPORT_KIND,
        DURABLE_DOMAIN_REGISTRY,
        INCLUDED_DOMAINS,
        EXCLUDED_DOMAINS,
        PAGE_DB,
        openPageDb,
        buildIncludedDomainPayload,
        createHighlightExport,
        domainsToExtensionWrites,
        extensionKeysToRemove,
        migrateBackup,
        parseHighlightExport,
        sanitizeMigratedDomains,
        sanitizeDomainValue,
        normalizeFilterListUrl,
        sanitizeFilterListRules,
        sanitizeRemoteFilterListRules,
        sanitizeVideoFilterListSubscription,
        resolveVideoFilterListSubscriptionState,
        buildVideoFilterListSubscriptionMetadata,
        buildVideoFilterListRules,
        createVideoFilterList,
        parseVideoFilterList,
        parseRemoteVideoFilterList,
        sanitizeTranscriptRecords,
        buildImportPreview,
        formatImportPreview,
        countItems,
        estimateJsonBytes,
        readTranscriptChunk,
        replaceTranscriptRecords,
        clearTranscriptRecords,
        snapshotTranscriptRecords,
        restoreTranscriptSnapshot,
        deleteTranscriptSnapshot,
        writeExtensionSnapshot,
        readExtensionSnapshot,
        deleteExtensionSnapshot
    });
});
