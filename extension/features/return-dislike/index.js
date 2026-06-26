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
        const _budgetWindow = { start: 0, count: 0 };
        const _BUDGET_PER_MIN = 100;
        let _styleElement = null;
        let _pillEl = null;
        let _estimateEl = null;
        let _navRule = null;

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
            if (!_cache) _cache = {};
            _cache[videoId] = { ts: Date.now(), ...data };
            const keys = Object.keys(_cache);
            if (keys.length > 500) {
                keys.sort((a, b) => (_cache[a].ts || 0) - (_cache[b].ts || 0));
                for (const k of keys.slice(0, keys.length - 500)) delete _cache[k];
            }
            try { storageWriteJSON('ytkit-ryd-cache', _cache); } catch { /* reason: RYD cache is opportunistic and may exceed quota */ }
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
            const dislikeButton = document.querySelector('dislike-button-view-model, ytd-segmented-like-dislike-button-renderer #dislike-button-view-model, ytd-segmented-like-dislike-button-renderer');
            if (!dislikeButton) return;
            const data = await _fetch(videoId);
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

            init() {
                _ensureStyles();
                _navRule = () => { setTimeout(() => _render(), 1500); };
                addNavigateRule('returnDislike', _navRule);
                _navRule();
            },

            destroy() {
                removeNavigateRule('returnDislike');
                _navRule = null;
                _pillEl?.remove();
                _pillEl = null;
                _estimateEl?.remove();
                _estimateEl = null;
                document.querySelectorAll('.ytkit-ryd-pill, .ytkit-ryd-estimate, .ytkit-ryd-ratio').forEach(el => el.remove());
                _styleElement?.remove();
                _styleElement = null;
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

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createReturnDislikeFeature = createReturnDislikeFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createReturnDislikeFeature };
    }
})();
