(() => {
    'use strict';

    // extension/features/youtube-music-compat/index.js
    //
    // Next-2 monolith peel for YouTube Music compatibility. The module owns
    // the primary youtubeMusicCompat feature object; ytkit.js keeps the inline
    // object only as a compatibility fallback.

    function createYoutubeMusicCompatFeature(deps = {}) {
        const {
            injectStyle = () => ({ remove() {} })
        } = deps;

        return {
            id: 'youtubeMusicCompat',
            name: 'YouTube Music Compatibility',
            description: 'Applies Astra Deck themeing + OLED + density features on music.youtube.com. Player-specific features (downloads, RYD, SponsorBlock) keep their existing per-page gating.',
            group: 'Integrations',
            icon: 'music',
            _styleElement: null,
            init() {
                // v4.47.0 EI-NEW2: exact hostname match. The previous
                // .includes('music.youtube.com') substring would match
                // a hypothetical music.youtube.com.phishing.io and
                // inject CSS there. Browser DNS resolution would not
                // route to such a domain in practice, but the smell is
                // real — project policy elsewhere prefers strict
                // equality. The www.music.youtube.com variant doesn't
                // exist (YouTube Music canonicalizes to the apex), so
                // exact comparison is sufficient.
                if (location.hostname !== 'music.youtube.com') return;
                this._styleElement = injectStyle(`
                    ytmusic-app, ytmusic-app-layout {
                        background: var(--yt-sys-color-baseline--base-background, #0f0f0f) !important;
                    }
                    /* Reuse the rectangularize hook on YT Music buttons. */
                    ytmusic-pill-shape-renderer,
                    yt-button-shape {
                        border-radius: 8px !important;
                    }
                `, 'youtube-music-compat');
            },
            destroy() {
                this._styleElement?.remove();
                this._styleElement = null;
            }
        };
    }

    const api = {
        createYoutubeMusicCompatFeature
    };

    const root = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    root.youtubeMusicCompat = Object.assign(root.youtubeMusicCompat || {}, api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
