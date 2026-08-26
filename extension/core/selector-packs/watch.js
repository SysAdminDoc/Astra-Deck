(() => {
    'use strict';

    // extension/core/selector-packs/watch.js
    //
    // Watch page root. `ytd-watch-flexy[video-id]` is the best route-
    // state probe — the `video-id` attribute mutates on SPA navigation
    // and is observed by core/lifecycle-route-bridge.js to feed the
    // lifecycle route-token machinery.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('watch')) return;

    const hooks = Object.freeze({
        // Watch action controls are renderer-backed in the current DOM. The
        // SVG path/renderer hooks survive locale changes; label selectors are
        // retained only as the final compatibility fallback for older A/B
        // variants and are resolved through selector health.
        'action.like': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #top-level-buttons-computed segmented-like-dislike-button-view-model',
                'ytd-watch-metadata #top-level-buttons-computed like-button-view-model',
                'ytd-watch-metadata #segmented-like-button'
            ]),
            fallback: Object.freeze([])
        }),
        'action.dislike': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #top-level-buttons-computed dislike-button-view-model',
                'ytd-watch-metadata #top-level-buttons-computed ytd-segmented-like-dislike-button-renderer #dislike-button-view-model',
                'ytd-watch-metadata #top-level-buttons-computed ytd-segmented-like-dislike-button-renderer'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata dislike-button-view-model',
                'ytd-segmented-like-dislike-button-renderer #dislike-button-view-model',
                'dislike-button-view-model'
            ])
        }),
        'action.share': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #top-level-buttons-computed > yt-button-view-model',
                'ytd-watch-metadata #top-level-buttons-computed > button-view-model',
                'ytd-watch-metadata button-view-model:has(path[d^="M10 3.158"])'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button-view-model:has(button[aria-label="Share"])',
                '#top-level-buttons-computed ytd-button-renderer:has(button[aria-label="Share"])'
            ])
        }),
        'action.ask': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #flexible-item-buttons > conversational-ui-watch-metadata-button-view-model',
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has([is-ask-ai])',
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has([data-action="ask"])'
            ]),
            fallback: Object.freeze([
                '#flexible-item-buttons yt-button-view-model:has(button[aria-label*="AI"])',
                'ytd-watch-metadata button-view-model:has(button[aria-label="Ask"])'
            ])
        }),
        'action.clip': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has(path[d^="M22,3h-4"])',
                'ytd-watch-metadata button-view-model:has(path[d^="M22,3h-4"])',
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:nth-of-type(3)'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button-view-model:has(button[aria-label="Clip"])',
                '#top-level-buttons-computed ytd-button-renderer:has(button[aria-label="Clip"])'
            ])
        }),
        'action.thanks': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has([data-action="thanks"])',
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:nth-of-type(2)'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button-view-model:has(button[aria-label="Thanks"])',
                '#top-level-buttons-computed ytd-button-renderer:has(button[aria-label="Thanks"])'
            ])
        }),
        'action.save': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has(path[d^="M19 2H5"])',
                'ytd-watch-metadata button-view-model:has(path[d^="M19 2H5"])'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button-view-model:has(button[aria-label="Save to playlist"])',
                '#top-level-buttons-computed ytd-button-renderer:has(button[aria-label="Save"])'
            ])
        }),
        'action.sponsor': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #sponsor-button',
                '.ytFlexibleActionsViewModelAction:has(#sponsor-button)'
            ]),
            fallback: Object.freeze([])
        }),
        'action.moreActions': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #actions-inner #button-shape > button',
                'ytd-watch-metadata ytd-menu-renderer > yt-button-shape#button-shape > button'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button[aria-label="More actions"]'
            ])
        }),
        'element.askButton': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #flexible-item-buttons > conversational-ui-watch-metadata-button-view-model button',
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has([is-ask-ai]) button'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button[aria-label*="AI"]',
                'ytd-watch-metadata button[aria-label="Ask"]'
            ])
        }),
        'element.askAiSurface': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #flexible-item-buttons > conversational-ui-watch-metadata-button-view-model',
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has([is-ask-ai])',
                'ytd-reel-shelf-renderer:has([is-ask-ai])'
            ]),
            fallback: Object.freeze([
                'ytd-video-description-youchat-section-view-model',
                '[data-ai-surface="ask"]'
            ])
        }),
        'element.saveButton': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #flexible-item-buttons > yt-button-view-model:has(path[d^="M19 2H5"]) button',
                'ytd-watch-metadata button-view-model:has(path[d^="M19 2H5"]) button'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button[aria-label="Save to playlist"]'
            ])
        }),
        'element.moreActions': Object.freeze({
            stable: Object.freeze([
                'ytd-watch-metadata #actions-inner #button-shape > button',
                'ytd-watch-metadata ytd-menu-renderer > yt-button-shape#button-shape > button'
            ]),
            fallback: Object.freeze([
                'ytd-watch-metadata button[aria-label="More actions"]'
            ])
        })
    });

    registry.set('watch', Object.freeze({
        surface: 'watch',
        stable: Object.freeze(['ytd-watch-flexy[video-id]', 'ytd-watch-flexy', 'ytd-watch-metadata', '#below']),
        fallback: Object.freeze(['ytd-watch-metadata.watch-active-metadata', 'ytd-watch-flexy[flexy]']),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-05-19',
        highChurn: true,
        needsFreshCapture: false,
        canary: Object.freeze({
            routes: Object.freeze(['watch']),
            featureIds: Object.freeze([
                'stickyVideo', 'deArrow', 'returnDislike', 'commentSearch'
            ])
        }),
        hooks,
        notes: 'Route state is best read from ytd-watch-flexy[video-id].'
    }));
})();
