(() => {
    'use strict';

    // extension/core/selector-packs/profile.js
    //
    // Channel owner / profile surface. Owns both 'profile' and the
    // 'channelProfile' alias — they share an identical selector
    // spine. Resolve channel ID or handle from the linked anchor's
    // href, never from visible text, because YouTube can localise
    // / shorten the channel name independent of the underlying ID.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('profile')) return;

    const stable = Object.freeze([
        'ytd-video-owner-renderer',
        'ytd-channel-name',
        '#channel-name',
        'ytd-c4-tabbed-header-renderer',
        'ytd-page-header-renderer'
    ]);
    const fallback = Object.freeze([
        'yt-avatar-shape',
        'yt-decorated-avatar-view-model',
        'ytd-browse[page-subtype="channels"] ytd-c4-tabbed-header-renderer'
    ]);
    const captureEvidence = Object.freeze([
        'mhtml/WatchPage.mhtml',
        'mhtml/YouTube.mhtml',
        'Subscriptions - YouTube.mhtml',
        'Worldwide Societal Collapse... - YouTube.mhtml',
        'mhtml/Channel.mhtml'
    ]);

    registry.set('profile', Object.freeze({
        surface: 'profile',
        stable: stable,
        fallback: fallback,
        captureEvidence: captureEvidence,
        lastVerified: '2026-06-05',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Resolve channel ID or handle from links, not visible text.'
    }));

    registry.set('channelProfile', Object.freeze({
        surface: 'channelProfile',
        stable: stable,
        fallback: fallback,
        captureEvidence: captureEvidence,
        lastVerified: '2026-06-05',
        highChurn: true,
        needsFreshCapture: false,
        notes: 'Alias for profile.'
    }));
})();
