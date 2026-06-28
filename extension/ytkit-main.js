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
                            // never let one feature's handler poison another
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
    var _patched = false;

    function shouldBlock(type) {
        if (_codec === 'h264' && /vp0?9|av01/i.test(type)) return true;
        if (_codec === 'vp9') {
            if (/av01/i.test(type)) return true;
            if (/avc1/i.test(type) && !/vp0?9/i.test(type)) return true;
        }
        if (_codec === 'av1') {
            if ((/vp0?9|avc1/i.test(type)) && !/av01/i.test(type)) return true;
        }
        return false;
    }

    function sync() {
        if (_codec === 'auto') {
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
        try { console.log.apply(console, ['[Astra Deck quality]'].concat([].slice.call(arguments))); } catch (e) {}
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
    // Feature 3+4: Shared audio processing graph
    // ──────────────────────────────────────────────────────────────────
    // Single AudioContext for ALL audio features (mono-to-stereo,
    // volume boost, audio normalization). createMediaElementSource is
    // one-shot per element — multiple AudioContexts competing for the
    // same <video> would throw InvalidStateError. The shared graph is:
    //   source → monoMerge → compressor → boostGain → destination
    // Each node passes through when its feature is disabled.
(function() {
    'use strict';
    var AC = typeof AudioContext !== 'undefined' ? AudioContext
           : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
    if (!AC) return;

    var _monoEnabled = false;
    var _boostGain = 1.0;
    var _normalizeEnabled = false;
    var _panValue = 0;
    var _ctx = null;
    var _source = null;
    var _monoMerge = null;
    var _compressor = null;
    var _panNode = null;
    var _gainNode = null;
    var _connectedVideo = null;

    function getVideo() {
        return document.querySelector('.html5-main-video');
    }

    function isActive() {
        return _monoEnabled || _boostGain > 1.001 || _normalizeEnabled || Math.abs(_panValue) > 0.001;
    }

    function connect() {
        var video = getVideo();
        if (!video) return;
        if (_connectedVideo === video && _ctx) {
            syncGraph();
            return;
        }
        cleanup();
        try {
            _ctx = new AC();
            _source = _ctx.createMediaElementSource(video);
            _monoMerge = _ctx.createGain();
            _compressor = _ctx.createDynamicsCompressor();
            _compressor.threshold.value = -24;
            _compressor.knee.value = 30;
            _compressor.ratio.value = 12;
            _compressor.attack.value = 0.003;
            _compressor.release.value = 0.25;
            _panNode = _ctx.createStereoPanner ? _ctx.createStereoPanner() : null;
            _gainNode = _ctx.createGain();
            _source.connect(_monoMerge);
            _monoMerge.connect(_compressor);
            if (_panNode) {
                _compressor.connect(_panNode);
                _panNode.connect(_gainNode);
            } else {
                _compressor.connect(_gainNode);
            }
            _gainNode.connect(_ctx.destination);
            syncGraph();
            _connectedVideo = video;
        } catch (e) {
            cleanup();
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
        if (_compressor) {
            if (_normalizeEnabled) {
                _compressor.threshold.value = -24;
                _compressor.ratio.value = 12;
            } else {
                _compressor.threshold.value = 0;
                _compressor.ratio.value = 1;
            }
        }
    }

    function cleanup() {
        if (_source) { try { _source.disconnect(); } catch (e) { /* reason: already disconnected */ } _source = null; }
        if (_monoMerge) { try { _monoMerge.disconnect(); } catch (e) { /* reason: already disconnected */ } _monoMerge = null; }
        if (_compressor) { try { _compressor.disconnect(); } catch (e) { /* reason: already disconnected */ } _compressor = null; }
        if (_panNode) { try { _panNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _panNode = null; }
        if (_gainNode) { try { _gainNode.disconnect(); } catch (e) { /* reason: already disconnected */ } _gainNode = null; }
        if (_ctx && _ctx.state !== 'closed') { try { _ctx.close(); } catch (e) { /* reason: already closing */ } }
        _ctx = null;
        _connectedVideo = null;
    }

    _obsRegister(['data-ytkit-mono-to-stereo'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-mono-to-stereo');
        var next = val === '1';
        if (next === _monoEnabled) return;
        _monoEnabled = next;
        if (isActive()) connect();
        else cleanup();
    });

    _obsRegister(['data-ytkit-volume-boost'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-volume-boost');
        var next = parseFloat(val) || 1.0;
        if (next < 1) next = 1;
        if (next > 10) next = 10;
        _boostGain = next;
        if (isActive()) connect();
        else cleanup();
    });

    _obsRegister(['data-ytkit-audio-normalize'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-audio-normalize');
        _normalizeEnabled = val === '1';
        if (isActive()) connect();
        else cleanup();
    });

    _obsRegister(['data-ytkit-audio-pan'], function() {
        var val = parseFloat(document.documentElement.getAttribute('data-ytkit-audio-pan')) || 0;
        if (val < -1) val = -1;
        if (val > 1) val = 1;
        _panValue = val;
        if (isActive()) connect();
        else cleanup();
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
