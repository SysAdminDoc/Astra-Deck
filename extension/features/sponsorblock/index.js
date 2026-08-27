(() => {
    'use strict';

    // extension/features/sponsorblock/index.js
    //
    // Monolith peel for SponsorBlock. The module owns the primary
    // sponsorBlock runtime/state object; ytkit.js keeps the inline object
    // as a compatibility fallback and delegates to the factory when present.

    const SPONSORBLOCK_API_FALLBACK_ORIGINS = Object.freeze([
        'https://sponsor.ajay.app',
        'https://sponsorblock.kavin.rocks'
    ]);

    const ANTI_ADBLOCK_SIGNAL_RULES = Object.freeze([
        Object.freeze({
            selector: 'tp-yt-paper-dialog[opened] ytd-enforcement-message-view-model',
            strength: 'strong',
            blocking: true
        }),
        Object.freeze({
            selector: 'ytd-popup-container ytd-enforcement-message-view-model',
            strength: 'strong',
            blocking: true
        }),
        Object.freeze({
            selector: 'ytd-enforcement-message-view-model',
            strength: 'strong',
            blocking: true
        }),
        Object.freeze({
            selector: 'tp-yt-paper-dialog.ytd-enforcement-message-view-model',
            strength: 'strong',
            blocking: true
        }),
        Object.freeze({
            selector: '[class*="enforcement-message"]',
            strength: 'weak',
            blocking: false
        }),
        Object.freeze({
            selector: 'ytd-popup-container [class*="adblock"]',
            strength: 'weak',
            blocking: false
        })
    ]);

    function isAntiAdblockNodeVisible(node) {
        if (!node || node.isConnected === false || node.hidden === true) return false;
        try {
            if (node.closest?.('[hidden], [inert], [aria-hidden="true"]')) return false;
        } catch (_) {
            return false;
        }
        const inline = node.style || {};
        if (inline.display === 'none' || inline.visibility === 'hidden'
            || inline.visibility === 'collapse' || inline.opacity === '0') return false;
        try {
            const view = node.ownerDocument?.defaultView || globalThis;
            const style = typeof view.getComputedStyle === 'function'
                ? view.getComputedStyle(node)
                : null;
            if (style && (style.display === 'none' || style.visibility === 'hidden'
                || style.visibility === 'collapse' || style.opacity === '0')) return false;
        } catch (_) {
            return false;
        }
        try {
            if (typeof node.getClientRects === 'function' && node.getClientRects().length === 0) return false;
        } catch (_) {
            return false;
        }
        return true;
    }

    function findVisibleAntiAdblockSignal(root = globalThis.document) {
        if (!root || typeof root.querySelectorAll !== 'function') return null;
        for (const rule of ANTI_ADBLOCK_SIGNAL_RULES) {
            let matches = [];
            try {
                matches = root.querySelectorAll(rule.selector);
            } catch (_) {
                continue;
            }
            for (const node of Array.from(matches || []).slice(0, 6)) {
                if (!isAntiAdblockNodeVisible(node)) continue;
                return {
                    selector: rule.selector,
                    strength: rule.strength,
                    blocking: rule.blocking,
                    node
                };
            }
        }
        return null;
    }

    function classifyAntiAdblockPlayback(previous, current, signal) {
        if (!current || current.videoPresent === false) {
            const observedLongEnough = previous?.videoPresent === false
                && Number.isFinite(previous.observedAt)
                && Number.isFinite(current?.observedAt)
                && current.observedAt - previous.observedAt >= 1200;
            return observedLongEnough && signal?.strength === 'strong' && signal?.blocking
                ? 'blocked'
                : 'unknown';
        }
        if (!previous || previous.videoPresent === false) return 'unknown';
        if (current.mediaKey && previous.mediaKey && current.mediaKey !== previous.mediaKey) return 'unknown';
        const elapsed = current.observedAt - previous.observedAt;
        if (!Number.isFinite(elapsed) || elapsed < 1200) return 'unknown';
        const advancedBy = current.currentTime - previous.currentTime;
        if (Number.isFinite(advancedBy) && advancedBy >= 0.2) return 'advancing';
        if (current.ended) return 'unknown';
        if (signal?.strength === 'strong' && signal?.blocking
            && (current.error === true || current.paused === true)) return 'blocked';
        if (current.paused === false && (current.waiting === true || current.readyState < 3)) {
            return 'stalled';
        }
        return 'unknown';
    }

    function resolveSponsorBlockApiOrigins(settings = {}) {
        const sharedResolver = globalThis.YTKitCore?.getSponsorBlockApiOrigins;
        if (typeof sharedResolver === 'function') return sharedResolver(settings);
        const allowed = new Set(SPONSORBLOCK_API_FALLBACK_ORIGINS);
        const normalize = (value) => {
            if (typeof value !== 'string' || !value.trim()) return null;
            try {
                const parsed = new URL(value.trim());
                if (parsed.protocol !== 'https:' || parsed.username || parsed.password
                    || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
                return allowed.has(parsed.origin) ? parsed.origin : null;
            } catch (_) {
                return null;
            }
        };
        const primary = normalize(settings.sponsorBlockBaseUrl) || SPONSORBLOCK_API_FALLBACK_ORIGINS[0];
        const mirror = normalize(settings.sponsorBlockMirrorUrl);
        return Array.from(new Set([primary, mirror].filter(Boolean)));
    }

    function createSponsorBlockFeature(deps = {}) {
        const {
            appState = { settings: {} },
            DebugManager = { log() {} },
            DiagnosticLog = null,
            ExternalApiHealth = null,
            extensionFetchJson = async () => ({ data: null }),
            storageReadJSON = (_key, fallback) => fallback,
            storageWriteJSON = () => {},
            getVideoId = () => null,
            getMainVideoElement = () => null,
            getMoviePlayerElement = () => null,
            getPlayerProgressBar = () => null,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            announceA11y = () => {},
            publishAntiAdblockState = () => {},
            getZeroAdStatus = async () => ({ ok: true, enabled: true, paused: false, pauseUntil: null }),
            pauseZeroAdRules = async () => ({ ok: false, error: 'Recovery is unavailable.' }),
            resumeZeroAdRules = async () => ({ ok: false, error: 'Recovery is unavailable.' }),
            VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/,
            PageTypes = { WATCH: 'watch' },
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'sponsorBlock',
            name: t('feature_sponsorBlock_name', 'SponsorBlock'),
            description: t('feature_sponsorBlock_desc', 'Automatically skip sponsored segments, intros, outros, and other non-content sections using SponsorBlock data licensed under CC BY-NC-SA 4.0'),
            group: 'Content',
            icon: 'skip-forward',
            isParent: true,
            pages: [PageTypes.WATCH],
            _segments: [],
            _videoId: null,
            _skipHandler: null,
            _navRuleId: 'sponsorBlockNav',
            _styleEl: null,
            _barSegments: [],
            _barObserver: null,
            _reloadTimer: null,
            _antiAdblockTimer: null,
            _antiAdblockVerifyTimer: null,
            _antiAdblockDeadlineTimer: null,
            _antiAdblockPreviousSample: null,
            _antiAdblockSnapshot: null,
            _antiAdblockLastEvent: null,
            _antiAdblockLastEventAt: 0,
            _antiAdblockLogFingerprint: '',
            _antiAdblockNotice: null,
            _antiAdblockBusy: false,
            _antiAdblockActionError: '',
            _zeroAdStatus: null,
            // Bumped on destroy() so any in-flight _fetchSegments cannot
            // repopulate _segments/DOM after the feature was torn down.
            _generation: 0,

            _CATEGORY_MAP: {
                sbCat_sponsor: 'sponsor',
                sbCat_intro: 'intro',
                sbCat_outro: 'outro',
                sbCat_selfpromo: 'selfpromo',
                sbCat_interaction: 'interaction',
                sbCat_music_offtopic: 'music_offtopic',
                sbCat_preview: 'preview',
                sbCat_filler: 'filler',
                sbCat_poi_highlight: 'poi_highlight',
            },
            _CATEGORY_COLORS: {
                sponsor: '#00d400',
                selfpromo: '#ffff00',
                interaction: '#cc00ff',
                intro: '#00ffff',
                outro: '#0202ed',
                preview: '#008fd6',
                music_offtopic: '#ff9900',
                filler: '#7300FF',
                poi_highlight: '#ff1684',
            },
            _CACHE_KEY: 'sb_segments_cache',
            _CACHE_TTL_MS: 12 * 60 * 60 * 1000,
            _CACHE_STALE_MAX_MS: 7 * 24 * 60 * 60 * 1000,
            _CACHE_MAX_ENTRIES: 500,
            _cache: null,
            _cachePersistTimer: null,

            _getChannelId() {
                // One canonical key, shared with the chip that WRITES these
                // profiles. Returning the raw handle href here meant a
                // suffixed owner link (/featured, ?si=…) produced a key the
                // stored profile could never match, so per-channel overrides
                // were silently ignored while the chip showed them active.
                const link = document.querySelector('ytd-video-owner-renderer a[href*="/channel/"], #channel-name a[href*="/channel/"]');
                const byId = globalThis.YTKitCore?.channelSettingsKey?.(link?.getAttribute('href'));
                if (byId) return byId;
                const handleLink = document.querySelector('ytd-video-owner-renderer a[href^="/@"], #channel-name a[href^="/@"]');
                return globalThis.YTKitCore?.channelSettingsKey?.(handleLink?.getAttribute('href')) || '';
            },

            _getEnabledCategories() {
                // Global defaults
                const globalCats = [];
                for (const [key, apiName] of Object.entries(this._CATEGORY_MAP)) {
                    if (appState.settings[key]) globalCats.push(apiName);
                }
                // Per-channel override check
                if (!appState.settings.sbPerChannelProfiles) return globalCats;
                const channelId = this._getChannelId();
                if (!channelId) return globalCats;
                const profiles = appState.settings.sbPerChannelProfilesData;
                if (!profiles || typeof profiles !== 'object') return globalCats;
                const profile = profiles[channelId];
                if (!profile || typeof profile.categories !== 'object') return globalCats;
                // Apply per-channel overrides: if a category is explicitly set,
                // use that value; otherwise fall through to global default.
                const cats = [];
                for (const [key, apiName] of Object.entries(this._CATEGORY_MAP)) {
                    const channelOverride = profile.categories[apiName];
                    if (typeof channelOverride === 'boolean') {
                        if (channelOverride) cats.push(apiName);
                    } else {
                        // No per-channel override for this category; use global
                        if (appState.settings[key]) cats.push(apiName);
                    }
                }
                return cats;
            },

            _getCategoryKey(categories) {
                return [...new Set(categories)].sort().join(',');
            },

            _getCache() {
                if (this._cache && typeof this._cache === 'object' && !Array.isArray(this._cache)) return this._cache;
                const stored = storageReadJSON(this._CACHE_KEY, {});
                this._cache = (stored && typeof stored === 'object' && !Array.isArray(stored)) ? stored : {};
                return this._cache;
            },

            // poi_highlight is a POINT marker: the API returns it as [t, t], so
            // a strict end > start filter silently dropped every highlight
            // before it reached the cache or the progress bar — the feature's
            // own "render it on the bar" contract could never be met.
            _isPointSegment(s) {
                return s?.actionType === 'poi' || s?.category === 'poi_highlight';
            },

            _normalizeSegments(segments) {
                if (!Array.isArray(segments)) return [];
                return segments.filter(s =>
                    s && typeof s === 'object'
                    && Array.isArray(s.segment) && s.segment.length === 2
                    && Number.isFinite(s.segment[0]) && Number.isFinite(s.segment[1])
                    && s.segment[0] >= 0
                    && (this._isPointSegment(s) ? s.segment[1] >= s.segment[0] : s.segment[1] > s.segment[0])
                    && typeof s.category === 'string'
                ).map(s => ({
                    segment: [s.segment[0], s.segment[1]],
                    category: s.category,
                    actionType: s.actionType,
                    UUID: s.UUID,
                    videoDuration: s.videoDuration
                }));
            },

            _cacheCoversCategories(entry, categories) {
                const entryKey = typeof entry?.categoryKey === 'string'
                    ? entry.categoryKey
                    : this._getCategoryKey(Array.isArray(entry?.categories) ? entry.categories : []);
                const entryCats = new Set(entryKey.split(',').filter(Boolean));
                return categories.every(category => entryCats.has(category));
            },

            _getCachedSegments(videoId, categories, { allowStale = false } = {}) {
                const cache = this._getCache();
                const entry = cache[videoId];
                if (!entry || typeof entry !== 'object' || !Array.isArray(entry.segments)) return null;
                if (!this._cacheCoversCategories(entry, categories)) return null;
                const cachedAt = Number(entry.ts);
                if (!Number.isFinite(cachedAt) || cachedAt <= 0) return null;
                const age = Date.now() - cachedAt;
                const maxAge = allowStale ? this._CACHE_STALE_MAX_MS : this._CACHE_TTL_MS;
                if (age < 0 || age > maxAge) return null;
                return entry;
            },

            _markCachedSegments(segments, cachedAt, source) {
                return this._normalizeSegments(segments).map(segment => ({
                    ...segment,
                    _ytkitCacheSource: source,
                    _ytkitCachedAt: cachedAt
                }));
            },

            _rememberSegments(videoId, categories, segments) {
                const normalized = this._normalizeSegments(segments);
                const cache = this._getCache();
                cache[videoId] = {
                    ts: Date.now(),
                    categoryKey: this._getCategoryKey(categories),
                    segments: normalized
                };
                this._pruneCache();
                this._scheduleCachePersist();
            },

            _pruneCache() {
                const cache = this._getCache();
                const now = Date.now();
                for (const [videoId, entry] of Object.entries(cache)) {
                    const cachedAt = Number(entry && entry.ts);
                    if (!VIDEO_ID_PATTERN.test(videoId) || !Number.isFinite(cachedAt) || now - cachedAt > this._CACHE_STALE_MAX_MS) {
                        delete cache[videoId];
                    }
                }
                const entries = Object.entries(cache);
                if (entries.length > this._CACHE_MAX_ENTRIES) {
                    entries.sort((a, b) => (Number(b[1] && b[1].ts) || 0) - (Number(a[1] && a[1].ts) || 0));
                    for (const [videoId] of entries.slice(this._CACHE_MAX_ENTRIES)) delete cache[videoId];
                }
            },

            _scheduleCachePersist() {
                clearTimeout(this._cachePersistTimer);
                this._cachePersistTimer = setTimeout(() => {
                    this._cachePersistTimer = null;
                    this._pruneCache();
                    storageWriteJSON(this._CACHE_KEY, this._getCache());
                }, 1000);
            },

            _flushCachePersist() {
                if (!this._cachePersistTimer) return;
                clearTimeout(this._cachePersistTimer);
                this._cachePersistTimer = null;
                this._pruneCache();
                storageWriteJSON(this._CACHE_KEY, this._getCache());
            },

            _formatCacheTimestamp(timestamp) {
                const date = new Date(timestamp);
                if (!Number.isFinite(date.getTime())) return 'unknown time';
                return date.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                });
            },

            async _fetchSegments(videoId) {
                const gen = this._generation;
                const cats = this._getEnabledCategories();
                if (!cats.length) return [];
                const cached = this._getCachedSegments(videoId, cats);
                if (cached) {
                    ExternalApiHealth?.recordSuccess?.('sponsorBlock', {
                        source: 'cache',
                        cacheState: 'fresh',
                        endpoint: 'skipSegments',
                        ts: cached.ts
                    });
                    return this._markCachedSegments(cached.segments, cached.ts, 'fresh');
                }
                const apiOrigins = resolveSponsorBlockApiOrigins(appState.settings);
                try {
                    // Privacy-preserving hash-prefix lookup: only send the first
                    // 4 chars of the SHA-256 hash so the server never sees the
                    // full video ID.  Client-side filter for the exact match.
                    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoId));
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    const prefix = hashHex.substring(0, 4);
                    let lastError = null;
                    for (let hostIndex = 0; hostIndex < apiOrigins.length; hostIndex++) {
                        const host = apiOrigins[hostIndex];
                        try {
                            const { data } = await extensionFetchJson({
                                method: 'GET',
                                url: `${host}/api/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(cats))}`,
                                timeout: 8000,
                            });
                            if (!Array.isArray(data)) throw new Error('invalid SponsorBlock skipSegments payload');
                            // Filter for exact video ID match from hash-prefix results
                            const match = data.find(entry => entry.videoID === videoId);
                            const segments = match && Array.isArray(match.segments)
                                ? this._normalizeSegments(match.segments)
                                : [];
                            // Don't resurrect the destroy()-nulled cache or arm a persist
                            // timer if the feature was torn down while this was in flight.
                            if (gen === this._generation) this._rememberSegments(videoId, cats, segments);
                            ExternalApiHealth?.recordSuccess?.('sponsorBlock', {
                                source: 'network',
                                cacheState: 'refreshed',
                                fallbackState: hostIndex > 0 ? 'mirror' : '',
                                endpoint: 'skipSegments',
                                host,
                                itemCount: segments.length
                            });
                            return segments;
                        } catch (error) {
                            // A 404 from the hash-prefix endpoint is the API
                            // saying "nothing submitted for this prefix" — the
                            // normal answer for most videos, not a failure.
                            // Treating it as one failed over to the mirror,
                            // burned a second request, and surfaced the mirror
                            // reply as a degraded-state pill on every ordinary
                            // video. Answer it as an empty result and stop.
                            if (Number(error?.response?.status ?? error?.status ?? 0) === 404) {
                                if (gen === this._generation) this._rememberSegments(videoId, cats, []);
                                ExternalApiHealth?.recordSuccess?.('sponsorBlock', {
                                    source: 'network',
                                    cacheState: 'refreshed',
                                    fallbackState: hostIndex > 0 ? 'mirror' : '',
                                    endpoint: 'skipSegments',
                                    host,
                                    itemCount: 0
                                });
                                return [];
                            }
                            lastError = error;
                            if (hostIndex + 1 < apiOrigins.length) {
                                DiagnosticLog?.record?.('sponsorBlock', `API host ${host} failed; trying ${apiOrigins[hostIndex + 1]}`);
                            }
                        }
                    }
                    throw lastError || new Error('SponsorBlock API host list is empty');
                } catch (error) {
                    const stale = this._getCachedSegments(videoId, cats, { allowStale: true });
                    const lastHost = apiOrigins[apiOrigins.length - 1] || '';
                    if (stale) {
                        ExternalApiHealth?.recordCacheFallback?.('sponsorBlock', error, {
                            endpoint: 'skipSegments',
                            host: lastHost,
                            cacheState: 'stale',
                            fallbackState: 'stale-cache'
                        });
                        DiagnosticLog?.record?.('sponsorBlock', `stale cache fallback for ${videoId}: ${error?.message || 'fetch failed'}`);
                        return this._markCachedSegments(stale.segments, stale.ts, 'stale');
                    }
                    ExternalApiHealth?.recordFailure?.('sponsorBlock', error, {
                        endpoint: 'skipSegments',
                        host: lastHost,
                        cacheState: 'miss'
                    });
                    DiagnosticLog?.record?.('sponsorBlock', `segment fetch failed for ${videoId}: ${error?.message || 'unknown error'}`);
                    return [];
                }
            },

            async _loadForVideo() {
                const videoId = getVideoId();
                if (!videoId || videoId === this._videoId) return;
                this._videoId = videoId;
                this._segments = [];
                this._clearBarSegments();
                const gen = this._generation;
                const fetched = await this._fetchSegments(videoId);
                // Guard: bail if destroy() fired while awaiting (generation
                // bumped) OR the user navigated to a different video — otherwise
                // we paint this video's segment bars onto the new one and
                // _scheduleNextSkip auto-skips it using the wrong timestamps.
                if (gen !== this._generation || getVideoId() !== videoId) return;
                this._segments = fetched;
                if (this._segments.length) {
                    DebugManager.log('SponsorBlock', `Loaded ${this._segments.length} segments for ${videoId}`);
                    this._renderBarSegments();
                } else {
                    // No segments for this video: nothing will ever paint, so
                    // stop the churn-heavy player observer until the next
                    // navigation re-arms it.
                    this._disarmBarObserver();
                }
            },

            _checkSkip() {
                if (!this._segments.length) return;
                const video = getMainVideoElement();
                if (!video || video.paused) return;
                const currentTime = video.currentTime;
                const enabledCats = this._getEnabledCategories();
                for (const seg of this._segments) {
                    if (!enabledCats.includes(seg.category)) continue;
                    // v3.20.1: poi_highlight is a jump-to marker per the
                    // SponsorBlock API spec, not a skip segment. Render it
                    // on the progress bar (handled by _renderBarSegments),
                    // but never auto-advance past it.
                    if (seg.category === 'poi_highlight') continue;
                    const [start, end] = seg.segment;
                    if (currentTime >= start && currentTime < end - 0.3) {
                        video.currentTime = end;
                        DebugManager.log('SponsorBlock', `Skipped ${seg.category}: ${start.toFixed(1)}s -> ${end.toFixed(1)}s`);
                        // Skip notification removed — toasts over the video are distracting.
                        // v3.23.0 (NX5): announce via aria-live so screen-reader
                        // users know a skip happened without a visible toast.
                        // The polite live region queues the message; categories
                        // are human-friendly via the SB label map but fall back
                        // to the raw category id.
                        try {
                            const labels = {
                                sponsor: 'sponsor',
                                selfpromo: 'self promotion',
                                interaction: 'interaction reminder',
                                intro: 'intro',
                                outro: 'outro',
                                preview: 'preview or recap',
                                music_offtopic: 'non-music section',
                                filler: 'filler tangent',
                            };
                            const label = labels[seg.category] || seg.category.replace(/_/g, ' ');
                            announceA11y(`Skipped ${label} segment.`);
                        } catch (_) {
                            // reason: announcement is best-effort
                        }
                        // Reschedule after skip to handle next segment
                        this._scheduleNextSkip();
                        return;
                    }
                }
            },

            // Scheduled skip: instead of 500ms polling, compute the delay to the
            // next segment boundary and schedule a precise setTimeout.  Falls back
            // to a 2s ceiling so we never wait forever if currentTime drifts.
            _scheduleNextSkip() {
                this._clearSchedule();
                const video = getMainVideoElement();
                if (!video || video.paused || !this._segments.length) return;
                const currentTime = video.currentTime;
                const rate = video.playbackRate || 1;
                const enabledCats = this._getEnabledCategories();
                let minDelay = Infinity;
                for (const seg of this._segments) {
                    if (!enabledCats.includes(seg.category)) continue;
                    // v3.20.1: poi_highlight is a marker, never an auto-skip
                    // target. Excluding here mirrors _checkSkip so we don't
                    // schedule timers that get immediately rejected.
                    if (seg.category === 'poi_highlight') continue;
                    const [start, end] = seg.segment;
                    if (currentTime >= start && currentTime < end - 0.3) {
                        // Already inside a segment — skip immediately
                        minDelay = 0;
                        break;
                    }
                    if (start > currentTime) {
                        const wallMs = ((start - currentTime) / rate) * 1000;
                        if (wallMs < minDelay) minDelay = wallMs;
                    }
                }
                if (minDelay === Infinity) return; // No upcoming segments
                // Fire 100ms early for precision, cap at 2s to stay responsive.
                // Add 50-200ms random jitter so skip timing is not frame-exact
                // — reduces detection fingerprint (SponsorBlock #2290).
                const jitter = 50 + Math.floor(Math.random() * 150);
                const delay = Math.max(0, Math.min(minDelay - 100 + jitter, 2000 + jitter));
                this._skipTimer = setTimeout(() => {
                    this._checkSkip();
                    // If checkSkip didn't skip (edge of segment), reschedule
                    if (!video.paused) this._scheduleNextSkip();
                }, delay);
            },

            _clearSchedule() {
                if (this._skipTimer) { clearTimeout(this._skipTimer); this._skipTimer = null; }
            },

            _renderBarSegments() {
                this._clearBarSegments();
                const video = getMainVideoElement();
                const progressBar = getPlayerProgressBar();
                if (!video || !progressBar || !video.duration) return;
                const duration = video.duration;
                const enabledCats = this._getEnabledCategories();
                for (const seg of this._segments) {
                    if (!enabledCats.includes(seg.category)) continue;
                    const [start, end] = seg.segment;
                    const left = (start / duration) * 100;
                    // A point marker has zero duration, so a proportional width
                    // renders nothing. Give it a fixed minimum so the highlight
                    // is actually visible on the bar.
                    const isPoint = this._isPointSegment(seg) || end <= start;
                    const width = isPoint ? 0 : ((end - start) / duration) * 100;
                    const bar = document.createElement('div');
                    bar.className = isPoint ? 'ytkit-sb-segment ytkit-sb-point' : 'ytkit-sb-segment';
                    const sizing = isPoint ? 'width:3px;min-width:3px;transform:translateX(-1px);' : `width:${width}%;`;
                    bar.style.cssText = `position:absolute;bottom:0;height:100%;left:${left}%;${sizing}background:${this._CATEGORY_COLORS[seg.category] || '#00d400'};opacity:0.7;pointer-events:none;z-index:35;`;
                    const label = seg.category.replace(/_/g, ' ');
                    if (seg._ytkitCacheSource === 'stale') {
                        bar.dataset.ytkitCacheSource = 'stale';
                        bar.title = t('sponsorCachedSegmentTitleTpl', '{label} (cached at {time})')
                            .replace('{label}', label)
                            .replace('{time}', this._formatCacheTimestamp(seg._ytkitCachedAt));
                    } else {
                        bar.title = label;
                    }
                    progressBar.appendChild(bar);
                    this._barSegments.push(bar);
                }
            },

            _clearBarSegments() {
                this._barSegments.forEach(el => el.remove());
                this._barSegments = [];
            },

            _noteAntiAdblockEvent(type) {
                this._antiAdblockLastEvent = type;
                this._antiAdblockLastEventAt = Date.now();
                this._scheduleAntiAdblockCheck(250);
            },

            _scheduleAntiAdblockCheck(delayMs = 1800) {
                clearTimeout(this._antiAdblockVerifyTimer);
                this._antiAdblockVerifyTimer = setTimeout(() => {
                    this._antiAdblockVerifyTimer = null;
                    this._checkAntiAdblock();
                }, Math.max(0, delayMs));
            },

            _readAntiAdblockPlaybackSample(signal) {
                const observedAt = Date.now();
                const video = getMainVideoElement();
                if (!video) {
                    return {
                        observedAt,
                        videoPresent: false,
                        mediaKey: '',
                        _signalSelector: signal.selector
                    };
                }
                const recentEvent = observedAt - this._antiAdblockLastEventAt <= 5000
                    ? this._antiAdblockLastEvent
                    : '';
                return {
                    observedAt,
                    videoPresent: true,
                    mediaKey: String(video.currentSrc || video.src || getVideoId() || ''),
                    currentTime: Number(video.currentTime) || 0,
                    paused: video.paused === true,
                    ended: video.ended === true,
                    readyState: Number(video.readyState) || 0,
                    waiting: recentEvent === 'waiting' || recentEvent === 'stalled',
                    error: !!video.error,
                    _signalSelector: signal.selector
                };
            },

            _publishAntiAdblock(snapshot) {
                try {
                    publishAntiAdblockState(snapshot ? {
                        selector: snapshot.selector,
                        playbackState: snapshot.playbackState,
                        observedAt: snapshot.observedAt,
                        signalStrength: snapshot.signalStrength,
                        blocking: snapshot.blocking,
                        playback: { ...snapshot.playback }
                    } : null);
                } catch (_) {
                    // reason: diagnostics publishing cannot interfere with playback
                }
            },

            _playbackStateLabel(state) {
                if (state === 'advancing') return t('antiAdblockPlaybackAdvancing', 'advancing');
                if (state === 'stalled') return t('antiAdblockPlaybackStalled', 'stalled');
                if (state === 'blocked') return t('antiAdblockPlaybackBlocked', 'blocked');
                return t('antiAdblockPlaybackUnknown', 'unknown');
            },

            _antiAdblockStateMessage(state) {
                if (state === 'advancing') {
                    return t('antiAdblockStateAdvancing', 'YouTube showed an ad-block warning, but this video is still playing.');
                }
                if (state === 'stalled') {
                    return t('antiAdblockStateStalled', 'YouTube showed an ad-block warning and playback is stalled.');
                }
                if (state === 'blocked') {
                    return t('antiAdblockStateBlocked', 'YouTube showed an ad-block warning and playback appears blocked.');
                }
                return t('antiAdblockStateUnknown', 'YouTube showed an ad-block warning. Astra cannot confirm the playback state yet.');
            },

            _formatAntiAdblockDeadline(value) {
                const date = new Date(value);
                if (!Number.isFinite(date.getTime())) return '';
                return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            },

            _scheduleAntiAdblockDeadline() {
                clearTimeout(this._antiAdblockDeadlineTimer);
                this._antiAdblockDeadlineTimer = null;
                const pauseUntil = Number(this._zeroAdStatus?.pauseUntil);
                if (!this._zeroAdStatus?.paused || !Number.isFinite(pauseUntil)) return;
                const delay = Math.max(0, pauseUntil - Date.now()) + 250;
                this._antiAdblockDeadlineTimer = setTimeout(() => {
                    this._antiAdblockDeadlineTimer = null;
                    void this._refreshZeroAdStatus();
                }, delay);
            },

            async _refreshZeroAdStatus() {
                try {
                    const status = await getZeroAdStatus();
                    if (!status?.ok) throw new Error(status?.error || 'Status unavailable');
                    this._zeroAdStatus = status;
                } catch (error) {
                    this._zeroAdStatus = {
                        ok: false,
                        enabled: true,
                        paused: false,
                        pauseUntil: null,
                        error: error?.message || 'Status unavailable'
                    };
                }
                this._scheduleAntiAdblockDeadline();
                this._renderAntiAdblockNotice();
                return this._zeroAdStatus;
            },

            async _pauseZeroAdRules() {
                if (this._antiAdblockBusy) return;
                this._antiAdblockBusy = true;
                this._antiAdblockActionError = '';
                this._renderAntiAdblockNotice();
                try {
                    const status = await pauseZeroAdRules();
                    if (!status?.ok || !status.paused || !status.pauseUntil) {
                        throw new Error(status?.error || 'Astra ad blocking could not be paused.');
                    }
                    this._zeroAdStatus = status;
                    this._scheduleAntiAdblockDeadline();
                    const deadline = this._formatAntiAdblockDeadline(status.pauseUntil);
                    DiagnosticLog?.record?.('sb-anti-adblock', `user paused Astra ad rules until ${deadline}`);
                    announceA11y(t('antiAdblockPausedUntilTpl', 'Astra ad blocking is paused until {time}.')
                        .replace('{time}', deadline));
                } catch (error) {
                    this._antiAdblockActionError = error?.message || 'Astra ad blocking could not be paused.';
                    DiagnosticLog?.record?.('sb-anti-adblock', `recovery failed: ${this._antiAdblockActionError}`);
                } finally {
                    this._antiAdblockBusy = false;
                    this._renderAntiAdblockNotice();
                }
            },

            async _resumeZeroAdRules() {
                if (this._antiAdblockBusy) return;
                this._antiAdblockBusy = true;
                this._antiAdblockActionError = '';
                this._renderAntiAdblockNotice();
                try {
                    const status = await resumeZeroAdRules();
                    if (!status?.ok || status.enabled !== true) {
                        throw new Error(status?.error || 'Astra ad blocking could not be resumed.');
                    }
                    this._zeroAdStatus = status;
                    this._scheduleAntiAdblockDeadline();
                    DiagnosticLog?.record?.('sb-anti-adblock', 'user resumed Astra ad rules');
                    announceA11y(t('antiAdblockResumed', 'Astra ad blocking resumed.'));
                } catch (error) {
                    this._antiAdblockActionError = error?.message || 'Astra ad blocking could not be resumed.';
                    DiagnosticLog?.record?.('sb-anti-adblock', `resume failed: ${this._antiAdblockActionError}`);
                } finally {
                    this._antiAdblockBusy = false;
                    this._renderAntiAdblockNotice();
                }
            },

            _renderAntiAdblockNotice() {
                const snapshot = this._antiAdblockSnapshot;
                const pauseUntil = Number(this._zeroAdStatus?.pauseUntil);
                const paused = this._zeroAdStatus?.paused === true
                    && Number.isFinite(pauseUntil)
                    && pauseUntil > Date.now();
                if (!snapshot && !paused) {
                    this._antiAdblockNotice?.remove();
                    this._antiAdblockNotice = null;
                    return;
                }

                let notice = this._antiAdblockNotice;
                if (!notice?.isConnected) {
                    notice = document.createElement('section');
                    notice.id = 'ytkit-anti-adblock-recovery';
                    notice.className = 'ytkit-anti-adblock-recovery';
                    notice.setAttribute('role', 'region');
                    notice.setAttribute('aria-live', 'polite');
                    (document.body || document.documentElement)?.appendChild(notice);
                    this._antiAdblockNotice = notice;
                }
                notice.dataset.playbackState = snapshot?.playbackState || 'paused-rules';
                notice.replaceChildren();

                const heading = document.createElement('strong');
                heading.className = 'ytkit-anti-adblock-title';
                heading.textContent = t('antiAdblockTitle', 'YouTube playback check');
                notice.setAttribute('aria-label', heading.textContent);
                notice.appendChild(heading);

                const summary = document.createElement('p');
                summary.className = 'ytkit-anti-adblock-summary';
                summary.textContent = snapshot
                    ? this._antiAdblockStateMessage(snapshot.playbackState)
                    : t('antiAdblockRulesPaused', 'Astra ad blocking is temporarily paused.');
                notice.appendChild(summary);

                if (snapshot) {
                    const evidence = document.createElement('p');
                    evidence.className = 'ytkit-anti-adblock-evidence';
                    evidence.textContent = t('antiAdblockEvidenceTpl', 'Selector: {selector} · Playback: {state}')
                        .replace('{selector}', snapshot.selector)
                        .replace('{state}', this._playbackStateLabel(snapshot.playbackState));
                    notice.appendChild(evidence);
                }

                if (paused) {
                    const deadline = document.createElement('p');
                    deadline.className = 'ytkit-anti-adblock-deadline';
                    deadline.textContent = t('antiAdblockPausedUntilTpl', 'Astra ad blocking is paused until {time}.')
                        .replace('{time}', this._formatAntiAdblockDeadline(pauseUntil));
                    notice.appendChild(deadline);

                    const retry = document.createElement('p');
                    retry.className = 'ytkit-anti-adblock-hint';
                    retry.textContent = t('antiAdblockReloadHint', 'Reload this YouTube tab to retry playback.');
                    notice.appendChild(retry);
                }

                if (this._antiAdblockActionError) {
                    const error = document.createElement('p');
                    error.className = 'ytkit-anti-adblock-error';
                    error.setAttribute('role', 'alert');
                    error.textContent = this._antiAdblockActionError;
                    notice.appendChild(error);
                }

                const actions = document.createElement('div');
                actions.className = 'ytkit-anti-adblock-actions';
                const action = document.createElement('button');
                action.type = 'button';
                action.className = 'ytkit-anti-adblock-action';
                action.disabled = this._antiAdblockBusy;
                if (this._antiAdblockBusy) action.setAttribute('aria-busy', 'true');
                if (paused) {
                    action.textContent = t('antiAdblockResumeAction', 'Resume Astra ad blocking');
                    action.addEventListener('click', () => { void this._resumeZeroAdRules(); }, { once: true });
                } else {
                    action.textContent = t('antiAdblockPauseAction', 'Pause Astra ad blocking for 15 minutes');
                    action.addEventListener('click', () => { void this._pauseZeroAdRules(); }, { once: true });
                }
                actions.appendChild(action);
                notice.appendChild(actions);
            },

            _checkAntiAdblock() {
                const signal = findVisibleAntiAdblockSignal(document);
                if (!signal) {
                    this._antiAdblockPreviousSample = null;
                    if (this._antiAdblockSnapshot) {
                        this._antiAdblockSnapshot = null;
                        this._antiAdblockLogFingerprint = '';
                        this._publishAntiAdblock(null);
                    }
                    this._renderAntiAdblockNotice();
                    return null;
                }

                const sample = this._readAntiAdblockPlaybackSample(signal);
                const previous = this._antiAdblockPreviousSample?._signalSelector === signal.selector
                    ? this._antiAdblockPreviousSample
                    : null;
                const playbackState = classifyAntiAdblockPlayback(previous, sample, signal);
                this._antiAdblockPreviousSample = sample;
                const snapshot = {
                    selector: signal.selector,
                    playbackState,
                    observedAt: sample.observedAt,
                    signalStrength: signal.strength,
                    blocking: signal.blocking,
                    playback: {
                        videoPresent: sample.videoPresent,
                        paused: sample.videoPresent ? sample.paused : null,
                        readyState: sample.videoPresent ? sample.readyState : null,
                        waiting: sample.videoPresent ? sample.waiting : null,
                        error: sample.videoPresent ? sample.error : null
                    }
                };
                this._antiAdblockSnapshot = snapshot;
                this._publishAntiAdblock(snapshot);
                this._renderAntiAdblockNotice();

                const fingerprint = `${snapshot.selector}|${snapshot.playbackState}|${snapshot.signalStrength}`;
                if (DiagnosticLog && fingerprint !== this._antiAdblockLogFingerprint) {
                    this._antiAdblockLogFingerprint = fingerprint;
                    DiagnosticLog.record('sb-anti-adblock',
                        `selector=${snapshot.selector}; playback=${snapshot.playbackState}; strength=${snapshot.signalStrength}`);
                }
                if (playbackState === 'unknown') this._scheduleAntiAdblockCheck(1800);
                return snapshot;
            },

            init() {
                const self = this;
                this._styleEl = injectStyle(`
                    .ytkit-sb-segment { border-radius: 1px; }
                    .ytkit-anti-adblock-recovery {
                        position: fixed !important;
                        right: max(18px, env(safe-area-inset-right)) !important;
                        bottom: max(18px, env(safe-area-inset-bottom)) !important;
                        z-index: 2147483646 !important;
                        box-sizing: border-box !important;
                        width: min(390px, calc(100vw - 36px)) !important;
                        padding: 18px !important;
                        border: 1px solid rgba(255, 126, 97, 0.34) !important;
                        border-radius: 12px !important;
                        background: rgba(17, 20, 27, 0.96) !important;
                        color: #f8fafc !important;
                        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.04) inset !important;
                        font: 400 13px/1.5 Roboto, Arial, sans-serif !important;
                    }
                    .ytkit-anti-adblock-recovery[data-playback-state="blocked"] {
                        border-color: rgba(255, 90, 90, 0.56) !important;
                    }
                    .ytkit-anti-adblock-title {
                        display: block !important;
                        margin: 0 0 7px !important;
                        color: #fff !important;
                        font-size: 15px !important;
                        font-weight: 700 !important;
                        letter-spacing: -0.01em !important;
                    }
                    .ytkit-anti-adblock-summary,
                    .ytkit-anti-adblock-evidence,
                    .ytkit-anti-adblock-deadline,
                    .ytkit-anti-adblock-hint,
                    .ytkit-anti-adblock-error {
                        margin: 0 !important;
                    }
                    .ytkit-anti-adblock-summary {
                        color: rgba(248, 250, 252, 0.88) !important;
                    }
                    .ytkit-anti-adblock-evidence {
                        margin-top: 10px !important;
                        padding: 8px 10px !important;
                        border-radius: 10px !important;
                        background: rgba(255, 255, 255, 0.06) !important;
                        color: rgba(226, 232, 240, 0.76) !important;
                        font: 500 11px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace !important;
                        overflow-wrap: anywhere !important;
                    }
                    .ytkit-anti-adblock-deadline {
                        margin-top: 12px !important;
                        color: #ffd2c7 !important;
                        font-weight: 650 !important;
                    }
                    .ytkit-anti-adblock-hint {
                        margin-top: 3px !important;
                        color: rgba(226, 232, 240, 0.68) !important;
                    }
                    .ytkit-anti-adblock-error {
                        margin-top: 10px !important;
                        color: #fecaca !important;
                    }
                    .ytkit-anti-adblock-actions {
                        display: flex !important;
                        margin-top: 14px !important;
                    }
                    .ytkit-anti-adblock-action {
                        min-height: 38px !important;
                        padding: 0 15px !important;
                        border: 1px solid rgba(255, 255, 255, 0.12) !important;
                        border-radius: 11px !important;
                        background: #ff684f !important;
                        color: #fff !important;
                        box-shadow: 0 8px 22px rgba(255, 80, 56, 0.24) !important;
                        font: 700 12px/1 Roboto, Arial, sans-serif !important;
                        cursor: pointer !important;
                        transition: transform 140ms ease, filter 140ms ease, box-shadow 140ms ease !important;
                    }
                    .ytkit-anti-adblock-action:hover:not(:disabled) {
                        filter: brightness(1.08) !important;
                        transform: translateY(-1px) !important;
                        box-shadow: 0 11px 26px rgba(255, 80, 56, 0.3) !important;
                    }
                    .ytkit-anti-adblock-action:focus-visible {
                        outline: 3px solid rgba(125, 211, 252, 0.8) !important;
                        outline-offset: 3px !important;
                    }
                    .ytkit-anti-adblock-action:disabled {
                        cursor: wait !important;
                        opacity: 0.68 !important;
                    }
                    html:not([dark]) .ytkit-anti-adblock-recovery {
                        border-color: rgba(194, 65, 12, 0.24) !important;
                        background: rgba(255, 255, 255, 0.97) !important;
                        color: #172033 !important;
                        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(15, 23, 42, 0.04) inset !important;
                    }
                    html:not([dark]) .ytkit-anti-adblock-title { color: #111827 !important; }
                    html:not([dark]) .ytkit-anti-adblock-summary { color: #334155 !important; }
                    html:not([dark]) .ytkit-anti-adblock-evidence {
                        background: rgba(15, 23, 42, 0.055) !important;
                        color: #475569 !important;
                    }
                    html:not([dark]) .ytkit-anti-adblock-deadline { color: #9a3412 !important; }
                    html:not([dark]) .ytkit-anti-adblock-hint { color: #64748b !important; }
                    html:not([dark]) .ytkit-anti-adblock-error { color: #b91c1c !important; }
                    @media (max-width: 520px) {
                        .ytkit-anti-adblock-recovery {
                            right: 12px !important;
                            bottom: 12px !important;
                            width: calc(100vw - 24px) !important;
                        }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .ytkit-anti-adblock-action { transition: none !important; }
                    }
                `, this.id, true);
                this._antiAdblockTimer = setInterval(() => self._checkAntiAdblock(), 30000);
                this._checkAntiAdblock();
                void this._refreshZeroAdStatus();
                // Event-driven skip scheduling: reschedule on play/seek/rate changes
                this._playHandler = () => {
                    self._scheduleNextSkip();
                    self._noteAntiAdblockEvent('playing');
                };
                this._seekHandler = () => {
                    self._scheduleNextSkip();
                    self._noteAntiAdblockEvent('seeked');
                };
                this._pauseHandler = () => {
                    self._clearSchedule();
                    self._noteAntiAdblockEvent('pause');
                };
                this._antiAdblockStateHandler = (event) => self._noteAntiAdblockEvent(event.type);
                document.addEventListener('playing', this._playHandler, true);
                document.addEventListener('seeked', this._seekHandler, true);
                document.addEventListener('ratechange', this._seekHandler, true);
                document.addEventListener('pause', this._pauseHandler, true);
                document.addEventListener('waiting', this._antiAdblockStateHandler, true);
                document.addEventListener('stalled', this._antiAdblockStateHandler, true);
                document.addEventListener('error', this._antiAdblockStateHandler, true);
                const reloadSegments = () => {
                    self._videoId = null;
                    self._segments = [];
                    self._clearBarSegments();
                    self._armBarObserver();
                    self._clearSchedule();
                    clearTimeout(self._reloadTimer);
                    self._reloadTimer = setTimeout(() => {
                        self._reloadTimer = null;
                        self._antiAdblockPreviousSample = null;
                        self._checkAntiAdblock();
                        self._loadForVideo().then(() => self._scheduleNextSkip()).catch(() => { /* reason: segment reload is best-effort */ });
                    }, 800);
                };
                addNavigateRule(this._navRuleId, reloadSegments);
                // Re-render bar segments when video duration changes (live streams, late loadedmetadata)
                this._durationHandler = () => {
                    if (this._segments.length) this._renderBarSegments();
                };
                document.addEventListener('durationchange', this._durationHandler, true);
                // Also watch for video duration becoming available (for bar
                // rendering). The observer disarms itself once the bars are
                // painted so it stops reacting to #movie_player's constant
                // playback churn (progress ticks, buffered ranges, caption
                // windows); the navigate rule re-arms it for the next video.
                this._barObserver = new MutationObserver(() => {
                    const video = getMainVideoElement();
                    const barsLive = this._barSegments.length > 0
                        && this._barSegments[0]?.isConnected !== false;
                    if (video?.duration && this._segments.length && !barsLive) {
                        this._renderBarSegments();
                    }
                    if (this._barSegments.length && this._barSegments[0]?.isConnected !== false) {
                        this._disarmBarObserver();
                    }
                });
                this._armBarObserver();
            },
            _armBarObserver() {
                if (this._barArmed || !this._barObserver) return;
                const player = getMoviePlayerElement();
                if (!player) return;
                this._barObserver.observe(player, { childList: true, subtree: true });
                this._barArmed = true;
            },
            _disarmBarObserver() {
                if (!this._barArmed || !this._barObserver) return;
                this._barObserver.disconnect();
                this._barArmed = false;
            },

            destroy() {
                // Invalidate any in-flight _loadForVideo so late fetches
                // cannot re-render segments onto the progress bar after the
                // feature has been disabled.
                this._generation = (this._generation + 1) | 0;
                clearInterval(this._antiAdblockTimer);
                this._antiAdblockTimer = null;
                clearTimeout(this._antiAdblockVerifyTimer);
                this._antiAdblockVerifyTimer = null;
                clearTimeout(this._antiAdblockDeadlineTimer);
                this._antiAdblockDeadlineTimer = null;
                clearTimeout(this._reloadTimer);
                this._reloadTimer = null;
                this._clearSchedule();
                if (this._playHandler) document.removeEventListener('playing', this._playHandler, true);
                if (this._seekHandler) {
                    document.removeEventListener('seeked', this._seekHandler, true);
                    document.removeEventListener('ratechange', this._seekHandler, true);
                }
                if (this._pauseHandler) document.removeEventListener('pause', this._pauseHandler, true);
                if (this._antiAdblockStateHandler) {
                    document.removeEventListener('waiting', this._antiAdblockStateHandler, true);
                    document.removeEventListener('stalled', this._antiAdblockStateHandler, true);
                    document.removeEventListener('error', this._antiAdblockStateHandler, true);
                }
                if (this._durationHandler) document.removeEventListener('durationchange', this._durationHandler, true);
                removeNavigateRule(this._navRuleId);
                this._disarmBarObserver();
                this._clearBarSegments();
                this._flushCachePersist();
                this._antiAdblockNotice?.remove();
                this._antiAdblockNotice = null;
                this._antiAdblockPreviousSample = null;
                this._antiAdblockSnapshot = null;
                this._zeroAdStatus = null;
                this._publishAntiAdblock(null);
                this._styleEl?.remove();
                this._cache = null;
                this._segments = [];
                this._videoId = null;
            }
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createSponsorBlockFeature = createSponsorBlockFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createSponsorBlockFeature,
            findVisibleAntiAdblockSignal,
            isAntiAdblockNodeVisible,
            classifyAntiAdblockPlayback,
            ANTI_ADBLOCK_SIGNAL_RULES
        };
    }
})();
