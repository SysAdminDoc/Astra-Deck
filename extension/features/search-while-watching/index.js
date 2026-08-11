(() => {
    'use strict';

    const SEARCH_INPUT_SELECTOR = [
        'yt-searchbox input',
        'ytd-searchbox input#search',
        'form[role="search"] input',
        'input#search'
    ].join(', ');
    const SEARCH_BUTTON_SELECTOR = [
        'ytd-searchbox #search-icon-legacy',
        'yt-searchbox button[type="submit"]',
        'form[role="search"] button[type="submit"]'
    ].join(', ');
    const MAX_RESULTS = 24;
    const MAX_TRAVERSED_NODES = 30_000;
    const CACHE_TTL_MS = 5 * 60_000;
    const MAX_CACHE_ENTRIES = 20;

    function textFromRuns(value) {
        if (typeof value?.simpleText === 'string') return value.simpleText.trim();
        if (!Array.isArray(value?.runs)) return '';
        return value.runs.map((run) => String(run?.text || '')).join('').trim();
    }

    function extractBalancedJson(source, objectStart) {
        if (typeof source !== 'string' || objectStart < 0 || source[objectStart] !== '{') return null;
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = objectStart; index < source.length; index += 1) {
            const char = source[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') inString = false;
                continue;
            }
            if (char === '"') {
                inString = true;
                continue;
            }
            if (char === '{') depth += 1;
            else if (char === '}') {
                depth -= 1;
                if (depth === 0) return source.slice(objectStart, index + 1);
                if (depth < 0) return null;
            }
        }
        return null;
    }

    function extractInitialData(html) {
        const source = String(html || '');
        const markers = [
            'var ytInitialData =',
            'window["ytInitialData"] =',
            'ytInitialData ='
        ];
        for (const marker of markers) {
            let markerIndex = source.indexOf(marker);
            while (markerIndex !== -1) {
                const objectStart = source.indexOf('{', markerIndex + marker.length);
                const jsonText = extractBalancedJson(source, objectStart);
                if (jsonText) {
                    try { return JSON.parse(jsonText); }
                    catch { /* reason: another marker variant may contain the valid payload */ }
                }
                markerIndex = source.indexOf(marker, markerIndex + marker.length);
            }
        }
        return null;
    }

    function thumbnailUrl(renderer) {
        const thumbnails = renderer?.thumbnail?.thumbnails;
        if (!Array.isArray(thumbnails) || thumbnails.length === 0) return '';
        const raw = String(thumbnails[thumbnails.length - 1]?.url || '');
        try {
            const parsed = new URL(raw, 'https://www.youtube.com');
            if (parsed.protocol !== 'https:' || !/(^|\.)ytimg\.com$/i.test(parsed.hostname)) return '';
            return parsed.toString();
        } catch {
            return '';
        }
    }

    function safeYouTubePath(rawPath) {
        if (typeof rawPath !== 'string' || !rawPath.trim()) return '';
        try {
            const parsed = new URL(rawPath, 'https://www.youtube.com');
            if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.youtube.com') return '';
            return `${parsed.pathname}${parsed.search}`;
        } catch {
            return '';
        }
    }

    function metadataText(renderer) {
        const candidates = [
            renderer?.metadataText,
            renderer?.shortBylineText,
            renderer?.longBylineText,
            renderer?.ownerText,
            renderer?.publishedTimeText,
            renderer?.viewCountText,
            renderer?.videoCountText
        ];
        const values = candidates.map(textFromRuns).filter(Boolean);
        return Array.from(new Set(values)).slice(0, 3).join(' · ');
    }

    function resultFromRenderer(kind, renderer) {
        if (!renderer || typeof renderer !== 'object') return null;
        const title = textFromRuns(renderer.title);
        if (!title) return null;
        let path = '';
        let key = '';
        if (kind === 'video') {
            const videoId = String(renderer.videoId || '');
            if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
            path = `/watch?v=${encodeURIComponent(videoId)}`;
            key = `video:${videoId}`;
        } else if (kind === 'playlist') {
            const playlistId = String(renderer.playlistId || '');
            if (!/^[A-Za-z0-9_-]{10,100}$/.test(playlistId)) return null;
            path = `/playlist?list=${encodeURIComponent(playlistId)}`;
            key = `playlist:${playlistId}`;
        } else if (kind === 'channel') {
            path = safeYouTubePath(
                renderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url
                || renderer?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl
            );
            if (!path || !/^\/(?:channel\/|@|c\/|user\/)/.test(path)) return null;
            key = `channel:${path}`;
        } else {
            return null;
        }
        const duration = textFromRuns(renderer.lengthText)
            || textFromRuns(renderer?.thumbnailOverlays?.find?.((overlay) => overlay?.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text);
        return {
            key,
            kind,
            title: title.slice(0, 300),
            metadata: metadataText(renderer).slice(0, 300),
            duration: duration.slice(0, 40),
            thumbnail: thumbnailUrl(renderer),
            path
        };
    }

    function collectSearchResults(initialData, limit = MAX_RESULTS) {
        if (!initialData || typeof initialData !== 'object') return [];
        const results = [];
        const seen = new Set();
        const stack = [initialData];
        let visited = 0;
        while (stack.length > 0 && results.length < limit && visited < MAX_TRAVERSED_NODES) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            visited += 1;
            const candidates = [
                ['video', node.videoRenderer || node.compactVideoRenderer || node.gridVideoRenderer],
                ['playlist', node.playlistRenderer || node.compactPlaylistRenderer || node.gridPlaylistRenderer],
                ['channel', node.channelRenderer || node.compactChannelRenderer]
            ];
            for (const [kind, renderer] of candidates) {
                const result = resultFromRenderer(kind, renderer);
                if (result && !seen.has(result.key)) {
                    seen.add(result.key);
                    results.push(result);
                    if (results.length >= limit) break;
                }
            }
            if (results.length >= limit) break;
            if (Array.isArray(node)) {
                for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
            } else {
                const values = Object.values(node);
                for (let index = values.length - 1; index >= 0; index -= 1) stack.push(values[index]);
            }
        }
        return results;
    }

    function createSearchWhileWatchingFeature(deps = {}) {
        const {
            appState = { settings: {} },
            extensionFetchText = async () => ({ text: '' }),
            isWatchPagePath = () => false,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            openExternalUrl = async () => {},
            DiagnosticLog = null,
            documentRef = globalThis.document,
            windowRef = globalThis.window,
            now = () => Date.now(),
            t = (_key, fallback) => fallback
        } = deps;

        let _panel = null;
        let _styleElement = null;
        let _status = null;
        let _resultsList = null;
        let _panelInput = null;
        let _openHint = null;
        let _lastHeaderInput = null;
        let _activeQuery = '';
        let _requestToken = 0;
        let _destroyed = true;
        const _cache = new Map();

        function _isHeaderSearchInput(element) {
            if (!element?.matches?.(SEARCH_INPUT_SELECTOR)) return false;
            return Boolean(element.closest?.('yt-searchbox, ytd-searchbox, form[role="search"]'));
        }

        function _headerInputFromEvent(event) {
            const target = event?.target;
            if (_isHeaderSearchInput(target)) return target;
            const searchRoot = target?.closest?.('yt-searchbox, ytd-searchbox, form[role="search"]');
            return searchRoot?.querySelector?.(SEARCH_INPUT_SELECTOR) || null;
        }

        function _intercept(event, input) {
            const query = String(input?.value || '').trim();
            if (!query || !isWatchPagePath()) return false;
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            _lastHeaderInput = input;
            _open(query);
            return true;
        }

        function _onSubmit(event) {
            if (_panel?.contains?.(event.target)) return;
            _intercept(event, _headerInputFromEvent(event));
        }

        function _onKeyDown(event) {
            if (event.key === 'Escape' && _panel && !_panel.hidden) {
                event.preventDefault();
                _close(true);
                return;
            }
            if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
            if (_isHeaderSearchInput(event.target)) _intercept(event, event.target);
        }

        function _onClick(event) {
            const button = event.target?.closest?.(SEARCH_BUTTON_SELECTOR);
            if (!button || _panel?.contains?.(button)) return;
            _intercept(event, _headerInputFromEvent(event));
        }

        function _setStatus(message, state = 'idle') {
            if (!_status) return;
            _status.textContent = message;
            _status.dataset.state = state;
        }

        function _clearResults() {
            if (!_resultsList) return;
            while (_resultsList.firstChild) _resultsList.firstChild.remove();
        }

        function _updateOpenHint() {
            if (!_openHint) return;
            _openHint.textContent = appState?.settings?.openInNewTab
                ? t('searchWatchOpenHintNew', 'Results open in a new tab.')
                : t('searchWatchOpenHintSame', 'Results replace the current video.');
        }

        function _openResult(event, result) {
            if (event.button != null && event.button !== 0) return;
            event.preventDefault();
            const url = new URL(result.path, 'https://www.youtube.com').toString();
            if (appState?.settings?.openInNewTab || event.ctrlKey || event.metaKey) {
                void openExternalUrl(url).catch((error) => {
                    DiagnosticLog?.record?.('searchWhileWatching', `open failed: ${error?.message || 'unknown error'}`);
                    _setStatus(t('searchWatchOpenError', 'The result could not be opened.'), 'error');
                });
                return;
            }
            _close(false);
            windowRef?.location?.assign?.(url);
        }

        function _renderResults(results, query) {
            _clearResults();
            if (!results.length) {
                _setStatus(t('searchWatchEmpty', 'No supported results found.'), 'empty');
                return;
            }
            const count = Number(results.length).toLocaleString();
            // Single template so RTL/CJK locales can reorder the count, label,
            // and quoted query instead of receiving a fixed `count · label
            // "query"` composition with hardcoded curly quotes.
            _setStatus(t('searchWatchResultsStatus', '{count} results for "{query}"')
                .replace('{count}', count)
                .replace('{query}', query), 'ready');
            for (const result of results) {
                const item = documentRef.createElement('li');
                item.className = 'ytkit-search-watch-item';
                const link = documentRef.createElement('a');
                link.className = 'ytkit-search-watch-link';
                link.href = result.path;
                link.rel = 'noopener noreferrer';
                if (appState?.settings?.openInNewTab) link.target = '_blank';
                link.addEventListener('click', (event) => _openResult(event, result));

                const media = documentRef.createElement('span');
                media.className = 'ytkit-search-watch-media';
                if (result.thumbnail) {
                    const image = documentRef.createElement('img');
                    image.src = result.thumbnail;
                    image.alt = '';
                    image.loading = 'lazy';
                    image.decoding = 'async';
                    media.appendChild(image);
                } else {
                    media.classList.add('is-placeholder');
                    media.textContent = result.kind.slice(0, 1).toUpperCase();
                    media.setAttribute('aria-hidden', 'true');
                }
                if (result.duration) {
                    const duration = documentRef.createElement('span');
                    duration.className = 'ytkit-search-watch-duration';
                    duration.textContent = result.duration;
                    media.appendChild(duration);
                }

                const copy = documentRef.createElement('span');
                copy.className = 'ytkit-search-watch-copy';
                const title = documentRef.createElement('span');
                title.className = 'ytkit-search-watch-result-title';
                title.textContent = result.title;
                const meta = documentRef.createElement('span');
                meta.className = 'ytkit-search-watch-meta';
                meta.textContent = result.metadata;
                copy.append(title, meta);
                link.append(media, copy);
                item.appendChild(link);
                _resultsList?.appendChild(item);
            }
        }

        function _cached(query) {
            const key = query.toLocaleLowerCase();
            const entry = _cache.get(key);
            if (!entry) return null;
            if (now() - entry.ts >= CACHE_TTL_MS) {
                _cache.delete(key);
                return null;
            }
            return entry.results;
        }

        function _writeCache(query, results) {
            const key = query.toLocaleLowerCase();
            _cache.delete(key);
            _cache.set(key, { ts: now(), results });
            while (_cache.size > MAX_CACHE_ENTRIES) _cache.delete(_cache.keys().next().value);
        }

        async function _search(query) {
            const normalized = String(query || '').trim().slice(0, 200);
            if (!normalized || _destroyed) return;
            _activeQuery = normalized;
            if (_panelInput) _panelInput.value = normalized;
            _clearResults();
            _setStatus(t('searchWatchLoading', 'Searching YouTube…'), 'loading');
            // Every submission invalidates in-flight work — including cache
            // hits. Otherwise a pending network search for query A resolves
            // with a still-current token and overwrites the cached results
            // rendered for query B.
            const token = ++_requestToken;
            const cached = _cached(normalized);
            if (cached) {
                _renderResults(cached, normalized);
                return;
            }
            try {
                const { text } = await extensionFetchText({
                    method: 'GET',
                    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(normalized)}`,
                    headers: { Accept: 'text/html' },
                    timeout: 12_000
                });
                if (_destroyed || token !== _requestToken) return;
                const initialData = extractInitialData(text);
                if (!initialData) throw new Error('ytInitialData missing from search response');
                const results = collectSearchResults(initialData);
                // Never cache an empty set: a transient degraded response
                // (consent interstitial, renderer drift) would otherwise pin
                // "no results" for the TTL with no way to retry the query.
                if (results.length) _writeCache(normalized, results);
                _renderResults(results, normalized);
                if (!results.length) _appendRetry();
            } catch (error) {
                if (_destroyed || token !== _requestToken) return;
                DiagnosticLog?.record?.('searchWhileWatching', `search failed: ${error?.message || 'unknown error'}`);
                _clearResults();
                _setStatus(t('searchWatchError', 'Search results could not be loaded.'), 'error');
                _appendRetry();
            }
        }

        function _appendRetry() {
            if (!_resultsList) return;
            const item = documentRef.createElement('li');
            item.className = 'ytkit-search-watch-retry-item';
            const retry = documentRef.createElement('button');
            retry.type = 'button';
            retry.className = 'ytkit-search-watch-retry';
            retry.textContent = t('searchWatchRetry', 'Try again');
            retry.addEventListener('click', () => _search(_activeQuery));
            item.appendChild(retry);
            _resultsList.appendChild(item);
        }

        function _createPanel() {
            if (_panel || !documentRef?.body) return;
            const panel = documentRef.createElement('section');
            panel.className = 'ytkit-search-watch-panel';
            panel.hidden = true;
            panel.tabIndex = -1;
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'false');
            panel.setAttribute('aria-labelledby', 'ytkit-search-watch-title');

            const header = documentRef.createElement('header');
            header.className = 'ytkit-search-watch-header';
            const heading = documentRef.createElement('h2');
            heading.id = 'ytkit-search-watch-title';
            heading.textContent = t('searchWatchTitle', 'Search without stopping playback');
            const close = documentRef.createElement('button');
            close.type = 'button';
            close.className = 'ytkit-search-watch-close';
            close.textContent = '×';
            close.setAttribute('aria-label', t('searchWatchClose', 'Close search results'));
            close.addEventListener('click', () => _close(true));
            header.append(heading, close);

            const form = documentRef.createElement('form');
            form.className = 'ytkit-search-watch-form';
            const label = documentRef.createElement('label');
            label.className = 'ytkit-visually-hidden';
            label.htmlFor = 'ytkit-search-watch-input';
            label.textContent = t('searchWatchInputLabel', 'Search YouTube');
            const input = documentRef.createElement('input');
            input.id = 'ytkit-search-watch-input';
            input.type = 'search';
            input.maxLength = 200;
            input.autocomplete = 'off';
            input.placeholder = t('searchWatchPlaceholder', 'Search while watching…');
            const submit = documentRef.createElement('button');
            submit.type = 'submit';
            submit.textContent = t('searchWatchSubmit', 'Search');
            form.append(label, input, submit);
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                const query = String(input.value || '').trim();
                if (query) _search(query);
            });

            const hint = documentRef.createElement('p');
            hint.className = 'ytkit-search-watch-hint';
            const status = documentRef.createElement('p');
            status.className = 'ytkit-search-watch-status';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            status.setAttribute('aria-atomic', 'true');
            const list = documentRef.createElement('ul');
            list.className = 'ytkit-search-watch-results';

            panel.append(header, form, hint, status, list);
            documentRef.body.appendChild(panel);
            _panel = panel;
            _panelInput = input;
            _openHint = hint;
            _status = status;
            _resultsList = list;
        }

        function _open(query) {
            _createPanel();
            if (!_panel) return;
            _panel.hidden = false;
            _updateOpenHint();
            _panelInput?.focus?.({ preventScroll: true });
            _search(query);
        }

        function _close(restoreFocus) {
            if (!_panel) return;
            _panel.hidden = true;
            _requestToken += 1;
            if (restoreFocus && _lastHeaderInput?.isConnected !== false) {
                _lastHeaderInput?.focus?.({ preventScroll: true });
            }
        }

        function _ensureStyles() {
            if (_styleElement) return;
            _styleElement = injectStyle(`
                .ytkit-search-watch-panel{position:fixed;z-index:2147483638;top:72px;right:16px;width:min(500px,calc(100vw - 32px));max-height:calc(100vh - 88px);box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:14px;color:var(--yt-spec-text-primary,#f4f6fb);background:var(--yt-spec-base-background,#0f0f0f);border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.14));border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.42);font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
                .ytkit-search-watch-panel[hidden]{display:none!important;}
                .ytkit-search-watch-header{display:flex;align-items:center;justify-content:space-between;gap:12px;}
                .ytkit-search-watch-header h2{min-width:0;margin:0;font-size:16px;line-height:1.3;font-weight:700;}
                .ytkit-search-watch-close,.ytkit-search-watch-form button,.ytkit-search-watch-retry{min-width:40px;min-height:40px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.14));border-radius:8px;background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.08));color:inherit;font:600 13px/1 system-ui;cursor:pointer;}
                .ytkit-search-watch-close{font-size:24px;font-weight:400;}
                .ytkit-search-watch-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;}
                .ytkit-search-watch-form input{min-width:0;height:40px;box-sizing:border-box;padding:0 12px;border:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.18));border-radius:8px;background:var(--yt-spec-raised-background,rgba(255,255,255,.06));color:inherit;font:500 14px/1 system-ui;outline:none;}
                .ytkit-search-watch-form input::placeholder{color:var(--yt-spec-text-secondary,#aaa);opacity:1;}
                .ytkit-search-watch-form button{padding:0 14px;}
                .ytkit-search-watch-close:focus-visible,.ytkit-search-watch-form input:focus-visible,.ytkit-search-watch-form button:focus-visible,.ytkit-search-watch-link:focus-visible,.ytkit-search-watch-retry:focus-visible{outline:3px solid var(--yt-spec-call-to-action,#3ea6ff);outline-offset:2px;}
                .ytkit-search-watch-hint,.ytkit-search-watch-status{margin:0;color:var(--yt-spec-text-secondary,#aaa);font-size:12px;}
                .ytkit-search-watch-status[data-state="error"]{color:#fca5a5;}
                html:not([dark]) .ytkit-search-watch-status[data-state="error"]{color:#b91c1c;}
                .ytkit-search-watch-results{min-height:0;margin:0;padding:0;overflow:auto;overscroll-behavior:contain;list-style:none;}
                .ytkit-search-watch-item+ .ytkit-search-watch-item{border-top:1px solid var(--yt-spec-10-percent-layer,rgba(255,255,255,.1));}
                .ytkit-search-watch-link{display:grid;grid-template-columns:160px minmax(0,1fr);gap:12px;padding:10px 4px;color:inherit;text-decoration:none;border-radius:8px;}
                .ytkit-search-watch-link:hover{background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.07));}
                .ytkit-search-watch-media{position:relative;display:flex;align-items:center;justify-content:center;width:160px;aspect-ratio:16/9;overflow:hidden;border-radius:7px;background:var(--yt-spec-badge-chip-background,rgba(255,255,255,.08));color:var(--yt-spec-text-secondary,#aaa);font-size:22px;font-weight:700;}
                .ytkit-search-watch-media img{display:block;width:100%;height:100%;object-fit:cover;}
                .ytkit-search-watch-duration{position:absolute;right:4px;bottom:4px;padding:2px 4px;border-radius:4px;background:rgba(0,0,0,.82);color:#fff;font:700 11px/1.2 system-ui;}
                .ytkit-search-watch-copy{min-width:0;display:flex;flex-direction:column;gap:6px;align-self:center;}
                .ytkit-search-watch-result-title{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;font-weight:700;line-height:1.35;}
                .ytkit-search-watch-meta{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;color:var(--yt-spec-text-secondary,#aaa);font-size:12px;}
                .ytkit-search-watch-retry{align-self:flex-start;padding:0 14px;}
                .ytkit-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}
                @media(max-width:600px){.ytkit-search-watch-panel{top:60px;right:8px;width:calc(100vw - 16px);max-height:calc(100vh - 68px);padding:12px;}.ytkit-search-watch-link{grid-template-columns:120px minmax(0,1fr);gap:9px}.ytkit-search-watch-media{width:120px;}}
                @media(prefers-reduced-motion:reduce){.ytkit-search-watch-panel,.ytkit-search-watch-link{scroll-behavior:auto;transition:none!important;}}
                @media(forced-colors:active){.ytkit-search-watch-panel,.ytkit-search-watch-close,.ytkit-search-watch-form input,.ytkit-search-watch-form button,.ytkit-search-watch-retry{border:1px solid CanvasText;}.ytkit-search-watch-link:focus-visible{outline-color:Highlight;}.ytkit-search-watch-duration{background:Canvas;color:CanvasText;border:1px solid CanvasText;}}
            `, 'search-while-watching', true);
        }

        return {
            id: 'searchWhileWatching',
            name: t('feature_searchWhileWatching_name', 'Search While Watching'),
            description: t('feature_searchWhileWatching_desc', 'Show YouTube search results in a lightweight watch-page panel without interrupting playback.'),
            group: 'Content',
            icon: 'search',

            init() {
                if (!_destroyed) return;
                _destroyed = false;
                _ensureStyles();
                documentRef?.addEventListener?.('submit', _onSubmit, true);
                documentRef?.addEventListener?.('keydown', _onKeyDown, true);
                documentRef?.addEventListener?.('click', _onClick, true);
                addNavigateRule('searchWhileWatching', () => {
                    if (!isWatchPagePath()) _close(false);
                    else _updateOpenHint();
                });
            },

            destroy() {
                _destroyed = true;
                _requestToken += 1;
                removeNavigateRule('searchWhileWatching');
                documentRef?.removeEventListener?.('submit', _onSubmit, true);
                documentRef?.removeEventListener?.('keydown', _onKeyDown, true);
                documentRef?.removeEventListener?.('click', _onClick, true);
                _panel?.remove?.();
                _panel = null;
                _status = null;
                _resultsList = null;
                _panelInput = null;
                _openHint = null;
                _lastHeaderInput = null;
                _activeQuery = '';
                _cache.clear();
                _styleElement?.remove?.();
                _styleElement = null;
            },

            _search,
            _open,
            _close,
            _getState: () => ({
                open: Boolean(_panel && !_panel.hidden),
                activeQuery: _activeQuery,
                cachedQueries: _cache.size,
                requestToken: _requestToken
            })
        };
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createSearchWhileWatchingFeature = createSearchWhileWatchingFeature;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            collectSearchResults,
            createSearchWhileWatchingFeature,
            extractBalancedJson,
            extractInitialData,
            resultFromRenderer,
            safeYouTubePath,
            textFromRuns
        };
    }
})();
