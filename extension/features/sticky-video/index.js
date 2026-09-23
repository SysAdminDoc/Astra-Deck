(() => {
    'use strict';

    // extension/features/sticky-video/index.js
    //
    // Theater Split's controller: mounting, the divider, expand and collapse,
    // and the wheel and touch gestures. Its stylesheets live in
    // features/sticky-video-styles/index.js.

    const DIVIDER_WIDTH_PX = 8;
    const DIVIDER_DRAG_THRESHOLD_PX = 4;

    const SPLIT_POSITIONED_STYLE_PROPERTIES = Object.freeze([
        'position', 'top', 'right', 'width', 'max-width', 'height', 'margin',
        'overflow-y', 'overflow-x', 'overscroll-behavior-y', 'z-index',
        'background', 'padding', 'box-sizing', 'visibility', 'pointer-events',
        'display', 'scrollbar-width', 'scrollbar-color', 'border-radius',
        'border-bottom'
    ]);

    // The parts register on YTKitFeatures as they load. The extension imports
    // feature modules concurrently, so they are resolved when ytkit.js calls
    // the factory, after every feature module has settled, and never at load
    // time. A Node test loads this file on its own and takes the CommonJS path;
    // each path is a literal so the Firefox linter can see what gets loaded.
    function resolveParts() {
        const registry = globalThis.YTKitFeatures || {};
        const commonJs = typeof module !== 'undefined' && module.exports && typeof require === 'function';
        const parts = {
            styles: registry.stickyVideoStyles
                || (commonJs ? require('../sticky-video-styles/index.js') : null),
        };
        return Object.values(parts).every(Boolean) ? parts : null;
    }

    function createStickyVideoFeature(deps = {}) {
        // A part that failed to load leaves nothing to run. ytkit.js falls back
        // to its descriptor stub on a null return.
        const parts = resolveParts();
        if (!parts) return null;
        const { buildSplitShellCss, buildSplitMetaCss, buildSplitCommentsCss } = parts.styles;
        const {
            PageTypes = { WATCH: 'watch' },
            VideoTypeDetector = {
                refresh() { return 'standard'; },
                hasChat() { return false; },
                getChatEl() { return null; }
            },
            getVideoId = () => '',
            _rw = {},
            getFeatureById = () => null,
            storageRead = (_key, fallbackValue) => fallbackValue,
            storageWrite = () => {},
            DebugManager = { log() {} },
            checkAllButtons = null,
            waitForElement = () => {},
            injectStyle = () => ({ remove() {} }),
            stripCommentRestyleCss = value => value,
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'stickyVideo',
            name: t('feature_stickyVideo_name', 'Theater Split'),
            description: t('feature_stickyVideo_desc', 'Fullscreen video on watch pages. Scroll down to reveal comments side-by-side. Scroll back to top to return to fullscreen.'),
            group: 'Watch Page',
            icon: 'picture-in-picture-2',
            pages: [PageTypes.WATCH],

            // ── state ──
            _styleEl: null,
            _splitMetaStyleEl: null,
            _splitCommentsStyleEl: null,
            _isSplit: false,          // right panel is open
            _isActive: false,         // overlay is mounted
            _entering: false,
            _dismissed: false,        // user explicitly closed split — block re-expand until nav
            _chatObserver: null,      // single observer for late chat frame insertion
            _lastVideoId: null,
            _splitWrapper: null,
            _navRuleId: '_theaterSplit',
            _wheelHandler: null,
            _middleMouseHandler: null,
            _commentSelectionMouseDownHandler: null,
            _commentSelectionSelectStartHandler: null,
            _autoscrollState: null,
            _touchHandler: null,
            _touchMoveHandler: null,
            _touchStartY: 0,
            _rightWheelHandler: null,
            _rightTouchHandler: null,
            _rightTouchMoveHandler: null,
            _rightTouchStartY: 0,
            _dividerDragCleanup: null,
            _mastheadDisplay: undefined,
            _windowResizeHandler: null,
            _keyHandler: null,
            _fullscreenHandler: null,
            _fullscreenHidden: false,
            _fullscreenOverlayStash: null, // saved visibility for _positionedEls during native fullscreen
            _playerResizeObs: null,
            _playerResizeDebounceTimer: null,
            _chatObserverTimer: null,
            _scrollToCommentsTimer: null,
            _scrollToCommentsIdle: null,
            _expandFallbackTimer: null,
            _postExpandButtonsTimer: null,
            _splitActionDock: null,
            _splitActionDockMoved: null,
            _splitActionDockObserver: null,
            _splitActionDockTimer: null,
            _splitHeaderBar: null,
            _splitHeaderMovedLogo: null,
            _splitLiveHeader: null,
            _splitLiveActionPinned: null,
            _liveHeaderHeight: 154,
            _videoType: 'standard',        // 'live' | 'vod' | 'standard'
            _positionedEls: [],            // elements we CSS-positioned over right panel
            _playerGeometryStash: [],      // original inline geometry restored after unmount
            _splitInlineStyleStash: new Map(), // exact YouTube-owned declarations restored after unmount
            _scrollTarget: null,           // which element receives scroll/wheel handlers
            _pendingWaits: [],             // cancel fns for in-flight waitForElement chains
            _destroyed: false,             // blocks zombie mounts after teardown

            _getPlayer()  { return document.querySelector('#player-container'); },
            _belowCache: null,
            _belowCacheHref: '',
            _getBelow() {
                if (this._belowCache?.isConnected && this._belowCacheHref === location.href) return this._belowCache;
                this._belowCacheHref = location.href;
                this._belowCache = document.querySelector('#below') || document.querySelector('ytd-watch-metadata')?.parentElement;
                return this._belowCache;
            },
            _getChatEl() {
                const chatEl = VideoTypeDetector.getChatEl();
                return this._isSplitChatCandidate(chatEl) ? chatEl : null;
            },

            _isSplitChatCandidate(chatEl) {
                if (!chatEl || typeof chatEl.hasAttribute !== 'function') return false;
                if (chatEl.hidden === true || chatEl.hasAttribute('hidden')) return false;
                if (typeof chatEl.getAttribute === 'function' && chatEl.getAttribute('aria-hidden') === 'true') return false;
                return true;
            },

            _hasSplitCommentsSurface(below) {
                return !!below?.querySelector?.('ytd-comments#comments, ytd-comments, ytd-comments-header-renderer, ytd-comment-thread-renderer');
            },

            _resolveSplitPanelType(rawType, chatEl, below) {
                const type = rawType || 'standard';
                const hasChat = this._isSplitChatCandidate(chatEl);
                const hasComments = this._hasSplitCommentsSurface(below);
                const chatCollapsed = hasChat && typeof chatEl.hasAttribute === 'function' && chatEl.hasAttribute('collapsed');

                if (type === 'live') {
                    // Chat disabled/members-only: no frame exists, so the
                    // transparent live pane would be empty. Fall back to the
                    // standard comments panel when we have one.
                    if (hasChat && !chatCollapsed) return 'live';
                    return below ? 'standard' : 'live';
                }
                if (type === 'vod') {
                    if (hasChat && !chatCollapsed) return 'vod';
                    return below ? 'standard' : 'vod';
                }
                if (type === 'premiere') {
                    return hasChat && !hasComments && !chatCollapsed ? 'live' : 'standard';
                }
                if (type === 'standard' && hasChat && !hasComments && !chatCollapsed) return 'live';
                return 'standard';
            },

            // Nudge YouTube's player to recalculate control bar layout.
            _triggerPlayerResize() {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = setTimeout(() => {
                    this._resizeTimer = null;
                    window.dispatchEvent(new Event('resize'));
                }, 200);
            },

            _positionOverRight(el, rightPct, topOffset, heightStr) {
                if (!el) return;
                this._stashSplitInlineStyles(el, SPLIT_POSITIONED_STYLE_PROPERTIES);
                if (el.id === 'below') el.classList.add('ytkit-split-scroll-surface');
                this._setStyles(el, {
                    position:'fixed', top:topOffset||'0', right:'0',
                    width:`calc(${rightPct}% - 6px)`, 'max-width':'none',
                    height:heightStr||'100vh', margin:'0',
                    'overflow-y':'auto', 'overflow-x':'hidden',
                    'overscroll-behavior-y':'contain',
                    'z-index':'10001', background:'var(--ytkit-split-panel)', padding:'0',
                    'box-sizing':'border-box', visibility:'visible',
                    'pointer-events':'auto', display:'block',
                    'scrollbar-width':'thin', 'scrollbar-color':'var(--ytkit-split-scrollbar) transparent'
                });
                if (!this._positionedEls.includes(el)) this._positionedEls.push(el);
            },

            _unpositionEl(el) {
                if (el?.id === 'below') el.classList.remove('ytkit-split-scroll-surface');
                this._restoreSplitInlineStyles(el, SPLIT_POSITIONED_STYLE_PROPERTIES);
            },

            // Clean up all positioned elements
            _unpositionAll() {
                (this._positionedEls || []).forEach(el => this._unpositionEl(el));
                this._positionedEls = [];
                this._scrollTarget = null;
            },

            _isSplitScrollable(el) {
                return !!(el && el.scrollHeight > el.clientHeight + 1);
            },

            _isSplitCommentTextTarget(target) {
                if (!this._isActive || !this._isSplit) return false;
                const node = target instanceof Element ? target : target?.parentElement;
                if (!node) return false;
                const thread = node.closest('ytd-comment-thread-renderer');
                if (!thread || !thread.closest('#below.ytkit-split-scroll-surface #comments')) return false;
                if (node.closest([
                    'button',
                    '[role="button"]',
                    'yt-icon-button',
                    'tp-yt-paper-button',
                    'ytd-button-renderer',
                    'ytd-menu-renderer',
                    'ytd-toggle-button-renderer',
                    '#action-menu',
                    '#inline-action-menu',
                    '#reply-button-end',
                    '#creator-heart',
                    '#more-replies',
                    '#more-replies-sub-thread',
                    '#less-replies',
                    '#less-replies-sub-thread'
                ].join(','))) return false;
                return !!node.closest([
                    '#content',
                    '#content-text',
                    'yt-attributed-string',
                    '.ytAttributedStringHost',
                    'yt-core-attributed-string'
                ].join(','));
            },

            _shouldIgnoreSplitAutoscroll(target) {
                const node = target instanceof Element ? target : target?.parentElement;
                if (!node) return true;
                return !!node.closest([
                    'a[href]',
                    'button',
                    'input',
                    'textarea',
                    'select',
                    'option',
                    'summary',
                    '[role="button"]',
                    '[role="menuitem"]',
                    '[contenteditable="true"]',
                    'yt-icon-button',
                    'tp-yt-paper-button',
                    'ytd-button-renderer',
                    'ytd-menu-renderer',
                    'ytd-toggle-button-renderer'
                ].join(','));
            },

            _getSplitAutoscrollTarget(target) {
                if (!this._isActive || !this._isSplit) return null;
                const node = target instanceof Element ? target : target?.parentElement;
                if (!node) return null;

                const positionedHit = (this._positionedEls || []).find(el => el?.contains?.(node) && this._isSplitScrollable(el));
                if (positionedHit) return positionedHit;

                const right = this._splitWrapper?.querySelector('#ytkit-split-right');
                if (right?.contains(node) && this._isSplitScrollable(right)) return right;

                const fallback = this._scrollTarget;
                return this._isSplitScrollable(fallback) ? fallback : null;
            },

            _startSplitAutoscroll(e) {
                if (!this._isActive || !this._isSplit || e.button !== 1) return;
                if (this._shouldIgnoreSplitAutoscroll(e.target)) return;
                const scrollEl = this._getSplitAutoscrollTarget(e.target);
                if (!scrollEl) return;

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                this._stopSplitAutoscroll();

                const state = {
                    scrollEl,
                    originY: e.clientY,
                    currentY: e.clientY,
                    rafId: 0,
                    lastTs: performance.now(),
                    moveHandler: null,
                    upHandler: null,
                    keyHandler: null,
                    blurHandler: null
                };

                state.moveHandler = (moveEvent) => {
                    state.currentY = moveEvent.clientY;
                };
                state.upHandler = (upEvent) => {
                    if (upEvent.button !== 1) return;
                    upEvent.preventDefault();
                    upEvent.stopPropagation();
                    this._stopSplitAutoscroll();
                };
                state.keyHandler = (keyEvent) => {
                    if (keyEvent.key !== 'Escape') return;
                    keyEvent.preventDefault();
                    this._stopSplitAutoscroll();
                };
                state.blurHandler = () => this._stopSplitAutoscroll();

                this._autoscrollState = state;
                document.addEventListener('mousemove', state.moveHandler, true);
                document.addEventListener('mouseup', state.upHandler, true);
                document.addEventListener('keydown', state.keyHandler, true);
                window.addEventListener('blur', state.blurHandler);

                const tick = (now) => {
                    if (this._autoscrollState !== state) return;
                    const dy = state.currentY - state.originY;
                    const distance = Math.abs(dy);
                    const deadZone = 10;
                    const velocity = distance <= deadZone
                        ? 0
                        : Math.sign(dy) * Math.min(42, Math.pow((distance - deadZone) / 8, 1.25));
                    const dt = Math.min(48, now - state.lastTs) / 16.67;
                    state.lastTs = now;
                    if (velocity) state.scrollEl.scrollTop += velocity * dt;
                    state.rafId = requestAnimationFrame(tick);
                };
                state.rafId = requestAnimationFrame(tick);
            },

            _stopSplitAutoscroll() {
                const state = this._autoscrollState;
                if (!state) return;
                this._autoscrollState = null;
                if (state.rafId) cancelAnimationFrame(state.rafId);
                if (state.moveHandler) document.removeEventListener('mousemove', state.moveHandler, true);
                if (state.upHandler) document.removeEventListener('mouseup', state.upHandler, true);
                if (state.keyHandler) document.removeEventListener('keydown', state.keyHandler, true);
                if (state.blurHandler) window.removeEventListener('blur', state.blurHandler);
            },

            _scheduleSplitActionDock(delay = 80) {
                clearTimeout(this._splitActionDockTimer);
                this._splitActionDockTimer = setTimeout(() => {
                    this._splitActionDockTimer = null;
                    this._dockSplitHeader();
                    this._dockSplitActions();
                }, delay);
            },

            _getSplitTitleEl() {
                const below = this._getBelow();
                return below?.querySelector('ytd-watch-metadata #title, #title.ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata #title, #title.ytd-watch-metadata');
            },

            _createSplitYoutubeIcon() {
                const ns = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(ns, 'svg');
                svg.setAttribute('viewBox', '0 0 28 20');
                svg.setAttribute('aria-hidden', 'true');

                const rect = document.createElementNS(ns, 'rect');
                rect.setAttribute('x', '1.5');
                rect.setAttribute('y', '1.5');
                rect.setAttribute('width', '25');
                rect.setAttribute('height', '17');
                rect.setAttribute('rx', '5');
                rect.setAttribute('fill', 'currentColor');
                svg.appendChild(rect);

                const play = document.createElementNS(ns, 'path');
                play.setAttribute('d', 'M11 6.25 18.5 10 11 13.75Z');
                play.setAttribute('fill', '#fff');
                svg.appendChild(play);

                return svg;
            },

            _ensureSplitHeaderMeta(bar) {
                if (!bar) return null;

                let meta = bar.querySelector(':scope > .ytkit-split-upload-meta');
                let date = bar.querySelector('.ytkit-split-upload-date');
                if (!meta) {
                    meta = document.createElement('span');
                    meta.className = 'ytkit-split-upload-meta';
                    meta.setAttribute('translate', 'no');
                    if (date) {
                        date.removeAttribute('translate');
                        bar.insertBefore(meta, date);
                        meta.appendChild(date);
                    } else {
                        date = document.createElement('span');
                        date.className = 'ytkit-split-upload-date';
                        meta.appendChild(date);
                        bar.appendChild(meta);
                    }
                }

                if (!date) {
                    date = document.createElement('span');
                    date.className = 'ytkit-split-upload-date';
                    meta.insertBefore(date, meta.firstChild);
                }

                let views = meta.querySelector(':scope > .ytkit-split-view-count');
                if (!views) {
                    views = document.createElement('span');
                    views.className = 'ytkit-split-view-count';
                    meta.appendChild(views);
                }

                return meta;
            },

            _ensureSplitHeaderBar() {
                const title = this._getSplitTitleEl();
                if (!title) return null;

                let bar = title.querySelector(':scope > .ytkit-split-title-bar');
                if (!bar) {
                    bar = document.createElement('div');
                    bar.className = 'ytkit-split-title-bar';

                    const homeLink = document.createElement('a');
                    homeLink.className = 'ytkit-split-youtube-link';
                    homeLink.href = 'https://www.youtube.com/feed/subscriptions';
                    homeLink.title = t('stickyVideoSubscriptionsLink', 'Go to subscriptions');
                    homeLink.setAttribute('aria-label', t('stickyVideoSubscriptionsLink', 'Go to subscriptions'));
                    homeLink.appendChild(this._createSplitYoutubeIcon());
                    bar.appendChild(homeLink);

                    const actions = document.createElement('div');
                    actions.className = 'ytkit-split-header-actions';
                    actions.setAttribute('aria-label', t('stickyVideoQuickLinksAria', 'Quick links'));
                    bar.appendChild(actions);

                    const meta = document.createElement('span');
                    meta.className = 'ytkit-split-upload-meta';
                    meta.setAttribute('translate', 'no');
                    const date = document.createElement('span');
                    date.className = 'ytkit-split-upload-date';
                    meta.appendChild(date);
                    const views = document.createElement('span');
                    views.className = 'ytkit-split-view-count';
                    meta.appendChild(views);
                    bar.appendChild(meta);

                    title.insertBefore(bar, title.firstChild);
                }

                this._ensureSplitHeaderMeta(bar);
                this._splitHeaderBar = bar;
                return bar;
            },

            _extractSplitFallbackDate(text) {
                const normalized = String(text || '').replace(/\u00A0/g, ' ').trim();
                if (!normalized) return null;

                const segments = normalized.split(/[•|]/).map(part => part.trim()).filter(Boolean);
                const preferred = segments.find(segment => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(segment))
                    || normalized;
                const cleaned = preferred
                    .replace(/^(Premiered|Published on|Published|Uploaded|Streamed live on|Started streaming on|Streamed)\s*/i, '')
                    .trim();
                const parsed = new Date(cleaned);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            },

            _getSplitDateAnchor() {
                const root = this._getBelow() || document;
                const candidates = Array.from(root.querySelectorAll(
                    '#info-strings yt-formatted-string, ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string'
                ));
                return candidates.find(el => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(el.textContent || ''))
                    || candidates[0]
                    || null;
            },

            _getSplitPublishDate(anchorEl) {
                const currentVideoId = getVideoId();

                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const responseVideoId = playerResponse?.videoDetails?.videoId;
                    if (!responseVideoId || !currentVideoId || responseVideoId === currentVideoId) {
                        const microformat = playerResponse?.microformat?.playerMicroformatRenderer;
                        const raw = microformat?.publishDate
                            || microformat?.uploadDate
                            || microformat?.liveBroadcastDetails?.startTimestamp
                            || microformat?.liveBroadcastDetails?.endTimestamp;
                        if (raw) {
                            const parsed = new Date(raw);
                            if (!Number.isNaN(parsed.getTime())) return parsed;
                        }
                    }
                } catch { /* reason: player response date unavailable; fallback to page text */ }

                const meta = document.querySelector('meta[itemprop="datePublished"], meta[itemprop="uploadDate"]');
                const metaValue = meta?.getAttribute('content');
                if (metaValue) {
                    const parsed = new Date(metaValue);
                    if (!Number.isNaN(parsed.getTime())) return parsed;
                }

                return this._extractSplitFallbackDate(anchorEl?.textContent || '');
            },

            _formatSplitUploadDate(date) {
                return new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }).format(date);
            },

            _getSplitUploadDateText() {
                const anchor = this._getSplitDateAnchor();
                const publishDate = this._getSplitPublishDate(anchor);
                if (publishDate) return `Uploaded ${this._formatSplitUploadDate(publishDate)}`;

                const rawText = String(anchor?.textContent || '').replace(/\u00A0/g, ' ').trim();
                if (!rawText) return '';

                const segments = rawText.split(/[•|]/).map(part => part.trim()).filter(Boolean);
                const preferred = segments.find(segment => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(segment))
                    || segments[0]
                    || rawText;

                if (/^Published on\s+/i.test(preferred)) return preferred.replace(/^Published on\s+/i, 'Uploaded ');
                if (/^(Uploaded|Published|Premiered|Streamed)/i.test(preferred)) return preferred;
                return `Uploaded ${preferred}`;
            },

            _formatSplitViewCount(value) {
                const count = Number(value);
                if (!Number.isFinite(count) || count < 0) return '';
                return `${new Intl.NumberFormat().format(Math.floor(count))} views`;
            },

            _getSplitFallbackViewCountText() {
                const root = this._getBelow() || document;
                const candidates = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #metadata-line span'
                ));
                return candidates
                    .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
                    .find(text => /\bviews?\b/i.test(text)) || '';
            },

            _getSplitViewCountText() {
                const currentVideoId = getVideoId();
                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const responseVideoId = playerResponse?.videoDetails?.videoId;
                    if (!responseVideoId || !currentVideoId || responseVideoId === currentVideoId) {
                        const viewText = this._formatSplitViewCount(playerResponse?.videoDetails?.viewCount);
                        if (viewText) return viewText;
                    }
                } catch { /* reason: player response view count unavailable; fallback to DOM text */ }
                return this._getSplitFallbackViewCountText();
            },

            _getSplitVideoTitleText() {
                const root = this._getBelow() || document;
                const el = root.querySelector('ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata #title yt-formatted-string')
                    || document.querySelector('ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata #title yt-formatted-string');
                const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) return text;
                try {
                    const title = _rw.ytInitialPlayerResponse?.videoDetails?.title;
                    if (title) return String(title).replace(/\s+/g, ' ').trim();
                } catch { /* reason: player response title unavailable; fallback to document title */ }
                return document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim()
                    || t('stickyVideoLiveVideoFallback', 'Live video');
            },

            _formatSplitLiveTitleText(title) {
                const cleaned = String(title || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .replace(/^[\s\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{1F7E3}\u{1F7E4}\u{26AB}\u{26AA}\u{25CF}\u{2B24}]+/u, '')
                    .replace(/^(?:LIVE(?:\s+NOW|\s+STREAM)?|WATCHING\s+LIVE)\s*[-:|\u2022]\s*/i, '')
                    .trim();
                return cleaned || String(title || '').replace(/\s+/g, ' ').trim()
                    || t('stickyVideoLiveVideoFallback', 'Live video');
            },

            _getSplitChannelText() {
                const root = this._getBelow() || document;
                const el = root.querySelector('ytd-video-owner-renderer #channel-name #text, ytd-video-owner-renderer #channel-name yt-formatted-string, #owner #channel-name #text, #owner yt-formatted-string.ytd-channel-name')
                    || document.querySelector('ytd-video-owner-renderer #channel-name #text, ytd-video-owner-renderer #channel-name yt-formatted-string, #owner #channel-name #text, #owner yt-formatted-string.ytd-channel-name');
                const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) return text;
                try {
                    return String(_rw.ytInitialPlayerResponse?.videoDetails?.author || '').replace(/\s+/g, ' ').trim();
                } catch { /* reason: player response author unavailable; fallback to DOM text */ }
                return '';
            },

            _formatSplitLiveInfoText(text, viewText = '') {
                let normalized = String(text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                if (!normalized) return '';
                if (viewText) normalized = normalized.replace(viewText, ' ');
                normalized = normalized
                    .replace(/\b\d[\d,.]*\s*(?:K|M|B)?\s*(?:watching(?:\s+now)?|waiting|views?)\b/i, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const match = normalized.match(/\b(?:Started streaming|Streamed live(?: on)?|Scheduled for|Premiered|Started)\b[^#|\u2022]*/i);
                return (match?.[0] || '')
                    .replace(/\s+Uploaded\b.*$/i, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            },

            _getSplitLiveInfoText(viewText = '') {
                const root = this._getBelow() || document;
                const parts = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #owner-sub-count, ytd-watch-metadata #metadata-line span, ytd-watch-info-text yt-formatted-string, factoid-renderer yt-formatted-string'
                )).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                for (const text of parts) {
                    const info = this._formatSplitLiveInfoText(text, viewText);
                    if (info) return info;
                }
                return '';
            },

            _formatSplitLiveViewText(text) {
                const normalized = String(text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                const liveMatch = normalized.match(/\b\d[\d,.]*\s*(?:K|M|B)?\s*(?:watching(?:\s+now)?|waiting)\b/i);
                if (liveMatch) return liveMatch[0].replace(/\swatching$/i, ' watching now');
                const viewMatch = normalized.match(/\b\d[\d,.]*\s*(?:K|M|B)?\s*views?\b/i);
                return viewMatch?.[0] || '';
            },

            _getSplitLiveViewCountText() {
                const root = this._getBelow() || document;
                const parts = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #metadata-line span, ytd-watch-info-text yt-formatted-string, factoid-renderer yt-formatted-string'
                )).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                const watchingText = parts.map(text => this._formatSplitLiveViewText(text)).find(Boolean);
                if (watchingText) return watchingText;
                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const liveDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
                    const isLive = playerResponse?.videoDetails?.isLive || playerResponse?.videoDetails?.isLiveContent || !!liveDetails;
                    const viewText = isLive ? this._formatSplitViewCount(playerResponse?.videoDetails?.viewCount).replace(/\s+views$/i, ' watching now') : '';
                    if (viewText) return viewText;
                } catch { /* reason: player response live count unavailable; fallback to visible metadata */ }
                return parts.find(text => /\bviews?\b/i.test(text))
                    || this._getSplitViewCountText();
            },

            _createSplitLiveHeaderNode() {
                const header = document.createElement('section');
                header.className = 'ytkit-split-live-header';
                header.setAttribute('aria-label', t('stickyVideoLiveInfoAria', 'Live video information'));
                header.style.cssText = [
                    'position:fixed',
                    'top:0',
                    'right:0',
                    'height:auto',
                    `min-height:${this._liveHeaderHeight}px`,
                    'z-index:10003',
                    'padding:10px 12px',
                    'box-sizing:border-box',
                    'pointer-events:auto',
                    'color:var(--ytkit-split-text)',
                    'background:var(--ytkit-split-panel)',
                    'border-left:1px solid var(--ytkit-split-border)',
                    'border-bottom:1px solid var(--ytkit-split-border)',
                    'box-shadow:none',
                    'overflow:hidden'
                ].join(';');

                const card = document.createElement('div');
                card.className = 'ytkit-split-live-card';
                card.style.cssText = [
                    'min-height:0',
                    'border-radius: 12px',
                    'border:1px solid var(--ytkit-split-border)',
                    'background:var(--ytkit-split-raised)',
                    'box-shadow:var(--ytkit-split-control-shadow)',
                    'position:relative',
                    'display:grid',
                    'min-width:0',
                    'width:100%',
                    'max-width:100%',
                    'inline-size:100%',
                    'max-inline-size:100%',
                    'grid-template-columns:minmax(0,1fr) minmax(0,min(330px,42%))',
                    'grid-template-areas:"channel actions" "title title" "meta meta"',
                    'align-content:start',
                    'align-items:stretch',
                    'gap:5px',
                    'padding:12px 15px 11px',
                    'box-sizing:border-box',
                    'overflow:hidden'
                ].join(';');

                const channel = document.createElement('div');
                channel.className = 'ytkit-split-live-channel';
                channel.setAttribute('translate', 'no');
                channel.style.cssText = 'grid-area:channel;min-width:0;max-width:100%;font:800 14px/1.25 Arial,sans-serif;color:var(--ytkit-split-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                card.appendChild(channel);

                const meta = document.createElement('div');
                meta.className = 'ytkit-split-live-meta';
                meta.style.cssText = 'grid-area:meta;display:flex;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:5px 8px;min-width:0;max-width:100%;overflow:hidden;';

                const liveBadge = document.createElement('span');
                liveBadge.className = 'ytkit-split-live-badge';
                liveBadge.textContent = t('stickyVideoLiveBadge', 'LIVE');
                liveBadge.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;font:800 11px/1.2 Arial,sans-serif;letter-spacing:0;color:#fff;background:#dc2626;border-radius:4px;padding:5px 9px;box-shadow:0 8px 18px rgba(220,38,38,0.22);';
                meta.appendChild(liveBadge);

                const viewCount = document.createElement('span');
                viewCount.className = 'ytkit-split-live-view-count';
                viewCount.setAttribute('translate', 'no');
                viewCount.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;min-width:0;max-width:100%;font:700 12px/1.2 Arial,sans-serif;color:var(--ytkit-split-text);background:var(--ytkit-split-comment-control);border:1px solid var(--ytkit-split-border);border-radius:6px;padding:5px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                meta.appendChild(viewCount);

                const date = document.createElement('span');
                date.className = 'ytkit-split-live-date';
                date.setAttribute('translate', 'no');
                date.style.cssText = 'display:-webkit-box;flex:1 1 240px;min-width:0;max-width:100%;font:650 12px/1.25 Arial,sans-serif;color:var(--ytkit-split-muted);overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:1;-webkit-box-orient:vertical;';
                meta.appendChild(date);
                card.appendChild(meta);

                const title = document.createElement('h2');
                title.className = 'ytkit-split-live-title';
                title.style.cssText = [
                    'grid-area:title',
                    'margin:0',
                    'min-width:0',
                    'width:100%',
                    'max-width:100%',
                    'justify-self:stretch',
                    'box-sizing:border-box',
                    'font:800 16px/1.22 Arial,sans-serif',
                    'letter-spacing:0',
                    'color:var(--ytkit-split-text)',
                    'display:-webkit-box',
                    'max-height:2.44em',
                    '-webkit-line-clamp:2',
                    '-webkit-box-orient:vertical',
                    'overflow:hidden',
                    'text-overflow:ellipsis',
                    'white-space:normal',
                    'overflow-wrap:anywhere',
                    'word-break:break-word'
                ].join(';');
                card.appendChild(title);

                const actions = document.createElement('div');
                actions.className = 'ytkit-split-live-actions';
                actions.setAttribute('aria-label', t('stickyVideoLiveActionsAria', 'Live video actions'));
                actions.style.cssText = 'grid-area:actions;display:flex;align-items:center;align-self:center;justify-content:flex-end;gap:8px;height:42px;min-height:42px;min-width:0;width:100%;max-width:100%;contain:inline-size;overflow:hidden;';
                card.appendChild(actions);

                header.appendChild(card);
                return header;
            },

            _ensureSplitLiveHeader(rightPct) {
                let header = this._splitLiveHeader;
                if (!header || !header.isConnected) {
                    header = this._createSplitLiveHeaderNode();
                    document.body.appendChild(header);
                    this._splitLiveHeader = header;
                }

                const headerWidth = Math.max(0, Math.round(window.innerWidth * rightPct / 100));
                const compact = headerWidth > 0 && headerWidth < 760;
                const narrow = headerWidth > 0 && headerWidth < 420;
                const baseHeaderHeight = narrow ? 190 : (compact ? 164 : this._liveHeaderHeight);
                const maxHeaderHeight = Math.max(baseHeaderHeight, Math.min(260, Math.round(window.innerHeight * 0.42)));
                header.dataset.ytkitLiveCompact = compact ? '1' : '0';
                header.dataset.ytkitLiveNarrow = narrow ? '1' : '0';
                header.style.width = `calc(${rightPct}% - 2px)`;
                header.style.padding = narrow ? '8px 9px' : '10px 12px';
                header.style.minHeight = `${baseHeaderHeight}px`;
                header.style.height = `${baseHeaderHeight}px`;
                const card = header.querySelector('.ytkit-split-live-card');
                const titleEl = header.querySelector('.ytkit-split-live-title');
                const channelEl = header.querySelector('.ytkit-split-live-channel');
                const metaEl = header.querySelector('.ytkit-split-live-meta');
                const viewEl = header.querySelector('.ytkit-split-live-view-count');
                const dateEl = header.querySelector('.ytkit-split-live-date');
                const title = this._formatSplitLiveTitleText(this._getSplitVideoTitleText());
                const channel = this._getSplitChannelText();
                const dateText = this._getSplitUploadDateText();
                const viewText = this._getSplitLiveViewCountText();
                const infoText = this._getSplitLiveInfoText(viewText);
                const supplementalInfo = viewText && infoText === viewText ? '' : infoText;
                const dateInfo = supplementalInfo || dateText;
                const fullDateInfo = [supplementalInfo, dateText].filter(Boolean).join(' | ');
                if (card) {
                    card.style.padding = narrow ? '10px 12px' : '12px 15px 11px';
                    card.style.gridTemplateColumns = narrow
                        ? 'minmax(0,1fr)'
                        : 'minmax(0,1fr) minmax(0,min(330px,42%))';
                    card.style.gridTemplateAreas = narrow
                        ? '"channel" "actions" "title" "meta"'
                        : '"channel actions" "title title" "meta meta"';
                }
                if (channelEl) {
                    channelEl.textContent = channel;
                    channelEl.hidden = !channel;
                    if (channel) channelEl.title = channel;
                    else channelEl.removeAttribute('title');
                }
                if (titleEl) {
                    titleEl.textContent = title;
                    titleEl.hidden = !title;
                    titleEl.style.setProperty('display', '-webkit-box');
                    titleEl.style.setProperty('width', '100%');
                    titleEl.style.setProperty('max-width', '100%');
                    titleEl.style.setProperty('max-inline-size', '100%');
                    titleEl.style.setProperty('overflow', 'hidden');
                    titleEl.style.setProperty('text-overflow', 'ellipsis');
                    titleEl.style.setProperty('white-space', 'normal');
                    titleEl.style.setProperty('overflow-wrap', 'anywhere');
                    titleEl.style.setProperty('word-break', 'normal');
                    titleEl.style.setProperty('-webkit-line-clamp', '2');
                    titleEl.style.setProperty('-webkit-box-orient', 'vertical');
                    titleEl.style.setProperty('max-height', '2.44em');
                    if (title) titleEl.title = title;
                    else titleEl.removeAttribute('title');
                }
                if (metaEl) metaEl.hidden = false;
                if (viewEl) {
                    viewEl.textContent = viewText;
                    viewEl.hidden = !viewText;
                    if (viewText) viewEl.title = viewText;
                    else viewEl.removeAttribute('title');
                }
                if (dateEl) {
                    dateEl.textContent = dateInfo;
                    dateEl.hidden = !dateInfo;
                    dateEl.style.setProperty('-webkit-line-clamp', compact ? '2' : '1');
                    if (fullDateInfo) dateEl.title = fullDateInfo;
                    else dateEl.removeAttribute('title');
                }
                header.setAttribute('aria-label', [t('stickyVideoLiveVideoFallback', 'Live video'), channel, viewText, dateInfo, title].filter(Boolean).join(' | '));
                this._dockSplitLiveHeaderActions();
                const outerVerticalPadding = narrow ? 16 : 20;
                const measuredCardHeight = Math.max(card?.scrollHeight || 0, card?.getBoundingClientRect?.().height || 0);
                const measuredHeaderHeight = Math.ceil((measuredCardHeight || baseHeaderHeight - outerVerticalPadding) + outerVerticalPadding);
                const liveHeaderHeight = Math.min(maxHeaderHeight, Math.max(baseHeaderHeight, measuredHeaderHeight));
                header.style.height = `${liveHeaderHeight}px`;
                return liveHeaderHeight;
            },

            _removeSplitLiveHeader() {
                this._splitLiveHeader?.remove();
                this._splitLiveHeader = null;
            },

            _dockSplitHeader() {
                if (!this._isActive || !this._isSplit) return;

                const bar = this._ensureSplitHeaderBar();
                if (!bar) return;

                const metaEl = bar.querySelector('.ytkit-split-upload-meta');
                const dateEl = bar.querySelector('.ytkit-split-upload-date');
                const viewEl = bar.querySelector('.ytkit-split-view-count');
                const dateText = this._getSplitUploadDateText();
                const viewText = this._getSplitViewCountText();
                if (dateEl) {
                    dateEl.textContent = dateText;
                    dateEl.hidden = !dateText;
                }
                if (viewEl) {
                    viewEl.textContent = viewText;
                    viewEl.hidden = !viewText;
                }
                if (metaEl) {
                    const metaLabel = [dateText, viewText].filter(Boolean).join(' | ');
                    metaEl.hidden = !metaLabel;
                    if (metaLabel) {
                        metaEl.title = metaLabel;
                        metaEl.setAttribute('aria-label', metaLabel);
                    } else {
                        metaEl.removeAttribute('title');
                        metaEl.removeAttribute('aria-label');
                    }
                }

                const actions = bar.querySelector('.ytkit-split-header-actions');
                const logoWrap = document.getElementById('ytkit-po-logo-wrap');
                if (actions && logoWrap && logoWrap.parentElement !== actions) {
                    if (!this._splitHeaderMovedLogo) {
                        this._splitHeaderMovedLogo = {
                            parent: logoWrap.parentNode,
                            next: logoWrap.nextSibling
                        };
                    }
                    logoWrap.dataset.ytkitSplitHeaderDocked = '1';
                    actions.appendChild(logoWrap);
                    getFeatureById('quickLinkMenu')?._syncLauncherChrome?.(logoWrap);
                }
                if (actions) actions.hidden = !logoWrap;
            },

            _restoreSplitHeader() {
                const logoWrap = document.getElementById('ytkit-po-logo-wrap');
                const moved = this._splitHeaderMovedLogo;
                if (logoWrap) delete logoWrap.dataset.ytkitSplitHeaderDocked;
                if (logoWrap && moved) {
                    const fallbackParent = document.getElementById('ytkit-player-controls');
                    const parent = moved.parent?.isConnected ? moved.parent : fallbackParent;
                    if (parent) {
                        if (moved.next?.parentNode === parent) parent.insertBefore(logoWrap, moved.next);
                        else parent.appendChild(logoWrap);
                    }
                }
                this._splitHeaderMovedLogo = null;

                document.querySelectorAll('.ytkit-split-title-bar').forEach(bar => bar.remove());
                this._splitHeaderBar = null;
            },

            _getSplitOwner() {
                const below = this._getBelow();
                return below?.querySelector('ytd-watch-metadata #owner, #owner.ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata #owner, #owner.ytd-watch-metadata');
            },

            _ensureSplitActionDock() {
                const owner = this._getSplitOwner();
                if (!owner) return null;

                let dock = owner.querySelector(':scope > .ytkit-split-owner-actions');
                if (!dock) {
                    dock = document.createElement('div');
                    dock.className = 'ytkit-split-owner-actions';
                    dock.setAttribute('aria-label', t('stickyVideoVideoActionsAria', 'Video actions'));
                    const subscribe = owner.querySelector('#subscribe-button');
                    if (subscribe?.nextSibling) owner.insertBefore(dock, subscribe.nextSibling);
                    else owner.appendChild(dock);
                }

                this._splitActionDock = dock;
                return dock;
            },

            _findSplitLikeControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #actions segmented-like-dislike-button-view-model',
                    'ytd-watch-metadata #actions ytd-segmented-like-dislike-button-renderer',
                    'ytd-watch-metadata #actions like-button-view-model',
                    'ytd-watch-metadata #actions #segmented-like-button'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-owner-actions')) return el;
                }
                return null;
            },

            _findSplitSubscribeControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #owner #subscribe-button',
                    'ytd-watch-metadata #owner yt-subscribe-button-view-model',
                    'ytd-watch-metadata #owner ytd-subscribe-button-renderer'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-live-actions')) return el;
                }
                return null;
            },

            _findSplitNotificationControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #owner #notification-preference-button',
                    'ytd-watch-metadata #owner ytd-subscription-notification-toggle-button-renderer-next'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-owner-actions') && !el.closest('.ytkit-split-live-actions')) return el;
                }
                return null;
            },

            _findSplitPageControl() {
                const owner = this._getSplitOwner();
                if (!owner) return null;
                return owner.querySelector(':scope > #ytkit-page-btn-watch, :scope > #ytkit-watch-btn');
            },

            _findSplitDownloadControl() {
                const root = this._getBelow() || document;
                const controls = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #actions .ytkit-local-dl-btn, ytd-watch-metadata #top-level-buttons-computed .ytkit-local-dl-btn'
                ));
                return controls.find(el => !el.closest('.ytkit-split-owner-actions')) || null;
            },

            _dockSplitControl(control, dock) {
                if (!control || !dock) return false;
                if (control.parentElement === dock) {
                    control.dataset.ytkitSplitDocked = '1';
                    return false;
                }

                if (!this._splitActionDockMoved) this._splitActionDockMoved = new Map();
                if (!this._splitActionDockMoved.has(control)) {
                    this._splitActionDockMoved.set(control, {
                        parent: control.parentNode,
                        next: control.nextSibling
                    });
                }

                control.dataset.ytkitSplitDocked = '1';
                dock.appendChild(control);
                return true;
            },

            _polishSplitLiveHeaderAction(control) {
                if (!control) return;
                control.style.setProperty('display', 'inline-flex', 'important');
                control.style.setProperty('align-items', 'center', 'important');
                control.style.setProperty('margin', '0', 'important');
                control.style.setProperty('overflow', 'visible', 'important');
                control.querySelectorAll('dislike-button-view-model, #segmented-dislike-button, .ytDislikeButtonViewModelHost').forEach(el => {
                    el.style.setProperty('display', 'none', 'important');
                });
                control.querySelectorAll('button, .yt-spec-button-shape-next, .ytSpecButtonShapeNextHost').forEach(button => {
                    button.style.setProperty('height', '32px', 'important');
                    button.style.setProperty('min-height', '32px', 'important');
                    button.style.setProperty('border-radius', '10px', 'important');
                    button.style.setProperty('white-space', 'nowrap', 'important');
                });
            },

            _restoreSplitLiveHeaderActionPin(control, state) {
                if (!control) return;
                delete control.dataset.ytkitSplitLivePinned;
                if (state?.style == null) control.removeAttribute('style');
                else control.setAttribute('style', state.style);
            },

            _restoreSplitLiveHeaderActionPins() {
                const pinned = this._splitLiveActionPinned;
                if (pinned) {
                    pinned.forEach((state, control) => this._restoreSplitLiveHeaderActionPin(control, state));
                    pinned.clear();
                }
                this._splitLiveActionPinned = null;

                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                if (actions) {
                    actions.hidden = true;
                    actions.style.removeProperty('width');
                    actions.style.removeProperty('min-width');
                }
            },

            _setSplitLiveHeaderActionPinsHidden(hidden) {
                this._splitLiveActionPinned?.forEach((_, control) => {
                    if (!control?.isConnected) return;
                    control.style.setProperty('visibility', hidden ? 'hidden' : 'visible', 'important');
                });
            },

            _layoutSplitLiveHeaderActions() {
                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                const pinned = this._splitLiveActionPinned;
                if (!actions || !pinned?.size) return;

                const controls = Array.from(pinned.keys()).filter(control => control?.isConnected);
                if (!controls.length) {
                    this._restoreSplitLiveHeaderActionPins();
                    return;
                }

                const gap = 8;
                const naturalMetrics = controls.map(control => {
                    const rect = control.getBoundingClientRect();
                    const naturalWidth = Math.max(32, Math.ceil(rect.width || control.offsetWidth || 96));
                    return {
                        control,
                        naturalWidth: Math.min(180, naturalWidth),
                        height: Math.max(32, Math.ceil(rect.height || control.offsetHeight || 32))
                    };
                });
                actions.hidden = false;
                actions.style.width = '100%';
                actions.style.minWidth = '0';
                actions.style.maxWidth = '100%';

                const box = actions.getBoundingClientRect();
                const availableWidth = Math.max(32, box.width || actions.clientWidth || 32);
                const gapWidth = gap * Math.max(0, naturalMetrics.length - 1);
                const controlWidth = Math.max(32, Math.floor((availableWidth - gapWidth) / naturalMetrics.length));
                const metrics = naturalMetrics.map(item => ({
                    ...item,
                    width: Math.min(item.naturalWidth, controlWidth)
                }));
                const totalWidth = metrics.reduce((sum, item) => sum + item.width, 0) + gapWidth;
                const topBase = box.top + Math.max(0, (box.height - 32) / 2);
                const clampedWidth = Math.min(totalWidth, Math.max(32, box.width || actions.clientWidth || totalWidth));
                let left = Math.max(box.left, box.right - clampedWidth);

                metrics.forEach(({ control, width, height }) => {
                    const top = topBase + Math.max(0, (32 - height) / 2);
                    control.dataset.ytkitSplitLivePinned = '1';
                    control.style.setProperty('position', 'fixed', 'important');
                    control.style.setProperty('left', `${Math.round(left)}px`, 'important');
                    control.style.setProperty('top', `${Math.round(top)}px`, 'important');
                    control.style.setProperty('z-index', '10006', 'important');
                    control.style.setProperty('pointer-events', 'auto', 'important');
                    control.style.setProperty('visibility', this._fullscreenHidden ? 'hidden' : 'visible', 'important');
                    control.style.setProperty('transform', 'none', 'important');
                    control.style.setProperty('width', `${width}px`, 'important');
                    control.style.setProperty('min-width', '0', 'important');
                    control.style.setProperty('max-width', `${width}px`, 'important');
                    control.style.setProperty('overflow', 'hidden', 'important');
                    left += width + gap;
                });
            },

            _pinSplitLiveHeaderActions(controls, actions) {
                if (!this._splitLiveActionPinned) this._splitLiveActionPinned = new Map();
                const current = new Set(controls);

                this._splitLiveActionPinned.forEach((state, control) => {
                    if (current.has(control) && control.isConnected) return;
                    this._restoreSplitLiveHeaderActionPin(control, state);
                    this._splitLiveActionPinned.delete(control);
                });

                controls.forEach(control => {
                    if (!this._splitLiveActionPinned.has(control)) {
                        this._splitLiveActionPinned.set(control, {
                            style: control.getAttribute('style')
                        });
                    }
                    this._polishSplitLiveHeaderAction(control);
                });

                actions.hidden = controls.length === 0;
                if (!controls.length) {
                    actions.style.removeProperty('width');
                    actions.style.removeProperty('min-width');
                    return false;
                }

                this._layoutSplitLiveHeaderActions();
                return true;
            },

            _dockSplitLiveHeaderActions() {
                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                if (!actions) return false;

                const controls = [
                    this._findSplitLikeControl(),
                    this._findSplitSubscribeControl()
                ].filter(Boolean);

                return this._pinSplitLiveHeaderActions(controls, actions);
            },

            _dockSplitActions() {
                if (!this._isActive || !this._isSplit) return;
                if (this._videoType === 'live') {
                    this._dockSplitLiveHeaderActions();
                    return;
                }
                this._restoreSplitLiveHeaderActionPins();
                this._dockSplitHeader();

                const dock = this._ensureSplitActionDock();
                if (!dock) return;

                this._dockSplitControl(this._findSplitNotificationControl(), dock);
                this._dockSplitControl(this._findSplitPageControl(), dock);
                this._dockSplitControl(this._findSplitLikeControl(), dock);
                this._dockSplitControl(this._findSplitDownloadControl(), dock);

                const hasControls = dock.children.length > 0;
                dock.hidden = !hasControls;
                const topRow = dock.closest('#top-row');
                if (topRow) {
                    if (hasControls) topRow.dataset.ytkitSplitActionsDocked = '1';
                    else delete topRow.dataset.ytkitSplitActionsDocked;
                }
            },

            _startSplitActionDock() {
                if (!this._isActive || !this._isSplit) return;

                if (this._videoType === 'live') this._dockSplitLiveHeaderActions();
                else {
                    this._dockSplitHeader();
                    this._dockSplitActions();
                }
                if (this._splitActionDockObserver) return;

                const metadata = this._getBelow()?.querySelector('ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata');
                if (!metadata) return;

                this._splitActionDockObserver = new MutationObserver(() => {
                    this._scheduleSplitActionDock(80);
                });
                this._splitActionDockObserver.observe(metadata, { childList: true, subtree: true });
            },

            _restoreSplitActionDock() {
                clearTimeout(this._splitActionDockTimer);
                this._splitActionDockTimer = null;
                this._splitActionDockObserver?.disconnect();
                this._splitActionDockObserver = null;
                this._restoreSplitHeader();

                const moved = this._splitActionDockMoved;
                if (moved) {
                    moved.forEach(({ parent, next }, control) => {
                        delete control.dataset.ytkitSplitDocked;
                        if (!control.isConnected || !parent?.isConnected) return;
                        if (next?.parentNode === parent) parent.insertBefore(control, next);
                        else parent.appendChild(control);
                    });
                    moved.clear();
                }
                this._splitActionDockMoved = null;
                this._restoreSplitLiveHeaderActionPins();
                this._removeSplitLiveHeader();

                document.querySelectorAll('.ytkit-split-owner-actions').forEach(dock => dock.remove());
                document.querySelectorAll('[data-ytkit-split-actions-docked]').forEach(row => {
                    delete row.dataset.ytkitSplitActionsDocked;
                });
                this._splitActionDock = null;
            },

            // Bulk set/remove style properties with !important
            _setStyles(el, props) {
                if (!el) return;
                for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, 'important');
            },
            _removeStyles(el, props) {
                if (!el) return;
                props.forEach(p => el.style.removeProperty(p));
            },

            _stashSplitInlineStyles(el, properties) {
                if (!el?.style) return;
                let stash = this._splitInlineStyleStash.get(el);
                if (!stash) {
                    stash = new Map();
                    this._splitInlineStyleStash.set(el, stash);
                }
                for (const property of properties) {
                    if (stash.has(property)) continue;
                    stash.set(property, {
                        value: el.style.getPropertyValue(property),
                        priority: el.style.getPropertyPriority(property)
                    });
                }
            },

            _restoreSplitInlineStyles(el, properties) {
                const stash = this._splitInlineStyleStash.get(el);
                if (!el?.style || !stash) return;
                for (const property of properties) {
                    const original = stash.get(property);
                    if (!original) continue;
                    if (original.value) el.style.setProperty(property, original.value, original.priority);
                    else el.style.removeProperty(property);
                }
            },

            _restoreAllSplitInlineStyles() {
                for (const [el, properties] of this._splitInlineStyleStash) {
                    this._restoreSplitInlineStyles(el, properties.keys());
                }
                this._splitInlineStyleStash.clear();
            },

            _stashPlayerGeometry(el, properties) {
                if (!el || this._playerGeometryStash.some(entry => entry.el === el)) return;
                this._playerGeometryStash.push({
                    el,
                    properties: properties.map(property => ({
                        property,
                        value: el.style.getPropertyValue(property),
                        priority: el.style.getPropertyPriority(property)
                    }))
                });
            },

            _restorePlayerGeometry() {
                for (const { el, properties } of this._playerGeometryStash.splice(0)) {
                    if (!el?.style) continue;
                    for (const { property, value, priority } of properties) {
                        if (value) el.style.setProperty(property, value, priority);
                        else el.style.removeProperty(property);
                    }
                }
            },

            // Force/restore chat frame internals
            _forceChatFill(chatEl) {
                if (!chatEl) return;
                const fill = {width:'100%',height:'100%'};
                const showHide = chatEl.querySelector('#show-hide-button');
                const container = chatEl.querySelector('#container');
                const frame = chatEl.querySelector('iframe');
                this._stashSplitInlineStyles(showHide, ['display']);
                this._stashSplitInlineStyles(container, ['width','height','max-height','min-height','border-radius']);
                this._stashSplitInlineStyles(frame, ['width','height','min-height','border','border-radius']);
                this._setStyles(showHide, {display:'none'});
                this._setStyles(container, {...fill,'max-height':'none','min-height':'0','border-radius':'0'});
                this._setStyles(frame, {...fill,'min-height':'0',border:'none','border-radius':'0'});
            },
            _restoreChatFill(chatEl) {
                if (!chatEl) return;
                this._restoreSplitInlineStyles(chatEl.querySelector('#show-hide-button'), ['display']);
                this._restoreSplitInlineStyles(chatEl.querySelector('#container'), ['width','height','max-height','min-height','border-radius']);
                this._restoreSplitInlineStyles(chatEl.querySelector('iframe'), ['width','height','min-height','border','border-radius']);
            },

            // Position chat element over the right split panel
            _setupChat(chatEl, rightPct, top, height) {
                if (!chatEl) { this._waitForChat(rightPct, top, height); return; }
                this._positionChat(chatEl, rightPct, top, height);
            },

            _positionChat(chatEl, rightPct, top, height) {
                this._positionOverRight(chatEl, rightPct, top, height);
                chatEl.removeAttribute('collapsed');
                this._setStyles(chatEl, {width:`calc(${rightPct}% - 2px)`,padding:'0 8px 0 0','border-radius':'0'});
                this._forceChatFill(chatEl);
            },

            _prepareSecondaryForChat() {
                const sec = document.querySelector('#secondary');
                if (!sec) return;
                this._stashSplitInlineStyles(sec, ['display', 'pointer-events']);
                sec.style.setProperty('display', 'block', 'important');
                sec.style.setProperty('pointer-events', 'none', 'important');
                sec.dataset.ytkitSplitHidden = '1';
                const related = sec.querySelector('#related');
                if (related) {
                    this._stashSplitInlineStyles(related, ['display']);
                    related.dataset.ytkitSplitHidden = '1';
                    related.style.display = 'none';
                }
            },

            _stopChatObserver() {
                clearTimeout(this._chatObserverTimer);
                this._chatObserverTimer = null;
                this._chatObserver?.disconnect();
                this._chatObserver = null;
            },

            _handleChatFound(chatEl, options = {}) {
                if (!chatEl || !this._isActive) return;
                const detectedType = VideoTypeDetector.refresh();
                const below = this._getBelow();
                const resolvedType = this._resolveSplitPanelType(detectedType, chatEl, below);
                this._videoType = resolvedType;
                if (resolvedType === 'live' || resolvedType === 'vod') {
                    this._prepareSecondaryForChat();
                } else {
                    DebugManager.log('Theater', `Late chat ignored, using ${resolvedType} comments panel`);
                    return;
                }
                if (!options.position || !this._isSplit) {
                    DebugManager.log('Theater', `Late chat detected, reclassified as ${this._videoType}`);
                    return;
                }

                let chatTop = options.topOffset;
                let chatHeight = options.heightStr;
                if (this._videoType === 'live') {
                    const liveHeaderTop = this._ensureSplitLiveHeader(options.rightPct);
                    chatTop = `${liveHeaderTop}px`;
                    chatHeight = `calc(100vh - ${liveHeaderTop}px)`;
                }
                this._positionChat(chatEl, options.rightPct, chatTop, chatHeight);
                if (!this._scrollTarget) this._scrollTarget = chatEl;
                if (this._videoType === 'vod') {
                    this._stashSplitInlineStyles(chatEl, ['border-bottom']);
                    chatEl.style.setProperty('border-bottom', '2px solid var(--ytkit-split-border)', 'important');
                    const below = this._getBelow();
                    if (below && parseFloat(below.style.getPropertyValue('top')) === 0) {
                        below.style.setProperty('top', '45vh', 'important');
                        below.style.setProperty('height', '55vh', 'important');
                    }
                }
                DebugManager.log('Theater', 'Late chat frame found and positioned');
            },

            _watchForChat(options = {}) {
                this._stopChatObserver();
                const existing = this._getChatEl();
                if (existing) { this._handleChatFound(existing, options); return; }
                this._chatObserver = new MutationObserver(() => {
                    const chatEl = this._getChatEl();
                    if (!chatEl) return;
                    this._stopChatObserver();
                    this._handleChatFound(chatEl, options);
                });
                this._chatObserver.observe(document.body, { childList: true, subtree: true });
                this._chatObserverTimer = setTimeout(() => this._stopChatObserver(), options.timeoutMs || 10000);
            },

            // Wait for chat frame via MutationObserver (replaces 10s polling loop)
            _waitForChat(rightPct, topOffset, heightStr) {
                this._watchForChat({
                    position: true,
                    rightPct,
                    topOffset,
                    heightStr,
                    timeoutMs: 10000
                });
            },

            // ── Build the fixed overlay (video full-width, right panel hidden) ──
            _buildOverlay() {
                const wrapper = document.createElement('div');
                wrapper.id = 'ytkit-split-wrapper';
                wrapper.style.cssText = `display:flex;position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:transparent;overflow:hidden;pointer-events:none;`;

                // LEFT — full width initially
                const left = document.createElement('div');
                left.id = 'ytkit-split-left';
                // flex:1 — left fills whatever space the right panel doesn't take.
                // No fixed width, no transition needed — it reacts automatically.
                left.style.cssText = `flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:center;background:transparent;position:relative;pointer-events:none;`;

                // DIVIDER — hidden until split
                const divider = document.createElement('div');
                divider.id = 'ytkit-split-divider';
                divider.tabIndex = -1;
                divider.setAttribute('role', 'separator');
                divider.setAttribute('aria-orientation', 'vertical');
                divider.setAttribute('aria-label', t('stickyVideoResizePanelsLabel', 'Resize Theater Split panels'));
                divider.setAttribute('aria-controls', 'ytkit-split-right');
                divider.setAttribute('aria-expanded', 'false');
                divider.setAttribute('aria-valuemin', '25');
                divider.setAttribute('aria-valuemax', '100');
                divider.setAttribute('aria-valuenow', '100');
                divider.setAttribute('aria-hidden', 'true');
                divider.dataset.ytkitPanelState = 'hidden';
                divider.title = t('stickyVideoResizePanelsLabel', 'Resize Theater Split panels');
                divider.style.cssText = `flex:0 0 0;width:0;cursor:col-resize;position:relative;background:var(--ytkit-split-canvas);transition:flex-basis 0.35s cubic-bezier(0.4,0,0.2,1);overflow:hidden;z-index:10;pointer-events:auto;scrollbar-width:none;color:var(--ytkit-split-muted);`;
                const pip = document.createElement('div');
                pip.className = 'ytkit-divider-pip';
                pip.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:2px;height:46px;border-radius:0;background:var(--ytkit-split-muted);pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--ytkit-split-muted);`;
                // Three-dot grip pattern — universal drag indicator
                for (let i = 0; i < 3; i++) {
                    const dot = document.createElement('div');
                    dot.style.cssText = 'width:3px;height:3px;border-radius:0;background:currentColor;flex-shrink:0;';
                    pip.appendChild(dot);
                }
                divider.appendChild(pip);
                divider.addEventListener('mouseenter', () => { divider.style.background='rgba(var(--ytkit-split-accent-rgb),0.08)'; pip.style.background='rgba(var(--ytkit-split-accent-rgb),0.82)'; pip.style.color='var(--ytkit-split-text)'; });
                divider.addEventListener('mouseleave', () => { divider.style.background='var(--ytkit-split-canvas)'; pip.style.background='var(--ytkit-split-muted)'; pip.style.color='var(--ytkit-split-muted)'; });

                // RIGHT — collapsed initially
                const right = document.createElement('div');
                right.id = 'ytkit-split-right';
                // flex:0 0 0 — right starts at zero width, grows to a fixed size.
                // Left (flex:1) automatically shrinks as right expands.
                right.style.cssText = `flex:0 0 0;width:0;height:100%;overflow-y:auto;overflow-x:hidden;background:var(--ytkit-split-panel);border-left:1px solid var(--ytkit-split-border);scrollbar-width:thin;scrollbar-color:var(--ytkit-split-scrollbar) transparent;padding:0;box-sizing:border-box;opacity:0;transition:flex-basis 0.35s cubic-bezier(0.4,0,0.2,1),opacity 0.3s;pointer-events:auto;`;
                // wire divider to right panel now that it exists
                this._initDividerDrag(divider, left, right);

                // CLOSE button — low opacity, top-right of left panel
                const closeBtn = document.createElement('button');
                closeBtn.id = 'ytkit-split-close';
                closeBtn.title = t('stickyVideoCloseSidePanelTitle', 'Close side panel');
                closeBtn.setAttribute('aria-label', closeBtn.title);
                const svgNS = 'http://www.w3.org/2000/svg';
                const cs = document.createElementNS(svgNS,'svg');
                cs.setAttribute('viewBox','0 0 24 24'); cs.setAttribute('width','13'); cs.setAttribute('height','13');
                cs.setAttribute('fill','none'); cs.setAttribute('stroke','currentColor'); cs.setAttribute('stroke-width','2.5');
                const cl1 = document.createElementNS(svgNS,'line'); cl1.setAttribute('x1','18'); cl1.setAttribute('y1','6'); cl1.setAttribute('x2','6'); cl1.setAttribute('y2','18');
                const cl2 = document.createElementNS(svgNS,'line'); cl2.setAttribute('x1','6'); cl2.setAttribute('y1','6'); cl2.setAttribute('x2','18'); cl2.setAttribute('y2','18');
                cs.appendChild(cl1); cs.appendChild(cl2);
                closeBtn.appendChild(cs);
                closeBtn.onclick = () => this._collapseSplit(true);
                left.appendChild(closeBtn);

                wrapper.appendChild(left);
                wrapper.appendChild(divider);
                wrapper.appendChild(right);
                return wrapper;
            },

            _setDividerPanelState(divider, open, leftPct = 100, visible = true) {
                if (!divider) return;
                divider.tabIndex = visible ? 0 : -1;
                divider.setAttribute('aria-expanded', String(open));
                divider.setAttribute('aria-valuenow', String(Math.round(open ? leftPct : 100)));
                divider.dataset.ytkitPanelState = visible ? (open ? 'open' : 'closed') : 'hidden';
                divider.toggleAttribute('aria-hidden', !visible);
            },

            _toggleSplitFromDivider() {
                if (!this._isActive || this._dismissed) return;
                if (this._isSplit) {
                    this._collapseSplit(false, { keepDivider: true });
                } else {
                    this._expandSplit();
                }
            },

            _applyDividerRatio(left, right, newLeftPct) {
                const newRightPct = 100 - newLeftPct;
                const wrapper = this._splitWrapper;
                const player = this._getPlayer();
                const divider = wrapper?.querySelector('#ytkit-split-divider');
                const strip = wrapper?.querySelector('#ytkit-split-collapse-strip');
                const positioned = this._positionedEls || [];
                right.style.flexBasis = newRightPct + '%';
                right.style.width     = newRightPct + '%';
                this._setDividerPanelState(divider, true, newLeftPct, true);
                document.documentElement.style.setProperty('--ytkit-split-right-width', `calc(${newRightPct}vw - 6px)`);
                if (player) player.style.setProperty('width', newLeftPct + '%', 'important');
                positioned.forEach(el => {
                    el.style.setProperty('width', `calc(${newRightPct}% - 2px)`, 'important');
                });
                if (this._splitLiveHeader) {
                    const liveHeaderTop = this._ensureSplitLiveHeader(newRightPct);
                    const chatEl = this._getChatEl();
                    if (chatEl) {
                        chatEl.style.setProperty('top', `${liveHeaderTop}px`, 'important');
                        chatEl.style.setProperty('height', `calc(100vh - ${liveHeaderTop}px)`, 'important');
                    }
                }
                if (strip) strip.style.width = `calc(${newRightPct}% - 2px)`;
                storageWrite('ytkit_split_ratio', newLeftPct);
            },

            _initDividerDrag(divider, left, right) {
                if (!right) return;

                divider.addEventListener('keydown', (e) => {
                    if (!this._isActive || this._dismissed) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this._toggleSplitFromDivider();
                        return;
                    }
                    if (!this._isSplit || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                    e.preventDefault();
                    const current = Number(divider.getAttribute('aria-valuenow')) || 68;
                    this._applyDividerRatio(left, right, Math.max(25, Math.min(85,
                        current + (e.key === 'ArrowLeft' ? -2 : 2))));
                    divider.style.flexBasis = `${DIVIDER_WIDTH_PX}px`;
                    divider.style.width = `${DIVIDER_WIDTH_PX}px`;
                    this._triggerPlayerResize();
                });

                // Assistive technology can activate the separator by issuing a
                // synthetic click without pointer events. Real pointer clicks
                // are handled on release so the drag threshold stays reliable.
                divider.addEventListener('click', (e) => {
                    if (e.detail !== 0) return;
                    e.preventDefault();
                    this._toggleSplitFromDivider();
                });

                // Shared drag logic for mouse and touch
                const startDrag = (startX) => {
                    if (!this._isActive || this._dismissed) return null;
                    const wrapper = this._splitWrapper;
                    const totalW = wrapper.getBoundingClientRect().width;
                    if (!Number.isFinite(totalW) || totalW <= 0) return null;
                    const measuredLeftPct = left.getBoundingClientRect().width / totalW * 100;
                    const startLeftPct = this._isSplit && Number.isFinite(measuredLeftPct)
                        ? measuredLeftPct
                        : 100;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';

                    const dragShield = document.createElement('div');
                    dragShield.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;cursor:col-resize;';
                    document.body.appendChild(dragShield);

                    let _dragRaf = null;
                    let dragged = false;
                    const previousTransition = right.style.transition;
                    const onDrag = (clientX) => {
                        const dx = clientX - startX;
                        if (!dragged && Math.abs(dx) < DIVIDER_DRAG_THRESHOLD_PX) return;
                        if (!dragged) {
                            dragged = true;
                            if (!this._isSplit) this._expandSplit();
                            if (!this._isSplit) return;
                            right.style.transition = 'none';
                        }
                        if (_dragRaf) cancelAnimationFrame(_dragRaf);
                        _dragRaf = requestAnimationFrame(() => {
                            const newLeftPct = Math.max(25, Math.min(85, startLeftPct + (dx / totalW * 100)));
                            this._applyDividerRatio(left, right, newLeftPct);
                            divider.style.flexBasis = `${DIVIDER_WIDTH_PX}px`;
                            divider.style.width = `${DIVIDER_WIDTH_PX}px`;
                        });
                    };
                    const cleanup = () => {
                        if (_dragRaf) cancelAnimationFrame(_dragRaf);
                        if (dragged) right.style.transition = previousTransition;
                        dragShield.remove();
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        this._triggerPlayerResize();
                    };
                    return { onDrag, cleanup, didDrag: () => dragged };
                };

                // Mouse drag
                divider.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    this._dividerDragCleanup?.();
                    e.preventDefault();
                    const ctx = startDrag(e.clientX);
                    if (!ctx) return;
                    let finished = false;
                    const onMove = (me) => ctx.onDrag(me.clientX);
                    const finish = (toggleOnTap) => {
                        if (finished) return;
                        finished = true;
                        this._dividerDragCleanup = null;
                        const dragged = ctx.didDrag();
                        ctx.cleanup();
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                        window.removeEventListener('blur', onCancel);
                        document.removeEventListener('mouseleave', onCancel);
                        if (toggleOnTap && !dragged) this._toggleSplitFromDivider();
                    };
                    const onUp = () => finish(true);
                    const onCancel = () => finish(false);
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                    window.addEventListener('blur', onCancel);
                    document.addEventListener('mouseleave', onCancel);
                    this._dividerDragCleanup = onCancel;
                });

                // Touch drag
                divider.addEventListener('touchstart', (e) => {
                    const t = e.touches[0];
                    if (!t) return;
                    this._dividerDragCleanup?.();
                    e.preventDefault();
                    const ctx = startDrag(t.clientX);
                    if (!ctx) return;
                    let finished = false;
                    const onTouchMove = (te) => {
                        const tt = te.touches[0];
                        if (!tt) return;
                        if (te.cancelable) te.preventDefault();
                        ctx.onDrag(tt.clientX);
                    };
                    const finish = (toggleOnTap) => {
                        if (finished) return;
                        finished = true;
                        this._dividerDragCleanup = null;
                        const dragged = ctx.didDrag();
                        ctx.cleanup();
                        window.removeEventListener('touchmove', onTouchMove);
                        window.removeEventListener('touchend', onTouchEnd);
                        window.removeEventListener('touchcancel', onTouchCancel);
                        if (toggleOnTap && !dragged) this._toggleSplitFromDivider();
                    };
                    const onTouchEnd = () => finish(true);
                    const onTouchCancel = () => finish(false);
                    window.addEventListener('touchmove', onTouchMove, { passive: false });
                    window.addEventListener('touchend', onTouchEnd);
                    window.addEventListener('touchcancel', onTouchCancel);
                    this._dividerDragCleanup = onTouchCancel;
                });
            },

            // ── Mount overlay (video fullscreen, comments hidden) ──
            _mountOverlay() {
                if (this._isActive) return;
                const player = this._getPlayer();
                const below  = this._getBelow();
                if (!player) return;
                // For live streams, #below may not exist yet — that's OK
                if (!below && !VideoTypeDetector.hasChat()) return;

                // Video type already set by _activate
                this._positionedEls = [];
                this._scrollTarget = null;

                this._isActive = true;

                const wrapper = this._buildOverlay();
                this._splitWrapper = wrapper;
                wrapper.style.opacity = '0';
                document.body.appendChild(wrapper);
                // Smooth fade-in on first mount
                requestAnimationFrame(() => {
                    wrapper.style.transition = 'opacity 0.3s ease';
                    wrapper.style.opacity = '1';
                });

                const left  = wrapper.querySelector('#ytkit-split-left');
                const right = wrapper.querySelector('#ytkit-split-right');

                // Fix player in place — NO reparenting. Avoids Chrome losing the video
                // GPU compositor surface when the window moves between monitors.
                // The overlay's left panel is transparent, so the player shows through.
                this._stashPlayerGeometry(player, [
                    'position', 'top', 'left', 'width', 'height', 'z-index',
                    'background', 'min-height', 'margin', 'padding', 'max-width', 'overflow'
                ]);
                this._setStyles(player, {
                    position: 'fixed', top: '0', left: '0',
                    width: '100%', height: '100vh',
                    'z-index': '9998', background: '#000',
                    'min-height': '0', margin: '0', padding: '0',
                    'max-width': 'none', overflow: 'hidden'
                });

                // Force #movie_player to fill parent — clear YT's inline px dimensions
                // Batched: runs at most once per frame, and stops after layout stabilizes
                let _fpsPending = false;
                let _fpsCount = 0;
                const forcePlayerSize = () => {
                    if (_fpsPending || _fpsCount > 5) return; // Stop after 5 cycles to prevent fight with YT
                    _fpsPending = true;
                    _fpsCount++;
                    requestAnimationFrame(() => {
                        _fpsPending = false;
                        if (!this._isActive) return;
                        const mp = document.getElementById('movie_player');
                        if (!mp) return;
                        this._stashPlayerGeometry(mp, ['width', 'height']);
                        mp.style.setProperty('width',  '100%', 'important');
                        mp.style.setProperty('height', '100%', 'important');
                        const vc = mp.querySelector('.html5-video-container');
                        const vid = mp.querySelector('video.html5-main-video');
                        this._stashPlayerGeometry(vc, ['width', 'height']);
                        this._stashPlayerGeometry(vid, ['width', 'height', 'object-fit']);
                        if (vc)  { vc.style.setProperty('width','100%','important'); vc.style.setProperty('height','100%','important'); }
                        if (vid) { vid.style.setProperty('width','100%','important'); vid.style.setProperty('height','100%','important'); vid.style.setProperty('object-fit','contain','important'); }
                        const ytdP = mp.closest('ytd-player');
                        const innerCont = ytdP?.querySelector('#container');
                        this._stashPlayerGeometry(innerCont, ['width', 'height', 'padding-bottom']);
                        if (innerCont) { innerCont.style.setProperty('width','100%','important'); innerCont.style.setProperty('height','100%','important'); innerCont.style.setProperty('padding-bottom','0','important'); }
                    });
                };
                forcePlayerSize();

                // Single ResizeObserver on left panel — debounced to avoid fight with YT's player
                // Also syncs player width with left panel since player is positioned separately
                this._playerResizeObs = new ResizeObserver(() => {
                    clearTimeout(this._playerResizeDebounceTimer);
                    this._playerResizeDebounceTimer = setTimeout(() => {
                        this._playerResizeDebounceTimer = null;
                        _fpsCount = 0;
                        forcePlayerSize();
                        const leftW = left.getBoundingClientRect().width;
                        if (leftW > 0) player.style.setProperty('width', leftW + 'px', 'important');
                    }, 200);
                });
                this._playerResizeObs.observe(left);

                // Delayed resize trigger — wait for layout to settle before telling YT to recalculate
                this._initResizeTimer = setTimeout(() => this._triggerPlayerResize(), 600);

                // #below stays in original DOM — overlay at z-index:9999 hides it visually.
                // DO NOT set visibility:hidden — it can prevent IntersectionObserver from firing.
                // Just block interaction until split expands.
                if (below) {
                    this._stashSplitInlineStyles(below, ['pointer-events']);
                    below.style.setProperty('pointer-events', 'none', 'important');
                }

                // For live/VOD: also hide the chat frame behind overlay
                const chatEl = this._getChatEl();
                if (chatEl) {
                    this._stashSplitInlineStyles(chatEl, ['pointer-events']);
                    chatEl.style.setProperty('pointer-events', 'none', 'important');
                    // Ensure chat iframe isn't collapsed (YT collapses it sometimes)
                    chatEl.removeAttribute('collapsed');
                }

                // Pre-scroll to comments so YT's IO fires (behind the overlay, invisible).
                // Deferred heavily to avoid interfering with video load. Only for standard/VOD.
                if (this._videoType !== 'live' && below) {
                    const scrollToComments = () => {
                        this._scrollToCommentsTimer = null;
                        this._scrollToCommentsIdle = null;
                        if (!this._isActive) return;
                        const commentsEl = below.querySelector('ytd-comments');
                        if (commentsEl) commentsEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                    };
                    clearTimeout(this._scrollToCommentsTimer);
                    this._scrollToCommentsTimer = null;
                    if (this._scrollToCommentsIdle !== null && typeof cancelIdleCallback === 'function') {
                        cancelIdleCallback(this._scrollToCommentsIdle);
                    }
                    this._scrollToCommentsIdle = null;
                    if (typeof requestIdleCallback === 'function') {
                        this._scrollToCommentsIdle = requestIdleCallback(scrollToComments, { timeout: 2000 });
                    } else {
                        this._scrollToCommentsTimer = setTimeout(scrollToComments, 800);
                    }
                }

                // Hide related videos sidebar — but NOT the chat frame container.
                // On live/VOD pages, ytd-live-chat-frame is inside #secondary.
                // Hiding #secondary with display:none kills the chat completely.
                const sec = document.querySelector('#secondary');
                if (sec) {
                    if (this._videoType === 'live' || this._videoType === 'vod') {
                        // Only hide #related, keep #secondary visible for chat.
                        // Force display:block to override hideRelatedVideos CSS !important
                        const related = sec.querySelector('#related');
                        if (related) {
                            this._stashSplitInlineStyles(related, ['display']);
                            related.dataset.ytkitSplitHidden='1';
                            related.style.display='none';
                        }
                        this._stashSplitInlineStyles(sec, ['display', 'pointer-events']);
                        sec.style.setProperty('display', 'block', 'important');
                        sec.style.setProperty('pointer-events', 'none', 'important');
                        sec.dataset.ytkitSplitHidden='1';
                    } else {
                        this._stashSplitInlineStyles(sec, ['display']);
                        sec.dataset.ytkitSplitHidden='1'; sec.style.display='none';
                    }
                }

                // Watch for late chat frame insertion — if we mounted as 'standard'
                // but a chat frame appears later (SPA race), reclassify and un-hide #secondary.
                // The same lifecycle also handles split-open positioning from _waitForChat().
                if (this._videoType === 'standard' && !this._getChatEl()) {
                    this._watchForChat({ position: false, timeoutMs: 15000 });
                }

                // Masthead hidden via CSS class added in _activate()
                const mast = document.querySelector('ytd-masthead, #masthead');
                if (mast) this._mastheadDisplay = mast.style.display;

                // Cache right panel ref for wheel handler (avoid querySelector in hot path)
                const rightRef = right;

                // Check if event target is in any positioned content element
                const isInRightContent = (target) => {
                    if (rightRef.contains(target)) return true;
                    return (this._positionedEls || []).some(el => el.contains(target));
                };

                // Wheel/touch on document capture — the overlay has pointer-events:none
                // so events target the player directly. Use capture on document to intercept
                // before YouTube's player can stopPropagation (volume control).
                const isOverPlayer = (target) => {
                    const mp = document.getElementById('movie_player');
                    return mp && mp.contains(target);
                };
                // Scroll-up-over-video collapse: require 3 consecutive scroll-up
                // ticks within 600ms to prevent accidental collapse from a single
                // inertial gesture (mirrors the right-panel collapse guard).
                this._wheelHandler = (e) => {
                    if (!this._isActive) return;

                    // Before split opens: scroll-down over player → expand
                    if (!this._isSplit) {
                        if (e.deltaY > 0 && isOverPlayer(e.target)) {
                            e.stopPropagation();
                            this._expandSplit();
                        }
                        return;
                    }

                    // ── Split is open ──
                    // The entire viewport is either the player (left) or the
                    // right panel content.  No isInRightContent gate needed —
                    // any wheel event the user can physically generate is on
                    // one of these two surfaces.
                    //
                    // Scrolling over the VIDEO never collapses. It used to, on a
                    // 3-tick guard, which meant nudging the wheel while the
                    // pointer happened to rest over the player threw the split
                    // away mid-read. Collapse is now owned solely by the
                    // comments pane reaching its top — see _rightWheelHandler.
                    // Wheel over the player still proxies to that pane, in both
                    // directions, because the page scroller is disabled here.

                    // The positioned comments panel is a real overflow scroller.
                    // Let wheel events that originate inside it take the native
                    // compositor path; manually changing scrollTop as well made
                    // every tick scroll twice and forced extra main-thread work.
                    if (isInRightContent(e.target)) return;

                    // Forward wheel to the right panel scroll target.
                    // This only proxies gestures made over the fixed player,
                    // whose page scroller is intentionally disabled in split mode.
                    const scrollEl = this._scrollTarget;
                    if (scrollEl) {
                        e.stopPropagation();
                        scrollEl.scrollTop += e.deltaY;
                    }
                };
                this._touchStartY = 0;
                this._touchHandler = (e) => { const t = e.touches[0]; if (t) this._touchStartY = t.clientY; };
                this._touchMoveHandler = (e) => {
                    if (!this._isActive) return;
                    const t = e.touches[0]; if (!t) return;
                    if (!this._isSplit && this._touchStartY - t.clientY > 30 && isOverPlayer(e.target)) {
                        e.stopPropagation();
                        this._expandSplit();
                        return;
                    }
                    if (this._isSplit) {
                        // Preserve native touch scrolling and the target-level
                        // pull-to-collapse handler inside the comments panel.
                        if (isInRightContent(e.target)) return;
                        const delta = this._touchStartY - t.clientY;
                        // Same rule as the wheel path: a gesture over the video
                        // scrolls the comments pane and nothing else. The pull-
                        // to-collapse gesture lives on the pane itself
                        // (_rightTouchMoveHandler), so it still works — it just
                        // cannot be triggered from the player any more.
                        const scrollEl = this._scrollTarget;
                        if (scrollEl) {
                            e.stopPropagation();
                            scrollEl.scrollTop += delta * 0.5;
                        }
                        this._touchStartY = t.clientY;
                    }
                };
                document.addEventListener('wheel', this._wheelHandler, { passive: true, capture: true });
                document.addEventListener('touchstart', this._touchHandler, { passive: true, capture: true });
                document.addEventListener('touchmove', this._touchMoveHandler, { passive: true, capture: true });
                this._middleMouseHandler = (e) => this._startSplitAutoscroll(e);
                document.addEventListener('mousedown', this._middleMouseHandler, true);
                this._commentSelectionSelectStartHandler = (e) => {
                    if (!this._isSplitCommentTextTarget(e.target)) return;
                    e.stopImmediatePropagation?.();
                    e.stopPropagation();
                };
                window.addEventListener('selectstart', this._commentSelectionSelectStartHandler, true);

                // Re-layout on window resize
                this._windowResizeHandler = () => {
                    if (!this._isActive) return;
                    this._triggerPlayerResize();
                    this._layoutSplitLiveHeaderActions();
                };
                window.addEventListener('resize', this._windowResizeHandler);

                // Escape key collapses split panel (or unmounts if already collapsed)
                this._keyHandler = (e) => {
                    if (e.key !== 'Escape' || !this._isActive) return;
                    // Don't intercept escape when user is typing in an input/textarea
                    const tag = document.activeElement?.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
                    if (this._isSplit) {
                        this._collapseSplit(true);
                    }
                };
                document.addEventListener('keydown', this._keyHandler, true);

                // Hide overlay during native fullscreen — overlay at z-index:9999
                // would block player controls and conflict with browser fullscreen
                this._fullscreenHandler = () => {
                    const isFS = !!document.fullscreenElement;
                    const wrapper = this._splitWrapper;
                    if (!wrapper || !this._isActive) return;
                    if (isFS && !this._fullscreenHidden) {
                        this._fullscreenHidden = true;
                        wrapper.style.display = 'none';
                        if (this._splitLiveHeader) this._splitLiveHeader.style.display = 'none';
                        this._setSplitLiveHeaderActionPinsHidden(true);
                        // Hide positioned overlays (chat frame, #below) — they carry
                        // position:fixed z-index:10001 and would paint over the
                        // fullscreen player on live / previously-live videos.
                        this._fullscreenOverlayStash = [];
                        (this._positionedEls || []).forEach(el => {
                            if (!el) return;
                            this._fullscreenOverlayStash.push({ el, visibility: el.style.visibility });
                            el.style.setProperty('visibility', 'hidden', 'important');
                        });
                        // Restore player to natural sizing so fullscreen works
                        const player = this._getPlayer();
                        if (player) {
                            this._removeStyles(player, ['position', 'top', 'left', 'width', 'height',
                                'z-index', 'min-height', 'margin', 'padding', 'max-width', 'overflow']);
                        }
                        DebugManager.log('Theater', 'Overlay hidden for fullscreen');
                    } else if (!isFS && this._fullscreenHidden) {
                        this._fullscreenHidden = false;
                        wrapper.style.display = 'flex';
                        if (this._splitLiveHeader) this._splitLiveHeader.style.display = '';
                        this._setSplitLiveHeaderActionPinsHidden(false);
                        (this._fullscreenOverlayStash || []).forEach(({ el, visibility }) => {
                            if (!el) return;
                            if (visibility) el.style.setProperty('visibility', visibility, 'important');
                            else el.style.removeProperty('visibility');
                        });
                        this._fullscreenOverlayStash = null;
                        this._layoutSplitLiveHeaderActions();
                        // Re-fix player in place
                        const player = this._getPlayer();
                        if (player) {
                            // Collapsed state has no resize observer attached, so a
                            // px snapshot taken here would survive every later window
                            // resize until the next expand. Only the split state —
                            // where the observer keeps the width in sync — gets px.
                            const leftW = this._isSplit
                                ? (wrapper.querySelector('#ytkit-split-left')?.getBoundingClientRect().width || 0)
                                : 0;
                            this._setStyles(player, {
                                position: 'fixed', top: '0', left: '0',
                                width: leftW > 0 ? leftW + 'px' : '100%', height: '100vh',
                                'z-index': '9998', background: '#000',
                                'min-height': '0', margin: '0', padding: '0',
                                'max-width': 'none', overflow: 'hidden'
                            });
                        }
                        this._triggerPlayerResize();
                        DebugManager.log('Theater', 'Overlay restored after fullscreen');
                    }
                };
                document.addEventListener('fullscreenchange', this._fullscreenHandler);

                DebugManager.log('Theater', 'Overlay mounted');
            },

            // ── Expand right panel (show comments/chat) ──
            _expandSplit() {
                if (this._isSplit || !this._isActive || this._dismissed) return;
                this._isSplit = true;
                this._entering = true;
                this._positionedEls = [];

                const wrapper = this._splitWrapper;
                const left    = wrapper.querySelector('#ytkit-split-left');

                // Reconnect resize observer
                if (this._playerResizeObs && left) this._playerResizeObs.observe(left);
                const right   = wrapper.querySelector('#ytkit-split-right');
                const divider = wrapper.querySelector('#ytkit-split-divider');
                const below   = this._getBelow();
                const chatEl  = this._getChatEl();
                const detectedType = chatEl ? VideoTypeDetector.refresh() : this._videoType;
                this._videoType = this._resolveSplitPanelType(detectedType, chatEl, below);
                const type    = this._videoType;
                document.documentElement.classList.toggle('ytkit-split-live', type === 'live');

                const closeBtn = wrapper.querySelector('#ytkit-split-close');
                if (closeBtn) { closeBtn.style.display = 'flex'; closeBtn.style.opacity = '1'; }

                let leftPct = parseFloat(storageRead('ytkit_split_ratio', 68));
                if (!Number.isFinite(leftPct)) leftPct = 68;
                leftPct = Math.max(25, Math.min(85, leftPct));
                const rightPct = 100 - leftPct;
                document.documentElement.classList.add('ytkit-split-open');
                document.documentElement.style.setProperty('--ytkit-split-right-width', `calc(${rightPct}vw - 6px)`);

                // Expand overlay's right panel placeholder
                right.style.flexBasis = rightPct + '%';
                right.style.width     = rightPct + '%';
                divider.style.flexBasis = `${DIVIDER_WIDTH_PX}px`;
                divider.style.width     = `${DIVIDER_WIDTH_PX}px`;
                this._setDividerPanelState(divider, true, leftPct, true);

                // Sync player width — player is fixed-positioned separately
                const player = this._getPlayer();
                if (player) player.style.setProperty('width', leftPct + '%', 'important');
                if (type === 'live' || type === 'vod') {
                    // Right panel is just a spacer — chat overlays it via CSS fixed
                    right.style.opacity = '0';
                    right.style.background = 'transparent';
                    right.style.borderLeft = 'none';
                } else {
                    right.style.opacity = '1';
                }

                // Elements stay in original DOM (no reparenting) so YT's IO works.
                if (type === 'live') {
                    if (chatEl) this._prepareSecondaryForChat();
                    const liveHeaderTop = this._ensureSplitLiveHeader(rightPct);
                    this._setupChat(chatEl, rightPct, `${liveHeaderTop}px`, `calc(100vh - ${liveHeaderTop}px)`);
                    this._scrollTarget = chatEl;
                } else if (type === 'vod') {
                    if (chatEl) this._prepareSecondaryForChat();
                    this._setupChat(chatEl, rightPct, '0', '45vh');
                    if (chatEl) {
                        this._stashSplitInlineStyles(chatEl, ['border-bottom']);
                        chatEl.style.setProperty('border-bottom', '2px solid rgba(255,255,255,0.1)', 'important');
                    }
                    if (below) {
                        const hasChat = !!chatEl;
                        this._positionOverRight(below, rightPct, hasChat ? '45vh' : '0', hasChat ? '55vh' : '100vh');
                        this._setStyles(below, {width:`calc(${rightPct}% - 2px)`,padding:'16px 14px 72px'});
                    }
                    this._scrollTarget = chatEl || below;
                } else {
                    if (below) {
                        this._positionOverRight(below, rightPct, '0', '100vh');
                        this._setStyles(below, {width:`calc(${rightPct}% - 2px)`,padding:'16px 14px 72px'});
                        this._scrollTarget = below;
                    }
                }
                this._startSplitActionDock();

                const onExpanded = () => {
                    if (right) right.removeEventListener('transitionend', onTransEnd);
                    clearTimeout(this._expandFallbackTimer);
                    this._expandFallbackTimer = null;
                    this._entering = false;
                    this._triggerPlayerResize();
                    // For standard/VOD: scroll to top to show video title
                    if (type !== 'live' && below) {
                        below.scrollTop = 0;
                    }
                    // Re-inject download/action buttons — Polymer may have re-rendered
                    // #top-level-buttons-computed when the player was reparented
                    if (typeof checkAllButtons === 'function') {
                        checkAllButtons();
                        this._scheduleSplitActionDock(0);
                        clearTimeout(this._postExpandButtonsTimer);
                        this._postExpandButtonsTimer = setTimeout(() => {
                            this._postExpandButtonsTimer = null;
                            if (!this._isActive || !this._isSplit) return;
                            checkAllButtons();
                            this._scheduleSplitActionDock(0);
                        }, 500);
                    }
                };
                const onTransEnd = (e) => {
                    if (e.propertyName === 'flex-basis' || e.propertyName === 'opacity') onExpanded();
                };
                right.addEventListener('transitionend', onTransEnd);
                clearTimeout(this._expandFallbackTimer);
                this._expandFallbackTimer = setTimeout(() => {
                    this._expandFallbackTimer = null;
                    if (this._entering) onExpanded();
                }, 500);

                // Collapse is owned entirely by this pane. The split stays up
                // until the reader scrolls the comments column all the way back
                // to the top — past the title card that sits above the comments
                // — and keeps pulling up. The tick count is what makes "past
                // the title" mean something: landing on the top edge does not
                // collapse, continuing to scroll against it does.
                const scrollEl = this._scrollTarget;
                let _collapseScrollCount = 0;
                let _collapseScrollTimer = null;
                if (scrollEl) {
                    this._rightWheelHandler = (e) => {
                        if (scrollEl.scrollTop <= 0 && e.deltaY < 0) {
                            _collapseScrollCount++;
                            clearTimeout(_collapseScrollTimer);
                            _collapseScrollTimer = setTimeout(() => { _collapseScrollCount = 0; }, 600);
                            if (_collapseScrollCount >= 3) {
                                _collapseScrollCount = 0;
                                this._collapseSplit(false);
                            }
                        } else {
                            _collapseScrollCount = 0;
                        }
                    };
                    this._rightTouchStartY = 0;
                    this._rightTouchHandler = (e) => {
                        const t = e.touches[0]; if (t) this._rightTouchStartY = t.clientY;
                    };
                    this._rightTouchMoveHandler = (e) => {
                        if (scrollEl.scrollTop !== 0) return;
                        const t = e.touches[0];
                        if (t && t.clientY - this._rightTouchStartY > 40) this._collapseSplit(false);
                    };
                    scrollEl.addEventListener('wheel', this._rightWheelHandler, { passive: true });
                    scrollEl.addEventListener('touchstart', this._rightTouchHandler, { passive: true });
                    scrollEl.addEventListener('touchmove', this._rightTouchMoveHandler, { passive: true });
                }

                // For live/VOD: chat iframe swallows wheel events (cross-origin).
                // Add a collapse trigger strip at top of right panel above the iframe z-index.
                if (type === 'live' || type === 'vod') {
                    const strip = document.createElement('div');
                    strip.id = 'ytkit-split-collapse-strip';
                    strip.style.width = `calc(${rightPct}% - 6px)`;
                    strip.addEventListener('wheel', (e) => {
                        if (e.deltaY < 0) this._collapseSplit(false);
                    }, { passive: true });
                    strip.addEventListener('touchstart', (e) => {
                        const t = e.touches[0]; if (t) strip._touchY = t.clientY;
                    }, { passive: true });
                    strip.addEventListener('touchmove', (e) => {
                        const t = e.touches[0];
                        if (t && t.clientY - (strip._touchY || 0) > 30) this._collapseSplit(false);
                    }, { passive: true });
                    strip.addEventListener('click', () => this._collapseSplit(false));
                    wrapper.appendChild(strip);
                }

                DebugManager.log('Theater', `Split expanded (${type})`);
            },

            // ── Collapse right panel (back to fullscreen video) ──
            _collapseSplit(dismissed, options = {}) {
                if (!this._isSplit) return;
                this._isSplit = false;
                if (dismissed) this._dismissed = true;
                const keepDivider = !dismissed && options.keepDivider === true;
                // Clear `_entering` in case we collapse before the expand
                // transition completed. Otherwise the 500 ms fallback timer in
                // `_expandSplit` would still see `_entering === true` and call
                // `onExpanded()` on an already-collapsed panel, re-triggering
                // `_triggerPlayerResize()` and `checkAllButtons()`.
                this._entering = false;
                clearTimeout(this._expandFallbackTimer);
                this._expandFallbackTimer = null;
                clearTimeout(this._postExpandButtonsTimer);
                this._postExpandButtonsTimer = null;
                clearTimeout(this._playerResizeDebounceTimer);
                this._playerResizeDebounceTimer = null;
                document.documentElement.classList.remove('ytkit-split-open');
                document.documentElement.classList.remove('ytkit-split-live');
                document.documentElement.style.removeProperty('--ytkit-split-right-width');
                this._restoreSplitActionDock();
                this._stopSplitAutoscroll();

                const wrapper = this._splitWrapper;
                const right   = wrapper.querySelector('#ytkit-split-right');
                const divider = wrapper.querySelector('#ytkit-split-divider');
                const closeBtn = wrapper.querySelector('#ytkit-split-close');

                // Remove scroll handlers from scroll target
                const scrollEl = this._scrollTarget;
                if (this._rightWheelHandler && scrollEl) {
                    scrollEl.removeEventListener('wheel', this._rightWheelHandler);
                    scrollEl.removeEventListener('touchstart', this._rightTouchHandler);
                    scrollEl.removeEventListener('touchmove', this._rightTouchMoveHandler);
                    this._rightWheelHandler = null;
                    this._rightTouchHandler = null;
                    this._rightTouchMoveHandler = null;
                }

                // Collapse overlay placeholder
                right.style.flexBasis = '0';
                right.style.width     = '0';
                divider.style.flexBasis = keepDivider ? `${DIVIDER_WIDTH_PX}px` : '0';
                divider.style.width     = keepDivider ? `${DIVIDER_WIDTH_PX}px` : '0';
                this._setDividerPanelState(divider, false, 100, keepDivider);
                right.style.padding = '0';
                right.style.opacity = '0';

                // Restore player to full width
                const player = this._getPlayer();
                if (player) player.style.setProperty('width', '100%', 'important');

                // Unposition all elements and hide behind overlay
                this._unpositionAll();
                const below = this._getBelow();
                if (below) below.style.setProperty('pointer-events', 'none', 'important');
                // Clean the RAW frame: after SPA reuse YouTube may have flipped
                // it to a hidden placeholder, and the candidate-filtered
                // _getChatEl() would skip cleanup of styles set on it earlier.
                const chatEl = VideoTypeDetector.getChatEl();
                if (chatEl) {
                    chatEl.style.setProperty('pointer-events', 'none', 'important');
                    this._restoreChatFill(chatEl);
                }

                if (closeBtn) { closeBtn.style.display = 'none'; closeBtn.style.opacity = '0'; }

                // Remove collapse trigger strip
                wrapper.querySelector('#ytkit-split-collapse-strip')?.remove();

                // Pause resize observer while collapsed
                this._playerResizeObs?.disconnect();

                this._triggerPlayerResize();
                DebugManager.log('Theater', 'Split collapsed');
            },

            // ── Unmount overlay entirely (navigate away / feature disabled) ──
            _unmount(keepClass) {
                if (!this._isActive) return;
                this._dividerDragCleanup?.();
                this._dividerDragCleanup = null;
                this._entering = false;
                clearTimeout(this._resizeTimer);
                this._resizeTimer = null;
                clearTimeout(this._initResizeTimer);
                this._initResizeTimer = null;
                this._stopChatObserver();
                clearTimeout(this._expandFallbackTimer);
                this._expandFallbackTimer = null;
                clearTimeout(this._postExpandButtonsTimer);
                this._postExpandButtonsTimer = null;
                clearTimeout(this._playerResizeDebounceTimer);
                this._playerResizeDebounceTimer = null;
                clearTimeout(this._scrollToCommentsTimer);
                this._scrollToCommentsTimer = null;
                if (this._scrollToCommentsIdle !== null && typeof cancelIdleCallback === 'function') {
                    cancelIdleCallback(this._scrollToCommentsIdle);
                }
                this._scrollToCommentsIdle = null;
                this._restoreSplitActionDock();
                this._stopSplitAutoscroll();

                // Remove scroll handlers from scroll target
                const scrollEl = this._scrollTarget;
                if (this._rightWheelHandler && scrollEl) {
                    scrollEl.removeEventListener('wheel', this._rightWheelHandler);
                    scrollEl.removeEventListener('touchstart', this._rightTouchHandler);
                    scrollEl.removeEventListener('touchmove', this._rightTouchMoveHandler);
                    this._rightWheelHandler = null;
                    this._rightTouchHandler = null;
                    this._rightTouchMoveHandler = null;
                }
                if (this._wheelHandler) {
                    document.removeEventListener('wheel', this._wheelHandler, true);
                    document.removeEventListener('touchstart', this._touchHandler, true);
                    document.removeEventListener('touchmove', this._touchMoveHandler, true);
                }
                this._wheelHandler = null;
                this._touchHandler = null;
                this._touchMoveHandler = null;
                if (this._middleMouseHandler) {
                    document.removeEventListener('mousedown', this._middleMouseHandler, true);
                    this._middleMouseHandler = null;
                }
                if (this._commentSelectionSelectStartHandler) {
                    window.removeEventListener('selectstart', this._commentSelectionSelectStartHandler, true);
                    this._commentSelectionSelectStartHandler = null;
                }
                if (this._windowResizeHandler) {
                    window.removeEventListener('resize', this._windowResizeHandler);
                    this._windowResizeHandler = null;
                }
                if (this._keyHandler) {
                    document.removeEventListener('keydown', this._keyHandler, true);
                    this._keyHandler = null;
                }
                if (this._fullscreenHandler) {
                    document.removeEventListener('fullscreenchange', this._fullscreenHandler);
                    this._fullscreenHandler = null;
                }
                this._fullscreenHidden = false;
                this._fullscreenOverlayStash = null;
                if (!keepClass) {
                    const masth = document.querySelector('ytd-masthead, #masthead');
                    if (masth && this._mastheadDisplay !== undefined) {
                        masth.style.display = this._mastheadDisplay || '';
                    }
                }
                this._mastheadDisplay = undefined;
                this._playerResizeObs?.disconnect();
                this._playerResizeObs = null;

                // Restore the exact inline geometry that YouTube owned before
                // Theater Split touched the player and its descendants.
                this._restorePlayerGeometry();

                // Restore all positioned elements — remove fixed positioning styles
                this._unpositionAll();
                const below = this._getBelow();
                // Raw lookup on purpose: a hidden placeholder frame must still
                // have our inline pointer-events/chat-fill styles removed or the
                // next live stream reusing the frame gets an unclickable chat.
                const chatEl = VideoTypeDetector.getChatEl();
                if (chatEl) {
                    this._restoreChatFill(chatEl);
                }

                document.querySelectorAll('[data-ytkit-split-hidden]').forEach(el => {
                    this._restoreSplitInlineStyles(el, ['display', 'pointer-events']);
                    delete el.dataset.ytkitSplitHidden;
                });
                this._restoreAllSplitInlineStyles();

                this._splitWrapper?.remove();
                this._splitWrapper = null;
                this._isSplit = false;
                this._isActive = false;
                this._dismissed = false;
                this._videoType = 'standard';
                document.documentElement.classList.remove('ytkit-split-open', 'ytkit-split-live');
                document.documentElement.style.removeProperty('--ytkit-split-right-width');
                if (!keepClass) document.documentElement.classList.remove('ytkit-split-active');
                if (!keepClass) document.documentElement.style.removeProperty('--ytd-masthead-height');
                // Restore page scroll — we left it scrolled to comments for IO during mount
                window.scrollTo(0, 0);
                DebugManager.log('Theater', 'Overlay unmounted');
            },

            _activate() {
                if (!window.location.pathname.startsWith('/watch')) return;

                const vid = getVideoId();
                if (vid !== this._lastVideoId) {
                    this._lastVideoId = vid;
                    this._dismissed = false;  // reset dismiss on video change
                    if (this._isActive) {
                        // Same overlay, new video — collapse + refresh type (no unmount/remount)
                        if (this._isSplit) this._collapseSplit(false);
                        this._scrollTarget = null;
                        this._videoType = VideoTypeDetector.refresh();
                        DebugManager.log('Theater', `Video changed to ${vid}, type: ${this._videoType}`);
                        return;
                    }
                }
                if (this._isActive) return;

                // First mount — detect video type
                this._videoType = VideoTypeDetector.refresh();

                const doMount = () => {
                    // _destroyed guard: the waitForElement chains below can
                    // fire several seconds later — after teardown they must
                    // not resurrect an overlay with no styles and no teardown.
                    if (this._destroyed || this._isActive) return;
                    // Apply class right before mount — prevents broken half-state
                    // where masthead is hidden but overlay hasn’t mounted yet
                    document.documentElement.classList.add('ytkit-split-active');
                    document.documentElement.style.setProperty('--ytd-masthead-height', '0px');
                    this._mountOverlay();
                };

                const player = this._getPlayer();
                const below  = this._getBelow();
                const chatEl = this._getChatEl();
                const hasContent = below || chatEl;
                if (player && hasContent) {
                    doMount();
                } else {
                    this._cancelPendingWaits();
                    this._pendingWaits.push(waitForElement('#player-container', () => {
                        if (this._destroyed) return;
                        this._pendingWaits.push(waitForElement('#below, ytd-watch-metadata, ytd-live-chat-frame, #chat', () => {
                            if (this._destroyed) return;
                            if (window.location.pathname.startsWith('/watch')) doMount();
                        }));
                    }));
                }
            },

            _cancelPendingWaits() {
                for (const cancel of this._pendingWaits) {
                    try { if (typeof cancel === 'function') cancel(); }
                    catch { /* reason: wait cancellation is best-effort teardown */ }
                }
                this._pendingWaits = [];
            },

            init() {
                this._destroyed = false;
                const css = buildSplitShellCss();
                this._styleEl = injectStyle(stripCommentRestyleCss(css), this.id, true);
                this._splitMetaStyleEl?.remove();
                const splitMetaCss = buildSplitMetaCss();
                this._splitMetaStyleEl = injectStyle(stripCommentRestyleCss(splitMetaCss), this.id + '-meta-layout', true);
                this._splitCommentsStyleEl?.remove();
                const splitCommentsCss = buildSplitCommentsCss();
                this._splitCommentsStyleEl = injectStyle(splitCommentsCss, this.id + '-comments', true);
                addNavigateRule(this._navRuleId, () => this._activate());
                DebugManager.log('Theater', 'Theater Split initialized');
            },

            destroy() {
                this._destroyed = true;
                this._cancelPendingWaits();
                this._unmount();
                this._restoreSplitActionDock();
                this._stopChatObserver();
                this._lastVideoId = null;
                this._styleEl?.remove();
                this._splitMetaStyleEl?.remove();
                this._splitCommentsStyleEl?.remove();
                this._splitMetaStyleEl = null;
                this._splitCommentsStyleEl = null;
                removeNavigateRule(this._navRuleId);
            }
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyVideo = Object.freeze({
        createStickyVideoFeature
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createStickyVideoFeature
        };
    }
})();
