(() => {
    'use strict';

    // extension/features/subtitles/index.js
    //
    // v4.13.0 first feature peel from the 43k-line ytkit.js monolith.
    // Owns the YouTube caption-styling override layer and the optional
    // second-track renderer driven by these settings-schema keys (category
    // `subtitles` in the v4.6.0 schema):
    //
    //   subtitleStyling          (boolean)  master toggle
    //   subStyleFontSize         (number)   50-300 %
    //   subStyleFontFamily       (string)   default | sans | serif | mono | YouTube Sans
    //   subStyleColor            (string)   #rrggbb foreground
    //   subStyleBgOpacity        (number)   0-100 %
    //   subStyleBgColor          (string)   #rrggbb background
    //   subStyleBottomOffset     (number)   % from viewport bottom
    //   subStyleTextShadow       (boolean)  drop shadow on/off
    //   dualLanguageSubtitles    (boolean)  second caption track toggle
    //   dualSubtitleLanguage     (string)   second caption language
    //
    // The styling helper remains byte-identical to the existing inline
    // implementation, while the dual-language runtime owns timed-text
    // fetching, cue timing, and player overlay cleanup for both vehicles.

    const FONT_FAMILY_MAP = Object.freeze({
        default: '',
        sans:    'Roboto, sans-serif',
        serif:   'Georgia, serif',
        mono:    'Menlo, Consolas, monospace',
        'YouTube Sans': '"YouTube Sans", Roboto, sans-serif'
    });

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    }

    function normaliseHex(input, fallback) {
        if (typeof input !== 'string') return fallback;
        const trimmed = input.trim();
        // Accept #RGB / #RRGGBB; reject anything else (defensive — the
        // popup picker only emits #RRGGBB but a corrupted import could
        // ship a malformed value through chrome.storage).
        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
            const r = trimmed[1];
            const g = trimmed[2];
            const b = trimmed[3];
            return ('#' + r + r + g + g + b + b).toLowerCase();
        }
        return fallback;
    }

    function hexToRgb(hex) {
        const safe = normaliseHex(hex, '#000000');
        return {
            r: parseInt(safe.slice(1, 3), 16),
            g: parseInt(safe.slice(3, 5), 16),
            b: parseInt(safe.slice(5, 7), 16)
        };
    }

    // Pure: same input → same CSS string. The CSS shape is preserved
    // byte-for-byte against the previous inline ytkit.js implementation
    // so existing visual regressions stay quiet.
    function buildSubtitleCss(settings) {
        const s = settings || {};
        const sizePct = clamp(s.subStyleFontSize || 100, 50, 300);
        const familyKey = s.subStyleFontFamily;
        const fam = FONT_FAMILY_MAP[familyKey] || '';
        const bgOpacity = clamp(s.subStyleBgOpacity ?? 75, 0, 100) / 100;
        const bgRgb = hexToRgb(s.subStyleBgColor || '#000000');
        const bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', ' + bgOpacity + ')';
        const bottom = clamp(s.subStyleBottomOffset ?? 10, 0, 90);
        const shadow = s.subStyleTextShadow !== false
            ? '2px 2px 4px rgba(0,0,0,0.9)'
            : 'none';
        const colorHex = normaliseHex(s.subStyleColor, '#ffffff') || '#ffffff';
        return `
                    .ytp-caption-segment {
                        font-size: ${sizePct}% !important;
                        color: ${colorHex} !important;
                        background: ${bgRgba} !important;
                        ${fam ? `font-family: ${fam} !important;` : ''}
                        text-shadow: ${shadow} !important;
                        padding: 2px 6px !important;
                    }
                    .caption-window, .ytp-caption-window-container {
                        bottom: ${bottom}% !important;
                    }
                `;
    }

    function normaliseLanguageCode(value) {
        return String(value || '')
            .trim()
            .replace(/_/g, '-')
            .toLowerCase();
    }

    function getCaptionTrackLanguage(track) {
        return normaliseLanguageCode(track?.languageCode || '');
    }

    function languageCodesMatch(left, right) {
        const a = normaliseLanguageCode(left);
        const b = normaliseLanguageCode(right);
        if (!a || !b) return false;
        return a === b || a.split('-')[0] === b.split('-')[0];
    }

    function pickSecondaryCaptionTrack(tracks, preferredLanguage = 'auto', primaryLanguage = '') {
        if (!Array.isArray(tracks) || tracks.length === 0) return null;
        const available = tracks.filter((track) => track && typeof track === 'object');
        if (available.length === 0) return null;

        const preferred = normaliseLanguageCode(preferredLanguage);
        if (preferred && preferred !== 'auto') {
            return available.find((track) => getCaptionTrackLanguage(track) === preferred)
                || available.find((track) => languageCodesMatch(getCaptionTrackLanguage(track), preferred))
                || null;
        }

        const primary = normaliseLanguageCode(primaryLanguage);
        return available.find((track) => {
            const language = getCaptionTrackLanguage(track);
            return language && (!primary || !languageCodesMatch(language, primary));
        }) || null;
    }

    function appendTimedTextFormat(baseUrl, format = 'json3') {
        const source = String(baseUrl || '').trim();
        if (!source) return '';
        if (/[?&]fmt=/.test(source)) return source.replace(/([?&]fmt=)[^&]*/i, `$1${format}`);
        return source + (source.includes('?') ? '&' : '?') + `fmt=${format}`;
    }

    function parseJson3Cues(payload) {
        const events = Array.isArray(payload?.events) ? payload.events : [];
        const cues = [];
        for (const event of events) {
            if (!event || !Array.isArray(event.segs)) continue;
            const text = event.segs
                .map((segment) => String(segment?.utf8 ?? ''))
                .join('')
                .replace(/\r\n?/g, '\n')
                .trim();
            if (!text) continue;

            const startMs = Number(event.tStartMs ?? 0);
            if (!Number.isFinite(startMs) || startMs < 0) continue;
            const durationMs = Number(event.dDurationMs);
            const endMs = Number.isFinite(durationMs) && durationMs >= 0
                ? startMs + durationMs
                : null;
            cues.push({
                start: startMs / 1000,
                end: endMs == null ? null : endMs / 1000,
                text
            });
        }
        return cues.sort((left, right) => left.start - right.start);
    }

    function findActiveCaptionCue(cues, currentTime) {
        if (!Array.isArray(cues) || cues.length === 0) return null;
        const time = Number(currentTime);
        if (!Number.isFinite(time) || time < 0) return null;

        let low = 0;
        let high = cues.length - 1;
        let candidate = -1;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            if (Number(cues[middle]?.start) <= time) {
                candidate = middle;
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        if (candidate < 0) return null;

        const cue = cues[candidate];
        const nextStart = Number(cues[candidate + 1]?.start);
        const end = Number(cue.end);
        const effectiveEnd = Number.isFinite(end) && end > cue.start
            ? end
            : (Number.isFinite(nextStart) && nextStart > cue.start ? nextStart : Infinity);
        return time < effectiveEnd ? cue : null;
    }

    function getCaptionTrackLabel(track) {
        const label = track?.name?.simpleText
            || track?.name?.runs?.map((run) => run?.text || '').join('')
            || track?.languageName?.simpleText
            || track?.languageCode;
        return String(label || '').trim();
    }

    function createDualLanguageSubtitlesRuntime(options = {}) {
        const doc = options.document || (typeof document !== 'undefined' ? document : null);
        const win = options.window || (typeof window !== 'undefined' ? window : null);
        const appState = options.appState || { settings: {} };
        const addNavigateRule = typeof options.addNavigateRule === 'function'
            ? options.addNavigateRule
            : () => {};
        const removeNavigateRule = typeof options.removeNavigateRule === 'function'
            ? options.removeNavigateRule
            : () => {};
        const injectStyle = typeof options.injectStyle === 'function'
            ? options.injectStyle
            : () => ({ remove() {} });
        const getVideoId = typeof options.getVideoId === 'function'
            ? options.getVideoId
            : () => '';
        const getMainVideoElement = typeof options.getMainVideoElement === 'function'
            ? options.getMainVideoElement
            : () => doc?.querySelector?.('#movie_player video, video') || null;
        const getPlayerResponseGlobal = typeof options.getPlayerResponseGlobal === 'function'
            ? options.getPlayerResponseGlobal
            : () => null;
        const extensionFetchJson = typeof options.extensionFetchJson === 'function'
            ? options.extensionFetchJson
            : null;
        const fetchCaptionTrack = typeof options.fetchCaptionTrack === 'function'
            ? options.fetchCaptionTrack
            : async (track) => {
                if (!extensionFetchJson || !track?.baseUrl) return { cues: null, track };
                const result = await extensionFetchJson({
                    url: appendTimedTextFormat(track.baseUrl, 'json3')
                });
                return {
                    cues: parseJson3Cues(result?.data),
                    source: 'api',
                    track
                };
            };
        const translate = typeof options.t === 'function' ? options.t : null;
        const t = (key, fallback) => {
            try {
                const translated = translate?.(key, fallback);
                return translated || fallback || key;
            } catch (_) {
                // reason: accessibility copy must never prevent subtitle render
                return fallback || key;
            }
        };
        const setTimer = typeof options.setTimeout === 'function'
            ? options.setTimeout
            : (fn, delay) => setTimeout(fn, delay);
        const clearTimer = typeof options.clearTimeout === 'function'
            ? options.clearTimeout
            : (timer) => clearTimeout(timer);

        return {
            id: 'dualLanguageSubtitles',
            _started: false,
            _styleEl: null,
            _overlay: null,
            _video: null,
            _timeHandler: null,
            _resizeHandler: null,
            _loadTimer: null,
            _loadToken: 0,
            _retryCount: 0,
            _cues: [],
            _lastCueKey: '',
            _navRule: null,

            _settings() {
                return appState?.settings && typeof appState.settings === 'object'
                    ? appState.settings
                    : {};
            },

            // The language the viewer is ALREADY reading on screen. "Auto"
            // secondary selection has to avoid that track, and comparing the
            // browser locale instead let the overlay duplicate the native
            // captions whenever the two differed.
            _activeCaptionLanguage() {
                try {
                    const player = doc?.querySelector?.('#movie_player');
                    const option = player?.getOption?.('captions', 'track');
                    const code = option?.languageCode || option?.vss_id || '';
                    if (code) return String(code).replace(/^\.?a?\./, '');
                } catch (_) {
                    // reason: the captions module is absent until the player loads
                }
                return '';
            },

            _primaryLanguage() {
                const preferred = this._settings().transcriptPreferredLanguage;
                if (preferred && preferred !== 'auto') return preferred;
                return this._activeCaptionLanguage()
                    || win?.navigator?.language
                    || (typeof navigator !== 'undefined' ? navigator.language : '');
            },

            _playerResponse() {
                // Off a watch route there is no current video id, so the
                // id-mismatch guard below could not fire and the PREVIOUS watch
                // page's response was accepted — one wasted timed-text fetch and
                // an invisible overlay mount per navigation.
                if (!String(getVideoId?.() || '')) return null;
                const pageData = doc?.querySelector?.('ytd-watch-flexy');
                const pageResponse = pageData?.__data?.playerResponse || pageData?.playerResponse;
                if (pageResponse) return pageResponse;
                const globalResponse = getPlayerResponseGlobal();
                const currentVideoId = String(getVideoId?.() || '');
                const responseVideoId = String(globalResponse?.videoDetails?.videoId || '');
                if (currentVideoId && responseVideoId && currentVideoId !== responseVideoId) return null;
                return globalResponse || null;
            },

            _captionTracks() {
                return this._playerResponse()?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
            },

            _scheduleLoad(delay = 500) {
                if (!this._started) return;
                if (this._loadTimer) clearTimer(this._loadTimer);
                this._loadTimer = setTimer(() => {
                    this._loadTimer = null;
                    this._load();
                }, delay);
            },

            _removeOverlay() {
                this._overlay?.remove?.();
                this._overlay = null;
                this._lastCueKey = '';
            },

            _detachVideo() {
                if (this._video && this._timeHandler) {
                    this._video.removeEventListener?.('timeupdate', this._timeHandler);
                    this._video.removeEventListener?.('seeking', this._timeHandler);
                    this._video.removeEventListener?.('seeked', this._timeHandler);
                    this._video.removeEventListener?.('loadedmetadata', this._timeHandler);
                    this._video.removeEventListener?.('durationchange', this._timeHandler);
                }
                if (this._resizeHandler && win?.removeEventListener) {
                    win.removeEventListener('resize', this._resizeHandler);
                }
                this._video = null;
                this._timeHandler = null;
                this._resizeHandler = null;
            },

            _attachVideo() {
                let video = null;
                try { video = getMainVideoElement(); } catch (_) { video = null; }
                if (!video?.addEventListener) return false;
                if (this._video === video) return true;
                this._detachVideo();
                this._video = video;
                this._timeHandler = () => this._renderCue();
                for (const eventName of ['timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'durationchange']) {
                    video.addEventListener(eventName, this._timeHandler);
                }
                this._resizeHandler = () => this._positionOverlay();
                win?.addEventListener?.('resize', this._resizeHandler);
                return true;
            },

            _positionOverlay() {
                const overlay = this._overlay;
                const player = doc?.querySelector?.('#movie_player');
                if (!overlay || !player?.getBoundingClientRect) return;
                let playerRect;
                try { playerRect = player.getBoundingClientRect(); } catch (_) { return; }
                const native = player.querySelector?.(
                    '.ytp-caption-window-container, .caption-window, .ytp-caption-window'
                );
                let nativeRect = null;
                try {
                    nativeRect = native?.getBoundingClientRect?.() || null;
                } catch (_) { nativeRect = null; }
                const nativeVisible = !!nativeRect
                    && nativeRect.width > 0
                    && nativeRect.height > 0
                    && native?.getAttribute?.('aria-hidden') !== 'true';
                if (nativeVisible) {
                    const top = Math.max(0, Math.round(nativeRect.bottom - playerRect.top + 8));
                    overlay.style.top = `${top}px`;
                    overlay.style.bottom = 'auto';
                    overlay.dataset.position = 'below-native';
                } else {
                    overlay.style.top = 'auto';
                    overlay.style.bottom = '8%';
                    overlay.dataset.position = 'player-bottom-fallback';
                }
            },

            _renderCue() {
                if (!this._overlay || !this._video) return;
                const cue = findActiveCaptionCue(this._cues, this._video.currentTime);
                const cueKey = cue ? `${cue.start}|${cue.end}|${cue.text}` : '';
                if (cueKey !== this._lastCueKey) {
                    this._lastCueKey = cueKey;
                    this._overlay.textContent = cue?.text || '';
                    this._overlay.hidden = !cue;
                }
                if (cue) this._positionOverlay();
            },

            _mountOverlay(track) {
                const player = doc?.querySelector?.('#movie_player');
                if (!player || !doc?.createElement) return false;
                this._removeOverlay();
                const overlay = doc.createElement('div');
                overlay.className = 'ytkit-dual-subtitles-layer';
                overlay.hidden = true;
                overlay.setAttribute('role', 'status');
                overlay.setAttribute('aria-live', 'off');
                overlay.setAttribute('aria-atomic', 'true');
                overlay.setAttribute('aria-label', t('dualSubtitleTrackAria', 'Secondary subtitles'));
                const language = getCaptionTrackLanguage(track);
                if (language) overlay.dataset.language = language;
                player.appendChild(overlay);
                this._overlay = overlay;
                this._positionOverlay();
                return true;
            },

            async _load() {
                if (!this._started) return;
                const token = ++this._loadToken;
                const tracks = this._captionTracks();
                if (!Array.isArray(tracks) || tracks.length === 0) {
                    this._removeOverlay();
                    if (this._retryCount < 6) {
                        this._retryCount += 1;
                        this._scheduleLoad(700);
                    }
                    return;
                }

                const settings = this._settings();
                const track = pickSecondaryCaptionTrack(
                    tracks,
                    settings.dualSubtitleLanguage || 'auto',
                    this._primaryLanguage()
                );
                if (!track) {
                    this._removeOverlay();
                    return;
                }

                let result;
                try {
                    result = await fetchCaptionTrack(track, tracks);
                } catch (_) {
                    // reason: a missing/expired timed-text track is a normal
                    // unavailable-caption state, not a feature crash.
                    result = null;
                }
                if (!this._started || token !== this._loadToken) return;
                const cues = Array.isArray(result?.cues)
                    ? result.cues.filter((cue) => cue && typeof cue.text === 'string' && cue.text.trim())
                    : [];
                if (cues.length === 0) {
                    this._removeOverlay();
                    return;
                }

                this._cues = cues;
                // Mount/attach failures used to re-schedule WITHOUT incrementing
                // the retry count, so a page that resolved tracks but never
                // produced a player node looped every 700ms forever. Only a
                // fully successful render clears the budget.
                if (!this._mountOverlay(track) || !this._attachVideo()) {
                    this._removeOverlay();
                    if (this._retryCount < 6) {
                        this._retryCount += 1;
                        this._scheduleLoad(700);
                    }
                    return;
                }
                this._retryCount = 0;
                this._renderCue();
            },

            _resetForNavigation() {
                this._loadToken += 1;
                this._retryCount = 0;
                this._cues = [];
                this._removeOverlay();
                this._detachVideo();
                this._scheduleLoad(450);
            },

            reload() {
                if (this._started) this._resetForNavigation();
            },

            _ensureStyles() {
                if (this._styleEl || typeof injectStyle !== 'function') return;
                this._styleEl = injectStyle(`
                    #movie_player .ytkit-dual-subtitles-layer {
                        position: absolute;
                        left: 50%;
                        bottom: 8%;
                        z-index: 4;
                        width: min(90%, 960px);
                        box-sizing: border-box;
                        padding: 4px 12px;
                        transform: translateX(-50%);
                        color: #f8fafc;
                        background: rgba(0, 0, 0, .72);
                        border-radius: 4px;
                        font: 600 clamp(14px, 2.1vw, 26px)/1.28 Roboto, Arial, sans-serif;
                        text-align: center;
                        text-shadow: 0 1px 3px rgba(0, 0, 0, .95);
                        unicode-bidi: plaintext;
                        pointer-events: none;
                        user-select: none;
                    }
                    #movie_player .ytkit-dual-subtitles-layer[hidden] { display: none !important; }
                    html:not([dark]) #movie_player .ytkit-dual-subtitles-layer {
                        color: #111827;
                        background: rgba(255, 255, 255, .88);
                        text-shadow: 0 1px 2px rgba(255, 255, 255, .85);
                    }
                    @media (forced-colors: active) {
                        #movie_player .ytkit-dual-subtitles-layer {
                            color: CanvasText;
                            background: Canvas;
                            border: 1px solid CanvasText;
                            text-shadow: none;
                        }
                    }
                `, 'dualLanguageSubtitles', true);
            },

            init() {
                if (this._started || !doc) return;
                this._started = true;
                this._ensureStyles();
                this._navRule = () => this._resetForNavigation();
                addNavigateRule(this.id, this._navRule);
                // Core navigation invokes a newly registered rule once. The
                // guard also keeps the factory usable with a minimal test or
                // userscript navigation shim that only stores the callback.
                if (!this._loadTimer) this._resetForNavigation();
            },

            destroy() {
                this._started = false;
                this._loadToken += 1;
                if (this._loadTimer) clearTimer(this._loadTimer);
                this._loadTimer = null;
                removeNavigateRule(this.id);
                this._navRule = null;
                this._removeOverlay();
                this._detachVideo();
                this._cues = [];
                this._styleEl?.remove?.();
                this._styleEl = null;
            }
        };
    }

    // Lifecycle-ready spec. The buildSubtitleCss helper lives in this
    // peel module; the actual DOM mount/teardown still runs in the
    // monolith's inline subtitleStyling block. v4.47.0 NF5 wave 1
    // registers the spec with the v4.7.0 lifecycle module so the
    // contract is exercised + the future adoption wave can flip to
    // delegating init/destroy here without changing the surface.
    const featureSpec = Object.freeze({
        id: 'subtitleStyling',
        category: 'subtitles',
        pageScopes: Object.freeze(['watch', 'shorts', 'embed']),
        buildCss: buildSubtitleCss,
        // The subtitle-styling CSS remains on the existing monolith
        // lifecycle; the dual-language runtime above owns its own
        // timed-text fetch, cue clock, and player overlay lifecycle.
        init() { /* reason: wave-1 register-only; inline ytkit.js owns init */ },
        destroy() { /* reason: wave-1 register-only; inline ytkit.js owns destroy */ }
    });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.subtitles = Object.freeze({
        buildSubtitleCss,
        featureSpec,
        FONT_FAMILY_MAP,
        appendTimedTextFormat,
        findActiveCaptionCue,
        getCaptionTrackLabel,
        getCaptionTrackLanguage,
        parseJson3Cues,
        pickSecondaryCaptionTrack,
        createDualLanguageSubtitlesRuntime
    });

    // v4.47.0 NF5 wave 1: register with the v4.7.0 lifecycle module so
    // snapshot() can see this feature. Defensive — the lifecycle module
    // is loaded before the peels in manifest content_scripts, but the
    // userscript build path may inline things differently, so we check
    // for the global first and silently skip if absent.
    try {
        if (globalThis.YTKitCore && typeof globalThis.YTKitCore.getLifecycle === 'function') {
            globalThis.YTKitCore.getLifecycle().defineFeature(featureSpec);
        }
    } catch (_) {
        // reason: defineFeature throws on duplicate id; multiple loads of this
        // IIFE (extension + userscript context) must not break boot.
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildSubtitleCss,
            featureSpec,
            FONT_FAMILY_MAP,
            appendTimedTextFormat,
            findActiveCaptionCue,
            getCaptionTrackLabel,
            getCaptionTrackLanguage,
            parseJson3Cues,
            pickSecondaryCaptionTrack,
            createDualLanguageSubtitlesRuntime
        };
    }
})();
