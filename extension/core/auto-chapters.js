(() => {
    'use strict';

    // Hide AI Chapters: the decision half.
    //
    // YouTube adds auto-generated ("AI") chapters to videos after upload. A
    // watch response that carries them has an engagement panel with the id
    // below, an AUTO_CHAPTERS entry in the player bar's markersMap, marker
    // entity keys whose protobuf names AUTO_CHAPTERS, and chips and
    // description cards that open that panel. This takes all of that out of
    // a `next` / `get_watch` / ytInitialData response and leaves creator
    // chapters, the heatmap and everything else as it was.
    //
    // A response without the auto-chapters panel is returned untouched, which
    // is the guard that keeps creator chapters safe. The shape follows Control
    // Panel for YouTube's removeAutoChapters (2026-10-08).
    //
    // ytkit-main.js owns the JSON.parse hook and the bridge; this file only
    // decides, so it is tested against captured shapes with no page involved.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.removeAutoChapters) return;

    const PANEL_ID = 'engagement-panel-macro-markers-auto-chapters';
    const MARKER_KEY = 'AUTO_CHAPTERS';
    const MAX_COMMAND_DEPTH = 8;

    function isAutoChapterPanel(panel) {
        const renderer = panel && panel.engagementPanelSectionListRenderer;
        return Boolean(renderer && (renderer.panelIdentifier === PANEL_ID || renderer.targetId === PANEL_ID));
    }

    function targetsAutoChapterPanel(command, depth = 0) {
        if (!command || typeof command !== 'object' || depth > MAX_COMMAND_DEPTH) return false;
        if (command.updateEngagementPanelContentCommand?.contentSourcePanelIdentifier?.tag === PANEL_ID) return true;
        if (command.changeEngagementPanelVisibilityAction?.targetId === PANEL_ID) return true;
        if (command.showEngagementPanelEndpoint?.panelIdentifier === PANEL_ID) return true;
        const commands = command.commandExecutorCommand?.commands;
        return Array.isArray(commands) && commands.some((inner) => targetsAutoChapterPanel(inner, depth + 1));
    }

    // Entity keys are URL-encoded base64url protobufs; the marker type is a
    // plain string inside them.
    function decodeEntityKey(key) {
        if (typeof key !== 'string' || !key || typeof globalThis.atob !== 'function') return '';
        try {
            const base64 = decodeURIComponent(key).replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            return globalThis.atob(padded);
        } catch (error) {
            return '';
        }
    }

    function isAutoChapterKey(key) {
        return decodeEntityKey(key).includes(MARKER_KEY);
    }

    // Filters object[key] in place and returns how many entries went.
    function dropEntries(object, key, shouldDrop) {
        const list = object && object[key];
        if (!Array.isArray(list)) return 0;
        const kept = list.filter((entry) => !shouldDrop(entry));
        const removed = list.length - kept.length;
        if (removed) object[key] = kept;
        return removed;
    }

    /** The `next`-shaped object inside any watch response, or null. */
    function findWatchResponse(value) {
        if (!value || typeof value !== 'object') return null;
        if (Array.isArray(value.engagementPanels)) return value;
        // get_watch answers with an array whose first part holds the response.
        if (Array.isArray(value)) {
            for (const part of value.slice(0, 4)) {
                if (part && typeof part === 'object' && Array.isArray(part.response?.engagementPanels)) return part.response;
            }
        }
        return null;
    }

    function emptyReport() {
        return { changed: false, markers: 0, panels: 0, entityKeys: 0, mutations: 0, chips: 0, cards: 0, actionButton: false, playerBar: false };
    }

    /**
     * Take the auto-generated chapters out of a watch response, in place.
     * Returns what it removed; `changed` is false when there was nothing.
     */
    function removeAutoChapters(value) {
        const report = emptyReport();
        const data = findWatchResponse(value);
        if (!data || !data.engagementPanels.some(isAutoChapterPanel)) return report;

        // Player bar markers and its "chapters" action button.
        const overlay = data.playerOverlays?.playerOverlayRenderer;
        const decoratedBar = overlay?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer;
        const markers = decoratedBar?.playerBar?.multiMarkersPlayerBarRenderer;
        report.markers = dropEntries(markers, 'markersMap', (marker) => marker?.key === MARKER_KEY);
        if (markers?.visibleOnLoad?.key === MARKER_KEY) {
            delete markers.visibleOnLoad;
            report.markers += 1;
        }
        if (report.markers && Array.isArray(markers?.markersMap) && markers.markersMap.length === 0) {
            // Nothing but AI chapters on the bar: drop the decorated bar so
            // YouTube falls back to the plain one.
            delete overlay.decoratedPlayerBarRenderer;
            report.playerBar = true;
        } else if (targetsAutoChapterPanel(decoratedBar?.playerBarActionButton?.buttonRenderer?.command)) {
            delete decoratedBar.playerBarActionButton;
            delete decoratedBar.buttonType;
            report.actionButton = true;
        }

        // Marker loading and entity updates.
        for (const endpoint of Array.isArray(data.onResponseReceivedEndpoints) ? data.onResponseReceivedEndpoints : []) {
            const command = endpoint?.loadMarkersCommand;
            report.entityKeys += dropEntries(command, 'entityKeys', isAutoChapterKey);
            report.entityKeys += dropEntries(command, 'visibleOnLoadKeys', isAutoChapterKey);
        }
        report.mutations = dropEntries(data.frameworkUpdates?.entityBatchUpdate, 'mutations',
            (mutation) => isAutoChapterKey(mutation?.entityKey));

        // The panel itself, the chip that switches to it, and the description
        // card that opens it.
        report.panels = dropEntries(data, 'engagementPanels', isAutoChapterPanel);
        for (const panel of data.engagementPanels) {
            const renderer = panel?.engagementPanelSectionListRenderer;
            const chipBar = renderer?.header?.engagementPanelTitleHeaderRenderer?.subheader?.chipBarViewModel;
            report.chips += dropEntries(chipBar, 'chips',
                (chip) => targetsAutoChapterPanel(chip?.chipViewModel?.tapCommand?.innertubeCommand));
            const description = renderer?.content?.structuredDescriptionContentRenderer;
            report.cards += dropEntries(description, 'items', (item) => targetsAutoChapterPanel(
                item?.horizontalCardListRenderer?.header?.richListHeaderRenderer?.navigationButton?.buttonRenderer?.command
            ));
        }

        report.changed = Boolean(report.markers || report.panels || report.entityKeys || report.mutations
            || report.chips || report.cards || report.actionButton || report.playerBar);
        return report;
    }

    Object.assign(core, {
        removeAutoChapters,
        autoChapters: Object.freeze({ PANEL_ID, MARKER_KEY, findWatchResponse, isAutoChapterKey, isAutoChapterPanel, targetsAutoChapterPanel })
    });

    // Page-world script: gate the CommonJS export on the Node runtime, which a
    // page can't fake (same rule as core/audio-track.js).
    const inNodeTests = typeof process !== 'undefined'
        && !!process.versions
        && typeof process.versions.node === 'string';
    if (inNodeTests && typeof module !== 'undefined' && module.exports) {
        module.exports = { removeAutoChapters, findWatchResponse, isAutoChapterKey, isAutoChapterPanel, targetsAutoChapterPanel, PANEL_ID, MARKER_KEY };
    }
})();
