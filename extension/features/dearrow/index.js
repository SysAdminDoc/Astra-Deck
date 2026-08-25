(() => {
    'use strict';

    // extension/features/dearrow/index.js
    //
    // Monolith peel for DeArrow. The module owns the primary
    // deArrow runtime/state object; ytkit.js keeps the inline object
    // as a compatibility fallback and delegates to the factory when present.

    const SPONSORBLOCK_API_FALLBACK_ORIGINS = Object.freeze([
        'https://sponsor.ajay.app',
        'https://sponsorblock.kavin.rocks'
    ]);

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

    function createDeArrowFeature(deps = {}) {
        const {
            appState = { settings: {} },
            DebugManager = { log() {} },
            DiagnosticLog = null,
            ExternalApiHealth = null,
            extensionFetchJson = async () => ({ data: null }),
            storageReadJSON = (_key, fallback) => fallback,
            storageWriteJSON = () => {},
            isWatchPagePath = () => false,
            getVideoId = () => null,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            announceA11y = () => {},
            VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/,
            PageTypes = { WATCH: 'watch' },
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'deArrow',
            name: t('feature_deArrow_name', 'DeArrow'),
            description: t('feature_deArrow_desc', 'Replace clickbait titles and thumbnails with SponsorBlock data licensed under CC BY-NC-SA 4.0'),
            group: 'Content',
            icon: 'type',
            isParent: true,
            _cache: {},
            _cacheMeta: {},
            _pending: {},
            _observer: null,
            _observing: false,
            _navRuleId: 'deArrowNav',
            _generation: 0,
            _routeToken: 0,
            _processTimer: null,
            _resetTimer: null,
            _TITLE_SELECTORS: '#video-title, #video-title-link, h3.ytd-rich-grid-media a#video-title-link',
            _WATCH_TITLE_SELECTORS: 'ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string:not(.daCustomTitle), ytd-watch-metadata h1 yt-formatted-string:not(.daCustomTitle)',
            _persistTimer: null,
            init() {
                const self = this;
                // Load persistent cache
                const cached = storageReadJSON('da_branding_cache', null);
                if (cached) {
                    const ttl = parseInt(appState.settings.daCacheTTL || '4', 10) * 3600000;
                    const maxAge = ttl > 0 ? ttl * 6 : 0;
                    const now = Date.now();
                    for (const [k, v] of Object.entries(cached)) {
                        if (v._ts && (now - v._ts) < maxAge) {
                            self._cache[k] = v;
                            self._cacheMeta[k] = v._ts;
                        }
                    }
                }
                // v4.47.0 EI-NEW4: warn power users when the cache is
                // disabled (daCacheTTL=0). With no cache, every visible
                // card hits the DeArrow API. The 100k+ subs.ajay.app
                // call cap is real; expect rate limits.
                const _ttlRaw = parseInt(appState.settings.daCacheTTL || '4', 10);
                if (_ttlRaw === 0) {
                    DebugManager.log('DeArrow',
                        'Cache disabled (daCacheTTL=0); every card hit fires an API request. Expect rate limits.');
                }
                const css = `
                    .daCustomTitle { display: block !important; }
                    .daCustomTitle:not([data-da-together="1"]) + [id="video-title"], .daCustomTitle:not([data-da-together="1"]) + a#video-title-link { display: none !important; }
                    .daCustomTitle[data-da-together="1"] { margin-bottom: 2px !important; }
                    .daOriginalTitle[data-da-original-title="1"] {
                        display: block !important;
                        margin-top: 2px !important;
                        padding-inline-start: 6px !important;
                        border-inline-start: 2px solid var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.2)) !important;
                        color: var(--yt-spec-text-secondary, #aaa) !important;
                        font-size: 0.86em !important;
                        font-weight: 400 !important;
                        opacity: 0.74 !important;
                    }
                    /* v4.47.0 EI-NEW4: locally-formatted fallback titles
                       (sentence/title-case applied when DeArrow has no
                       submission) dim slightly so power users see the
                       distinction from real DeArrow data. */
                    .daCustomTitle[data-da-fallback="1"] { opacity: 0.78 !important; }
                    .ytkit-dearrow-attribution {
                        display: inline-flex !important;
                        align-items: center !important;
                        width: fit-content !important;
                        margin-top: 3px !important;
                        padding: 2px 6px !important;
                        border: 1px solid var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.16)) !important;
                        border-radius: 8px !important;
                        background: var(--yt-spec-badge-chip-background, rgba(255, 255, 255, 0.08)) !important;
                        color: var(--yt-spec-text-secondary, #aaa) !important;
                        font: 600 10px/1.2 Roboto, Arial, sans-serif !important;
                        letter-spacing: 0.01em !important;
                        text-decoration: none !important;
                    }
                    .ytkit-dearrow-attribution:hover,
                    .ytkit-dearrow-attribution:focus-visible {
                        border-color: var(--yt-spec-text-secondary, #aaa) !important;
                        color: var(--yt-spec-text-primary, #fff) !important;
                        outline: 2px solid rgba(255, 107, 74, 0.62) !important;
                        outline-offset: 1px !important;
                    }
                    html:not([dark]) .ytkit-dearrow-attribution {
                        border-color: rgba(15, 23, 42, 0.18) !important;
                        background: rgba(15, 23, 42, 0.06) !important;
                        color: #475569 !important;
                    }
                    html:not([dark]) .ytkit-dearrow-attribution:hover,
                    html:not([dark]) .ytkit-dearrow-attribution:focus-visible {
                        border-color: rgba(15, 23, 42, 0.4) !important;
                        background: rgba(255, 255, 255, 0.96) !important;
                        color: #0f172a !important;
                    }
                `;
                this._styleEl = injectStyle(css, this.id, true);
                const resetAndProcess = () => {
                    self._routeToken++;
                    clearTimeout(self._processTimer);
                    clearTimeout(self._resetTimer);
                    document.querySelectorAll('.daCustomTitle').forEach(c => c.remove());
                    document.querySelectorAll('.ytkit-dearrow-attribution').forEach(c => c.remove());
                    document.querySelectorAll('[data-da-processed]').forEach(el => {
                        const originalDisplay = el.getAttribute('data-da-original-display');
                        el.style.display = originalDisplay === null ? '' : originalDisplay;
                        el.removeAttribute('data-da-original-display');
                        el.classList.remove('daOriginalTitle');
                        el.removeAttribute('data-da-original-title');
                        delete el.dataset.daProcessed;
                        delete el.dataset.daSurfaceSkipped;
                    });
                    document.querySelectorAll('.da-replaced-thumb').forEach(el => {
                        if (el.dataset.daOrigSrc) { el.src = el.dataset.daOrigSrc; delete el.dataset.daOrigSrc; }
                        el.classList.remove('da-replaced-thumb');
                    });
                    // Run one pass on every page, including watch pages: the
                    // related rail (ytd-compact-video-renderer) is the most
                    // clickbait-heavy surface DeArrow targets. The churning
                    // MutationObserver stays gated off watch pages below to
                    // avoid reprocessing on player/comment DOM noise, so this
                    // navigate-triggered pass is what covers the watch sidebar.
                    self._resetTimer = setTimeout(() => {
                        self._resetTimer = null;
                        self._processPage();
                    }, 1000);
                    // Keep the churning observer attached only off watch pages.
                    if (isWatchPagePath()) self._disconnectObserver();
                    else self._connectObserver();
                };
                this._observer = new MutationObserver(() => {
                    if (isWatchPagePath()) return;
                    if (!self._anySurfaceEnabledHere()) {
                        self._disconnectObserver();
                        return;
                    }
                    clearTimeout(self._processTimer);
                    self._processTimer = setTimeout(() => self._processPage(), 300);
                });
                // Previously the observer stayed attached to document.body on
                // every page including watch pages, where it woke on each
                // player/comment mutation just to bail in the callback. Now the
                // navigate rule connects it only off watch pages and disconnects
                // it on entry; the watch-sidebar rail is still covered by
                // resetAndProcess's one-shot pass.
                addNavigateRule(this._navRuleId, resetAndProcess);
                if (!isWatchPagePath()) this._connectObserver();
            },
            _connectObserver() {
                if (!this._observer) return;
                if (!this._anySurfaceEnabledHere()) {
                    this._disconnectObserver();
                    return;
                }
                if (this._observing) return;
                this._observer.observe(document.body, { childList: true, subtree: true });
                this._observing = true;
            },
            _disconnectObserver() {
                if (!this._observing || !this._observer) return;
                this._observer.disconnect();
                this._observing = false;
            },
            async _fetchBranding(videoId) {
                // Check cache with TTL enforcement
                if (this._cache[videoId]) {
                    const ttl = parseInt(appState.settings.daCacheTTL || '4', 10) * 3600000;
                    if (ttl > 0 && (Date.now() - (this._cache[videoId]._ts || 0)) < ttl) {
                        ExternalApiHealth?.recordSuccess?.('deArrow', {
                            source: 'cache',
                            cacheState: 'fresh',
                            endpoint: 'branding',
                            ts: this._cache[videoId]._ts || Date.now()
                        });
                        return this._cache[videoId];
                    } else if (ttl === 0) {
                        // TTL=0 means no cache — evict stale entry
                        delete this._cache[videoId];
                        delete this._cacheMeta[videoId];
                    } else if ((Date.now() - (this._cache[videoId]._ts || 0)) >= ttl) {
                        delete this._cache[videoId];
                        delete this._cacheMeta[videoId];
                    }
                }
                // Deduplicate in-flight fetches for the same videoId
                if (this._pending[videoId]) return this._pending[videoId];
                const promise = this._doFetch(videoId);
                this._pending[videoId] = promise;
                try { return await promise; } finally { delete this._pending[videoId]; }
            },
            async _doFetch(videoId) {
                const gen = this._generation;
                let data;
                let expectedMiss = false;
                const apiOrigins = resolveSponsorBlockApiOrigins(appState.settings);
                let answeredHost = '';
                let lastError = null;
                for (let hostIndex = 0; hostIndex < apiOrigins.length; hostIndex++) {
                    const host = apiOrigins[hostIndex];
                    expectedMiss = false;
                    try {
                        ({ data } = await extensionFetchJson({
                            method: 'GET',
                            url: `${host}/api/branding?videoID=${encodeURIComponent(videoId)}`,
                            timeout: 8000,
                        }));
                        answeredHost = host;
                    } catch (error) {
                        // DeArrow uses HTTP 404 for a valid video with no submitted
                        // title or thumbnail. It still returns an empty branding
                        // object, so this is a normal negative lookup rather than
                        // a rejected request or service outage.
                        if (Number(error?.response?.status) === 404) {
                            expectedMiss = true;
                            answeredHost = host;
                            data = error?.data && typeof error.data === 'object' && !Array.isArray(error.data)
                                ? error.data
                                : { titles: [], thumbnails: [], casualVotes: [] };
                            break;
                        }
                        lastError = error;
                        if (hostIndex + 1 < apiOrigins.length) {
                            DiagnosticLog?.record?.('deArrow', `API host ${host} failed; trying ${apiOrigins[hostIndex + 1]}`);
                            continue;
                        }
                        break;
                    }

                    if (!data || typeof data !== 'object' || Array.isArray(data)) {
                        lastError = new Error('invalid DeArrow branding payload');
                        if (hostIndex + 1 < apiOrigins.length) {
                            DiagnosticLog?.record?.('deArrow', `API host ${host} returned an invalid payload; trying ${apiOrigins[hostIndex + 1]}`);
                            continue;
                        }
                    }
                    if (answeredHost) break;
                }
                if (!answeredHost || !data || typeof data !== 'object' || Array.isArray(data)) {
                    const error = lastError || new Error('DeArrow API host list is empty');
                    const failureDetail = {
                        endpoint: 'branding',
                        host: apiOrigins[apiOrigins.length - 1] || '',
                        cacheState: 'miss'
                    };
                    if (/invalid.*payload/i.test(error?.message || '')) failureDetail.errorClass = 'invalid-payload';
                    ExternalApiHealth?.recordFailure?.('deArrow', error, failureDetail);
                    DiagnosticLog?.record?.('deArrow', `branding fetch failed for ${videoId}: ${error?.message || 'unknown error'}`);
                    return null;
                }
                // Feature was torn down while this request was in flight —
                // do not resurrect the freshly-cleared cache or arm a persist
                // timer that would write after destroy().
                if (gen !== this._generation) return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    const payloadError = new Error('invalid DeArrow branding payload');
                    ExternalApiHealth?.recordFailure?.('deArrow', payloadError, {
                        errorClass: 'invalid-payload',
                        endpoint: 'branding',
                        host: answeredHost,
                        cacheState: 'miss'
                    });
                    DiagnosticLog?.record?.('deArrow', `branding payload invalid for ${videoId}`);
                    return null;
                }
                data._ts = Date.now();
                // A slow in-flight response must never clobber a fresher entry
                // written while it was outstanding.
                const existing = this._cache[videoId];
                if (existing && existing._ts && existing._ts > data._ts) return existing;
                this._cache[videoId] = data;
                this._cacheMeta[videoId] = data._ts;
                // Evict oldest entries if in-memory cache exceeds 2000
                const cacheKeys = Object.keys(this._cache);
                if (cacheKeys.length > 2000) {
                    cacheKeys.sort((a, b) => (this._cacheMeta[a] || 0) - (this._cacheMeta[b] || 0))
                        .slice(0, cacheKeys.length - 1500)
                        .forEach(k => { delete this._cache[k]; delete this._cacheMeta[k]; });
                }
                this._schedulePersist();
                ExternalApiHealth?.recordSuccess?.('deArrow', {
                    source: expectedMiss ? 'network-miss' : 'network',
                    cacheState: 'refreshed',
                    fallbackState: answeredHost !== apiOrigins[0] ? 'mirror' : '',
                    endpoint: 'branding',
                    host: answeredHost
                });
                return data;
            },
            _schedulePersist() {
                clearTimeout(this._persistTimer);
                this._persistTimer = setTimeout(() => {
                    const entries = Object.entries(this._cache).sort((a, b) => (b[1]._ts || 0) - (a[1]._ts || 0)).slice(0, 2000);
                    storageWriteJSON('da_branding_cache', Object.fromEntries(entries));
                }, 5000);
            },
            _formatTitle(title, format) {
                if (!title) return title;
                title = title.replace(/^>\s*/, '');
                if (format === 'sentence') {
                    // Lowercase everything, then capitalize only the first character
                    return title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
                }
                if (format === 'title_case') {
                    const lower = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is','it']);
                    return title.split(' ').map((w, i) => i === 0 || !lower.has(w.toLowerCase()) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join(' ');
                }
                return title;
            },
            _createAttribution() {
                const link = document.createElement('a');
                const label = t('sponsorBlockDataAttribution', 'SponsorBlock data');
                const title = t('sponsorBlockDataAttributionTitle', 'SponsorBlock API and database data, licensed CC BY-NC-SA 4.0');
                link.className = 'ytkit-dearrow-attribution';
                link.href = 'https://sponsor.ajay.app/';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = label;
                link.title = title;
                link.setAttribute('aria-label', title);
                link.dataset.ytkitLicense = 'CC BY-NC-SA 4.0';
                link.addEventListener('click', event => event.stopPropagation());
                return link;
            },
            _ensureAttribution(outputEl) {
                if (!outputEl) return null;
                const owner = outputEl.closest?.(
                    'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, '
                    + 'ytd-grid-video-renderer, ytd-watch-metadata'
                ) || outputEl.parentElement;
                if (!owner) return null;
                const existing = owner.querySelector?.('.ytkit-dearrow-attribution');
                if (existing) return existing;
                const titleEl = outputEl.matches?.('[data-ytkit-dearrow-title]')
                    ? outputEl
                    : owner.querySelector?.('[data-ytkit-dearrow-title], #video-title, #video-title-link');
                const placement = titleEl?.closest?.('h1, h3') || titleEl || outputEl;
                if (!placement.parentNode) return null;
                const link = this._createAttribution();
                placement.parentNode.insertBefore(link, placement.nextSibling || null);
                return link;
            },
            _renderTitle(titleEl, formatted, { fallback = false, uuid = '', announce = false } = {}) {
                if (!titleEl || !formatted) return false;
                const originalTitle = titleEl.textContent.trim();
                const clone = titleEl.cloneNode(false);
                clone.className = `daCustomTitle${fallback ? ' da-formatted-title' : ''} ${titleEl.className}`;
                clone.removeAttribute('id');
                clone.textContent = formatted;
                clone.title = appState.settings.daShowOriginalHover ? originalTitle : formatted;
                clone.setAttribute('data-ytkit-dearrow-title', '1');
                clone.setAttribute('data-ytkit-orig-title', originalTitle);
                if (uuid) clone.setAttribute('data-ytkit-dearrow-uuid', uuid);
                if (fallback) clone.dataset.daFallback = '1';
                if (appState.settings.daShowOriginalTitle) {
                    clone.dataset.daTogether = '1';
                    if (!titleEl.hasAttribute('data-da-original-display')) {
                        titleEl.setAttribute('data-da-original-display', titleEl.style.display || '');
                    }
                    titleEl.classList.add('daOriginalTitle');
                    titleEl.setAttribute('data-da-original-title', '1');
                    titleEl.style.display = '';
                } else {
                    titleEl.style.display = 'none';
                }
                titleEl.dataset.daProcessed = '1';
                titleEl.parentNode.insertBefore(clone, titleEl);
                if (!fallback) this._ensureAttribution(clone);
                if (announce) {
                    try { announceA11y(`Title replaced by DeArrow: ${formatted}`); } catch (_) { /* reason: optional accessibility announcement must not interrupt title rendering. */ }
                }
                return true;
            },
            _channelOverrideMode(el) {
                const overrides = appState?.settings?.deArrowChannelOverrides;
                if (!overrides || typeof overrides !== 'object') return null;
                const link = el?.querySelector?.('a[href*="/channel/"], a[href*="/@"]');
                if (!link) return null;
                const href = link.getAttribute('href') || '';
                const channelId = globalThis.YTKitCore?.channelSettingsKey?.(href) || '';
                if (!channelId) return null;
                const entry = overrides[channelId];
                return entry && typeof entry === 'object' ? entry.mode || null : null;
            },
            // Which surface a card is on, and whether DeArrow is wanted there.
            //
            // DeArrow processed every renderer in the document, so a user who
            // only wanted it on the home feed still paid for a fetch per card
            // on playlists, search and the watch sidebar. The upstream project
            // has been asked for exactly this twice (DeArrow #92 and #423).
            //
            // Attribution is structural: YouTube marks a browse page with
            // page-subtype and gives each surface its own container element.
            // Nothing here matches a generated class.
            _SURFACE_MASKS: Object.freeze({
                watch: 'daSurfaceWatch',
                related: 'daSurfaceRelated',
                home: 'daSurfaceHome',
                search: 'daSurfaceSearch',
                subscriptions: 'daSurfaceSubscriptions',
                playlist: 'daSurfacePlaylist'
            }),

            _surfaceOf(element) {
                if (!element?.closest) return '';
                // The watch sidebar and the playlist panel beside the player
                // are checked first: both live inside a watch page, so a
                // page-level test would call them "watch".
                if (element.closest('ytd-watch-next-secondary-results-renderer')) return 'related';
                if (element.closest('ytd-playlist-panel-renderer, ytd-playlist-video-list-renderer')) return 'playlist';
                if (element.closest('ytd-search')) return 'search';
                const browse = element.closest('ytd-browse');
                if (browse?.getAttribute) {
                    const subtype = browse.getAttribute('page-subtype') || '';
                    if (subtype === 'home') return 'home';
                    if (subtype === 'subscriptions') return 'subscriptions';
                    if (subtype === 'playlist') return 'playlist';
                }
                if (typeof isWatchPagePath === 'function' && isWatchPagePath()) return 'watch';
                return '';
            },

            // An unrecognised surface stays enabled. A mask is a way to switch
            // something off deliberately, not a way for a YouTube redesign to
            // switch DeArrow off silently.
            _surfaceEnabled(surface) {
                const key = this._SURFACE_MASKS[surface];
                if (!key) return true;
                return appState.settings?.[key] !== false;
            },

            _currentPageSurfaces() {
                if (isWatchPagePath()) return ['watch', 'related', 'playlist'];
                if (document.querySelector?.('ytd-search')) return ['search'];

                const browse = document.querySelector?.('ytd-browse[page-subtype], ytd-browse');
                const subtype = browse?.getAttribute?.('page-subtype') || '';
                if (subtype === 'home') return ['home'];
                if (subtype === 'subscriptions') return ['subscriptions'];
                if (subtype === 'playlist') return ['playlist'];

                // The pathname closes the short gap before Polymer stamps the
                // page host. Unknown routes stay enabled so a YouTube redesign
                // cannot silently disable DeArrow everywhere.
                const pathname = globalThis.location?.pathname || '';
                if (pathname === '/') return ['home'];
                if (pathname.startsWith('/results')) return ['search'];
                if (pathname.startsWith('/feed/subscriptions')) return ['subscriptions'];
                if (pathname.startsWith('/playlist')) return ['playlist'];
                return Object.keys(this._SURFACE_MASKS);
            },

            // Is any surface DeArrow could act on here still switched on? When
            // none is, the observer is never attached: an excluded surface must
            // cost nothing, not merely skip its fetches.
            _anySurfaceEnabledHere() {
                return this._currentPageSurfaces()
                    .some((surface) => this._surfaceEnabled(surface));
            },

            async _processPage() {
                if (!this._anySurfaceEnabledHere()) return;
                const gen = this._generation;
                const route = this._routeToken;
                const replaceTitles = appState.settings.daReplaceTitles;
                const replaceThumbs = appState.settings.daReplaceThumbs;
                const format = appState.settings.daTitleFormat || 'sentence';
                const fallback = appState.settings.daFallbackFormat;
                const renderers = document.querySelectorAll('ytd-rich-item-renderer:not([data-da-processed]), ytd-video-renderer:not([data-da-processed]), ytd-compact-video-renderer:not([data-da-processed]), ytd-grid-video-renderer:not([data-da-processed])');
                for (const el of renderers) {
                    if (gen !== this._generation || route !== this._routeToken) return;
                    el.dataset.daProcessed = '1';
                    const link = el.querySelector('a#thumbnail[href*="/watch"], a#video-title-link[href*="/watch"], a[href*="/watch"]');
                    if (!link) continue;
                    const url = new URL(link.href, location.origin);
                    const videoId = url.searchParams.get('v');
                    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) continue;
                    // v3.28 deferred → v4.0+: honor per-channel override.
                    // 'off'      → skip title + thumb replacement entirely for this card
                    // 'original' → also skip (channel author wants original metadata)
                    // 'dearrow'  → fall through to normal DeArrow path
                    // Before the fetch, not after: an excluded surface must
                    // cost no request, which is the whole reason to exclude one.
                    const surface = this._surfaceOf(el);
                    if (!this._surfaceEnabled(surface)) {
                        el.dataset.daSurfaceSkipped = surface;
                        continue;
                    }
                    const overrideMode = this._channelOverrideMode(el);
                    if (overrideMode === 'off' || overrideMode === 'original') {
                        el.dataset.daOverride = overrideMode;
                        continue;
                    }
                    const branding = await this._fetchBranding(videoId);
                    if (!branding || gen !== this._generation || route !== this._routeToken) continue;
                    if (replaceTitles) {
                        const titleEl = el.querySelector('#video-title, #video-title-link');
                        if (titleEl) {
                            const submission = branding.titles?.[0];
                            const casualMode = appState.settings.deArrowCasualMode;
                            if (submission?.title) {
                                const formatted = this._formatTitle(submission.title, format);
                                this._renderTitle(titleEl, formatted, {
                                    uuid: submission.UUID || '',
                                    announce: isWatchPagePath() && titleEl.closest('ytd-watch-metadata, #title.ytd-watch-metadata')
                                });
                            } else if (fallback && !casualMode) {
                                const original = titleEl.textContent.trim();
                                const formatted = this._formatTitle(original, format);
                                if (formatted !== original) {
                                    this._renderTitle(titleEl, formatted, { fallback: true });
                                }
                            }
                        }
                    }
                    if (replaceThumbs) {
                        const thumb = branding.thumbnails?.[0];
                        // The timestamp is remote data going straight into a URL:
                        // a non-numeric value injected extra query parameters or
                        // stringified to "[object Object]".
                        const stamp = Number(thumb?.timestamp);
                        if (Number.isFinite(stamp) && stamp >= 0) {
                            const img = el.querySelector('img.yt-core-image, ytd-thumbnail img, #thumbnail img');
                            if (img && !img.src) {
                                // Lazy img not hydrated yet — let the next
                                // pass replace it once the original src
                                // exists so error/destroy restores work.
                                delete el.dataset.daProcessed;
                            } else if (img && !img.classList.contains('da-replaced-thumb')) {
                                img.dataset.daOrigSrc = img.src;
                                img.src = `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${encodeURIComponent(videoId)}&time=${stamp}`;
                                img.classList.add('da-replaced-thumb');
                                const attribution = this._ensureAttribution(img);
                                img.onerror = () => {
                                    if (img.dataset.daOrigSrc) img.src = img.dataset.daOrigSrc;
                                    if (!el.querySelector('.daCustomTitle:not([data-da-fallback="1"])')) attribution?.remove();
                                };
                            }
                        }
                    }
                }
                if (isWatchPagePath() && this._surfaceEnabled('watch') && replaceTitles) {
                    const titleEl = document.querySelector(this._WATCH_TITLE_SELECTORS);
                    const videoId = getVideoId();
                    if (titleEl && videoId && VIDEO_ID_PATTERN.test(videoId) && !titleEl.dataset.daProcessed) {
                        const branding = await this._fetchBranding(videoId);
                        if (branding && gen === this._generation && route === this._routeToken) {
                            const submission = branding.titles?.[0];
                            const casualMode = appState.settings.deArrowCasualMode;
                            if (submission?.title) {
                                this._renderTitle(titleEl, this._formatTitle(submission.title, format), {
                                    uuid: submission.UUID || '',
                                    announce: true
                                });
                            } else if (fallback && !casualMode) {
                                const original = titleEl.textContent.trim();
                                const formatted = this._formatTitle(original, format);
                                if (formatted !== original) this._renderTitle(titleEl, formatted, { fallback: true });
                            }
                        }
                    }
                }
            },
            destroy() {
                this._generation++;
                clearTimeout(this._processTimer);
                this._processTimer = null;
                clearTimeout(this._resetTimer);
                this._resetTimer = null;
                clearTimeout(this._persistTimer);
                this._persistTimer = null;
                this._cache = {};
                this._cacheMeta = {};
                this._pending = {};
                removeNavigateRule(this._navRuleId);
                this._observer?.disconnect();
                this._observing = false;
                this._styleEl?.remove();
                document.querySelectorAll('.daCustomTitle').forEach(c => c.remove());
                document.querySelectorAll('.ytkit-dearrow-attribution').forEach(c => c.remove());
                document.querySelectorAll('[data-da-processed]').forEach(el => {
                    const originalDisplay = el.getAttribute('data-da-original-display');
                    el.style.display = originalDisplay === null ? '' : originalDisplay;
                    el.removeAttribute('data-da-original-display');
                    el.classList.remove('daOriginalTitle');
                    el.removeAttribute('data-da-original-title');
                    delete el.dataset.daProcessed;
                    delete el.dataset.daSurfaceSkipped;
                });
                document.querySelectorAll('.da-replaced-thumb').forEach(el => {
                    if (el.dataset.daOrigSrc) { el.src = el.dataset.daOrigSrc; delete el.dataset.daOrigSrc; }
                    el.classList.remove('da-replaced-thumb');
                });
            }
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createDeArrowFeature = createDeArrowFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createDeArrowFeature };
    }
})();
