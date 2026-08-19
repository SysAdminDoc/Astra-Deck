(() => {
    'use strict';

    // extension/core/feed-prefilter.js
    //
    // v4.69.0 — filter before render instead of hiding after it.
    //
    // Post-render CSS hiding is why `hideCollaborations` could hide 32 of 102
    // cards for months with no symptom: the cards were still there, still
    // counted, still in the layout, just invisible. The v4.58.1 ">25% of a
    // feed must fail open" invariant catches that class of misfire, but it is
    // a symptom guard on the wrong layer.
    //
    // This drops blocked entries out of the browse response before Polymer
    // ever builds a card from it. The interception itself lives in
    // ytkit-main.js, reusing the JSON.parse hook the forceDvr feature already
    // ships; this module is the pure decision half — response in, filtered
    // response plus a report out — so the rules can be exercised against
    // captured payloads with no page involved.
    //
    // WHAT THIS DELIBERATELY WILL NOT TOUCH
    //
    //   The player response. Autoplay, the "up next" target and the resume
    //   position are computed from it, and a removed entry there is a broken
    //   player rather than a cleaner feed.
    //
    //   Playlist item lists. `playlistVideoRenderer` / `playlistPanelVideoRenderer`
    //   entries carry positional indices that YouTube uses for "N of M",
    //   next/previous, and shuffle. Removing one silently renumbers the
    //   playlist. Blocked channels inside a playlist stay in the response and
    //   are handled by the post-render path, which can hide a card without
    //   lying to the player about what is in the list.
    //
    //   Anything when the blocklist is empty. No blocklist, no walk.
    //
    // The post-render path REMAINS as the fallback: this runs on the shapes it
    // recognises, and everything it does not recognise still reaches the DOM
    // filter exactly as before. The two together are belt and braces, not a
    // replacement.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.filterBrowseResponse) return;

    // Item-list containers YouTube uses for feeds. Anything not on this list is
    // walked but never spliced.
    const LIST_KEYS = Object.freeze(['contents', 'items', 'continuationItems', 'results']);

    // Renderers that represent one feed card we may remove.
    const REMOVABLE_RENDERERS = Object.freeze([
        'richItemRenderer',
        'videoRenderer',
        'compactVideoRenderer',
        'gridVideoRenderer',
        'reelItemRenderer',
        'videoWithContextRenderer'
    ]);

    // Renderers that must survive even when their channel is blocked, because
    // something positional depends on them.
    const PROTECTED_RENDERERS = Object.freeze([
        'playlistVideoRenderer',
        'playlistPanelVideoRenderer'
    ]);

    // Bound the walk: a browse response is deep but not unbounded, and a
    // hostile or pathological payload must not be able to spin the parser hook
    // that every JSON.parse on the page now goes through.
    const MAX_DEPTH = 24;
    const MAX_NODES = 20000;

    // Same shape of guard as the post-render path, for the same reason: a rule
    // that suddenly matches most of a feed is misfiring, and the safe direction
    // is always to show everything. It is kept here as well as post-render
    // because being at the right layer does not make a bad verdict good.
    const MAX_REMOVED_RATIO = 0.5;
    const RATIO_GUARD_MIN_ITEMS = 8;

    function normalizeChannelId(value) {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        // UC… channel id, @handle, or /c/vanity — normalised to a comparable
        // lower-case token so a blocklist entry written either way matches.
        const channelMatch = /(UC[A-Za-z0-9_-]{22})/.exec(trimmed);
        if (channelMatch) return channelMatch[1].toLowerCase();
        const handleMatch = /@([A-Za-z0-9._-]{1,60})/.exec(trimmed);
        if (handleMatch) return `@${handleMatch[1].toLowerCase()}`;
        return null;
    }

    function buildBlocklist(entries) {
        const set = new Set();
        for (const entry of Array.isArray(entries) ? entries : []) {
            const candidates = typeof entry === 'string'
                ? [entry]
                : [entry?.channelId, entry?.id, entry?.handle, entry?.url, entry?.vanity];
            for (const candidate of candidates) {
                const normalized = normalizeChannelId(candidate);
                if (normalized) set.add(normalized);
            }
        }
        return set;
    }

    // Pull every channel identity a card exposes. Cards carry the channel in
    // several places depending on surface, and a card whose identity cannot be
    // read is never removed — an unidentified card is not a match.
    function collectRendererChannelIds(renderer, out, depth = 0) {
        if (!renderer || typeof renderer !== 'object' || depth > 8) return out;
        const browseId = renderer.browseId;
        if (typeof browseId === 'string') {
            const normalized = normalizeChannelId(browseId);
            if (normalized) out.add(normalized);
        }
        const canonical = renderer.canonicalBaseUrl || renderer.url;
        if (typeof canonical === 'string') {
            const normalized = normalizeChannelId(canonical);
            if (normalized) out.add(normalized);
        }
        for (const value of Object.values(renderer)) {
            if (value && typeof value === 'object') {
                collectRendererChannelIds(value, out, depth + 1);
            }
        }
        return out;
    }

    function isProtectedItem(item) {
        if (!item || typeof item !== 'object') return true;
        return PROTECTED_RENDERERS.some((key) => item[key] && typeof item[key] === 'object');
    }

    function itemRenderer(item) {
        if (!item || typeof item !== 'object') return null;
        for (const key of REMOVABLE_RENDERERS) {
            if (item[key] && typeof item[key] === 'object') return item[key];
        }
        return null;
    }

    // Decide a single item. Returns true when it should be dropped.
    function shouldRemoveItem(item, blocklist) {
        if (isProtectedItem(item)) return false;
        const renderer = itemRenderer(item);
        if (!renderer) return false;
        const ids = collectRendererChannelIds(renderer, new Set());
        if (ids.size === 0) return false;
        for (const id of ids) {
            if (blocklist.has(id)) return true;
        }
        return false;
    }

    function filterList(list, blocklist, report) {
        const kept = [];
        const candidates = [];
        for (const item of list) {
            if (shouldRemoveItem(item, blocklist)) candidates.push(item);
            else kept.push(item);
        }
        if (candidates.length === 0) return null;
        if (list.length >= RATIO_GUARD_MIN_ITEMS
            && candidates.length / list.length > MAX_REMOVED_RATIO) {
            // Refuse rather than empty a feed. Recorded so the refusal is
            // visible instead of looking like the filter simply did nothing.
            report.refusedLists += 1;
            report.refusedItems += candidates.length;
            return null;
        }
        report.removed += candidates.length;
        return kept;
    }

    function walk(node, blocklist, report, depth) {
        if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return;
        if (report.visited >= MAX_NODES) {
            report.truncated = true;
            return;
        }
        report.visited += 1;

        if (Array.isArray(node)) {
            for (const child of node) walk(child, blocklist, report, depth + 1);
            return;
        }

        for (const key of Object.keys(node)) {
            const value = node[key];
            if (Array.isArray(value) && LIST_KEYS.includes(key)) {
                const filtered = filterList(value, blocklist, report);
                if (filtered) node[key] = filtered;
                for (const child of node[key]) walk(child, blocklist, report, depth + 1);
                continue;
            }
            if (value && typeof value === 'object') walk(value, blocklist, report, depth + 1);
        }
    }

    // A player response is identified the same way ytkit-main.js already does
    // it, so the two agree on what must never be touched.
    function isPlayerResponse(value) {
        if (!value || typeof value !== 'object') return false;
        if (value.videoDetails && typeof value.videoDetails === 'object') return true;
        return !!(value.playerResponse
            && typeof value.playerResponse === 'object'
            && value.playerResponse.videoDetails);
    }

    // Mutates `response` in place — the JSON.parse hook hands us the object the
    // page is about to use, and returning a copy would leave the original
    // rendering. Returns a report, always; `removed: 0` means it ran and found
    // nothing, which is different from not running.
    function filterBrowseResponse(response, options = {}) {
        const report = {
            applied: false,
            removed: 0,
            refusedLists: 0,
            refusedItems: 0,
            visited: 0,
            truncated: false,
            skipped: null
        };
        if (!response || typeof response !== 'object') {
            report.skipped = 'not-an-object';
            return report;
        }
        if (isPlayerResponse(response)) {
            // Autoplay and the resume position are computed from this. A
            // removed entry here is a broken player, not a cleaner feed.
            report.skipped = 'player-response';
            return report;
        }
        const blocklist = options.blocklist instanceof Set
            ? options.blocklist
            : buildBlocklist(options.blockedChannels);
        if (blocklist.size === 0) {
            report.skipped = 'empty-blocklist';
            return report;
        }
        walk(response, blocklist, report, 0);
        report.applied = report.removed > 0;
        return report;
    }

    Object.assign(core, {
        FEED_PREFILTER_MAX_REMOVED_RATIO: MAX_REMOVED_RATIO,
        buildChannelBlocklist: buildBlocklist,
        collectRendererChannelIds,
        filterBrowseResponse,
        normalizeBlockedChannelId: normalizeChannelId
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            FEED_PREFILTER_MAX_REMOVED_RATIO: MAX_REMOVED_RATIO,
            buildChannelBlocklist: buildBlocklist,
            collectRendererChannelIds,
            filterBrowseResponse,
            normalizeBlockedChannelId: normalizeChannelId
        };
    }
})();
