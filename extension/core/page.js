(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.PageTypes) return;

    const PageTypes = Object.freeze({
        HOME: 'home',
        WATCH: 'watch',
        SEARCH: 'search',
        CHANNEL: 'channel',
        SUBSCRIPTIONS: 'subscriptions',
        PLAYLIST: 'playlist',
        SHORTS: 'shorts',
        HISTORY: 'history',
        LIBRARY: 'library',
        OTHER: 'other'
    });

    const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

    function normalizePath(path = window.location.pathname) {
        if (typeof path !== 'string') return '/';
        return path || '/';
    }

    function normalizeHost(host = window.location.hostname) {
        return typeof host === 'string' ? host.toLowerCase() : '';
    }

    function isYoutuBeHost(host = window.location.hostname) {
        const currentHost = normalizeHost(host);
        return currentHost === 'youtu.be' || currentHost === 'www.youtu.be';
    }

    function isWatchPagePath(path = window.location.pathname, host = window.location.hostname) {
        const currentPath = normalizePath(path);
        if (currentPath.startsWith('/watch')) return true;
        if (!isYoutuBeHost(host)) return false;
        const candidate = currentPath.replace(/^\/+/, '').split(/[/?#]/, 1)[0];
        return VIDEO_ID_PATTERN.test(candidate);
    }

    function isSearchPagePath(path = window.location.pathname) {
        return normalizePath(path).startsWith('/results');
    }

    function isShortsPagePath(path = window.location.pathname) {
        return normalizePath(path).startsWith('/shorts');
    }

    function isChannelPagePath(path = window.location.pathname) {
        const currentPath = normalizePath(path);
        return currentPath.startsWith('/@')
            || currentPath.startsWith('/channel')
            || currentPath.startsWith('/c/')
            || currentPath.startsWith('/user/');
    }

    function getCurrentPage(path = window.location.pathname, host = window.location.hostname) {
        const currentPath = normalizePath(path);
        if (isWatchPagePath(currentPath, host)) return PageTypes.WATCH;
        if (currentPath === '/' || currentPath === '/feed/trending') return PageTypes.HOME;
        if (isSearchPagePath(currentPath)) return PageTypes.SEARCH;
        if (isShortsPagePath(currentPath)) return PageTypes.SHORTS;
        if (currentPath.startsWith('/feed/subscriptions')) return PageTypes.SUBSCRIPTIONS;
        if (currentPath.startsWith('/feed/history')) return PageTypes.HISTORY;
        if (currentPath.startsWith('/feed/library') || currentPath.startsWith('/feed/you')) return PageTypes.LIBRARY;
        if (currentPath.startsWith('/playlist')) return PageTypes.PLAYLIST;
        if (isChannelPagePath(currentPath)) return PageTypes.CHANNEL;
        return PageTypes.OTHER;
    }

    Object.assign(core, {
        PageTypes,
        getCurrentPage,
        isChannelPagePath,
        isSearchPagePath,
        isShortsPagePath,
        isWatchPagePath
    });
})();
