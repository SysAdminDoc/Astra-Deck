(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.getVideoId) return;

    const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
    const VIDEO_ID_PATH_PREFIXES = Object.freeze([
        '/shorts/',
        '/embed/',
        '/live/'
    ]);
    const YOUTUBE_TRACKING_PARAMS = Object.freeze([
        'si', 'pp', 'feature', 'cbrd', 'ucbcb', 'app', 'sttick',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
        'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'igshid', 'twclid', 'yclid'
    ]);

    let cachedVideoId = null;
    let cachedHref = '';
    let cachedSearchHref = '';
    let cachedSearchParams = null;

    function getCachedSearchParams() {
        const href = window.location.href;
        if (href !== cachedSearchHref) {
            cachedSearchHref = href;
            cachedSearchParams = new URLSearchParams(window.location.search);
        }
        return cachedSearchParams;
    }

    // Public accessor hands callers a defensive copy so external mutation
    // can't corrupt the shared cached URLSearchParams instance.
    function getUrlSearchParams() {
        return new URLSearchParams(getCachedSearchParams());
    }

    function getUrlParam(name) {
        return getCachedSearchParams().get(name);
    }

    function isValidVideoId(value) {
        return typeof value === 'string' && VIDEO_ID_PATTERN.test(value);
    }

    function isYoutuBeHost(host = '') {
        const normalizedHost = typeof host === 'string' ? host.toLowerCase() : '';
        return normalizedHost === 'youtu.be' || normalizedHost === 'www.youtu.be';
    }

    function isYouTubeHost(host = '') {
        const normalizedHost = typeof host === 'string' ? host.toLowerCase() : '';
        return normalizedHost === 'youtube.com'
            || normalizedHost.endsWith('.youtube.com')
            || isYoutuBeHost(normalizedHost);
    }

    function parseUrl(urlValue = window.location.href) {
        if (urlValue instanceof URL) return urlValue;
        const href = typeof urlValue === 'string' && urlValue ? urlValue : window.location.href;
        try {
            return new URL(href, window.location.origin);
        } catch {
            return null;
        }
    }

    function extractVideoIdFromPath(pathname = '') {
        if (typeof pathname !== 'string') return null;
        for (const prefix of VIDEO_ID_PATH_PREFIXES) {
            if (!pathname.startsWith(prefix)) continue;
            const candidate = pathname.slice(prefix.length).split(/[/?#]/, 1)[0];
            return isValidVideoId(candidate) ? candidate : null;
        }
        return null;
    }

    function extractVideoIdFromUrl(urlValue = window.location.href) {
        const url = parseUrl(urlValue);
        if (!url) return null;

        const queryVideoId = url.searchParams.get('v');
        if (isValidVideoId(queryVideoId)) return queryVideoId;

        if (isYoutuBeHost(url.hostname)) {
            const candidate = url.pathname.replace(/^\/+/, '').split(/[/?#]/, 1)[0];
            if (isValidVideoId(candidate)) return candidate;
        }

        return extractVideoIdFromPath(url.pathname);
    }

    function getVideoId(urlValue = window.location.href) {
        const url = parseUrl(urlValue);
        const href = url?.href || window.location.href;
        if (href === cachedHref) return cachedVideoId;
        cachedHref = href;
        cachedVideoId = extractVideoIdFromUrl(url || href);
        return cachedVideoId;
    }

    function cleanYouTubeShareUrl(urlValue, options = {}) {
        const original = typeof urlValue === 'string' ? urlValue : String(urlValue || '');
        const url = parseUrl(original);
        if (!url || !isYouTubeHost(url.hostname)) return original;

        for (const param of YOUTUBE_TRACKING_PARAMS) url.searchParams.delete(param);

        const shortenWatch = options.shortenWatch !== false;
        const videoId = extractVideoIdFromUrl(url);
        const isWatchUrl = url.pathname === '/watch' || isYoutuBeHost(url.hostname);
        if (shortenWatch && videoId && isWatchUrl) {
            const remainingParams = new URLSearchParams(url.searchParams);
            remainingParams.delete('v');
            const remaining = remainingParams.toString();
            return `https://youtu.be/${videoId}${remaining ? '?' + remaining : ''}${url.hash}`;
        }
        return url.toString();
    }

    function unwrapYouTubeRedirectUrl(urlValue) {
        const original = typeof urlValue === 'string' ? urlValue : String(urlValue || '');
        const wrapper = parseUrl(original);
        if (!wrapper || !isYouTubeHost(wrapper.hostname) || wrapper.pathname !== '/redirect') {
            return original;
        }
        const targetValue = wrapper.searchParams.get('q') || wrapper.searchParams.get('url');
        if (!targetValue || !/^https?:\/\//i.test(targetValue)) return original;
        try {
            const target = new URL(targetValue);
            if (target.protocol !== 'https:' && target.protocol !== 'http:') return original;
            return target.toString();
        } catch {
            return original;
        }
    }

    // Canonical per-channel settings key. The DeArrow override reader
    // truncated an owner href to `/@handle` while the watch-page writer stored
    // the RAW href, so an owner link carrying `/featured` or a query string
    // wrote a key no feed card could ever match and the override was silently
    // ignored. Both sides now go through here.
    function channelSettingsKey(hrefValue) {
        const href = String(hrefValue || '').trim();
        if (!href) return '';
        const byId = href.match(/\/channel\/([A-Za-z0-9_-]+)/);
        if (byId) return byId[1];
        const byHandle = href.match(/\/(@[A-Za-z0-9._-]+)/);
        return byHandle ? '/' + byHandle[1] : '';
    }

    Object.assign(core, {
        channelSettingsKey,
        cleanYouTubeShareUrl,
        extractVideoIdFromUrl,
        getUrlParam,
        getUrlSearchParams,
        getVideoId,
        unwrapYouTubeRedirectUrl
    });
})();
