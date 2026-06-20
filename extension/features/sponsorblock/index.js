(() => {
    'use strict';

    // extension/features/sponsorblock/index.js
    //
    // Monolith peel for SponsorBlock. The module owns the primary
    // sponsorBlock runtime/state object; ytkit.js keeps the inline object
    // as a compatibility fallback and delegates to the factory when present.

    function createSponsorBlockFeature(deps = {}) {
        const {
            appState = { settings: {} },
            DebugManager = { log() {} },
            DiagnosticLog = null,
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
            VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/,
            PageTypes = { WATCH: 'watch' }
        } = deps;

        return {
            id: 'sponsorBlock',
            name: 'SponsorBlock',
            description: 'Automatically skip sponsored segments, intros, outros, and other non-content sections using crowdsourced data',
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
                const link = document.querySelector('ytd-video-owner-renderer a[href*="/channel/"], #channel-name a[href*="/channel/"]');
                if (link) {
                    const m = (link.getAttribute('href') || '').match(/\/channel\/([A-Za-z0-9_-]+)/);
                    if (m) return m[1];
                }
                const handleLink = document.querySelector('ytd-video-owner-renderer a[href^="/@"], #channel-name a[href^="/@"]');
                if (handleLink) return handleLink.getAttribute('href') || '';
                return '';
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

            _normalizeSegments(segments) {
                if (!Array.isArray(segments)) return [];
                return segments.filter(s =>
                    s && typeof s === 'object'
                    && Array.isArray(s.segment) && s.segment.length === 2
                    && Number.isFinite(s.segment[0]) && Number.isFinite(s.segment[1])
                    && s.segment[0] >= 0 && s.segment[1] > s.segment[0]
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
                const cats = this._getEnabledCategories();
                if (!cats.length) return [];
                const cached = this._getCachedSegments(videoId, cats);
                if (cached) return this._markCachedSegments(cached.segments, cached.ts, 'fresh');
                try {
                    // Privacy-preserving hash-prefix lookup: only send the first
                    // 4 chars of the SHA-256 hash so the server never sees the
                    // full video ID.  Client-side filter for the exact match.
                    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoId));
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    const prefix = hashHex.substring(0, 4);
                    const { data } = await extensionFetchJson({
                        method: 'GET',
                        url: `https://sponsor.ajay.app/api/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(cats))}`,
                        timeout: 8000,
                    });
                    if (!Array.isArray(data)) return [];
                    // Filter for exact video ID match from hash-prefix results
                    const match = data.find(entry => entry.videoID === videoId);
                    const segments = match && Array.isArray(match.segments)
                        ? this._normalizeSegments(match.segments)
                        : [];
                    this._rememberSegments(videoId, cats, segments);
                    return segments;
                } catch (error) {
                    const stale = this._getCachedSegments(videoId, cats, { allowStale: true });
                    if (stale) {
                        DiagnosticLog?.record?.('sponsorBlock', `stale cache fallback for ${videoId}: ${error?.message || 'fetch failed'}`);
                        return this._markCachedSegments(stale.segments, stale.ts, 'stale');
                    }
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
                // Fire 100ms early for precision, cap at 2s to stay responsive
                const delay = Math.max(0, Math.min(minDelay - 100, 2000));
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
                    const width = ((end - start) / duration) * 100;
                    const bar = document.createElement('div');
                    bar.className = 'ytkit-sb-segment';
                    bar.style.cssText = `position:absolute;bottom:0;height:100%;left:${left}%;width:${width}%;background:${this._CATEGORY_COLORS[seg.category] || '#00d400'};opacity:0.7;pointer-events:none;z-index:35;`;
                    const label = seg.category.replace(/_/g, ' ');
                    if (seg._ytkitCacheSource === 'stale') {
                        bar.dataset.ytkitCacheSource = 'stale';
                        bar.title = `${label} (cached at ${this._formatCacheTimestamp(seg._ytkitCachedAt)})`;
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

            init() {
                const self = this;
                this._styleEl = injectStyle('.ytkit-sb-segment { border-radius: 1px; }', this.id, true);
                // Event-driven skip scheduling: reschedule on play/seek/rate changes
                this._playHandler = () => self._scheduleNextSkip();
                this._seekHandler = () => self._scheduleNextSkip();
                this._pauseHandler = () => self._clearSchedule();
                document.addEventListener('playing', this._playHandler, true);
                document.addEventListener('seeked', this._seekHandler, true);
                document.addEventListener('ratechange', this._seekHandler, true);
                document.addEventListener('pause', this._pauseHandler, true);
                const reloadSegments = () => {
                    self._videoId = null;
                    self._segments = [];
                    self._clearBarSegments();
                    self._clearSchedule();
                    clearTimeout(self._reloadTimer);
                    self._reloadTimer = setTimeout(() => {
                        self._reloadTimer = null;
                        self._loadForVideo().then(() => self._scheduleNextSkip());
                    }, 800);
                };
                addNavigateRule(this._navRuleId, reloadSegments);
                // Re-render bar segments when video duration changes (live streams, late loadedmetadata)
                this._durationHandler = () => {
                    if (this._segments.length) this._renderBarSegments();
                };
                document.addEventListener('durationchange', this._durationHandler, true);
                // Also watch for video duration becoming available (for bar rendering)
                this._barObserver = new MutationObserver(() => {
                    const video = getMainVideoElement();
                    if (video?.duration && this._segments.length && !this._barSegments.length) {
                        this._renderBarSegments();
                    }
                });
                const player = getMoviePlayerElement();
                if (player) this._barObserver.observe(player, { childList: true, subtree: true });
            },

            destroy() {
                // Invalidate any in-flight _loadForVideo so late fetches
                // cannot re-render segments onto the progress bar after the
                // feature has been disabled.
                this._generation = (this._generation + 1) | 0;
                clearTimeout(this._reloadTimer);
                this._reloadTimer = null;
                this._clearSchedule();
                if (this._playHandler) document.removeEventListener('playing', this._playHandler, true);
                if (this._seekHandler) {
                    document.removeEventListener('seeked', this._seekHandler, true);
                    document.removeEventListener('ratechange', this._seekHandler, true);
                }
                if (this._pauseHandler) document.removeEventListener('pause', this._pauseHandler, true);
                if (this._durationHandler) document.removeEventListener('durationchange', this._durationHandler, true);
                removeNavigateRule(this._navRuleId);
                this._barObserver?.disconnect();
                this._clearBarSegments();
                this._styleEl?.remove();
                this._flushCachePersist();
                this._cache = null;
                this._segments = [];
                this._videoId = null;
            }
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createSponsorBlockFeature = createSponsorBlockFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createSponsorBlockFeature };
    }
})();
