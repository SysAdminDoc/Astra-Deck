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
        // Audit pass — surface YouTube Music and Embed routes so features can
        // gate cleanly without re-deriving the host/path classification.
        MUSIC: 'music',
        EMBED: 'embed',
        LIVE_CHAT: 'live_chat',
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

    function isMusicHost(host = window.location.hostname) {
        return normalizeHost(host) === 'music.youtube.com';
    }

    function isEmbedPath(path = window.location.pathname) {
        return normalizePath(path).startsWith('/embed/');
    }

    function isLiveChatPath(path = window.location.pathname) {
        return normalizePath(path).startsWith('/live_chat');
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
        // Host-scoped checks first — music.youtube.com keeps its own routes
        // and live_chat lives in an iframe whose path is /live_chat*.
        if (isMusicHost(host)) return PageTypes.MUSIC;
        if (isLiveChatPath(currentPath)) return PageTypes.LIVE_CHAT;
        if (isEmbedPath(currentPath)) return PageTypes.EMBED;
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
        isEmbedPath,
        isLiveChatPath,
        isMusicHost,
        isSearchPagePath,
        isShortsPagePath,
        isWatchPagePath
    });
})();
