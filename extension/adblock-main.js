// YTKit v3.0.0 - Ad Blocker Phase 1: Page Context Proxy Engine
// Runs in world: "MAIN" at document_start
// Proxies JSON.parse, fetch, XHR to strip ad data from YouTube responses

(function() {
    'use strict';

    // Read config from localStorage (mirrored by gm-compat.js from chrome.storage)
    const enabled = (() => { try { const v = localStorage.getItem('_ytkit_ytab_enabled'); return v === null ? true : JSON.parse(v); } catch(e) { return true; } })();
    const antiDetect = (() => { try { const v = localStorage.getItem('_ytkit_ytab_antidetect'); return v === null ? true : JSON.parse(v); } catch(e) { return true; } })();

    if (!enabled) {
        window.__ytab = { active: false, stats: { blocked: 0, pruned: 0, ssapSkipped: 0 } };
        return;
    }

    if (window.__ytab_injected) return;
    window.__ytab_injected = true;

    const stats = { blocked: 0, pruned: 0, ssapSkipped: 0 };

    const PRUNE_KEYS = [
        'adPlacements', 'adSlots', 'playerAds',
        'playerResponse.adPlacements', 'playerResponse.adSlots', 'playerResponse.playerAds',
        'auxiliaryUi.messageRenderers.upsellDialogRenderer',
        'adBreakHeartbeatParams', 'playerResponse.adBreakHeartbeatParams',
        'responseContext.adSignalsInfo',
        'playerResponse.adBreakParams', 'playerResponse.adParams',
        'playerConfig.adConfig', 'playerResponse.underlay',
        'topbarAdRenderer', 'companionAdRenderer',
        'fullscreenAdRenderer', 'interstitialAdRenderer',
        'sponsoredTextRenderers', 'adBreaks',
        'playerResponse.playerConfig.adConfig',
        'playerResponse.overlay.playerOverlayRenderer.autonavToggle',
        'playerResponse.adInfoRenderer', 'playerResponse.endscreen.endscreenRenderer.adElements',
        'adLayoutLoggingData', 'playerResponse.adLayoutLoggingData',
        'playerResponse.playerConfig.webPlayerConfig.useSuperPrefetchAd',
        'instreamAdPlayerOverlayRenderer', 'linearAdSequenceRenderer',
        'playerResponse.linearAdSequenceRenderer',
    ];
    const REPLACE_MAP = { adPlacements: 'no_ads', adSlots: 'no_ads', playerAds: 'no_ads', adBreakHeartbeatParams: 'no_ads' };
    const INTERCEPT_URLS = [
        '/youtubei/v1/player', '/youtubei/v1/get_watch',
        '/youtubei/v1/browse', '/youtubei/v1/search', '/youtubei/v1/next',
        '/watch?', '/playlist?list=', '/reel_watch_sequence',
        '/youtubei/v1/log_event', '/youtubei/v1/ad_break',
        '/pagead/', '/doubleclick.net/', '/googleadservices.com/',
    ];
    const AD_RENDERER_KEYS_ARR = [
        'adSlotRenderer', 'displayAdRenderer', 'promotedVideoRenderer',
        'compactPromotedVideoRenderer', 'promotedSparklesWebRenderer',
        'promotedSparklesTextSearchRenderer', 'searchPyvRenderer',
        'bannerPromoRenderer', 'statementBannerRenderer',
        'brandVideoSingletonRenderer', 'brandVideoShelfRenderer',
        'actionCompanionAdRenderer', 'inFeedAdLayoutRenderer',
        'adSlotAndLayoutRenderer', 'videoMastheadAdV3Renderer',
        'privetimePromoRenderer', 'movieOfferModuleRenderer',
        'mealbarPromoRenderer', 'backgroundPromoRenderer',
        'enforcementMessageViewModel',
        'instreamVideoAdRenderer', 'adBreakServiceRenderer',
        'playerLegacyDesktopYpcOfferRenderer', 'ypcTrailerRenderer',
        'compactMovieRenderer', 'gridMovieRenderer',
        'movieRenderer', 'clarificationRenderer',
        'externalVideoRenderer', 'sponsoredItemsPreRenderer',
        'linearAdSequenceRenderer', 'instreamAdPlayerOverlayRenderer',
        'adInfoRenderer', 'reelPlayerAdRenderer',
        'shoppingOverlayRenderer', 'adHoverTextButtonRenderer',
        'playerOverlayAutoplayEndpointRenderer',
    ];
    const AD_RENDERER_SET = {};
    for (let i = 0; i < AD_RENDERER_KEYS_ARR.length; i++) AD_RENDERER_SET[AD_RENDERER_KEYS_ARR[i]] = true;

    function safeOverride(obj, prop, val) {
        try { obj[prop] = val; if (obj[prop] === val) return true; } catch(e) {}
        try { Object.defineProperty(obj, prop, { value: val, writable: true, configurable: true, enumerable: true }); return true; } catch(e) {}
        try { delete obj[prop]; Object.defineProperty(obj, prop, { value: val, writable: true, configurable: true, enumerable: true }); return true; } catch(e) {}
        return false;
    }
    function deleteNested(obj, path) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur == null || typeof cur !== 'object') return false;
            cur = cur[keys[i]];
        }
        if (cur != null && typeof cur === 'object') {
            const last = keys[keys.length - 1];
            if (last in cur) { delete cur[last]; return true; }
        }
        return false;
    }
    const _interceptRe = new RegExp(INTERCEPT_URLS.map(function(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('|'));
    function matchesIntercept(url) {
        if (!url) return false;
        return _interceptRe.test(url);
    }
    const _replaceRe = new RegExp('"(' + Object.keys(REPLACE_MAP).map(function(k){return k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('|') + ')"', 'g');
    function replaceAdKeys(text) {
        if (typeof text !== 'string') return text;
        return text.replace(_replaceRe, function(m, k) { return '"' + REPLACE_MAP[k] + '"'; });
    }

    var _pruneVisited = new WeakSet();
    function deepPruneAds(obj, depth) {
        if (!obj || typeof obj !== 'object' || (depth || 0) > 12) return false;
        if (_pruneVisited.has(obj)) return false;
        _pruneVisited.add(obj);
        var keys = Array.isArray(obj) ? null : Object.keys(obj);
        if (keys && keys.length < 2) return false;
        let pruned = false;
        const d = (depth || 0) + 1;
        if (Array.isArray(obj)) {
            for (let i = obj.length - 1; i >= 0; i--) {
                const item = obj[i];
                if (item && typeof item === 'object') {
                    let isAd = false;
                    const itemKeys = Object.keys(item);
                    for (let j = 0; j < itemKeys.length; j++) { if (AD_RENDERER_SET[itemKeys[j]]) { isAd = true; break; } }
                    if (isAd) { obj.splice(i, 1); pruned = true; continue; }
                    const content = item.content || item.renderer;
                    if (content && typeof content === 'object') {
                        const cKeys = Object.keys(content);
                        for (let k = 0; k < cKeys.length; k++) { if (AD_RENDERER_SET[cKeys[k]]) { isAd = true; break; } }
                        if (isAd) { obj.splice(i, 1); pruned = true; continue; }
                    }
                    if (item.richItemRenderer && item.richItemRenderer.content) {
                        const rc = item.richItemRenderer.content;
                        if (typeof rc === 'object') {
                            const rKeys = Object.keys(rc);
                            for (let r = 0; r < rKeys.length; r++) { if (AD_RENDERER_SET[rKeys[r]]) { isAd = true; break; } }
                            if (isAd) { obj.splice(i, 1); pruned = true; continue; }
                        }
                    }
                    pruned = deepPruneAds(item, d) || pruned;
                }
            }
        } else {
            const oKeys = Object.keys(obj);
            for (let m = 0; m < oKeys.length; m++) {
                const key = oKeys[m];
                if (AD_RENDERER_SET[key]) { delete obj[key]; pruned = true; continue; }
                const val = obj[key];
                if (val && typeof val === 'object') { pruned = deepPruneAds(val, d) || pruned; }
            }
        }
        return pruned;
    }

    function pruneObject(obj) {
        _pruneVisited = new WeakSet();
        if (!obj || typeof obj !== 'object') return false;
        var pruned = false;
        for (var i = 0; i < PRUNE_KEYS.length; i++) { if (deleteNested(obj, PRUNE_KEYS[i])) pruned = true; }
        if (obj.entries && Array.isArray(obj.entries)) {
            var before = obj.entries.length;
            obj.entries = obj.entries.filter(function(e) {
                return !(e && e.command && e.command.reelWatchEndpoint &&
                         e.command.reelWatchEndpoint.adClientParams &&
                         e.command.reelWatchEndpoint.adClientParams.isAd);
            });
            if (obj.entries.length < before) pruned = true;
        }
        if (!pruned || obj.contents || obj.onResponseReceivedActions || obj.richGridRenderer) {
            pruned = deepPruneAds(obj) || pruned;
        }
        if (pruned) stats.pruned++;
        return pruned;
    }
    const origParse = JSON.parse;
    const AD_KEY_HINTS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'auxiliaryUi', 'adSlotRenderer', 'promotedVideoRenderer', 'inFeedAdLayoutRenderer', 'displayAdRenderer', 'compactPromotedVideoRenderer', 'adBreakServiceRenderer'];
    function jsonNeedsPruning(str) {
        if (typeof str !== 'string' || str.length < 500) return false;
        for (let i = 0; i < AD_KEY_HINTS.length; i++) {
            if (str.indexOf(AD_KEY_HINTS[i]) !== -1) return true;
        }
        return false;
    }
    safeOverride(JSON, 'parse', new Proxy(origParse, {
        apply: function(target, thisArg, args) {
            const result = Reflect.apply(target, thisArg, args);
            try {
                if (result && typeof result === 'object' && jsonNeedsPruning(args[0])) {
                    if (pruneObject(result)) stats.blocked++;
                }
            } catch(e) {}
            return result;
        }
    }));
    const origFetch = fetch;
    safeOverride(window, 'fetch', new Proxy(origFetch, {
        apply: function(target, thisArg, args) {
            const req = args[0];
            const url = typeof req === 'string' ? req : (req instanceof Request ? req.url : '');
            if (!matchesIntercept(url)) return Reflect.apply(target, thisArg, args);
            return Reflect.apply(target, thisArg, args).then(function(resp) {
                if (!resp || !resp.ok) return resp;
                const ct = resp.headers?.get('content-type') || '';
                if (ct && !ct.includes('json') && !ct.includes('text')) return resp;
                return resp.clone().text().then(function(text) {
                    try {
                        const mod = replaceAdKeys(text);
                        const obj = origParse(mod);
                        pruneObject(obj);
                        stats.blocked++;
                        return new Response(JSON.stringify(obj), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
                    } catch(e) { return resp; }
                })['catch'](function() { return resp; });
            });
        }
    }));
    const origXHROpen = XMLHttpRequest.prototype.open;
    const origXHRSend = XMLHttpRequest.prototype.send;
    safeOverride(XMLHttpRequest.prototype, 'open', function() {
        this._ytab_url = arguments[1];
        return origXHROpen.apply(this, arguments);
    });
    safeOverride(XMLHttpRequest.prototype, 'send', function(body) {
        if (!matchesIntercept(this._ytab_url)) return origXHRSend.call(this, body);
        const xhr = this;
        if (xhr._ytab_hooked) return origXHRSend.call(this, body);
        xhr._ytab_hooked = true;
        xhr.addEventListener('readystatechange', function() {
            if (xhr.readyState !== 4) return;
            try {
                const rType = xhr.responseType;
                if (rType === 'arraybuffer' || rType === 'blob' || rType === 'document') return;
                const text = xhr.responseText;
                if (!text) return;
                const obj = origParse(replaceAdKeys(text));
                pruneObject(obj);
                const newText = JSON.stringify(obj);
                Object.defineProperty(xhr, 'responseText', { value: newText, configurable: true });
                if (rType === 'json') {
                    Object.defineProperty(xhr, 'response', { value: obj, configurable: true });
                } else {
                    Object.defineProperty(xhr, 'response', { value: newText, configurable: true });
                }
                stats.blocked++;
            } catch(e) {}
        });
        return origXHRSend.call(this, body);
    });
    const origAppendChild = Node.prototype.appendChild;
    safeOverride(Node.prototype, 'appendChild', new Proxy(origAppendChild, {
        apply: function(target, thisArg, args) {
            const node = args[0];
            try {
                if (node instanceof HTMLIFrameElement && node.src === 'about:blank') {
                    const sb = node.getAttribute('sandbox');
                    if (sb !== null && sb.indexOf('allow-scripts') === -1) return Reflect.apply(target, thisArg, args);
                    const res = Reflect.apply(target, thisArg, args);
                    try {
                        if (node.contentWindow) { node.contentWindow.fetch = window.fetch; node.contentWindow.JSON.parse = JSON.parse; }
                    } catch(ignored) {}
                    return res;
                }
                if (node instanceof HTMLScriptElement) {
                    const t = (node.textContent || node.text || '');
                    if (t.indexOf('window,"fetch"') !== -1 || t.indexOf("window,'fetch'") !== -1) {
                        node.type = 'application/json';
                    }
                }
            } catch(e) {}
            return Reflect.apply(target, thisArg, args);
        }
    }));
    const origSetTimeout = setTimeout;
    safeOverride(window, 'setTimeout', new Proxy(origSetTimeout, {
        apply: function(target, thisArg, args) {
            const fn = args[0], delay = args[1];
            if (typeof fn === 'function' && delay >= 16000 && delay <= 18000) {
                try {
                    const src = fn.toString();
                    if (src.length > 5 && src.length < 500 && src.indexOf('[native code]') === -1) {
                        args[1] = 1;
                    }
                } catch(e) {}
            }
            return Reflect.apply(target, thisArg, args);
        }
    }));
    if (antiDetect) {
        const origThen = Promise.prototype.then;
        safeOverride(Promise.prototype, 'then', new Proxy(origThen, {
            apply: function(target, thisArg, args) {
                if (typeof args[0] === 'function') {
                    try {
                        const fn = args[0];
                        if (fn.length <= 3 && typeof fn.name === 'string' && fn.name.length < 30) {
                            const src = fn.toString();
                            if (src.length > 100 && src.length < 5000 && src.indexOf('onAbnormalityDetected') !== -1) {
                                args[0] = function(){};
                                stats.blocked++;
                            }
                        }
                    } catch(e) {}
                }
                return Reflect.apply(target, thisArg, args);
            }
        }));
    }
    const SET_UNDEFINED = [
        'ytInitialPlayerResponse.playerAds', 'ytInitialPlayerResponse.adPlacements',
        'ytInitialPlayerResponse.adSlots', 'ytInitialPlayerResponse.adBreakHeartbeatParams',
        'ytInitialPlayerResponse.auxiliaryUi.messageRenderers.upsellDialogRenderer',
        'playerResponse.adPlacements'
    ];
    for (let si = 0; si < SET_UNDEFINED.length; si++) {
        (function(path) {
            try {
                const parts = path.split('.');
                const rootName = parts[0];
                let _val = window[rootName];
                Object.defineProperty(window, rootName, {
                    get: function() { return _val; },
                    set: function(newVal) {
                        if (newVal && typeof newVal === 'object') {
                            const sub = parts.slice(1);
                            let t = newVal;
                            for (let j = 0; j < sub.length - 1; j++) {
                                if (t && typeof t === 'object' && sub[j] in t) t = t[sub[j]]; else { t = null; break; }
                            }
                            if (t && typeof t === 'object') {
                                const last = sub[sub.length - 1];
                                if (last in t) { delete t[last]; stats.pruned++; }
                            }
                        }
                        _val = newVal;
                    },
                    configurable: true, enumerable: true
                });
            } catch(e) {}
        })(SET_UNDEFINED[si]);
    }

    var adNeutTimer = null;
    var adObserver = null;

    function trySkipAd() {
        try {
            var skipSelectors = [
                '.ytp-ad-skip-button',
                '.ytp-ad-skip-button-modern',
                '.ytp-skip-ad-button',
                'button.ytp-ad-skip-button',
                '.ytp-ad-skip-button-slot button',
                '[id^="skip-button"]',
                '.ytp-ad-skip-button-container button',
                'yt-button-shape.ytp-ad-skip-button-modern button',
            ];
            for (var s = 0; s < skipSelectors.length; s++) {
                var btns = document.querySelectorAll(skipSelectors[s]);
                for (var b = 0; b < btns.length; b++) {
                    try { btns[b].click(); stats.blocked++; } catch(e) {}
                }
            }
            var overlays = document.querySelectorAll(
                '.ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container'
            );
            for (var oc = 0; oc < overlays.length; oc++) {
                try { overlays[oc].click(); } catch(e) {}
            }
            var player = document.getElementById('movie_player');
            if (player) {
                if (player.skipAd) try { player.skipAd(); } catch(e) {}
                if (player.cancelPlayback) try { player.cancelPlayback(); } catch(e) {}
            }
        } catch(e) {}
    }

    function startVideoAdNeutralizer() {
        function setupObserver() {
            var player = document.getElementById('movie_player');
            if (!player) return false;
            if (adObserver) adObserver.disconnect();
            adObserver = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].attributeName === 'class') {
                        var el = mutations[i].target;
                        if (el.classList.contains('ad-showing')) {
                            stats.ssapSkipped++;
                            trySkipAd();
                            setTimeout(trySkipAd, 500);
                            setTimeout(trySkipAd, 1500);
                            setTimeout(trySkipAd, 3000);
                            setTimeout(trySkipAd, 5500);
                        }
                    }
                }
            });
            adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
            if (player.classList.contains('ad-showing')) trySkipAd();
            return true;
        }

        if (adNeutTimer) return;
        var observerReady = setupObserver();
        if (observerReady) return;
        adNeutTimer = setInterval(function() {
            if (!observerReady) observerReady = setupObserver();
            if (observerReady) {
                clearInterval(adNeutTimer); adNeutTimer = null;
                return;
            }
            var player = document.getElementById('movie_player');
            if (player && player.classList.contains('ad-showing')) {
                trySkipAd();
            }
        }, 1000);
    }
    function stopVideoAdNeutralizer() {
        if (adNeutTimer) { clearInterval(adNeutTimer); adNeutTimer = null; }
        if (adObserver) { adObserver.disconnect(); adObserver = null; }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startVideoAdNeutralizer);
    } else {
        startVideoAdNeutralizer();
    }

    window.__ytab = {
        active: true, stats: stats,
        startVideoAdNeutralizer: startVideoAdNeutralizer,
        stopVideoAdNeutralizer: stopVideoAdNeutralizer,
        parseFilterList: function(text) {
            const selectors = [];
            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const t = lines[i].trim();
                if (!t || t.charAt(0) === '!' || t.indexOf('@@') === 0 || t.indexOf('#@#') !== -1 || t.indexOf('||') === 0) continue;
                const m = t.match(/^(?:[a-z][a-z0-9.*,-]*)?##([^+^].+)$/);
                if (m && m[1].indexOf(':style(') === -1 && m[1].indexOf(':remove-attr(') === -1) selectors.push(m[1]);
            }
            const unique = [], seen = {};
            for (let j = 0; j < selectors.length; j++) { if (!seen[selectors[j]]) { seen[selectors[j]] = true; unique.push(selectors[j]); } }
            return unique;
        }
    };

    // Listen for commands from ISOLATED world (adblock-sandbox.js / ytkit.js)
    window.addEventListener('ytab-command', function(e) {
        if (!e.detail) return;
        const { action, data } = e.detail;
        if (action === 'startSSAP') startVideoAdNeutralizer();
        if (action === 'stopSSAP') stopVideoAdNeutralizer();
        if (action === 'updateCSS' && window.__ytab) window.__ytab.updateCSS = data;
        if (action === 'parseFilterList' && window.__ytab?.parseFilterList && data) {
            const result = window.__ytab.parseFilterList(data);
            window.dispatchEvent(new CustomEvent('ytab-result', { detail: { action: 'parseFilterList', result } }));
        }
    });

    // Periodically broadcast stats to ISOLATED world
    setInterval(function() {
        window.dispatchEvent(new CustomEvent('ytab-stats', {
            detail: { blocked: stats.blocked, pruned: stats.pruned, ssapSkipped: stats.ssapSkipped, active: true }
        }));
    }, 2000);
})();
