(() => {
    'use strict';

    // extension/core/selector-packs/comments.js
    //
    // YouTube comments root. Keep the old `ytd-comment-renderer` +
    // new `ytd-comment-view-model` shapes both present in the chain
    // because the comments A/B rollout switches users between them
    // mid-session.
    //
    // YouTube threaded comments (Jan–March 2026): up to 3 nesting levels
    // with red visual thread connectors and voice replies. Threaded reply
    // containers use `#more-replies-sub-thread`, `#expanded-threads`, and
    // `#expander-contents` within the existing `ytd-comment-thread-renderer`.

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const registry = core.SurfacePackRegistry || (core.SurfacePackRegistry = new Map());
    if (registry.has('comments')) return;

    const hooks = Object.freeze({
        root: Object.freeze({
            stable: Object.freeze(['ytd-comments#comments', 'ytd-comments']),
            fallback: Object.freeze(['#comments'])
        }),
        thread: Object.freeze({
            stable: Object.freeze([
                'ytd-comments ytd-comment-thread-renderer',
                'ytd-comments ytd-comment-view-model'
            ]),
            fallback: Object.freeze([
                'ytd-comment-thread-renderer',
                'ytd-comment-view-model',
                'ytd-comment-renderer'
            ])
        }),
        body: Object.freeze({
            stable: Object.freeze([
                '#content-text',
                'yt-attributed-string#content-text'
            ]),
            fallback: Object.freeze([
                'yt-formatted-string#content-text',
                '[id="content-text"]'
            ])
        }),
        author: Object.freeze({
            stable: Object.freeze([
                '#author-text',
                '#header-author #author-text'
            ]),
            fallback: Object.freeze([
                'a#author-text',
                '[id="author-text"]'
            ])
        })
    });

    registry.set('comments', Object.freeze({
        surface: 'comments',
        stable: Object.freeze([
            'ytd-comments',
            'ytd-comment-thread-renderer',
            'ytd-comment-view-model',
            '#more-replies-sub-thread',
            '#expanded-threads',
            '#expander-contents'
        ]),
        fallback: Object.freeze([
            'ytd-comment-thread-renderer.style-scope',
            'ytd-comment-renderer',
            '#more-replies',
            '#less-replies'
        ]),
        captureEvidence: Object.freeze([
            'mhtml/WatchPage.mhtml',
            'Worldwide Societal Collapse... - YouTube.mhtml'
        ]),
        lastVerified: '2026-06-19',
        highChurn: true,
        needsFreshCapture: false,
        hooks,
        notes: 'Keep old and new comment shapes during A/B transition. Threaded reply sub-thread containers added Jun 2026.'
    }));
})();
