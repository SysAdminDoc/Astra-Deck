(() => {
    'use strict';

    // Chat replay is rendered in a live-chat iframe on the watch page. The
    // iframe is same-origin in the normal YouTube surface, but its DOM is
    // virtualized and can be replaced during SPA navigation. Keep all work
    // route-scoped and process messages in small timer-backed batches.
    const MESSAGE_SELECTOR = [
        'yt-live-chat-text-message-renderer',
        'yt-live-chat-paid-message-renderer',
        'yt-live-chat-paid-sticker-renderer',
        'yt-live-chat-membership-item-renderer'
    ].join(',');
    const CHAT_FRAME_SELECTOR = [
        'ytd-live-chat-frame iframe',
        'iframe[src*="live_chat_replay"]',
        'iframe[src*="/live_chat"]'
    ].join(',');
    const DISCOVERY_SELECTOR = [
        CHAT_FRAME_SELECTOR,
        '.ytp-progress-bar',
        '.ytp-progress-bar-container',
        'video.html5-main-video'
    ].join(',');
    const TIMESTAMP_ATTRIBUTES = Object.freeze([
        'timestamp-usec',
        'data-timestamp-usec',
        'timestamp',
        'data-timestamp',
        'timestamp-ms',
        'data-timestamp-ms',
        'data-time'
    ]);
    const MAX_BINS = 180;
    const MAX_MESSAGES_PER_PASS = 160;
    const MAX_SAMPLES = 12000;
    const MAX_PENDING_MESSAGES = 4000;
    const DISCOVERY_DELAYS = Object.freeze([0, 250, 750, 1500, 3000]);

    function cleanText(value, maxLength = 120) {
        return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function parseClock(value) {
        const match = String(value ?? '').match(/(?:^|[^\d])(\d{1,3}(?::\d{2}){1,2})(?:$|[^\d])/);
        if (!match) return null;
        const parts = match[1].split(':').map(Number);
        if (parts.some((part) => !Number.isFinite(part)) || parts.at(-1) >= 60) return null;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3 && parts[1] < 60) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return null;
    }

    function parseTimestampValue(value, attribute = '') {
        const raw = cleanText(value, 80);
        if (!raw) return null;
        const clock = parseClock(raw);
        if (clock !== null) return clock;
        if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
        const number = Number(raw);
        if (!Number.isFinite(number) || number < 0) return null;
        const key = String(attribute).toLowerCase();
        if (key.includes('usec') || key.includes('micro')) return number / 1000000;
        if (key.includes('millisecond') || key.endsWith('-ms')) return number / 1000;
        // YouTube has used both relative seconds and millisecond/microsecond
        // attributes across chat renderer generations. Epoch-like values are
        // harmless here: addDensitySample rejects values outside the video.
        if (number > 1000000000000) return number / 1000000;
        if (number > 1000000000) return number / 1000;
        return number;
    }

    function readAttribute(node, attribute) {
        try {
            return node?.getAttribute?.(attribute);
        } catch (_) {
            return null;
        }
    }

    function parseChatTimestamp(node) {
        if (!node) return null;
        const candidates = [node];
        try {
            const timestamp = node.querySelector?.('#timestamp, [id="timestamp"], [data-timestamp], [timestamp-usec]');
            if (timestamp && timestamp !== node) candidates.push(timestamp);
        } catch (_) {
            // reason: a detached custom renderer can reject a selector query
        }
        for (const candidate of candidates) {
            for (const attribute of TIMESTAMP_ATTRIBUTES) {
                const parsed = parseTimestampValue(readAttribute(candidate, attribute), attribute);
                if (parsed !== null) return parsed;
            }
            const propertyCandidates = [
                ['timestampUsec', candidate?.timestampUsec],
                ['timestamp', candidate?.timestamp],
                ['timestampMs', candidate?.timestampMs]
            ];
            for (const [attribute, value] of propertyCandidates) {
                const parsed = parseTimestampValue(value, attribute);
                if (parsed !== null) return parsed;
            }
        }
        try {
            const timestamp = node.querySelector?.('#timestamp, [id="timestamp"]');
            const text = timestamp?.textContent || timestamp?.getAttribute?.('aria-label');
            const parsed = parseClock(text);
            if (parsed !== null) return parsed;
        } catch (_) {
            // reason: chat renderer may be torn down while its timestamp is read
        }
        return parseClock(node.getAttribute?.('aria-label') || node.textContent || '');
    }

    function createDensityBins(binCount = MAX_BINS) {
        const count = Number.isFinite(Number(binCount)) ? Math.max(1, Math.floor(Number(binCount))) : MAX_BINS;
        return Array.from({ length: count }, () => 0);
    }

    function addDensitySample(bins, timestamp, duration) {
        if (!Array.isArray(bins) || !bins.length) return false;
        const time = Number(timestamp);
        const length = Number(duration);
        if (!Number.isFinite(time) || !Number.isFinite(length) || length <= 0 || time < 0 || time > length + 1) {
            return false;
        }
        const ratio = Math.min(1, Math.max(0, time / length));
        const index = Math.min(bins.length - 1, Math.floor(ratio * bins.length));
        bins[index] += 1;
        return true;
    }

    function messageText(node, selector, fallback = '') {
        try {
            return cleanText(node?.querySelector?.(selector)?.textContent || fallback, 160);
        } catch (_) {
            return cleanText(fallback, 160);
        }
    }

    function messageSample(node, duration) {
        const timestamp = parseChatTimestamp(node);
        if (timestamp === null || !Number.isFinite(Number(duration))) return null;
        const author = messageText(node, '#author-name, #author-text, yt-live-chat-author-chip', '');
        const text = messageText(node, '#message, #content, yt-formatted-string', node?.textContent || '');
        return {
            timestamp,
            key: `${Math.round(timestamp * 1000)}|${author}|${text.slice(0, 120)}`
        };
    }

    function drawDensityChart(canvas, bins, windowRef = globalThis) {
        if (!canvas || !Array.isArray(bins) || !bins.length) return false;
        let context;
        try { context = canvas.getContext?.('2d'); } catch (_) { return false; }
        if (!context) return false;
        const rect = canvas.getBoundingClientRect?.() || {};
        const width = Math.max(1, Number(canvas.clientWidth) || Number(rect.width) || 240);
        const height = Math.max(1, Number(canvas.clientHeight) || Number(rect.height) || 24);
        const dpr = Math.max(1, Math.min(3, Number(windowRef?.devicePixelRatio) || 1));
        const pixelWidth = Math.max(1, Math.round(width * dpr));
        const pixelHeight = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        context.setTransform?.(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        const peak = Math.max(...bins);
        if (!peak) return true;
        const accent = windowRef?.getComputedStyle?.(canvas)?.getPropertyValue?.('--yt-spec-call-to-action')?.trim()
            || '#ff4e45';
        const binWidth = width / bins.length;
        context.fillStyle = accent;
        bins.forEach((value, index) => {
            if (!value) return;
            // Square-root scaling preserves quiet activity while making actual
            // spikes visually obvious without letting one burst flatten the rest.
            const barHeight = Math.max(1, Math.sqrt(value / peak) * (height - 2));
            context.globalAlpha = 0.25 + 0.7 * Math.min(1, value / peak);
            context.fillRect(index * binWidth, height - barHeight, Math.max(1, binWidth - 0.5), barHeight);
        });
        context.globalAlpha = 1;
        return true;
    }

    function createReplayChatDensityFeature(deps = {}) {
        const documentRef = deps.documentRef
            || (typeof document !== 'undefined' ? document : null);
        const windowRef = deps.windowRef
            || (typeof window !== 'undefined' ? window : globalThis);
        const appState = deps.appState || { settings: {} };
        const PageTypes = deps.PageTypes || { WATCH: 'watch' };
        const addNavigateRule = typeof deps.addNavigateRule === 'function' ? deps.addNavigateRule : () => {};
        const removeNavigateRule = typeof deps.removeNavigateRule === 'function' ? deps.removeNavigateRule : () => {};
        const addMutationRule = typeof deps.addMutationRule === 'function' ? deps.addMutationRule : null;
        const removeMutationRule = typeof deps.removeMutationRule === 'function' ? deps.removeMutationRule : null;
        const addScopedMutationRule = typeof deps.addScopedMutationRule === 'function' ? deps.addScopedMutationRule : null;
        const removeScopedMutationRule = typeof deps.removeScopedMutationRule === 'function' ? deps.removeScopedMutationRule : null;
        const getMainVideoElement = typeof deps.getMainVideoElement === 'function'
            ? deps.getMainVideoElement
            : () => documentRef?.querySelector?.('video.html5-main-video, #movie_player video') || null;
        const getPlayerProgressBar = typeof deps.getPlayerProgressBar === 'function'
            ? deps.getPlayerProgressBar
            : () => documentRef?.querySelector?.('.ytp-progress-bar-padding .ytp-progress-bar, .ytp-progress-bar') || null;
        const getPlayerResponse = typeof deps.getPlayerResponse === 'function' ? deps.getPlayerResponse : () => null;
        const getVideoId = typeof deps.getVideoId === 'function' ? deps.getVideoId : () => '';
        const isWatchPagePath = typeof deps.isWatchPagePath === 'function'
            ? deps.isWatchPagePath
            : () => /^\/(?:watch|shorts|live|embed)(?:\/|$)/.test(String(windowRef?.location?.pathname || ''));
        const injectStyle = typeof deps.injectStyle === 'function' ? deps.injectStyle : () => null;
        const t = typeof deps.t === 'function' ? deps.t : (_key, fallback) => fallback;

        let destroyed = false;
        let generation = 0;
        let video = null;
        let videoListeners = [];
        let chatFrame = null;
        let chatDocument = null;
        let chatRoot = null;
        let chatObserver = null;
        let chatFrameLoadListener = null;
        let discoveryTimer = null;
        let discoveryAttempts = 0;
        let scanTimer = null;
        let renderTimer = null;
        let renderFrame = null;
        let styleElement = null;
        let chartHost = null;
        let chartAnchor = null;
        let chartCanvas = null;
        let densityDuration = 0;
        let densityBins = createDensityBins();
        let sampleCount = 0;
        let pendingNodes = [];
        let pendingSet = new Set();
        let sampleKeys = new Set();
        let scopedRuleActive = false;
        let broadRuleActive = false;
        let navigationRule = null;

        function clearTimer(timer) {
            if (timer === null || timer === undefined) return;
            try { windowRef?.clearTimeout?.(timer); } catch (_) { /* reason: navigation can tear down the window */ }
        }

        function clearRenderSchedule() {
            clearTimer(renderTimer);
            renderTimer = null;
            if (renderFrame !== null && renderFrame !== undefined) {
                try { windowRef?.cancelAnimationFrame?.(renderFrame); } catch (_) { /* reason: stale player chrome may own the frame */ }
            }
            renderFrame = null;
        }

        function clearDiscoverySchedule() {
            clearTimer(discoveryTimer);
            discoveryTimer = null;
        }

        function clearScanSchedule() {
            clearTimer(scanTimer);
            scanTimer = null;
        }

        function resetDensity() {
            densityDuration = 0;
            densityBins = createDensityBins();
            sampleCount = 0;
            pendingNodes = [];
            pendingSet = new Set();
            sampleKeys = new Set();
        }

        function removeChart() {
            chartAnchor?.remove?.();
            chartAnchor = null;
            chartCanvas = null;
            chartHost?.classList?.remove?.('ytkit-chat-density-host');
            chartHost = null;
        }

        function detachVideo() {
            for (const [event, listener] of videoListeners) {
                try { video?.removeEventListener?.(event, listener); } catch (_) { /* reason: replaced video may already be detached */ }
            }
            videoListeners = [];
            video = null;
        }

        function detachChatSurface() {
            chatObserver?.disconnect?.();
            chatObserver = null;
            if (chatFrame && chatFrameLoadListener) {
                try { chatFrame.removeEventListener?.('load', chatFrameLoadListener); }
                catch (_) { /* reason: the iframe may have been removed during SPA teardown */ }
            }
            chatFrame = null;
            chatFrameLoadListener = null;
            chatDocument = null;
            chatRoot = null;
            pendingNodes = [];
            pendingSet = new Set();
            clearScanSchedule();
        }

        function resetForNavigation() {
            generation += 1;
            clearDiscoverySchedule();
            clearScanSchedule();
            clearRenderSchedule();
            detachVideo();
            detachChatSurface();
            removeChart();
            resetDensity();
            discoveryAttempts = 0;
            if (!destroyed) scheduleDiscovery(0);
        }

        function currentDuration() {
            const mediaDuration = Number(video?.duration);
            if (Number.isFinite(mediaDuration) && mediaDuration > 0) return mediaDuration;
            const responseDuration = Number(getPlayerResponse?.()?.videoDetails?.lengthSeconds);
            return Number.isFinite(responseDuration) && responseDuration > 0 ? responseDuration : 0;
        }

        function isTruthyFlag(value) {
            return value === true || value === 'true' || value === 1 || value === '1';
        }

        function isReplayVideo(duration) {
            if (!Number.isFinite(Number(duration)) || Number(duration) <= 0) return false;
            if (documentRef?.querySelector?.('#movie_player.ytp-live')) return false;
            const response = getPlayerResponse?.();
            const details = response?.videoDetails;
            const currentId = cleanText(getVideoId?.(), 24);
            if (details?.videoId && currentId && details.videoId !== currentId) return true;
            if (isTruthyFlag(details?.isLive) || isTruthyFlag(details?.isLivePlayback) || isTruthyFlag(details?.isUpcoming)) {
                return false;
            }
            return true;
        }

        function queueNode(node) {
            if (!node || pendingSet.has(node) || pendingNodes.length >= MAX_PENDING_MESSAGES) return;
            pendingSet.add(node);
            pendingNodes.push(node);
        }

        function queueMessageNodes(node) {
            const element = node?.nodeType === 1 ? node : node?.parentElement;
            if (!element) return;
            try {
                if (element.matches?.(MESSAGE_SELECTOR)) queueNode(element);
                element.querySelectorAll?.(MESSAGE_SELECTOR).forEach(queueNode);
                element.closest?.(MESSAGE_SELECTOR) && queueNode(element.closest(MESSAGE_SELECTOR));
            } catch (_) {
                // reason: a custom chat renderer can be disconnected mid-batch
            }
        }

        function queueInitialMessages() {
            try {
                chatRoot?.querySelectorAll?.(MESSAGE_SELECTOR).forEach(queueNode);
            } catch (_) {
                // reason: the iframe can navigate while its document is scanned
            }
        }

        function scheduleScan(delay = 0) {
            if (destroyed || scanTimer !== null || !chatRoot) return;
            const timer = windowRef?.setTimeout || globalThis.setTimeout;
            if (typeof timer !== 'function') return;
            scanTimer = timer(() => {
                scanTimer = null;
                scanMessages();
            }, Math.max(0, Number(delay) || 0));
        }

        function scheduleRender() {
            if (destroyed || renderTimer !== null || renderFrame !== null) return;
            const raf = windowRef?.requestAnimationFrame;
            if (typeof raf === 'function') {
                renderFrame = raf(() => {
                    renderFrame = null;
                    renderChart();
                });
                return;
            }
            const timer = windowRef?.setTimeout || globalThis.setTimeout;
            if (typeof timer !== 'function') return;
            renderTimer = timer(() => {
                renderTimer = null;
                renderChart();
            }, 0);
        }

        function scanMessages() {
            if (destroyed || !chatRoot || !isReplayVideo(currentDuration())) return;
            const duration = currentDuration();
            if (!densityDuration || Math.abs(densityDuration - duration) > 1) {
                densityDuration = duration;
                densityBins = createDensityBins();
                sampleCount = 0;
                sampleKeys = new Set();
            }
            let processed = 0;
            let added = false;
            while (pendingNodes.length && processed < MAX_MESSAGES_PER_PASS) {
                const node = pendingNodes.shift();
                pendingSet.delete(node);
                processed += 1;
                if (sampleCount >= MAX_SAMPLES) continue;
                const sample = messageSample(node, densityDuration);
                if (!sample || sampleKeys.has(sample.key)) continue;
                if (!addDensitySample(densityBins, sample.timestamp, densityDuration)) continue;
                sampleKeys.add(sample.key);
                sampleCount += 1;
                added = true;
            }
            if (pendingNodes.length) scheduleScan(25);
            if (added) scheduleRender();
        }

        function resolveChatSurface() {
            if (!documentRef?.querySelector) return null;
            try {
                const directMessages = documentRef.querySelectorAll?.(MESSAGE_SELECTOR);
                if (directMessages?.length) {
                    return { frame: null, document: documentRef, root: documentRef.body || documentRef.documentElement };
                }
            } catch (_) {
                // reason: page custom elements can throw during early hydration
            }
            let frames = [];
            try { frames = Array.from(documentRef.querySelectorAll(CHAT_FRAME_SELECTOR)); }
            catch (_) { return null; }
            for (const frame of frames) {
                try {
                    const childDocument = frame.contentDocument || frame.contentWindow?.document;
                    const root = childDocument?.body || childDocument?.documentElement;
                    if (childDocument?.querySelector && root) return { frame, document: childDocument, root };
                } catch (_) {
                    // reason: an unavailable iframe document is retried after load
                }
            }
            return null;
        }

        function attachChatSurface(surface) {
            if (!surface?.document || !surface.root) return false;
            if (surface.document === chatDocument && surface.root === chatRoot) {
                queueInitialMessages();
                scheduleScan();
                return true;
            }
            detachChatSurface();
            chatFrame = surface.frame || null;
            chatDocument = surface.document;
            chatRoot = surface.root;
            queueInitialMessages();
            const Observer = chatDocument.defaultView?.MutationObserver
                || windowRef?.MutationObserver
                || globalThis.MutationObserver;
            if (typeof Observer === 'function') {
                try {
                    chatObserver = new Observer((records) => {
                        for (const record of records || []) {
                            if (record.type === 'attributes') queueMessageNodes(record.target);
                            for (const node of record.addedNodes || []) queueMessageNodes(node);
                        }
                        scheduleScan();
                    });
                    chatObserver.observe(chatRoot, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: TIMESTAMP_ATTRIBUTES
                    });
                } catch (_) {
                    chatObserver = null;
                }
            }
            if (chatFrame?.addEventListener) {
                chatFrameLoadListener = () => {
                    if (!destroyed) scheduleDiscovery(0);
                };
                chatFrame.addEventListener('load', chatFrameLoadListener);
            }
            scheduleScan();
            return true;
        }

        function attachVideo(nextVideo) {
            if (nextVideo === video) return;
            detachVideo();
            video = nextVideo || null;
            if (!video?.addEventListener) return;
            const refresh = () => {
                if (!destroyed) {
                    if (video?.duration === 0 || !isReplayVideo(currentDuration())) {
                        removeChart();
                        resetDensity();
                    }
                    scheduleDiscovery(0);
                }
            };
            for (const event of ['loadedmetadata', 'durationchange', 'loadeddata', 'emptied']) {
                video.addEventListener(event, refresh);
                videoListeners.push([event, refresh]);
            }
        }

        function scheduleDiscovery(delay = 0) {
            if (destroyed || discoveryTimer !== null) return;
            const timer = windowRef?.setTimeout || globalThis.setTimeout;
            if (typeof timer !== 'function') return;
            const token = generation;
            discoveryTimer = timer(() => {
                discoveryTimer = null;
                if (destroyed || token !== generation) return;
                const ready = discover();
                if (!ready && discoveryAttempts < DISCOVERY_DELAYS.length) {
                    const retryDelay = DISCOVERY_DELAYS[discoveryAttempts] ?? 3000;
                    discoveryAttempts += 1;
                    scheduleDiscovery(retryDelay);
                }
            }, Math.max(0, Number(delay) || 0));
        }

        function discover() {
            if (!isWatchPagePath()) {
                removeChart();
                return false;
            }
            attachVideo(getMainVideoElement());
            const duration = currentDuration();
            if (!isReplayVideo(duration)) {
                removeChart();
                return false;
            }
            const attached = attachChatSurface(resolveChatSurface());
            if (attached) {
                if (pendingNodes.length) scheduleScan();
                if (sampleCount) scheduleRender();
            }
            return attached;
        }

        function seekFromEvent(event) {
            if (!chartCanvas || !densityDuration) return;
            const rect = chartCanvas.getBoundingClientRect?.() || {};
            const width = Number(rect.width) || Number(chartCanvas.clientWidth) || 1;
            const left = Number(rect.left) || 0;
            const clientX = Number(event?.clientX);
            const offset = Number.isFinite(clientX) ? clientX - left : Number(event?.offsetX) || 0;
            const ratio = Math.min(1, Math.max(0, offset / width));
            const seconds = ratio * densityDuration;
            const player = documentRef?.querySelector?.('#movie_player');
            try {
                if (typeof player?.seekTo === 'function') player.seekTo(seconds, true);
                else if (video) video.currentTime = seconds;
            } catch (_) {
                // reason: YouTube can reject a seek while changing videos
            }
            event?.preventDefault?.();
            event?.stopPropagation?.();
        }

        function renderChart() {
            if (destroyed || !sampleCount || !isReplayVideo(currentDuration())) {
                removeChart();
                return;
            }
            const progressBar = getPlayerProgressBar();
            const host = progressBar?.closest?.('.ytp-progress-bar-container') || progressBar?.parentElement;
            if (!host || !documentRef?.createElement) {
                scheduleDiscovery(500);
                return;
            }
            if (host !== chartHost) {
                removeChart();
                chartHost = host;
                chartHost.classList?.add?.('ytkit-chat-density-host');
                chartAnchor = documentRef.createElement('div');
                chartAnchor.className = 'ytkit-chat-density-anchor';
                chartCanvas = documentRef.createElement('canvas');
                chartCanvas.className = 'ytkit-chat-density-canvas';
                chartCanvas.setAttribute('data-ytkit-chat-density', '1');
                chartCanvas.setAttribute('role', 'img');
                chartCanvas.setAttribute('aria-label', t(
                    'replayChatDensityAria',
                    'Chat activity across this video. Click the chart to seek.'
                ));
                chartCanvas.title = t('replayChatDensityTitle', 'Chat activity. Click to seek.');
                chartCanvas.addEventListener?.('click', seekFromEvent);
                chartAnchor.appendChild(chartCanvas);
                chartHost.appendChild(chartAnchor);
            }
            drawDensityChart(chartCanvas, densityBins, windowRef);
        }

        function ensureStyles() {
            if (styleElement) return;
            styleElement = injectStyle(`
                .ytkit-chat-density-host{position:relative !important;overflow:visible !important;}
                .ytkit-chat-density-anchor{position:absolute;inset-inline:0;bottom:100%;height:24px;pointer-events:none;z-index:4;}
                .ytkit-chat-density-canvas{display:block;width:100%;height:24px;pointer-events:auto;cursor:pointer;opacity:.92;}
                @media (prefers-reduced-motion:reduce){.ytkit-chat-density-canvas{transition:none !important;}}
                @media (forced-colors:active){.ytkit-chat-density-canvas{forced-color-adjust:auto;}}
            `, 'replay-chat-density', true);
        }

        const feature = {
            id: 'replayChatDensity',
            name: t('feature_replayChatDensity_name', 'Replay Chat Density'),
            description: t(
                'feature_replayChatDensity_desc',
                'Show an optional activity sparkline above the progress bar for videos with replay chat, with click-to-seek highlights.'
            ),
            group: 'Video Player',
            icon: 'activity',
            pages: [PageTypes.WATCH],

            _scanMessages: scanMessages,
            _recordMessage(node, duration = currentDuration()) {
                if (!node || !isReplayVideo(duration)) return false;
                if (!densityDuration || Math.abs(densityDuration - duration) > 1) {
                    densityDuration = duration;
                    densityBins = createDensityBins();
                    sampleCount = 0;
                    sampleKeys = new Set();
                }
                const sample = messageSample(node, densityDuration);
                if (!sample || sampleKeys.has(sample.key) || sampleCount >= MAX_SAMPLES) return false;
                if (!addDensitySample(densityBins, sample.timestamp, densityDuration)) return false;
                sampleKeys.add(sample.key);
                sampleCount += 1;
                scheduleRender();
                return true;
            },
            _getSnapshot() {
                return {
                    duration: densityDuration,
                    sampleCount,
                    bins: densityBins.slice(),
                    pending: pendingNodes.length,
                    chatAttached: !!chatRoot,
                    chartVisible: !!chartCanvas
                };
            },
            get _chartCanvas() {
                return chartCanvas;
            },

            init() {
                destroyed = false;
                ensureStyles();
                navigationRule = () => resetForNavigation();
                addNavigateRule(this.id, navigationRule);
                if (addScopedMutationRule && removeScopedMutationRule) {
                    addScopedMutationRule(this.id, DISCOVERY_SELECTOR, () => scheduleDiscovery(0));
                    scopedRuleActive = true;
                } else if (addMutationRule && removeMutationRule) {
                    addMutationRule(this.id, () => scheduleDiscovery(0));
                    broadRuleActive = true;
                }
                resetForNavigation();
            },

            destroy() {
                destroyed = true;
                generation += 1;
                clearDiscoverySchedule();
                clearScanSchedule();
                clearRenderSchedule();
                if (scopedRuleActive) removeScopedMutationRule?.(this.id);
                if (broadRuleActive) removeMutationRule?.(this.id);
                scopedRuleActive = false;
                broadRuleActive = false;
                removeNavigateRule(this.id);
                navigationRule = null;
                detachVideo();
                detachChatSurface();
                removeChart();
                resetDensity();
                styleElement?.remove?.();
                styleElement = null;
            }
        };
        return feature;
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.replayChatDensity = Object.freeze({
        createReplayChatDensityFeature
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            addDensitySample,
            createDensityBins,
            createReplayChatDensityFeature,
            drawDensityChart,
            messageSample,
            parseChatTimestamp,
            parseTimestampValue
        };
    }
})();
