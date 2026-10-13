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

    const DEARROW_THUMB_API = 'https://dearrow-thumb.ajay.app/api/v1/getThumbnail';
    // YouTube's auto-generated stills, which upstream calls start, middle
    // and end (checked on a same-day upload 2026-10-12).
    const YOUTUBE_STILLS = Object.freeze({ start: 'hq1', middle: 'hq2', end: 'hq3' });

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
            _lastRouteHref: null,
            _processTimer: null,
            _resetTimer: null,
            // Card hosts. Home, Subscriptions and channel grids wrap a
            // yt-lockup-view-model in ytd-rich-item-renderer, and search and
            // the watch sidebar render bare lockups. The outer host owns a
            // card (Video Hider's rule), so a nested match is skipped.
            _CARD_SELECTORS: 'ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer',
            // Lockups have no #video-title. A drawn replacement keeps the
            // original's classes, so it is excluded by name.
            _TITLE_SELECTORS: '#video-title:not(.daCustomTitle), #video-title-link:not(.daCustomTitle), a.ytLockupMetadataViewModelTitle:not(.daCustomTitle)',
            _WATCH_TITLE_SELECTORS: 'ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string:not(.daCustomTitle), ytd-watch-metadata h1 yt-formatted-string:not(.daCustomTitle)',
            // Scoped to the thumbnail, which keeps the channel avatar out.
            _CARD_THUMB_SELECTORS: 'yt-thumbnail-view-model img, ytd-thumbnail img, #thumbnail img',
            _DURATION_BADGE_SELECTORS: 'yt-thumbnail-view-model .ytBadgeShapeText, ytd-thumbnail .ytBadgeShapeText, ytd-thumbnail .badge-shape-wiz__text',
            _FETCH_LANES: 6,
            _watchTimer: null,
            _docTitle: null,
            _coverWatchers: new Set(),
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
                    .daCustomTitle:not([data-da-together="1"]) + [id="video-title"], .daCustomTitle:not([data-da-together="1"]) + a#video-title-link, .daCustomTitle:not([data-da-together="1"]) + a.ytLockupMetadataViewModelTitle { display: none !important; }
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
                `;
                this._styleEl = injectStyle(css, this.id, true);
                const resetAndProcess = () => {
                    // Navigate rules also run on same-URL page-data updates,
                    // which YouTube fires on every feed append. Treating those
                    // as a new page put every title back to the original for a
                    // second and redid the whole feed on each scroll. Same URL:
                    // keep finished cards, restart only reused ones.
                    const href = typeof location !== 'undefined' ? location.href : '';
                    if (self._lastRouteHref !== null && href === self._lastRouteHref) {
                        self._resetReusedCards();
                        clearTimeout(self._processTimer);
                        self._processTimer = setTimeout(() => self._processPage(), 300);
                        return;
                    }
                    self._lastRouteHref = href;
                    self._routeToken++;
                    clearTimeout(self._processTimer);
                    clearTimeout(self._resetTimer);
                    self._resetCard(document);
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
                    self._syncWatchTimer();
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
                this._syncWatchTimer();
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
                // DeArrow marks a word ">Word" to keep its casing, anywhere in
                // the title. Marked words skip the case pass, then every marker
                // is dropped the way upstream's cleanResultingTitle does.
                const keep = (w) => w.startsWith('>');
                const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
                let words = title.split(' ');
                if (format === 'sentence') {
                    words = words.map((w, i) => keep(w) ? w : i === 0 ? capitalize(w) : w.toLowerCase());
                } else if (format === 'title_case') {
                    const lower = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is','it']);
                    words = words.map((w, i) => keep(w) ? w : i === 0 || !lower.has(w.toLowerCase()) ? capitalize(w) : w.toLowerCase());
                }
                return words.join(' ').replace(/(^|\s)>(\S)/g, '$1$2');
            },
            // The top thumbnail's frame time, or null to keep the creator's.
            // A vote for the original carries timestamp null, and Number(null)
            // is 0, which put the video's first frame on the card. The API
            // docs also say to skip a first entry that is unlocked with a
            // negative score.
            _submittedThumbnailTime(branding) {
                const thumb = branding?.thumbnails?.[0];
                if (!thumb || thumb.original || thumb.timestamp === null || thumb.timestamp === undefined) return null;
                if (!thumb.locked && Number(thumb.votes) < 0) return null;
                // Remote data going straight into a URL: a non-numeric value
                // injected extra query parameters or became "[object Object]".
                const stamp = Number(thumb.timestamp);
                return Number.isFinite(stamp) && stamp >= 0 ? stamp : null;
            },
            _renderTitle(titleEl, formatted, { fallback = false, uuid = '', announce = false } = {}) {
                if (!titleEl || !formatted) return false;
                const originalTitle = titleEl.textContent.trim();
                // A cloned yt-formatted-string is upgraded by YouTube's own
                // definition on insertion, which renders its (empty) text
                // property over whatever was set here: the watch heading
                // went blank. A plain span under the h1 inherits its type,
                // which is what DeArrow itself draws there.
                const clone = String(titleEl.tagName || '').includes('-')
                    ? document.createElement('span')
                    : titleEl.cloneNode(false);
                clone.className = `daCustomTitle${fallback ? ' da-formatted-title' : ''} ${titleEl.className}`;
                clone.removeAttribute('id');
                // A lockup title carries its typography on one inner span.
                const only = titleEl.children?.length === 1 ? titleEl.children[0] : null;
                if (only?.tagName === 'SPAN') {
                    const inner = only.cloneNode(false);
                    inner.textContent = formatted;
                    clone.append(inner);
                } else {
                    clone.textContent = formatted;
                }
                // The copied label would read the clickbait to a screen reader.
                const label = clone.getAttribute('aria-label');
                if (label && originalTitle && label.includes(originalTitle)) {
                    clone.setAttribute('aria-label', label.replace(originalTitle, () => formatted));
                }
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
                // One DeArrow title per original: a replacement drawn earlier
                // is swapped, never stacked.
                const prior = titleEl.previousElementSibling;
                if (prior?.getAttribute?.('data-ytkit-dearrow-title') === '1') prior.remove();
                titleEl.parentNode.insertBefore(clone, titleEl);
                if (announce) {
                    const message = t('deArrowTitleReplacedTpl', 'Title replaced by DeArrow: {title}').replace('{title}', () => formatted);
                    try { announceA11y(message); } catch (_) { /* reason: optional accessibility announcement must not interrupt title rendering. */ }
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
                const unprocessed = this._CARD_SELECTORS.split(',')
                    .map((selector) => `${selector.trim()}:not([data-da-processed])`)
                    .join(', ');
                const queued = [];
                for (const el of document.querySelectorAll(unprocessed)) {
                    // The list is a snapshot. Another pass started while this
                    // one awaited a fetch may already own this card, and taking
                    // it again stacked a second DeArrow title on it.
                    if (el.dataset.daProcessed) continue;
                    if (this._isNestedCard(el)) {
                        el.dataset.daProcessed = 'nested';
                        continue;
                    }
                    el.dataset.daProcessed = '1';
                    const videoId = this._cardVideoId(el);
                    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) continue;
                    // A playlist or mix links its first video, and that
                    // video's title and frames are not the collection's.
                    if (this._isCollectionCard(el)) continue;
                    el.dataset.daVideoId = videoId;
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
                    queued.push({ el, videoId });
                }
                // One card at a time left a 30-card page two thirds untouched
                // twenty seconds in. A few lanes run side by side; the
                // in-flight map in _fetchBranding still collapses repeats.
                let next = 0;
                const lane = async () => {
                    while (next < queued.length) {
                        const { el, videoId } = queued[next++];
                        await this._applyCard(el, videoId, gen, route);
                    }
                };
                await Promise.all(Array.from({ length: Math.min(this._FETCH_LANES, queued.length) }, lane));
                if (gen !== this._generation || route !== this._routeToken) return;
                await this._processWatchTitle(gen, route);
            },
            async _applyCard(el, videoId, gen, route) {
                const branding = await this._fetchBranding(videoId);
                if (!branding || gen !== this._generation || route !== this._routeToken) return;
                if (appState.settings.daReplaceTitles) {
                    const titleEl = el.querySelector(this._TITLE_SELECTORS);
                    if (titleEl) this._applyTitle(titleEl, branding);
                }
                if (appState.settings.daReplaceThumbs) this._applyThumbnail(el, videoId, branding);
            },
            // Draws the trusted crowd title, or the original run through the
            // formatter. Returns whether anything was drawn.
            _applyTitle(titleEl, branding, { announce = false } = {}) {
                const format = appState.settings.daTitleFormat || 'sentence';
                const submission = branding.titles?.[0];
                if (submission?.title && (submission.locked || !(Number(submission.votes) < 0))) {
                    return this._renderTitle(titleEl, this._formatTitle(submission.title, format), {
                        uuid: submission.UUID || '',
                        announce
                    });
                }
                if (!appState.settings.daFallbackFormat || appState.settings.deArrowCasualMode) return false;
                const original = titleEl.textContent.trim();
                const formatted = this._formatTitle(original, format);
                return formatted !== original && this._renderTitle(titleEl, formatted, { fallback: true });
            },
            async _processWatchTitle(gen, route) {
                if (!isWatchPagePath() || !this._surfaceEnabled('watch') || !appState.settings.daReplaceTitles) return;
                const titleEl = document.querySelector(this._WATCH_TITLE_SELECTORS);
                const videoId = getVideoId();
                if (!titleEl || !videoId || !VIDEO_ID_PATTERN.test(videoId)) return;
                if (titleEl.dataset.daProcessed) {
                    this._syncDocumentTitle();
                    return;
                }
                // Taken before the fetch, so the timed watch pass never
                // starts a second lookup for the same heading.
                titleEl.dataset.daProcessed = '1';
                const branding = await this._fetchBranding(videoId);
                if (!branding || gen !== this._generation || route !== this._routeToken) return;
                if (this._applyTitle(titleEl, branding, { announce: true })) this._syncDocumentTitle();
            },
            // The tab title kept the clickbait the heading no longer shows.
            // YouTube rewrites document.title on its own schedule, so the
            // timed watch pass puts the replacement back each time.
            _syncDocumentTitle() {
                const shown = document.querySelector?.('ytd-watch-metadata [data-ytkit-dearrow-title]');
                const original = shown?.getAttribute?.('data-ytkit-orig-title');
                const replacement = shown?.textContent;
                const current = typeof document.title === 'string' ? document.title : '';
                if (!original || !replacement || original === replacement || !current.includes(original)) return;
                const next = current.replace(original, () => replacement);
                this._docTitle = { original: current, replaced: next };
                document.title = next;
            },
            // The watch page has no body observer (player and comment churn),
            // and its heading renders late while the sidebar loads in
            // batches, so a light timed pass covers both while it's open.
            _syncWatchTimer() {
                const wanted = isWatchPagePath() && this._anySurfaceEnabledHere();
                if (wanted && !this._watchTimer) {
                    this._watchTimer = setInterval(() => this._processPage(), 2500);
                } else if (!wanted && this._watchTimer) {
                    clearInterval(this._watchTimer);
                    this._watchTimer = null;
                }
            },
            _applyThumbnail(el, videoId, branding) {
                const img = el.querySelector(this._CARD_THUMB_SELECTORS);
                if (!img || img.classList.contains('da-replaced-thumb')) return;
                const stamp = this._submittedThumbnailTime(branding);
                const url = stamp !== null
                    ? `${DEARROW_THUMB_API}?videoID=${encodeURIComponent(videoId)}&time=${stamp}`
                    : this._keepsOriginalThumbnail(branding) ? null : this._fallbackThumbnailUrl(el, videoId);
                if (!url) return;
                if (!img.src) {
                    // An off-screen cover YouTube hasn't loaded yet. Swapping
                    // it now would leave error/destroy nothing to restore, and
                    // reprocessing the card redrew its title, which woke the
                    // observer, which reprocessed it again every 300 ms.
                    this._waitForCover(el, img, videoId, branding);
                    return;
                }
                img.dataset.daOrigSrc = img.src;
                img.src = url;
                img.classList.add('da-replaced-thumb');
                img.onerror = () => {
                    if (img.dataset.daOrigSrc) img.src = img.dataset.daOrigSrc;
                };
            },
            _waitForCover(el, img, videoId, branding) {
                if (typeof MutationObserver !== 'function' || img.dataset.daWaiting) return;
                img.dataset.daWaiting = '1';
                const gen = this._generation;
                const route = this._routeToken;
                const watcher = new MutationObserver(() => {
                    if (!img.src) return;
                    watcher.disconnect();
                    this._coverWatchers.delete(watcher);
                    delete img.dataset.daWaiting;
                    if (gen !== this._generation || route !== this._routeToken || el.dataset.daVideoId !== videoId) return;
                    this._applyThumbnail(el, videoId, branding);
                });
                watcher.observe(img, { attributes: true, attributeFilter: ['src'] });
                this._coverWatchers.add(watcher);
            },
            // Voters picked the creator's own thumbnail, so no frame replaces it.
            _keepsOriginalThumbnail(branding) {
                const thumb = branding?.thumbnails?.[0];
                return !!thumb?.original && (!!thumb.locked || !(Number(thumb.votes) < 0));
            },
            // A cover for a video nobody submitted a thumbnail for. DeArrow's
            // own default is a frame from a random time the server picks;
            // asked without a time, the thumbnail cache returns that frame
            // when any DeArrow user has seen the video and otherwise
            // redirects to redirectUrl without queueing a render, so this
            // only ever reads upstream's cache. YouTube's own stills near
            // the start, middle and end (hq1/hq2/hq3, upstream's
            // "auto-generated" choice) are that redirect and the other modes.
            _fallbackThumbnailUrl(el, videoId) {
                const mode = appState.settings.daThumbFallback || 'random';
                if (mode === 'original' || !this._cardHasDuration(el)) return null;
                const still = `https://i.ytimg.com/vi_webp/${encodeURIComponent(videoId)}/${YOUTUBE_STILLS[mode] || YOUTUBE_STILLS.start}.webp`;
                if (mode !== 'random') return still;
                return `${DEARROW_THUMB_API}?videoID=${encodeURIComponent(videoId)}&redirectUrl=${encodeURIComponent(still)}`;
            },
            // Live streams, premieres and upcoming videos carry a badge with
            // no running time, and keep their cover. Digits and colons read
            // the same in every interface language.
            _cardHasDuration(el) {
                const badges = el.querySelectorAll?.(this._DURATION_BADGE_SELECTORS) || [];
                return Array.from(badges).some((badge) => /^\d{1,4}(?::\d{2}){1,2}$/.test((badge.textContent || '').trim()));
            },
            _isNestedCard(el) {
                return !!el.parentElement?.closest?.(this._CARD_SELECTORS);
            },
            _isCollectionCard(el) {
                return !!el.querySelector?.('yt-collection-thumbnail-view-model, [class*="CollectionThumbnailViewModel"], a[href*="/playlist?list="], a[href*="start_radio=1"]');
            },
            destroy() {
                this._generation++;
                clearTimeout(this._processTimer);
                this._processTimer = null;
                clearTimeout(this._resetTimer);
                this._resetTimer = null;
                clearTimeout(this._persistTimer);
                this._persistTimer = null;
                clearInterval(this._watchTimer);
                this._watchTimer = null;
                this._cache = {};
                this._cacheMeta = {};
                this._pending = {};
                removeNavigateRule(this._navRuleId);
                this._observer?.disconnect();
                this._observing = false;
                this._styleEl?.remove();
                this._lastRouteHref = null;
                this._resetCard(document);
            },
            // Undo DeArrow's work under root: the whole document on a route
            // change or teardown, or one card YouTube reused for another video.
            _resetCard(root) {
                // .ytkit-dearrow-attribution: the per-card credit badge builds
                // before v4.99.2 drew; swept so a reload leaves none behind.
                root.querySelectorAll('.daCustomTitle, .ytkit-dearrow-attribution').forEach(c => c.remove());
                const flagged = [...root.querySelectorAll('[data-da-processed]')];
                if (root.dataset?.daProcessed !== undefined) flagged.push(root);
                for (const el of flagged) {
                    const originalDisplay = el.getAttribute('data-da-original-display');
                    el.style.display = originalDisplay === null ? '' : originalDisplay;
                    el.removeAttribute('data-da-original-display');
                    el.classList.remove('daOriginalTitle');
                    el.removeAttribute('data-da-original-title');
                    delete el.dataset.daProcessed;
                    delete el.dataset.daSurfaceSkipped;
                    delete el.dataset.daVideoId;
                }
                root.querySelectorAll('.da-replaced-thumb').forEach(el => {
                    if (el.dataset.daOrigSrc) { el.src = el.dataset.daOrigSrc; delete el.dataset.daOrigSrc; }
                    el.classList.remove('da-replaced-thumb');
                });
                root.querySelectorAll('img[data-da-waiting]').forEach(el => { delete el.dataset.daWaiting; });
                if (root !== document) return;
                for (const watcher of this._coverWatchers) watcher.disconnect();
                this._coverWatchers.clear();
                if (this._docTitle) {
                    if (document.title === this._docTitle.replaced) document.title = this._docTitle.original;
                    this._docTitle = null;
                }
            },
            _cardVideoId(el) {
                const link = el.querySelector('a#thumbnail[href*="/watch"], a#video-title-link[href*="/watch"], a[href*="/watch"]');
                if (!link) return null;
                try {
                    return new URL(link.href, location.origin).searchParams.get('v');
                } catch (_) {
                    return null; // reason: a malformed href is not a video card.
                }
            },
            // YouTube can reuse a renderer for another video without a route
            // change; that card kept the old video's title and thumbnail.
            _resetReusedCards() {
                for (const card of document.querySelectorAll('[data-da-video-id]')) {
                    if (this._cardVideoId(card) !== card.dataset.daVideoId) this._resetCard(card);
                }
            }
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createDeArrowFeature = createDeArrowFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createDeArrowFeature };
    }
})();
