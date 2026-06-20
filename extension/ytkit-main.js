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
    var DEBUG = false;

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

    function apply() {
        if (!ON) return;
        var p = getPlayer();
        if (!p || typeof p.setPlaybackQualityRange !== 'function') return;

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

        if (!target) return;
        var key = getVideoId() + ':' + target.quality + ':' + (target.qualityLabel || '');
        if (key === lastApplied) return;

        try {
            p.setPlaybackQualityRange(target.quality, target.quality);
            if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(target.quality);
            lastApplied = key;
            log('applied', target.quality, target.qualityLabel || '');
        } catch (e) { log('apply failed', e && e.message); }
    }

    function schedule(delay) {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function() { pendingTimer = null; apply(); }, delay || 0);
    }

    function reset() { lastApplied = ''; schedule(0); schedule(400); schedule(1500); }

    // Trigger sources — the player rebuilds quality data shortly after each of these.
    document.addEventListener('loadstart', function(e) {
        if (!ON) return;
        if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) reset();
    }, true);
    document.addEventListener('loadedmetadata', function(e) {
        if (!ON) return;
        if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) schedule(150);
    }, true);
    document.addEventListener('canplay', function(e) {
        if (!ON) return;
        if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) schedule(0);
    }, true);
    // YouTube SPA navigation
    window.addEventListener('yt-navigate-finish', function() { if (ON) reset(); });
    window.addEventListener('yt-page-data-updated', function() { if (ON) schedule(200); });

    function syncFromAttr() {
        var v = document.documentElement.getAttribute('data-ytkit-quality');
        var next = (v === 'on');
        if (next === ON) return;
        ON = next;
        if (ON) reset();
        else { lastApplied = ''; if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; } }
    }

    _obsRegister(['data-ytkit-quality'], syncFromAttr);

    // Initial state — read what ISOLATED may have already set before document_idle.
    syncFromAttr();

    // ── v4.1.0: per-context quality target ──
    // data-ytkit-quality-target carries an explicit quality string written by
    // qualityProfileMatrix (ISOLATED world). When present, it overrides the
    // best-quality picker above; when removed, the picker resumes.
    var _ctxLastApplied = '';
    function applyContextQuality() {
        var target = document.documentElement.getAttribute('data-ytkit-quality-target');
        if (!target) { _ctxLastApplied = ''; return; }
        var p = getPlayer();
        if (!p || typeof p.setPlaybackQualityRange !== 'function') return;
        var vid = getVideoId();
        var key = vid + ':ctx:' + target;
        if (key === _ctxLastApplied) return;
        try {
            p.setPlaybackQualityRange(target, target);
            if (typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality(target);
            _ctxLastApplied = key;
            log('per-context quality applied', target);
        } catch (e) { log('per-context apply failed', e && e.message); }
    }
    _obsRegister(['data-ytkit-quality-target', 'data-ytkit-quality-context'], applyContextQuality);
    document.addEventListener('loadedmetadata', function(e) {
        if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
            _ctxLastApplied = '';
            applyContextQuality();
        }
    }, true);
    window.addEventListener('yt-navigate-finish', function() { _ctxLastApplied = ''; applyContextQuality(); });
    applyContextQuality();
})();

    // ──────────────────────────────────────────────────────────────────
    // Feature 3: Mono-to-stereo audio converter (data-ytkit-mono-to-stereo)
    // ──────────────────────────────────────────────────────────────────
    // Forces mono downmix via a channelCount=1 gain node, then the
    // browser's built-in mono→stereo upmix centers the signal equally
    // in both ears. When disabled, the gain node passes through at
    // channelCount=2. createMediaElementSource is one-shot per element,
    // so we keep the graph alive and toggle the merge behavior.
(function() {
    'use strict';
    var AC = typeof AudioContext !== 'undefined' ? AudioContext
           : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null;
    if (!AC) return;

    var _enabled = false;
    var _ctx = null;
    var _source = null;
    var _merge = null;
    var _connectedVideo = null;

    function getVideo() {
        return document.querySelector('.html5-main-video');
    }

    function connect() {
        var video = getVideo();
        if (!video) return;
        if (_connectedVideo === video && _ctx) {
            syncMerge();
            return;
        }
        cleanup();
        try {
            _ctx = new AC();
            _source = _ctx.createMediaElementSource(video);
            _merge = _ctx.createGain();
            syncMerge();
            _source.connect(_merge);
            _merge.connect(_ctx.destination);
            _connectedVideo = video;
        } catch (e) {
            // reason: createMediaElementSource can throw if already connected
            cleanup();
        }
    }

    function syncMerge() {
        if (!_merge) return;
        if (_enabled) {
            _merge.channelCount = 1;
            _merge.channelCountMode = 'explicit';
            _merge.channelInterpretation = 'speakers';
        } else {
            _merge.channelCount = 2;
            _merge.channelCountMode = 'max';
            _merge.channelInterpretation = 'speakers';
        }
    }

    function cleanup() {
        if (_source) { try { _source.disconnect(); } catch (e) { /* reason: already disconnected */ } _source = null; }
        if (_merge) { try { _merge.disconnect(); } catch (e) { /* reason: already disconnected */ } _merge = null; }
        if (_ctx && _ctx.state !== 'closed') { try { _ctx.close(); } catch (e) { /* reason: already closing */ } }
        _ctx = null;
        _connectedVideo = null;
    }

    _obsRegister(['data-ytkit-mono-to-stereo'], function() {
        var val = document.documentElement.getAttribute('data-ytkit-mono-to-stereo');
        var next = val === '1';
        if (next === _enabled) return;
        _enabled = next;
        if (_enabled) connect();
        else if (_merge) syncMerge();
    });

    document.addEventListener('loadstart', function(e) {
        if (!_enabled) return;
        if (e && e.target && e.target.classList && e.target.classList.contains('html5-main-video')) {
            _connectedVideo = null;
            connect();
        }
    }, true);

    window.addEventListener('yt-navigate-finish', function() {
        if (_enabled) { _connectedVideo = null; setTimeout(connect, 500); }
    });
})();

})();  // outer N9 IIFE closes here
