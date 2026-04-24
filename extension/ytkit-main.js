// Astra Deck - MAIN World Bridge
// Handles canPlayType + MediaSource.isTypeSupported patching for codec filtering
// Runs in world: "MAIN" at document_start
// Communicates with ISOLATED world via data attributes on <html>
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

    new MutationObserver(function() {
        var val = document.documentElement.getAttribute('data-ytkit-codec');
        if (val !== null && val !== _codec) {
            _codec = val || 'auto';
            sync();
        }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ytkit-codec'] });

    var initial = document.documentElement.getAttribute('data-ytkit-codec');
    if (initial) { _codec = initial; sync(); }
})();

// ─────────────────────────────────────────────────────────────────────────
// Quality forcer — Premium-aware, no-UI. Calls movie_player.setPlaybackQualityRange
// directly (the same API used by Auto-HD-FPS, Iridium, Enhancer for YouTube,
// and the popular YouTube HD Premium userscript). Never opens the gear menu.
// ISOLATED world toggles this by setting <html data-ytkit-quality="on">.
// ─────────────────────────────────────────────────────────────────────────
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

    new MutationObserver(syncFromAttr)
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-ytkit-quality'] });

    // Initial state — read what ISOLATED may have already set before document_idle.
    syncFromAttr();
})();
