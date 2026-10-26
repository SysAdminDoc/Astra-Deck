(() => {
    'use strict';

    // Sort by Length: a "Length" choice in a channel's Videos sort menu.
    //
    // YouTube's channel grid sorts by Latest, Popular or Oldest and pages in
    // 30 videos at a time. Length has to see every video before it can put
    // the longest first, so picking it walks the grid's continuation tokens
    // through /youtubei/v1/browse until none is left, sorts what came back by
    // the duration badge, and hands the grid the sorted list with no
    // continuation at the end. Picking a native choice afterwards reloads the
    // grid the normal way.
    //
    // The helpers are pure and run against captured page data in the tests.
    // createChannelLengthSort owns the menu item, the chip label and the
    // grid; ytkit-main.js builds it and turns it on from the sealed bridge.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.channelLengthSort) return;

    const ITEM_ATTR = 'data-ytkit-length-sort-item';
    const MAX_PAGES = 400;
    const PAGE_RETRIES = 2;
    const SHEET_WAIT_MS = 3000;
    const SHEET_POLL_MS = 50;
    const CHANNEL_TAB_RE = /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/(?:videos|streams)\/?$/;
    const DURATION_RE = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/;
    const GRID_SELECTOR = 'ytd-browse[page-subtype="channels"] ytd-rich-grid-renderer';

    /** "1:49:16" or "3:49" in seconds; -1 for anything else (LIVE, UPCOMING, blank). */
    function parseDurationText(text) {
        const match = DURATION_RE.exec(String(text == null ? '' : text).trim());
        if (!match) return -1;
        const parts = match.slice(1).filter((part) => part !== undefined).map(Number);
        return parts.reduce((total, part) => total * 60 + part, 0);
    }

    function lockupOf(item) {
        return item && item.richItemRenderer && item.richItemRenderer.content
            && item.richItemRenderer.content.lockupViewModel;
    }

    function videoRendererOf(item) {
        return item && item.richItemRenderer && item.richItemRenderer.content
            && item.richItemRenderer.content.videoRenderer;
    }

    /** The video's length in seconds, read from its thumbnail badge; -1 when it has none. */
    function itemDuration(item) {
        const lockup = lockupOf(item);
        const overlays = lockup && lockup.contentImage && lockup.contentImage.thumbnailViewModel
            && lockup.contentImage.thumbnailViewModel.overlays;
        if (Array.isArray(overlays)) {
            for (const overlay of overlays) {
                const badges = overlay && overlay.thumbnailBottomOverlayViewModel
                    && overlay.thumbnailBottomOverlayViewModel.badges;
                if (!Array.isArray(badges)) continue;
                for (const badge of badges) {
                    const seconds = parseDurationText(badge && badge.thumbnailBadgeViewModel
                        && badge.thumbnailBadgeViewModel.text);
                    if (seconds >= 0) return seconds;
                }
            }
        }
        // The older grid shape, still served to some clients.
        const renderer = videoRendererOf(item);
        if (renderer) {
            const length = renderer.lengthText && (renderer.lengthText.simpleText
                || (Array.isArray(renderer.lengthText.runs) && renderer.lengthText.runs.map((run) => run.text).join('')));
            const seconds = parseDurationText(length);
            if (seconds >= 0) return seconds;
        }
        return -1;
    }

    function itemVideoId(item) {
        const lockup = lockupOf(item);
        if (lockup && typeof lockup.contentId === 'string') return lockup.contentId;
        const renderer = videoRendererOf(item);
        return renderer && typeof renderer.videoId === 'string' ? renderer.videoId : null;
    }

    function continuationTokenOf(item) {
        const renderer = item && item.continuationItemRenderer;
        const command = renderer && renderer.continuationEndpoint
            && renderer.continuationEndpoint.continuationCommand;
        return command && typeof command.token === 'string' && command.token ? command.token : null;
    }

    /** A grid's videos and the token for the page after them. */
    function splitContents(contents) {
        const items = [];
        let token = null;
        for (const item of Array.isArray(contents) ? contents : []) {
            if (item && item.richItemRenderer) items.push(item);
            else if (!token) token = continuationTokenOf(item);
        }
        return { items, token };
    }

    /** The grid items a browse continuation response carries. */
    function continuationItems(response) {
        const out = [];
        const actions = []
            .concat(response && Array.isArray(response.onResponseReceivedActions) ? response.onResponseReceivedActions : [])
            .concat(response && Array.isArray(response.onResponseReceivedEndpoints) ? response.onResponseReceivedEndpoints : []);
        for (const action of actions) {
            const list = (action && action.appendContinuationItemsAction && action.appendContinuationItemsAction.continuationItems)
                || (action && action.reloadContinuationItemsCommand && action.reloadContinuationItemsCommand.continuationItems);
            if (Array.isArray(list)) out.push(...list);
        }
        return out;
    }

    /** Longest first. Videos without a length go last; ties keep the channel's order. */
    function sortByLength(items) {
        return (Array.isArray(items) ? items : [])
            .map((item, index) => ({ item, index, seconds: itemDuration(item) }))
            .sort((a, b) => (b.seconds - a.seconds) || (a.index - b.index))
            .map((entry) => entry.item);
    }

    /**
     * Every video in the grid, following continuations until none is left.
     * `fetchPage(token)` resolves to a browse response. Duplicates (by video
     * id) are dropped. `complete` is false when a page failed after its
     * retries, the page cap was reached, or `isCancelled()` turned true.
     */
    async function collectAllItems({ contents, fetchPage, onProgress, isCancelled, maxPages = MAX_PAGES, retries = PAGE_RETRIES }) {
        const seen = new Set();
        const items = [];
        const add = (list) => {
            for (const item of list) {
                const id = itemVideoId(item);
                if (id) {
                    if (seen.has(id)) continue;
                    seen.add(id);
                }
                items.push(item);
            }
        };
        const first = splitContents(contents);
        add(first.items);
        let token = first.token;
        let pages = 0;
        const cancelled = () => typeof isCancelled === 'function' && isCancelled();
        while (token) {
            if (cancelled() || pages >= maxPages) return { items, complete: false, cancelled: cancelled() };
            let response = null;
            for (let attempt = 0; attempt <= retries && !response; attempt += 1) {
                try {
                    response = await fetchPage(token);
                } catch (error) {
                    response = null;
                }
                if (cancelled()) return { items, complete: false, cancelled: true };
            }
            if (!response) return { items, complete: false, cancelled: false };
            pages += 1;
            const next = splitContents(continuationItems(response));
            add(next.items);
            token = next.token;
            if (typeof onProgress === 'function') onProgress(items.length);
        }
        return { items, complete: true, cancelled: false };
    }

    function isChannelVideosPath(pathname) {
        return CHANNEL_TAB_RE.test(String(pathname || ''));
    }

    /** The grid header's sort chip when it is the Latest / Popular / Oldest menu. */
    function sortChipOf(gridData) {
        const chips = gridData && gridData.header && gridData.header.chipBarViewModel
            && gridData.header.chipBarViewModel.chips;
        if (!Array.isArray(chips)) return null;
        for (let index = 0; index < chips.length; index += 1) {
            const chip = chips[index] && chips[index].chipViewModel;
            if (!chip || chip.displayType !== 'CHIP_VIEW_MODEL_DISPLAY_TYPE_DROP_DOWN') continue;
            const sheet = chip.tapCommand && chip.tapCommand.innertubeCommand
                && chip.tapCommand.innertubeCommand.showSheetCommand;
            const listItems = sheet && sheet.panelLoadingStrategy && sheet.panelLoadingStrategy.inlineContent
                && sheet.panelLoadingStrategy.inlineContent.sheetViewModel
                && sheet.panelLoadingStrategy.inlineContent.sheetViewModel.content
                && sheet.panelLoadingStrategy.inlineContent.sheetViewModel.content.listViewModel
                && sheet.panelLoadingStrategy.inlineContent.sheetViewModel.content.listViewModel.listItems;
            const titles = (Array.isArray(listItems) ? listItems : [])
                .map((entry) => entry && entry.listItemViewModel && entry.listItemViewModel.title
                    && entry.listItemViewModel.title.content)
                .filter((title) => typeof title === 'string' && title);
            if (titles.length) return { index, titles };
        }
        return null;
    }

    function textOf(node) {
        return node && typeof node.textContent === 'string' ? node.textContent.trim() : '';
    }

    /**
     * The menu item, the chip label and the grid. Everything the page owns
     * comes in through `deps` so the browser objects stay swappable.
     */
    function createChannelLengthSort(deps) {
        const doc = deps.document;
        const win = deps.window;
        const fetchPage = deps.fetchPage;
        const setTimer = deps.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        const report = typeof deps.onStatus === 'function' ? deps.onStatus : () => {};
        let enabled = false;
        let label = 'Length';
        let run = 0;
        let pollTimer = null;
        // While a Length sort is shown: the chip's text node and what it said.
        let active = null;

        const currentPath = () => (win && win.location ? win.location.pathname : '');

        function channelGrid() {
            if (!isChannelVideosPath(currentPath())) return null;
            const grids = doc.querySelectorAll(GRID_SELECTOR);
            for (const grid of grids) {
                if (grid && grid.data && grid.offsetParent !== null) return grid;
            }
            return grids.length === 1 && grids[0].data ? grids[0] : null;
        }

        function sortChipElement(grid, chip) {
            const chips = grid.querySelectorAll('chip-bar-view-model chip-view-model');
            return chips[chip.index] || null;
        }

        function chipTextNode(chipEl) {
            return chipEl ? chipEl.querySelector('.ytChipShapeText') : null;
        }

        function showChipLabel(chipEl, text) {
            const node = chipTextNode(chipEl);
            if (!node) return;
            if (!active || active.node !== node) {
                restoreChipLabel();
                active = { node, original: node.textContent };
            }
            node.textContent = text;
        }

        function restoreChipLabel() {
            if (active && active.node && active.node.isConnected && typeof active.original === 'string') {
                active.node.textContent = active.original;
            }
            active = null;
        }

        function visibleSortList(titles) {
            const lists = doc.querySelectorAll('tp-yt-iron-dropdown yt-sheet-view-model yt-list-view-model');
            for (const list of lists) {
                if (list.offsetParent === null) continue;
                const native = list.querySelectorAll('yt-list-item-view-model');
                if (!native.length) continue;
                const texts = Array.from(native, textOf);
                if (titles.every((title) => texts.includes(title))) return list;
            }
            return null;
        }

        function buildItem(list) {
            const native = list.querySelectorAll('yt-list-item-view-model');
            const template = native[native.length - 1] && native[native.length - 1].firstElementChild;
            if (!template) return null;
            // A plain host: a cloned custom element would boot YouTube's own
            // component with no data behind it. The inner layout is plain
            // markup, so its classes give the item the native look.
            const host = doc.createElement('div');
            host.className = 'ytListItemViewModelHost';
            host.setAttribute('role', 'presentation');
            host.setAttribute(ITEM_ATTR, '');
            const body = template.cloneNode(true);
            const title = body.querySelector('.ytListItemViewModelTitle') || body.querySelector('[role="text"]');
            if (title) title.textContent = label;
            for (const extra of body.querySelectorAll('img, yt-icon, .ytListItemViewModelLeadingAccessory, .ytListItemViewModelTrailingAccessory')) {
                extra.remove();
            }
            host.appendChild(body);
            return host;
        }

        function injectInto(list) {
            const existing = list.querySelector('[' + ITEM_ATTR + ']');
            if (existing) {
                const title = existing.querySelector('.ytListItemViewModelTitle') || existing.querySelector('[role="text"]');
                if (title && title.textContent !== label) title.textContent = label;
                return true;
            }
            const item = buildItem(list);
            if (!item) return false;
            list.appendChild(item);
            // The dropdown sized itself to three items when it opened; without
            // a refit the fourth sits below its clipped edge.
            const dropdown = list.closest('tp-yt-iron-dropdown');
            try {
                if (dropdown && typeof dropdown.refit === 'function') dropdown.refit();
            } catch (error) {
                // reason: a clipped item is still in the list and still works
            }
            return true;
        }

        function stopPolling() {
            if (pollTimer !== null && typeof deps.clearTimeout === 'function') deps.clearTimeout(pollTimer);
            pollTimer = null;
        }

        function waitForSheet(titles) {
            stopPolling();
            const started = Date.now();
            const tick = () => {
                pollTimer = null;
                if (!enabled) return;
                const list = visibleSortList(titles);
                if (list && injectInto(list)) return;
                if (Date.now() - started < SHEET_WAIT_MS) pollTimer = setTimer(tick, SHEET_POLL_MS);
            };
            tick();
        }

        function closeSheet(fromNode) {
            const dropdown = fromNode && fromNode.closest && fromNode.closest('tp-yt-iron-dropdown');
            try {
                if (dropdown && typeof dropdown.close === 'function') {
                    dropdown.close();
                    return;
                }
            } catch (error) {
                // reason: Escape below closes it the way a person would
            }
            try {
                doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
            } catch (error) {
                // reason: an open menu is cosmetic; the sort still runs
            }
        }

        async function sortGrid() {
            const grid = channelGrid();
            const chip = grid && sortChipOf(grid.data);
            if (!grid || !chip) return;
            const myRun = ++run;
            const path = currentPath();
            const chipEl = sortChipElement(grid, chip);
            const stale = () => !enabled || myRun !== run || currentPath() !== path || !grid.isConnected;
            showChipLabel(chipEl, label + ' · …');
            report('loading');
            const result = await collectAllItems({
                contents: grid.data.contents,
                fetchPage,
                isCancelled: stale,
                onProgress: (count) => { if (!stale()) showChipLabel(chipEl, label + ' · ' + count + '…'); }
            });
            if (stale() || result.cancelled) return;
            const sorted = sortByLength(result.items);
            try {
                grid.data = Object.assign({}, grid.data, { contents: sorted });
            } catch (error) {
                restoreChipLabel();
                report('error');
                return;
            }
            // The grid re-renders its header too; label whichever chip is there now.
            showChipLabel(sortChipElement(grid, chip) || chipEl,
                result.complete ? label : label + ' · ' + sorted.length + '+');
            report(result.complete ? 'sorted;videos=' + sorted.length : 'partial;videos=' + sorted.length);
        }

        function onClick(event) {
            if (!enabled) return;
            const target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            const ours = target.closest('[' + ITEM_ATTR + ']');
            if (ours) {
                event.preventDefault();
                event.stopPropagation();
                closeSheet(ours);
                sortGrid();
                return;
            }
            const nativeItem = target.closest('tp-yt-iron-dropdown yt-list-item-view-model');
            if (nativeItem && active && nativeItem.parentElement
                && nativeItem.parentElement.querySelector('[' + ITEM_ATTR + ']')) {
                // A native sort: YouTube reloads the grid and names its chip.
                run += 1;
                restoreChipLabel();
                report('on');
                return;
            }
            const chipEl = target.closest('chip-bar-view-model chip-view-model');
            if (!chipEl) return;
            const grid = channelGrid();
            const chip = grid && sortChipOf(grid.data);
            if (!chip || sortChipElement(grid, chip) !== chipEl) return;
            waitForSheet(chip.titles);
        }

        function onNavigate() {
            run += 1;
            active = null;
            stopPolling();
        }

        let listening = false;
        function listen(on) {
            if (on === listening) return;
            listening = on;
            const method = on ? 'addEventListener' : 'removeEventListener';
            doc[method]('click', onClick, true);
            doc[method]('yt-navigate-start', onNavigate, false);
        }

        return {
            setEnabled(next) {
                const wasEnabled = enabled;
                enabled = Boolean(next);
                listen(enabled);
                if (wasEnabled && !enabled) {
                    run += 1;
                    stopPolling();
                    restoreChipLabel();
                    for (const item of doc.querySelectorAll('[' + ITEM_ATTR + ']')) item.remove();
                }
                report(enabled ? 'on' : 'off');
            },
            setLabel(next) {
                if (typeof next === 'string' && next.trim()) label = next.trim().slice(0, 40);
            },
            isEnabled: () => enabled,
            sortGrid
        };
    }

    const channelLengthSort = Object.freeze({
        ITEM_ATTR,
        MAX_PAGES,
        parseDurationText,
        itemDuration,
        itemVideoId,
        splitContents,
        continuationItems,
        sortByLength,
        collectAllItems,
        isChannelVideosPath,
        sortChipOf,
        createChannelLengthSort
    });
    core.channelLengthSort = channelLengthSort;

    // Page-world script: gate the CommonJS export on the Node runtime, which a
    // page can't fake (same rule as core/audio-track.js).
    const inNodeTests = typeof process !== 'undefined'
        && !!process.versions
        && typeof process.versions.node === 'string';
    if (inNodeTests && typeof module !== 'undefined' && module.exports) {
        module.exports = channelLengthSort;
    }
})();
