(() => {
    'use strict';

    // iter-7 N11 (M-phase extraction #3): VideoTypeDetector moved out
    // of the ytkit.js monolith into a focused core module.
    //
    // Classifies the current page as standard / live / vod / premiere
    // using two signals:
    //   - ytInitialPlayerResponse.videoDetails (most reliable)
    //   - DOM cues (live badge, chat frame, ytd-watch-flexy attrs)
    //
    // The detector is per-video-cached; it refreshes when getVideoId()
    // changes. The factory takes four accessor callbacks so the module
    // stays free of any monolith coupling and tests can use plain stubs:
    //
    //   getPlayerResponse() → object | null
    //     Returns the parsed ytInitialPlayerResponse for the page.
    //   getVideoId() → string | null
    //   getMainVideoElement() → HTMLVideoElement | null
    //   debugLog(category, message) → void (optional)
    //
    // For DOM signal detection the factory uses the global `document`
    // and `window` directly; that matches the original inline impl and
    // keeps test contexts minimal (only need to stub document.querySelector).

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createVideoTypeDetector) return;

    function createVideoTypeDetector(options = {}) {
        const getPlayerResponse = typeof options.getPlayerResponse === 'function'
            ? options.getPlayerResponse
            : () => null;
        const getVideoId = typeof options.getVideoId === 'function'
            ? options.getVideoId
            : () => null;
        const getMainVideoElement = typeof options.getMainVideoElement === 'function'
            ? options.getMainVideoElement
            : () => null;
        const debugLog = typeof options.debugLog === 'function'
            ? options.debugLog
            : () => {};

        const detector = {
            _cache: { videoId: null, type: 'standard' },

            // Primary detection via ytInitialPlayerResponse (most reliable)
            _fromPlayerResponse() {
                try {
                    const pr = getPlayerResponse();
                    if (!pr?.videoDetails) return null;
                    const d = pr.videoDetails;
                    const vid = getVideoId();
                    if (d.videoId && d.videoId !== vid) return null; // stale response
                    if (d.isUpcoming) return 'premiere';
                    if (d.isLive) return 'live';
                    if (d.isLiveContent || d.isPostLiveDvr) return 'vod';
                    return 'standard';
                } catch (e) { return null; }
            },

            // Fallback: DOM signals
            _fromDOM() {
                if (typeof document === 'undefined') return 'standard';
                const video = getMainVideoElement();
                const liveBadge = document.querySelector('.ytp-live-badge');
                const liveBadgeActive = liveBadge && !liveBadge.classList.contains('ytp-live-badge-disabled')
                    && (typeof window !== 'undefined' ? window.getComputedStyle(liveBadge).display : 'block') !== 'none';
                const chatFrame = document.querySelector('ytd-live-chat-frame#chat, ytd-live-chat-frame, #chat');
                const hasChatFrame = chatFrame && !chatFrame.hasAttribute('hidden');

                // Check ytd-watch-flexy for live attribute (YouTube sets this on live pages)
                const watchFlexy = document.querySelector('ytd-watch-flexy');
                const flexyIsLive = watchFlexy?.hasAttribute('is-live');

                // Currently live: badge active OR flexy attribute
                if (liveBadgeActive || flexyIsLive) return 'live';
                if (video && !isFinite(video.duration) && hasChatFrame) return 'live';

                // VOD: has chat frame (replay) but not currently live
                if (hasChatFrame && video && isFinite(video.duration)) return 'vod';

                // Chat frame present but no video yet — likely live or VOD
                if (hasChatFrame) return 'vod';

                return 'standard';
            },

            // Get cached type for current video, refreshing if video changed
            getType() {
                const vid = getVideoId();
                if (vid && vid === this._cache.videoId) return this._cache.type;
                this.refresh();
                return this._cache.type;
            },

            // Force refresh detection
            refresh() {
                const vid = getVideoId();
                const responseType = this._fromPlayerResponse();
                const domType = this._fromDOM();
                const type = domType === 'live' ? 'live' : (responseType || domType || 'standard');
                this._cache = { videoId: vid, type };
                debugLog('VideoType', `Detected: ${type} for ${vid}`);
                return type;
            },

            // Convenience checks
            isLive()      { return this.getType() === 'live'; },
            isVOD()       { return this.getType() === 'vod'; },
            isStandard()  { return this.getType() === 'standard'; },
            isPremiere()  { return this.getType() === 'premiere'; },
            hasChat()     { return this.isLive() || this.isVOD(); },
            hasComments() { return this.isStandard() || this.isVOD(); },

            // Get the chat element (ytd-live-chat-frame or #chat container)
            getChatEl() {
                if (typeof document === 'undefined') return null;
                return document.querySelector('ytd-live-chat-frame#chat, ytd-live-chat-frame, #chat');
            }
        };

        return detector;
    }

    Object.assign(core, {
        createVideoTypeDetector
    });
})();
