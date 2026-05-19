(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.findSurfaceElement) return;

    const SurfaceSelectors = Object.freeze({
        appShell: Object.freeze([
            'ytd-app',
            'body > ytd-app'
        ]),
        nav: Object.freeze([
            'ytd-masthead',
            '#masthead-container ytd-masthead'
        ]),
        feed: Object.freeze([
            'ytd-rich-grid-renderer',
            'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer'
        ]),
        feedCard: Object.freeze([
            'ytd-rich-item-renderer',
            'ytd-rich-grid-row ytd-rich-item-renderer'
        ]),
        thumbnail: Object.freeze([
            'a#thumbnail',
            'ytd-thumbnail a#thumbnail'
        ]),
        watch: Object.freeze([
            'ytd-watch-flexy',
            'ytd-watch-flexy[video-id]'
        ]),
        player: Object.freeze([
            '#movie_player',
            '.html5-video-player'
        ]),
        mainVideo: Object.freeze([
            'video.html5-main-video',
            '#movie_player video'
        ]),
        playerChrome: Object.freeze([
            '.ytp-chrome-bottom',
            '#movie_player .ytp-chrome-bottom'
        ]),
        playerSettings: Object.freeze([
            '.ytp-settings-menu',
            '#movie_player .ytp-panel-menu'
        ]),
        comments: Object.freeze([
            'ytd-comments#comments',
            'ytd-watch-flexy ytd-comments'
        ]),
        commentComposer: Object.freeze([
            'ytd-comment-simplebox-renderer',
            'ytd-comments ytd-comment-simplebox-renderer'
        ]),
        engagementPanels: Object.freeze([
            'ytd-engagement-panel-section-list-renderer',
            '#panels ytd-engagement-panel-section-list-renderer'
        ]),
        sidebar: Object.freeze([
            '#secondary',
            'ytd-watch-flexy #secondary'
        ]),
        modals: Object.freeze([
            'tp-yt-paper-dialog',
            'ytd-popup-container tp-yt-paper-dialog'
        ]),
        settingsOverlay: Object.freeze([
            '[data-ytkit-surface="control-center"]',
            '.ytkit-control-center'
        ]),
        profile: Object.freeze([
            'ytd-c4-tabbed-header-renderer, ytd-page-header-renderer',
            'ytd-browse[page-subtype="channels"] ytd-c4-tabbed-header-renderer'
        ]),
        notifications: Object.freeze([
            'ytd-notification-renderer',
            'ytd-multi-page-menu-renderer ytd-notification-renderer'
        ]),
        media: Object.freeze([
            'video, img, ytd-thumbnail',
            '#content video, #content img, #content ytd-thumbnail'
        ]),
        liveChatFrame: Object.freeze([
            'iframe#chatframe',
            'ytd-live-chat-frame iframe'
        ]),
        liveChat: Object.freeze([
            'yt-live-chat-app',
            'yt-live-chat-renderer'
        ])
    });

    const emittedMisses = new Set();

    function normalizeSelectorList(selectors) {
        if (!selectors) return [];
        if (typeof selectors === 'string') return selectors.trim() ? [selectors.trim()] : [];
        if (!Array.isArray(selectors)) return [];
        return selectors
            .map((selector) => String(selector || '').trim())
            .filter(Boolean);
    }

    function normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        let surface = 'custom';
        let selectors = surfaceOrSelectors;
        let options = selectorsOrOptions || {};

        if (typeof surfaceOrSelectors === 'string' && SurfaceSelectors[surfaceOrSelectors]) {
            surface = surfaceOrSelectors;
            selectors = selectorsOrOptions;
            if (!selectors || (typeof selectors === 'object' && !Array.isArray(selectors))) {
                options = selectors || {};
                selectors = SurfaceSelectors[surface];
            } else {
                options = maybeOptions || {};
            }
        } else if (Array.isArray(surfaceOrSelectors) && selectorsOrOptions && !Array.isArray(selectorsOrOptions)) {
            options = selectorsOrOptions;
        }

        return {
            surface,
            selectors: normalizeSelectorList(selectors),
            options: options || {}
        };
    }

    function emitSelectorMiss(surface, selector, error, options = {}) {
        const key = `${surface}:${selector}`;
        if (emittedMisses.has(key)) return;
        emittedMisses.add(key);
        const detail = {
            surface,
            selector,
            error: error ? String(error.message || error) : null,
            at: Date.now()
        };
        try {
            globalThis.dispatchEvent?.(new CustomEvent('ytkit-selector-miss', { detail }));
        } catch (_) {
            // CustomEvent is unavailable in some unit-test contexts.
        }
        if (options.debug) {
            console.debug('[YTKit] Selector miss:', detail);
        }
    }

    function getQueryRoot(options = {}) {
        return options.root || document;
    }

    function findSurfaceElement(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        const { surface, selectors, options } = normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions);
        const root = getQueryRoot(options);

        for (const selector of selectors) {
            try {
                const match = root.querySelector?.(selector);
                if (match) return match;
                emitSelectorMiss(surface, selector, null, options);
            } catch (error) {
                emitSelectorMiss(surface, selector, error, options);
            }
        }

        if (options.required) {
            throw new Error(`Required selector surface "${surface}" was not found.`);
        }
        return null;
    }

    function findSurfaceElements(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        const { surface, selectors, options } = normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions);
        const root = getQueryRoot(options);

        for (const selector of selectors) {
            try {
                const matches = Array.from(root.querySelectorAll?.(selector) || []);
                if (matches.length) return matches;
                emitSelectorMiss(surface, selector, null, options);
            } catch (error) {
                emitSelectorMiss(surface, selector, error, options);
            }
        }
        return [];
    }

    function waitForSurfaceElement(surfaceOrSelectors, selectorsOrOptions, maybeOptions) {
        const { surface, selectors, options } = normalizeArgs(surfaceOrSelectors, selectorsOrOptions, maybeOptions);
        const immediate = findSurfaceElement(surface, selectors, { ...options, required: false });
        if (immediate) {
            options.onFound?.(immediate);
            return Promise.resolve(immediate);
        }

        const timeout = Number.isFinite(options.timeout) ? options.timeout : 3000;
        const selector = selectors.join(', ');
        if (!selector) return Promise.resolve(null);

        if (typeof core.waitForElement === 'function') {
            let cancel = null;
            const promise = new Promise((resolve) => {
                cancel = core.waitForElement(selector, (element) => {
                    options.onFound?.(element);
                    resolve(element);
                }, timeout);
                setTimeout(() => resolve(null), timeout);
            });
            promise.cancel = () => cancel?.();
            return promise;
        }

        return new Promise((resolve) => {
            if (typeof MutationObserver !== 'function') {
                resolve(null);
                return;
            }
            const root = options.root || document.body || document.documentElement;
            if (!root) {
                resolve(null);
                return;
            }
            let observer = null;
            const timer = setTimeout(() => {
                observer?.disconnect();
                resolve(null);
            }, timeout);
            observer = new MutationObserver((records) => {
                for (const record of records) {
                    for (const node of record.addedNodes || []) {
                        if (node.nodeType !== 1) continue;
                        const found = findSurfaceElement(surface, selectors, { ...options, root: node });
                        if (found || selectors.some((candidate) => {
                            try { return node.matches?.(candidate); } catch (_) { return false; }
                        })) {
                            const element = found || node;
                            clearTimeout(timer);
                            observer.disconnect();
                            options.onFound?.(element);
                            resolve(element);
                            return;
                        }
                    }
                }
            });
            observer.observe(root, { childList: true, subtree: true });
        });
    }

    Object.assign(core, {
        SurfaceSelectors,
        normalizeSelectorList,
        findSurfaceElement,
        findSurfaceElements,
        waitForSurfaceElement
    });
})();
