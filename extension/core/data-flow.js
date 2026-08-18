(() => {
    'use strict';

    // extension/core/data-flow.js
    //
    // v4.10.0 data backing for the v5.0.0 data-flow panel (ROADMAP.md
    // v5.0.0 + v5.8.0). Enumerates every external origin Astra Deck can
    // contact, why each origin matters, which feature toggles drive
    // requests to it, what credentials policy the proxy applies, and
    // which profiles the origin is available in.
    //
    // The panel reads from `getOrigins()`. Each entry shape:
    //   {
    //     origin:               string,                       // 'https://sponsor.ajay.app'
    //     purpose:              string,                       // human-readable one-liner
    //     requiredByFeatures:   string[],                     // schema keys
    //     credentialsPolicy:    'no-cookies' | 'byo-key' | 'local-loopback' | 'none',
    //     profile:              'store-safe' | 'github-full', // resolved gate
    //     excludedProfiles:     string[],                    // artifact-specific exclusions
    //     hostGrant:            'required' | 'runtime-optional',
    //     manifestPermission:   string | null,                // matching host_permission, if present
    //     optionalManifestPermission: string | null,           // matching optional_host_permissions, if present
    //     currentlyActive:      boolean,                      // true iff any driving feature is enabled
    //     firefoxDataCollection: { required: string[], optional: string[] },
    //     riskBand:             'safe' | 'api' | 'local-companion' | 'experimental' | 'store-risk'
    //   }
    //
    // The module is pure data. Tests inject the schema, host permissions,
    // and a settings bag; production callers default to the live schema +
    // a manifest snapshot.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createDataFlow) return;

    const FIREFOX_TECHNICAL_AND_INTERACTION = 'technicalAndInteraction';

    function firefoxDataCollection(required = [], optional = []) {
        return Object.freeze({
            required: Object.freeze(Array.from(new Set(required))),
            optional: Object.freeze(Array.from(new Set(optional)))
        });
    }

    const SPONSORBLOCK_CANONICAL_ORIGIN = 'https://sponsor.ajay.app';
    // The maintained TeamPiped mirror implements the hash-prefix endpoint
    // Astra uses, so it is a safe bounded failover for segment lookups. Keep
    // this list explicit: a user-supplied origin must never become a STATIC
    // host permission or a silently-proxied target. The user-chosen
    // destinations in the catalogue — Video Hider lists and self-hosted
    // Cobalt — are instead
    // gated on a github-full-only optional permission, the browser's own
    // per-origin prompt, and the public-host denylist in
    // core/remote-list-scope.js. Nothing else may follow that pattern without
    // the same three gates.
    const SPONSORBLOCK_MIRROR_ORIGIN = 'https://sponsorblock.kavin.rocks';
    const SPONSORBLOCK_ALLOWED_ORIGINS = Object.freeze([
        SPONSORBLOCK_CANONICAL_ORIGIN,
        SPONSORBLOCK_MIRROR_ORIGIN
    ]);

    function normalizeSponsorBlockOrigin(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        try {
            const parsed = new URL(value.trim());
            if (parsed.protocol !== 'https:'
                || parsed.username || parsed.password
                || parsed.pathname !== '/' || parsed.search || parsed.hash) {
                return null;
            }
            const origin = parsed.origin;
            return SPONSORBLOCK_ALLOWED_ORIGINS.includes(origin) ? origin : null;
        } catch (_) {
            return null;
        }
    }

    function getSponsorBlockApiOrigins(settings = {}) {
        const primary = normalizeSponsorBlockOrigin(settings.sponsorBlockBaseUrl)
            || SPONSORBLOCK_CANONICAL_ORIGIN;
        const mirror = normalizeSponsorBlockOrigin(settings.sponsorBlockMirrorUrl);
        return Array.from(new Set([primary, mirror].filter(Boolean)));
    }

    let companionPorts = core.companionPorts || null;
    if (!companionPorts && typeof module !== 'undefined' && module.exports
        && typeof require === 'function') {
        try {
            companionPorts = require('./companion-ports');
        } catch (_) {
            // reason: direct Node consumers may load this module without the
            // manifest's companion-port bootstrap script.
        }
    }

    const COMPANION_ORIGIN_ENTRY = companionPorts ? Object.freeze({
        origin: companionPorts.origin,
        purpose: 'Astra Downloader local companion (health, downloads, history, stream links).',
        requiredByFeatures: [
            'showLocalDownloadButton', 'downloadHistoryPanel',
            'downloadHealthPanel', 'downloadStreamLinksPanel',
            'autoDownloadOnVisit', 'vlcMpvHandoff'
        ],
        credentialsPolicy: 'local-loopback',
        // The companion remains available in store-safe builds. The profile
        // ceiling blocks AI/Cobalt/Ollama, not the authenticated local handoff.
        profile: 'store-safe',
        // Chromium public-store artifacts deliberately remove the downloader
        // module and all loopback grants. Keep the catalogue entry visible for
        // diagnostics, but make the build-time exclusion explicit and shared.
        excludedProfiles: Object.freeze(['chromium-store']),
        hostGrant: 'required',
        // The companion can receive YouTube cookies and explicit download
        // choices (format/quality) outside the browser. Firefox forbids
        // technicalAndInteraction in the required list, so keep that category
        // optional while authentication information remains required for a
        // profile that exposes the authenticated handoff at all.
        firefoxDataCollection: firefoxDataCollection(
            ['authenticationInfo'],
            [FIREFOX_TECHNICAL_AND_INTERACTION]
        ),
        riskBand: 'local-companion'
    }) : null;

    // Origin catalogue. Each entry maps a stable origin to its purpose,
    // the schema keys that drive requests to it, and the credentials
    // policy applied by background.js. This is the source of truth the
    // popup data-flow panel reads — keep it sorted so the panel renders
    // a stable order across builds.
    const ORIGIN_CATALOGUE = Object.freeze([
        Object.freeze({
            origin: 'https://*.youtube.com',
            purpose: 'YouTube DOM, InnerTube fallback player response, caption tracks, and opt-in video insights.',
            requiredByFeatures: ['transcriptViewer', 'autoSubtitles', 'videoInsights'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            hostGrant: 'required',
            // These categories describe the core YouTube workflow shared by
            // every artifact. Profile-specific categories belong on the
            // origin that introduces them (for example, the companion above).
            firefoxDataCollection: firefoxDataCollection([
                'browsingActivity',
                'websiteContent',
                'websiteActivity'
            ]),
            riskBand: 'safe'
        }),
        Object.freeze({
            origin: 'https://i.ytimg.com',
            purpose: 'Thumbnail max-resolution upgrades and download.',
            requiredByFeatures: ['thumbnailQualityUpgrade', 'downloadThumbnail'],
            credentialsPolicy: 'none',
            profile: 'store-safe',
            hostGrant: 'runtime-optional',
            riskBand: 'safe'
        }),
        Object.freeze({
            origin: SPONSORBLOCK_CANONICAL_ORIGIN,
            purpose: 'SponsorBlock segments and DeArrow branding API; primary host.',
            requiredByFeatures: ['sponsorBlock', 'deArrow'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            hostGrant: 'runtime-optional',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: SPONSORBLOCK_MIRROR_ORIGIN,
            purpose: 'Configured SponsorBlock/DeArrow API failover mirror.',
            requiredByFeatures: ['sponsorBlock', 'deArrow'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            hostGrant: 'runtime-optional',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://returnyoutubedislikeapi.com',
            purpose: 'Return YouTube Dislike ratio + estimated dislike counts.',
            requiredByFeatures: ['returnDislike', 'returnDislikeOnCards'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            hostGrant: 'runtime-optional',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://raw.githubusercontent.com',
            purpose: 'Repair path: refreshes the YouTube selector packs when a layout change breaks a feature. Contacted only when you run a selector refresh, never automatically.',
            // Driven by an explicit user action from the selector-health
            // dashboard rather than a feature toggle, so it is never reported
            // as currently active. It is catalogued because the extension does
            // fetch it: the dev manifest declared the permission while the
            // catalogue did not, so every BUILT artifact dropped it and the
            // request survived only because GitHub raw sends
            // Access-Control-Allow-Origin: *. Disclosure should not rest on
            // another host's CORS policy.
            requiredByFeatures: [],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            hostGrant: 'required',
            riskBand: 'safe'
        }),
        Object.freeze({
            origin: 'https://www.reddit.com',
            purpose: 'Reddit discussion panel below the video.',
            requiredByFeatures: ['redditComments'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            hostGrant: 'runtime-optional',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://api.openai.com',
            purpose: 'BYO-key OpenAI summaries and transcript-translation fallback.',
            requiredByFeatures: ['aiVideoSummary', 'transcriptViewer'],
            credentialsPolicy: 'byo-key',
            profile: 'github-full',
            hostGrant: 'runtime-optional',
            runtimeOptionalProfiles: Object.freeze(['github-full']),
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://api.anthropic.com',
            purpose: 'BYO-key Anthropic summaries and transcript-translation fallback.',
            requiredByFeatures: ['aiVideoSummary', 'transcriptViewer'],
            credentialsPolicy: 'byo-key',
            profile: 'github-full',
            hostGrant: 'runtime-optional',
            runtimeOptionalProfiles: Object.freeze(['github-full']),
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://generativelanguage.googleapis.com',
            purpose: 'BYO-key Gemini summaries and transcript-translation fallback.',
            requiredByFeatures: ['aiVideoSummary', 'transcriptViewer'],
            credentialsPolicy: 'byo-key',
            profile: 'github-full',
            hostGrant: 'runtime-optional',
            runtimeOptionalProfiles: Object.freeze(['github-full']),
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'http://127.0.0.1:11434',
            purpose: 'Local Ollama runtime for offline AI summaries.',
            requiredByFeatures: ['aiVideoSummary'],
            credentialsPolicy: 'local-loopback',
            profile: 'github-full',
            hostGrant: 'required',
            riskBand: 'local-companion'
        }),
        ...(COMPANION_ORIGIN_ENTRY ? [COMPANION_ORIGIN_ENTRY] : []),
        // Dynamic destinations are patterns, not install-time host grants: the
        // github-full build declares `https://*/*` as optional so the browser
        // can prompt for one specific origin at a time. Generic feature-to-host
        // helpers skip `specificOriginRequired` entries to prevent an all-sites
        // prompt; the owning UI derives the exact origin from its setting.
        Object.freeze({
            origin: 'https://*',
            purpose: 'User-configured self-hosted Cobalt API, contacted only after an exact per-origin grant.',
            requiredByFeatures: ['downloadCobaltFallback'],
            credentialsPolicy: 'no-cookies',
            profile: 'github-full',
            hostGrant: 'runtime-optional',
            runtimeOptionalProfiles: Object.freeze(['github-full']),
            specificOriginRequired: true,
            riskBand: 'api'
        }),
        // core/remote-list-scope.js rejects private, loopback, link-local and
        // non-public hosts before a grant is even requested.
        Object.freeze({
            origin: 'https://*',
            purpose: 'User-configured Video Hider filter list, fetched anonymously from one granted HTTPS origin.',
            requiredByFeatures: ['hideVideosFilterListUrl'],
            credentialsPolicy: 'no-cookies',
            profile: 'github-full',
            hostGrant: 'runtime-optional',
            runtimeOptionalProfiles: Object.freeze(['github-full']),
            specificOriginRequired: true,
            riskBand: 'experimental'
        })
    ]);

    const ORIGIN_HOST_PERMISSION_ALIASES = Object.freeze({
        'https://www.reddit.com': Object.freeze([
            'https://www.reddit.com/*',
            'https://old.reddit.com/*'
        ]),
        ...(companionPorts ? {
            [companionPorts.origin]: companionPorts.hostPermissions
        } : {})
    });

    function unique(values) {
        return Array.from(new Set(values));
    }

    function hostPermissionsForOrigin(origin) {
        const alias = ORIGIN_HOST_PERMISSION_ALIASES[origin];
        if (alias) return alias.slice();
        return [origin.replace(/\/+$/, '') + '/*'];
    }

    function isOriginAvailableForProfile(entry, profile) {
        if (!entry || !profile) return false;
        if (Array.isArray(entry.excludedProfiles)
            && entry.excludedProfiles.includes(profile)) return false;
        return entry.profile === profile
            || ((profile === 'chromium-store' || profile === 'github-full')
                && entry.profile === 'store-safe');
    }

    function getFirefoxDataCollectionPermissionsForProfile(
        profile,
        catalogue = ORIGIN_CATALOGUE
    ) {
        const required = [];
        const optional = [];
        const addUnique = (target, value) => {
            if (typeof value === 'string' && value && !target.includes(value)) target.push(value);
        };
        for (const entry of catalogue) {
            if (!isOriginAvailableForProfile(entry, profile)) continue;
            for (const category of entry.firefoxDataCollection?.required || []) {
                if (category === FIREFOX_TECHNICAL_AND_INTERACTION) {
                    throw new Error('technicalAndInteraction cannot be a required Firefox data permission');
                }
                addUnique(required, category);
            }
            for (const category of entry.firefoxDataCollection?.optional || []) {
                addUnique(optional, category);
            }
        }
        const optionalOnly = optional.filter((category) => !required.includes(category));
        return {
            required: required.length ? required : ['none'],
            ...(optionalOnly.length ? { optional: optionalOnly } : {})
        };
    }

    // Sub-toggle inheritance map. Some schema entries are pure sub-knobs
    // of a parent feature — turning the sub-toggle on never makes a new
    // network request, it only modulates the parent's behaviour. The
    // cross-check treats these as covered when the parent appears in
    // some origin's requiredByFeatures.
    const PARENT_FEATURE = Object.freeze({
        // SponsorBlock per-category sub-toggles
        sbCat_sponsor: 'sponsorBlock',
        sbCat_intro: 'sponsorBlock',
        sbCat_outro: 'sponsorBlock',
        sbCat_selfpromo: 'sponsorBlock',
        sbCat_interaction: 'sponsorBlock',
        sbCat_music_offtopic: 'sponsorBlock',
        sbCat_preview: 'sponsorBlock',
        sbCat_filler: 'sponsorBlock',
        sbCat_poi_highlight: 'sponsorBlock',
        sbPerChannelProfiles: 'sponsorBlock',
        sbPerChannelProfilesData: 'sponsorBlock',
        sponsorBlockBaseUrl: 'sponsorBlock',
        sponsorBlockMirrorUrl: 'sponsorBlock',
        // DeArrow shape/format sub-toggles
        daReplaceTitles: 'deArrow',
        daReplaceThumbs: 'deArrow',
        deArrowVoting: 'deArrow',
        // Astra Downloader sub-knobs
        downloadQuality: 'showLocalDownloadButton',
        downloadVideoFormat: 'showLocalDownloadButton',
        downloadAudioFormat: 'showLocalDownloadButton',
        // Cobalt fallback sub-knobs
        downloadCobaltInstance: 'downloadCobaltFallback',
        // AI summary sub-knobs. Credentials are background-owned and never
        // appear in the content-script settings schema.
        aiSummaryEndpoint: 'aiVideoSummary',
        aiSummaryModel: 'aiVideoSummary',
        aiSummaryProvider: 'aiVideoSummary',
        // subscriptionAiTags is intentionally NOT mapped: per the schema
        // description it uses Chrome's built-in Summarizer (no remote
        // origin), so it correctly stays absent from the catalogue.
    });

    function originMatchesManifest(origin, hostPermissions) {
        if (!Array.isArray(hostPermissions)) return null;
        // The companion origin is a port-RANGE pseudo-origin
        // (http://127.0.0.1:9751-9851), which `new URL()` rejects. Matching it
        // used to fall through to the catch below and succeed only because the
        // range string happens to start with the primary port — a check that
        // worked by coincidence and would silently stop matching if the
        // catalogue's primary port or formatting ever changed. Resolve it
        // through the alias map that already enumerates its real permissions.
        const aliased = ORIGIN_HOST_PERMISSION_ALIASES[origin];
        if (Array.isArray(aliased)) {
            const matched = aliased.find((perm) => hostPermissions.includes(perm));
            if (matched) return matched;
        }
        for (const perm of hostPermissions) {
            const trimmed = perm.replace(/\/\*$/, '');
            try {
                const permUrl = new URL(trimmed.endsWith('/') ? trimmed : trimmed + '/');
                const originUrl = new URL(origin.endsWith('/') ? origin : origin + '/');
                if (permUrl.protocol !== originUrl.protocol) continue;
                const ph = permUrl.hostname;
                const oh = originUrl.hostname;
                if (ph.startsWith('*.')) {
                    const base = ph.slice(2);
                    if (oh === base || oh.endsWith('.' + base)) return perm;
                } else if (ph === oh) {
                    if (!permUrl.port || permUrl.port === originUrl.port) return perm;
                }
            } catch (_) {
                if (origin.startsWith(trimmed)) return perm;
            }
        }
        return null;
    }

    function entryAppliesToFeature(entry, featureKey) {
        if (!entry || !featureKey) return false;
        if (entry.requiredByFeatures.includes(featureKey)) return true;
        const parent = PARENT_FEATURE[featureKey];
        return Boolean(parent && entry.requiredByFeatures.includes(parent));
    }

    function getOptionalHostPermissionsForFeature(featureKey, options = {}) {
        const catalogue = options.catalogue || ORIGIN_CATALOGUE;
        const profile = options.profile || 'store-safe';
        const hosts = [];
        for (const entry of catalogue) {
            if (entry.profile !== profile) continue;
            if (entry.hostGrant !== 'runtime-optional') continue;
            if (entry.specificOriginRequired === true) continue;
            if (Array.isArray(entry.runtimeOptionalProfiles)
                && !entry.runtimeOptionalProfiles.includes(profile)) continue;
            if (!entryAppliesToFeature(entry, featureKey)) continue;
            hosts.push(...hostPermissionsForOrigin(entry.origin));
        }
        return unique(hosts);
    }

    function isFeatureCurrentlyActive(featureKey, settings) {
        const value = settings[featureKey];
        if (value === undefined || value === null) return false;
        if (typeof value === 'boolean') return value === true;
        if (typeof value === 'string') return value.length > 0;
        if (typeof value === 'number') return value > 0;
        return true;
    }

    // Build a set of every key that is "covered" — either directly listed
    // in some origin's requiredByFeatures, or covered through the parent
    // feature inheritance map above.
    function buildCoveredKeySet(catalogue, parentMap) {
        const directly = new Set();
        for (const o of catalogue) {
            for (const f of o.requiredByFeatures) directly.add(f);
        }
        const covered = new Set(directly);
        for (const [child, parent] of Object.entries(parentMap)) {
            if (directly.has(parent)) covered.add(child);
        }
        return covered;
    }

    // Public helper for hardening tests: report keys that should be
    // covered (risk = 'api' or 'local-companion', non-internal) but
    // aren't, after applying the parent-feature inheritance map. An
    // empty list means schema and catalogue are in sync.
    function findCoverageGaps(schema, catalogue = ORIGIN_CATALOGUE, parentMap = PARENT_FEATURE) {
        const covered = buildCoveredKeySet(catalogue, parentMap);
        const gaps = [];
        for (const e of schema) {
            if (e.internal) continue;
            if (e.risk !== 'api' && e.risk !== 'local-companion') continue;
            if (covered.has(e.key)) continue;
            // subscriptionAiTags is an intentional exemption: uses the
            // Chrome built-in Summarizer, no remote origin.
            if (e.key === 'subscriptionAiTags') continue;
            gaps.push({ key: e.key, risk: e.risk });
        }
        return gaps;
    }

    function createDataFlow(options = {}) {
        const catalogue = options.catalogue || ORIGIN_CATALOGUE;
        const hostPermissions = options.hostPermissions
            || (options.manifest && options.manifest.host_permissions)
            || [];
        const optionalHostPermissions = options.optionalHostPermissions
            || (options.manifest && options.manifest.optional_host_permissions)
            || [];

        function getOrigins(settings = {}) {
            return catalogue.map((entry) => {
                const active = entry.requiredByFeatures.some((k) => isFeatureCurrentlyActive(k, settings));
                const manifestPerm = originMatchesManifest(entry.origin, hostPermissions);
                const optionalManifestPerm = originMatchesManifest(entry.origin, optionalHostPermissions);
                return Object.freeze({
                    ...entry,
                    manifestPermission: manifestPerm,
                    optionalManifestPermission: optionalManifestPerm,
                    currentlyActive: active
                });
            });
        }

        function getActiveOrigins(settings = {}) {
            return getOrigins(settings).filter((entry) => entry.currentlyActive);
        }

        function getOriginsByProfile(profile, settings = {}) {
            return getOrigins(settings).filter((entry) => isOriginAvailableForProfile(entry, profile));
        }

        function summarise(settings = {}) {
            const origins = getOrigins(settings);
            const summary = {
                totalCatalogued: origins.length,
                currentlyActive: 0,
                byCredentialsPolicy: {},
                byProfile: {},
                byRiskBand: {}
            };
            for (const e of origins) {
                if (e.currentlyActive) summary.currentlyActive += 1;
                summary.byCredentialsPolicy[e.credentialsPolicy] =
                    (summary.byCredentialsPolicy[e.credentialsPolicy] || 0) + 1;
                summary.byProfile[e.profile] =
                    (summary.byProfile[e.profile] || 0) + 1;
                summary.byRiskBand[e.riskBand] =
                    (summary.byRiskBand[e.riskBand] || 0) + 1;
            }
            return summary;
        }

        return {
            getOrigins, getActiveOrigins, getOriginsByProfile, summarise,
            ORIGIN_CATALOGUE: catalogue
        };
    }

    core.createDataFlow = createDataFlow;
    core.ORIGIN_CATALOGUE = ORIGIN_CATALOGUE;
    core.PARENT_FEATURE = PARENT_FEATURE;
    core.SPONSORBLOCK_CANONICAL_ORIGIN = SPONSORBLOCK_CANONICAL_ORIGIN;
    core.SPONSORBLOCK_MIRROR_ORIGIN = SPONSORBLOCK_MIRROR_ORIGIN;
    core.SPONSORBLOCK_ALLOWED_ORIGINS = SPONSORBLOCK_ALLOWED_ORIGINS;
    core.normalizeSponsorBlockOrigin = normalizeSponsorBlockOrigin;
    core.getSponsorBlockApiOrigins = getSponsorBlockApiOrigins;
    core.findDataFlowCoverageGaps = findCoverageGaps;
    core.hostPermissionsForDataFlowOrigin = hostPermissionsForOrigin;
    core.isOriginAvailableForProfile = isOriginAvailableForProfile;
    core.getOptionalHostPermissionsForFeature = getOptionalHostPermissionsForFeature;
    core.getFirefoxDataCollectionPermissionsForProfile =
        getFirefoxDataCollectionPermissionsForProfile;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createDataFlow,
            findCoverageGaps,
            getFirefoxDataCollectionPermissionsForProfile,
            getOptionalHostPermissionsForFeature,
            hostPermissionsForOrigin,
            ORIGIN_CATALOGUE,
            PARENT_FEATURE,
            SPONSORBLOCK_CANONICAL_ORIGIN,
            SPONSORBLOCK_MIRROR_ORIGIN,
            SPONSORBLOCK_ALLOWED_ORIGINS,
            normalizeSponsorBlockOrigin,
            getSponsorBlockApiOrigins,
            isOriginAvailableForProfile
        };
    }
})();
