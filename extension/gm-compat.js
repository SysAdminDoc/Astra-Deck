// YTKit v3.0.0 - GM_* Compatibility Shim for Chrome MV3
// Bridges userscript GM_* APIs to Chrome extension APIs
// Loaded before adblock-sandbox.js and ytkit.js (ISOLATED world)

(function() {
    'use strict';

    // Guard against double-loading (manifest loads this in two content_scripts entries)
    if (window._gmCompat) return;

    // In-memory cache for synchronous GM_getValue/GM_setValue
    const _cache = {};
    let _ready = false;

    // Ad blocker config keys that also mirror to localStorage for MAIN world access
    const LOCALSTORAGE_MIRROR_KEYS = ['ytab_enabled', 'ytab_antidetect'];

    const gmCompat = {
        _readyPromise: null,

        async preload() {
            if (_ready) return;
            try {
                const all = await chrome.storage.local.get(null);
                Object.assign(_cache, all);
            } catch (e) {
                console.warn('[YTKit] Storage preload failed:', e);
            }
            _ready = true;

            // Mirror ad blocker keys to localStorage for MAIN world
            for (const key of LOCALSTORAGE_MIRROR_KEYS) {
                if (key in _cache) {
                    try { localStorage.setItem('_ytkit_' + key, JSON.stringify(_cache[key])); } catch(e) {}
                }
            }
        },

        GM_getValue(key, defaultVal) {
            return key in _cache ? _cache[key] : defaultVal;
        },

        GM_setValue(key, value) {
            _cache[key] = value;
            chrome.storage.local.set({ [key]: value }).catch(() => {});

            // Mirror ad blocker keys to localStorage for MAIN world
            if (LOCALSTORAGE_MIRROR_KEYS.includes(key)) {
                try { localStorage.setItem('_ytkit_' + key, JSON.stringify(value)); } catch(e) {}
            }
        },

        GM_addStyle(css) {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
            return style;
        },

        GM_xmlhttpRequest(details) {
            chrome.runtime.sendMessage({
                type: 'GM_XHR',
                details: {
                    method: details.method || 'GET',
                    url: details.url,
                    headers: details.headers || {},
                    data: details.data || null,
                    timeout: details.timeout || 0,
                    responseType: details.responseType || ''
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    details.onerror?.({ error: chrome.runtime.lastError.message });
                    return;
                }
                if (!response) {
                    details.onerror?.({ error: 'No response from background' });
                    return;
                }
                if (response.timeout) {
                    details.ontimeout?.(response);
                } else if (response.error) {
                    details.onerror?.(response);
                } else {
                    // Build a response object matching GM_xmlhttpRequest format
                    const resp = {
                        status: response.status,
                        statusText: response.statusText,
                        responseText: response.responseText,
                        responseHeaders: response.responseHeaders,
                        finalUrl: response.finalUrl,
                        response: response.responseText
                    };
                    details.onload?.(resp);
                }
            });
        },

        GM_cookie: {
            list(filter, callback) {
                chrome.runtime.sendMessage({
                    type: 'GM_COOKIE_LIST',
                    filter: filter
                }, (result) => {
                    if (chrome.runtime.lastError) {
                        callback(null, chrome.runtime.lastError.message);
                        return;
                    }
                    if (!result) {
                        callback(null, 'No response from background');
                        return;
                    }
                    callback(result.cookies, result.error);
                });
            }
        }
    };

    // GM.xmlHttpRequest alias (capital H)
    gmCompat.GM = {
        xmlHttpRequest: gmCompat.GM_xmlhttpRequest
    };

    // Expose globally for content scripts
    window._gmCompat = gmCompat;
})();
