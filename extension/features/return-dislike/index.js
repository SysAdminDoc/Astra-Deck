(() => {
    'use strict';

    // extension/features/return-dislike/index.js
    //
    // Monolith peel for Return YouTube Dislike. The module owns the primary
    // returnDislike runtime/state object; ytkit.js keeps the inline object
    // as a compatibility fallback and delegates to the factory when present.

    function createReturnDislikeFeature(deps = {}) {
        const {
            appState = { settings: {} },
            DebugManager = { log() {} },
            DiagnosticLog = null,
            ExternalApiHealth = null,
            extensionFetchJson = async () => ({ data: null }),
            storageReadJSON = (_key, fallback) => fallback,
            storageWriteJSON = () => {},
            getVideoId = () => null,
            isWatchPagePath = () => false,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            PageTypes = { WATCH: 'watch' }
        } = deps;

        let _cache = null;
        let _persistTimer = null;
        const _budgetWindow = { start: 0, count: 0 };
        const _BUDGET_PER_MIN = 100;
        let _styleElement = null;
        let _pillEl = null;
        let _estimateEl = null;
        let _navRule = null;
        let _renderTimer = null;

        function _ensureStyles() {
            if (_styleElement) return;
            _styleElement = injectStyle(`
                .ytkit-ryd-pill{display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.78);font:600 12px/1.2 system-ui;font-variant-numeric:tabular-nums;}
                .ytkit-ryd-pill[data-tone="cached"]{color:rgba(255,255,255,0.55);}
                .ytkit-ryd-pill[data-tone="offline"]{color:#f59e0b;}
                .ytkit-ryd-estimate{margin-left:4px;font:500 10px/1 system-ui;color:rgba(255,255,255,0.42);letter-spacing:0;text-transform:lowercase;}
                .ytkit-ryd-ratio{margin-left:8px;font:500 11px/1 system-ui;color:rgba(255,255,255,0.55);}
                html:not([dark]) .ytkit-ryd-pill{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,0.05));color:var(--yt-spec-text-primary,#0f0f0f);}
                html:not([dark]) .ytkit-ryd-pill[data-tone="cached"]{color:var(--yt-spec-text-secondary,#606060);}
                html:not([dark]) .ytkit-ryd-pill[data-tone="offline"]{color:#b45309;}
                html:not([dark]) .ytkit-ryd-estimate{color:var(--yt-spec-text-secondary,#606060);}
                html:not([dark]) .ytkit-ryd-ratio{color:var(--yt-spec-text-secondary,#606060);}
            `, 'ryd-pill');
        }

        function _estimateDisclosureText() {
            return 'Return YouTube Dislike counts are estimates after YouTube removed public dislike totals; low-traffic videos can be less accurate.';
        }

        let _rydGeneration = 0;

        function _readCache(videoId) {
            if (!_cache) {
                try { _cache = storageReadJSON('ytkit-ryd-cache', {}) || {}; }
                catch { _cache = {}; }
            }
            const entry = _cache[videoId];
            if (!entry) return null;
            const ttlMs = (Math.max(1, Number(appState?.settings?.returnDislikeCacheHours) || 24)) * 3600 * 1000;
            if (Date.now() - (entry.ts || 0) > ttlMs) return null;
            return entry;
        }

        function _writeCache(videoId, data) {
            if (!_cache) {
                // Load the persisted cache first — starting from {} here let a
                // post-destroy fetch resolution overwrite the stored 500-entry
                // cache with a single entry.
                try { _cache = storageReadJSON('ytkit-ryd-cache', {}) || {}; }
                catch { _cache = {}; }
            }
            _cache[videoId] = { ts: Date.now(), ...data };
            const keys = Object.keys(_cache);
            if (keys.length > 500) {
                keys.sort((a, b) => (_cache[a].ts || 0) - (_cache[b].ts || 0));
                for (const k of keys.slice(0, keys.length - 500)) delete _cache[k];
            }
            clearTimeout(_persistTimer);
            _persistTimer = setTimeout(() => {
                try { storageWriteJSON('ytkit-ryd-cache', _cache); } catch { /* reason: RYD cache is opportunistic and may exceed quota */ }
            }, 2000);
        }

        function _allowFetch() {
            const now = Date.now();
            if (now - _budgetWindow.start > 60000) {
                _budgetWindow.start = now;
                _budgetWindow.count = 0;
            }
            if (_budgetWindow.count >= _BUDGET_PER_MIN) return false;
            _budgetWindow.count++;
            return true;
        }

        function _getBudgetSnapshot() {
            const now = Date.now();
            const age = now - _budgetWindow.start;
            return {
                used: _budgetWindow.count,
                limit: _BUDGET_PER_MIN,
                resetMs: _budgetWindow.start > 0 && age < 60000 ? 60000 - age : 0
            };
        }

        async function _fetch(videoId) {
            const cached = _readCache(videoId);
            if (cached) {
                ExternalApiHealth?.recordSuccess?.('returnDislike', {
                    source: 'cache',
                    cacheState: 'fresh',
                    endpoint: 'votes',
                    ts: cached.ts,
                    requestBudget: _getBudgetSnapshot()
                });
                return { ...cached, fromCache: true };
            }
            if (!_allowFetch()) {
                const budgetError = new Error('Return YouTube Dislike request budget exhausted');
                ExternalApiHealth?.recordFailure?.('returnDislike', budgetError, {
                    errorClass: 'rate-limited',
                    endpoint: 'votes',
                    cacheState: 'miss',
                    requestBudget: _getBudgetSnapshot()
                });
                DiagnosticLog?.record?.('returnDislike', `rate-limited at ${_budgetWindow.count}/${_BUDGET_PER_MIN}/min`);
                return null;
            }
            try {
                const { data } = await extensionFetchJson({
                    method: 'GET',
                    url: `https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`,
                    headers: { Accept: 'application/json' },
                    credentials: 'omit'
                });
                if (!data || typeof data.dislikes !== 'number') {
                    const payloadError = new Error('invalid Return YouTube Dislike votes payload');
                    ExternalApiHealth?.recordFailure?.('returnDislike', payloadError, {
                        errorClass: 'invalid-payload',
                        endpoint: 'votes',
                        cacheState: 'miss',
                        requestBudget: _getBudgetSnapshot()
                    });
                    DiagnosticLog?.record?.('returnDislike', `votes payload invalid for ${videoId}`);
                    return null;
                }
                const record = {
                    likes: Number(data.likes) || 0,
                    dislikes: Number(data.dislikes) || 0,
                    viewCount: Number(data.viewCount) || 0,
                    rating: Number(data.rating) || 0
                };
                _writeCache(videoId, record);
                ExternalApiHealth?.recordSuccess?.('returnDislike', {
                    source: 'network',
                    cacheState: 'refreshed',
                    endpoint: 'votes',
                    requestBudget: _getBudgetSnapshot()
                });
                return { ...record, fromCache: false };
            } catch (e) {
                ExternalApiHealth?.recordFailure?.('returnDislike', e, {
                    endpoint: 'votes',
                    cacheState: 'miss',
                    requestBudget: _getBudgetSnapshot()
                });
                DiagnosticLog?.record?.('returnDislike', `votes fetch failed for ${videoId}: ${e?.message || 'unknown error'}`);
                DebugManager.log('RYD', `Fetch failed: ${e.message}`);
                return null;
            }
        }

        function _formatCount(n) {
            if (!Number.isFinite(n)) return '—';
            if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
            if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
            return String(Math.round(n));
        }

        async function _render() {
            if (!isWatchPagePath()) return;
            const videoId = getVideoId?.();
            if (!videoId) return;
            const generation = _rydGeneration;
            const dislikeButton = document.querySelector('dislike-button-view-model, ytd-segmented-like-dislike-button-renderer #dislike-button-view-model, ytd-segmented-like-dislike-button-renderer');
            if (!dislikeButton) return;
            const data = await _fetch(videoId);
            // The user can navigate during the fetch await. Bail if the active
            // video changed (or we left the watch page) so we don't append the
            // previous video's dislike count onto the current video's button —
            // matches the route-token guards in dearrow/sponsorblock.
            if (generation !== _rydGeneration) return;
            if (!isWatchPagePath() || getVideoId?.() !== videoId) return;
            _pillEl?.remove();
            _estimateEl?.remove();
            document.querySelectorAll('.ytkit-ryd-ratio').forEach(el => el.remove());
            if (!data) {
                const offline = document.createElement('span');
                offline.className = 'ytkit-ryd-pill';
                offline.dataset.tone = 'offline';
                const now = Date.now();
                const windowAge = now - _budgetWindow.start;
                const rateLimited = _budgetWindow.count >= _BUDGET_PER_MIN
                    && windowAge < 60000;
                if (rateLimited) {
                    const remainingSec = Math.max(1, Math.ceil((60000 - windowAge) / 1000));
                    offline.textContent = 'RYD paused';
                    offline.title = `Return YouTube Dislike paused — rate-limited (${_budgetWindow.count}/${_BUDGET_PER_MIN}/min). Resumes in ${remainingSec}s.`;
                } else {
                    offline.textContent = 'RYD off';
                    offline.title = 'Return YouTube Dislike unavailable — the API did not return a usable response. Check your network or try again later.';
                }
                dislikeButton.appendChild(offline);
                _pillEl = offline;
                _estimateEl = null;
                return;
            }
            const pill = document.createElement('span');
            pill.className = 'ytkit-ryd-pill';
            pill.dataset.tone = data.fromCache ? 'cached' : 'fresh';
            pill.textContent = _formatCount(data.dislikes);
            const countLabel = _formatCount(data.dislikes);
            const estimateCopy = _estimateDisclosureText();
            if (data.fromCache) {
                const ageMs = Date.now() - (_cache?.[videoId]?.ts || Date.now());
                const ageH = Math.floor(ageMs / 3600000);
                const cacheTitle = ageH >= 1
                    ? `Cached dislike count from Return YouTube Dislike (${ageH}h old).`
                    : `Cached dislike count from Return YouTube Dislike (<1h old).`;
                pill.title = `${cacheTitle} ${estimateCopy}`;
            } else {
                pill.title = `Live dislike count from Return YouTube Dislike (${_budgetWindow.count}/${_BUDGET_PER_MIN}/min used). ${estimateCopy}`;
            }
            pill.setAttribute('aria-label', `${countLabel} estimated dislikes. ${estimateCopy}`);
            dislikeButton.appendChild(pill);
            _pillEl = pill;

            const estimateEl = document.createElement('span');
            estimateEl.className = 'ytkit-ryd-estimate';
            estimateEl.textContent = 'est.';
            estimateEl.title = estimateCopy;
            estimateEl.setAttribute('aria-label', estimateCopy);
            dislikeButton.appendChild(estimateEl);
            _estimateEl = estimateEl;

            if (appState?.settings?.returnDislikeShowRatio) {
                const total = (data.likes || 0) + (data.dislikes || 0);
                if (total > 0) {
                    const ratio = Math.round(((data.likes || 0) / total) * 100);
                    const ratioEl = document.createElement('span');
                    ratioEl.className = 'ytkit-ryd-ratio';
                    ratioEl.textContent = `${ratio}% liked`;
                    ratioEl.title = `Like ratio uses estimated Return YouTube Dislike counts. ${estimateCopy}`;
                    dislikeButton.appendChild(ratioEl);
                }
            }
        }

        return {
            id: 'returnDislike',
            name: 'Return YouTube Dislike',
            description: 'Restore an estimated dislike count via the public Return YouTube Dislike API. Cached locally; respects a 100 req/min budget. No cookies sent. Off by default.',
            group: 'Ratings',
            icon: 'thumbs-down',
            pages: [PageTypes.WATCH],

            _pagehideFlush: null,
            init() {
                _ensureStyles();
                this._pagehideFlush = () => {
                    if (_persistTimer && _cache) {
                        clearTimeout(_persistTimer);
                        _persistTimer = null;
                        try { storageWriteJSON('ytkit-ryd-cache', _cache); } catch { /* reason: best-effort unload flush */ }
                    }
                };
                window.addEventListener('pagehide', this._pagehideFlush);
                _navRule = () => {
                    // Track the pending timer so destroy() can cancel it —
                    // otherwise a navigation right before disable fires a
                    // zombie _render() ~1.5s later that re-injects a pill.
                    clearTimeout(_renderTimer);
                    _renderTimer = setTimeout(() => { _renderTimer = null; _render(); }, 1500);
                };
                addNavigateRule('returnDislike', _navRule);
                _navRule();
            },

            destroy() {
                _rydGeneration += 1;
                if (this._pagehideFlush) {
                    window.removeEventListener('pagehide', this._pagehideFlush);
                    this._pagehideFlush = null;
                }
                removeNavigateRule('returnDislike');
                _navRule = null;
                clearTimeout(_renderTimer);
                _renderTimer = null;
                _pillEl?.remove();
                _pillEl = null;
                _estimateEl?.remove();
                _estimateEl = null;
                document.querySelectorAll('.ytkit-ryd-pill, .ytkit-ryd-estimate, .ytkit-ryd-ratio').forEach(el => el.remove());
                _styleElement?.remove();
                _styleElement = null;
                if (_persistTimer) {
                    clearTimeout(_persistTimer);
                    _persistTimer = null;
                    if (_cache) {
                        try { storageWriteJSON('ytkit-ryd-cache', _cache); } catch { /* reason: final flush on teardown */ }
                    }
                }
                _cache = null;
                _budgetWindow.start = 0;
                _budgetWindow.count = 0;
            },

            // Exposed for cross-feature queries (e.g. card badges).
            _fetch,
            _formatCount,
            _readCache,
            _getBudgetSnapshot
        };
    }

    function calculateLikeRatio(data) {
        const likes = Number(data?.likes);
        const dislikes = Number(data?.dislikes);
        if (!Number.isFinite(likes) || !Number.isFinite(dislikes) || likes < 0 || dislikes < 0) return null;
        const total = likes + dislikes;
        if (total <= 0) return null;
        return Math.max(0, Math.min(100, Math.round((likes / total) * 100)));
    }

    function createReturnDislikeCardsFeature(deps = {}) {
        const {
            ExternalApiHealth = null,
            DiagnosticLog = null,
            getProvider = () => null,
            addScopedMutationRule = () => {},
            removeScopedMutationRule = () => {},
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            extractVideoIdFromUrl = () => null,
            documentRef = globalThis.document,
            IntersectionObserverCtor = globalThis.IntersectionObserver,
            now = () => Date.now(),
            setTimeoutFn = (fn, delay) => setTimeout(fn, delay),
            clearTimeoutFn = (timer) => clearTimeout(timer),
            t = (_key, fallback) => fallback
        } = deps;

        const CARD_SELECTOR = [
            'ytd-rich-item-renderer',
            'ytd-grid-video-renderer',
            'ytd-video-renderer',
            'ytd-compact-video-renderer',
            'yt-lockup-view-model'
        ].join(', ');
        const THUMBNAIL_SELECTOR = [
            '#thumbnail',
            'ytd-thumbnail',
            'yt-thumbnail-view-model',
            'a.yt-lockup-view-model__content-image'
        ].join(', ');
        const _CARD_BUDGET_PER_MIN = 24;
        const _MAX_CONCURRENT = 4;
        const _MAX_QUEUE = 48;
        const _MAX_TRACKED_CARDS = 300;
        const _NEGATIVE_CACHE_MS = 60_000;

        let _styleElement = null;
        let _observer = null;
        let _generation = 0;
        let _destroyed = true;
        let _budgetResetTimer = null;
        let _budgetReportedAt = 0;
        let _activeCount = 0;
        const _budgetWindow = { start: 0, count: 0 };
        const _cards = new Map();
        const _visibleCards = new Set();
        const _cardsByVideo = new Map();
        const _results = new Map();
        const _negativeUntil = new Map();
        const _queue = [];
        const _queuedVideos = new Set();
        const _activeVideos = new Set();

        function _budgetSnapshot() {
            const current = now();
            const age = current - _budgetWindow.start;
            return {
                used: _budgetWindow.count,
                limit: _CARD_BUDGET_PER_MIN,
                resetMs: _budgetWindow.start > 0 && age < 60_000 ? 60_000 - age : 0
            };
        }

        function _resetBudgetIfElapsed() {
            const current = now();
            if (_budgetWindow.start === 0 || current - _budgetWindow.start >= 60_000) {
                _budgetWindow.start = current;
                _budgetWindow.count = 0;
                _budgetReportedAt = 0;
            }
        }

        function _allowFetch() {
            _resetBudgetIfElapsed();
            if (_budgetWindow.count >= _CARD_BUDGET_PER_MIN) return false;
            _budgetWindow.count += 1;
            return true;
        }

        function _scheduleBudgetReset() {
            if (_budgetResetTimer || _destroyed) return;
            const delay = Math.max(25, _budgetSnapshot().resetMs || 60_000);
            _budgetResetTimer = setTimeoutFn(() => {
                _budgetResetTimer = null;
                _resetBudgetIfElapsed();
                for (const card of _visibleCards) _requestCard(card);
                _drainQueue();
            }, delay);
        }

        function _reportBudgetLimit(reason = 'card-budget') {
            const current = now();
            if (_budgetReportedAt && current - _budgetReportedAt < 60_000) return;
            _budgetReportedAt = current;
            const error = new Error('Return YouTube Dislike thumbnail request budget exhausted');
            ExternalApiHealth?.recordFailure?.('returnDislike', error, {
                errorClass: 'rate-limited',
                endpoint: 'votes-card',
                reason,
                requestBudget: _budgetSnapshot()
            });
            DiagnosticLog?.record?.('returnDislikeOnCards', `${reason}: ${_budgetWindow.count}/${_CARD_BUDGET_PER_MIN}/min`);
        }

        function _extractVideoId(card) {
            const links = Array.from(card?.querySelectorAll?.('a[href]') || []);
            for (const link of links) {
                const rawHref = link?.href || link?.getAttribute?.('href') || '';
                const videoId = extractVideoIdFromUrl(rawHref);
                if (videoId) return videoId;
            }
            return null;
        }

        function _deleteDatasetValue(element, key) {
            if (element?.dataset) delete element.dataset[key];
        }

        function _clearCard(card) {
            const bars = Array.from(card?.querySelectorAll?.('.ytkit-ryd-card-bar') || []);
            for (const bar of bars) {
                const host = bar.parentElement;
                bar.remove?.();
                if (host?.hasAttribute?.('data-ytkit-ryd-card-host') && !host.querySelector?.('.ytkit-ryd-card-bar')) {
                    host.removeAttribute('data-ytkit-ryd-card-host');
                }
            }
            const ownedHosts = Array.from(card?.querySelectorAll?.('[data-ytkit-ryd-card-host]') || []);
            for (const host of ownedHosts) host.removeAttribute?.('data-ytkit-ryd-card-host');
            _deleteDatasetValue(card, 'ytkitRydCardVideo');
            _deleteDatasetValue(card, 'ytkitRydCardState');
        }

        function _removeFromVideoSet(card, videoId) {
            const set = _cardsByVideo.get(videoId);
            if (!set) return;
            set.delete(card);
            if (set.size === 0) _cardsByVideo.delete(videoId);
        }

        function _forgetCard(card) {
            const state = _cards.get(card);
            if (state) _removeFromVideoSet(card, state.videoId);
            _cards.delete(card);
            _visibleCards.delete(card);
            try { _observer?.unobserve?.(card); } catch { /* reason: recycled YouTube nodes can disappear between mutations */ }
            _clearCard(card);
        }

        function _ratioLabel(ratio) {
            const suffix = t('ui_rydCardRatioSuffix', 'liked · estimated by Return YouTube Dislike');
            return `${ratio}% ${suffix}`;
        }

        function _renderCard(card, data) {
            const state = _cards.get(card);
            if (!state) return;
            const ratio = calculateLikeRatio(data);
            if (ratio == null) {
                _clearCard(card);
                if (card?.dataset) card.dataset.ytkitRydCardState = 'unavailable';
                return;
            }
            const thumbnail = card.querySelector?.(THUMBNAIL_SELECTOR);
            if (!thumbnail) return;
            let bar = thumbnail.querySelector?.('.ytkit-ryd-card-bar');
            if (!bar) {
                bar = documentRef.createElement('span');
                bar.className = 'ytkit-ryd-card-bar';
                bar.setAttribute('role', 'img');
                const fill = documentRef.createElement('span');
                fill.className = 'ytkit-ryd-card-bar-fill';
                bar.appendChild(fill);
                thumbnail.setAttribute('data-ytkit-ryd-card-host', '');
                thumbnail.appendChild(bar);
            }
            const label = _ratioLabel(ratio);
            bar.title = label;
            bar.setAttribute('aria-label', label);
            const fill = bar.querySelector?.('.ytkit-ryd-card-bar-fill');
            if (fill?.style) fill.style.width = `${ratio}%`;
            if (card?.dataset) {
                card.dataset.ytkitRydCardVideo = state.videoId;
                card.dataset.ytkitRydCardState = data?.fromCache ? 'cached' : 'ready';
            }
        }

        function _renderVideo(videoId, data) {
            const set = _cardsByVideo.get(videoId);
            if (!set) return;
            for (const card of Array.from(set)) {
                const state = _cards.get(card);
                if (!state || state.videoId !== videoId || card?.isConnected === false) {
                    _forgetCard(card);
                    continue;
                }
                _renderCard(card, data);
            }
        }

        function _enqueueVideo(videoId) {
            if (!videoId || _queuedVideos.has(videoId) || _activeVideos.has(videoId)) return false;
            if (_queue.length >= _MAX_QUEUE) {
                _reportBudgetLimit('card-queue-full');
                return false;
            }
            _queuedVideos.add(videoId);
            _queue.push(videoId);
            _drainQueue();
            return true;
        }

        function _hasVisibleCard(videoId) {
            const set = _cardsByVideo.get(videoId);
            if (!set) return false;
            for (const card of set) {
                const state = _cards.get(card);
                if (state?.videoId === videoId && card?.isConnected !== false && _visibleCards.has(card)) return true;
            }
            return false;
        }

        function _drainQueue() {
            if (_destroyed) return;
            const provider = getProvider?.();
            if (!provider?._fetch) return;
            while (_activeCount < _MAX_CONCURRENT && _queue.length > 0) {
                const nextVideoId = _queue[0];
                if (!_hasVisibleCard(nextVideoId)) {
                    _queue.shift();
                    _queuedVideos.delete(nextVideoId);
                    continue;
                }
                if (!_allowFetch()) {
                    _reportBudgetLimit();
                    _scheduleBudgetReset();
                    return;
                }
                const videoId = _queue.shift();
                _queuedVideos.delete(videoId);
                _activeVideos.add(videoId);
                _activeCount += 1;
                const requestGeneration = _generation;
                Promise.resolve(provider._fetch(videoId))
                    .then((data) => {
                        if (_destroyed || requestGeneration !== _generation) return;
                        if (data && calculateLikeRatio(data) != null) {
                            _results.set(videoId, data);
                            _negativeUntil.delete(videoId);
                            _renderVideo(videoId, data);
                        } else {
                            _negativeUntil.set(videoId, now() + _NEGATIVE_CACHE_MS);
                            _renderVideo(videoId, null);
                        }
                    })
                    .catch((error) => {
                        if (_destroyed || requestGeneration !== _generation) return;
                        _negativeUntil.set(videoId, now() + _NEGATIVE_CACHE_MS);
                        ExternalApiHealth?.recordFailure?.('returnDislike', error, {
                            endpoint: 'votes-card',
                            requestBudget: _budgetSnapshot()
                        });
                    })
                    .finally(() => {
                        _activeVideos.delete(videoId);
                        _activeCount = Math.max(0, _activeCount - 1);
                        if (!_destroyed && requestGeneration === _generation) _drainQueue();
                    });
            }
        }

        function _requestCard(card) {
            const state = _cards.get(card);
            if (!state || !_visibleCards.has(card)) return;
            const provider = getProvider?.();
            if (!provider?._fetch || !provider?._readCache) return;
            const ready = _results.get(state.videoId);
            if (ready) {
                _renderCard(card, ready);
                return;
            }
            const cached = provider._readCache(state.videoId);
            if (cached) {
                const data = { ...cached, fromCache: true };
                _results.set(state.videoId, data);
                _renderVideo(state.videoId, data);
                return;
            }
            if ((_negativeUntil.get(state.videoId) || 0) > now()) return;
            _enqueueVideo(state.videoId);
        }

        function _observeCard(card) {
            if (!card || card.isConnected === false) return;
            const videoId = _extractVideoId(card);
            if (!videoId) return;
            const previous = _cards.get(card);
            if (previous?.videoId === videoId) {
                if (_visibleCards.has(card)) _requestCard(card);
                return;
            }
            if (previous) {
                _removeFromVideoSet(card, previous.videoId);
                _clearCard(card);
            }
            _cards.set(card, { videoId });
            if (!_cardsByVideo.has(videoId)) _cardsByVideo.set(videoId, new Set());
            _cardsByVideo.get(videoId).add(card);
            _observer?.observe?.(card);
        }

        function _pruneCards() {
            for (const card of Array.from(_cards.keys())) {
                if (card?.isConnected === false) _forgetCard(card);
            }
            if (_cards.size > _MAX_TRACKED_CARDS) {
                for (const card of Array.from(_cards.keys())) {
                    if (_cards.size <= _MAX_TRACKED_CARDS) break;
                    if (!_visibleCards.has(card)) _forgetCard(card);
                }
            }
            // _results / _negativeUntil accumulate one entry per videoId ever
            // resolved; without eviction an hours-long feed session retains
            // thousands of dead records. Keep results only for videos still
            // tracked by a card, and sweep expired negative-cache entries.
            if (_results.size > _MAX_TRACKED_CARDS) {
                for (const videoId of Array.from(_results.keys())) {
                    if (!_cardsByVideo.has(videoId)) _results.delete(videoId);
                }
            }
            const nowTs = now();
            for (const [videoId, until] of _negativeUntil) {
                if (until <= nowTs) _negativeUntil.delete(videoId);
            }
        }

        function _scan(root = documentRef) {
            if (!root) return;
            const found = [];
            if (root.matches?.(CARD_SELECTOR)) found.push(root);
            for (const card of Array.from(root.querySelectorAll?.(CARD_SELECTOR) || [])) found.push(card);
            for (const card of found) _observeCard(card);
            _pruneCards();
        }

        function _handleIntersections(entries) {
            for (const entry of entries || []) {
                const card = entry?.target;
                if (!_cards.has(card)) continue;
                if (entry.isIntersecting) {
                    _visibleCards.add(card);
                    _requestCard(card);
                } else {
                    _visibleCards.delete(card);
                }
            }
        }

        function _ensureStyles() {
            if (_styleElement) return;
            _styleElement = injectStyle(`
                [data-ytkit-ryd-card-host]{position:relative!important;}
                .ytkit-ryd-card-bar{position:absolute;z-index:6;left:8px;right:8px;bottom:4px;height:4px;display:block;overflow:hidden;border-radius:2px;background:rgba(239,68,68,.82);box-shadow:0 1px 3px rgba(0,0,0,.48);pointer-events:none;}
                .ytkit-ryd-card-bar-fill{display:block;width:0;height:100%;border-radius:inherit;background:#22c55e;transition:width 120ms ease-out;}
                @media (prefers-reduced-motion:reduce){.ytkit-ryd-card-bar-fill{transition:none;}}
                @media (forced-colors:active){.ytkit-ryd-card-bar{border:1px solid CanvasText;background:Canvas;}.ytkit-ryd-card-bar-fill{background:Highlight;}}
            `, 'return-dislike-cards', true);
        }

        return {
            id: 'returnDislikeOnCards',
            name: 'Thumbnail Like-Ratio Bars',
            description: 'Show an estimated like-ratio bar on visible video thumbnails, using the same bounded Return YouTube Dislike cache.',
            group: 'Ratings',
            icon: 'thumbs-up',

            init() {
                if (!_destroyed) return;
                const provider = getProvider?.();
                if (!documentRef || !provider?._fetch || !provider?._readCache || typeof IntersectionObserverCtor !== 'function') {
                    const error = new Error('Thumbnail like-ratio prerequisites unavailable');
                    ExternalApiHealth?.recordFailure?.('returnDislike', error, {
                        errorClass: 'unavailable',
                        endpoint: 'votes-card'
                    });
                    return;
                }
                _destroyed = false;
                _generation += 1;
                _ensureStyles();
                _observer = new IntersectionObserverCtor(_handleIntersections, {
                    root: null,
                    rootMargin: '240px 0px',
                    threshold: 0.01
                });
                _scan(documentRef);
                addScopedMutationRule('returnDislikeOnCards', CARD_SELECTOR, (_target, addedElements) => {
                    if (addedElements?.length) {
                        for (const element of addedElements) _scan(element);
                    } else {
                        _scan(documentRef);
                    }
                });
                addNavigateRule('returnDislikeOnCards', () => {
                    _pruneCards();
                    _scan(documentRef);
                });
            },

            destroy() {
                _destroyed = true;
                _generation += 1;
                removeScopedMutationRule('returnDislikeOnCards');
                removeNavigateRule('returnDislikeOnCards');
                if (_budgetResetTimer) clearTimeoutFn(_budgetResetTimer);
                _budgetResetTimer = null;
                _observer?.disconnect?.();
                _observer = null;
                for (const card of Array.from(_cards.keys())) _clearCard(card);
                for (const bar of Array.from(documentRef?.querySelectorAll?.('.ytkit-ryd-card-bar') || [])) bar.remove?.();
                for (const host of Array.from(documentRef?.querySelectorAll?.('[data-ytkit-ryd-card-host]') || [])) {
                    host.removeAttribute?.('data-ytkit-ryd-card-host');
                }
                _cards.clear();
                _visibleCards.clear();
                _cardsByVideo.clear();
                _results.clear();
                _negativeUntil.clear();
                _queue.length = 0;
                _queuedVideos.clear();
                _activeVideos.clear();
                _activeCount = 0;
                _budgetWindow.start = 0;
                _budgetWindow.count = 0;
                _budgetReportedAt = 0;
                _styleElement?.remove?.();
                _styleElement = null;
            },

            _scan,
            _observeCard,
            _handleIntersections,
            _enqueueVideo,
            _getQueueSnapshot: () => ({
                queued: _queue.length,
                active: _activeCount,
                tracked: _cards.size,
                visible: _visibleCards.size,
                budget: _budgetSnapshot()
            })
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createReturnDislikeFeature = createReturnDislikeFeature;
    ns.createReturnDislikeCardsFeature = createReturnDislikeCardsFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            calculateLikeRatio,
            createReturnDislikeFeature,
            createReturnDislikeCardsFeature
        };
    }
})();
