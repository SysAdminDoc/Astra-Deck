(() => {
    'use strict';

    // TranscriptService moved out of the
    // 44k-line ytkit.js monolith into a focused core module.
    //
    // Owns YouTube transcript retrieval via 5-method failover:
    //   1) ytInitialPlayerResponse window-variable read
    //   2) Innertube API POST
    //   3) HTML page fetch + regex extract
    //   4) captionTracks direct regex
    //   5) DOM transcript-renderer scrape
    //
    // The service couples to a handful of ytkit.js externals — getVideoId(),
    // showToast(), the MAIN-world _rw.ytInitialPlayerResponse bridge, and
    // the extensionFetchJson/extensionFetchText proxy helpers. We pass them
    // through as accessor callbacks at instantiation time so the module
    // itself stays free of feature-monolith coupling and works in unit tests
    // with plain object mocks.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createTranscriptService) return;

    const DEFAULT_CONFIG = {
        preferredLanguages: ['en', 'en-US', 'en-GB'],
        preferManualCaptions: true,
        includeTimestamps: true,
        debug: false
    };

    const INNERTUBE_CLIENT_VERSION_FALLBACK = '2.20260401.00.00';
    const CAPTION_TRACK_EXPIRY_SKEW_MS = 30 * 1000;
    const TRANSCRIPT_SOURCES = new Set([
        'none', 'player-global', 'innertube-player', 'watch-page-player',
        'watch-page-regex', 'dom-panel-track', 'dom-panel'
    ]);
    const TRANSCRIPT_PANEL_SELECTORS = Object.freeze([
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
        '[data-target-id="PAmodern_transcript_view"]',
        'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]',
        'ytd-transcript-renderer'
    ]);

    function formatTranscriptSeconds(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        return hours > 0
            ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
            : `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    // Consumers that combine transcripts with bookmarks or citations need a
    // bounded, deterministic shape rather than provider-specific raw
    // segments. Keep this helper side-effect free so exports and tests can
    // use it without opening YouTube's transcript panel.
    function normalizeTranscriptSegments(segments, options = {}) {
        const maxSegments = Math.max(1, Math.min(5000, Math.floor(Number(options.maxSegments) || 2500)));
        const maxTextChars = Math.max(100, Math.min(5000, Math.floor(Number(options.maxTextChars) || 1600)));
        const maxChars = Math.max(1000, Math.min(500000, Math.floor(Number(options.maxChars) || 220000)));
        const cues = [];
        let totalChars = 0;
        let truncated = false;
        for (const segment of Array.isArray(segments) ? segments : []) {
            if (!segment || typeof segment !== 'object') continue;
            const text = String(segment.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
                .replace(/\s+/g, ' ').trim().slice(0, maxTextChars);
            if (!text) continue;
            if (cues.length >= maxSegments || totalChars + text.length > maxChars) {
                truncated = true;
                break;
            }
            const startMs = Number.isFinite(Number(segment.startMs))
                ? Number(segment.startMs)
                : Number(segment.startSeconds ?? segment.start ?? 0) * 1000;
            const endMs = Number.isFinite(Number(segment.endMs))
                ? Number(segment.endMs)
                : Number(segment.endSeconds ?? segment.end ?? segment.startSeconds ?? segment.start ?? 0) * 1000;
            const startSeconds = Math.max(0, Math.floor(startMs / 1000));
            const endSeconds = Math.max(startSeconds, Math.ceil(Math.max(startMs, endMs) / 1000));
            cues.push({
                id: `C${String(cues.length + 1).padStart(4, '0')}`,
                startSeconds,
                endSeconds,
                timestamp: formatTranscriptSeconds(startSeconds),
                text
            });
            totalChars += text.length;
        }
        return { cues, truncated };
    }

    function getTranscriptPanelElement(root = typeof document !== 'undefined' ? document : null, options = {}) {
        if (!root?.querySelector) return null;
        const candidates = [];
        const addCandidate = (candidate) => {
            if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
        };
        if (typeof core.findSurfaceElement === 'function') {
            addCandidate(core.findSurfaceElement('transcriptPanel', { root, required: false }));
        }
        for (const selector of TRANSCRIPT_PANEL_SELECTORS) {
            if (typeof root.querySelectorAll === 'function') {
                const matches = Array.from(root.querySelectorAll(selector) || []);
                for (const match of matches) addCandidate(match);
                if (matches.length === 0) addCandidate(root.querySelector(selector));
            } else {
                addCandidate(root.querySelector(selector));
            }
        }
        const isActive = typeof options.isForVideo === 'function'
            ? (panel) => {
                if (panel.isConnected === false
                    || panel.hidden === true
                    || panel.getAttribute?.('aria-hidden') === 'true'
                    || (typeof panel.getClientRects === 'function' && panel.getClientRects().length === 0)) return false;
                try { return options.isForVideo(options.videoId, panel) === true; }
                catch (_) { return false; }
            }
            : () => true;
        const match = candidates.find(isActive) || null;
        if (match) return match;
        if (options.required) {
            throw new Error('Required selector surface "transcriptPanel" was not found.');
        }
        return null;
    }

    function createAbortError() {
        return core.transcriptIndex?.createAbortError?.() || Object.assign(new Error('Operation cancelled'), {
            // i18n-static: standard DOMException-style error name.
            name: 'AbortError'
        });
    }

    function throwIfAborted(signal) {
        if (!signal?.aborted) return;
        throw signal.reason?.name === 'AbortError' ? signal.reason : createAbortError();
    }

    function parseCaptionTrackExpiresAt(baseUrl) {
        if (typeof baseUrl !== 'string' || !baseUrl) return 0;
        try {
            const value = Number(new URL(baseUrl, 'https://www.youtube.com').searchParams.get('expire'));
            return Number.isFinite(value) && value > 0 ? Math.floor(value * 1000) : 0;
        } catch (_) {
            return 0;
        }
    }

    function getCaptionTrackVideoId(baseUrl) {
        if (typeof baseUrl !== 'string') return '';
        try {
            if (typeof URL !== 'undefined') {
                return new URL(baseUrl, 'https://www.youtube.com').searchParams.get('v') || '';
            }
        } catch (_) {
            // reason: fall through to a narrow query parser for test/legacy contexts
        }
        const match = baseUrl.match(/[?&]v=([^&#]+)/);
        try { return match?.[1] ? decodeURIComponent(match[1]) : ''; }
        catch (_) { return match?.[1] || ''; }
    }

    function getTranscriptHttpStatus(error) {
        const status = Number(error?.response?.status ?? error?.status);
        return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    }

    function classifyCaptionFailure(error) {
        const status = getTranscriptHttpStatus(error);
        if (status === 403) return 'http-403';
        if (status === 404) return 'http-404';
        return 'fetch-failed';
    }

    function sanitizeTranscriptProvenance(rawValue) {
        // A default parameter only fires on `undefined`. Every caller passes
        // `row.provenance` / `raw?.provenance`, which is null whenever the
        // property exists and holds null, and `null.source` threw. Two of those
        // call sites run inside an IndexedDB onsuccess handler, where the throw
        // leaves the wrapping promise unsettled, so the read hangs rather than
        // rejecting. Normalise anything that is not an object to an empty one.
        const value = rawValue && typeof rawValue === 'object' ? rawValue : {};
        const source = TRANSCRIPT_SOURCES.has(value.source) ? value.source : 'none';
        const fetchedAt = Number(value.fetchedAt);
        const expiresAt = Number(value.expiresAt);
        const cleanToken = (token, maxLength) => String(token || '')
            .replace(/[^A-Za-z0-9._-]/g, '')
            .slice(0, maxLength);
        return {
            source,
            language: cleanToken(value.language, 40),
            fetchedAt: Number.isFinite(fetchedAt) && fetchedAt > 0 ? Math.floor(fetchedAt) : 0,
            expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? Math.floor(expiresAt) : 0,
            staleReason: cleanToken(value.staleReason, 80),
            fallbackReason: cleanToken(value.fallbackReason, 80)
        };
    }

    function createTranscriptService(options = {}) {
        const hasVideoIdResolver = typeof options.getVideoId === 'function';
        const getVideoId = hasVideoIdResolver
            ? options.getVideoId
            : () => null;
        const showToast = typeof options.showToast === 'function'
            ? options.showToast
            : () => {};
        const getPlayerResponseGlobal = typeof options.getPlayerResponseGlobal === 'function'
            ? options.getPlayerResponseGlobal
            : () => null;
        const extensionFetchJson = typeof options.extensionFetchJson === 'function'
            ? options.extensionFetchJson
            : async () => { throw new Error('extensionFetchJson not provided'); };
        const extensionFetchText = typeof options.extensionFetchText === 'function'
            ? options.extensionFetchText
            : async () => { throw new Error('extensionFetchText not provided'); };
        const t = typeof options.t === 'function' ? options.t : (_key, fallback) => fallback;
        const nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
        const recordDiagnostic = typeof options.recordDiagnostic === 'function'
            ? options.recordDiagnostic
            : () => {};
        const isDomTranscriptForVideo = typeof options.isDomTranscriptForVideo === 'function'
            ? options.isDomTranscriptForVideo
            : (videoId) => {
                const currentVideoId = getVideoId();
                return !hasVideoIdResolver || currentVideoId === videoId;
            };

        const service = {
            config: { ...DEFAULT_CONFIG, ...(options.config || {}) },

            // Main entry point — downloads transcript with automatic failover
            async downloadTranscript() {
                const videoId = getVideoId();
                if (!videoId) {
                    showToast(t('transcriptNoVideoId', 'No video ID found'), '#ef4444');
                    return { success: false, error: 'No video ID' };
                }

                showToast(t('transcriptFetching', 'Fetching transcript…'), '#3b82f6');
                this._log('Starting transcript fetch for:', videoId);

                try {
                    const transcript = await this.fetchTranscript(videoId);

                    if (transcript.status !== 'ready') {
                        const captionless = transcript.status === 'captionless';
                        showToast(captionless
                            ? t('transcriptUnavailable', 'No transcript available for this video')
                            : t('transcriptUnavailableNow', 'The transcript could not be fetched from YouTube right now.'), '#ef4444');
                        return {
                            success: false,
                            error: captionless ? 'No captions available' : 'Transcript unavailable',
                            provenance: transcript.provenance
                        };
                    }

                    const videoTitle = this._sanitizeFilename(transcript.title || videoId);
                    const content = this._formatTranscript(transcript.segments);

                    this._downloadFile(content, `${videoTitle}_transcript.txt`);

                    showToast(t('transcriptDownloadedTpl', 'Transcript downloaded! ({count} segments)')
                        .replace('{count}', String(transcript.segments.length)), '#22c55e');
                    return {
                        success: true,
                        segments: transcript.segments.length,
                        language: transcript.language,
                        provenance: transcript.provenance
                    };

                } catch (error) {
                    if (typeof console !== 'undefined') {
                        console.error('[YTKit TranscriptService] Error:', error);
                    }
                    showToast(t('transcriptDownloadFailed', 'Failed to download transcript'), '#ef4444');
                    return {
                        success: false,
                        error: error.message,
                        provenance: this.getDiagnostics()?.provenance
                    };
                }
            },

            // Shared retrieval path for indexing, study exports, panels, and
            // downloads. A signed timedtext URL can expire while a tab stays
            // open, so one 403/404/expired URL is allowed exactly one fresh
            // discovery pass. Any rendered-panel fallback is bound to the
            // same current video before its text can leave this service.
            async fetchTranscript(videoId, options = {}) {
                if (!/^[A-Za-z0-9_-]{11}$/.test(String(videoId || ''))) throw new Error('Invalid video ID');
                const signal = options.signal;
                const allowOffPage = options.allowOffPage === true;
                const strictTrack = options.strictTrack === true;
                const allowDomFallback = options.allowDomFallback !== false
                    && !allowOffPage
                    && !strictTrack;
                this._assertVideoCurrent(videoId, signal, allowOffPage);
                const tryRenderedPanel = (fallbackReason, title = videoId, staleReason = '') => {
                    if (!allowDomFallback) return null;
                    const panelSegments = this._scrapeRenderedTranscript(videoId, { signal });
                    if (!panelSegments?.length) return null;
                    return this._finalizeTranscriptResult({
                        status: 'ready',
                        videoId,
                        title: title || videoId,
                        segments: panelSegments
                    }, {
                        source: 'dom-panel',
                        language: '',
                        fetchedAt: nowFn(),
                        staleReason,
                        fallbackReason
                    });
                };

                let trackData;
                try {
                    trackData = await this._getCaptionTracks(videoId, { signal, allowOffPage });
                } catch (error) {
                    if (error?.name === 'AbortError') throw error;
                    this._assertVideoCurrent(videoId, signal, allowOffPage);
                    const panelResult = tryRenderedPanel('discovery-failed');
                    if (panelResult) return panelResult;
                    this._setTranscriptDiagnostic(videoId, 'error', {
                        source: 'none',
                        fetchedAt: nowFn(),
                        staleReason: 'discovery-failed',
                        fallbackReason: allowDomFallback ? 'panel-unavailable' : 'dom-disabled'
                    });
                    throw error;
                }
                this._assertVideoCurrent(videoId, signal, allowOffPage);
                if (trackData?.captionless === true) {
                    return this._finalizeTranscriptResult({
                        status: 'captionless', videoId, title: trackData?.videoTitle || '', segments: []
                    }, {
                        source: trackData?.source || 'none',
                        fetchedAt: nowFn(),
                        fallbackReason: 'no-caption-tracks'
                    });
                }
                if (!trackData?.tracks?.length) {
                    const panelResult = tryRenderedPanel('no-fetchable-track', trackData?.videoTitle);
                    if (panelResult) return panelResult;
                    return this._finalizeTranscriptResult({
                        status: 'unavailable', videoId, title: trackData?.videoTitle || '', segments: []
                    }, {
                        source: trackData?.source || 'none',
                        fetchedAt: nowFn(),
                        staleReason: 'discovery-empty',
                        fallbackReason: allowDomFallback ? 'panel-unavailable' : 'dom-disabled'
                    });
                }
                let selectedTrack = this._selectTrackForFetch(trackData.tracks, options);
                if (!selectedTrack?.baseUrl) {
                    return this._finalizeTranscriptResult({
                        status: 'unavailable', videoId, title: trackData.videoTitle || '', segments: []
                    }, {
                        source: trackData.source || 'none',
                        language: options.trackPreference?.languageCode || '',
                        fetchedAt: nowFn(),
                        staleReason: 'requested-track-missing',
                        fallbackReason: strictTrack ? 'strict-track-unavailable' : 'track-url-missing'
                    });
                }
                this._log('Selected track:', selectedTrack.languageCode, selectedTrack.kind);

                let expiresAt = parseCaptionTrackExpiresAt(selectedTrack.baseUrl);
                let staleReason = expiresAt && expiresAt <= nowFn() + CAPTION_TRACK_EXPIRY_SKEW_MS
                    ? 'expired-url'
                    : '';
                let fallbackReason = '';
                let segments = null;
                let fetchError = null;
                if (!staleReason) {
                    try {
                        segments = await this._fetchTranscriptContent(selectedTrack.baseUrl, { signal });
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        fetchError = error;
                        staleReason = classifyCaptionFailure(error);
                    }
                }
                this._assertVideoCurrent(videoId, signal, allowOffPage);

                const refreshable = staleReason === 'expired-url'
                    || staleReason === 'http-403'
                    || staleReason === 'http-404';
                if ((!segments || segments.length === 0) && refreshable) {
                    // One forced-fresh pass only. It skips the page-global
                    // player response because that is the stale object that
                    // commonly supplied the expired URL in the first place.
                    let freshData = null;
                    try {
                        freshData = await this._getCaptionTracks(videoId, {
                            signal,
                            forceFresh: true,
                            allowOffPage
                        });
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        fetchError = fetchError || error;
                        fallbackReason = 'refresh-discovery-failed';
                    }
                    this._assertVideoCurrent(videoId, signal, allowOffPage);
                    if (freshData?.tracks?.length) {
                        const freshTrack = this._selectRefreshedTrack(freshData.tracks, selectedTrack, options);
                        if (freshTrack?.baseUrl) {
                            selectedTrack = freshTrack;
                            trackData = freshData;
                            expiresAt = parseCaptionTrackExpiresAt(freshTrack.baseUrl);
                            const refreshedUrlExpired = expiresAt
                                && expiresAt <= nowFn() + CAPTION_TRACK_EXPIRY_SKEW_MS;
                            if (refreshedUrlExpired) {
                                fallbackReason = 'refresh-expired-url';
                                fetchError = null;
                            } else {
                                try {
                                    segments = await this._fetchTranscriptContent(freshTrack.baseUrl, { signal });
                                    fallbackReason = segments?.length ? 'track-refresh' : 'track-refresh-empty';
                                    fetchError = null;
                                } catch (error) {
                                    if (error?.name === 'AbortError') throw error;
                                    fetchError = error;
                                    fallbackReason = 'refresh-fetch-failed';
                                }
                            }
                            this._assertVideoCurrent(videoId, signal, allowOffPage);
                        } else if (strictTrack) {
                            fallbackReason = 'strict-track-unavailable';
                        }
                    } else if (freshData?.captionless === true) {
                        fallbackReason = 'refresh-captionless';
                    }
                }

                if (!segments?.length) {
                    const panelResult = tryRenderedPanel(
                        staleReason ? `dom-after-${staleReason}` : 'dom-after-empty',
                        trackData.videoTitle,
                        staleReason
                    );
                    if (panelResult) return panelResult;
                    if (fetchError) {
                        this._setTranscriptDiagnostic(videoId, 'error', {
                            source: trackData.source || 'none',
                            language: selectedTrack.languageCode || '',
                            fetchedAt: nowFn(),
                            expiresAt,
                            staleReason,
                            // Keep whatever the refresh attempt recorded
                            // ('refresh-discovery-failed', 'refresh-fetch-failed',
                            // 'refresh-expired-url'). Hardcoding the panel
                            // reason here overwrote exactly the case this
                            // provenance exists to explain — "we tried a
                            // refresh and it failed" never reached
                            // getDiagnostics() or DiagnosticLog.
                            fallbackReason: fallbackReason || (allowDomFallback ? 'panel-unavailable' : 'dom-disabled')
                        });
                        throw fetchError;
                    }
                    return this._finalizeTranscriptResult({
                        status: 'unavailable',
                        videoId,
                        title: trackData.videoTitle || '',
                        segments: []
                    }, {
                        source: trackData.source || 'none',
                        language: selectedTrack.languageCode || '',
                        fetchedAt: nowFn(),
                        expiresAt,
                        staleReason,
                        fallbackReason: fallbackReason
                            || (refreshable ? 'refresh-empty' : 'empty-caption-track')
                    });
                }

                return this._finalizeTranscriptResult({
                    status: 'ready',
                    videoId,
                    title: trackData.videoTitle || videoId,
                    segments,
                    track: this._sanitizeTrackMetadata(selectedTrack)
                }, {
                    source: trackData.source || 'none',
                    language: selectedTrack.languageCode || '',
                    fetchedAt: nowFn(),
                    expiresAt,
                    staleReason,
                    fallbackReason
                });
            },

            // Multi-method caption track retrieval with automatic failover
            async _getCaptionTracks(videoId, options = {}) {
                const signal = options.signal;
                const allowOffPage = options.allowOffPage === true;
                const methods = [
                    ...(options.forceFresh === true || allowOffPage ? [] : [{
                        // i18n-static: diagnostic method identifier, not rendered copy.
                        name: 'ytInitialPlayerResponse',
                        source: 'player-global',
                        fn: () => this._method1_WindowVariable(videoId)
                    }]),
                    // i18n-static: diagnostic method identifier, not rendered copy.
                    { name: 'Innertube API', source: 'innertube-player', fn: () => this._method2_InnertubeAPI(videoId, { signal }) },
                    // i18n-static: diagnostic method identifier, not rendered copy.
                    { name: 'HTML Page Fetch', source: 'watch-page-player', fn: () => this._method3_HTMLPageFetch(videoId, { signal }) },
                    // i18n-static: diagnostic method identifier, not rendered copy.
                    { name: 'captionTracks Regex', source: 'watch-page-regex', fn: () => this._method4_CaptionTracksRegex(videoId, { signal }) },
                    ...(allowOffPage ? [] : [{
                        // i18n-static: diagnostic method identifier, not rendered copy.
                        name: 'DOM Panel Scrape', source: 'dom-panel-track', fn: () => this._method5_DOMPanelScrape(videoId, { signal })
                    }])
                ];

                let lastError = null;
                for (const method of methods) {
                    throwIfAborted(signal);
                    try {
                        this._log(`Trying method: ${method.name}`);
                        const result = await method.fn();
                        throwIfAborted(signal);
                        if (result?.captionless === true || result?.tracks?.length > 0) {
                            this._log(`Success with method: ${method.name}`, result.tracks?.length || 0, 'tracks found');
                            return { ...result, videoId, source: method.source };
                        }
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        lastError = error;
                        this._log(`Method ${method.name} failed:`, error.message);
                    }
                }

                const discoveryError = new Error('Transcript discovery failed for this video');
                if (lastError) discoveryError.cause = lastError;
                throw discoveryError;
            },

            _assertVideoCurrent(videoId, signal, allowOffPage = false) {
                throwIfAborted(signal);
                if (allowOffPage) return;
                const currentVideoId = getVideoId();
                if (hasVideoIdResolver && currentVideoId !== videoId) throw createAbortError();
            },

            _selectTrackForFetch(tracks, options = {}) {
                const preferred = options.trackPreference || options.selectedTrack;
                if (preferred) {
                    const match = this._findMatchingTrack(tracks, preferred, options.strictTrack === true);
                    return match || (options.strictTrack === true ? null : this._selectBestTrack(tracks));
                }
                return this._selectBestTrack(tracks);
            },

            _selectRefreshedTrack(tracks, previousTrack, options = {}) {
                const match = this._findMatchingTrack(
                    tracks,
                    options.trackPreference || options.selectedTrack || previousTrack,
                    options.strictTrack === true
                );
                return match || (options.strictTrack === true ? null : this._selectBestTrack(tracks));
            },

            _findMatchingTrack(tracks, target, strict = false) {
                if (!Array.isArray(tracks) || !target) return null;
                const vssId = String(target.vssId || '');
                const language = String(target.languageCode || '');
                const kind = String(target.kind || '');
                return tracks.find((track) => vssId && String(track?.vssId || '') === vssId)
                    || tracks.find((track) => String(track?.languageCode || '') === language
                        && String(track?.kind || '') === kind)
                    || (!strict || !kind
                        ? tracks.find((track) => String(track?.languageCode || '') === language)
                        : null)
                    || null;
            },

            _sanitizeTrackMetadata(track) {
                if (!track) return null;
                return {
                    languageCode: String(track.languageCode || '').slice(0, 40),
                    name: String(track.name?.simpleText || track.name?.runs?.[0]?.text || track.name || '').slice(0, 120),
                    kind: track.kind === 'asr' ? 'asr' : 'manual',
                    vssId: String(track.vssId || '').slice(0, 160)
                };
            },

            _scrapeRenderedTranscript(videoId, options = {}) {
                if (options.allowOffPage === true) return null;
                this._assertVideoCurrent(videoId, options.signal);
                if (typeof document === 'undefined') return null;
                const panel = getTranscriptPanelElement(document, {
                    videoId,
                    isForVideo: isDomTranscriptForVideo
                });
                if (!panel) return null;
                const segments = panel.querySelectorAll?.(
                    'ytd-transcript-segment-renderer .segment-text, ' +
                    'ytd-transcript-segment-renderer yt-formatted-string'
                );
                if (!segments?.length) return null;
                const cues = [];
                for (const segment of segments) {
                    this._assertVideoCurrent(videoId, options.signal);
                    const text = String(segment.textContent || '').replace(/\s+/g, ' ').trim();
                    if (!text) continue;
                    const row = segment.closest?.('ytd-transcript-segment-renderer');
                    const stamp = row?.querySelector?.('.segment-timestamp, .ytd-transcript-segment-renderer[class*="timestamp"]')
                        ?.textContent?.trim() || '';
                    // YouTube renders this timestamp with the viewer's own
                    // numerals, and `Number('٠:٠٧')` is NaN, so every cue in an
                    // ar/fa/hi/th session landed at 00:00. The same table
                    // core/text-metrics.js uses for view counts fixes it.
                    const normalizeDigits = globalThis.YTKitCore?.normalizeDigits;
                    const stampDigits = typeof normalizeDigits === 'function' ? normalizeDigits(stamp) : stamp;
                    const parts = stampDigits.split(':').map((part) => Number(part.trim()));
                    // `filter(Number.isFinite)` was worse than dropping the
                    // cue: it changed the array LENGTH, so a 3-part stamp with
                    // one unreadable component became a 2-part one and the
                    // hours field was read as minutes. Require every component.
                    let startSeconds = 0;
                    if (parts.every(Number.isFinite)) {
                        if (parts.length === 2) startSeconds = parts[0] * 60 + parts[1];
                        else if (parts.length === 3) startSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    }
                    cues.push({ startMs: startSeconds * 1000, endMs: startSeconds * 1000, text });
                }
                return cues.length ? cues : null;
            },

            _setTranscriptDiagnostic(videoId, status, provenance) {
                const detail = { videoId, status, provenance: sanitizeTranscriptProvenance(provenance) };
                this.lastResultMetadata = detail;
                try { recordDiagnostic(detail); } catch (_) {
                    // reason: diagnostics are best effort and must never fail transcript retrieval
                }
            },

            _finalizeTranscriptResult(result, provenance) {
                const clean = sanitizeTranscriptProvenance({ ...provenance, language: provenance.language || result.language });
                const next = { ...result, language: result.language || clean.language, provenance: clean };
                this._setTranscriptDiagnostic(result.videoId, result.status, clean);
                return next;
            },

            getDiagnostics() {
                const detail = this.lastResultMetadata;
                return detail ? {
                    videoId: String(detail.videoId || '').slice(0, 11),
                    status: detail.status === 'ready' || detail.status === 'captionless'
                        || detail.status === 'unavailable' || detail.status === 'error'
                        ? detail.status
                        : 'error',
                    provenance: sanitizeTranscriptProvenance(detail.provenance)
                } : null;
            },

            lastResultMetadata: null,

            // Method 1: window.ytInitialPlayerResponse (fastest for fresh page loads)
            _method1_WindowVariable(videoId) {
                const playerResponse = getPlayerResponseGlobal();

                if (!playerResponse?.videoDetails?.videoId) {
                    throw new Error('ytInitialPlayerResponse not available');
                }

                if (playerResponse.videoDetails.videoId !== videoId) {
                    throw new Error('ytInitialPlayerResponse is stale (different video)');
                }

                return this._extractFromPlayerResponse(playerResponse);
            },

            // Method 2: Innertube API (most reliable for SPA navigation)
            async _method2_InnertubeAPI(videoId, options = {}) {
                const apiKey = this._getInnertubeApiKey();
                if (!apiKey) {
                    throw new Error('Innertube API key unavailable');
                }
                // Fallback version is only used if script-tag parsing fails.
                // YouTube rotates client versions roughly weekly.
                const clientVersion = this._getClientVersion() || INNERTUBE_CLIENT_VERSION_FALLBACK;

                if (!/^[a-zA-Z0-9_-]{10,}$/.test(apiKey)) {
                    throw new Error('Innertube API key has unexpected format');
                }
                const { response, data } = await extensionFetchJson({
                    url: `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        context: {
                            client: {
                                clientName: 'WEB',
                                clientVersion: clientVersion
                            }
                        },
                        videoId: videoId
                    }),
                    signal: options.signal
                });
                throwIfAborted(options.signal);

                if (!response || response.status < 200 || response.status >= 300) {
                    throw new Error(`Innertube API returned ${response?.status}`);
                }
                if (data?.videoDetails?.videoId !== videoId) {
                    throw new Error('Innertube player response is for a different video');
                }
                return this._extractFromPlayerResponse(data);
            },

            // Method 3: Fetch HTML and extract ytInitialPlayerResponse
            async _method3_HTMLPageFetch(videoId, options = {}) {
                const { text: html } = await extensionFetchText({
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    signal: options.signal
                });
                throwIfAborted(options.signal);

                const patterns = [
                    /ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var\s|const\s|let\s|<\/script>)/s,
                    /ytInitialPlayerResponse\s*=\s*({.+?});/s,
                    /var\s+ytInitialPlayerResponse\s*=\s*({.+?});/s
                ];

                for (const pattern of patterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        try {
                            const playerResponse = JSON.parse(match[1]);
                            if (playerResponse?.videoDetails?.videoId !== videoId) {
                                throw new Error('Watch-page player response is for a different video');
                            }
                            return this._extractFromPlayerResponse(playerResponse);
                        } catch (parseError) {
                            this._log('JSON parse failed for pattern, trying next');
                        }
                    }
                }

                throw new Error('Could not extract ytInitialPlayerResponse from HTML');
            },

            // Method 4: Direct captionTracks regex extraction
            async _method4_CaptionTracksRegex(videoId, options = {}) {
                const { text: html } = await extensionFetchText({
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    signal: options.signal
                });
                throwIfAborted(options.signal);

                const keyIdx = html.indexOf('"captionTracks":');
                if (keyIdx === -1) throw new Error('captionTracks not found in page');
                const arrStart = html.indexOf('[', keyIdx);
                if (arrStart === -1) throw new Error('captionTracks not found in page');
                let depth = 0, inStr = false, esc = false, arrEnd = -1;
                for (let i = arrStart; i < html.length; i++) {
                    const c = html[i];
                    if (esc) { esc = false; continue; }
                    if (c === '\\') { esc = true; continue; }
                    if (c === '"') { inStr = !inStr; continue; }
                    if (inStr) continue;
                    if (c === '[') depth++;
                    else if (c === ']') { depth--; if (depth === 0) { arrEnd = i; break; } }
                }
                if (arrEnd === -1) throw new Error('captionTracks not found in page');
                const captionJson = html.slice(arrStart, arrEnd + 1).replace(/\\u0026/g, '&');
                const tracks = JSON.parse(captionJson);

                let videoTitle = videoId;
                // Anchor on videoDetails: the first "title" key in a watch
                // page is usually an unrelated config or accessibility field,
                // so the bare match named the download after the wrong string.
                const detailsAt = html.indexOf('"videoDetails"');
                const detailsText = detailsAt === -1 ? html : html.slice(detailsAt);
                const pageVideoId = detailsText.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1] || '';
                if (pageVideoId && pageVideoId !== videoId) {
                    throw new Error('Watch-page caption data is for a different video');
                }
                const titleMatch = detailsText.match(/"title":"([^"]+)"/);
                if (titleMatch && titleMatch[1]) {
                    videoTitle = titleMatch[1]
                        .replace(/\\u0026/g, '&')
                        .replace(/\\"/g, '"')
                        .replace(/\\\//g, '/');
                }

                const matchingTracks = tracks.filter((track) => {
                    const trackVideoId = getCaptionTrackVideoId(track?.baseUrl || '');
                    return !trackVideoId || trackVideoId === videoId;
                });
                if (tracks.length > 0 && matchingTracks.length === 0) {
                    throw new Error('Watch-page caption tracks are for a different video');
                }

                return {
                    tracks: matchingTracks.map(t => ({
                        baseUrl: t.baseUrl?.replace(/\\u0026/g, '&'),
                        languageCode: t.languageCode,
                        name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
                        kind: t.kind || (t.vssId?.startsWith('a.') ? 'asr' : 'manual'),
                        vssId: t.vssId
                    })),
                    videoTitle: videoTitle
                };
            },

            // Method 5: DOM panel scraping (final fallback)
            async _method5_DOMPanelScrape(videoId, options = {}) {
                throwIfAborted(options.signal);
                if (typeof document === 'undefined') {
                    throw new Error('document not available');
                }
                const panel = getTranscriptPanelElement(document, {
                    videoId,
                    isForVideo: isDomTranscriptForVideo
                });
                if (!panel) {
                    throw new Error('Transcript panel is stale (different video)');
                }
                const nestedRenderer = panel?.querySelector?.('ytd-transcript-renderer');
                const transcriptRenderer = nestedRenderer || (
                    panel?.data?.content?.transcriptSearchPanelRenderer ||
                    panel?.__data?.data?.content?.transcriptSearchPanelRenderer
                        ? panel
                        : null
                );
                if (!transcriptRenderer) throw new Error('Transcript panel not found in DOM');

                const data = transcriptRenderer.__data?.data || transcriptRenderer.data;
                if (!data) throw new Error('No data in transcript renderer');

                const footer = data.content?.transcriptSearchPanelRenderer?.footer?.transcriptFooterRenderer;
                const languageMenu = footer?.languageMenu?.sortFilterSubMenuRenderer?.subMenuItems;

                if (!languageMenu || languageMenu.length === 0) {
                    throw new Error('No language menu found in panel data');
                }

                // The language menu carries Innertube continuation TOKENS, not
                // timedtext URLs — a token can never be fetched as a transcript
                // (token + '&fmt=json3' always fails), which used to convert
                // "no transcript" into a misleading network error. Only surface
                // a track when the scraped item genuinely holds a fetchable
                // timedtext URL; otherwise report no tracks so _getCaptionTracks
                // falls through honestly. The panel is also never validated
                // against the current video id, so a stale SPA panel must not
                // fabricate tracks for the wrong video.
                const tracks = languageMenu
                    .filter(item => typeof item.baseUrl === 'string' && item.baseUrl.includes('/api/timedtext'))
                    .filter(item => {
                        const trackVideoId = getCaptionTrackVideoId(item.baseUrl);
                        return !trackVideoId || trackVideoId === videoId;
                    })
                    .map(item => ({
                        baseUrl: item.baseUrl,
                        languageCode: item.languageCode || 'unknown',
                        name: item.title || 'Unknown',
                        kind: item.title?.toLowerCase().includes('auto') ? 'asr' : 'manual'
                    }));

                if (tracks.length === 0) {
                    throw new Error('Transcript panel has no fetchable caption URLs (continuation tokens only)');
                }

                const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || videoId;

                return { tracks, videoTitle };
            },

            _extractFromPlayerResponse(playerResponse) {
                if (!playerResponse || typeof playerResponse !== 'object') {
                    throw new Error('Invalid player response');
                }
                const rawTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                const captionTracks = Array.isArray(rawTracks) ? rawTracks : [];
                const videoTitle = playerResponse.videoDetails?.title || '';

                return {
                    tracks: captionTracks.map(t => ({
                        baseUrl: t.baseUrl,
                        languageCode: t.languageCode,
                        name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
                        kind: t.kind || (t.vssId?.startsWith('a.') ? 'asr' : 'manual'),
                        vssId: t.vssId
                    })),
                    videoTitle: videoTitle,
                    captionless: captionTracks.length === 0
                };
            },

            _selectBestTrack(tracks) {
                if (tracks.length === 1) return tracks[0];

                const { preferredLanguages, preferManualCaptions } = this.config;

                const scored = tracks.map(track => {
                    let score = 0;

                    const langIndex = preferredLanguages.findIndex(lang =>
                        track.languageCode?.toLowerCase().startsWith(lang.toLowerCase())
                    );
                    if (langIndex !== -1) {
                        score += (preferredLanguages.length - langIndex) * 10;
                    }

                    if (preferManualCaptions && track.kind !== 'asr') {
                        score += 5;
                    } else if (!preferManualCaptions && track.kind === 'asr') {
                        score += 5;
                    }

                    return { track, score };
                });

                scored.sort((a, b) => b.score - a.score);
                return scored.length > 0 ? scored[0].track : tracks[0];
            },

            async _fetchTranscriptContent(baseUrl, options = {}) {
                if (!baseUrl) throw new Error('No baseUrl provided for transcript');

                const formats = ['json3', 'xml'];

                // A format can parse successfully yet yield zero segments
                // (e.g. a valid-but-empty json3 body). Only short-circuit on a
                // non-empty result; otherwise keep trying the remaining
                // formats and only hand back the empty parse after every
                // format has had its chance.
                let emptyResult = null;
                let terminalHttpError = null;
                for (const fmt of formats) {
                    throwIfAborted(options.signal);
                    try {
                        const url = fmt === 'xml'
                            ? baseUrl
                            : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}fmt=${fmt}`;
                        const { text: content } = await extensionFetchText({ url, signal: options.signal });
                        throwIfAborted(options.signal);

                        const segments = fmt === 'json3'
                            ? this._parseJSON3(content)
                            : this._parseXML(content);
                        if (segments && segments.length > 0) {
                            return segments;
                        }
                        emptyResult = segments || [];
                        this._log(`Format ${fmt} parsed but produced no segments, trying next format`);
                    } catch (e) {
                        if (e?.name === 'AbortError') throw e;
                        const status = getTranscriptHttpStatus(e);
                        if (status === 403 || status === 404) {
                            terminalHttpError = e;
                            // Every format hits the same base URL with a
                            // different fmt param, so a 403/404 is the URL
                            // being revoked rather than the format being
                            // unsupported. Trying the next one is a second
                            // wasted round trip before the same throw.
                            this._log(`Format ${fmt} rejected with ${status}; track URL is dead, skipping remaining formats`);
                            break;
                        }
                        this._log(`Format ${fmt} failed:`, e.message);
                    }
                }

                if (terminalHttpError) throw terminalHttpError;
                if (emptyResult) return emptyResult;
                throw new Error('Failed to fetch transcript in any format');
            },

            _parseJSON3(content) {
                const data = JSON.parse(content);
                const segments = [];

                if (!data.events) throw new Error('No events in JSON3 response');

                for (const event of data.events) {
                    if (!event.segs) continue;

                    const text = event.segs
                        .map(seg => seg.utf8 || '')
                        .join('')
                        .replace(/\n/g, ' ')
                        .trim();

                    if (text) {
                        const seg = {
                            startMs: event.tStartMs || 0,
                            endMs: (event.tStartMs || 0) + (event.dDurationMs || 0),
                            text: text
                        };
                        // Preserve word-level timing from tOffsetMs
                        if (event.segs.length > 1 && event.segs.some(s => s.tOffsetMs !== undefined)) {
                            const evtStart = (event.tStartMs || 0) / 1000;
                            const evtEnd = ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000;
                            seg.words = [];
                            for (let i = 0; i < event.segs.length; i++) {
                                const w = (event.segs[i].utf8 || '').replace(/\n/g, ' ').trim();
                                if (!w) continue;
                                const wStart = evtStart + (event.segs[i].tOffsetMs || 0) / 1000;
                                const nextOffset = (i < event.segs.length - 1 && event.segs[i+1].tOffsetMs !== undefined)
                                    ? evtStart + event.segs[i+1].tOffsetMs / 1000 : evtEnd;
                                seg.words.push({ text: w, start: wStart, end: nextOffset });
                            }
                        }
                        segments.push(seg);
                    }
                }

                return segments;
            },

            _parseXML(content) {
                const segments = [];
                const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;

                let match;
                while ((match = textRegex.exec(content)) !== null) {
                    const attrs = match[1];
                    const startSeconds = parseFloat((attrs.match(/\bstart="([^"]*)"/) || [])[1]) || 0;
                    const duration = parseFloat((attrs.match(/\bdur="([^"]*)"/) || [])[1]) || 0;
                    const text = this._decodeHTMLEntities(this._stripXmlTags(match[2]))
                        .trim();

                    if (text) {
                        segments.push({
                            startMs: Math.round(startSeconds * 1000),
                            endMs: Math.round((startSeconds + duration) * 1000),
                            text: text
                        });
                    }
                }

                return segments;
            },

            _stripXmlTags(value) {
                let out = '';
                let inTag = false;
                for (const ch of String(value || '')) {
                    if (ch === '<') {
                        inTag = true;
                        continue;
                    }
                    if (inTag) {
                        if (ch === '>') inTag = false;
                        continue;
                    }
                    out += ch;
                }
                return out;
            },

            _formatTranscript(segments) {
                return segments.map(s => {
                    if (this.config.includeTimestamps) {
                        const timestamp = this._formatTimestamp(s.startMs);
                        return `[${timestamp}] ${s.text}`;
                    }
                    return s.text;
                }).join('\n');
            },

            formatTranscript(segments) {
                return this._formatTranscript(Array.isArray(segments) ? segments : []);
            },

            _formatTimestamp(ms) {
                const totalSeconds = Math.floor(ms / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;

                if (hours > 0) {
                    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            },

            normalizeSegments(segments, options = {}) {
                return normalizeTranscriptSegments(segments, options);
            },

            _cachedApiKey: null,
            _cachedApiKeyAt: 0,
            _CACHE_TTL_MS: 10 * 60 * 1000,
            _getInnertubeApiKey() {
                const now = Date.now();
                if (this._cachedApiKey && (now - this._cachedApiKeyAt) < this._CACHE_TTL_MS) return this._cachedApiKey;
                if (typeof document === 'undefined') return this._cachedApiKey || null;
                const scripts = document.querySelectorAll('script');
                for (const s of scripts) {
                    const m = s.textContent.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
                    if (m) { this._cachedApiKey = m[1]; this._cachedApiKeyAt = now; return m[1]; }
                }
                return this._cachedApiKey || null;
            },

            _cachedClientVersion: null,
            _cachedClientVersionAt: 0,
            _getClientVersion() {
                const now = Date.now();
                if (this._cachedClientVersion && (now - this._cachedClientVersionAt) < this._CACHE_TTL_MS) return this._cachedClientVersion;
                if (typeof document === 'undefined') return this._cachedClientVersion || null;
                try {
                    const scripts = document.querySelectorAll('script');
                    for (const s of scripts) {
                        const text = s.textContent;
                        if (!text || !text.includes('INNERTUBE_CLIENT_VERSION')) continue;
                        const m = text.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"(\d{1,2}\.\d{6,10}\.\d{1,2}\.\d{1,2})"/);
                        if (m) { this._cachedClientVersion = m[1]; this._cachedClientVersionAt = now; return m[1]; }
                    }
                } catch (_) {
                    // reason: script may be CSP-protected or not yet loaded; caller falls back to default
                }
                return this._cachedClientVersion || null;
            },

            _decodeHTMLEntities(text) {
                return text
                    .replace(/&#x([a-fA-F0-9]+);/g, (m, hex) => {
                        const cp = parseInt(hex, 16);
                        return Number.isInteger(cp) && cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : m;
                    })
                    .replace(/&#(\d+);/g, (m, num) => {
                        const cp = Number(num);
                        return Number.isInteger(cp) && cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : m;
                    })
                    .replace(/&#39;/g, "'")
                    .replace(/&apos;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&');
            },

            _sanitizeFilename(name) {
                return name
                    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
                    .replace(/\s+/g, '_')
                    .replace(/^\.+/, '')
                    .substring(0, 120)
                    || 'untitled';
            },

            _downloadFile(content, filename) {
                if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof document === 'undefined') {
                    return; // unit-test context — caller handles
                }
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.style.display = 'none';
                (document.body || document.documentElement).appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            },

            _log(...args) {
                if (this.config.debug && typeof console !== 'undefined') {
                    console.log('[YTKit TranscriptService]', ...args);
                }
            }
        };

        return service;
    }

    Object.assign(core, {
        CAPTION_TRACK_EXPIRY_SKEW_MS,
        createTranscriptService,
        getTranscriptPanelElement,
        normalizeTranscriptSegments,
        parseCaptionTrackExpiresAt,
        sanitizeTranscriptProvenance,
        TRANSCRIPT_PANEL_SELECTORS
    });
})();
