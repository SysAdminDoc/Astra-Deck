(() => {
    'use strict';

    // extension/features/video-hider/index.js
    //
    // Top-3 monolith peel for Video Hider. The module owns the primary
    // hideVideosFromHome runtime/state object; ytkit.js keeps the inline
    // object as a compatibility fallback and injects monolith-scoped helpers
    // through createHideVideosFromHomeFeature(deps).

    function createFallbackSvg(viewBox, shapes = [], options = {}) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', viewBox);
        for (const shape of shapes) {
            if (!shape || shape.type !== 'path') continue;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            if (shape.d) path.setAttribute('d', shape.d);
            path.setAttribute('fill', shape.fill || options.fill || 'currentColor');
            svg.appendChild(path);
        }
        return svg;
    }

    const SUBSCRIBER_COUNT_LABELS = /(?:subscribers?|abonnenten?|abonnés?|suscriptores?|inscritos?|inscritti|подписчик(?:и|ов|а)?|チャンネル登録者|登録者|購読者|订阅者|粉丝|구독자|المشترك(?:ون|ين)?)/i;
    const NO_SUBSCRIBERS_PATTERN = /(?:\bno\s+subscribers?\b|\bkeine[nr]?\s+abonnenten?\b|нет\s+подписчик|登録者\s*(?:なし|いません)|订阅者\s*暂无|구독자\s*없음)/i;
    // These markers are deliberately explicit rather than a general-purpose
    // "AI detector": a false positive is more harmful than leaving a card
    // visible, and card-local text is too sparse to support a probabilistic
    // classifier. The channel pattern is kept narrow for the same reason.
    const SYNTHETIC_NARRATION_PATTERN = /\b(?:ai[-\s]*(?:generated|narrat(?:ed|ion)|voice(?:[-\s]?over)?)|synthetic[-\s]+(?:voice|narration)|automated[-\s]+(?:narration|voice(?:[-\s]?over)?)|text[-\s]*to[-\s]*speech|tts(?:[-\s]+voice)?|voice[-\s]+clone|elevenlabs)\b/i;
    const SYNTHETIC_CHANNEL_PATTERN = /\b(?:ai[-\s]*(?:daily|news|facts|stories|channel)|(?:daily|news|facts|stories)[-\s]*ai)\b/i;
    const FILTER_REASON_MESSAGES = Object.freeze({
        manual: ['videoHiderReasonManual', 'your saved hidden list'],
        blockedChannel: ['videoHiderReasonBlockedChannel', 'a blocked channel rule'],
        channelNotAllowed: ['videoHiderReasonChannelNotAllowed', 'your channel allowlist'],
        keyword: ['videoHiderReasonKeyword', 'a keyword rule'],
        duration: ['videoHiderReasonDuration', 'the minimum-duration rule'],
        live: ['videoHiderReasonLive', 'the live-stream filter'],
        upcoming: ['videoHiderReasonUpcoming', 'the upcoming-premiere filter'],
        mix: ['videoHiderReasonMix', 'the YouTube Mix filter'],
        playlist: ['videoHiderReasonPlaylist', 'the playlist filter'],
        movie: ['videoHiderReasonMovie', 'the movie filter'],
        autoDubbed: ['videoHiderReasonAutoDubbed', 'the auto-dubbed filter'],
        lowView: ['videoHiderReasonLowView', 'the low-view filter'],
        'synthetic-narration': ['videoHiderReasonSyntheticNarration', 'the synthetic-narration marker filter'],
        'low-signal': ['videoHiderReasonLowSignal', 'the low-signal view/age filter'],
        'upload-cadence': ['videoHiderReasonUploadCadence', 'the upload-cadence filter'],
        watchedRatio: ['videoHiderReasonWatchedRatio', 'the watched-ratio filter'],
        markedWatched: ['videoHiderReasonMarkedWatched', 'your local watched marker'],
        predicate: ['videoHiderReasonPredicate', 'your advanced local rule']
    });

    function normalizeHeuristicText(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function extractUploadCadencePerDay(text) {
        const raw = normalizeHeuristicText(text);
        if (!raw) return null;
        const explicit = raw.match(/\b(\d+(?:[.,]\d+)?)\s*(?:videos?|uploads?)\s*(?:per|a|\/)\s*(day|week|month)s?\b/i);
        if (explicit) {
            const value = Number.parseFloat(explicit[1].replace(',', '.'));
            const divisor = { day: 1, week: 7, month: 30 }[explicit[2].toLowerCase()];
            return Number.isFinite(value) && divisor ? Math.max(0, value / divisor) : null;
        }
        if (/\bmultiple\s+(?:videos?|uploads?)\s+(?:daily|per\s+day)\b/i.test(raw)) return 2;
        if (/\b(?:daily|every\s+day)\s+(?:videos?|uploads?)\b/i.test(raw)) return 1;
        return null;
    }

    function createHideVideosFromHomeFeature(deps = {}) {
        const {
            Z = { BANNER: 10000, HIDE_BTN: 10000 },
            appState = { settings: {} },
            DebugManager = { log() {} },
            setSettingsPanelOpen = () => {},
            storageRead = (_key, fallbackValue) => fallbackValue,
            storageReadJSON = (_key, fallbackValue) => fallbackValue,
            storageWrite = () => {},
            sanitizeImportedHiddenVideos = value => (Array.isArray(value) ? value : []),
            sanitizeImportedVideoIdList = value => (Array.isArray(value) ? value : []),
            sanitizeImportedBlockedChannels = value => (Array.isArray(value) ? value : []),
            sanitizeImportedAllowedChannels = null,
            IMPORT_LIMITS = { hiddenVideos: 5000, allowedVideos: 5000, markedWatchedVideos: 5000, blockedChannels: 2000, allowedChannels: 2000 },
            VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/,
            normalizeBlockedChannelRecord = value => value,
            getBlockedChannelIdentityKeys = value => (value ? [String(value.id || value.channelId || value.handle || value.url || value)] : []),
            isPlainObject = value => !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype,
            createSVG = (globalThis.YTKitCore && globalThis.YTKitCore.createSVG) || createFallbackSvg,
            showToast = () => {},
            PredicateSandbox = { compile() { return { ok: false, error: 'unavailable', position: 0 }; } },
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            getVideoId = () => {
                try {
                    return new URL(globalThis.location?.href || '').searchParams.get('v');
                } catch (_) {
                    return null;
                }
            },
            getCurrentPath = () => globalThis.location?.pathname || '',
            getPlayerResponseGlobal = () => globalThis.ytInitialPlayerResponse || null,
            documentRef = typeof document !== 'undefined' ? document : null,
            setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
            clearTimeoutFn = timer => clearTimeout(timer),
            navigateBack = () => {
                if (globalThis.history?.length > 1) globalThis.history.back();
                else globalThis.location?.assign?.('/');
            },
            t = (_key, fallback) => fallback,
            runBudgetedElementBatch = (items, callback) => {
                const list = Array.from(items || []);
                list.forEach(callback);
                return {
                    cancel() {},
                    promise: Promise.resolve({
                        label: 'video-hider:fallback',
                        total: list.length,
                        processed: list.length,
                        chunks: 1,
                        durationMs: 0,
                        cancelled: false
                    })
                };
            },
            injectStyle = () => ({ remove() {} })
        } = deps;
        const sanitizeAllowedChannels = typeof sanitizeImportedAllowedChannels === 'function'
            ? sanitizeImportedAllowedChannels
            : sanitizeImportedBlockedChannels;

        return {
            id: 'hideVideosFromHome',
            name: 'Video Hider',
            description: 'Hide videos/channels from feeds. Includes keyword filter, duration filter, and channel blocking.',
            group: 'Content',
            icon: 'eye-off',
            isParent: true,
            _styleElement: null,
            _observer: null,
            _lastHidden: null,
            _lastMarkedWatched: null,
            _STORAGE_KEY: 'ytkit-hidden-videos',
            _ALLOWLIST_KEY: 'ytkit-video-hider-allowed-videos',
            _MARKED_WATCHED_KEY: 'ytkit-marked-watched-videos',
            _CHANNELS_KEY: 'ytkit-blocked-channels',
            _ALLOWED_CHANNELS_KEY: 'ytkit-allowed-channels',
            _VIDEO_SELECTORS: 'yt-lockup-view-model, ytd-rich-item-renderer, ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer',
            _hiddenSet: null,
            _hiddenList: null,
            _allowedSet: null,
            _allowedList: null,
            _markedWatchedSet: null,
            _markedWatchedList: null,
            _channelsCache: null,
            _channelKeyCache: null,
            _allowedChannelsCache: null,
            _allowedChannelKeyCache: null,
            _directWatchRouteKey: null,
            _directWatchAllowedRouteKey: null,
            _directWatchTimer: null,
            _directWatchEvaluationToken: 0,
            _directWatchDialog: null,
            _directWatchPreviousFocus: null,
            _directWatchPlayHandler: null,
            _directWatchResumeAfterDecision: false,
            _removedVideoNodes: [],
            _hiddenReasonPlaceholders: new Map(),
            _subsBannerCollapsed: false,
            _subsLoadState: {
                consecutiveHiddenBatches: 0,
                lastBatchSize: 0,
                lastBatchHidden: 0,
                loadingBlocked: false,
                totalVideosLoaded: 0,
                totalVideosHidden: 0
            },
            _formatSubsLoadCount(value) {
                return new Intl.NumberFormat().format(Math.max(0, Math.floor(Number(value) || 0)));
            },
            _formatSubsLoadPercent(value, total) {
                if (!total) return '0%';
                const percent = Math.max(0, Math.min(100, Math.round((Number(value) / Number(total)) * 100)));
                return `${new Intl.NumberFormat().format(percent)}%`;
            },
            _createSubsLoadStat(label, value) {
                const stat = document.createElement('div');
                stat.className = 'ytkit-subs-load-banner__stat';

                const statLabel = document.createElement('span');
                statLabel.className = 'ytkit-subs-load-banner__stat-label';
                statLabel.textContent = label;

                const statValue = document.createElement('span');
                statValue.className = 'ytkit-subs-load-banner__stat-value';
                statValue.textContent = value;
                statValue.setAttribute('translate', 'no');

                stat.appendChild(statLabel);
                stat.appendChild(statValue);
                return stat;
            },
            _removeLoadBlockedUi() {
                document.getElementById('ytkit-subs-load-banner')?.remove();
                document.getElementById('ytkit-subs-load-chip')?.remove();
            },
            _resumeSubsLoading() {
                this._subsLoadState.consecutiveHiddenBatches = 0;
                this._subsBannerCollapsed = false;
                this._removeLoadBlocker();
                window.scrollBy(0, 100);
                setTimeout(() => window.scrollBy(0, -100), 100);
            },
            _expandLoadBlockedBanner() {
                if (!this._subsLoadState.loadingBlocked) return;
                this._subsBannerCollapsed = false;
                this._showLoadBlockedBanner();
            },
            _collapseLoadBlockedBanner() {
                if (!this._subsLoadState.loadingBlocked) return;
                this._subsBannerCollapsed = true;
                this._showLoadBlockedChip();
            },
            _showLoadBlockedChip() {
                if (!this._subsLoadState.loadingBlocked) return;
                this._removeLoadBlockedUi();

                const chip = document.createElement('div');
                chip.id = 'ytkit-subs-load-chip';
                chip.className = 'ytkit-subs-load-chip';
                chip.style.setProperty('--ytkit-banner-z', String(Z.BANNER));
                chip.setAttribute('role', 'status');
                chip.setAttribute('aria-live', 'polite');

                const summaryBtn = document.createElement('button');
                summaryBtn.type = 'button';
                summaryBtn.className = 'ytkit-subs-load-chip__main';
                summaryBtn.setAttribute('aria-label', 'Open subscription load controls');

                const copy = document.createElement('span');
                copy.className = 'ytkit-subs-load-chip__copy';

                const title = document.createElement('span');
                title.className = 'ytkit-subs-load-chip__title';
                title.textContent = 'Subscriptions Paused';

                const meta = document.createElement('span');
                meta.className = 'ytkit-subs-load-chip__meta';
                meta.textContent = `${this._formatSubsLoadCount(this._subsLoadState.totalVideosHidden)} hidden of ${this._formatSubsLoadCount(this._subsLoadState.totalVideosLoaded)} scanned`;
                meta.setAttribute('translate', 'no');

                copy.appendChild(title);
                copy.appendChild(meta);
                summaryBtn.appendChild(copy);
                summaryBtn.addEventListener('click', () => this._expandLoadBlockedBanner());

                const resumeBtn = document.createElement('button');
                resumeBtn.type = 'button';
                resumeBtn.className = 'ytkit-subs-load-chip__resume';
                resumeBtn.textContent = 'Resume';
                resumeBtn.addEventListener('click', () => this._resumeSubsLoading());

                chip.appendChild(summaryBtn);
                chip.appendChild(resumeBtn);
                document.body.appendChild(chip);
            },

            _resetSubsLoadState() {
                this._subsLoadState = {
                    consecutiveHiddenBatches: 0,
                    lastBatchSize: 0,
                    lastBatchHidden: 0,
                    loadingBlocked: false,
                    totalVideosLoaded: 0,
                    totalVideosHidden: 0
                };
                this._removeLoadBlocker();
            },

            _blockSubsLoading() {
                if (this._subsLoadState.loadingBlocked) return;
                this._subsLoadState.loadingBlocked = true;
                this._subsBannerCollapsed = false;
                if (this._clearBatchBuffer) this._clearBatchBuffer();
                const continuations = document.querySelectorAll('ytd-continuation-item-renderer, #continuations, ytd-browse[page-subtype="subscriptions"] ytd-continuation-item-renderer');
                continuations.forEach(cont => {
                    if (!(cont instanceof HTMLElement)) return;
                    cont.style.display = 'none';
                    cont.dataset.ytkitBlocked = 'true';
                });
                this._showLoadBlockedBanner();
                DebugManager.log('VideoHider', 'Subscription loading blocked - too many consecutive hidden batches');
            },

            _removeLoadBlocker() {
                this._subsLoadState.loadingBlocked = false;
                this._subsBannerCollapsed = false;
                document.querySelectorAll('[data-ytkit-blocked="true"]').forEach(el => {
                    if (!(el instanceof HTMLElement)) return;
                    el.style.display = '';
                    delete el.dataset.ytkitBlocked;
                });
                this._removeLoadBlockedUi();
            },

            _showLoadBlockedBanner() {
                if (!this._subsLoadState.loadingBlocked) return;
                if (this._subsBannerCollapsed) {
                    this._showLoadBlockedChip();
                    return;
                }
                this._removeLoadBlockedUi();
                const banner = document.createElement('div');
                banner.id = 'ytkit-subs-load-banner';
                banner.className = 'ytkit-subs-load-banner';
                banner.style.setProperty('--ytkit-banner-z', String(Z.BANNER));
                banner.setAttribute('role', 'status');
                banner.setAttribute('aria-live', 'polite');

                const icon = document.createElement('div');
                icon.className = 'ytkit-subs-load-banner__icon';
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
                svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', '#f59e0b'); svg.setAttribute('stroke-width', '2');
                svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '10');
                const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line1.setAttribute('x1', '12'); line1.setAttribute('y1', '8'); line1.setAttribute('x2', '12'); line1.setAttribute('y2', '12');
                const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line2.setAttribute('x1', '12'); line2.setAttribute('y1', '16'); line2.setAttribute('x2', '12.01'); line2.setAttribute('y2', '16');
                svg.appendChild(circle); svg.appendChild(line1); svg.appendChild(line2);
                icon.appendChild(svg);

                const body = document.createElement('div');
                body.className = 'ytkit-subs-load-banner__body';

                const textContainer = document.createElement('div');
                textContainer.className = 'ytkit-subs-load-banner__copy';

                const eyebrow = document.createElement('div');
                eyebrow.className = 'ytkit-subs-load-banner__eyebrow';
                eyebrow.textContent = 'Subscriptions Guard';

                const title = document.createElement('div');
                title.className = 'ytkit-subs-load-banner__title';
                title.textContent = 'Subscription Feed Paused';

                const subtitle = document.createElement('div');
                subtitle.className = 'ytkit-subs-load-banner__subtitle';
                subtitle.textContent = `${this._formatSubsLoadPercent(this._subsLoadState.totalVideosHidden, this._subsLoadState.totalVideosLoaded)} of scanned videos were hidden, so Astra Deck paused auto-loading before the feed churned through more empty batches.`;

                const stats = document.createElement('div');
                stats.className = 'ytkit-subs-load-banner__stats';
                stats.appendChild(this._createSubsLoadStat('Hidden', this._formatSubsLoadCount(this._subsLoadState.totalVideosHidden)));
                stats.appendChild(this._createSubsLoadStat('Scanned', this._formatSubsLoadCount(this._subsLoadState.totalVideosLoaded)));
                stats.appendChild(this._createSubsLoadStat('Streak', this._formatSubsLoadCount(this._subsLoadState.consecutiveHiddenBatches)));

                textContainer.appendChild(eyebrow);
                textContainer.appendChild(title);
                textContainer.appendChild(subtitle);
                body.appendChild(textContainer);
                body.appendChild(stats);

                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'ytkit-subs-load-banner__actions';

                const resumeBtn = document.createElement('button');
                resumeBtn.type = 'button';
                resumeBtn.className = 'ytkit-subs-load-banner__btn ytkit-subs-load-banner__btn--primary';
                resumeBtn.textContent = 'Resume Loading';
                resumeBtn.addEventListener('click', () => this._resumeSubsLoading());

                const settingsBtn = document.createElement('button');
                settingsBtn.type = 'button';
                settingsBtn.className = 'ytkit-subs-load-banner__btn';
                settingsBtn.textContent = 'Review Filters';
                settingsBtn.addEventListener('click', () => setSettingsPanelOpen(true));

                const keepPausedBtn = document.createElement('button');
                keepPausedBtn.type = 'button';
                keepPausedBtn.className = 'ytkit-subs-load-banner__btn ytkit-subs-load-banner__btn--quiet';
                keepPausedBtn.textContent = 'Keep Paused';
                keepPausedBtn.addEventListener('click', () => this._collapseLoadBlockedBanner());

                buttonContainer.appendChild(resumeBtn);
                buttonContainer.appendChild(settingsBtn);
                buttonContainer.appendChild(keepPausedBtn);

                banner.appendChild(icon);
                banner.appendChild(body);
                banner.appendChild(buttonContainer);
                document.body.appendChild(banner);
            },

            _trackSubsLoadBatch(processedVideos) {
                if (window.location.pathname !== '/feed/subscriptions') return;
                if (!appState.settings.hideVideosSubsLoadLimit) return;
                if (this._subsLoadState.loadingBlocked) return;
                const hiddenCount = processedVideos.filter(v => v.hidden).length;
                const batchSize = processedVideos.length;
                if (batchSize === 0) return;
                this._subsLoadState.totalVideosLoaded += batchSize;
                this._subsLoadState.totalVideosHidden += hiddenCount;
                this._subsLoadState.lastBatchSize = batchSize;
                this._subsLoadState.lastBatchHidden = hiddenCount;
                // v4.47.0 NF33: the prior "100% hidden" gate (allHidden =
                // hiddenCount === batchSize) over-fired in practice — any
                // 3-batch streak where every single card was hidden halted
                // pagination, even when 20% non-hidden content would have
                // loaded normally afterwards. The new gate is configurable
                // via hideVideosSubsLoadHiddenRatio (default 0.8 = 80%).
                // A batch qualifies as "mostly hidden" when its hidden
                // ratio is >= the threshold; the streak still uses the
                // existing hideVideosSubsLoadThreshold (default 3) so the
                // sliding-window semantics are preserved.
                const hiddenRatio = hiddenCount / batchSize;
                const ratioCutoff = (() => {
                    const raw = Number(appState.settings.hideVideosSubsLoadHiddenRatio);
                    if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return 0.8;
                    return raw;
                })();
                const mostlyHidden = hiddenRatio >= ratioCutoff;
                const threshold = appState.settings.hideVideosSubsLoadThreshold || 3;
                if (mostlyHidden) {
                    this._subsLoadState.consecutiveHiddenBatches++;
                    DebugManager.log('VideoHider', `Subs load: batch ${this._subsLoadState.consecutiveHiddenBatches}/${threshold} mostly hidden (${hiddenCount}/${batchSize} = ${Math.round(hiddenRatio * 100)}% >= ${Math.round(ratioCutoff * 100)}%)`);
                    if (this._subsLoadState.consecutiveHiddenBatches >= threshold) this._blockSubsLoading();
                } else {
                    this._subsLoadState.consecutiveHiddenBatches = 0;
                }
            },

            _getHiddenVideos() {
                if (this._hiddenList === null) {
                    this._hiddenList = storageRead(this._STORAGE_KEY, []);
                    this._hiddenSet = new Set(this._hiddenList);
                }
                return this._hiddenList;
            },
            _isVideoIdHidden(videoId) {
                if (this._hiddenSet === null) this._getHiddenVideos();
                return this._hiddenSet.has(videoId);
            },
            _setHiddenVideos(videos) {
                const sanitized = sanitizeImportedHiddenVideos(videos);
                this._hiddenList = sanitized;
                this._hiddenSet = new Set(sanitized);
                storageWrite(this._STORAGE_KEY, sanitized);
            },
            _getAllowedVideos() {
                if (this._allowedList === null) {
                    this._allowedList = sanitizeImportedVideoIdList(storageRead(this._ALLOWLIST_KEY, []), IMPORT_LIMITS.allowedVideos);
                    this._allowedSet = new Set(this._allowedList);
                }
                return this._allowedList;
            },
            _isVideoAllowed(videoId) {
                if (!videoId) return false;
                if (this._allowedSet === null) this._getAllowedVideos();
                return this._allowedSet.has(videoId);
            },
            _setAllowedVideos(videos) {
                const sanitized = sanitizeImportedVideoIdList(videos, IMPORT_LIMITS.allowedVideos);
                this._allowedList = sanitized;
                this._allowedSet = new Set(sanitized);
                storageWrite(this._ALLOWLIST_KEY, sanitized);
            },
            _addAllowedVideos(videoIds, options = {}) {
                if (!options.force && appState.settings.hideVideosRememberRestoredVideos === false) return [];
                const allowed = this._getAllowedVideos();
                const added = [];
                for (const id of videoIds || []) {
                    if (!VIDEO_ID_PATTERN.test(id) || allowed.includes(id)) continue;
                    allowed.push(id);
                    added.push(id);
                }
                if (allowed.length > IMPORT_LIMITS.allowedVideos) {
                    allowed.splice(0, allowed.length - IMPORT_LIMITS.allowedVideos);
                }
                if (added.length > 0) this._setAllowedVideos(allowed);
                return added;
            },
            _removeAllowedVideos(videoIds) {
                const idSet = new Set(videoIds || []);
                if (idSet.size === 0) return [];
                const allowed = this._getAllowedVideos();
                const removed = allowed.filter(id => idSet.has(id));
                if (removed.length === 0) return [];
                this._setAllowedVideos(allowed.filter(id => !idSet.has(id)));
                return removed;
            },
            _getMarkedWatchedVideos() {
                if (this._markedWatchedList === null) {
                    const stored = storageRead(this._MARKED_WATCHED_KEY, []);
                    const limit = IMPORT_LIMITS.markedWatchedVideos || 5000;
                    const sanitized = sanitizeImportedVideoIdList(
                        Array.isArray(stored) ? stored.slice(-limit) : stored,
                        limit
                    );
                    this._markedWatchedList = sanitized;
                    this._markedWatchedSet = new Set(sanitized);
                    try {
                        if (JSON.stringify(stored) !== JSON.stringify(sanitized)) storageWrite(this._MARKED_WATCHED_KEY, sanitized);
                    } catch (_) {
                        // reason: malformed storage must not break feed filtering
                    }
                }
                return this._markedWatchedList;
            },
            _isVideoMarkedWatched(videoId) {
                if (!videoId) return false;
                if (this._markedWatchedSet === null) this._getMarkedWatchedVideos();
                return this._markedWatchedSet.has(videoId);
            },
            _setMarkedWatchedVideos(videos) {
                const limit = IMPORT_LIMITS.markedWatchedVideos || 5000;
                const sanitized = sanitizeImportedVideoIdList(
                    Array.isArray(videos) ? videos.slice(-limit) : videos,
                    limit
                );
                this._markedWatchedList = sanitized;
                this._markedWatchedSet = new Set(sanitized);
                storageWrite(this._MARKED_WATCHED_KEY, sanitized);
            },
            _addMarkedWatchedVideo(videoId) {
                if (!VIDEO_ID_PATTERN.test(videoId)) return false;
                const marked = this._getMarkedWatchedVideos();
                const next = marked.filter(id => id !== videoId);
                next.push(videoId);
                const limit = IMPORT_LIMITS.markedWatchedVideos || 5000;
                if (next.length > limit) next.splice(0, next.length - limit);
                this._setMarkedWatchedVideos(next);
                return true;
            },
            _removeMarkedWatchedVideo(videoId) {
                if (!videoId) return false;
                const marked = this._getMarkedWatchedVideos();
                if (!marked.includes(videoId)) return false;
                this._setMarkedWatchedVideos(marked.filter(id => id !== videoId));
                return true;
            },
            _applyMarkedWatchedState(element, marked) {
                if (!element?.classList) return;
                const active = !!marked && appState.settings.markWatchedVideos === true;
                element.classList.toggle('ytkit-video-marked-watched', active);
                if (active) element.dataset.ytkitMarkedWatched = 'true';
                else delete element.dataset.ytkitMarkedWatched;
            },
            _addHiddenVideos(videoIds) {
                const hidden = this._getHiddenVideos();
                const added = [];
                const validIds = [];
                for (const id of videoIds || []) {
                    if (!VIDEO_ID_PATTERN.test(id)) continue;
                    validIds.push(id);
                    if (hidden.includes(id)) continue;
                    hidden.push(id);
                    added.push(id);
                }
                if (validIds.length > 0) this._removeAllowedVideos(validIds);
                if (hidden.length > IMPORT_LIMITS.hiddenVideos) {
                    hidden.splice(0, hidden.length - IMPORT_LIMITS.hiddenVideos);
                }
                if (added.length > 0) this._setHiddenVideos(hidden);
                return added;
            },
            _removeHiddenVideos(videoIds) {
                const idSet = new Set(videoIds || []);
                if (idSet.size === 0) return [];
                const hidden = this._getHiddenVideos();
                const removed = hidden.filter(id => idSet.has(id));
                if (removed.length === 0) return [];
                this._setHiddenVideos(hidden.filter(id => !idSet.has(id)));
                return removed;
            },
            _normalizeBlockedChannels(channels) {
                return sanitizeImportedBlockedChannels(Array.isArray(channels) ? channels : []);
            },
            _setBlockedChannelCache(channels) {
                const cachedChannels = Array.isArray(channels) ? channels : [];
                const keyCache = new Set();
                for (const channel of cachedChannels) {
                    this._getChannelIdentityKeys(channel).forEach(key => keyCache.add(key));
                }
                this._channelsCache = cachedChannels;
                this._channelKeyCache = keyCache;
                return cachedChannels;
            },
            _getBlockedChannels() {
                if (this._channelsCache === null) {
                    const stored = storageRead(this._CHANNELS_KEY, []);
                    const sanitized = this._normalizeBlockedChannels(stored);
                    this._setBlockedChannelCache(sanitized);
                    try {
                        if (JSON.stringify(stored) !== JSON.stringify(sanitized)) storageWrite(this._CHANNELS_KEY, sanitized);
                    } catch (error) {
                        void error;
                    }
                }
                return this._channelsCache;
            },
            _setBlockedChannels(channels) {
                const sanitized = this._normalizeBlockedChannels(channels);
                this._setBlockedChannelCache(sanitized);
                storageWrite(this._CHANNELS_KEY, sanitized);
            },
            _getBlockedChannelKeys() {
                if (this._channelKeyCache === null) this._getBlockedChannels();
                return this._channelKeyCache || new Set();
            },
            _getChannelIdentityKeys(channelInfo) {
                return getBlockedChannelIdentityKeys(channelInfo);
            },
            _isSameChannel(left, right) {
                const leftKeys = new Set(this._getChannelIdentityKeys(left));
                if (leftKeys.size === 0) return false;
                return this._getChannelIdentityKeys(right).some(key => leftKeys.has(key));
            },
            _isChannelBlocked(channelInfo) {
                if (Array.isArray(channelInfo)) {
                    if (!channelInfo.length) return false;
                    const blockedKeys = this._getBlockedChannelKeys();
                    return channelInfo.some(info => this._getChannelIdentityKeys(info)
                        .some(key => blockedKeys.has(key)));
                }
                if (!channelInfo) return false;
                const blockedKeys = this._getBlockedChannelKeys();
                return this._getChannelIdentityKeys(channelInfo)
                    .some(key => blockedKeys.has(key));
            },
            _addBlockedChannel(channelInfo) {
                const record = normalizeBlockedChannelRecord({
                    ...(isPlainObject(channelInfo) ? channelInfo : { id: channelInfo }),
                    blockedAt: isPlainObject(channelInfo) && channelInfo.blockedAt ? channelInfo.blockedAt : Date.now(),
                    source: isPlainObject(channelInfo) && channelInfo.source ? channelInfo.source : 'thumbnail'
                });
                if (!record) return { added: false, record: null };
                const channels = this._getBlockedChannels();
                const existing = channels.find(channel => this._isSameChannel(channel, record));
                if (existing) return { added: false, record: existing };
                this._setBlockedChannels([...channels, record]);
                return { added: true, record };
            },
            _removeBlockedChannel(channelInfo) {
                const channels = this._getBlockedChannels();
                const removed = channels.filter(channel => this._isSameChannel(channel, channelInfo));
                if (removed.length === 0) return [];
                this._setBlockedChannels(channels.filter(channel => !this._isSameChannel(channel, channelInfo)));
                return removed;
            },
            _normalizeAllowedChannels(channels) {
                return sanitizeAllowedChannels(Array.isArray(channels) ? channels : []);
            },
            _setAllowedChannelCache(channels) {
                const cachedChannels = Array.isArray(channels) ? channels : [];
                const keyCache = new Set();
                for (const channel of cachedChannels) {
                    this._getChannelIdentityKeys(channel).forEach(key => keyCache.add(key));
                }
                this._allowedChannelsCache = cachedChannels;
                this._allowedChannelKeyCache = keyCache;
                return cachedChannels;
            },
            _getAllowedChannels() {
                if (this._allowedChannelsCache === null) {
                    const stored = storageRead(this._ALLOWED_CHANNELS_KEY, []);
                    const sanitized = this._normalizeAllowedChannels(stored);
                    this._setAllowedChannelCache(sanitized);
                    try {
                        if (JSON.stringify(stored) !== JSON.stringify(sanitized)) storageWrite(this._ALLOWED_CHANNELS_KEY, sanitized);
                    } catch (error) {
                        void error;
                    }
                }
                return this._allowedChannelsCache;
            },
            _setAllowedChannels(channels) {
                const sanitized = this._normalizeAllowedChannels(channels);
                this._setAllowedChannelCache(sanitized);
                storageWrite(this._ALLOWED_CHANNELS_KEY, sanitized);
            },
            _getAllowedChannelKeys() {
                if (this._allowedChannelKeyCache === null) this._getAllowedChannels();
                return this._allowedChannelKeyCache || new Set();
            },
            _isChannelAllowed(channelInfo) {
                if (Array.isArray(channelInfo)) {
                    if (!channelInfo.length) return false;
                    const allowedKeys = this._getAllowedChannelKeys();
                    return channelInfo.some(info => this._getChannelIdentityKeys(info)
                        .some(key => allowedKeys.has(key)));
                }
                if (!channelInfo) return false;
                const allowedKeys = this._getAllowedChannelKeys();
                return this._getChannelIdentityKeys(channelInfo)
                    .some(key => allowedKeys.has(key));
            },
            _normalizeChannelInput(value) {
                const raw = typeof value === 'string' ? value.trim() : '';
                if (!raw) return null;
                return normalizeBlockedChannelRecord({ id: raw, name: raw, source: 'settings' });
            },
            _isChannelAllowlistMode() {
                return appState.settings.hideVideosChannelAllowlist === true;
            },
            _addAllowedChannel(channelInfo) {
                const record = normalizeBlockedChannelRecord({
                    ...(isPlainObject(channelInfo) ? channelInfo : { id: channelInfo }),
                    source: isPlainObject(channelInfo) && channelInfo.source ? channelInfo.source : 'thumbnail'
                });
                if (!record) return { added: false, record: null };
                const channels = this._getAllowedChannels();
                const existing = channels.find(channel => this._isSameChannel(channel, record));
                if (existing) return { added: false, record: existing };
                this._setAllowedChannels([...channels, record]);
                return { added: true, record };
            },
            _removeAllowedChannel(channelInfo) {
                const channels = this._getAllowedChannels();
                const removed = channels.filter(channel => this._isSameChannel(channel, channelInfo));
                if (removed.length === 0) return [];
                this._setAllowedChannels(channels.filter(channel => !this._isSameChannel(channel, channelInfo)));
                return removed;
            },
            _getChannelUrl(channelInfo) {
                const record = normalizeBlockedChannelRecord(channelInfo);
                if (!record) return '';
                if (record.url) return record.url;
                if (record.channelId) return `https://www.youtube.com/channel/${record.channelId}`;
                if (record.handle) return `https://www.youtube.com/${record.handle}`;
                return '';
            },

            _getDirectWatchRouteKey() {
                if (getCurrentPath() !== '/watch') return null;
                const videoId = String(getVideoId() || '').trim();
                return VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
            },

            _normalizeDirectWatchChannel({ channelId = '', name = '', url = '', source = 'watch' } = {}) {
                const record = normalizeBlockedChannelRecord({
                    id: channelId || url,
                    channelId,
                    name,
                    url,
                    source
                });
                return record ? { ...record, name: name || record.name || channelId || url } : null;
            },

            _getDirectWatchChannelFromPlayer(routeKey) {
                const response = getPlayerResponseGlobal();
                const details = response?.videoDetails;
                if (!details) return { channel: null, stale: false };
                if (String(details.videoId || '') !== routeKey) return { channel: null, stale: true };
                const microformat = response?.microformat?.playerMicroformatRenderer || {};
                const channelId = String(details.channelId || '').trim();
                const url = String(microformat.ownerProfileUrl || (channelId ? `/channel/${channelId}` : '')).trim();
                return {
                    channel: this._normalizeDirectWatchChannel({
                        channelId,
                        name: String(details.author || '').trim(),
                        url,
                        source: 'player-response'
                    }),
                    stale: false
                };
            },

            _getDirectWatchChannelFromDom(routeKey, attempt = 0) {
                if (!documentRef?.querySelector) return null;
                const watchRoot = documentRef.querySelector('ytd-watch-flexy');
                const rootVideoId = watchRoot?.getAttribute?.('video-id') || '';
                if (rootVideoId && rootVideoId !== routeKey) return null;
                // During SPA navigation YouTube briefly leaves the previous
                // owner DOM mounted. Give the new route a short settle window
                // when the watch root does not expose its current video ID.
                if (!rootVideoId && attempt < 4) return null;
                const root = watchRoot || documentRef;
                const link = root.querySelector?.([
                    'ytd-watch-metadata #owner a[href^="/@"]',
                    'ytd-watch-metadata #owner a[href*="/channel/"]',
                    'ytd-video-owner-renderer a[href^="/@"]',
                    'ytd-video-owner-renderer a[href*="/channel/"]',
                    '#owner-name a[href^="/@"]',
                    '#owner-name a[href*="/channel/"]'
                ].join(', '));
                if (!link) return null;
                const url = String(link.href || link.getAttribute?.('href') || '').trim();
                const name = String(link.textContent || link.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim();
                return this._normalizeDirectWatchChannel({ name, url, source: 'watch-dom' });
            },

            _resolveDirectWatchChannel(routeKey, attempt = 0) {
                const playerResult = this._getDirectWatchChannelFromPlayer(routeKey);
                if (playerResult.channel || playerResult.stale) return playerResult.channel;
                return this._getDirectWatchChannelFromDom(routeKey, attempt);
            },

            _getDirectWatchVideo() {
                return documentRef?.querySelector?.('video.html5-main-video, #movie_player video, video') || null;
            },

            _pauseDirectWatchPlayback() {
                const video = this._getDirectWatchVideo();
                if (video) {
                    this._directWatchResumeAfterDecision = !video.paused && !video.ended;
                    try { video.pause?.(); } catch (_) { /* reason: player teardown can race SPA navigation */ }
                }
                try { documentRef?.getElementById?.('movie_player')?.pauseVideo?.(); } catch (_) { /* reason: private player API is best-effort */ }
            },

            _resumeDirectWatchPlayback() {
                if (!this._directWatchResumeAfterDecision) return;
                this._directWatchResumeAfterDecision = false;
                const player = documentRef?.getElementById?.('movie_player');
                try {
                    if (typeof player?.playVideo === 'function') player.playVideo();
                    else {
                        const playResult = this._getDirectWatchVideo()?.play?.();
                        playResult?.catch?.(() => {});
                    }
                } catch (_) { /* reason: playback can be rejected without a fresh user gesture */ }
            },

            _installDirectWatchPlaybackGuard() {
                if (!documentRef?.addEventListener || this._directWatchPlayHandler) return;
                this._directWatchPlayHandler = event => {
                    if (!this._directWatchDialog || event?.target?.tagName !== 'VIDEO') return;
                    try { event.target.pause?.(); } catch (_) { /* reason: detached media element */ }
                };
                documentRef.addEventListener('play', this._directWatchPlayHandler, true);
            },

            _removeDirectWatchPlaybackGuard() {
                if (this._directWatchPlayHandler) {
                    documentRef?.removeEventListener?.('play', this._directWatchPlayHandler, true);
                    this._directWatchPlayHandler = null;
                }
            },

            _closeDirectWatchInterstitial({ restoreFocus = true } = {}) {
                this._removeDirectWatchPlaybackGuard();
                this._directWatchDialog?.remove?.();
                this._directWatchDialog = null;
                if (restoreFocus && this._directWatchPreviousFocus?.isConnected) {
                    try { this._directWatchPreviousFocus.focus?.({ preventScroll: true }); } catch (_) { /* reason: focus restoration is best-effort */ }
                }
                this._directWatchPreviousFocus = null;
            },

            _handleDirectWatchDecision(action, channelInfo) {
                if (action === 'allow-once') {
                    this._directWatchAllowedRouteKey = this._directWatchRouteKey;
                    this._closeDirectWatchInterstitial();
                    this._resumeDirectWatchPlayback();
                    return;
                }
                if (action === 'unblock') {
                    this._removeBlockedChannel(channelInfo);
                    this._closeDirectWatchInterstitial();
                    this._resumeDirectWatchPlayback();
                    // Cards already processed for this channel (the watch-page
                    // related rail) keep their hidden marker until something
                    // re-runs the pass. The toast undo path does this; this one
                    // did not, so unblocking left the rail hidden all pageview.
                    // Debounced like the feature's other refresh triggers, so
                    // the authoritative unblock above never waits on a DOM walk.
                    this._processAllVideosDebounced(0);
                    return;
                }
                if (action === 'back') {
                    this._directWatchDialog?.querySelectorAll?.('button').forEach(button => { button.disabled = true; });
                    navigateBack();
                }
            },

            _showDirectWatchInterstitial(channelInfo) {
                if (!documentRef?.createElement || !documentRef.body || this._directWatchDialog) return;
                this._pauseDirectWatchPlayback();
                this._installDirectWatchPlaybackGuard();
                this._directWatchPreviousFocus = documentRef.activeElement || null;

                const overlay = documentRef.createElement('div');
                overlay.className = 'ytkit-blocked-watch-overlay';
                overlay.dataset.ytkitBlockedWatch = 'true';

                const dialog = documentRef.createElement('section');
                dialog.className = 'ytkit-blocked-watch-dialog';
                dialog.setAttribute('role', 'alertdialog');
                dialog.setAttribute('aria-modal', 'true');
                dialog.setAttribute('aria-labelledby', 'ytkit-blocked-watch-title');
                dialog.setAttribute('aria-describedby', 'ytkit-blocked-watch-description');

                const eyebrow = documentRef.createElement('span');
                eyebrow.className = 'ytkit-blocked-watch-eyebrow';
                eyebrow.textContent = t('statBlocked', 'Blocked');

                const title = documentRef.createElement('h2');
                title.id = 'ytkit-blocked-watch-title';
                title.textContent = t('blockedWatchTitle', 'Blocked channel');

                const description = documentRef.createElement('p');
                description.id = 'ytkit-blocked-watch-description';
                description.textContent = t('blockedWatchDescription', 'This video is from a channel you blocked.');

                const channel = documentRef.createElement('p');
                channel.className = 'ytkit-blocked-watch-channel';
                channel.textContent = channelInfo?.name || channelInfo?.handle || channelInfo?.channelId || t('blockedWatchUnknownChannel', 'Unknown channel');
                channel.setAttribute('translate', 'no');

                const actions = documentRef.createElement('div');
                actions.className = 'ytkit-blocked-watch-actions';
                const definitions = [
                    ['back', t('blockedWatchBack', 'Back')],
                    ['unblock', t('blockedWatchUnblock', 'Unblock')],
                    ['allow-once', t('blockedWatchAllowOnce', 'Allow once')]
                ];
                for (const [action, label] of definitions) {
                    const button = documentRef.createElement('button');
                    button.type = 'button';
                    button.dataset.action = action;
                    button.className = `ytkit-blocked-watch-action ytkit-blocked-watch-action--${action}`;
                    button.textContent = label;
                    button.addEventListener('click', () => this._handleDirectWatchDecision(action, channelInfo));
                    actions.appendChild(button);
                }

                dialog.appendChild(eyebrow);
                dialog.appendChild(title);
                dialog.appendChild(description);
                dialog.appendChild(channel);
                dialog.appendChild(actions);
                overlay.appendChild(dialog);
                overlay.addEventListener('keydown', event => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        this._handleDirectWatchDecision('back', channelInfo);
                        return;
                    }
                    if (event.key !== 'Tab') return;
                    const buttons = [...dialog.querySelectorAll('button:not([disabled])')];
                    if (!buttons.length) return;
                    const first = buttons[0];
                    const last = buttons[buttons.length - 1];
                    if (event.shiftKey && documentRef.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    } else if (!event.shiftKey && documentRef.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                });

                documentRef.body.appendChild(overlay);
                this._directWatchDialog = overlay;
                dialog.querySelector?.('[data-action="back"]')?.focus?.({ preventScroll: true });
            },

            _clearDirectWatchEvaluation() {
                this._directWatchEvaluationToken += 1;
                if (this._directWatchTimer) {
                    clearTimeoutFn(this._directWatchTimer);
                    this._directWatchTimer = null;
                }
            },

            _evaluateDirectWatchBlock() {
                const routeKey = this._getDirectWatchRouteKey();
                if (routeKey !== this._directWatchRouteKey) {
                    this._clearDirectWatchEvaluation();
                    this._closeDirectWatchInterstitial({ restoreFocus: false });
                    this._directWatchAllowedRouteKey = null;
                    this._directWatchRouteKey = routeKey;
                    this._directWatchResumeAfterDecision = false;
                } else {
                    this._clearDirectWatchEvaluation();
                }
                if (!routeKey || routeKey === this._directWatchAllowedRouteKey) return;

                const token = this._directWatchEvaluationToken;
                const retry = (attempt = 0) => {
                    if (token !== this._directWatchEvaluationToken || routeKey !== this._getDirectWatchRouteKey()) return;
                    const channelInfo = this._resolveDirectWatchChannel(routeKey, attempt);
                    if (channelInfo) {
                        if (this._isChannelBlocked(channelInfo)) this._showDirectWatchInterstitial(channelInfo);
                        else this._closeDirectWatchInterstitial();
                        return;
                    }
                    if (attempt >= 31) return;
                    this._directWatchTimer = setTimeoutFn(() => {
                        this._directWatchTimer = null;
                        retry(attempt + 1);
                    }, 250);
                };
                retry();
            },

            _getCurrentScope(pathname = window.location.pathname) {
                const path = pathname || '/';
                if (path === '/') return 'home';
                if (path === '/feed/subscriptions') return 'subscriptions';
                if (path === '/results') return 'search';
                if (path.startsWith('/watch')) return 'watch';
                if (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/') || path.startsWith('/user/')) return 'channel';
                return 'other';
            },

            _isScopeEnabledForPath(pathname = window.location.pathname) {
                const scope = this._getCurrentScope(pathname);
                const settingByScope = {
                    home: 'hideVideosScopeHome',
                    subscriptions: 'hideVideosScopeSubscriptions',
                    search: 'hideVideosScopeSearch',
                    watch: 'hideVideosScopeWatch',
                    channel: 'hideVideosScopeChannels',
                    other: 'hideVideosScopeOther'
                };
                const key = settingByScope[scope];
                return !key || appState.settings[key] !== false;
            },

            _restoreRemovedVideoNodes(ids = null) {
                const idSet = ids ? new Set(ids) : null;
                const remaining = [];
                let restored = 0;
                this._removedVideoNodes.forEach(record => {
                    if (!record || (idSet && !idSet.has(record.videoId))) {
                        remaining.push(record);
                        return;
                    }
                    if (record.element?.isConnected) {
                        delete record.element.dataset.ytkitRemoved;
                        return;
                    }
                    if (record.parent?.isConnected) {
                        delete record.element.dataset.ytkitRemoved;
                        const anchor = record.nextSibling?.deref?.();
                        if (anchor && anchor.parentNode === record.parent) record.parent.insertBefore(record.element, anchor);
                        else record.parent.appendChild(record.element);
                        restored++;
                    }
                });
                this._removedVideoNodes = remaining;
                return restored;
            },

            _removeVideoElement(element) {
                if (!(element instanceof HTMLElement) || element.dataset.ytkitRemoved === 'true') return;
                const videoId = element.dataset.ytkitVideoId || this._extractVideoId(element);
                if (!videoId || !element.parentNode) return;
                this._removedVideoNodes = this._removedVideoNodes.filter(record => record.element !== element);
                this._removedVideoNodes.push({
                    videoId,
                    element,
                    parent: element.parentNode,
                    // WeakRef: the ex-sibling is only an ordering anchor for
                    // restore. A strong ref would pin the whole sibling subtree
                    // in memory if it is later detached itself; when the anchor
                    // is gone, restore falls back to appendChild.
                    nextSibling: element.nextSibling ? new WeakRef(element.nextSibling) : null
                });
                if (this._removedVideoNodes.length > 200) {
                    this._removedVideoNodes.splice(0, this._removedVideoNodes.length - 200);
                }
                element.dataset.ytkitRemoved = 'true';
                element.remove();
            },

            _filterReasonLabel(reason) {
                const normalizedReason = {
                    'auto-dubbed': 'autoDubbed',
                    'low-view': 'lowView',
                    'watched-ratio': 'watchedRatio',
                    'marked-watched': 'markedWatched'
                }[reason] || reason;
                const [key, fallback] = FILTER_REASON_MESSAGES[normalizedReason] || FILTER_REASON_MESSAGES.manual;
                return t(key, fallback);
            },

            _removeHiddenReasonPlaceholder(element) {
                const placeholder = this._hiddenReasonPlaceholders.get(element);
                placeholder?.remove();
                this._hiddenReasonPlaceholders.delete(element);
            },

            _syncHiddenReasonPlaceholder(element, reason) {
                if (appState.settings.hideVideosShowFilterReason !== true || !element.parentNode || !documentRef) {
                    this._removeHiddenReasonPlaceholder(element);
                    return;
                }
                let placeholder = this._hiddenReasonPlaceholders.get(element);
                if (placeholder && !placeholder.isConnected) {
                    this._hiddenReasonPlaceholders.delete(element);
                    placeholder = null;
                }
                if (!placeholder) {
                    placeholder = documentRef.createElement('div');
                    placeholder.className = 'ytkit-video-hidden-placeholder';
                    placeholder.setAttribute('role', 'status');
                    this._hiddenReasonPlaceholders.set(element, placeholder);
                    element.parentNode.insertBefore(placeholder, element.nextSibling);
                }
                const reasonLabel = this._filterReasonLabel(reason);
                const label = t('videoHiderHiddenReason', 'Hidden by Video Hider: {reason}')
                    .replace('{reason}', reasonLabel);
                placeholder.textContent = label;
                placeholder.setAttribute('aria-label', label);
                placeholder.dataset.ytkitHiddenReason = reason;
            },

            _applyVideoHiddenState(element, shouldHide, reason = '') {
                if (!(element instanceof HTMLElement)) return !!shouldHide;
                if (!shouldHide) {
                    this._removeHiddenReasonPlaceholder(element);
                    delete element.dataset.ytkitFilterReason;
                    element.classList.remove('ytkit-video-hidden');
                    delete element.dataset.ytkitRemoved;
                    return false;
                }
                const resolvedReason = reason || element.dataset.ytkitFilterReason || 'manual';
                element.dataset.ytkitFilterReason = resolvedReason;
                this._syncHiddenReasonPlaceholder(element, resolvedReason);
                if (appState.settings.hideVideosRemoveHiddenCards) {
                    element.classList.add('ytkit-video-hidden');
                    this._removeVideoElement(element);
                    return true;
                }
                element.classList.add('ytkit-video-hidden');
                return true;
            },

            _extractVideoId(element) {
                const lockup = element.querySelector('.yt-lockup-view-model[class*="content-id-"]');
                if (lockup) { const m = lockup.className.match(/content-id-([a-zA-Z0-9_-]+)/); if (m) return m[1]; }
                const links = element.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');
                for (const link of links) {
                    const watchMatch = link.href.match(/[?&]v=([a-zA-Z0-9_-]+)/);
                    if (watchMatch) return watchMatch[1];
                    const shortsMatch = link.href.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
                    if (shortsMatch) return shortsMatch[1];
                }
                const vidEl = element.querySelector('[data-video-id]');
                return vidEl ? vidEl.getAttribute('data-video-id') : null;
            },

            _normalizeVideoIdInput(value) {
                const raw = String(value || '').trim();
                if (VIDEO_ID_PATTERN.test(raw)) return raw;
                const directMatch = raw.match(/(?:[?&]v=|\/(?:shorts|embed|live)\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                if (directMatch) return directMatch[1];
                try {
                    const url = new URL(raw);
                    const queryId = url.searchParams.get('v');
                    if (queryId && VIDEO_ID_PATTERN.test(queryId)) return queryId;
                    const segments = url.pathname.split('/').filter(Boolean);
                    const hostname = String(url.hostname || '').toLowerCase();
                    if ((hostname === 'youtu.be' || hostname === 'www.youtu.be') && VIDEO_ID_PATTERN.test(segments[0] || '')) return segments[0];
                    for (let i = 0; i < segments.length - 1; i++) {
                        if (['shorts', 'embed', 'live'].includes(segments[i]) && VIDEO_ID_PATTERN.test(segments[i + 1])) {
                            return segments[i + 1];
                        }
                    }
                } catch (error) {
                    void error;
                }
                return null;
            },

            _extractChannelInfos(element) {
                if (!element) return [];
                const selector = 'a[href*="/@"], a[href*="/channel/"], a[href*="/c/"], a[href*="/user/"]';
                const links = Array.from(element.querySelectorAll?.(selector) || []);
                if (!links.length) {
                    const first = element.querySelector?.(selector);
                    if (first) links.push(first);
                }
                const fallbackName = element.querySelector?.('#channel-name a, .ytd-channel-name a, [id="text"] a')?.textContent?.trim() ||
                    element.querySelector?.('#channel-name, .ytd-channel-name')?.textContent?.trim() || '';
                const seenKeys = new Set();
                const records = [];
                for (const link of links) {
                    const href = String(link?.href || link?.getAttribute?.('href') || '').trim();
                    if (!href) continue;
                    const channelName = String(link?.textContent || link?.getAttribute?.('aria-label') || '').trim()
                        || fallbackName || href;
                    const record = normalizeBlockedChannelRecord({
                        id: href,
                        url: href,
                        name: channelName,
                        source: 'dom'
                    });
                    if (!record) continue;
                    const keys = this._getChannelIdentityKeys(record);
                    const dedupeKeys = keys.length ? keys : [href.toLowerCase()];
                    if (dedupeKeys.some(key => seenKeys.has(key))) continue;
                    dedupeKeys.forEach(key => seenKeys.add(key));
                    records.push({ ...record, name: channelName || record.name });
                }
                return records;
            },

            _extractChannelInfo(element) {
                return this._extractChannelInfos(element)[0] || null;
            },

            _extractDuration(element) {
                const badge = element.querySelector('ytd-thumbnail-overlay-time-status-renderer, .ytd-thumbnail-overlay-time-status-renderer, [aria-label*=":"]');
                if (!badge) return 0;
                const text = badge.textContent?.trim() || badge.getAttribute('aria-label') || '';
                const match = text.match(/(\d+):(\d+):?(\d+)?/);
                if (!match) return 0;
                if (match[3]) return parseInt(match[1])*3600 + parseInt(match[2])*60 + parseInt(match[3]);
                return parseInt(match[1])*60 + parseInt(match[2]);
            },

            _extractTitle(element) {
                return element.querySelector('#video-title, .title, [id="video-title"]')?.textContent?.trim()?.toLowerCase() || '';
            },

            _parseCompactCount(text, options = {}) {
                const fn = globalThis.YTKitCore && globalThis.YTKitCore.parseCompactCount;
                return fn ? fn(text, null, options) : null;
            },

            _extractViewCount(element) {
                const candidates = [
                    ...element.querySelectorAll('#metadata-line, ytd-video-meta-block, .metadata, #meta, [aria-label*="view"], [aria-label*="watching"]')
                ];
                for (const candidate of candidates) {
                    const text = `${candidate.textContent || ''} ${candidate.getAttribute('aria-label') || ''}`;
                    const count = this._parseCompactCount(text, { allowBare: true });
                    if (count !== null) return count;
                }
                return this._parseCompactCount(element.textContent || '');
            },

            _extractWatchedRatio(element) {
                const progress = element.querySelector('#progress, ytd-thumbnail-overlay-resume-playback-renderer #progress, ytd-thumbnail-overlay-resume-playback-renderer [style*="width"]');
                if (!progress) return 0;
                const ariaNow = Number(progress.getAttribute('aria-valuenow'));
                if (Number.isFinite(ariaNow) && ariaNow > 0) return Math.max(0, Math.min(100, ariaNow));
                const styleText = `${progress.getAttribute('style') || ''};width:${progress.style?.width || ''}`;
                const match = styleText.match(/width\s*:\s*(\d+(?:\.\d+)?)%/i);
                return match ? Math.max(0, Math.min(100, Number(match[1]) || 0)) : 0;
            },

            _extractDescriptionText(element) {
                const nodes = [
                    element.querySelector('#description'),
                    element.querySelector('ytd-video-meta-block #description'),
                    element.querySelector('[id="description"]'),
                    element.querySelector('.description')
                ].filter(Boolean);
                return Array.from(new Set(nodes))
                    .map(node => `${node.textContent || ''} ${node.getAttribute?.('aria-label') || ''}`)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();
            },

            _extractChannelText(element) {
                return Array.from(element.querySelectorAll('#channel-name, #channel-name a, ytd-channel-name, a[href*="/@"], a[href*="/channel/"]'))
                    .map(node => `${node.textContent || ''} ${node.getAttribute?.('aria-label') || ''} ${node.getAttribute?.('href') || ''}`)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();
            },

            _extractPredicateAgeDays(text) {
                const raw = String(text || '').replace(/\u00a0/g, ' ').trim();
                if (!raw) return null;
                const parsed = globalThis.YTKitCore?.parseRelativeYouTubeAge?.(raw);
                if (parsed?.date instanceof Date && !Number.isNaN(parsed.date.getTime())) {
                    return Math.max(0, Math.round((Date.now() - parsed.date.getTime()) / (24 * 60 * 60 * 1000)));
                }
                const match = raw.match(/\b(\d+(?:[,.]\d+)?)\s*(minute|hour|day|week|month|year)s?\s+ago\b/i);
                if (!match) return null;
                const value = Number.parseFloat(match[1].replace(',', '.'));
                const unitDays = {
                    minute: 1 / 1440,
                    hour: 1 / 24,
                    day: 1,
                    week: 7,
                    month: 30,
                    year: 365
                }[match[2].toLowerCase()];
                return Number.isFinite(value) && unitDays ? Math.max(0, Math.round(value * unitDays)) : null;
            },

            _extractVideoMetadata(element) {
                const title = this._extractTitle(element);
                const descriptionText = this._extractDescriptionText(element);
                const channelText = this._extractChannelText(element);
                const rowsText = Array.from(element.querySelectorAll('#metadata-line, ytd-video-meta-block, #meta, ytd-badge-supported-renderer, ytd-thumbnail-overlay-time-status-renderer, ytd-thumbnail-overlay-bottom-panel-renderer, ytd-thumbnail-overlay-side-panel-renderer'))
                    .map(node => `${node.textContent || ''} ${node.getAttribute('aria-label') || ''}`)
                    .join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
                // NFD splits Latin letters from their accents so the patterns
                // below can be written unaccented — but it ALSO decomposes each
                // Hangul syllable into conjoining Jamo, which are letters, not
                // marks, so \p{M} leaves them decomposed. A precomposed Korean
                // literal then never matches, which silently made every one of
                // the six type predicates below dead on Korean. Re-composing
                // restores the syllables; the accents cannot come back because
                // their marks are already gone.
                const normalizedRowsText = rowsText.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
                const metadataText = `${title} ${rowsText}`.replace(/\s+/g, ' ').trim();
                const hrefText = Array.from(element.querySelectorAll('a[href]')).map(link => link.getAttribute('href') || '').join(' ').toLowerCase();
                const heuristicText = `${title} ${descriptionText} ${channelText} ${hrefText}`;
                const hasDuration = this._extractDuration(element) > 0;
                const isShort = element.querySelector('ytd-reel-video-renderer, a[href*="/shorts/"], [href*="/shorts/"], [is-shorts]') ? true : null;
                const isMembersOnly = element.querySelector('[aria-label*="members only" i]') || /\bmembers only\b/.test(rowsText) ? true : null;
                const hasLiveMarker = !!element.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"], .badge-style-type-live-now, yt-icon-badge-shape[overlay-style="LIVE"], [aria-label*="LIVE" i]');
                const hasUpcomingMarker = !!element.querySelector('ytd-thumbnail-overlay-time-status-renderer[overlay-style="UPCOMING"], [overlay-style="UPCOMING"], [data-upcoming], [is-upcoming]');
                const hasMixMarker = !!element.querySelector('[is-mix], ytd-radio-renderer, [data-list-type="RD"], a[href*="start_radio=1"], a[href*="list=RD"]');
                const hasPlaylistMarker = !!element.querySelector('a[href*="/playlist?list="], ytd-thumbnail-overlay-side-panel-renderer, ytd-playlist-video-renderer, [is-playlist], [data-list-type="playlist"]');
                return {
                    title,
                    metadataText,
                    descriptionText,
                    channelText,
                    hrefText,
                    views: this._extractViewCount(element),
                    watchedRatio: this._extractWatchedRatio(element),
                    ageDays: this._extractPredicateAgeDays(rowsText),
                    syntheticNarration: SYNTHETIC_NARRATION_PATTERN.test(heuristicText)
                        || SYNTHETIC_CHANNEL_PATTERN.test(heuristicText),
                    uploadCadencePerDay: extractUploadCadencePerDay(`${metadataText} ${descriptionText} ${channelText}`),
                    isLive: hasLiveMarker
                        || /(?:\b(?:live|watching now|en vivo|en directo|transmitiendo|in diretta|ao vivo|en direct|regardent maintenant|jetzt live|сейчас смотрят|прямой эфир|в эфире)\b|ライブ|生配信|視聴中|라이브|생방송|시청 중|直播|正在观看|مباشر|بث مباشر|يشاهد الآن)/i.test(normalizedRowsText) && !hasDuration,
                    isUpcoming: hasUpcomingMarker
                        || /(?:\b(?:upcoming|scheduled for|premieres?|set reminder|starts in|proximamente|programado para|estreno|establecer recordatorio|comienza en|a venir|programme pour|premiere|definir un rappel|commence dans|in programma|programmato per|imposta promemoria|inizia tra|bevorstehend|geplant fur|erinnerung festlegen|beginnt in)\b|запланировано|премьера|напомнить|начнется через|近日公開|配信予定|プレミア公開|リマインダー|開始まで|예정|예약|알림 설정|시작|即将|预定|首播|设置提醒|开始于|قادم|مجدول|العرض الأول|تعيين تذكير|يبدأ خلال)/i.test(normalizedRowsText),
                    // Type detection reads ONLY badge/metadata rows — matching
                    // against the title hid videos titled "How to mix audio",
                    // "movie review", or "top 5 videos".
                    isMix: hasMixMarker
                        || /(?:\b(?:youtube\s+mix|mix|mezcla|melange|miscela)\b|микс|ミックス|믹스|混合|混音|ميكس)/i.test(normalizedRowsText)
                        || /(?:start_radio=1|list=rd)/i.test(hrefText),
                    isPlaylist: hasPlaylistMarker
                        || /(?:\b(?:playlist|playlists|lista de reproduccion|liste de lecture|lista de lectura)\b|плейлист|再生リスト|재생목록|播放列表|قائمة تشغيل|قايمة تشغيل|\b\d+\s+videos?\b)/i.test(normalizedRowsText),
                    // Localised like their four siblings above: Latin terms are
                    // written WITHOUT diacritics because normalizedRowsText has
                    // already stripped combining marks, and non-Latin scripts sit
                    // outside \b, which only anchors on ASCII word characters.
                    // French bare "double" (from "doublé") is deliberately absent
                    // — it normalises onto a very common word.
                    isMovie: /(?:\b(?:movie|free with ads|buy or rent|rent or buy|pelicula|gratis con anuncios|comprar o alquilar|alquilar o comprar|film|kostenlos mit werbung|kaufen oder leihen|leihen oder kaufen|gratuit avec publicites|acheter ou louer|louer ou acheter|gratis con annunci|acquista o noleggia|noleggia o acquista|filme|gratis com anuncios|comprar ou alugar|alugar ou comprar)\b|фильм|бесплатно с рекламой|купить или взять напрокат|напрокат|映画|広告付きで無料|購入またはレンタル|レンタル|영화|광고 포함 무료|구매 또는 대여|대여|电影|含广告免费|购买或租借|租借|فيلم|مجاني مع الاعلانات|شراء او استئجار)/i.test(normalizedRowsText),
                    isAutoDubbed: /(?:\b(?:auto[-\s]?dubbed|dubbed|audio track|doblado automaticamente|doblado|pista de audio|automatisch synchronisiert|synchronisiert|tonspur|audiospur|doublage|double automatiquement|piste audio|doppiato automaticamente|doppiato|traccia audio|dublado automaticamente|dublado|faixa de audio)\b|автоматический дубляж|дубляж|аудиодорожка|自動吹き替え|吹き替え|音声トラック|자동 더빙|더빙|오디오 트랙|自动配音|配音|音轨|مدبلج تلقائيا|مدبلج|المسار الصوتي)/i.test(normalizedRowsText),
                    isShort,
                    isMembersOnly
                };
            },

            _matchesMetadataFilters(element, metadata = this._extractVideoMetadata(element)) {
                if (appState.settings.hideVideosHideLive && metadata.isLive) return { hide: true, reason: 'live' };
                if (appState.settings.hideVideosHideUpcoming && metadata.isUpcoming) return { hide: true, reason: 'upcoming' };
                if (appState.settings.hideVideosHideMixes && metadata.isMix) return { hide: true, reason: 'mix' };
                if (appState.settings.hideVideosHidePlaylists && metadata.isPlaylist) return { hide: true, reason: 'playlist' };
                if (appState.settings.hideVideosHideMovies && metadata.isMovie) return { hide: true, reason: 'movie' };
                if (appState.settings.hideVideosHideAutoDubbed && metadata.isAutoDubbed) return { hide: true, reason: 'auto-dubbed' };
                if (appState.settings.hideVideosLowViewFilter) {
                    const threshold = Math.max(0, Number(appState.settings.hideVideosLowViewThreshold) || 0);
                    if (threshold > 0 && metadata.views !== null && metadata.views < threshold) return { hide: true, reason: 'low-view' };
                }
                if (appState.settings.hideVideosSyntheticNarrationFilter === true && metadata.syntheticNarration) {
                    return { hide: true, reason: 'synthetic-narration' };
                }
                if (appState.settings.hideVideosLowSignalFilter === true) {
                    const minViews = Math.max(0, Number(appState.settings.hideVideosLowSignalMinViews) || 0);
                    const minAgeDays = Math.max(0, Number(appState.settings.hideVideosLowSignalMinAgeDays) || 0);
                    if (minViews > 0 && metadata.views !== null && metadata.views < minViews
                        && metadata.ageDays !== null && metadata.ageDays >= minAgeDays) {
                        return { hide: true, reason: 'low-signal' };
                    }
                }
                if (appState.settings.hideVideosUploadCadenceFilter === true) {
                    const maxUploadsPerDay = Math.max(0, Number(appState.settings.hideVideosUploadCadencePerDay) || 0);
                    if (maxUploadsPerDay > 0 && Number.isFinite(metadata.uploadCadencePerDay)
                        && metadata.uploadCadencePerDay > maxUploadsPerDay) {
                        return { hide: true, reason: 'upload-cadence' };
                    }
                }
                const watchedThreshold = Math.max(0, Math.min(100, Number(appState.settings.hideVideosWatchedRatio) || 0));
                if (watchedThreshold > 0 && metadata.watchedRatio >= watchedThreshold) return { hide: true, reason: 'watched-ratio' };
                return { hide: false, reason: '' };
            },

            _findThumbnailContainer(element) {
                const selectors = ['a.yt-lockup-view-model__content-image', 'a.ytLockupViewModelContentImage', 'yt-thumbnail-view-model', '#thumbnail', 'ytd-thumbnail'];
                for (const sel of selectors) {
                    if (element.matches?.(sel)) return element;
                    const candidate = element.querySelector?.(sel);
                    if (candidate) return candidate;
                }
                return null;
            },

            _createSVG(pathD) {
                const svg = createSVG('0 0 24 24', [{ type: 'path', d: pathD, fill: 'currentColor' }], { fill: 'currentColor', stroke: false });
                svg.setAttribute('width', '14');
                svg.setAttribute('height', '14');
                return svg;
            },

            _createHideButton() {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ytkit-video-hide-btn';
                btn.title = appState.settings.hideVideosAllowChannelBlock === false
                    ? 'Hide this video'
                    : this._isChannelAllowlistMode()
                        ? t('videoHiderHideButtonAllowChannel', 'Hide this video (right-click to allow channel)')
                        : t('videoHiderHideButtonBlockChannel', 'Hide this video (right-click to block channel)');
                btn.setAttribute('aria-label', btn.title);
                btn.appendChild(this._createSVG('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'));
                return btn;
            },

            _createMarkWatchedButton(marked = false) {
                const btn = document.createElement('button');
                btn.className = 'ytkit-video-mark-watched-btn';
                this._updateMarkWatchedButton(btn, marked);
                btn.appendChild(this._createSVG('M20 6 9 17l-5-5 1.41-1.41L9 14.17 18.59 4.59 20 6z'));
                return btn;
            },

            _updateMarkWatchedButton(btn, marked) {
                const label = marked
                    ? t('videoHiderUnmarkWatched', 'Unmark as watched')
                    : t('videoHiderMarkWatched', 'Mark as watched');
                btn.dataset.marked = marked ? 'true' : 'false';
                btn.title = label;
                btn.setAttribute('aria-label', label);
            },

            _syncMarkWatchedButton(element, videoId) {
                const thumbnail = this._findThumbnailContainer(element);
                if (!thumbnail) return;
                const existing = thumbnail.querySelector('.ytkit-video-mark-watched-btn');
                const controlsEnabled = appState.settings.markWatchedVideos === true && this._isScopeEnabledForPath();
                if (!controlsEnabled || !videoId) {
                    existing?.remove();
                    return;
                }
                const marked = this._isVideoMarkedWatched(videoId);
                if (existing) {
                    this._updateMarkWatchedButton(existing, marked);
                    return;
                }
                if (typeof window !== 'undefined' && window.getComputedStyle && window.getComputedStyle(thumbnail).position === 'static') {
                    thumbnail.style.position = 'relative';
                }
                const btn = this._createMarkWatchedButton(marked);
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = element.dataset.ytkitVideoId || this._extractVideoId(element) || videoId;
                    if (!id) return;
                    if (this._isVideoMarkedWatched(id)) this._unmarkWatchedVideo(id, element);
                    else this._markWatchedVideo(id, element);
                });
                thumbnail.appendChild(btn);
            },

            _syncQuickHideButton(element, videoId) {
                const thumbnail = this._findThumbnailContainer(element);
                if (!thumbnail) return;
                const existing = thumbnail.querySelector('.ytkit-video-hide-btn');
                const controlsEnabled = appState.settings.hideVideosShowQuickHideButton !== false && this._isScopeEnabledForPath();
                if (!controlsEnabled) {
                    existing?.remove();
                    return;
                }
                if (existing) {
                    existing.title = appState.settings.hideVideosAllowChannelBlock === false
                        ? 'Hide this video'
                        : this._isChannelAllowlistMode()
                            ? t('videoHiderHideButtonAllowChannel', 'Hide this video (right-click to allow channel)')
                            : t('videoHiderHideButtonBlockChannel', 'Hide this video (right-click to block channel)');
                    existing.setAttribute('aria-label', existing.title);
                    return;
                }
                if (window.getComputedStyle(thumbnail).position === 'static') thumbnail.style.position = 'relative';
                const btn = this._createHideButton();
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Read the CURRENT id: YouTube re-binds new video data into
                    // recycled card elements (chip clicks), and the closure's
                    // videoId from button-creation time would hide the wrong
                    // video. dataset.ytkitVideoId is refreshed on every
                    // reprocess.
                    const id = element.dataset.ytkitVideoId || this._extractVideoId(element) || videoId;
                    if (id) this._hideVideo(id, element);
                });
                btn.title = appState.settings.hideVideosAllowChannelBlock === false
                    ? 'Hide this video'
                    : this._isChannelAllowlistMode()
                        ? t('videoHiderHideButtonAllowChannel', 'Hide this video (right-click to allow channel)')
                        : t('videoHiderHideButtonBlockChannel', 'Hide this video (right-click to block channel)');
                btn.setAttribute('aria-label', btn.title);
                btn.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (appState.settings.hideVideosAllowChannelBlock === false) return;
                    const channelInfo = this._extractChannelInfo(element);
                    if (channelInfo) this._blockChannel(channelInfo, element);
                });
                thumbnail.appendChild(btn);
            },

            _showToast(message, buttons = []) {
                showToast(message, '#6b7280', {
                    duration: 5,
                    tone: 'neutral',
                    actions: buttons.map(button => ({
                        text: button.text,
                        onClick: button.onClick
                    }))
                });
            },

            _markWatchedVideo(videoId, element) {
                if (!this._addMarkedWatchedVideo(videoId)) return false;
                this._lastMarkedWatched = { type: 'mark', id: videoId, element };
                this._processAllVideos();
                this._showToast(t('videoHiderMarkedWatched', 'Marked as watched'), [
                    { text: t('toastActionUndo', 'Undo'), onClick: () => this._undoMarkWatched() }
                ]);
                return true;
            },

            _unmarkWatchedVideo(videoId, element) {
                if (!this._removeMarkedWatchedVideo(videoId)) return false;
                this._lastMarkedWatched = { type: 'unmark', id: videoId, element };
                this._processAllVideos();
                this._showToast(t('videoHiderUnmarkedWatched', 'Watched mark removed'), [
                    { text: t('toastActionUndo', 'Undo'), onClick: () => this._undoMarkWatched() }
                ]);
                return true;
            },

            _undoMarkWatched() {
                const last = this._lastMarkedWatched;
                if (!last) return false;
                if (last.type === 'mark') this._removeMarkedWatchedVideo(last.id);
                else this._addMarkedWatchedVideo(last.id);
                this._processAllVideos();
                this._lastMarkedWatched = null;
                return true;
            },

            _hideVideo(videoId, element) {
                const removedAllowed = this._removeAllowedVideos([videoId]);
                this._addHiddenVideos([videoId]);
                this._applyVideoHiddenState(element, true, 'manual');
                this._lastHidden = { type: 'video', id: videoId, element, removedAllowed };
                this._updatePageActionButtons();
                this._showToast('Video hidden', [
                    { text: 'Undo', onClick: () => this._undoHide() },
                    { text: 'Manage', onClick: () => this._showManager() }
                ]);
            },

            _blockChannel(channelInfo, element) {
                if (!channelInfo) return;
                if (appState.settings.hideVideosAllowChannelBlock === false) {
                    showToast('Channel blocking is disabled', '#6b7280');
                    return;
                }
                if (this._isChannelAllowlistMode()) {
                    const result = this._addAllowedChannel(channelInfo);
                    const record = result.record || channelInfo;
                    this._hideChannelVideos(record);
                    this._lastHidden = { type: 'allowed-channel', info: record };
                    const message = result.added
                        ? t('videoHiderAllowedChannelToast', 'Channel allowed: {name}').replace('{name}', record.name)
                        : t('videoHiderAlreadyAllowedChannelToast', '{name} is already allowed').replace('{name}', record.name);
                    this._showToast(message, [
                        { text: t('toastActionUndo', 'Undo'), onClick: () => this._undoHide() },
                        { text: t('toastActionManage', 'Manage'), onClick: () => this._showManager() }
                    ]);
                    return;
                }
                const result = this._addBlockedChannel(channelInfo);
                const record = result.record || channelInfo;
                this._hideChannelVideos(record);
                this._lastHidden = { type: 'channel', info: record };
                this._showToast(result.added ? `Blocked: ${record.name}` : `${record.name} is already blocked`, [
                    { text: 'Undo', onClick: () => this._undoHide() },
                    { text: 'Manage', onClick: () => this._showManager() }
                ]);
            },

            _hideChannelVideos(channelInfo) {
                document.querySelectorAll(this._VIDEO_SELECTORS).forEach(el => {
                    const infos = this._extractChannelInfos(el);
                    if (infos.some(info => this._isSameChannel(info, channelInfo))) {
                        this._applyVideoHiddenState(el, this._shouldHide(el));
                    }
                });
            },

            _undoHide() {
                if (!this._lastHidden) return;
                if (this._lastHidden.type === 'video') {
                    const hidden = this._getHiddenVideos();
                    const idx = hidden.indexOf(this._lastHidden.id);
                    if (idx > -1) { hidden.splice(idx, 1); this._setHiddenVideos(hidden); }
                    if (this._lastHidden.removedAllowed?.length) this._addAllowedVideos(this._lastHidden.removedAllowed, { force: true });
                    this._restoreRemovedVideoNodes(new Set([this._lastHidden.id]));
                    this._lastHidden.element?.classList.remove('ytkit-video-hidden');
                    // The captured element may have been recycled between hide
                    // and Undo — strip the class wherever the id landed and
                    // reprocess, mirroring _unhideVideo.
                    document.querySelectorAll(`[data-ytkit-video-id="${this._lastHidden.id}"]`)?.forEach(el => {
                        el.classList.remove('ytkit-video-hidden');
                    });
                    this._processAllVideos();
                } else if (this._lastHidden.type === 'channel') {
                    this._removeBlockedChannel(this._lastHidden.info);
                    this._processAllVideos();
                } else if (this._lastHidden.type === 'allowed-channel') {
                    this._removeAllowedChannel(this._lastHidden.info);
                    this._processAllVideos();
                }
                this._updatePageActionButtons();
                this._lastHidden = null;
            },

            _unhideVideo(videoId, options = {}) {
                const removed = this._removeHiddenVideos([videoId]);
                if (removed.length > 0) {
                    if (options.remember !== false) {
                        this._addAllowedVideos([videoId]);
                    }
                    this._restoreRemovedVideoNodes(new Set([videoId]));
                    document.querySelectorAll(`[data-ytkit-video-id="${videoId}"]`)?.forEach(el => {
                        el.classList.remove('ytkit-video-hidden');
                    });
                    this._processAllVideos();
                    this._updatePageActionButtons();
                    return true;
                }
                return false;
            },

            _showManager() {
                setSettingsPanelOpen(true);
                setTimeout(() => {
                    const navBtn = document.querySelector('.ytkit-nav-btn[data-tab="Video-Hider"]');
                    if (navBtn) navBtn.click();
                }, 100);
            },

            _shouldHide(element) {
                delete element.dataset.ytkitFilterReason;
                const hideForReason = reason => {
                    element.dataset.ytkitFilterReason = reason;
                    return true;
                };
                const videoId = this._extractVideoId(element);
                if (videoId && this._isVideoAllowed(videoId)) return false;
                if (videoId && this._isVideoIdHidden(videoId)) return hideForReason('manual');
                if (videoId
                    && appState.settings.markWatchedVideos === true
                    && appState.settings.hideVideosRemoveHiddenCards === true
                    && this._isVideoMarkedWatched(videoId)) {
                    return hideForReason('marked-watched');
                }
                const channelInfos = this._extractChannelInfos(element);
                const channelInfo = channelInfos[0] || null;
                if (this._isChannelAllowlistMode()) {
                    // Empty or unresolved allowlists are fail-open: an empty
                    // list must never hide every feed card, and cards whose
                    // channel cannot be identified must remain recoverable.
                    if (channelInfos.length
                        && this._getAllowedChannelKeys().size > 0
                        && !this._isChannelAllowed(channelInfos)) return hideForReason('channelNotAllowed');
                } else if (this._isChannelBlocked(channelInfos)) {
                    return hideForReason('blockedChannel');
                }

                const filterStr = (appState.settings.hideVideosKeywordFilter || '').trim();
                if (filterStr) {
                    const title = this._extractTitle(element);
                    const channelName = channelInfos.map(info => info?.name || '').filter(Boolean).join(' ').toLowerCase();
                    const searchText = (title + ' ' + channelName).toLowerCase();

                    if (filterStr.startsWith('/')) {
                        try {
                            const regexMatch = filterStr.match(/^\/(.+)\/([gimsuy]*)$/);
                            if (regexMatch) {
                                // Reject patterns with nested quantifiers (ReDoS risk).
                                // Catches: a*+, a{2}*, (a+)+, (a|b*)+, (foo|bar*)+, ((a+)b)+, etc.
                                // Any group whose body contains *any* quantifier and is itself
                                // followed by another quantifier is rejected. This covers
                                // alternation-wrapped quantifier stacks that the narrower
                                // `(a+)+`-only guard used to miss.
                                const pat = regexMatch[1];
                                const adjacentQuantifiers = /([+*?]|\{\d+,?\d*\})\s*[+*?]/.test(pat);
                                const groupWithInnerQuantifier = /\(([^()]*(?:[+*?]|\{\d+,?\d*\})[^()]*)\)\s*(?:[+*?]|\{\d+,?\d*\})/.test(pat);
                                // Overlapping-alternation backtracking: a group containing `|`, then
                                // quantified by +/*/{n,} (e.g. (a|a|a)+, (a|aa)+). Overlapping branches
                                // alone are exponential — no inner quantifier needed.
                                const altGroupQuantified = /\([^()]*\|[^()]*\)\s*(?:[+*]|\{\d+,?\d*\})/.test(pat);
                                const hasNestedQuantifiers = adjacentQuantifiers || groupWithInnerQuantifier || altGroupQuantified;
                                if (hasNestedQuantifiers) {
                                    DebugManager.log('VideoHider', 'Regex rejected: nested quantifiers (ReDoS risk)');
                                } else {
                                    // Filtering is boolean and must not carry lastIndex
                                    // across title/channel tests or repeated scans.
                                    const regexFlags = regexMatch[2].replace(/[gy]/g, '');
                                    const regex = new RegExp(regexMatch[1], regexFlags);
                                    if (regex.test(title) || regex.test(channelName)) return hideForReason('keyword');
                                }
                            }
                        } catch (e) {
                            DebugManager.log('VideoHider', 'Invalid regex pattern', e.message);
                        }
                    } else {
                        const keywords = filterStr.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
                        const positiveKw = keywords.filter(k => !k.startsWith('!'));
                        const negativeKw = keywords.filter(k => k.startsWith('!')).map(k => k.slice(1));
                        if (negativeKw.length && negativeKw.some(k => searchText.includes(k))) return false;
                        if (positiveKw.length && positiveKw.some(k => searchText.includes(k))) return hideForReason('keyword');
                    }
                }

                const metadataMatch = this._matchesMetadataFilters(element);
                if (metadataMatch.hide) {
                    return hideForReason(metadataMatch.reason);
                }

                if (appState.settings.advancedLocalPredicate) {
                    const evaluator = this._getPredicateEvaluator();
                    if (evaluator) {
                        const ctx = this._buildPredicateCtx(element, videoId, channelInfo);
                        if (evaluator(ctx)) {
                            return hideForReason('predicate');
                        }
                    }
                }

                const minDuration = (appState.settings.hideVideosDurationFilter || 0) * 60;
                if (minDuration > 0) {
                    const duration = this._extractDuration(element);
                    if (duration > 0 && duration < minDuration) return hideForReason('duration');
                }
                return false;
            },

            _getPredicateEvaluator() {
                const code = appState.settings.advancedLocalPredicateCode || '';
                if (!code.trim()) return null;
                if (this._predicateCache?.source === code) return this._predicateCache.evaluator;
                const compiled = PredicateSandbox.compile(code);
                if (!compiled.ok) {
                    DebugManager.log('Predicate', `Compile failed: ${compiled.error} (pos ${compiled.position})`);
                    this._predicateCache = { source: code, evaluator: null, error: compiled.error };
                    return null;
                }
                this._predicateCache = { source: code, evaluator: compiled.evaluator, error: null };
                return compiled.evaluator;
            },

            // v4.47.0 NF16: best-effort sub-count parser for predicate
            // ctx. YouTube occasionally renders "1.2M subscribers" in
            // card hover metadata; when present we parse it so power
            // users can write `subsCount < 1000` style rules
            // (BlockTube + PocketTube parity). Returns null when no
            // such metadata is rendered so predicates can distinguish
            // "no data" from "0 subscribers".
            _extractSubsCount(metadataText) {
                return this._parseCompactCount(metadataText, {
                    labels: SUBSCRIBER_COUNT_LABELS,
                    zeroPattern: NO_SUBSCRIBERS_PATTERN
                });
            },

            // v4.47.0 NF16: like-count lookup from the RYD cache. Cached
            // by videoId in chrome.storage.local under 'ytkit-ryd-cache'
            // when the returnDislike feature has hit the API. Returns
            // null when no entry exists so predicates can distinguish
            // "no RYD data" from "0 likes". Cached per call inside
            // _rydCacheForPredicates to avoid re-reading storage on
            // every card during a feed scan.
            _rydCacheForPredicates: null,
            _rydCacheLoadedAt: 0,
            _readRydLikes(videoId) {
                if (!videoId) return null;
                const now = Date.now();
                // Refresh in-memory cache no more than every 5s; aligns
                // with the RYD feature's own caching cadence so a fresh
                // fetch surfaces quickly without thrashing storage.
                if (!this._rydCacheForPredicates || now - this._rydCacheLoadedAt > 5000) {
                    try { this._rydCacheForPredicates = storageReadJSON('ytkit-ryd-cache', null) || {}; }
                    catch (_) { /* reason: predicate ctx must not throw on cache read failure */ this._rydCacheForPredicates = {}; }
                    this._rydCacheLoadedAt = now;
                }
                const entry = this._rydCacheForPredicates[videoId];
                if (!entry) return null;
                return Number.isFinite(entry.likes) ? entry.likes : null;
            },

            _buildPredicateCtx(element, videoId, channelInfo) {
                const metadata = this._extractVideoMetadata(element);
                const path = window.location.pathname;
                let page = 'other';
                if (path === '/' || path === '') page = 'home';
                else if (path.startsWith('/feed/subscriptions')) page = 'subscriptions';
                else if (path.startsWith('/results')) page = 'search';
                else if (path.startsWith('/watch')) page = 'watch';
                else if (path.startsWith('/@') || path.startsWith('/channel/') || path.startsWith('/c/') || path.startsWith('/user/')) page = 'channel';
                const ctx = {
                    videoId: videoId || '',
                    channelId: channelInfo?.id || '',
                    channelHandle: channelInfo?.handle || '',
                    title: (metadata?.title || '').toLowerCase(),
                    channelName: (channelInfo?.name || '').toLowerCase(),
                    descriptionText: metadata?.descriptionText || '',
                    channelText: metadata?.channelText || '',
                    syntheticNarration: !!metadata?.syntheticNarration,
                    uploadCadencePerDay: metadata?.uploadCadencePerDay ?? null,
                    durationSec: this._extractDuration(element) || 0,
                    viewCount: metadata?.views || 0,
                    // v4.47.0 NF16: BlockTube/PocketTube parity additions.
                    // `likes` is null when RYD data is unavailable;
                    // `subsCount` is null when the card does not render
                    // subscriber metadata. Predicates can write
                    // `likes != null && likes > 100000` for explicit-
                    // data checks, or rely on the null-as-falsy
                    // semantics of the existing comparison operators.
                    likes: this._readRydLikes(videoId),
                    subsCount: this._extractSubsCount(metadata?.metadataText),
                    ageDays: metadata?.ageDays ?? null,
                    isLive: !!metadata?.isLive,
                    isUpcoming: !!metadata?.isUpcoming,
                    isShort: metadata?.isShort ?? null,
                    isMix: !!metadata?.isMix,
                    isMembersOnly: metadata?.isMembersOnly ?? null,
                    isAutoDubbed: !!metadata?.isAutoDubbed,
                    page
                };
                return Object.freeze(ctx);
            },

            _isNestedCardHost(element) {
                // Current feeds render ytd-rich-item-renderer > yt-lockup-view-model
                // (older layouts, > ytd-rich-grid-media). All of those tags are in
                // _VIDEO_SELECTORS so a card matches twice per pass; the outer host
                // owns the verdict, so the inner one is skipped rather than
                // re-running extraction and predicate evaluation on the same card.
                return !!element?.parentElement?.closest?.(this._VIDEO_SELECTORS);
            },

            _processVideoElement(element) {
                if (this._isNestedCardHost(element)) return;
                element.dataset.ytkitHideProcessed = 'true';
                const videoId = this._extractVideoId(element);
                if (videoId) element.dataset.ytkitVideoId = videoId;
                if (!this._isScopeEnabledForPath()) {
                    this._applyVideoHiddenState(element, false);
                    this._applyMarkedWatchedState(element, false);
                    this._syncQuickHideButton(element, videoId);
                    this._syncMarkWatchedButton(element, videoId);
                    return;
                }
                this._applyVideoHiddenState(element, this._shouldHide(element));
                this._applyMarkedWatchedState(element, appState.settings.markWatchedVideos === true && this._isVideoMarkedWatched(videoId));
                this._syncQuickHideButton(element, videoId);
                this._syncMarkWatchedButton(element, videoId);
            },

            _processVideoElementWithResult(element) {
                if (this._isNestedCardHost(element)) return false;
                element.dataset.ytkitHideProcessed = 'true';
                const videoId = this._extractVideoId(element);
                if (videoId) element.dataset.ytkitVideoId = videoId;
                if (!this._isScopeEnabledForPath()) {
                    this._applyVideoHiddenState(element, false);
                    this._applyMarkedWatchedState(element, false);
                    this._syncQuickHideButton(element, videoId);
                    this._syncMarkWatchedButton(element, videoId);
                    return false;
                }
                const shouldHide = this._shouldHide(element);
                this._applyVideoHiddenState(element, shouldHide);
                this._applyMarkedWatchedState(element, appState.settings.markWatchedVideos === true && this._isVideoMarkedWatched(videoId));
                this._syncQuickHideButton(element, videoId);
                this._syncMarkWatchedButton(element, videoId);
                return shouldHide;
            },

            _processAllDebounceTimer: null,
            _chipSecondPassTimer: null,
            _processAllBudgetHandle: null,
            _mutationBudgetHandle: null,
            _lastScanDiagnostics: null,
            _cancelBudgetedScans() {
                this._processAllBudgetHandle?.cancel?.();
                this._mutationBudgetHandle?.cancel?.();
                this._processAllBudgetHandle = null;
                this._mutationBudgetHandle = null;
            },
            _recordScanDiagnostics(result) {
                if (!result) return;
                this._lastScanDiagnostics = {
                    label: result.label || 'video-hider',
                    total: result.total || 0,
                    processed: result.processed || 0,
                    chunks: result.chunks || 0,
                    durationMs: Math.round((result.durationMs || 0) * 10) / 10,
                    cancelled: !!result.cancelled
                };
                if ((result.chunks || 0) > 1 || (result.durationMs || 0) > 16) {
                    DebugManager.log('VideoHider', `Budgeted scan ${this._lastScanDiagnostics.label}: ${this._lastScanDiagnostics.processed}/${this._lastScanDiagnostics.total} cards in ${this._lastScanDiagnostics.chunks} chunks (${this._lastScanDiagnostics.durationMs}ms)`);
                }
            },
            // v4.58.1 invariant, extended to the rule-driven filters: a feed
            // filter that would hide more than a quarter of a reasonably sized
            // feed is misfiring, so it must fail OPEN, reveal what it hid and
            // say so. Only the HEURISTIC reasons are guarded - keyword,
            // duration and predicate rules are the ones that silently empty a
            // feed when a rule over-matches. Deliberate choices are exempt:
            // manual hides, blocked channels, marked-watched, and allowlist
            // mode, where hiding everything unlisted is the entire point.
            _RULE_HIDE_REASONS: Object.freeze(['keyword', 'duration', 'predicate', 'synthetic-narration', 'low-signal', 'upload-cadence']),
            _MAX_RULE_HIDDEN_RATIO: 0.25,
            _RATIO_GUARD_MIN_CARDS: 8,
            _lastRuleHideGuard: null,
            _enforceRuleHideRatioGuard(cards) {
                if (!Array.isArray(cards) || cards.length < this._RATIO_GUARD_MIN_CARDS) return false;
                const guarded = this._RULE_HIDE_REASONS;
                const overreaching = cards.filter((el) => {
                    const reason = el?.dataset?.ytkitFilterReason;
                    return !!reason
                        && guarded.includes(reason)
                        && el.classList?.contains?.('ytkit-video-hidden');
                });
                if (overreaching.length / cards.length <= this._MAX_RULE_HIDDEN_RATIO) {
                    this._lastRuleHideGuard = null;
                    return false;
                }
                for (const el of overreaching) this._applyVideoHiddenState(el, false);
                this._lastRuleHideGuard = { hidden: overreaching.length, total: cards.length };
                const message = `refused to hide ${overreaching.length}/${cards.length} cards by rule`;
                try { DiagnosticLog?.record?.('videoHider', message); } catch (e) { void e; }
                DebugManager.log('VideoHider', `Rule filter bailed: ${message}`);
                try {
                    showToast?.(t('videoHiderRuleGuardTpl',
                        'Video Hider filters matched {count} of {total} cards, so they were left visible.')
                        .replace('{count}', String(overreaching.length))
                        .replace('{total}', String(cards.length)), undefined, { tone: 'warning' });
                } catch (e) { void e; }
                return true;
            },
            _processAllVideos() {
                // Clear pending batch to prevent race with MutationObserver
                this._clearBatchBuffer?.();
                this._cancelBudgetedScans();
                this._restoreRemovedVideoNodes();
                document.querySelectorAll('[data-ytkit-hide-processed]').forEach(el => { delete el.dataset.ytkitHideProcessed; });
                const videos = Array.from(document.querySelectorAll(this._VIDEO_SELECTORS));
                const processOne = !this._isScopeEnabledForPath()
                    ? (el) => {
                        this._applyVideoHiddenState(el, false);
                        this._syncQuickHideButton(el, this._extractVideoId(el));
                    }
                    : (el) => this._processVideoElement(el);
                const handle = runBudgetedElementBatch(videos, processOne, {
                    label: 'video-hider:process-all',
                    chunkSize: 60,
                    budgetMs: 8,
                    warnAfterMs: 16
                });
                this._processAllBudgetHandle = handle;
                Promise.resolve(handle.promise).then((result) => {
                    if (this._processAllBudgetHandle !== handle) return;
                    this._processAllBudgetHandle = null;
                    this._recordScanDiagnostics(result);
                    if (!result?.cancelled) {
                        this._enforceRuleHideRatioGuard(videos);
                        this._updatePageActionButtons();
                    }
                });
                return handle;
            },
            _processAllVideosDebounced(delay = 300) {
                if (this._processAllDebounceTimer) clearTimeout(this._processAllDebounceTimer);
                this._processAllDebounceTimer = setTimeout(() => {
                    this._processAllDebounceTimer = null;
                    this._processAllVideos();
                }, delay);
            },

            _getVisibleVideos() {
                const videos = [];
                if (!this._isScopeEnabledForPath()) return videos;
                document.querySelectorAll(this._VIDEO_SELECTORS).forEach(item => {
                    if (item.classList.contains('ytkit-video-hidden')) return;
                    const videoId = this._extractVideoId(item);
                    if (videoId) videos.push({ id: videoId, element: item });
                });
                return videos;
            },

            _getHiddenVideosOnPage() {
                const hiddenIds = new Set();
                document.querySelectorAll(this._VIDEO_SELECTORS).forEach(item => {
                    const videoId = this._extractVideoId(item);
                    if (!videoId || !this._isVideoIdHidden(videoId)) return;
                    hiddenIds.add(videoId);
                });
                this._removedVideoNodes.forEach(record => {
                    if (record?.videoId && this._isVideoIdHidden(record.videoId)) hiddenIds.add(record.videoId);
                });
                return [...hiddenIds];
            },

            _getRestorableVideoIdsOnPage() {
                const restorableIds = new Set(this._getHiddenVideosOnPage());
                document.querySelectorAll(this._VIDEO_SELECTORS).forEach(item => {
                    const videoId = this._extractVideoId(item);
                    if (videoId && item.classList.contains('ytkit-video-hidden')) restorableIds.add(videoId);
                });
                this._removedVideoNodes.forEach(record => {
                    if (record?.videoId) restorableIds.add(record.videoId);
                });
                return [...restorableIds];
            },

            _getHiddenVideoElementsOnPage() {
                const hiddenItems = [];
                document.querySelectorAll(this._VIDEO_SELECTORS).forEach(item => {
                    const videoId = this._extractVideoId(item);
                    if ((videoId && this._isVideoIdHidden(videoId)) || item.classList.contains('ytkit-video-hidden')) {
                        hiddenItems.push({ id: videoId, element: item });
                    }
                });
                return hiddenItems;
            },

            _updatePageActionButtons() {
                const hiddenCount = this._getRestorableVideoIdsOnPage().length;
                const removableCount = this._getHiddenVideoElementsOnPage().length;
                document.querySelectorAll('.ytkit-hide-all-restore-btn').forEach(btn => {
                    if (!(btn instanceof HTMLButtonElement)) return;
                    btn.disabled = hiddenCount === 0;
                    btn.title = hiddenCount === 0
                        ? 'No hidden videos on this page'
                        : `Restore ${hiddenCount} hidden video${hiddenCount === 1 ? '' : 's'} on this page`;
                    btn.setAttribute('aria-label', btn.title);
                });
                document.querySelectorAll('.ytkit-hide-all-remove-btn').forEach(btn => {
                    if (!(btn instanceof HTMLButtonElement)) return;
                    btn.disabled = removableCount === 0;
                    btn.title = removableCount === 0
                        ? 'No hidden videos to remove from this page'
                        : `Remove ${removableCount} hidden video${removableCount === 1 ? '' : 's'} from this page`;
                    btn.setAttribute('aria-label', btn.title);
                });
            },

            _hideAllVideos() {
                const videos = this._getVisibleVideos();
                if (videos.length === 0) { showToast('No visible videos to hide', '#6b7280'); return; }
                const hidden = this._getHiddenVideos();
                let newlyHidden = 0;
                const removedAllowed = this._removeAllowedVideos(videos.map(v => v.id));
                videos.forEach(v => {
                    if (!hidden.includes(v.id)) { hidden.push(v.id); newlyHidden++; }
                    this._applyVideoHiddenState(v.element, true);
                });
                if (hidden.length > IMPORT_LIMITS.hiddenVideos) {
                    hidden.splice(0, hidden.length - IMPORT_LIMITS.hiddenVideos);
                }
                this._setHiddenVideos(hidden);
                this._updatePageActionButtons();
                this._showToast(`Hidden ${newlyHidden} videos`, [
                    { text: 'Undo All', onClick: () => this._undoHideAll(videos, removedAllowed) },
                    { text: 'Manage', onClick: () => this._showManager() }
                ]);
            },

            _undoHideAll(videos, removedAllowed = []) {
                const hidden = this._getHiddenVideos();
                const removeSet = new Set(videos.map(v => v.id));
                this._restoreRemovedVideoNodes(removeSet);
                videos.forEach(v => v.element.classList.remove('ytkit-video-hidden'));
                this._setHiddenVideos(hidden.filter(id => !removeSet.has(id)));
                if (removedAllowed.length > 0) this._addAllowedVideos(removedAllowed, { force: true });
                this._updatePageActionButtons();
                showToast('Restored all videos', '#22c55e');
            },

            _restoreHiddenVideosOnPage() {
                const hiddenIds = this._getRestorableVideoIdsOnPage();
                if (hiddenIds.length === 0) {
                    showToast('No hidden videos on this page', '#6b7280');
                    this._updatePageActionButtons();
                    return;
                }
                const hiddenSet = new Set(hiddenIds);
                const previousHidden = this._getHiddenVideos();
                const allowedAdded = this._addAllowedVideos(hiddenIds);
                const remaining = previousHidden.filter(id => !hiddenSet.has(id));
                this._setHiddenVideos(remaining);
                this._restoreRemovedVideoNodes(hiddenSet);
                document.querySelectorAll(this._VIDEO_SELECTORS).forEach(item => {
                    const videoId = this._extractVideoId(item);
                    if (videoId && hiddenSet.has(videoId)) item.classList.remove('ytkit-video-hidden');
                });
                this._processAllVideos();
                this._updatePageActionButtons();
                showToast(`Restored ${hiddenIds.length} hidden video${hiddenIds.length === 1 ? '' : 's'}`, '#22c55e', {
                    duration: 5,
                    action: {
                        text: 'Undo',
                        onClick: () => {
                            const restored = this._getHiddenVideos();
                            const merged = [...new Set([...restored, ...hiddenIds])];
                            this._setHiddenVideos(merged);
                            this._removeAllowedVideos(allowedAdded);
                            this._processAllVideos();
                            this._updatePageActionButtons();
                        }
                    }
                });
            },

            _removeHiddenVideosOnPage() {
                const hiddenItems = this._getHiddenVideoElementsOnPage();
                if (hiddenItems.length === 0) {
                    showToast('No hidden videos to remove from this page', '#6b7280');
                    this._updatePageActionButtons();
                    return;
                }
                const ids = hiddenItems.map(item => item.id).filter(Boolean);
                hiddenItems.forEach(item => this._removeVideoElement(item.element));
                this._updatePageActionButtons();
                this._showToast(`Removed ${hiddenItems.length} hidden video${hiddenItems.length === 1 ? '' : 's'} from this page`, [
                    {
                        text: 'Undo',
                        onClick: () => {
                            this._restoreRemovedVideoNodes(new Set(ids));
                            this._updatePageActionButtons();
                        }
                    }
                ]);
            },

            _createHideAllButtonElement(className) {
                const ns = 'http://www.w3.org/2000/svg';
                const createSvgElement = (tag, attrs) => {
                    const el = document.createElementNS(ns, tag);
                    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
                    return el;
                };
                const group = document.createElement('div');
                group.className = `${className} ytkit-hide-all-group`;
                group.setAttribute('role', 'group');
                group.setAttribute('aria-label', 'Video Hider quick actions');

                const restoreBtn = document.createElement('button');
                restoreBtn.type = 'button';
                restoreBtn.className = 'ytkit-watch-action-btn ytkit-hide-all-restore-btn';
                restoreBtn.title = 'Restore hidden videos on this page';
                restoreBtn.setAttribute('aria-label', 'Restore hidden videos on this page');
                const restoreSvg = createSvgElement('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
                restoreSvg.appendChild(createSvgElement('path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' }));
                restoreSvg.appendChild(createSvgElement('circle', { cx: '12', cy: '12', r: '3' }));
                const restoreIconWrap = document.createElement('span');
                restoreIconWrap.className = 'ytkit-watch-action-btn__icon';
                restoreIconWrap.appendChild(restoreSvg);
                restoreBtn.appendChild(restoreIconWrap);
                restoreBtn.addEventListener('click', () => this._restoreHiddenVideosOnPage());

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'ytkit-watch-action-btn ytkit-hide-all-remove-btn';
                removeBtn.title = 'Remove hidden videos on this page';
                removeBtn.setAttribute('aria-label', 'Remove hidden videos on this page');
                const removeSvg = createSvgElement('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
                removeSvg.appendChild(createSvgElement('path', { d: 'M3 6h18' }));
                removeSvg.appendChild(createSvgElement('path', { d: 'M8 6V4h8v2' }));
                removeSvg.appendChild(createSvgElement('path', { d: 'M19 6l-1 14H6L5 6' }));
                removeSvg.appendChild(createSvgElement('path', { d: 'M10 11v5' }));
                removeSvg.appendChild(createSvgElement('path', { d: 'M14 11v5' }));
                const removeIconWrap = document.createElement('span');
                removeIconWrap.className = 'ytkit-watch-action-btn__icon';
                removeIconWrap.appendChild(removeSvg);
                removeBtn.appendChild(removeIconWrap);
                removeBtn.addEventListener('click', () => this._removeHiddenVideosOnPage());

                const hideAllBtn = document.createElement('button');
                hideAllBtn.type = 'button';
                hideAllBtn.className = 'ytkit-watch-action-btn ytkit-hide-all-btn';
                hideAllBtn.title = 'Hide all visible videos on this page';
                const svg = createSvgElement('svg', { viewBox: '0 0 24 24', width: '20', height: '20', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
                svg.appendChild(createSvgElement('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }));
                svg.appendChild(createSvgElement('line', { x1: '1', y1: '1', x2: '23', y2: '23' }));
                const iconWrap = document.createElement('span');
                iconWrap.className = 'ytkit-watch-action-btn__icon';
                iconWrap.appendChild(svg);
                hideAllBtn.appendChild(iconWrap);
                const text = document.createElement('span');
                text.className = 'ytkit-watch-action-btn__label';
                text.textContent = 'Hide All';
                hideAllBtn.appendChild(text);
                hideAllBtn.addEventListener('click', () => this._hideAllVideos());
                group.appendChild(restoreBtn);
                group.appendChild(removeBtn);
                group.appendChild(hideAllBtn);
                this._updatePageActionButtons();
                return group;
            },

            _createSubsHideAllButton() {
                if (document.querySelector('.ytkit-subs-hide-all-btn')) return;
                if (window.location.pathname !== '/feed/subscriptions') return;
                if (!this._isScopeEnabledForPath('/feed/subscriptions')) return;
                const headerButtons = document.querySelector('#masthead #end #buttons');
                if (!headerButtons) return;
                const hideAllBtn = this._createHideAllButtonElement('ytkit-subs-hide-all-btn');
                headerButtons.appendChild(hideAllBtn);
                this._updatePageActionButtons();
            },

            _removeSubsHideAllButton() {
                document.querySelector('.ytkit-subs-hide-all-btn')?.remove();
            },

            _createHomeHideAllButton() {
                if (document.querySelector('.ytkit-home-hide-all-btn')) return;
                if (window.location.pathname !== '/') return;
                if (!this._isScopeEnabledForPath('/')) return;
                const headerButtons = document.querySelector('#masthead #end #buttons');
                if (!headerButtons) return;
                const hideAllBtn = this._createHideAllButtonElement('ytkit-home-hide-all-btn');
                headerButtons.appendChild(hideAllBtn);
                this._updatePageActionButtons();
            },

            _removeHomeHideAllButton() {
                document.querySelector('.ytkit-home-hide-all-btn')?.remove();
            },

            _syncMastheadPageActions() {
                const path = window.location.pathname;
                if (path === '/feed/subscriptions' && this._isScopeEnabledForPath('/feed/subscriptions')) {
                    this._createSubsHideAllButton();
                } else {
                    this._removeSubsHideAllButton();
                }
                if (path === '/' && this._isScopeEnabledForPath('/')) {
                    this._createHomeHideAllButton();
                } else {
                    this._removeHomeHideAllButton();
                }
            },

            _mutationTouchesMastheadControls(mutations) {
                const selector = '#masthead #end #buttons';
                const touches = node => node?.nodeType === 1 && Boolean(
                    node.matches?.(selector)
                    || node.closest?.(selector)
                    || node.querySelector?.(selector)
                );
                return Array.from(mutations || []).some(mutation =>
                    touches(mutation.target)
                    || Array.from(mutation.addedNodes || []).some(touches)
                    || Array.from(mutation.removedNodes || []).some(touches)
                );
            },

            init() {
                const css = `
                    /* Both overlay controls sit on the INLINE-END corner and
                       stay visible. That corner is also where YouTube mounts
                       its own hover overlay (Watch Later / Add to queue), so
                       the two stack while the cursor is on the card; the
                       Hide Queue On Thumbnails setting clears YouTube's pair
                       for anyone who wants the corner to itself. Idle is
                       neutral so a feed of thumbnails doesn't read as a wall of
                       red dots — the destructive tint arrives on hover/focus,
                       when the click is actually imminent. */
                    .ytkit-video-hide-btn {
                        position: absolute !important;
                        top: 8px !important;
                        inset-inline-end: 8px !important;
                        width: 28px;
                        height: 28px;
                        background: rgba(8, 11, 16, 0.86) !important;
                        border: 1px solid rgba(255, 255, 255, 0.28) !important;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex !important;
                        align-items: center;
                        justify-content: center;
                        z-index: ${Z.HIDE_BTN} !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        pointer-events: auto !important;
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45) !important;
                        /* Enumerate specific properties instead of \`all\` so we
                           don't accidentally animate layout-affecting props on
                           YouTube's thumbnail cards (which trigger reflow
                           during rapid scroll). */
                        transition:
                            opacity 180ms var(--ytkit-ease-out),
                            background-color 180ms var(--ytkit-ease-out),
                            border-color 180ms var(--ytkit-ease-out),
                            transform 180ms var(--ytkit-ease-out);
                        padding: 0;
                        color: #fff;
                        backdrop-filter: none;
                    }
                    .ytkit-video-hide-btn:hover,
                    .ytkit-video-hide-btn:focus-visible {
                        background: rgba(220, 38, 38, 0.96) !important;
                        border-color: rgba(255, 255, 255, 0.5) !important;
                        transform: scale(1.08);
                    }
                    .ytkit-video-hide-btn:focus-visible {
                        outline: none;
                        box-shadow: var(--ytkit-focus-ring);
                    }
                    .ytkit-video-hide-btn svg { width: 14px; height: 14px; fill: #fff !important; pointer-events: none; }
                    .ytkit-video-mark-watched-btn {
                        position: absolute;
                        top: 8px;
                        inset-inline-end: 42px;
                        width: 28px;
                        height: 28px;
                        background: rgba(8, 11, 16, 0.86);
                        border: 1px solid rgba(255, 255, 255, 0.28);
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: ${Z.HIDE_BTN};
                        opacity: 1;
                        transition: opacity 180ms var(--ytkit-ease-out), background-color 180ms var(--ytkit-ease-out), border-color 180ms var(--ytkit-ease-out), transform 180ms var(--ytkit-ease-out);
                        padding: 0;
                        color: #fff;
                        backdrop-filter: none;
                    }
                    .ytkit-video-mark-watched-btn:hover,
                    .ytkit-video-mark-watched-btn:focus-visible { background: rgba(8, 145, 178, 0.96); border-color: rgba(255, 255, 255, 0.4); transform: scale(1.08); }
                    .ytkit-video-mark-watched-btn:focus-visible { outline: none; box-shadow: var(--ytkit-focus-ring); }
                    .ytkit-video-mark-watched-btn svg { width: 14px; height: 14px; fill: #fff; pointer-events: none; }
                    .ytkit-video-marked-watched { opacity: 0.48 !important; filter: saturate(0.72); }
                    .ytkit-video-hidden { display: none !important; }
                    .ytkit-video-hidden-placeholder {
                        box-sizing: border-box;
                        display: flex !important;
                        align-items: center;
                        min-height: 44px;
                        margin: 4px 0;
                        padding: 10px 12px;
                        border: 1px solid var(--ytkit-border, rgba(255, 255, 255, 0.12));
                        border-radius: 8px;
                        color: var(--ytkit-text-secondary, #aeb6c3);
                        background: var(--ytkit-surface-raised, rgba(255, 255, 255, 0.04));
                        font: 500 12px/1.4 system-ui, sans-serif;
                    }
                    html:not([dark]) .ytkit-video-hidden-placeholder {
                        color: var(--ytkit-text-secondary, #5f6875);
                        border-color: var(--ytkit-border, rgba(15, 23, 42, 0.12));
                        background: var(--ytkit-surface-raised, rgba(15, 23, 42, 0.04));
                    }
                    .ytkit-blocked-watch-overlay {
                        position: fixed;
                        inset: 0;
                        z-index: ${Z.BANNER};
                        display: grid;
                        place-items: center;
                        padding: 24px;
                        background: rgba(4, 7, 12, 0.82);
                    }
                    .ytkit-blocked-watch-dialog {
                        width: min(520px, 100%);
                        box-sizing: border-box;
                        padding: 28px;
                        border: 1px solid var(--ytkit-border-strong, rgba(255, 255, 255, 0.2));
                        border-radius: 20px;
                        color: var(--ytkit-text-primary, #f5f7fb);
                        background: var(--ytkit-surface-elevated, #171b23);
                        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
                    }
                    .ytkit-blocked-watch-eyebrow {
                        display: block;
                        margin-bottom: 8px;
                        color: var(--ytkit-danger, #ff6b6b);
                        font: 700 12px/1.3 system-ui, sans-serif;
                        letter-spacing: 0.08em;
                        text-transform: uppercase;
                    }
                    .ytkit-blocked-watch-dialog h2 {
                        margin: 0;
                        font: 700 24px/1.25 system-ui, sans-serif;
                    }
                    .ytkit-blocked-watch-dialog > p {
                        margin: 12px 0 0;
                        color: var(--ytkit-text-secondary, #c1c7d0);
                        font: 400 15px/1.55 system-ui, sans-serif;
                    }
                    .ytkit-blocked-watch-channel {
                        overflow-wrap: anywhere;
                        color: var(--ytkit-text-primary, #f5f7fb) !important;
                        font-weight: 650 !important;
                    }
                    .ytkit-blocked-watch-actions {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: flex-end;
                        gap: 10px;
                        margin-top: 24px;
                    }
                    .ytkit-blocked-watch-action {
                        min-width: 96px;
                        min-height: 44px;
                        padding: 10px 16px;
                        border: 1px solid var(--ytkit-border-strong, rgba(255, 255, 255, 0.2));
                        border-radius: 10px;
                        color: var(--ytkit-text-primary, #f5f7fb);
                        background: var(--ytkit-surface-raised, #242a35);
                        font: 650 14px/1.2 system-ui, sans-serif;
                        cursor: pointer;
                    }
                    .ytkit-blocked-watch-action:hover { background: var(--ytkit-surface-hover, #303746); }
                    .ytkit-blocked-watch-action:focus-visible { outline: none; box-shadow: var(--ytkit-focus-ring, 0 0 0 3px #7dd3fc); }
                    .ytkit-blocked-watch-action--allow-once {
                        border-color: transparent;
                        color: var(--ytkit-accent-contrast, #111318);
                        background: var(--ytkit-accent, #ffb454);
                    }
                    .ytkit-blocked-watch-action--allow-once:hover { background: var(--ytkit-accent-hover, #ffc678); }
                    .ytkit-blocked-watch-action:disabled { cursor: wait; opacity: 0.65; }
                    @media (max-width: 520px) {
                        .ytkit-blocked-watch-overlay { padding: 16px; }
                        .ytkit-blocked-watch-dialog { padding: 22px; }
                        .ytkit-blocked-watch-actions { display: grid; }
                    }
                    @media (forced-colors: active) {
                        .ytkit-blocked-watch-dialog,
                        .ytkit-blocked-watch-action { border: 2px solid CanvasText; }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .ytkit-blocked-watch-overlay,
                        .ytkit-blocked-watch-dialog { animation: none !important; transition: none !important; }
                    }
                `;
                this._styleElement = injectStyle(css, this.id, true);
                this._evaluateDirectWatchBlock();
                this._processAllVideos();
                const selectors = this._VIDEO_SELECTORS;

                let batchBuffer = [];
                let batchTimeout = null;
                this._clearBatchBuffer = () => {
                    batchBuffer = [];
                    if (batchTimeout) { clearTimeout(batchTimeout); batchTimeout = null; }
                };

                const processBatch = () => {
                    if (batchBuffer.length > 0 && !this._subsLoadState.loadingBlocked) {
                        this._trackSubsLoadBatch(batchBuffer);
                        batchBuffer = [];
                    }
                    this._updatePageActionButtons();
                };

                // Accumulate mutation-discovered cards between batch runs so
                // cancelling a prior batch for a new mutation flush does not
                // drop unprocessed items.
                let pendingMutationCards = [];
                const scheduleMutationBatch = () => {
                    if (!pendingMutationCards.length) return;
                    // Dedupe: a card that matches the selector AND sits inside
                    // another added node is pushed twice by the observer,
                    // double-counting in the subs-load statistics.
                    const cards = [...new Set(pendingMutationCards)];
                    pendingMutationCards = [];
                    const handle = runBudgetedElementBatch(cards, (el) => {
                        const wasHidden = this._processVideoElementWithResult(el);
                        // processBatch only drains the buffer while subs
                        // auto-loading is UNBLOCKED, but the push site was
                        // unguarded — so a blocked feed accumulated DOM
                        // references without bound until Resume or a
                        // navigation. The statistics these feed are only
                        // meaningful while loading is running anyway.
                        if (!this._subsLoadState.loadingBlocked) {
                            batchBuffer.push({ element: el, hidden: wasHidden });
                        }
                    }, {
                        label: 'video-hider:mutation-batch',
                        chunkSize: 80,
                        budgetMs: 8,
                        warnAfterMs: 16
                    });
                    this._mutationBudgetHandle = handle;
                    Promise.resolve(handle.promise).then((result) => {
                        if (result?.cancelled && result.processed < cards.length) {
                            // Requeue the cancelled tail ahead of newly
                            // discovered cards — cancelling at index N used to
                            // silently drop every card past N, leaving
                            // hidden/blocked videos visible until the next
                            // full navigation rescan.
                            pendingMutationCards = cards.slice(result.processed).concat(pendingMutationCards);
                        }
                        if (this._mutationBudgetHandle !== handle) return;
                        this._mutationBudgetHandle = null;
                        this._recordScanDiagnostics(result);
                        if (pendingMutationCards.length) scheduleMutationBatch();
                        if (batchTimeout) clearTimeout(batchTimeout);
                        batchTimeout = setTimeout(processBatch, 300);
                    });
                };
                this._observer = new MutationObserver(mutations => {
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType !== 1) continue;
                            if (node.matches?.(selectors)) {
                                pendingMutationCards.push(node);
                            }
                            node.querySelectorAll?.(selectors).forEach(el => {
                                pendingMutationCards.push(el);
                            });
                        }
                    }
                    // Insert the Astra group in the same mutation turn that
                    // creates/replaces YouTube's masthead controls. Waiting a
                    // second painted the native buttons first, then shifted
                    // them when the group arrived.
                    if (this._mutationTouchesMastheadControls(mutations)) {
                        this._syncMastheadPageActions();
                    }
                    if (!pendingMutationCards.length) return;
                    // Cancel the in-flight batch and re-schedule with ALL
                    // pending cards (the accumulated ones plus the new ones).
                    this._mutationBudgetHandle?.cancel?.();
                    scheduleMutationBatch();
                });
                const observeTarget = document.querySelector('ytd-app') || document.body;
                this._observer.observe(observeTarget, { childList: true, subtree: true });

                let wasOnSubsPage = window.location.pathname === '/feed/subscriptions';
                const checkPages = () => {
                    const path = window.location.pathname;
                    const isOnSubsPage = path === '/feed/subscriptions';
                    if (isOnSubsPage && this._isScopeEnabledForPath('/feed/subscriptions')) {
                        if (!wasOnSubsPage) this._resetSubsLoadState();
                    } else {
                        this._removeLoadBlocker();
                    }
                    this._syncMastheadPageActions();
                    wasOnSubsPage = isOnSubsPage;
                    this._updatePageActionButtons();
                };

                addNavigateRule('hideVideosFromHomeNav', () => {
                    // Audit pass: reset the predicate-sandbox circuit at every
                    // SPA route boundary so a transient eval failure on one
                    // page doesn't permanently disable filters across the
                    // session (the design doc promises route-level recovery,
                    // not session-wide auto-disable).
                    try { this._predicateCache?.evaluator?.reset?.(); } catch (_) { /* reason: route-level predicate reset is best-effort */ }
                    this._processAllVideosDebounced(500);
                    checkPages();
                    this._evaluateDirectWatchBlock();
                });
                checkPages();

                // Filter chip clicks (e.g. "Recently uploaded") replace grid content
                // without firing yt-navigate-finish. Detect and reprocess after DOM settles.
                this._chipClickHandler = (e) => {
                    const chip = e.target.closest('yt-chip-cloud-chip-renderer, ytd-feed-filter-chip-bar-renderer yt-formatted-string');
                    if (chip) {
                        this._processAllVideosDebounced(800);
                        // Second pass for late-rendering thumbnails
                        if (this._chipSecondPassTimer) clearTimeout(this._chipSecondPassTimer);
                        this._chipSecondPassTimer = setTimeout(() => {
                            this._chipSecondPassTimer = null;
                            this._processAllVideosDebounced(300);
                        }, 1500);
                    }
                };
                document.addEventListener('click', this._chipClickHandler, true);

                DebugManager.log('VideoHider', 'Initialized:', this._getHiddenVideos().length, 'videos,', this._getBlockedChannels().length, 'channels');
            },

            destroy() {
                this._styleElement?.remove();
                this._observer?.disconnect();
                this._clearBatchBuffer?.();
                this._cancelBudgetedScans();
                this._clearDirectWatchEvaluation();
                this._closeDirectWatchInterstitial({ restoreFocus: false });
                this._directWatchRouteKey = null;
                this._directWatchAllowedRouteKey = null;
                this._directWatchResumeAfterDecision = false;
                this._restoreRemovedVideoNodes();
                for (const placeholder of this._hiddenReasonPlaceholders.values()) placeholder.remove();
                this._hiddenReasonPlaceholders.clear();
                if (this._chipClickHandler) { document.removeEventListener('click', this._chipClickHandler, true); this._chipClickHandler = null; }
                if (this._chipSecondPassTimer) { clearTimeout(this._chipSecondPassTimer); this._chipSecondPassTimer = null; }
                if (this._processAllDebounceTimer) { clearTimeout(this._processAllDebounceTimer); this._processAllDebounceTimer = null; }
                removeNavigateRule('hideVideosFromHomeNav');
                document.querySelectorAll('.ytkit-video-hide-btn').forEach(b => b.remove());
                document.querySelectorAll('.ytkit-video-mark-watched-btn').forEach(b => b.remove());
                document.querySelectorAll('.ytkit-video-hidden').forEach(e => e.classList.remove('ytkit-video-hidden'));
                document.querySelectorAll('.ytkit-video-marked-watched').forEach(e => e.classList.remove('ytkit-video-marked-watched'));
                document.querySelectorAll('[data-ytkit-hide-processed]').forEach(e => delete e.dataset.ytkitHideProcessed);
                this._removeSubsHideAllButton();
                this._removeHomeHideAllButton();
                this._removeLoadBlocker();
            }
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.hideVideosFromHome = Object.freeze({
        createHideVideosFromHomeFeature
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createHideVideosFromHomeFeature
        };
    }
})();
