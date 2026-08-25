(() => {
    'use strict';

    const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
    const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,30}$/;
    const MAX_TAGS = 40;
    const MAX_CACHE_ENTRIES = 50;
    const REQUEST_BUDGET_PER_MINUTE = 12;
    const RETRY_AFTER_MS = 60 * 1000;
    const GITHUB_FULL_PERMISSION_SENTINELS = Object.freeze([
        'https://api.openai.com/*',
        'https://api.anthropic.com/*'
    ]);

    function cleanText(value, maxLength = 120) {
        return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function normalizeTags(value) {
        if (!Array.isArray(value)) return [];
        const seen = new Set();
        const tags = [];
        for (const raw of value) {
            const tag = cleanText(raw, 100);
            const key = tag.toLocaleLowerCase();
            if (!tag || seen.has(key)) continue;
            seen.add(key);
            tags.push(tag);
            if (tags.length >= MAX_TAGS) break;
        }
        return tags;
    }

    function extractVideoInsights(playerResponse, expectedVideoId = '') {
        const details = playerResponse?.videoDetails || {};
        const microformat = playerResponse?.microformat?.playerMicroformatRenderer || {};
        const responseVideoId = cleanText(details.videoId, 24);
        const stale = Boolean(
            expectedVideoId
            && responseVideoId
            && responseVideoId !== expectedVideoId
        );
        if (stale) {
            return {
                videoId: responseVideoId,
                category: '',
                tags: [],
                hasTagsField: false,
                uploadDate: '',
                channelId: '',
                stale: true
            };
        }

        const channelId = cleanText(details.channelId || microformat.externalChannelId, 40);
        const hasTagsField = Object.prototype.hasOwnProperty.call(details, 'keywords')
            && Array.isArray(details.keywords);
        return {
            videoId: responseVideoId || cleanText(expectedVideoId, 24),
            category: cleanText(microformat.category, 80),
            tags: normalizeTags(details.keywords),
            hasTagsField,
            uploadDate: cleanText(
                microformat.liveBroadcastDetails?.startTimestamp
                    || microformat.publishDate
                    || microformat.uploadDate,
                64
            ),
            channelId: CHANNEL_ID_PATTERN.test(channelId) ? channelId : '',
            stale: false
        };
    }

    function mergeVideoInsights(primary, fallback) {
        const first = primary || extractVideoInsights(null);
        const second = fallback || extractVideoInsights(null);
        const usePrimaryTags = first.hasTagsField;
        return {
            videoId: first.videoId || second.videoId,
            category: first.category || second.category,
            tags: usePrimaryTags ? first.tags : second.tags,
            hasTagsField: usePrimaryTags || second.hasTagsField,
            uploadDate: first.uploadDate || second.uploadDate,
            channelId: first.channelId || second.channelId,
            stale: Boolean(first.stale && second.stale)
        };
    }

    function hasCompleteVideoInsights(insights) {
        return Boolean(
            insights
            && insights.category
            && insights.hasTagsField
            && insights.uploadDate
            && insights.channelId
            && !insights.stale
        );
    }

    function isGithubFullArtifactManifest(manifest) {
        const permissions = [
            ...(Array.isArray(manifest?.host_permissions) ? manifest.host_permissions : []),
            ...(Array.isArray(manifest?.optional_host_permissions) ? manifest.optional_host_permissions : []),
        ];
        return GITHUB_FULL_PERMISSION_SENTINELS.some((permission) => permissions.includes(permission));
    }

    function createVideoInsightsFeature(deps = {}) {
        const {
            PageTypes = { WATCH: 'watch' },
            DiagnosticLog = null,
            ExternalApiHealth = null,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            extensionFetchJson = async () => ({ data: null }),
            formatAbsoluteDate = (value) => cleanText(value),
            getInnertubeConfig = () => ({}),
            getPlayerResponse = () => null,
            getVideoId = () => '',
            injectStyle = () => null,
            isGithubFullArtifact = () => false,
            isGithubFullProfile = () => false,
            isWatchPagePath = () => false,
            t = (_key, fallback) => fallback,
            documentRef = typeof document !== 'undefined' ? document : null,
            now = () => Date.now()
        } = deps;

        const cache = new Map();
        const attempts = new Map();
        const requestTimes = [];
        let panel = null;
        let styleElement = null;
        let renderTimer = null;
        let generation = 0;

        function trimCache() {
            while (cache.size > MAX_CACHE_ENTRIES) {
                cache.delete(cache.keys().next().value);
            }
        }

        function getBudgetSnapshot() {
            const cutoff = now() - 60000;
            while (requestTimes.length && requestTimes[0] <= cutoff) requestTimes.shift();
            return {
                limit: REQUEST_BUDGET_PER_MINUTE,
                used: requestTimes.length,
                resetMs: requestTimes.length ? Math.max(0, requestTimes[0] + 60000 - now()) : 0
            };
        }

        function allowRequest() {
            const budget = getBudgetSnapshot();
            if (budget.used >= budget.limit) return false;
            requestTimes.push(now());
            return true;
        }

        async function loadInsights(videoId) {
            const local = extractVideoInsights(getPlayerResponse(), videoId);
            if (hasCompleteVideoInsights(local)) {
                ExternalApiHealth?.recordSuccess?.('videoInsights', {
                    source: 'page',
                    cacheState: 'not-needed',
                    requestBudget: getBudgetSnapshot()
                });
                return { insights: local, source: 'page', fetched: false };
            }

            const cached = cache.get(videoId);
            if (cached) {
                cache.delete(videoId);
                cache.set(videoId, cached);
                ExternalApiHealth?.recordSuccess?.('videoInsights', {
                    source: 'cache',
                    cacheState: 'fresh',
                    requestBudget: getBudgetSnapshot()
                });
                return {
                    insights: mergeVideoInsights(local, cached),
                    source: 'cache',
                    fetched: false
                };
            }

            // The schema already hides this feature in store-safe mode, but
            // retain a runtime gate so imports/profile races can never dial
            // InnerTube from a safe-profile session.
            if (!isGithubFullProfile() || !isGithubFullArtifact()) {
                return { insights: local, source: 'page', fetched: false, degraded: 'unavailable' };
            }

            const lastAttempt = attempts.get(videoId) || 0;
            if (lastAttempt && now() - lastAttempt < RETRY_AFTER_MS) {
                return { insights: local, source: 'page', fetched: false, degraded: 'retry-wait' };
            }
            // Expired entries are useless after RETRY_AFTER_MS; sweep them so
            // long autoplay sessions cannot grow the map without bound.
            for (const [id, ts] of attempts) {
                if (now() - ts >= RETRY_AFTER_MS) attempts.delete(id);
            }
            if (!allowRequest()) {
                const budgetError = new Error('YouTube video insights request budget exhausted');
                ExternalApiHealth?.recordFailure?.('videoInsights', budgetError, {
                    errorClass: 'rate-limited',
                    endpoint: 'youtubei/v1/player',
                    requestBudget: getBudgetSnapshot()
                });
                return { insights: local, source: 'page', fetched: false, degraded: 'rate-limited' };
            }
            attempts.set(videoId, now());

            const config = getInnertubeConfig() || {};
            const apiKey = cleanText(config.apiKey, 128);
            const clientVersion = cleanText(config.clientVersion, 40);
            if (!/^[A-Za-z0-9_-]{10,}$/.test(apiKey) || !/^\d{1,2}\.\d{6,10}\.\d{1,2}\.\d{1,2}$/.test(clientVersion)) {
                const configError = new Error('YouTube InnerTube page configuration is unavailable');
                ExternalApiHealth?.recordFailure?.('videoInsights', configError, {
                    errorClass: 'invalid-payload',
                    endpoint: 'youtubei/v1/player',
                    requestBudget: getBudgetSnapshot()
                });
                return { insights: local, source: 'page', fetched: false, degraded: 'unavailable' };
            }

            try {
                const { data } = await extensionFetchJson({
                    url: `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    data: JSON.stringify({
                        context: {
                            client: {
                                clientName: 'WEB',
                                clientVersion
                            }
                        },
                        videoId
                    })
                });
                const remote = extractVideoInsights(data, videoId);
                if (remote.stale || remote.videoId !== videoId) {
                    throw new Error('YouTube InnerTube returned metadata for a different video');
                }
                const merged = mergeVideoInsights(local, remote);
                cache.set(videoId, remote);
                trimCache();
                ExternalApiHealth?.recordSuccess?.('videoInsights', {
                    source: 'network',
                    cacheState: 'refreshed',
                    endpoint: 'youtubei/v1/player',
                    requestBudget: getBudgetSnapshot()
                });
                return { insights: merged, source: 'network', fetched: true };
            } catch (error) {
                ExternalApiHealth?.recordFailure?.('videoInsights', error, {
                    endpoint: 'youtubei/v1/player',
                    cacheState: 'miss',
                    requestBudget: getBudgetSnapshot()
                });
                DiagnosticLog?.record?.(
                    'video-insights',
                    `InnerTube metadata failed for ${videoId}: ${cleanText(error?.message || 'unknown error', 180)}`
                );
                return { insights: local, source: 'page', fetched: false, degraded: 'failed' };
            }
        }

        function ensureStyles() {
            if (styleElement) return;
            styleElement = injectStyle(`
                .ytkit-video-insights{box-sizing:border-box;margin:12px 0 0;padding:14px 16px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.12));border-radius:12px;background:var(--yt-spec-raised-background,rgba(255,255,255,.04));color:var(--yt-spec-text-primary,#f1f1f1);font:400 13px/1.45 Roboto,Arial,sans-serif;}
                .ytkit-video-insights__header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}
                .ytkit-video-insights__title{margin:0;font:700 15px/1.25 Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#fff);}
                .ytkit-video-insights__source{flex:none;padding:3px 7px;border-radius:6px;background:var(--yt-spec-10-percent-layer,rgba(255,255,255,.08));color:var(--yt-spec-text-secondary,#aaa);font:600 11px/1.2 Roboto,Arial,sans-serif;}
                .ytkit-video-insights__facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 16px;margin:0;}
                .ytkit-video-insights__fact{min-width:0;margin:0;}
                .ytkit-video-insights__fact--tags{grid-column:1/-1;}
                .ytkit-video-insights dt{margin:0 0 3px;color:var(--yt-spec-text-secondary,#aaa);font:600 11px/1.2 Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:.035em;}
                .ytkit-video-insights dd{min-width:0;margin:0;color:var(--yt-spec-text-primary,#f1f1f1);overflow-wrap:anywhere;}
                .ytkit-video-insights a{display:inline-block;color:var(--yt-spec-call-to-action,#3ea6ff);text-decoration:none;outline:none;}
                .ytkit-video-insights a:hover{text-decoration:underline;}
                .ytkit-video-insights a:focus-visible{border-radius:3px;box-shadow:0 0 0 2px var(--yt-spec-base-background,#0f0f0f),0 0 0 4px var(--yt-spec-call-to-action,#3ea6ff);}
                .ytkit-video-insights__tags{display:flex;flex-wrap:wrap;gap:6px;}
                .ytkit-video-insights__tag{max-width:100%;padding:3px 7px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.12));border-radius:6px;background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.06));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .ytkit-video-insights[data-tone="unavailable"] dd{color:var(--yt-spec-text-secondary,#aaa);}
                .ytkit-video-insights[data-tone="degraded"] dd{color:var(--yt-spec-text-secondary,#aaa);font-style:italic;}
                html:not([dark]) .ytkit-video-insights{background:var(--yt-spec-raised-background,#fff);border-color:rgba(0,0,0,.14);color:var(--yt-spec-text-primary,#0f0f0f);}
                @media (max-width:720px){.ytkit-video-insights__facts{grid-template-columns:1fr 1fr;}.ytkit-video-insights__fact--tags{grid-column:1/-1;}}
                @media (forced-colors:active){.ytkit-video-insights,.ytkit-video-insights__tag{border-color:CanvasText}.ytkit-video-insights a{color:LinkText}}
            `, 'video-insights', true);
        }

        function addFact(list, label, value, options = {}) {
            const row = documentRef.createElement('div');
            row.className = 'ytkit-video-insights__fact';
            if (options.tags) row.classList.add('ytkit-video-insights__fact--tags');
            const term = documentRef.createElement('dt');
            term.textContent = label;
            const description = documentRef.createElement('dd');
            if (options.href) {
                const link = documentRef.createElement('a');
                link.href = options.href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = value;
                description.appendChild(link);
            } else if (options.tags && Array.isArray(value)) {
                description.className = 'ytkit-video-insights__tags';
                for (const tag of value) {
                    const chip = documentRef.createElement('span');
                    chip.className = 'ytkit-video-insights__tag';
                    chip.textContent = tag;
                    chip.title = tag;
                    description.appendChild(chip);
                }
            } else {
                description.textContent = value;
            }
            row.append(term, description);
            list.appendChild(row);
        }

        function renderResult(result) {
            if (!panel) return;
            const insights = result.insights || extractVideoInsights(null);
            panel.replaceChildren();
            panel.removeAttribute('aria-busy');

            const header = documentRef.createElement('header');
            header.className = 'ytkit-video-insights__header';
            const title = documentRef.createElement('h2');
            title.className = 'ytkit-video-insights__title';
            title.id = 'ytkit-video-insights-title';
            title.textContent = t('videoInsightsTitle', 'Video insights');
            const source = documentRef.createElement('span');
            source.className = 'ytkit-video-insights__source';
            source.setAttribute('role', 'status');
            // A lookup that never ran (or failed) is not the same as a video
            // that published nothing, and both used to render "Not provided".
            const degraded = String(result.degraded || '');
            source.textContent = result.source === 'network'
                ? t('videoInsightsSourceNetwork', 'Refreshed from YouTube')
                : (result.source === 'cache'
                    ? t('videoInsightsSourceCache', 'Cached YouTube details')
                    : (degraded === 'rate-limited' || degraded === 'retry-wait'
                        ? t('videoInsightsSourceThrottled', 'From this page. YouTube lookup paused.')
                        : (degraded
                            ? t('videoInsightsSourceDegraded', 'From this page. YouTube lookup unavailable.')
                            : t('videoInsightsSourcePage', 'From this page'))));
            header.append(title, source);

            const unavailable = degraded
                ? t('videoInsightsUnchecked', 'Not checked')
                : t('videoInsightsUnavailable', 'Not provided');
            const facts = documentRef.createElement('dl');
            facts.className = 'ytkit-video-insights__facts';
            addFact(facts, t('videoInsightsCategory', 'Category'), insights.category || unavailable);
            const formattedDate = insights.uploadDate ? formatAbsoluteDate(insights.uploadDate) : '';
            addFact(facts, t('videoInsightsUploaded', 'Uploaded'), formattedDate || unavailable);
            addFact(
                facts,
                t('videoInsightsChannelId', 'Channel ID'),
                insights.channelId || unavailable,
                insights.channelId ? { href: `https://www.youtube.com/channel/${encodeURIComponent(insights.channelId)}` } : {}
            );
            addFact(
                facts,
                t('videoInsightsTags', 'Tags'),
                insights.tags.length
                    ? insights.tags
                    : (degraded && !insights.hasTagsField
                        ? unavailable
                        : t('videoInsightsNoTags', 'No tags published')),
                insights.tags.length ? { tags: true } : {}
            );

            const hasAnyData = Boolean(
                insights.category || insights.uploadDate || insights.channelId || insights.hasTagsField
            );
            panel.dataset.tone = hasAnyData
                ? 'ready'
                : (degraded ? 'degraded' : 'unavailable');
            panel.append(header, facts);
        }

        let attachRetries = 0;

        async function attach() {
            if (!documentRef || !isWatchPagePath()) return;
            const videoId = getVideoId();
            if (!VIDEO_ID_PATTERN.test(videoId)) return;
            const target = documentRef.querySelector('ytd-watch-metadata #above-the-fold, ytd-watch-metadata');
            if (!target) {
                // Slow cold loads can hydrate watch metadata after the last
                // navigate event; a one-shot timer would skip the panel for
                // the whole video. Retry a bounded number of times.
                if (attachRetries < 3) {
                    attachRetries += 1;
                    scheduleAttach(1200 * attachRetries);
                }
                return;
            }
            attachRetries = 0;
            const token = generation;
            documentRef.querySelectorAll('.ytkit-video-insights').forEach((element) => element.remove());
            panel = documentRef.createElement('section');
            panel.className = 'ytkit-video-insights';
            panel.setAttribute('role', 'region');
            panel.setAttribute('aria-labelledby', 'ytkit-video-insights-title');
            panel.setAttribute('aria-busy', 'true');
            panel.textContent = t('videoInsightsLoading', 'Loading video details…');
            target.appendChild(panel);

            const result = await loadInsights(videoId);
            if (token !== generation || !isWatchPagePath() || getVideoId() !== videoId) return;
            renderResult(result);
        }

        function scheduleAttach(delay = 900) {
            if (renderTimer) clearTimeout(renderTimer);
            const token = ++generation;
            panel?.remove();
            panel = null;
            renderTimer = setTimeout(() => {
                renderTimer = null;
                if (token !== generation) return;
                void attach();
            }, delay);
        }

        return {
            id: 'videoInsights',
            // i18n-static: resolved through feature_videoInsights_name at runtime
            name: 'Video Insights',
            // i18n-static: resolved through feature_videoInsights_desc at runtime
            description: 'Reveal category, exact upload date, channel ID, and published tags from YouTube page metadata, with a bounded GitHub-full fallback.',
            group: 'Watch Page',
            icon: 'info',
            pages: [PageTypes.WATCH],
            init() {
                ensureStyles();
                addNavigateRule('videoInsights', () => {
                    attachRetries = 0;
                    scheduleAttach(900);
                });
                scheduleAttach(700);
            },
            destroy() {
                generation += 1;
                if (renderTimer) clearTimeout(renderTimer);
                renderTimer = null;
                removeNavigateRule('videoInsights');
                panel?.remove();
                panel = null;
                documentRef?.querySelectorAll?.('.ytkit-video-insights').forEach((element) => element.remove());
                styleElement?.remove();
                styleElement = null;
            },
            _loadInsights: loadInsights,
            _getBudgetSnapshot: getBudgetSnapshot
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.createVideoInsightsFeature = createVideoInsightsFeature;
    features.isGithubFullArtifactManifest = isGithubFullArtifactManifest;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createVideoInsightsFeature,
            extractVideoInsights,
            hasCompleteVideoInsights,
            isGithubFullArtifactManifest,
            mergeVideoInsights
        };
    }
})();
