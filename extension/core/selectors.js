(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.findSurfaceElement && core.SurfaceSelectorMap) return;

    function freezeEntry(entry) {
        return Object.freeze({
            stable: Object.freeze([...(entry.stable || [])]),
            fallback: Object.freeze([...(entry.fallback || [])]),
            highChurn: !!entry.highChurn,
            needsFreshCapture: !!entry.needsFreshCapture,
            notes: entry.notes || ''
        });
    }

    const SurfaceSelectorMap = Object.freeze({
        appShell: freezeEntry({
            stable: ['ytd-app', 'ytd-page-manager'],
            fallback: ['body > ytd-app', 'ytd-page-manager.style-scope'],
            notes: 'Primary SPA shell. Mount observers here only until target containers exist.'
        }),
        nav: freezeEntry({
            stable: ['ytd-masthead', '#masthead-container'],
            fallback: ['ytd-masthead div.style-scope', '#masthead-container div.style-scope'],
            notes: 'Top navigation and masthead actions.'
        }),
        masthead: freezeEntry({
            stable: ['ytd-masthead', '#masthead-container'],
            fallback: ['ytd-masthead div.style-scope', '#masthead-container div.style-scope'],
            notes: 'Alias for nav so feature code can use either term.'
        }),
        search: freezeEntry({
            stable: ['yt-searchbox', 'input#search', 'form[role="search"] input'],
            fallback: ['yt-searchbox-input', 'ytd-searchbox #container.ytd-searchbox'],
            highChurn: true,
            notes: 'Prefer roles and labels where present; avoid raw wrapper classes.'
        }),
        leftNav: freezeEntry({
            stable: ['ytd-guide-renderer', 'ytd-mini-guide-renderer', 'yt-app-drawer'],
            fallback: ['ytd-mini-guide-entry-renderer.style-scope', 'ytd-guide-entry-renderer.style-scope'],
            highChurn: true,
            notes: 'Subscriptions capture has full guide; home often has mini guide.'
        }),
        feed: freezeEntry({
            stable: ['ytd-browse ytd-rich-grid-renderer', 'ytd-rich-grid-renderer'],
            fallback: ['ytd-rich-grid-renderer.style-scope', '#contents.ytd-rich-grid-renderer'],
            highChurn: true,
            notes: 'Process added nodes only; filter chips can recycle grid content without route events.'
        }),
        feedCard: freezeEntry({
            stable: ['ytd-rich-item-renderer', 'yt-lockup-view-model', 'ytd-video-renderer'],
            fallback: ['yt-lockup-view-model.ytd-rich-item-renderer', 'ytd-rich-item-renderer.style-scope'],
            highChurn: true,
            notes: 'New lockup view-model appears in current captures.'
        }),
        thumbnail: freezeEntry({
            stable: ['ytd-thumbnail', 'yt-thumbnail-view-model', 'a#thumbnail'],
            fallback: ['ytThumbnailViewModelHost', 'ytd-thumbnail a#thumbnail'],
            highChurn: true,
            notes: 'Resolve from nearest card root before querying document-wide.'
        }),
        shortsShelf: freezeEntry({
            stable: ['a[href^="/shorts"]', 'ytd-rich-shelf-renderer'],
            fallback: ['yt-thumbnail-overlay-badge-view-model', 'ytd-reel-shelf-renderer'],
            highChurn: true,
            notes: 'URL path is more stable than shelf wrapper names.'
        }),
        watch: freezeEntry({
            stable: ['ytd-watch-flexy[video-id]', 'ytd-watch-flexy', 'ytd-watch-metadata', '#below'],
            fallback: ['ytd-watch-metadata.watch-active-metadata', 'ytd-watch-flexy[flexy]'],
            highChurn: true,
            notes: 'Route state is best read from ytd-watch-flexy[video-id].'
        }),
        relatedSidebar: freezeEntry({
            stable: ['#secondary ytd-watch-next-secondary-results-renderer', 'ytd-watch-next-secondary-results-renderer'],
            fallback: ['ytd-watch-next-secondary-results-renderer.style-scope', '#related'],
            highChurn: true,
            notes: 'Related and compact cards change often; resolve section root first.'
        }),
        player: freezeEntry({
            stable: ['#movie_player', '.html5-video-player'],
            fallback: ['ytd-player #movie_player', '#player-container #movie_player'],
            highChurn: true,
            notes: 'Use window.movie_player only from the MAIN-world bridge.'
        }),
        mainVideo: freezeEntry({
            stable: ['video.html5-main-video', '#movie_player video'],
            fallback: ['video.video-stream', '.html5-video-container video'],
            highChurn: true,
            notes: 'Main media element; should stay scoped to the current player.'
        }),
        playerChrome: freezeEntry({
            stable: ['.ytp-chrome-bottom', '.ytp-right-controls', '.ytp-progress-bar', '.ytp-progress-bar-padding'],
            fallback: ['.ytp-delhi-modern .ytp-chrome-bottom', '.ytp-delhi-modern', '.ytp-overflow-panel', '.ytp-action-pill', '.ytp-actions-container'],
            highChurn: true,
            notes: 'Player redesign transition surface; keep legacy and Delhi/new-player candidates together.'
        }),
        playerSettings: freezeEntry({
            stable: ['.ytp-settings-button', '.ytp-panel', '.ytp-menuitem'],
            fallback: ['.ytp-popup', '.ytp-panel-menu', '.ytp-overflow-panel', '#movie_player .ytp-panel-menu'],
            highChurn: true,
            notes: 'Avoid forced menu opening where MAIN APIs exist.'
        }),
        comments: freezeEntry({
            stable: ['ytd-comments', 'ytd-comment-thread-renderer', 'ytd-comment-view-model'],
            fallback: ['ytd-comment-thread-renderer.style-scope', 'ytd-comment-renderer'],
            highChurn: true,
            notes: 'Keep old and new comment shapes during A/B transition.'
        }),
        commentComposer: freezeEntry({
            stable: ['ytd-comment-simplebox-renderer', 'ytd-commentbox', '#contenteditable-root'],
            fallback: ['ytd-comments ytd-comment-simplebox-renderer div.style-scope', 'ytd-comment-simplebox-renderer #placeholder-area'],
            highChurn: true,
            notes: 'Prefer structural lookup below ytd-comments.'
        }),
        engagementPanels: freezeEntry({
            stable: ['ytd-engagement-panel-section-list-renderer', '#panels ytd-engagement-panel-section-list-renderer'],
            fallback: ['ytd-engagement-panel-section-list-renderer.style-scope', 'ytd-engagement-panel-title-header-renderer'],
            highChurn: true,
            notes: 'Chapters, transcript, AI summary, and clips live here.'
        }),
        sidebar: freezeEntry({
            stable: ['#secondary', 'ytd-watch-flexy #secondary'],
            fallback: ['#secondary.style-scope', 'ytd-watch-flexy[is-two-columns_] #secondary'],
            notes: 'Watch sidebar container for related, chat, and secondary panels.'
        }),
        modals: freezeEntry({
            stable: ['tp-yt-paper-dialog', 'ytd-popup-container tp-yt-paper-dialog', 'tp-yt-iron-dropdown'],
            fallback: ['.ytp-popup', '.ytd-popup-container', 'ytd-popup-container .style-scope'],
            highChurn: true,
            notes: 'Native YouTube popups and dialogs.'
        }),
        settingsOverlay: freezeEntry({
            stable: ['[data-ytkit-surface="control-center"]', '.ytkit-control-center', '#ytkit-panel'],
            fallback: ['.ytkit-panel', '.ytkit-modal'],
            notes: 'Astra-owned UI must remain scoped and removable.'
        }),
        profile: freezeEntry({
            stable: ['ytd-video-owner-renderer', 'ytd-channel-name', '#channel-name', 'ytd-c4-tabbed-header-renderer', 'ytd-page-header-renderer'],
            fallback: ['yt-avatar-shape', 'yt-decorated-avatar-view-model', 'ytd-browse[page-subtype="channels"] ytd-c4-tabbed-header-renderer'],
            highChurn: true,
            notes: 'Resolve channel ID or handle from links, not visible text.'
        }),
        channelProfile: freezeEntry({
            stable: ['ytd-video-owner-renderer', 'ytd-channel-name', '#channel-name', 'ytd-c4-tabbed-header-renderer', 'ytd-page-header-renderer'],
            fallback: ['yt-avatar-shape', 'yt-decorated-avatar-view-model', 'ytd-browse[page-subtype="channels"] ytd-c4-tabbed-header-renderer'],
            highChurn: true,
            notes: 'Alias for profile.'
        }),
        notifications: freezeEntry({
            stable: ['ytd-notification-topbar-button-renderer', 'yt-icon-badge-shape', 'ytd-notification-renderer'],
            fallback: ['.ytd-notification-topbar-button-renderer .badge-shape-wiz', 'ytd-multi-page-menu-renderer ytd-notification-renderer'],
            highChurn: true,
            notes: 'Wait for popup menu root before sorting or transforming notifications.'
        }),
        media: freezeEntry({
            stable: ['video', 'img', 'ytd-thumbnail', 'yt-thumbnail-view-model'],
            fallback: ['#content video', '#content img', '#content ytd-thumbnail'],
            notes: 'Generic media resolver; prefer feature-specific roots.'
        }),
        liveChatFrame: freezeEntry({
            stable: ['ytd-live-chat-frame#chat', 'ytd-live-chat-frame', 'iframe#chatframe'],
            fallback: ['#chat.ytd-live-chat-frame', 'ytd-live-chat-frame iframe'],
            highChurn: true,
            needsFreshCapture: true,
            notes: 'Watch-page live chat frame; raw captures do not include full live chat internals.'
        }),
        liveChat: freezeEntry({
            stable: ['yt-live-chat-app', 'yt-live-chat-renderer', 'yt-live-chat-item-list-renderer'],
            fallback: ['yt-live-chat-text-message-renderer', 'yt-live-chat-message-input-renderer'],
            highChurn: true,
            needsFreshCapture: true,
            notes: 'Live chat iframe document surface; capture required before major live-chat rewrites.'
        }),
        liveChatPlaceholder: freezeEntry({
            stable: ['ytd-live-chat-frame', '#chat'],
            fallback: ['iframe#chatframe', 'ytd-live-chat-frame iframe'],
            highChurn: true,
            needsFreshCapture: true,
            notes: 'Placeholder canary for top-level pages where the iframe exists but chat DOM is isolated.'
        })
    });

    const SurfaceSelectors = Object.freeze(Object.fromEntries(
        Object.entries(SurfaceSelectorMap).map(([surface, entry]) => [
            surface,
            Object.freeze([...entry.stable, ...entry.fallback])
        ])
    ));

    const emittedMisses = new Set();
    const selectorStats = new Map();

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

    function getSelectorStat(surface, selector) {
        const key = `${surface}:${selector}`;
        if (!selectorStats.has(key)) {
            selectorStats.set(key, {
                surface,
                selector,
                attempts: 0,
                hits: 0,
                misses: 0,
                errors: 0,
                firstMissAt: null,
                lastMissAt: null,
                lastHitAt: null,
                lastError: null,
                lastOutcome: 'untested'
            });
        }
        return selectorStats.get(key);
    }

    function recordSelectorAttempt(surface, selector, outcome, error = null) {
        const stat = getSelectorStat(surface, selector);
        stat.attempts += 1;
        stat.lastOutcome = outcome;
        const now = Date.now();
        if (outcome === 'hit') {
            stat.hits += 1;
            stat.lastHitAt = now;
            return stat;
        }
        if (outcome === 'error') {
            stat.errors += 1;
            stat.lastError = error ? String(error.message || error).slice(0, 240) : null;
        } else {
            stat.misses += 1;
        }
        if (!stat.firstMissAt) stat.firstMissAt = now;
        stat.lastMissAt = now;
        return stat;
    }

    function emitSelectorMiss(surface, selector, error, options = {}) {
        const key = `${surface}:${selector}`;
        if (emittedMisses.has(key)) return;
        emittedMisses.add(key);
        const stat = getSelectorStat(surface, selector);
        const detail = {
            surface,
            selector,
            error: error ? String(error.message || error) : null,
            attempts: stat.attempts,
            misses: stat.misses,
            errors: stat.errors,
            firstMissAt: stat.firstMissAt,
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

    function recordMiss(surface, selector, error, options = {}) {
        recordSelectorAttempt(surface, selector, error ? 'error' : 'miss', error);
        emitSelectorMiss(surface, selector, error, options);
    }

    function recordHit(surface, selector) {
        recordSelectorAttempt(surface, selector, 'hit');
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
                if (match) {
                    recordHit(surface, selector);
                    return match;
                }
                recordMiss(surface, selector, null, options);
            } catch (error) {
                recordMiss(surface, selector, error, options);
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
                if (matches.length) {
                    recordHit(surface, selector);
                    return matches;
                }
                recordMiss(surface, selector, null, options);
            } catch (error) {
                recordMiss(surface, selector, error, options);
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

    function getSurfaceSelectorEntry(surface) {
        const entry = SurfaceSelectorMap[surface];
        if (!entry) return null;
        return {
            surface,
            stable: [...entry.stable],
            fallback: [...entry.fallback],
            selectors: [...SurfaceSelectors[surface]],
            highChurn: entry.highChurn,
            needsFreshCapture: entry.needsFreshCapture,
            notes: entry.notes
        };
    }

    function getSurfaceSelectorChain(surface) {
        return SurfaceSelectors[surface] ? [...SurfaceSelectors[surface]] : [];
    }

    function getSelectorHealthSnapshot() {
        return Object.entries(SurfaceSelectorMap).map(([surface, entry]) => {
            const selectors = SurfaceSelectors[surface] || [];
            const selectorEntries = selectors.map((selector) => {
                const stat = selectorStats.get(`${surface}:${selector}`) || getSelectorStat(surface, selector);
                return {
                    selector,
                    stable: entry.stable.includes(selector),
                    attempts: stat.attempts,
                    hits: stat.hits,
                    misses: stat.misses,
                    errors: stat.errors,
                    firstMissAt: stat.firstMissAt,
                    lastMissAt: stat.lastMissAt,
                    lastHitAt: stat.lastHitAt,
                    lastError: stat.lastError,
                    lastOutcome: stat.lastOutcome
                };
            });
            return {
                surface,
                highChurn: entry.highChurn,
                needsFreshCapture: entry.needsFreshCapture,
                stableSelectorCount: entry.stable.length,
                fallbackSelectorCount: entry.fallback.length,
                selectorCount: selectors.length,
                hitCount: selectorEntries.reduce((sum, item) => sum + item.hits, 0),
                missCount: selectorEntries.reduce((sum, item) => sum + item.misses, 0),
                errorCount: selectorEntries.reduce((sum, item) => sum + item.errors, 0),
                selectors: selectorEntries
            };
        });
    }

    function exportSelectorHealth() {
        return JSON.stringify({
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            surfaces: getSelectorHealthSnapshot()
        }, null, 2);
    }

    Object.assign(core, {
        SurfaceSelectorMap,
        SurfaceSelectors,
        exportSelectorHealth,
        findSurfaceElement,
        findSurfaceElements,
        getSelectorHealthSnapshot,
        getSurfaceSelectorChain,
        getSurfaceSelectorEntry,
        normalizeSelectorList,
        waitForSurfaceElement
    });
})();
