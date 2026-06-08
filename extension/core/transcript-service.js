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

    function createTranscriptService(options = {}) {
        const getVideoId = typeof options.getVideoId === 'function'
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

        const service = {
            config: { ...DEFAULT_CONFIG, ...(options.config || {}) },

            // Main entry point — downloads transcript with automatic failover
            async downloadTranscript() {
                const videoId = getVideoId();
                if (!videoId) {
                    showToast('No video ID found', '#ef4444');
                    return { success: false, error: 'No video ID' };
                }

                showToast('Fetching transcript…', '#3b82f6');
                this._log('Starting transcript fetch for:', videoId);

                try {
                    const trackData = await this._getCaptionTracks(videoId);

                    if (!trackData || !trackData.tracks || trackData.tracks.length === 0) {
                        showToast('No transcript available for this video', '#ef4444');
                        return { success: false, error: 'No captions available' };
                    }

                    const selectedTrack = this._selectBestTrack(trackData.tracks);
                    this._log('Selected track:', selectedTrack.languageCode, selectedTrack.kind);

                    const segments = await this._fetchTranscriptContent(selectedTrack.baseUrl);

                    if (!segments || segments.length === 0) {
                        showToast('Failed to parse transcript content', '#ef4444');
                        return { success: false, error: 'Parse failed' };
                    }

                    const videoTitle = this._sanitizeFilename(trackData.videoTitle || videoId);
                    const content = this._formatTranscript(segments);

                    this._downloadFile(content, `${videoTitle}_transcript.txt`);

                    showToast(`Transcript downloaded! (${segments.length} segments)`, '#22c55e');
                    return { success: true, segments: segments.length, language: selectedTrack.languageCode };

                } catch (error) {
                    if (typeof console !== 'undefined') {
                        console.error('[YTKit TranscriptService] Error:', error);
                    }
                    showToast('Failed to download transcript', '#ef4444');
                    return { success: false, error: error.message };
                }
            },

            // Multi-method caption track retrieval with automatic failover
            async _getCaptionTracks(videoId) {
                const methods = [
                    { name: 'ytInitialPlayerResponse', fn: () => this._method1_WindowVariable(videoId) },
                    { name: 'Innertube API', fn: () => this._method2_InnertubeAPI(videoId) },
                    { name: 'HTML Page Fetch', fn: () => this._method3_HTMLPageFetch(videoId) },
                    { name: 'captionTracks Regex', fn: () => this._method4_CaptionTracksRegex(videoId) },
                    { name: 'DOM Panel Scrape', fn: () => this._method5_DOMPanelScrape(videoId) }
                ];

                for (const method of methods) {
                    try {
                        this._log(`Trying method: ${method.name}`);
                        const result = await method.fn();
                        if (result && result.tracks && result.tracks.length > 0) {
                            this._log(`Success with method: ${method.name}`, result.tracks.length, 'tracks found');
                            return result;
                        }
                    } catch (error) {
                        this._log(`Method ${method.name} failed:`, error.message);
                    }
                }

                return null;
            },

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
            async _method2_InnertubeAPI(videoId) {
                const apiKey = this._getInnertubeApiKey();
                if (!apiKey) {
                    throw new Error('Innertube API key unavailable');
                }
                // Fallback version is only used if script-tag parsing fails.
                // YouTube rotates client versions roughly weekly.
                const clientVersion = this._getClientVersion() || INNERTUBE_CLIENT_VERSION_FALLBACK;

                const { response, data } = await extensionFetchJson({
                    url: `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
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
                    })
                });

                if (!response || response.status < 200 || response.status >= 300) {
                    throw new Error(`Innertube API returned ${response?.status}`);
                }
                return this._extractFromPlayerResponse(data);
            },

            // Method 3: Fetch HTML and extract ytInitialPlayerResponse
            async _method3_HTMLPageFetch(videoId) {
                const { text: html } = await extensionFetchText({
                    url: `https://www.youtube.com/watch?v=${videoId}`
                });

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
                            return this._extractFromPlayerResponse(playerResponse);
                        } catch (parseError) {
                            this._log('JSON parse failed for pattern, trying next');
                        }
                    }
                }

                throw new Error('Could not extract ytInitialPlayerResponse from HTML');
            },

            // Method 4: Direct captionTracks regex extraction
            async _method4_CaptionTracksRegex(videoId) {
                const { text: html } = await extensionFetchText({
                    url: `https://www.youtube.com/watch?v=${videoId}`
                });

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
                const titleMatch = html.match(/"title":"([^"]+)"/);
                if (titleMatch && titleMatch[1]) {
                    videoTitle = titleMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
                }

                return {
                    tracks: tracks.map(t => ({
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
            async _method5_DOMPanelScrape(videoId) {
                if (typeof document === 'undefined') {
                    throw new Error('document not available');
                }
                const transcriptRenderer = document.querySelector('ytd-transcript-renderer');
                if (!transcriptRenderer) throw new Error('Transcript panel not found in DOM');

                const data = transcriptRenderer.__data?.data || transcriptRenderer.data;
                if (!data) throw new Error('No data in transcript renderer');

                const footer = data.content?.transcriptSearchPanelRenderer?.footer?.transcriptFooterRenderer;
                const languageMenu = footer?.languageMenu?.sortFilterSubMenuRenderer?.subMenuItems;

                if (!languageMenu || languageMenu.length === 0) {
                    throw new Error('No language menu found in panel data');
                }

                const tracks = languageMenu.map(item => ({
                    baseUrl: item.continuation?.reloadContinuationData?.continuation,
                    languageCode: item.languageCode || 'unknown',
                    name: item.title || 'Unknown',
                    kind: item.title?.toLowerCase().includes('auto') ? 'asr' : 'manual'
                }));

                const videoTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || videoId;

                return { tracks, videoTitle };
            },

            _extractFromPlayerResponse(playerResponse) {
                if (!playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                    throw new Error('No caption tracks in player response');
                }

                const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
                const videoTitle = playerResponse.videoDetails?.title || '';

                return {
                    tracks: captionTracks.map(t => ({
                        baseUrl: t.baseUrl,
                        languageCode: t.languageCode,
                        name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
                        kind: t.kind || (t.vssId?.startsWith('a.') ? 'asr' : 'manual'),
                        vssId: t.vssId
                    })),
                    videoTitle: videoTitle
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

            async _fetchTranscriptContent(baseUrl) {
                if (!baseUrl) throw new Error('No baseUrl provided for transcript');

                const formats = ['json3', 'xml'];

                for (const fmt of formats) {
                    try {
                        const url = fmt === 'xml' ? baseUrl : `${baseUrl}&fmt=${fmt}`;
                        const { text: content } = await extensionFetchText({ url });

                        if (fmt === 'json3') {
                            return this._parseJSON3(content);
                        } else {
                            return this._parseXML(content);
                        }
                    } catch (e) {
                        this._log(`Format ${fmt} failed:`, e.message);
                    }
                }

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
        createTranscriptService
    });
})();
