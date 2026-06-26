(() => {
    'use strict';

    // extension/features/dearrow/index.js
    //
    // Monolith peel for DeArrow. The module owns the primary
    // deArrow runtime/state object; ytkit.js keeps the inline object
    // as a compatibility fallback and delegates to the factory when present.

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
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            announceA11y = () => {},
            PageTypes = { WATCH: 'watch' }
        } = deps;

        return {
            id: 'deArrow',
            name: 'DeArrow',
            description: 'Replace clickbait titles and thumbnails with crowdsourced alternatives from the DeArrow database',
            group: 'Content',
            icon: 'type',
            isParent: true,
            _cache: {},
            _cacheMeta: {},
            _pending: {},
            _observer: null,
            _navRuleId: 'deArrowNav',
            _generation: 0,
            _processTimer: null,
            _resetTimer: null,
            _TITLE_SELECTORS: '#video-title, #video-title-link, h3.ytd-rich-grid-media a#video-title-link',
            _WATCH_TITLE_SELECTORS: 'ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata h1 yt-formatted-string',
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
                    .daCustomTitle + [id="video-title"], .daCustomTitle + a#video-title-link { display: none !important; }
                    /* v4.47.0 EI-NEW4: locally-formatted fallback titles
                       (sentence/title-case applied when DeArrow has no
                       submission) dim slightly so power users see the
                       distinction from real DeArrow data. */
                    .daCustomTitle[data-da-fallback="1"] { opacity: 0.78 !important; }
                `;
                this._styleEl = injectStyle(css, this.id, true);
                const resetAndProcess = () => {
                    self._generation++;
                    clearTimeout(self._processTimer);
                    clearTimeout(self._resetTimer);
                    document.querySelectorAll('.daCustomTitle').forEach(c => c.remove());
                    document.querySelectorAll('[data-da-processed]').forEach(el => {
                        delete el.dataset.daProcessed;
                        el.style.display = '';
                    });
                    document.querySelectorAll('.da-replaced-thumb').forEach(el => {
                        if (el.dataset.daOrigSrc) { el.src = el.dataset.daOrigSrc; delete el.dataset.daOrigSrc; }
                        el.classList.remove('da-replaced-thumb');
                    });
                    if (!isWatchPagePath()) {
                        self._resetTimer = setTimeout(() => {
                            self._resetTimer = null;
                            self._processPage();
                        }, 1000);
                    }
                };
                addNavigateRule(this._navRuleId, resetAndProcess);
                this._observer = new MutationObserver(() => {
                    if (isWatchPagePath()) return;
                    clearTimeout(self._processTimer);
                    self._processTimer = setTimeout(() => self._processPage(), 300);
                });
                this._observer.observe(document.body, { childList: true, subtree: true });
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
                try {
                    const { data } = await extensionFetchJson({
                        method: 'GET',
                        url: `https://sponsor.ajay.app/api/branding?videoID=${videoId}`,
                        timeout: 8000,
                    });
                    if (!data || typeof data !== 'object' || Array.isArray(data)) {
                        const payloadError = new Error('invalid DeArrow branding payload');
                        ExternalApiHealth?.recordFailure?.('deArrow', payloadError, {
                            errorClass: 'invalid-payload',
                            endpoint: 'branding',
                            cacheState: 'miss'
                        });
                        DiagnosticLog?.record?.('deArrow', `branding payload invalid for ${videoId}`);
                        return null;
                    }
                    data._ts = Date.now();
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
                        source: 'network',
                        cacheState: 'refreshed',
                        endpoint: 'branding'
                    });
                    return data;
                } catch (error) {
                    ExternalApiHealth?.recordFailure?.('deArrow', error, {
                        endpoint: 'branding',
                        cacheState: 'miss'
                    });
                    DiagnosticLog?.record?.('deArrow', `branding fetch failed for ${videoId}: ${error?.message || 'unknown error'}`);
                    return null;
                }
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
            _channelOverrideMode(el) {
                const overrides = appState?.settings?.deArrowChannelOverrides;
                if (!overrides || typeof overrides !== 'object') return null;
                const link = el?.querySelector?.('a[href*="/channel/"], a[href*="/@"]');
                if (!link) return null;
                const href = link.getAttribute('href') || '';
                const idMatch = href.match(/\/channel\/([A-Za-z0-9_-]+)/);
                const channelId = idMatch ? idMatch[1] : (href.match(/^\/@([A-Za-z0-9._-]+)/)?.[0] || '');
                if (!channelId) return null;
                const entry = overrides[channelId];
                return entry && typeof entry === 'object' ? entry.mode || null : null;
            },
            async _processPage() {
                const gen = this._generation;
                const replaceTitles = appState.settings.daReplaceTitles;
                const replaceThumbs = appState.settings.daReplaceThumbs;
                const format = appState.settings.daTitleFormat || 'sentence';
                const fallback = appState.settings.daFallbackFormat;
                const renderers = document.querySelectorAll('ytd-rich-item-renderer:not([data-da-processed]), ytd-video-renderer:not([data-da-processed]), ytd-compact-video-renderer:not([data-da-processed]), ytd-grid-video-renderer:not([data-da-processed])');
                for (const el of renderers) {
                    if (gen !== this._generation) return;
                    el.dataset.daProcessed = '1';
                    const link = el.querySelector('a#thumbnail[href*="/watch"], a#video-title-link[href*="/watch"], a[href*="/watch"]');
                    if (!link) continue;
                    const url = new URL(link.href, location.origin);
                    const videoId = url.searchParams.get('v');
                    if (!videoId) continue;
                    // v3.28 deferred → v4.0+: honor per-channel override.
                    // 'off'      → skip title + thumb replacement entirely for this card
                    // 'original' → also skip (channel author wants original metadata)
                    // 'dearrow'  → fall through to normal DeArrow path
                    const overrideMode = this._channelOverrideMode(el);
                    if (overrideMode === 'off' || overrideMode === 'original') {
                        el.dataset.daOverride = overrideMode;
                        continue;
                    }
                    const branding = await this._fetchBranding(videoId);
                    if (!branding || gen !== this._generation) continue;
                    if (replaceTitles) {
                        const titleEl = el.querySelector('#video-title, #video-title-link');
                        if (titleEl) {
                            const submission = branding.titles?.[0];
                            const casualMode = appState.settings.deArrowCasualMode;
                            if (submission?.title) {
                                const formatted = this._formatTitle(submission.title, format);
                                const clone = titleEl.cloneNode(false);
                                clone.className = 'daCustomTitle ' + titleEl.className;
                                clone.removeAttribute('id');
                                clone.textContent = formatted;
                                clone.title = appState.settings.daShowOriginalHover ? titleEl.textContent.trim() : formatted;
                                titleEl.style.display = 'none';
                                titleEl.dataset.daProcessed = '1';
                                titleEl.parentNode.insertBefore(clone, titleEl);
                                try {
                                    if (isWatchPagePath() && titleEl.closest('ytd-watch-metadata, #title.ytd-watch-metadata')) {
                                        announceA11y(`Title replaced by DeArrow: ${formatted}`);
                                    }
                                } catch (_) {
                                    // reason: a11y announce is best-effort
                                }
                            } else if (fallback && !casualMode) {
                                const original = titleEl.textContent.trim();
                                const formatted = this._formatTitle(original, format);
                                if (formatted !== original) {
                                    const clone = titleEl.cloneNode(false);
                                    clone.className = 'daCustomTitle da-formatted-title ' + titleEl.className;
                                    clone.removeAttribute('id');
                                    clone.textContent = formatted;
                                    clone.title = formatted;
                                    // v4.47.0 EI-NEW4: mark locally-formatted
                                    // fallbacks distinct from real DeArrow
                                    // submissions; the CSS rule at init time
                                    // dims these slightly so power users can
                                    // tell the difference at a glance.
                                    clone.dataset.daFallback = '1';
                                    titleEl.style.display = 'none';
                                    titleEl.dataset.daProcessed = '1';
                                    titleEl.parentNode.insertBefore(clone, titleEl);
                                }
                            }
                        }
                    }
                    if (replaceThumbs) {
                        const thumb = branding.thumbnails?.[0];
                        if (thumb?.timestamp !== undefined) {
                            const img = el.querySelector('img.yt-core-image, ytd-thumbnail img, #thumbnail img');
                            if (img && !img.classList.contains('da-replaced-thumb')) {
                                img.dataset.daOrigSrc = img.src;
                                img.src = `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${videoId}&time=${thumb.timestamp}`;
                                img.classList.add('da-replaced-thumb');
                                img.onerror = () => { if (img.dataset.daOrigSrc) img.src = img.dataset.daOrigSrc; };
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
                this._styleEl?.remove();
                document.querySelectorAll('.daCustomTitle').forEach(c => c.remove());
                document.querySelectorAll('[data-da-processed]').forEach(el => { delete el.dataset.daProcessed; el.style.display = ''; });
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
