(() => {
    'use strict';

    // extension/core/original-titles.js
    //
    // Original-language titles for `antiTranslate`.
    //
    // YouTube localises a title in the card text AND in the card's `title`
    // attribute, so comparing the two (what antiTranslate used to do) only
    // ever caught older cards that left the attribute alone. The original has
    // to come from a source that names it:
    //
    //   1. oEMBED: `GET https://www.youtube.com/oembed?url=<watch url>`. Same
    //      origin, no cookies, and its `title` is the uploader's own. Its
    //      `author_url` names the channel, so a record is only accepted when
    //      both look like YouTube's.
    //   2. PLAYER `videoDetails`: oEmbed answers 401 for a video whose embedding
    //      is off. A bounded number of those fall back to `youtubei/v1/player`
    //      with the client version the page itself runs. No `hl` is sent, but
    //      that isn't treated as a promise of the original language: the
    //      feature only writes a title that differs from what's shown and
    //      belongs to the same video id.
    //
    // A feed can surface hundreds of cards, and yt-anti-translate#193 is what
    // an unbounded lookup per card does to YouTube's rate limit. So lookups go
    // through one resolver with a bounded cache, a bounded queue, a fixed
    // number in flight, a capped retry for transient failures and a hard cap
    // on player fallbacks. A navigation drops queued work; teardown aborts
    // everything.
    //
    // Everything except the resolver's fetch calls is pure. The DOM side lives
    // in the feature in ytkit.js.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.createOriginalTitleResolver) return;

    const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
    const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
    const HANDLE_PATTERN = /^@[A-Za-z0-9._-]{3,30}$/;
    const YOUTUBE_HOST_PATTERN = /^(?:www\.|m\.)?youtube\.com$/i;
    const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
    const OEMBED_MAX_BYTES = 8 * 1024;
    // A player response is large, but not this large.
    const PLAYER_MAX_BYTES = 4 * 1024 * 1024;
    const MAX_TITLE_CHARS = 500;
    const MAX_CHANNEL_EXCEPTIONS = 500;

    function isVideoId(value) {
        return typeof value === 'string' && VIDEO_ID_PATTERN.test(value);
    }

    function isChannelId(value) {
        return typeof value === 'string' && CHANNEL_ID_PATTERN.test(value);
    }

    function buildTitleOEmbedUrl(videoId) {
        if (!isVideoId(videoId)) return null;
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        return `${OEMBED_ENDPOINT}?url=${encodeURIComponent(watchUrl)}&format=json`;
    }

    function cleanTitle(value) {
        if (typeof value !== 'string') return '';
        const title = value.replace(/\s+/g, ' ').trim();
        return title.length > MAX_TITLE_CHARS ? '' : title;
    }

    // YouTube's own channel URL forms only. Anything else in `author_url`
    // means the answer isn't the oEmbed document this expects.
    function parseChannelUrl(raw) {
        if (typeof raw !== 'string' || !raw || raw.length > 300) return null;
        let url;
        try {
            url = new URL(raw);
        } catch {
            return null;
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (!YOUTUBE_HOST_PATTERN.test(url.hostname)) return null;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length < 1 || parts.length > 2) return null;
        const head = decodeURIComponentSafe(parts[0]);
        if (head === 'channel' && parts.length === 2 && isChannelId(parts[1])) {
            return { url: url.href, channelId: parts[1], handle: null };
        }
        if (parts.length === 1 && HANDLE_PATTERN.test(head)) {
            return { url: url.href, channelId: null, handle: head.toLowerCase() };
        }
        if ((head === 'c' || head === 'user') && parts.length === 2 && /^[A-Za-z0-9._-]{1,100}$/.test(parts[1])) {
            return { url: url.href, channelId: null, handle: null };
        }
        return null;
    }

    function decodeURIComponentSafe(value) {
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    function parseJsonBounded(payload, maxBytes) {
        if (typeof payload !== 'string') return payload;
        if (payload.length > maxBytes) return null;
        try {
            return JSON.parse(payload);
        } catch {
            return null;
        }
    }

    // { title, authorUrl, channelId, handle } or null.
    function parseOEmbedTitle(payload) {
        const json = parseJsonBounded(payload, OEMBED_MAX_BYTES);
        if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
        const title = cleanTitle(json.title);
        const channel = parseChannelUrl(json.author_url);
        if (!title || !channel) return null;
        return { title, authorUrl: channel.url, channelId: channel.channelId, handle: channel.handle };
    }

    // { title, channelId } from a player response for exactly this video.
    function parsePlayerTitle(payload, videoId) {
        const json = parseJsonBounded(payload, PLAYER_MAX_BYTES);
        const details = json && typeof json === 'object' ? json.videoDetails : null;
        if (!details || typeof details !== 'object' || details.videoId !== videoId) return null;
        const title = cleanTitle(details.title);
        if (!title) return null;
        return { title, channelId: isChannelId(details.channelId) ? details.channelId : null };
    }

    // One channel per line (or comma). A bare UC id and a /channel/ URL both
    // count. Handles don't: they can be renamed and reused, and resolving one
    // would cost a request per exception, so only the canonical id is kept.
    function parseChannelExceptions(text) {
        const out = [];
        const seen = new Set();
        for (const piece of String(text || '').split(/[\n,]+/)) {
            const entry = piece.trim();
            if (!entry) continue;
            let channelId = isChannelId(entry) ? entry : null;
            if (!channelId) channelId = parseChannelUrl(entry)?.channelId || null;
            if (!channelId || seen.has(channelId)) continue;
            seen.add(channelId);
            out.push(channelId);
            if (out.length >= MAX_CHANNEL_EXCEPTIONS) break;
        }
        return out;
    }

    function normalizeForCompare(value) {
        return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    }

    function titlesDiffer(displayed, original) {
        const a = normalizeForCompare(displayed);
        const b = normalizeForCompare(original);
        return Boolean(a && b && a !== b);
    }

    const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

    function isAbort(error) {
        return error?.name === 'AbortError';
    }

    /**
     * The bounded lookup queue.
     *
     * request(videoId) resolves to { title, channelId, handle, source } or
     * null. It never rejects. peek(videoId) answers from the cache without a
     * request: a record, null for a settled miss, or undefined when nothing is
     * known (or a retry is due).
     */
    function createOriginalTitleResolver(options = {}) {
        const fetchImpl = options.fetch;
        const buildPlayerRequest = typeof options.buildPlayerRequest === 'function'
            ? options.buildPlayerRequest
            : () => null;
        const maxCache = Math.max(1, Number(options.maxCache) || 500);
        const maxConcurrent = Math.max(1, Number(options.maxConcurrent) || 3);
        const maxQueue = Math.max(1, Number(options.maxQueue) || 60);
        const maxPlayerFallbacks = Math.max(0, Number.isFinite(options.maxPlayerFallbacks) ? options.maxPlayerFallbacks : 20);
        const maxAttempts = Math.max(1, Number(options.maxAttempts) || 2);
        const retryDelayMs = Math.max(0, Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 30000);
        const timeoutMs = Math.max(1, Number(options.timeoutMs) || 8000);
        const now = typeof options.now === 'function' ? options.now : () => Date.now();
        const log = typeof options.log === 'function' ? options.log : () => {};
        const setTimer = options.setTimeout || setTimeout;
        const clearTimer = options.clearTimeout || clearTimeout;

        // videoId -> { record } | { record: null } | { retryAt, attempts }
        const cache = new Map();
        const waiting = new Map();
        const queue = [];
        const controllers = new Set();
        let active = 0;
        let playerFallbacks = 0;
        let closed = false;

        function remember(videoId, entry) {
            cache.delete(videoId);
            cache.set(videoId, entry);
            while (cache.size > maxCache) cache.delete(cache.keys().next().value);
        }

        function peek(videoId) {
            const entry = cache.get(videoId);
            if (!entry) return undefined;
            if ('record' in entry) return entry.record;
            return undefined;
        }

        function attemptsSoFar(videoId) {
            const entry = cache.get(videoId);
            return entry && !('record' in entry) ? entry.attempts : 0;
        }

        function retryDue(videoId) {
            const entry = cache.get(videoId);
            return !entry || 'record' in entry || now() >= entry.retryAt;
        }

        // The timer covers the body too: a server that sends headers and
        // then stalls would otherwise hold a slot forever.
        async function timedFetch(url, init, consume) {
            const controller = new AbortController();
            controllers.add(controller);
            let timedOut = false;
            const timer = setTimer(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
            try {
                const response = await fetchImpl(url, { ...init, signal: controller.signal });
                return await consume(response);
            } catch (error) {
                // A timeout is a failed attempt like any other. Only close()
                // aborts without saying anything about the video.
                if (timedOut && isAbort(error)) throw new Error(`timed out after ${timeoutMs} ms`);
                throw error;
            } finally {
                clearTimer(timer);
                controllers.delete(controller);
            }
        }

        async function readBounded(response, maxBytes) {
            const declared = Number(response.headers?.get?.('content-length'));
            if (Number.isFinite(declared) && declared > maxBytes) return null;
            const text = await response.text();
            return text.length > maxBytes ? null : text;
        }

        async function viaPlayer(videoId) {
            if (playerFallbacks >= maxPlayerFallbacks) return { record: null };
            const request = buildPlayerRequest(videoId);
            if (!request?.url) return { record: null };
            playerFallbacks += 1;
            return timedFetch(request.url, request.init || {}, async (response) => {
                if (TRANSIENT_STATUS.has(response.status)) return { transient: true };
                if (!response.ok) return { record: null };
                const parsed = parsePlayerTitle(await readBounded(response, PLAYER_MAX_BYTES), videoId);
                return { record: parsed ? { ...parsed, handle: null, source: 'player' } : null };
            });
        }

        async function lookup(videoId) {
            const url = buildTitleOEmbedUrl(videoId);
            if (!url || typeof fetchImpl !== 'function') return { record: null };
            const outcome = await timedFetch(url, { credentials: 'omit', cache: 'force-cache' }, async (response) => {
                if (response.status === 401 || response.status === 403) return { embeddingOff: true };
                if (TRANSIENT_STATUS.has(response.status)) return { transient: true };
                if (!response.ok) return { record: null };
                const parsed = parseOEmbedTitle(await readBounded(response, OEMBED_MAX_BYTES));
                return { record: parsed ? { ...parsed, source: 'oembed' } : null };
            });
            // The fallback gets its own timer, not what is left of this one.
            return outcome.embeddingOff ? viaPlayer(videoId) : outcome;
        }

        function settle(videoId, value) {
            const resolvers = waiting.get(videoId) || [];
            waiting.delete(videoId);
            for (const resolve of resolvers) resolve(value);
        }

        async function run(videoId) {
            active += 1;
            try {
                const outcome = await lookup(videoId);
                if (closed) return settle(videoId, null);
                if (outcome.transient) {
                    const attempts = attemptsSoFar(videoId) + 1;
                    if (attempts >= maxAttempts) remember(videoId, { record: null });
                    else remember(videoId, { attempts, retryAt: now() + retryDelayMs * attempts });
                    return settle(videoId, null);
                }
                remember(videoId, { record: outcome.record });
                settle(videoId, outcome.record);
            } catch (error) {
                if (!closed && !isAbort(error)) {
                    // Offline or a refused request: worth one more try later,
                    // never one per mutation tick.
                    const attempts = attemptsSoFar(videoId) + 1;
                    if (attempts >= maxAttempts) remember(videoId, { record: null });
                    else remember(videoId, { attempts, retryAt: now() + retryDelayMs * attempts });
                    log(`title lookup failed for ${videoId}: ${error?.message || error}`);
                }
                // close() aborting says nothing about the video, so nothing
                // is cached.
                settle(videoId, null);
            } finally {
                active -= 1;
                pump();
            }
        }

        function pump() {
            while (!closed && active < maxConcurrent && queue.length) run(queue.shift());
        }

        function request(videoId) {
            if (closed || !isVideoId(videoId)) return Promise.resolve(null);
            const known = peek(videoId);
            if (known !== undefined) return Promise.resolve(known);
            if (!retryDue(videoId)) return Promise.resolve(null);
            if (waiting.has(videoId)) {
                return new Promise((resolve) => waiting.get(videoId).push(resolve));
            }
            // Full: say nothing now. The card is asked about again on a later
            // pass, once the queue has drained.
            if (queue.length >= maxQueue) return Promise.resolve(null);
            return new Promise((resolve) => {
                waiting.set(videoId, [resolve]);
                queue.push(videoId);
                pump();
            });
        }

        // A navigation: what hasn't started is for a page nobody is on.
        function cancelPending() {
            const dropped = queue.splice(0, queue.length);
            for (const videoId of dropped) settle(videoId, null);
            return dropped.length;
        }

        function close() {
            closed = true;
            cancelPending();
            for (const controller of controllers) controller.abort();
            controllers.clear();
            cache.clear();
        }

        function stats() {
            return { cached: cache.size, active, queued: queue.length, playerFallbacks, closed };
        }

        return { request, peek, cancelPending, close, stats };
    }

    const api = {
        buildTitleOEmbedUrl,
        createOriginalTitleResolver,
        isChannelId,
        parseChannelExceptions,
        parseChannelUrl,
        parseOEmbedTitle,
        parsePlayerTitle,
        titlesDiffer
    };

    Object.assign(core, api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
