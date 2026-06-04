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
    //     manifestPermission:   string | null,                // matching host_permission, if present
    //     currentlyActive:      boolean,                      // true iff any driving feature is enabled
    //     riskBand:             'safe' | 'api' | 'local-companion' | 'experimental' | 'store-risk'
    //   }
    //
    // The module is pure data. Tests inject the schema, host permissions,
    // and a settings bag; production callers default to the live schema +
    // a manifest snapshot.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createDataFlow) return;

    // Origin catalogue. Each entry maps a stable origin to its purpose,
    // the schema keys that drive requests to it, and the credentials
    // policy applied by background.js. This is the source of truth the
    // popup data-flow panel reads — keep it sorted so the panel renders
    // a stable order across builds.
    const ORIGIN_CATALOGUE = Object.freeze([
        Object.freeze({
            origin: 'https://*.youtube.com',
            purpose: 'YouTube DOM, Innertube fallback player response, caption tracks.',
            requiredByFeatures: ['transcriptViewer', 'autoSubtitles'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            riskBand: 'safe'
        }),
        Object.freeze({
            origin: 'https://i.ytimg.com',
            purpose: 'Thumbnail max-resolution upgrades and download.',
            requiredByFeatures: ['thumbnailQualityUpgrade', 'downloadThumbnail'],
            credentialsPolicy: 'none',
            profile: 'store-safe',
            riskBand: 'safe'
        }),
        Object.freeze({
            origin: 'https://sponsor.ajay.app',
            purpose: 'SponsorBlock segments and DeArrow titles/thumbnails.',
            requiredByFeatures: ['sponsorBlock', 'deArrow'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://returnyoutubedislikeapi.com',
            purpose: 'Return YouTube Dislike ratio + estimated dislike counts.',
            requiredByFeatures: ['returnDislike', 'returnDislikeOnCards'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://www.reddit.com',
            purpose: 'Reddit discussion panel below the video.',
            requiredByFeatures: ['redditComments'],
            credentialsPolicy: 'no-cookies',
            profile: 'store-safe',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://api.openai.com',
            purpose: 'BYO-key OpenAI summarisation.',
            requiredByFeatures: ['aiVideoSummary'],
            credentialsPolicy: 'byo-key',
            profile: 'github-full',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://api.anthropic.com',
            purpose: 'BYO-key Anthropic summarisation.',
            requiredByFeatures: ['aiVideoSummary'],
            credentialsPolicy: 'byo-key',
            profile: 'github-full',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'https://generativelanguage.googleapis.com',
            purpose: 'BYO-key Gemini summarisation.',
            requiredByFeatures: ['aiVideoSummary'],
            credentialsPolicy: 'byo-key',
            profile: 'github-full',
            riskBand: 'api'
        }),
        Object.freeze({
            origin: 'http://127.0.0.1:11434',
            purpose: 'Local Ollama runtime for offline AI summaries.',
            requiredByFeatures: ['localAiSummary'],
            credentialsPolicy: 'local-loopback',
            profile: 'github-full',
            riskBand: 'local-companion'
        }),
        Object.freeze({
            origin: 'http://127.0.0.1:9751-9851',
            purpose: 'Astra Downloader local companion (health, downloads, history, stream links).',
            requiredByFeatures: [
                'showLocalDownloadButton', 'downloadHistoryPanel',
                'downloadHealthPanel', 'downloadStreamLinksPanel',
                'autoDownloadOnVisit', 'vlcMpvHandoff'
            ],
            credentialsPolicy: 'local-loopback',
            profile: 'github-full',
            riskBand: 'local-companion'
        }),
        Object.freeze({
            origin: 'https://api.cobalt.tools',
            purpose: 'Cobalt fallback download API (user-configurable instance, off by default).',
            requiredByFeatures: ['downloadCobaltFallback'],
            credentialsPolicy: 'no-cookies',
            profile: 'github-full',
            riskBand: 'api'
        })
    ]);

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
        // DeArrow shape/format sub-toggles
        daReplaceTitles: 'deArrow',
        daReplaceThumbs: 'deArrow',
        // Astra Downloader sub-knobs
        downloadQuality: 'showLocalDownloadButton',
        downloadVideoFormat: 'showLocalDownloadButton',
        downloadAudioFormat: 'showLocalDownloadButton',
        // Cobalt fallback sub-knobs
        downloadCobaltInstance: 'downloadCobaltFallback',
        // AI summary sub-knobs (provider/model/endpoint/key)
        aiSummaryEndpoint: 'aiVideoSummary',
        aiSummaryModel: 'aiVideoSummary',
        aiSummaryApiKey: 'aiVideoSummary',
        aiSummaryProvider: 'aiVideoSummary',
        // subscriptionAiTags is intentionally NOT mapped: per the schema
        // description it uses Chrome's built-in Summarizer (no remote
        // origin), so it correctly stays absent from the catalogue.
    });

    function originMatchesManifest(origin, hostPermissions) {
        if (!Array.isArray(hostPermissions)) return null;
        for (const perm of hostPermissions) {
            // host_permissions look like 'https://*.youtube.com/*' or
            // 'http://127.0.0.1:9751/*'; trim the trailing /* for the
            // panel display.
            const trimmed = perm.replace(/\/\*$/, '');
            if (origin.startsWith(trimmed) || trimmed.startsWith(origin)) return perm;
        }
        return null;
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

        function getOrigins(settings = {}) {
            return catalogue.map((entry) => {
                const active = entry.requiredByFeatures.some((k) => isFeatureCurrentlyActive(k, settings));
                const manifestPerm = originMatchesManifest(entry.origin, hostPermissions);
                return Object.freeze({
                    ...entry,
                    manifestPermission: manifestPerm,
                    currentlyActive: active
                });
            });
        }

        function getActiveOrigins(settings = {}) {
            return getOrigins(settings).filter((entry) => entry.currentlyActive);
        }

        function getOriginsByProfile(profile, settings = {}) {
            return getOrigins(settings).filter((entry) => entry.profile === profile);
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
    core.findDataFlowCoverageGaps = findCoverageGaps;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createDataFlow, ORIGIN_CATALOGUE, PARENT_FEATURE, findCoverageGaps };
    }
})();
