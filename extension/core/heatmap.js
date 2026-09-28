(() => {
    'use strict';

    // extension/core/heatmap.js
    //
    // v4.68.0 — YouTube's "most replayed" heatmap, which the player response
    // already carries and Astra Deck was throwing away.
    //
    // Two shapes exist in the wild and both are handled, because which one
    // arrives depends on the page and on whichever A/B bucket the session
    // landed in:
    //
    //   1. Player response, entity batch:
    //      frameworkUpdates.entityBatchUpdate.mutations[]
    //        .payload.macroMarkersListEntity.markersList
    //        { markerType: 'MARKER_TYPE_HEATMAP',
    //          markers: [{ startMillis, durationMillis,
    //                      intensityScoreNormalized }] }
    //
    //   2. Initial data, decorated player bar:
    //      playerOverlays.decoratedPlayerBarRenderer.playerBar
    //        .multiMarkersPlayerBarRenderer.markersMap[]
    //        .value.heatmap.heatmapRenderer.heatMarkers[]
    //        { heatMarkerRenderer: { timeRangeStartMillis,
    //                                markerDurationMillis,
    //                                heatMarkerIntensityScoreNormalized } }
    //
    // Everything here is pure: given a parsed object it returns plain data.
    // No DOM, no player, no settings — the features in ytkit.js own all of
    // that, and this module can be exercised against captured JSON.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.parseHeatmapMarkers) return;

    // A heatmap is ~100 markers. Anything far beyond that is a malformed or
    // hostile payload, not a video, and must not be walked.
    const MAX_MARKERS = 512;
    // Below this many markers the curve is too coarse to steer playback with,
    // and "most replayed" would just mean "the first third of the video".
    const MIN_USEFUL_MARKERS = 4;

    function finiteNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function normalizeMarker(startMillis, durationMillis, intensity) {
        const start = finiteNumber(startMillis);
        const duration = finiteNumber(durationMillis);
        const score = finiteNumber(intensity);
        if (start === null || start < 0) return null;
        if (duration === null || duration <= 0) return null;
        if (score === null) return null;
        return {
            startSeconds: start / 1000,
            durationSeconds: duration / 1000,
            // YouTube emits 0..1 but has shipped out-of-range values before;
            // clamping here keeps every consumer from having to.
            intensity: Math.min(1, Math.max(0, score))
        };
    }

    function fromEntityBatch(playerResponse) {
        const mutations = playerResponse?.frameworkUpdates?.entityBatchUpdate?.mutations;
        if (!Array.isArray(mutations)) return [];
        for (const mutation of mutations) {
            const list = mutation?.payload?.macroMarkersListEntity?.markersList;
            if (!list || list.markerType !== 'MARKER_TYPE_HEATMAP') continue;
            const markers = Array.isArray(list.markers) ? list.markers : [];
            const out = [];
            for (const marker of markers.slice(0, MAX_MARKERS)) {
                const normalized = normalizeMarker(
                    marker?.startMillis,
                    marker?.durationMillis,
                    marker?.intensityScoreNormalized
                );
                if (normalized) out.push(normalized);
            }
            if (out.length) return out;
        }
        return [];
    }

    function fromDecoratedPlayerBar(initialData) {
        const markersMap = initialData?.playerOverlays?.decoratedPlayerBarRenderer
            ?.playerBar?.multiMarkersPlayerBarRenderer?.markersMap;
        if (!Array.isArray(markersMap)) return [];
        for (const entry of markersMap) {
            const heatMarkers = entry?.value?.heatmap?.heatmapRenderer?.heatMarkers;
            if (!Array.isArray(heatMarkers)) continue;
            const out = [];
            for (const marker of heatMarkers.slice(0, MAX_MARKERS)) {
                const renderer = marker?.heatMarkerRenderer;
                const normalized = normalizeMarker(
                    renderer?.timeRangeStartMillis,
                    renderer?.markerDurationMillis,
                    renderer?.heatMarkerIntensityScoreNormalized
                );
                if (normalized) out.push(normalized);
            }
            if (out.length) return out;
        }
        return [];
    }

    // `source` may be a player response, an initial-data object, or both
    // merged — callers hand over whatever they have and this picks the shape
    // that is actually present.
    function parseHeatmapMarkers(source) {
        if (!source || typeof source !== 'object') return [];
        const markers = fromEntityBatch(source);
        const resolved = markers.length ? markers : fromDecoratedPlayerBar(source);
        if (resolved.length < MIN_USEFUL_MARKERS) return [];
        return resolved.sort((a, b) => a.startSeconds - b.startSeconds);
    }

    // Which video a payload describes. The inline payloads are written once at
    // hard load, and after YouTube's in-page navigation they still describe
    // the video you came from.
    function heatmapPayloadVideoId(source) {
        if (!source || typeof source !== 'object') return '';
        const direct = source.videoDetails?.videoId
            || source.currentVideoEndpoint?.watchEndpoint?.videoId;
        if (typeof direct === 'string' && direct) return direct;
        const mutations = source.frameworkUpdates?.entityBatchUpdate?.mutations;
        if (!Array.isArray(mutations)) return '';
        for (const mutation of mutations.slice(0, MAX_MARKERS)) {
            const id = mutation?.payload?.macroMarkersListEntity?.externalVideoId;
            if (typeof id === 'string' && id) return id;
        }
        return '';
    }

    // The curve from the first payload that is about `videoId`. A payload
    // naming another video, or none, is skipped: steering playback with the
    // previous video's curve is worse than having no curve.
    function heatmapMarkersFor(videoId, ...sources) {
        if (typeof videoId !== 'string' || !videoId) return [];
        for (const source of sources) {
            if (heatmapPayloadVideoId(source) !== videoId) continue;
            const markers = parseHeatmapMarkers(source);
            if (markers.length) return markers;
        }
        return [];
    }

    // The peak of the curve. Ties resolve to the EARLIER marker: when a video
    // has two equally-replayed moments, sending the viewer to the first one is
    // the answer that does not skip content.
    //
    // Every viewer starts at 0:00, so most curves open at full intensity and
    // fall away. On live YouTube that opening spike beat the real peak on
    // Gangnam Style (1.0 at 0:00 against 0.55 at 1:11), and the control
    // "jumped" to where the viewer already was. The opening descent is
    // skipped; if the curve never rises again, the start is the answer.
    function findMostReplayed(markers) {
        if (!Array.isArray(markers) || markers.length === 0) return null;
        let from = 0;
        while (from + 1 < markers.length && markers[from + 1].intensity <= markers[from].intensity) from += 1;
        const candidates = from < markers.length - 1 ? markers.slice(from) : markers;
        let best = null;
        for (const marker of candidates) {
            if (!best || marker.intensity > best.intensity) best = marker;
        }
        return best;
    }

    function markerAt(markers, seconds) {
        if (!Array.isArray(markers) || !Number.isFinite(seconds)) return null;
        for (const marker of markers) {
            if (seconds >= marker.startSeconds
                && seconds < marker.startSeconds + marker.durationSeconds) {
                return marker;
            }
        }
        // Past the last marker (rounding, or a live edge) the tail still counts
        // as the last region rather than as "no data" — otherwise speed would
        // snap back to base for the final second of every video.
        const last = markers[markers.length - 1];
        if (last && seconds >= last.startSeconds) return last;
        return null;
    }

    // Resolve the playback rate for a position. Returns null when there is no
    // heatmap or the position is not covered, which the caller must read as
    // "don't touch the rate" — never as "reset to 1x". A feature that cannot
    // tell must leave the user's speed alone.
    function resolveHeatmapRate(markers, seconds, options = {}) {
        const baseRate = finiteNumber(options.baseRate) || 1;
        const coldRate = finiteNumber(options.coldRate) || baseRate;
        const hotThreshold = finiteNumber(options.hotThreshold);
        const threshold = hotThreshold === null ? 0.4 : Math.min(1, Math.max(0, hotThreshold));
        const marker = markerAt(markers, seconds);
        if (!marker) return null;
        // Hot regions play at exactly the user's rate — the point is not to
        // slow anything down, it is to not make them sit through the cold
        // parts. Speeding UP a rewatched moment would be the opposite of what
        // the heatmap says.
        return marker.intensity >= threshold ? baseRate : Math.max(baseRate, coldRate);
    }

    function summarizeHeatmap(markers) {
        if (!Array.isArray(markers) || markers.length === 0) {
            return { markers: 0, peakSeconds: null, peakIntensity: 0, coveredSeconds: 0 };
        }
        const peak = findMostReplayed(markers);
        const coveredSeconds = markers.reduce((sum, marker) => sum + marker.durationSeconds, 0);
        return {
            markers: markers.length,
            peakSeconds: peak ? peak.startSeconds : null,
            peakIntensity: peak ? peak.intensity : 0,
            coveredSeconds
        };
    }

    Object.assign(core, {
        HEATMAP_MIN_MARKERS: MIN_USEFUL_MARKERS,
        findMostReplayed,
        heatmapMarkerAt: markerAt,
        heatmapMarkersFor,
        heatmapPayloadVideoId,
        parseHeatmapMarkers,
        resolveHeatmapRate,
        summarizeHeatmap
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            HEATMAP_MIN_MARKERS: MIN_USEFUL_MARKERS,
            findMostReplayed,
            heatmapMarkerAt: markerAt,
            heatmapMarkersFor,
            heatmapPayloadVideoId,
            parseHeatmapMarkers,
            resolveHeatmapRate,
            summarizeHeatmap
        };
    }
})();
