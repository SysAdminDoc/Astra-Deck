(() => {
    'use strict';

    const HIDDEN_ATTRIBUTE = 'data-ytkit-search-hygiene-hidden';
    const ROOT_FALLBACK = [
        'ytd-search[page-subtype="search"]',
        'ytd-two-column-search-results-renderer[is-search]',
        'ytd-search'
    ];
    const SHELF_SELECTORS = [
        'ytd-shelf-renderer',
        'ytd-reel-shelf-renderer',
        'ytd-rich-shelf-renderer',
        'ytd-horizontal-card-list-renderer',
        'ytd-brand-video-shelf-renderer',
        'ytd-destination-shelf-renderer',
        'ytd-hashtag-grid-shelf-renderer'
    ].join(', ');
    const RELATED_SELECTOR = 'yt-related-chip-cloud-renderer';
    const RELATED_CONTAINER_SELECTOR = [
        'ytd-horizontal-card-list-renderer',
        'ytd-shelf-renderer',
        'ytd-rich-shelf-renderer'
    ].join(', ');
    const RESULT_SELECTOR = 'ytd-video-renderer, yt-lockup-view-model';
    const WATCHED_MARKER_SELECTOR = [
        'ytd-thumbnail-overlay-resume-playback-renderer',
        '.ytThumbnailOverlayProgressBarHostWatchedProgressBar',
        '[is-watched]'
    ].join(', ');
    const RECOMMENDATION_SELECTOR = [
        'ytd-compact-channel-recommendation-card-renderer',
        'ytd-channel-recommendation-card-renderer'
    ].join(', ');
    // Structural hook first: YouTube stamps reason rows with a
    // data-content-type marker that is locale-independent. The English
    // phrase regex below is only a fallback for surfaces that render the
    // reason as plain metadata text without the marker.
    const STRUCTURAL_REASON_SELECTOR = '[data-content-type="recommendation-reason"]';
    const REASON_SELECTOR = [
        'ytd-badge-supported-renderer',
        '#metadata-line',
        '.metadata-snippet-text'
    ].join(', ');
    const RECOMMENDATION_REASON = /\b(?:recommended for you|because you watched|people also watched|previously watched)\b/i;

    function queryAll(root, selector) {
        try { return Array.from(root?.querySelectorAll?.(selector) || []); }
        catch { return []; }
    }

    function hasDescendant(node, selector) {
        try { return Boolean(node?.querySelector?.(selector)); }
        catch { return false; }
    }

    function isWatchedOrRecommended(node) {
        if (!node) return false;
        if (hasDescendant(node, WATCHED_MARKER_SELECTOR)) return true;
        if (hasDescendant(node, STRUCTURAL_REASON_SELECTOR)) return true;
        return queryAll(node, REASON_SELECTOR).some((reason) =>
            RECOMMENDATION_REASON.test(String(reason?.textContent || '').slice(0, 400))
        );
    }

    function createSearchHygieneFeatures(deps = {}) {
        const {
            isSearchPagePath = () => false,
            addMutationRule = () => {},
            removeMutationRule = () => {},
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            injectStyle = () => null,
            getSurfaceSelectorChain = () => [],
            documentRef = globalThis.document,
            schedule = (callback) => queueMicrotask(callback)
        } = deps;

        const activeModes = new Set();
        let styleElement = null;
        let scheduled = false;
        let running = false;

        function roots() {
            const selectors = getSurfaceSelectorChain('searchResults');
            const chain = Array.isArray(selectors) && selectors.length ? selectors : ROOT_FALLBACK;
            const matches = [];
            const seen = new Set();
            for (const selector of chain) {
                for (const node of queryAll(documentRef, selector)) {
                    if (seen.has(node)) continue;
                    seen.add(node);
                    matches.push(node);
                }
            }
            return matches;
        }

        function restoreAll() {
            for (const node of queryAll(documentRef, `[${HIDDEN_ATTRIBUTE}]`)) {
                node.removeAttribute?.(HIDDEN_ATTRIBUTE);
            }
        }

        function mark(modeMap, node, mode) {
            if (!node) return;
            if (!modeMap.has(node)) modeMap.set(node, new Set());
            modeMap.get(node).add(mode);
        }

        function scan() {
            scheduled = false;
            if (!activeModes.size || !isSearchPagePath()) {
                restoreAll();
                return;
            }
            const searchRoots = roots();
            if (!searchRoots.length) {
                restoreAll();
                return;
            }

            const modeMap = new Map();
            for (const root of searchRoots) {
                if (activeModes.has('related')) {
                    for (const related of queryAll(root, RELATED_SELECTOR)) {
                        const container = related.closest?.(RELATED_CONTAINER_SELECTOR) || related;
                        mark(modeMap, container, 'related');
                    }
                }

                if (activeModes.has('shelves')) {
                    for (const shelf of queryAll(root, SHELF_SELECTORS)) {
                        if (hasDescendant(shelf, RELATED_SELECTOR)) continue;
                        mark(modeMap, shelf, 'shelves');
                    }
                }

                if (activeModes.has('interleaves')) {
                    for (const recommendation of queryAll(root, RECOMMENDATION_SELECTOR)) {
                        mark(modeMap, recommendation, 'interleaves');
                    }
                    for (const result of queryAll(root, RESULT_SELECTOR)) {
                        if (isWatchedOrRecommended(result)) mark(modeMap, result, 'interleaves');
                    }
                }
            }

            for (const node of queryAll(documentRef, `[${HIDDEN_ATTRIBUTE}]`)) {
                const modes = modeMap.get(node);
                if (modes) node.setAttribute?.(HIDDEN_ATTRIBUTE, Array.from(modes).sort().join(','));
                else node.removeAttribute?.(HIDDEN_ATTRIBUTE);
            }
            for (const [node, modes] of modeMap) {
                node.setAttribute?.(HIDDEN_ATTRIBUTE, Array.from(modes).sort().join(','));
            }
        }

        function queueScan() {
            if (scheduled) return;
            scheduled = true;
            schedule(scan);
        }

        function start() {
            if (running) return;
            running = true;
            styleElement = injectStyle(
                `[${HIDDEN_ATTRIBUTE}] { display: none !important; }`,
                'searchHygiene',
                true
            );
            addMutationRule('searchHygiene', queueScan);
            addNavigateRule('searchHygiene', queueScan);
        }

        function stop() {
            if (!running) return;
            running = false;
            scheduled = false;
            removeMutationRule('searchHygiene');
            removeNavigateRule('searchHygiene');
            restoreAll();
            styleElement?.remove?.();
            styleElement = null;
        }

        function enable(mode) {
            activeModes.add(mode);
            start();
            scan();
        }

        function disable(mode) {
            activeModes.delete(mode);
            if (!activeModes.size) stop();
            else scan();
        }

        function feature(id, name, description, mode, icon) {
            return {
                id,
                name,
                description,
                group: 'Content',
                icon,
                init() { enable(mode); },
                destroy() { disable(mode); }
            };
        }

        const features = [
            feature(
                'searchHideUnrelatedShelves',
                'Hide Unrelated Search Shelves',
                'Keep direct video, channel, and playlist results while hiding unrelated search-page shelves.',
                'shelves',
                'layout-list'
            ),
            feature(
                'searchHideRelatedSearches',
                'Hide Related Search Blocks',
                'Hide related-search chip blocks without removing filters, corrections, or direct results.',
                'related',
                'search-x'
            ),
            feature(
                'searchHideWatchedRecommended',
                'Hide Watched and Recommended Results',
                'Hide watched-progress results and recommendation interleaves from YouTube search.',
                'interleaves',
                'eye-off'
            )
        ];

        Object.defineProperty(features, '_controller', {
            value: { scan, queueScan, restoreAll, getActiveModes: () => [...activeModes] },
            enumerable: false
        });
        return features;
    }

    const ns = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    ns.createSearchHygieneFeatures = createSearchHygieneFeatures;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            HIDDEN_ATTRIBUTE,
            RECOMMENDATION_REASON,
            createSearchHygieneFeatures,
            isWatchedOrRecommended
        };
    }
})();
