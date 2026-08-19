(() => {
    'use strict';

    // extension/core/youtube-thumbnails.js
    //
    // v4.69.0 — original-language thumbnails.
    //
    // `antiTranslate` restores the original title while the thumbnail beside
    // it still shows text baked in the viewer's locale, which is a visible
    // half-fix: the card reads in two languages at once.
    //
    // The tempting implementation is to pattern-match the localised URL and
    // rewrite it. That is a guess about a mechanism YouTube can change without
    // notice, and a guess that silently stops matching looks exactly like a
    // feature that works. So the original is taken from a source that is
    // authoritative and locale-independent, in this order:
    //
    //   1. PLAYER RESPONSE — `videoDetails.thumbnail.thumbnails[]`. Watch page
    //      only, already parsed for four other features, costs nothing.
    //   2. oEMBED — `https://www.youtube.com/oembed?...`. Same origin as the
    //      page, so it needs NO new host permission, returns no cookies, and
    //      its `thumbnail_url` does not vary by locale. This is the feed-card
    //      path, where no player response exists.
    //   3. CANONICAL URL — drop the signed variant query (`?sqp=…&rs=…`) from
    //      whatever was rendered. No network at all. This recovers the
    //      uncropped original image but cannot undo a localisation that lives
    //      in a different asset, so it is the last resort, not the strategy.
    //
    // Everything here is pure: URL and JSON in, plain data out. The fetching,
    // caching and DOM swapping belong to the feature in ytkit.js.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.canonicalThumbnailUrl) return;

    // i.ytimg.com is the canonical host; YouTube also serves the same paths
    // from numbered mirrors (i1..i9) and from ytimg.googleusercontent.com.
    const THUMBNAIL_HOST_PATTERN = /^(?:i\d*\.ytimg\.com|img\.youtube\.com)$/i;
    const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
    // /vi/<id>/<quality>.<ext> or /vi_webp/<id>/<quality>.webp
    const THUMBNAIL_PATH_PATTERN = /^\/(vi|vi_webp)\/([A-Za-z0-9_-]{11})\/([A-Za-z0-9_]+)\.(jpg|jpeg|webp|png)$/;

    const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
    // oEmbed answers are small; anything larger is not an oEmbed document.
    const OEMBED_MAX_BYTES = 8 * 1024;

    function parseThumbnailUrl(rawUrl) {
        if (typeof rawUrl !== 'string' || !rawUrl) return null;
        let url;
        try {
            url = new URL(rawUrl, 'https://www.youtube.com');
        } catch {
            return null;
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (!THUMBNAIL_HOST_PATTERN.test(url.hostname)) return null;
        const match = THUMBNAIL_PATH_PATTERN.exec(url.pathname);
        if (!match) return null;
        const [, prefix, videoId, quality, extension] = match;
        return {
            host: url.hostname,
            videoId,
            quality,
            extension,
            webp: prefix === 'vi_webp',
            // A signed `sqp` crop/resize variant. This is what makes a rendered
            // feed thumbnail differ from the uploader's asset.
            variant: url.searchParams.has('sqp') || url.searchParams.has('rs'),
            // The uploader's own custom thumbnail for a Short. NOT a variant to
            // be stripped: dropping `_custom_N` falls back to an auto-generated
            // video frame, which is a worse image than the one we started with.
            custom: /_custom_\d+$/.test(quality)
        };
    }

    // Returns the variant-free form of a rendered thumbnail URL, or null when
    // the input is not a YouTube thumbnail or is already canonical.
    function canonicalThumbnailUrl(rawUrl) {
        const parsed = parseThumbnailUrl(rawUrl);
        if (!parsed || !parsed.variant) return null;
        const prefix = parsed.webp ? 'vi_webp' : 'vi';
        return `https://${parsed.host}/${prefix}/${parsed.videoId}/${parsed.quality}.${parsed.extension}`;
    }

    function isSameThumbnail(left, right) {
        const a = parseThumbnailUrl(left);
        const b = parseThumbnailUrl(right);
        if (!a || !b) return false;
        // Quality and container differ constantly between what a feed renders
        // and what the player response reports; only the video identity and
        // the uploader-custom flag decide whether these are the same picture.
        return a.videoId === b.videoId && a.custom === b.custom;
    }

    function buildOEmbedUrl(videoId) {
        if (typeof videoId !== 'string' || !VIDEO_ID_PATTERN.test(videoId)) return null;
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        return `${OEMBED_ENDPOINT}?url=${encodeURIComponent(watchUrl)}&format=json`;
    }

    // oEmbed is an untrusted response even though it is same-origin: validate
    // shape and reject a thumbnail that is not a YouTube thumbnail URL, so a
    // compromised or changed endpoint cannot point an <img> anywhere it likes.
    function parseOEmbedMetadata(payload) {
        let json = payload;
        if (typeof payload === 'string') {
            if (payload.length > OEMBED_MAX_BYTES) return null;
            try {
                json = JSON.parse(payload);
            } catch {
                return null;
            }
        }
        if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
        const thumbnailUrl = typeof json.thumbnail_url === 'string' ? json.thumbnail_url : '';
        const parsed = thumbnailUrl ? parseThumbnailUrl(thumbnailUrl) : null;
        const title = typeof json.title === 'string' ? json.title.trim().slice(0, 500) : '';
        const author = typeof json.author_name === 'string' ? json.author_name.trim().slice(0, 200) : '';
        if (!parsed && !title) return null;
        return {
            title: title || null,
            author: author || null,
            thumbnailUrl: parsed ? thumbnailUrl : null,
            videoId: parsed ? parsed.videoId : null
        };
    }

    // The tallest entry in a player response's thumbnail ladder.
    function pickPlayerResponseThumbnail(playerResponse) {
        const list = playerResponse?.videoDetails?.thumbnail?.thumbnails;
        if (!Array.isArray(list) || !list.length) return null;
        let best = null;
        for (const entry of list) {
            const url = typeof entry?.url === 'string' ? entry.url : '';
            if (!parseThumbnailUrl(url)) continue;
            const width = Number(entry.width) || 0;
            if (!best || width > best.width) best = { url, width };
        }
        return best ? best.url : null;
    }

    // The documented fallback order, in one place so the feature and the tests
    // agree on it. Returns { url, source } or null when nothing beats what is
    // already rendered.
    function resolveOriginalThumbnail(rendered, sources = {}) {
        const fromPlayer = pickPlayerResponseThumbnail(sources.playerResponse);
        if (fromPlayer && fromPlayer !== rendered) {
            return { url: fromPlayer, source: 'player-response' };
        }
        const fromOEmbed = typeof sources.oEmbedThumbnailUrl === 'string'
            ? sources.oEmbedThumbnailUrl
            : null;
        if (fromOEmbed && parseThumbnailUrl(fromOEmbed) && fromOEmbed !== rendered) {
            return { url: fromOEmbed, source: 'oembed' };
        }
        const canonical = canonicalThumbnailUrl(rendered);
        if (canonical && canonical !== rendered) {
            return { url: canonical, source: 'canonical-url' };
        }
        return null;
    }

    Object.assign(core, {
        buildOEmbedUrl,
        canonicalThumbnailUrl,
        isSameThumbnail,
        parseOEmbedMetadata,
        parseThumbnailUrl,
        pickPlayerResponseThumbnail,
        resolveOriginalThumbnail,
        YOUTUBE_OEMBED_ENDPOINT: OEMBED_ENDPOINT
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildOEmbedUrl,
            canonicalThumbnailUrl,
            isSameThumbnail,
            parseOEmbedMetadata,
            parseThumbnailUrl,
            pickPlayerResponseThumbnail,
            resolveOriginalThumbnail,
            YOUTUBE_OEMBED_ENDPOINT: OEMBED_ENDPOINT
        };
    }
})();
