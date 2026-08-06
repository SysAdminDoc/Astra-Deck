// Astra Deck - MAIN World Bridge
// Handles canPlayType + MediaSource.isTypeSupported patching for codec filtering
// Runs in world: "MAIN" at document_start
// Communicates with ISOLATED world via data attributes on <html>

// shared <html> attribute observer.
// Previously three separate MutationObservers all watched
// `document.documentElement` for `data-ytkit-codec`,
// `data-ytkit-quality`, and `data-ytkit-quality-target` /
// `data-ytkit-quality-context`. Every documentElement attribute mutation
// fired three observers' engine paths in parallel. Consolidated into one
// observer with a combined attributeFilter; handlers self-read the
// attribute they care about (matches the original semantics where each
// handler ignored the records parameter and re-read the attribute
// directly via getAttribute).
//
// Wrap the entire MAIN-world bridge in an outer IIFE so the registry
// closure stays private to this file — does NOT pollute window.
(function() {
    'use strict';

    var _ObsHandlers = [];
    var _ObsAttrs = new Set();
    var _ObsInstance = null;
    function _reobserve() {
        if (!document || !document.documentElement) return;
        if (_ObsInstance) _ObsInstance.disconnect();
        _ObsInstance = new MutationObserver(function(records) {
            // Dedup attribute hits across the batch so each handler fires
            // at most once per tick (matches the prior per-observer
            // single-fire semantics — each old observer's callback was
            // invoked once per batch regardless of record count).
            var touched = null;
            for (var i = 0; i < records.length; i++) {
                var rec = records[i];
                if (rec.type !== 'attributes' || !rec.attributeName) continue;
                if (touched === null) touched = new Set();
                touched.add(rec.attributeName);
            }
            if (!touched) return;
            for (var j = 0; j < _ObsHandlers.length; j++) {
                var h = _ObsHandlers[j];
                for (var k = 0; k < h.attrs.length; k++) {
                    if (touched.has(h.attrs[k])) {
                        try { h.fn(); } catch (e) {
                            // reason: never let one feature's handler poison another
                        }
                        break;
                    }
                }
            }
        });
        _ObsInstance.observe(document.documentElement, {
            attributes: true,
            attributeFilter: Array.from(_ObsAttrs)
        });
    }
    function _obsRegister(attrs, fn) {
        if (!attrs || !attrs.length || typeof fn !== 'function') return;
        for (var i = 0; i < attrs.length; i++) _ObsAttrs.add(attrs[i]);
        _ObsHandlers.push({ attrs: attrs.slice(), fn: fn });
        _reobserve();
    }

    // ──────────────────────────────────────────────────────────────────
    // Background resource release (data-ytkit-resource-unlock)
    // ──────────────────────────────────────────────────────────────────
    // Install from document_start so YouTube cannot cache the native methods
    // first. The ISOLATED-world CPU Tamer controls the opt-in through an html
    // attribute; no extension APIs or settings cross into MAIN world.
    var _resourceUnlock = null;
    var _createResourceUnlockBridge = globalThis.YTKitCore &&
        globalThis.YTKitCore.createResourceUnlockBridge;
    if (typeof _createResourceUnlockBridge === 'function') {
        _resourceUnlock = _createResourceUnlockBridge({
            root: window,
            document: document,
            onStatus: function(stats) {
                try {
                    document.documentElement.setAttribute(
                        'data-ytkit-resource-lock-stats',
                        JSON.stringify(stats)
                    );
                } catch (e) {
                    // reason: diagnostics must not affect page resource handling
                }
            }
        });
        _resourceUnlock.install();
    }

    function _syncResourceUnlock() {
        if (!_resourceUnlock) return;
        var enabled = document.documentElement.getAttribute('data-ytkit-resource-unlock') === 'on';
        _resourceUnlock.setEnabled(enabled);
    }
    _obsRegister(['data-ytkit-resource-unlock'], _syncResourceUnlock);
    _syncResourceUnlock();

    // ──────────────────────────────────────────────────────────────────
    // Feature 1: codec blocker (data-ytkit-codec)
    // ──────────────────────────────────────────────────────────────────
(function() {
    'use strict';

    if (typeof HTMLVideoElement === 'undefined') return;

    var _origCanPlay = HTMLVideoElement.prototype.canPlayType;
    var _origIsTypeSupported = typeof MediaSource !== 'undefined' && MediaSource && MediaSource.isTypeSupported
        ? MediaSource.isTypeSupported.bind(MediaSource) : null;
    var _origDecodingInfo = (typeof MediaCapabilities !== 'undefined' && MediaCapabilities.prototype.decodingInfo)
        ? MediaCapabilities.prototype.decodingInfo : null;
    var _codec = 'auto';
    // The codec family actually enforced. With the 'efficient' mode this is
    // resolved asynchronously from MediaCapabilities and can stay 'auto'.
    var _effective = 'auto';
    var _patched = false;
    var _efficientProbe = null;

    // Ordered cheapest-decode first: when several candidates come back equally
    // smooth and power efficient the first one wins.
    var EFFICIENT_CANDIDATES = [
        { family: 'h264', contentType: 'video/mp4; codecs="avc1.640028"' },
        { family: 'vp9', contentType: 'video/webm; codecs="vp09.00.10.08"' },
        { family: 'av1', contentType: 'video/mp4; codecs="av01.0.08M.08"' }
    ];

    function probeEfficientCodec() {
        if (_efficientProbe) return _efficientProbe;
        var capabilities = (typeof navigator !== 'undefined') ? navigator.mediaCapabilities : null;
        if (!capabilities || !_origDecodingInfo) {
            // No API to ask — behave exactly like 'auto'.
            _efficientProbe = Promise.resolve(null);
            return _efficientProbe;
        }
        _efficientProbe = Promise.all(EFFICIENT_CANDIDATES.map(function(candidate) {
            var query = {
                type: 'media-source',
                video: {
                    contentType: candidate.contentType,
                    width: 1920,
                    height: 1080,
                    bitrate: 4000000,
                    framerate: 30
                }
            };
            try {
                return _origDecodingInfo.call(capabilities, query).then(function(info) {
                    return {
                        family: candidate.family,
                        supported: !!(info && info.supported),
                        efficient: !!(info && info.supported && info.smooth && info.powerEfficient)
                    };
                }, function() {
                    return { family: candidate.family, supported: false, efficient: false };
                });
            } catch (e) {
                return Promise.resolve({ family: candidate.family, supported: false, efficient: false });
            }
        })).then(function(results) {
            var efficient = results.filter(function(r) { return r.efficient; });
            var supported = results.filter(function(r) { return r.supported; });
            // Nothing to choose from, or the device reports every supported
            // candidate as equally efficient: the answer carries no signal, so
            // leave YouTube's own selection alone.
            if (!efficient.length || efficient.length === supported.length) return null;
            return efficient[0].family;
        }, function() {
            return null;
        });
        return _efficientProbe;
    }

    function shouldBlock(type) {
        if (_effective === 'h264' && /vp0?9|av01/i.test(type)) return true;
        if (_effective === 'vp9') {
            if (/av01/i.test(type)) return true;
            if (/avc1/i.test(type) && !/vp0?9/i.test(type)) return true;
        }
        if (_effective === 'av1') {
            if ((/vp0?9|avc1/i.test(type)) && !/av01/i.test(type)) return true;
        }
        return false;
    }

    function sync() {
        if (_codec === 'efficient') {
            // Stay unpatched until the device answers; a rejected or absent
            // API resolves to null and keeps current behavior.
            probeEfficientCodec().then(function(family) {
                if (_codec !== 'efficient') return;
                _effective = family || 'auto';
                applyPatch();
            });
            return;
        }
        _effective = _codec;
        applyPatch();
    }

    function applyPatch() {
        if (_effective === 'auto') {
            if (_patched) {
                HTMLVideoElement.prototype.canPlayType = _origCanPlay;
                if (_origIsTypeSupported) MediaSource.isTypeSupported = _origIsTypeSupported;
                if (_origDecodingInfo) MediaCapabilities.prototype.decodingInfo = _origDecodingInfo;
                _patched = false;
            }
            return;
        }
        HTMLVideoElement.prototype.canPlayType = function(type) {
            if (shouldBlock(type)) return '';
            return _origCanPlay.call(this, type);
        };
        if (_origIsTypeSupported) {
            MediaSource.isTypeSupported = function(type) {
                if (shouldBlock(type)) return false;
                return _origIsTypeSupported(type);
            };
        }
        // YouTube also queries MediaCapabilities.decodingInfo to select codecs.
        // Without this override, YouTube can bypass canPlayType/isTypeSupported.
        if (_origDecodingInfo) {
            MediaCapabilities.prototype.decodingInfo = function(config) {
                var contentType = config && config.video && config.video.contentType;
                if (contentType && shouldBlock(contentType)) {
                    return Promise.resolve({ supported: false, smooth: false, powerEfficient: false });
                }
                return _origDecodingInfo.call(this, config);
            };
        }
        _patched = true;
    }

    _obsRegister(['data-ytkit-codec'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-codec');
        if (val !== null && val !== _codec) {
            _codec = val || 'auto';
            sync();
        }
    });

    // Exposed for the codec-bridge tests; the page never calls these.
    // MAIN-world scripts share the PAGE's global scope. `typeof module`
    // is only a Node/CommonJS signal here; a page that defined its own
    // CommonJS shim would have had it overwritten with bridge internals.
    // Gate on the Node runtime itself, which a page can never fake.
    const inNodeTests = typeof process !== 'undefined'
        && !!process.versions
        && typeof process.versions.node === 'string';
    if (inNodeTests && typeof module !== 'undefined' && module.exports) {
        module.exports = { probeEfficientCodec: probeEfficientCodec, EFFICIENT_CANDIDATES: EFFICIENT_CANDIDATES };
    }

    var initial = document.documentElement.getAttribute('data-ytkit-codec');
    if (initial) { _codec = initial; sync(); }
})();

    // ──────────────────────────────────────────────────────────────────
    // Feature 2: Quality forcer
    // ──────────────────────────────────────────────────────────────────
    // Premium-aware, no-UI. Calls movie_player.setPlaybackQualityRange
    // directly (the same API used by Auto-HD-FPS, Iridium, Enhancer for
    // YouTube, and the popular YouTube HD Premium userscript). Never
    // opens the gear menu. ISOLATED world toggles this by setting
    // <html data-ytkit-quality="on">.
(function() {
    'use strict';
    if (typeof document === 'undefined') return;

    var ON = false;
    var lastApplied = '';     // `${videoId}:${quality}` to avoid re-applying needlessly
    var pendingTimer = null;
    var pendingContextTimer = null;
    var DEBUG = false;
    var PlayerTaskManager = globalThis.YTKitCore && globalThis.YTKitCore.playerTaskManager;
    var TASK_EVENTS = ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'player-state', 'navigate', 'page-data'];
    var RETRY_DELAYS = [0, 150, 400, 1000, 1800, 3000];

    function log() {
        if (!DEBUG) return;
        try { console.log.apply(console, ['[Astra Deck quality]'].concat([].slice.call(arguments))); } catch (e) { /* reason: debug logging is best-effort */ }
    }

    function getPlayer() {
        // Prefer the watch-page player; fall back to any html5 player
        return document.getElementById('movie_player') ||
               document.querySelector('.html5-video-player');
    }

    function getVideoId() {
        try {
            var u = new URL(location.href);
            return u.searchParams.get('v') ||
                   (u.pathname.indexOf('/shorts/') === 0 ? u.pathname.split('/')[2] : '') ||
                   '';
        } catch (e) { return ''; }
    }

    // Premium-aware best pick. data is highest-first per YouTube convention.
    function pickBest(data) {
        if (!data || !data.length) return null;
        var real = [];
        for (var i = 0; i < data.length; i++) {
            if (data[i] && data[i].quality && data[i].quality !== 'auto') real.push(data[i]);
        }
        if (!real.length) return null;
        var topQ = real[0].quality;
        var topTier = [];
        for (var j = 0; j < real.length; j++) {
            if (real[j].quality === topQ) topTier.push(real[j]);
        }
        // Premium label patterns: "1080p Premium", "1080p60 Premium", etc.
        for (var k = 0; k < topTier.length; k++) {
            var label = topTier[k].qualityLabel || '';
            if (/premium/i.test(label)) return topTier[k];
        }
        return topTier[0];
    }

    function apply(ctx) {
        if (!ON) return;
        if (ctx && (ctx.reason === 'loadstart' || ctx.reason === 'navigate' || ctx.reason === 'page-data')) {
            lastApplied = '';
        }
        var p = getPlayer();
        if (!p || typeof p.setPlaybackQualityRange !== 'function') return false;

        var data = (typeof p.getAvailableQualityData === 'function')
            ? p.getAvailableQualityData() : null;

        var target = null;
        if (data && data.length) {
            target = pickBest(data);
        } else if (typeof p.getAvailableQualityLevels === 'function') {
            // Legacy fallback — no Premium awareness possible without labels
            var levels = p.getAvailableQualityLevels();
            if (levels && levels.length) {
                for (var i = 0; i < levels.length; i++) {
                    if (levels[i] && levels[i] !== 'auto') { target = { quality: levels[i] }; break; }
                }
            }
        }

        if (!target) return false;
        var key = getVideoId() + ':' + target.quality + ':' + (target.qualityLabel || '');
        if (key === lastApplied) return true;

        try {
            p.setPlaybackQualityRange(target.quality, target.quality);
            if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(target.quality);
            lastApplied = key;
            log('applied', target.quality, target.qualityLabel || '');
            return true;
        } catch (e) { log('apply failed', e && e.message); return false; }
    }

    function cancelTask(id, timerName) {
        if (PlayerTaskManager && typeof PlayerTaskManager.cancel === 'function') PlayerTaskManager.cancel(id);
        if (timerName === 'quality' && pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
        if (timerName === 'context' && pendingContextTimer) { clearTimeout(pendingContextTimer); pendingContextTimer = null; }
    }

    function schedule(delay, reason) {
        if (PlayerTaskManager && typeof PlayerTaskManager.schedule === 'function') {
            PlayerTaskManager.schedule('ytkit-main:autoMaxResolution', apply, {
                owner: 'ytkit-main',
                reason: reason || 'manual',
                delay: delay || 0,
                needsVideo: true,
                needsPlayer: true,
                maxAttempts: RETRY_DELAYS.length,
                retryDelays: RETRY_DELAYS,
                events: TASK_EVENTS
            });
            return;
        }
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function() { pendingTimer = null; apply(); }, delay || 0);
    }

    function reset(reason) { lastApplied = ''; schedule(0, reason || 'reset'); }

    // Trigger sources — the player rebuilds quality data shortly after each of these.
    if (!PlayerTaskManager) {
        document.addEventListener('loadstart', function(e) {
            if (!ON) return;
            if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) reset('loadstart');
        }, true);
        document.addEventListener('loadedmetadata', function(e) {
            if (!ON) return;
            if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) schedule(150, 'loadedmetadata');
        }, true);
        document.addEventListener('canplay', function(e) {
            if (!ON) return;
            if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) schedule(0, 'canplay');
        }, true);
        // YouTube SPA navigation
        window.addEventListener('yt-navigate-finish', function() { if (ON) reset('navigate'); });
        window.addEventListener('yt-page-data-updated', function() { if (ON) schedule(200, 'page-data'); });
    }

    function syncFromAttr() {
        var v = document.documentElement.getAttribute('data-ytkit-quality');
        var next = (v === 'on');
        if (next === ON) return;
        ON = next;
        if (ON) reset('attribute');
        else { lastApplied = ''; cancelTask('ytkit-main:autoMaxResolution', 'quality'); }
    }

    _obsRegister(['data-ytkit-quality'], syncFromAttr);

    // Initial state — read what ISOLATED may have already set before document_idle.
    syncFromAttr();

    // ── v4.1.0: per-context quality target ──
    // data-ytkit-quality-target carries an explicit quality string written by
    // qualityProfileMatrix (ISOLATED world). When present, it overrides the
    // best-quality picker above; when removed, the picker resumes.
    var _ctxLastApplied = '';
    function applyContextQuality(ctx) {
        if (ctx && (ctx.reason === 'loadedmetadata' || ctx.reason === 'navigate' || ctx.reason === 'page-data' || ctx.reason === 'player-state')) {
            _ctxLastApplied = '';
        }
        var target = document.documentElement.getAttribute('data-ytkit-quality-target');
        if (!target) { _ctxLastApplied = ''; return true; }
        var p = getPlayer();
        if (!p || typeof p.setPlaybackQualityRange !== 'function') return false;
        var vid = getVideoId();
        var key = vid + ':ctx:' + target;
        if (key === _ctxLastApplied) return true;
        try {
            p.setPlaybackQualityRange(target, target);
            if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(target);
            _ctxLastApplied = key;
            log('per-context quality applied', target);
            return true;
        } catch (e) { log('per-context apply failed', e && e.message); return false; }
    }
    function scheduleContextQuality(reason, delay) {
        if (PlayerTaskManager && typeof PlayerTaskManager.schedule === 'function') {
            PlayerTaskManager.schedule('ytkit-main:contextQuality', applyContextQuality, {
                owner: 'ytkit-main',
                reason: reason || 'manual',
                delay: delay || 0,
                needsVideo: true,
                needsPlayer: true,
                maxAttempts: RETRY_DELAYS.length,
                retryDelays: RETRY_DELAYS,
                events: ['loadedmetadata', 'canplay', 'playing', 'player-state', 'navigate', 'page-data']
            });
            return;
        }
        if (pendingContextTimer) clearTimeout(pendingContextTimer);
        pendingContextTimer = setTimeout(function() {
            pendingContextTimer = null;
            applyContextQuality();
        }, delay || 0);
    }
    _obsRegister(['data-ytkit-quality-target', 'data-ytkit-quality-context'], function() {
        _ctxLastApplied = '';
        scheduleContextQuality('attribute', 0);
    });
    if (!PlayerTaskManager) {
        document.addEventListener('loadedmetadata', function(e) {
            if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
                _ctxLastApplied = '';
                scheduleContextQuality('loadedmetadata', 0);
            }
        }, true);
        window.addEventListener('yt-navigate-finish', function() {
            _ctxLastApplied = '';
            scheduleContextQuality('navigate', 0);
        });
    }
    scheduleContextQuality('init', 0);
})();

    // ──────────────────────────────────────────────────────────────────
    // Feature 3: Audio-track preference bridge
    // ──────────────────────────────────────────────────────────────────
    // Audio-track APIs are page-owned and are not reliably visible from an
    // MV3 content script's ISOLATED world. The content runtime writes only
    // reviewed, bounded attributes; this MAIN-world bridge performs the
    // player call through the same route-aware retry manager as quality.
(function() {
    'use strict';
    var selection = globalThis.YTKitCore && globalThis.YTKitCore.audioTrackSelection;
    if (!selection || typeof selection.createAudioTrackBridge !== 'function') return;

    var bridge = selection.createAudioTrackBridge({
        document: document,
        taskManager: globalThis.YTKitCore && globalThis.YTKitCore.playerTaskManager
    });
    var attrs = selection.ATTRS;
    _obsRegister([attrs.language, attrs.descriptive, attrs.original], function() {
        bridge.sync('attribute');
    });
    bridge.sync('init');
})();

    // ──────────────────────────────────────────────────────────────────
    // Feature 3.5: Bounded VOD buffer target
    // ──────────────────────────────────────────────────────────────────
    // The buffer target is deliberately capability-gated. YouTube's
    // page-owned movie_player has exposed setBufferingGoal() in some player
    // builds, but it is not part of the public IFrame API. Never emulate it
    // by pausing, seeking, or changing media element behaviour: when the
    // method is absent, publish a degradation reason and leave playback alone.
(function() {
    'use strict';
    if (typeof document === 'undefined' || !document.documentElement) return;

    var ENABLE_ATTR = 'data-ytkit-buffer-preload';
    var SECONDS_ATTR = 'data-ytkit-buffer-seconds';
    var STATUS_ATTR = 'data-ytkit-buffer-status';
    var REASON_ATTR = 'data-ytkit-buffer-reason';
    var DEFAULT_TARGET_SECONDS = 20;
    // Ceiling, not a suggestion. ImprovedTube #581 asks to buffer the whole
    // video, but the same thread records browsers failing on the largest ones:
    // a media element handed an unbounded goal allocates until it is evicted or
    // wedged. Ten minutes of VOD is past any realistic tunnel or uplink gap
    // while staying inside what the buffer can actually hold.
    var MAX_TARGET_SECONDS = 600;
    var MIN_TARGET_SECONDS = 5;
    var targetSeconds = DEFAULT_TARGET_SECONDS;
    var ON = false;
    var lastAppliedVideo = null;
    var defaultBufferingGoal = null;
    var pendingTimer = null;
    var PlayerTaskManager = globalThis.YTKitCore && globalThis.YTKitCore.playerTaskManager;
    var TASK_ID = 'ytkit-main:bufferPreload';
    var TASK_EVENTS = ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'player-state', 'navigate', 'page-data'];
    var RETRY_DELAYS = [0, 150, 400, 1000, 1800, 3000];

    function writeStatus(status, reason) {
        var nextStatus = String(status || 'off');
        var nextReason = reason ? String(reason).slice(0, 240) : '';
        if (document.documentElement.getAttribute(STATUS_ATTR) !== nextStatus) {
            document.documentElement.setAttribute(STATUS_ATTR, nextStatus);
        }
        if (nextReason) {
            if (document.documentElement.getAttribute(REASON_ATTR) !== nextReason) {
                document.documentElement.setAttribute(REASON_ATTR, nextReason);
            }
        } else {
            document.documentElement.removeAttribute(REASON_ATTR);
        }
    }

    function getPlayer(ctx) {
        return (ctx && ctx.player) ||
            document.getElementById('movie_player') ||
            document.querySelector('.html5-video-player');
    }

    function getVideo(ctx) {
        return (ctx && ctx.video) || document.querySelector('.html5-main-video');
    }

    function isTruthyFlag(value) {
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function isLiveVideo(video, player) {
        try {
            if (player && typeof player.getVideoData === 'function') {
                var data = player.getVideoData();
                if (data && (isTruthyFlag(data.isLive) || isTruthyFlag(data.isLivePlayback))) return true;
            }
        } catch (_) {
            // reason: player metadata is optional and may be unavailable during route changes
        }
        try {
            var response = globalThis.ytInitialPlayerResponse;
            var details = response && response.videoDetails;
            if (details && (isTruthyFlag(details.isLive) || isTruthyFlag(details.isLiveContent))) return true;
        } catch (_) {
            // reason: page response globals are not stable across SPA routes
        }
        if (video && video.duration === Infinity) return true;
        try {
            return !!document.querySelector('ytd-watch-flexy[is-live], .ytp-live-badge');
        } catch (_) {
            return false;
        }
    }

    function apply(ctx) {
        if (!ON) {
            restoreDefaultGoal();
            return true;
        }
        if (ctx && (ctx.reason === 'loadstart' || ctx.reason === 'navigate' || ctx.reason === 'page-data')) {
            lastAppliedVideo = null;
        }
        var video = getVideo(ctx);
        var player = getPlayer(ctx);
        if (!video || !player) return false;

        if (isLiveVideo(video, player)) {
            lastAppliedVideo = video;
            writeStatus('skipped', 'live-stream');
            return true;
        }
        if (video === lastAppliedVideo) return true;
        if (typeof player.setBufferingGoal !== 'function') {
            writeStatus('degraded', 'player-api-missing');
            return true;
        }

        captureDefaultGoal(player);
        try {
            player.setBufferingGoal(targetSeconds);
            lastAppliedVideo = video;
            writeStatus('applied', 'setBufferingGoal:' + targetSeconds);
            return true;
        } catch (_) {
            writeStatus('degraded', 'player-api-error');
            return true;
        }
    }

    // Read the player's own goal ONCE, before the first override, so turning
    // the feature off can hand it back. Without this the forced goal stuck
    // until the next video load.
    function captureDefaultGoal(player) {
        if (defaultBufferingGoal !== null) return;
        if (!player || typeof player.getBufferingGoal !== 'function') return;
        try {
            var current = player.getBufferingGoal();
            if (typeof current === 'number' && isFinite(current) && current > 0 && current !== targetSeconds) {
                defaultBufferingGoal = current;
            }
        } catch (_) {
            // reason: the goal getter is undocumented and may be absent
        }
    }

    function restoreDefaultGoal() {
        var player = getPlayer(null);
        if (defaultBufferingGoal === null || !player || typeof player.setBufferingGoal !== 'function') {
            // Nothing captured (no getter on this build) — the override lapses
            // on the next load. Say so instead of claiming a clean 'off'.
            writeStatus('off', defaultBufferingGoal === null ? 'goal-persists-until-next-load' : 'player-api-missing');
            return;
        }
        try {
            player.setBufferingGoal(defaultBufferingGoal);
            writeStatus('off', 'restored:' + defaultBufferingGoal);
        } catch (_) {
            writeStatus('off', 'restore-failed');
        }
    }

    function cancelTask() {
        if (PlayerTaskManager && typeof PlayerTaskManager.cancel === 'function') {
            PlayerTaskManager.cancel(TASK_ID);
        }
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
        }
    }

    function schedule(delay, reason) {
        if (PlayerTaskManager && typeof PlayerTaskManager.schedule === 'function') {
            PlayerTaskManager.schedule(TASK_ID, apply, {
                owner: 'ytkit-main',
                reason: reason || 'manual',
                delay: delay || 0,
                needsVideo: true,
                needsPlayer: true,
                maxAttempts: RETRY_DELAYS.length,
                retryDelays: RETRY_DELAYS,
                events: TASK_EVENTS
            });
            return;
        }
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function() {
            pendingTimer = null;
            apply({ reason: reason || 'manual' });
        }, delay || 0);
    }

    function readTargetSeconds() {
        var raw = Number(document.documentElement.getAttribute(SECONDS_ATTR));
        if (!isFinite(raw) || raw <= 0) return DEFAULT_TARGET_SECONDS;
        return Math.min(MAX_TARGET_SECONDS, Math.max(MIN_TARGET_SECONDS, Math.round(raw)));
    }

    function syncFromAttr() {
        var next = document.documentElement.getAttribute(ENABLE_ATTR) === 'on';
        var nextSeconds = readTargetSeconds();
        if (nextSeconds !== targetSeconds) {
            targetSeconds = nextSeconds;
            // The goal changed under a player we already applied to, so the
            // per-video short-circuit has to be released or the new value only
            // lands on the next navigation.
            lastAppliedVideo = null;
        }
        if (next === ON) {
            if (ON) schedule(0, 'attribute');
            return;
        }
        ON = next;
        lastAppliedVideo = null;
        cancelTask();
        if (ON) {
            writeStatus('retry', 'waiting-for-player');
            schedule(0, 'attribute');
        } else {
            restoreDefaultGoal();
        }
    }

    if (!PlayerTaskManager) {
        document.addEventListener('loadstart', function(e) {
            if (ON && e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
                lastAppliedVideo = null;
                schedule(0, 'loadstart');
            }
        }, true);
        document.addEventListener('loadedmetadata', function(e) {
            if (ON && e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
                schedule(0, 'loadedmetadata');
            }
        }, true);
        document.addEventListener('canplay', function(e) {
            if (ON && e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
                schedule(0, 'canplay');
            }
        }, true);
        window.addEventListener('yt-navigate-finish', function() {
            if (ON) {
                lastAppliedVideo = null;
                schedule(0, 'navigate');
            }
        });
        window.addEventListener('yt-page-data-updated', function() {
            if (ON) schedule(0, 'page-data');
        });
    }

    _obsRegister([ENABLE_ATTR, SECONDS_ATTR], syncFromAttr);
    syncFromAttr();
})();

    // ──────────────────────────────────────────────────────────────────
    // Feature 3.6: Audio-only / bandwidth saver
    // ──────────────────────────────────────────────────────────────────
    // Capability-gated exactly like the buffer target above. YouTube's
    // page-owned movie_player does NOT expose an audio-only itag through any
    // public or semi-public method, so this never claims to deliver an
    // audio-only stream: it probes for one, and when the player has none it
    // pins the lowest available quality and publishes `lowest-quality` as the
    // reason so the ISOLATED surface can say what actually happened. Never
    // emulate it by muting, seeking, or detaching the media element.
(function() {
    'use strict';
    if (typeof document === 'undefined' || !document.documentElement) return;

    var ENABLE_ATTR = 'data-ytkit-audio-only';
    var STATUS_ATTR = 'data-ytkit-audio-only-status';
    var REASON_ATTR = 'data-ytkit-audio-only-reason';
    var ON = false;
    var appliedKey = '';
    var restoreQuality = null;
    var pendingTimer = null;
    var PlayerTaskManager = globalThis.YTKitCore && globalThis.YTKitCore.playerTaskManager;
    var TASK_ID = 'ytkit-main:audioOnly';
    var TASK_EVENTS = ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'player-state', 'navigate', 'page-data'];
    var RETRY_DELAYS = [0, 150, 400, 1000, 1800, 3000];

    function writeStatus(status, reason) {
        var root = document.documentElement;
        var nextStatus = String(status || 'off');
        var nextReason = reason ? String(reason).slice(0, 240) : '';
        if (root.getAttribute(STATUS_ATTR) !== nextStatus) root.setAttribute(STATUS_ATTR, nextStatus);
        if (nextReason) {
            if (root.getAttribute(REASON_ATTR) !== nextReason) root.setAttribute(REASON_ATTR, nextReason);
        } else {
            root.removeAttribute(REASON_ATTR);
        }
    }

    function player() {
        return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    }

    function mainVideo() {
        return document.querySelector('.html5-main-video');
    }

    // Live streams are NOT excluded. The buffer-target feature above skips
    // them because changing the buffering goal breaks live latency; pinning a
    // quality has no such hazard — YouTube offers quality selection on live
    // streams itself — and a multi-hour stream is the longest, most expensive
    // session a viewer has, which is exactly where this mode earns its keep.

    // Ordered worst-to-best. The player reports availability per video, so the
    // first entry it actually offers is the cheapest stream we can pin.
    var LADDER = ['tiny', 'small', 'medium', 'large', 'hd720'];

    function cheapestQuality(p) {
        var available = [];
        try {
            if (typeof p.getAvailableQualityLevels === 'function') {
                available = p.getAvailableQualityLevels() || [];
            }
        } catch (_) {
            // reason: the quality API is not part of the public IFrame surface
        }
        if (!available.length) return 'tiny';
        for (var i = 0; i < LADDER.length; i++) {
            if (available.indexOf(LADDER[i]) !== -1) return LADDER[i];
        }
        return available[available.length - 1];
    }

    // Probe for a genuine audio-only entry. No shipping player build exposes
    // one today; this exists so the feature upgrades itself for free if one
    // ever appears, rather than silently continuing to under-deliver.
    function audioOnlyQuality(p) {
        try {
            if (typeof p.getAvailableQualityData !== 'function') return null;
            var data = p.getAvailableQualityData() || [];
            for (var i = 0; i < data.length; i++) {
                var entry = data[i] || {};
                var label = String(entry.qualityLabel || '');
                if (entry.isAudioOnly === true || /audio\s*only/i.test(label)) {
                    return entry.quality || null;
                }
            }
        } catch (_) {
            // reason: quality metadata shape is undocumented and build-specific
        }
        return null;
    }

    function apply(ctx) {
        if (!ON) { release(); return true; }
        if (ctx && (ctx.reason === 'loadstart' || ctx.reason === 'navigate' || ctx.reason === 'page-data')) {
            appliedKey = '';
        }
        var p = player();
        var video = mainVideo();
        if (!p || !video) return false;

        if (typeof p.setPlaybackQualityRange !== 'function') {
            writeStatus('degraded', 'player-api-missing');
            return true;
        }

        var audioQuality = audioOnlyQuality(p);
        var target = audioQuality || cheapestQuality(p);
        var key = target + ':' + (audioQuality ? 'audio' : 'video');
        if (key === appliedKey) return true;

        if (restoreQuality === null) {
            try {
                restoreQuality = (typeof p.getPlaybackQuality === 'function' && p.getPlaybackQuality()) || '';
            } catch (_) {
                restoreQuality = '';
            }
        }
        try {
            p.setPlaybackQualityRange(target, target);
            if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(target);
            appliedKey = key;
            // The reason is the honest part: `audio-stream` only when the
            // player really offered one, `lowest-quality` otherwise.
            writeStatus('applied', (audioQuality ? 'audio-stream:' : 'lowest-quality:') + target);
            return true;
        } catch (_) {
            writeStatus('degraded', 'player-api-error');
            return true;
        }
    }

    function release() {
        appliedKey = '';
        var p = player();
        if (!p || typeof p.setPlaybackQualityRange !== 'function' || !restoreQuality) {
            restoreQuality = null;
            writeStatus('off');
            return;
        }
        try {
            // Hand the pin back rather than leaving the player stuck at 144p
            // after the feature is switched off.
            p.setPlaybackQualityRange(restoreQuality, restoreQuality);
            writeStatus('off', 'restored:' + restoreQuality);
        } catch (_) {
            writeStatus('off', 'restore-failed');
        }
        restoreQuality = null;
    }

    function cancelTask() {
        if (PlayerTaskManager && typeof PlayerTaskManager.cancel === 'function') {
            PlayerTaskManager.cancel(TASK_ID);
        }
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    }

    function schedule(delay, reason) {
        if (PlayerTaskManager && typeof PlayerTaskManager.schedule === 'function') {
            PlayerTaskManager.schedule(TASK_ID, apply, {
                owner: 'ytkit-main',
                reason: reason || 'manual',
                delay: delay || 0,
                needsVideo: true,
                needsPlayer: true,
                maxAttempts: RETRY_DELAYS.length,
                retryDelays: RETRY_DELAYS,
                events: TASK_EVENTS
            });
            return;
        }
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function() {
            pendingTimer = null;
            apply({ reason: reason || 'manual' });
        }, delay || 0);
    }

    function syncFromAttr() {
        var next = document.documentElement.getAttribute(ENABLE_ATTR) === 'on';
        if (next === ON) {
            if (ON) schedule(0, 'attribute');
            return;
        }
        ON = next;
        appliedKey = '';
        cancelTask();
        if (ON) {
            writeStatus('retry', 'waiting-for-player');
            schedule(0, 'attribute');
        } else {
            release();
        }
    }

    if (!PlayerTaskManager) {
        document.addEventListener('loadstart', function(e) {
            if (ON && e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
                appliedKey = '';
                schedule(0, 'loadstart');
            }
        }, true);
        window.addEventListener('yt-navigate-finish', function() {
            if (ON) { appliedKey = ''; schedule(0, 'navigate'); }
        });
    }

    _obsRegister([ENABLE_ATTR], syncFromAttr);
    syncFromAttr();
})();

    // ──────────────────────────────────────────────────────────────────
    // Feature 4+5: Shared audio processing graph
    // ──────────────────────────────────────────────────────────────────
    // Single AudioContext for ALL audio features (mono-to-stereo,
    // volume boost, audio normalization, auto-gain, high-pass, and sync offset). createMediaElementSource is
    // one-shot per element — multiple AudioContexts competing for the
    // same <video> would throw InvalidStateError. The shared graph is:
    //   source → monoMerge → compressor → highPass → [3-band EQ] → analyser → autoGain → pan → boostGain → delay → destination
    // Each node passes through when its feature is disabled.
(function() {
    'use strict';
    var AC = typeof AudioContext !== 'undefined' ? AudioContext
           : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
    if (!AC) return;

    var _monoEnabled = false;
    var _boostGain = 1.0;
    var _normalizeEnabled = false;
    var _autoGainEnabled = false;
    var _highPassEnabled = false;
    var _audioEqEnabled = false;
    var _audioEqLowDb = 0;
    var _audioEqMidDb = 0;
    var _audioEqHighDb = 0;
    var _panValue = 0;
    var _audioSyncOffsetMs = 0;
    var _delayNode = null;
    var _autoGainMeter = null;
    var _autoGainSamples = null;
    var AUTO_GAIN_TARGET_RMS = 0.14;
    var AUTO_GAIN_MIN = 1.0;
    var AUTO_GAIN_MAX = 3.0;
    var AUTO_GAIN_INTERVAL_MS = 250;
    var HIGH_PASS_CUTOFF_HZ = 80;
    var HIGH_PASS_BYPASS_HZ = 10;
    var HIGH_PASS_Q = 0.707;
    var EQ_LOW_FREQUENCY_HZ = 120;
    var EQ_MID_FREQUENCY_HZ = 1000;
    var EQ_HIGH_FREQUENCY_HZ = 8000;
    var EQ_Q = 1;
    var AUDIO_EQ_GAIN_LIMIT_DB = 12;
    var _audioSyncAttr = 'data-ytkit-audio-sync-offset';
    var _audioAutoGainAttr = 'data-ytkit-audio-auto-gain';
    var _audioHighPassAttr = 'data-ytkit-audio-high-pass';
    var _audioEqAttr = 'data-ytkit-audio-eq';
    var _audioEqLowAttr = 'data-ytkit-audio-eq-low';
    var _audioEqMidAttr = 'data-ytkit-audio-eq-mid';
    var _audioEqHighAttr = 'data-ytkit-audio-eq-high';
    var _audioTrackSelection = globalThis.YTKitCore && globalThis.YTKitCore.audioTrackSelection;
    if (_audioTrackSelection && _audioTrackSelection.ATTRS
        && _audioTrackSelection.ATTRS.syncOffset) {
        _audioSyncAttr = _audioTrackSelection.ATTRS.syncOffset;
    }
    if (_audioTrackSelection && _audioTrackSelection.ATTRS
        && _audioTrackSelection.ATTRS.autoGain) {
        _audioAutoGainAttr = _audioTrackSelection.ATTRS.autoGain;
    }
    if (_audioTrackSelection && _audioTrackSelection.ATTRS
        && _audioTrackSelection.ATTRS.highPass) {
        _audioHighPassAttr = _audioTrackSelection.ATTRS.highPass;
    }
    if (_audioTrackSelection && _audioTrackSelection.ATTRS
        && _audioTrackSelection.ATTRS.equalizer) {
        _audioEqAttr = _audioTrackSelection.ATTRS.equalizer;
    }
    if (_audioTrackSelection && _audioTrackSelection.ATTRS
        && _audioTrackSelection.ATTRS.eqLow) {
        _audioEqLowAttr = _audioTrackSelection.ATTRS.eqLow;
    }
    if (_audioTrackSelection && _audioTrackSelection.ATTRS
        && _audioTrackSelection.ATTRS.eqMid) {
        _audioEqMidAttr = _audioTrackSelection.ATTRS.eqMid;
    }
    if (_audioTrackSelection && _audioTrackSelection.ATTRS
        && _audioTrackSelection.ATTRS.eqHigh) {
        _audioEqHighAttr = _audioTrackSelection.ATTRS.eqHigh;
    }
    var _normalizeAudioSyncOffset = _audioTrackSelection
        && typeof _audioTrackSelection.normalizeAudioSyncOffset === 'function'
        ? _audioTrackSelection.normalizeAudioSyncOffset
        : function(value) {
            var parsed = Number(value);
            if (!isFinite(parsed)) return 0;
            return Math.max(-500, Math.min(500, Math.round(parsed)));
        };
    var _normalizeAudioEqGain = _audioTrackSelection
        && typeof _audioTrackSelection.normalizeAudioEqGain === 'function'
        ? _audioTrackSelection.normalizeAudioEqGain
        : function(value) {
            var parsed = Number(value);
            if (!isFinite(parsed)) return 0;
            return Math.max(-AUDIO_EQ_GAIN_LIMIT_DB, Math.min(AUDIO_EQ_GAIN_LIMIT_DB, Math.round(parsed)));
        };
    // Chrome permanently binds a MediaElement to its first
    // MediaElementAudioSourceNode. Closing the AudioContext and recreating
    // the source on the same <video> throws InvalidStateError — so the
    // context is kept alive and source nodes are cached per element.
    var _ctx = null;
    var _sourceCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    var _source = null;
    var _monoMerge = null;
    var _compressor = null;
    var _highPassNode = null;
    var _eqLowNode = null;
    var _eqMidNode = null;
    var _eqHighNode = null;
    var _autoGainAnalyser = null;
    var _autoGainNode = null;
    var _panNode = null;
    var _gainNode = null;
    var _connectedVideo = null;

    function getVideo() {
        return document.querySelector('.html5-main-video');
    }

    function isActive() {
        return _monoEnabled || _boostGain > 1.001 || _normalizeEnabled
            || _autoGainEnabled || _highPassEnabled
            || _audioEqEnabled
            || Math.abs(_panValue) > 0.001 || _audioSyncOffsetMs > 0;
    }

    var _resumeHooked = false;
    function _resumeOnGesture(ctx) {
        if (_resumeHooked) return;
        _resumeHooked = true;
        var kick = function () {
            document.removeEventListener('pointerdown', kick, true);
            document.removeEventListener('keydown', kick, true);
            _resumeHooked = false;
            try { ctx.resume()['catch'](function () {}); } catch (e) { /* reason: context may be closed */ }
        };
        document.addEventListener('pointerdown', kick, true);
        document.addEventListener('keydown', kick, true);
    }

    function ensureContext() {
        if (!_ctx || _ctx.state === 'closed') _ctx = new AC();
        if (_ctx.state === 'suspended') {
            // The attribute-observer path runs without a user gesture; a
            // suspended context mutes the captured element entirely. Try an
            // immediate resume, then fall back to the next real interaction.
            try { _ctx.resume()['catch'](function () {}); } catch (e) { /* reason: resume may throw pre-gesture */ }
            _resumeOnGesture(_ctx);
        }
        return _ctx;
    }

    function getOrCreateSource(video) {
        if (_sourceCache && _sourceCache.has(video)) return _sourceCache.get(video);
        var ctx = ensureContext();
        var src = ctx.createMediaElementSource(video);
        if (_sourceCache) _sourceCache.set(video, src);
        return src;
    }

    function connect() {
        var video = getVideo();
        if (!video) return;
        if (_connectedVideo === video && _source) {
            syncGraph();
            return;
        }
        disconnectProcessing();
        try {
            var ctx = ensureContext();
            _source = getOrCreateSource(video);
            // Drop the dry source->destination passthrough that
            // disconnectProcessing() left on this cached node: connect() is
            // additive, so without this the destination sums the dry and
            // processed paths after every disable->re-enable cycle.
            try { _source.disconnect(); } catch (e) { /* reason: nothing connected yet */ }
            _monoMerge = ctx.createGain();
            _compressor = ctx.createDynamicsCompressor();
            _compressor.threshold.value = -24;
            _compressor.knee.value = 30;
            _compressor.ratio.value = 12;
            _compressor.attack.value = 0.003;
            _compressor.release.value = 0.25;
            _highPassNode = typeof ctx.createBiquadFilter === 'function'
                ? ctx.createBiquadFilter()
                : null;
            _eqLowNode = typeof ctx.createBiquadFilter === 'function'
                ? ctx.createBiquadFilter()
                : null;
            _eqMidNode = typeof ctx.createBiquadFilter === 'function'
                ? ctx.createBiquadFilter()
                : null;
            _eqHighNode = typeof ctx.createBiquadFilter === 'function'
                ? ctx.createBiquadFilter()
                : null;
            _autoGainAnalyser = typeof ctx.createAnalyser === 'function'
                ? ctx.createAnalyser()
                : null;
            if (_autoGainAnalyser) {
                try {
                    _autoGainAnalyser.fftSize = 2048;
                    _autoGainAnalyser.smoothingTimeConstant = 0.8;
                } catch (e) { /* reason: analyser tuning is best-effort */ }
            }
            _autoGainNode = ctx.createGain();
            _panNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            _gainNode = ctx.createGain();
            _source.connect(_monoMerge);
            _monoMerge.connect(_compressor);
            _delayNode = typeof ctx.createDelay === 'function'
                ? ctx.createDelay(0.5)
                : null;
            syncGraph();
            _connectedVideo = video;
        } catch (e) {
            disconnectProcessing();
        }
    }

    function disconnectNode(node) {
        if (!node) return;
        try { node.disconnect(); } catch (e) { /* reason: node may already be disconnected */ }
    }

    function routeGraph() {
        if (!_compressor || !_autoGainNode || !_gainNode) return;

        // Rebuild only the in-context connections. The media source and
        // AudioContext stay cached, so live toggles cannot create duplicate
        // branches or trigger the one-source-per-element restriction.
        disconnectNode(_compressor);
        disconnectNode(_highPassNode);
        disconnectNode(_eqLowNode);
        disconnectNode(_eqMidNode);
        disconnectNode(_eqHighNode);
        disconnectNode(_autoGainAnalyser);
        disconnectNode(_autoGainNode);
        disconnectNode(_panNode);
        disconnectNode(_gainNode);
        disconnectNode(_delayNode);

        var tail = _compressor;
        if (_highPassNode) {
            tail.connect(_highPassNode);
            tail = _highPassNode;
        }
        var eqAvailable = _eqLowNode && _eqMidNode && _eqHighNode;
        if (_audioEqEnabled && eqAvailable) {
            tail.connect(_eqLowNode);
            _eqLowNode.connect(_eqMidNode);
            _eqMidNode.connect(_eqHighNode);
            tail = _eqHighNode;
        }
        if (_autoGainAnalyser) {
            tail.connect(_autoGainAnalyser);
            tail = _autoGainAnalyser;
        }
        tail.connect(_autoGainNode);
        tail = _autoGainNode;
        if (_panNode) {
            tail.connect(_panNode);
            _panNode.connect(_gainNode);
        } else {
            tail.connect(_gainNode);
        }
        if (_delayNode && _ctx) {
            _gainNode.connect(_delayNode);
            _delayNode.connect(_ctx.destination);
        } else if (_ctx) {
            _gainNode.connect(_ctx.destination);
        }
    }

    function syncGraph() {
        if (_monoMerge) {
            if (_monoEnabled) {
                _monoMerge.channelCount = 1;
                _monoMerge.channelCountMode = 'explicit';
                _monoMerge.channelInterpretation = 'speakers';
            } else {
                _monoMerge.channelCount = 2;
                _monoMerge.channelCountMode = 'max';
                _monoMerge.channelInterpretation = 'speakers';
            }
        }
        if (_panNode) _panNode.pan.value = _panValue;
        if (_gainNode) _gainNode.gain.value = _boostGain;
        if (_highPassNode) {
            _highPassNode.type = 'highpass';
            _highPassNode.frequency.value = _highPassEnabled
                ? HIGH_PASS_CUTOFF_HZ
                : HIGH_PASS_BYPASS_HZ;
            if (_highPassNode.Q) _highPassNode.Q.value = HIGH_PASS_Q;
        }
        if (_eqLowNode) {
            _eqLowNode.type = 'lowshelf';
            _eqLowNode.frequency.value = EQ_LOW_FREQUENCY_HZ;
            _eqLowNode.gain.value = _audioEqLowDb;
        }
        if (_eqMidNode) {
            _eqMidNode.type = 'peaking';
            _eqMidNode.frequency.value = EQ_MID_FREQUENCY_HZ;
            _eqMidNode.gain.value = _audioEqMidDb;
            if (_eqMidNode.Q) _eqMidNode.Q.value = EQ_Q;
        }
        if (_eqHighNode) {
            _eqHighNode.type = 'highshelf';
            _eqHighNode.frequency.value = EQ_HIGH_FREQUENCY_HZ;
            _eqHighNode.gain.value = _audioEqHighDb;
        }
        if (_autoGainNode && !_autoGainEnabled) _autoGainNode.gain.value = 1;
        if (_delayNode && _delayNode.delayTime) {
            // Web Audio is causal: positive values delay the audio path. A
            // negative request cannot be rendered as negative latency, so it
            // remains an explicit zero-latency request at the graph boundary.
            _delayNode.delayTime.value = Math.max(0, _audioSyncOffsetMs) / 1000;
        }
        if (_compressor) {
            if (_normalizeEnabled) {
                _compressor.threshold.value = -24;
                _compressor.ratio.value = 12;
            } else {
                _compressor.threshold.value = 0;
                _compressor.ratio.value = 1;
            }
        }
        routeGraph();
        syncAutoGainMeter();
    }

    function stopAutoGainMeter() {
        if (_autoGainMeter !== null && typeof clearInterval === 'function') {
            clearInterval(_autoGainMeter);
        }
        _autoGainMeter = null;
        _autoGainSamples = null;
    }

    function updateAutoGain() {
        if (!_autoGainEnabled || !_autoGainNode || !_autoGainAnalyser
            || typeof _autoGainAnalyser.getFloatTimeDomainData !== 'function'
            || typeof Float32Array === 'undefined') return;
        var sampleCount = Number(_autoGainAnalyser.fftSize) || 2048;
        if (!_autoGainSamples || _autoGainSamples.length !== sampleCount) {
            _autoGainSamples = new Float32Array(sampleCount);
        }
        try {
            _autoGainAnalyser.getFloatTimeDomainData(_autoGainSamples);
        } catch (e) {
            return; // reason: a browser can invalidate the analyser during teardown
        }
        var sum = 0;
        for (var i = 0; i < _autoGainSamples.length; i++) {
            var sample = _autoGainSamples[i] || 0;
            sum += sample * sample;
        }
        var rms = Math.sqrt(sum / _autoGainSamples.length);
        if (!isFinite(rms) || rms < 0.0001) return;
        var desired = Math.max(AUTO_GAIN_MIN, Math.min(AUTO_GAIN_MAX, AUTO_GAIN_TARGET_RMS / rms));
        var current = Number(_autoGainNode.gain.value);
        if (!isFinite(current)) current = 1;
        var smoothing = desired >= current ? 0.35 : 0.12;
        _autoGainNode.gain.value = current + ((desired - current) * smoothing);
    }

    function syncAutoGainMeter() {
        if (!_autoGainEnabled) {
            stopAutoGainMeter();
            return;
        }
        updateAutoGain();
        if (_autoGainMeter === null && _autoGainAnalyser
            && typeof setInterval === 'function' && typeof clearInterval === 'function') {
            _autoGainMeter = setInterval(updateAutoGain, AUTO_GAIN_INTERVAL_MS);
        }
    }

    function disconnectProcessing() {
        // Disconnect the processing chain but keep the source node and context
        // alive — Chrome binds media elements to their first source forever.
        // Route source → destination as passthrough so audio is never muted.
        stopAutoGainMeter();
        if (_source) { try { _source.disconnect(); } catch (e) { /* reason: already disconnected */ } }
        if (_monoMerge) { try { _monoMerge.disconnect(); } catch (e) { /* reason: already disconnected */ } _monoMerge = null; }
        if (_compressor) { try { _compressor.disconnect(); } catch (e) { /* reason: already disconnected */ } _compressor = null; }
        if (_highPassNode) { try { _highPassNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _highPassNode = null; }
        if (_eqLowNode) { try { _eqLowNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _eqLowNode = null; }
        if (_eqMidNode) { try { _eqMidNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _eqMidNode = null; }
        if (_eqHighNode) { try { _eqHighNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _eqHighNode = null; }
        if (_autoGainAnalyser) { try { _autoGainAnalyser.disconnect(); } catch (e) { /* reason: already disconnected */ } _autoGainAnalyser = null; }
        if (_autoGainNode) { try { _autoGainNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _autoGainNode = null; }
        if (_panNode) { try { _panNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _panNode = null; }
        if (_gainNode) { try { _gainNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _gainNode = null; }
        if (_delayNode) { try { _delayNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _delayNode = null; }
        if (_source && _ctx) {
            try { _source.connect(_ctx.destination); } catch (e) { /* reason: context may be suspended */ }
        }
        _connectedVideo = null;
    }

    _obsRegister(['data-ytkit-mono-to-stereo'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-mono-to-stereo');
        var next = val === '1';
        if (next === _monoEnabled) return;
        _monoEnabled = next;
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister(['data-ytkit-volume-boost'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-volume-boost');
        var next = parseFloat(val) || 1.0;
        if (next < 1) next = 1;
        if (next > 10) next = 10;
        _boostGain = next;
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister(['data-ytkit-audio-normalize'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-audio-normalize');
        _normalizeEnabled = val === '1';
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister([_audioAutoGainAttr], function() {
        var val = document.documentElement.getAttribute(_audioAutoGainAttr);
        _autoGainEnabled = val === '1';
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister([_audioHighPassAttr], function() {
        var val = document.documentElement.getAttribute(_audioHighPassAttr);
        _highPassEnabled = val === '1';
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister([_audioEqAttr], function() {
        var val = document.documentElement.getAttribute(_audioEqAttr);
        _audioEqEnabled = val === '1';
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister([_audioEqLowAttr], function() {
        _audioEqLowDb = _normalizeAudioEqGain(
            document.documentElement.getAttribute(_audioEqLowAttr)
        );
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister([_audioEqMidAttr], function() {
        _audioEqMidDb = _normalizeAudioEqGain(
            document.documentElement.getAttribute(_audioEqMidAttr)
        );
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister([_audioEqHighAttr], function() {
        _audioEqHighDb = _normalizeAudioEqGain(
            document.documentElement.getAttribute(_audioEqHighAttr)
        );
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister(['data-ytkit-audio-pan'], function() {
        var val = parseFloat(document.documentElement.getAttribute('data-ytkit-audio-pan')) || 0;
        if (val < -1) val = -1;
        if (val > 1) val = 1;
        _panValue = val;
        if (isActive()) connect();
        else disconnectProcessing();
    });

    _obsRegister([_audioSyncAttr], function() {
        var val = document.documentElement.getAttribute(_audioSyncAttr);
        _audioSyncOffsetMs = _normalizeAudioSyncOffset(val);
        if (isActive()) connect();
        else disconnectProcessing();
    });

    document.addEventListener('loadstart', function(e) {
        if (!isActive()) return;
        if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
            _connectedVideo = null;
            connect();
        }
    }, true);

    window.addEventListener('yt-navigate-finish', function() {
        if (isActive()) { _connectedVideo = null; setTimeout(connect, 500); }
    });
})();

})();  // outer N9 IIFE closes here
