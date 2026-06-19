(() => {
    'use strict';

    // extension/features/sticky-video/index.js
    //
    // Top-3 monolith peel seed for Theater Split. The monolith still owns
    // layout state, scrolling, observers, and event lifecycles; this module
    // owns the three style payload builders so the large CSS surfaces can be
    // tested and bundled independently.

    const STYLE_IDS = Object.freeze({
        shell: 'stickyVideo',
        meta: 'stickyVideo-meta-layout',
        comments: 'stickyVideo-comments'
    });

    function buildSplitShellCss() {
        return `html.ytkit-split-active ytd-watch-flexy{display:block!important;overflow:visible!important;} html.ytkit-split-active ytd-watch-flexy #columns{max-width:100%!important;} html.ytkit-split-active ytd-masthead,html.ytkit-split-active #masthead-container{display:none!important;} html.ytkit-split-active #page-manager{margin-top:0!important;} html.ytkit-split-active ytd-app{--ytd-masthead-height:0px;} html.ytkit-split-active,html.ytkit-split-active body{overflow:hidden!important;} html.ytkit-split-active body{padding-top:0!important;} html.ytkit-split-active #player-container,html.ytkit-split-active #player-container-inner,html.ytkit-split-active #player-theater-container,html.ytkit-split-active ytd-player{width:100%!important;max-width:none!important;height:100%!important;min-height:0!important;padding:0!important;margin:0!important;} html.ytkit-split-active #movie_player{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;position:relative!important;left:auto!important;top:auto!important;} html.ytkit-split-active .html5-video-container{width:100%!important;height:100%!important;} html.ytkit-split-active video.html5-main-video{width:100%!important;height:100%!important;object-fit:contain!important;left:0!important;top:0!important;} html.ytkit-split-active ytd-player > #container,html.ytkit-split-active #player-container-inner #player{width:100%!important;height:100%!important;padding-bottom:0!important;} html.ytkit-split-active ytd-watch-flexy[flexy-header-flipper_] #player-container,html.ytkit-split-active ytd-watch-flexy[theater] #player-container,html.ytkit-split-active ytd-watch-flexy #player-container{width:100%!important;max-width:none!important;} #ytkit-split-right::-webkit-scrollbar{width:5px;} #ytkit-split-right::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.14);border-radius:3px;} #ytkit-split-right::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.28);} .ytkit-divider-pip{opacity:0.4;transition:opacity 0.2s ease;} #ytkit-split-divider:hover .ytkit-divider-pip{opacity:1;} html.ytkit-split-active #below[style*="position:fixed"],html.ytkit-split-active #below[style*="position:fixed"]{scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,0.12) transparent!important;font-size:13px!important;} html.ytkit-split-active #below[style*="position"] ytd-watch-metadata{margin:-12px 0 0!important;padding:0!important;} html.ytkit-split-active #below[style*="position"] ytd-watch-metadata .item{padding:0!important;margin:0!important;} html.ytkit-split-active #below[style*="position"] ytd-watch-metadata #title{font-size:15px!important;line-height:1.3!important;margin-bottom:2px!important;} html.ytkit-split-active #below[style*="position"] #owner{margin:2px 0!important;padding:0!important;} html.ytkit-split-active #below[style*="position"] #actions{flex-wrap:wrap!important;max-width:100%!important;margin:0!important;padding:2px 0!important;gap:4px!important;overflow:visible!important;} html.ytkit-split-active #below[style*="position"] #actions ytd-menu-renderer,html.ytkit-split-active #below[style*="position"] #top-level-buttons-computed{flex-wrap:wrap!important;gap:2px!important;overflow:visible!important;} html.ytkit-split-active #below[style*="position"] #actions button,html.ytkit-split-active #below[style*="position"] #actions ytd-button-renderer,html.ytkit-split-active #below[style*="position"] #actions ytd-toggle-button-renderer{transform:scale(0.88)!important;transform-origin:center!important;} html.ytkit-split-active #below[style*="position"] ytd-text-inline-expander,html.ytkit-split-active #below[style*="position"] ytd-text-inline-expander > div{padding:0!important;margin:0!important;max-width:100%!important;word-break:break-word!important;font-size:12px!important;line-height:1.4!important;} html.ytkit-split-active #below[style*="position"] #description-inline-expander{margin:4px 0!important;padding:6px 8px!important;background:rgba(255,255,255,0.04)!important;border-radius:6px!important;} html.ytkit-split-active #below[style*="position"] ytd-comments{margin:0!important;padding:0 0 40px!important;} html.ytkit-split-active #below[style*="position"] ytd-comments-header-renderer,html.ytkit-split-active #below[style*="position"] ytd-comments-header-renderer > div{padding:0!important;margin:0!important;} html.ytkit-split-active #below[style*="position"] #count.ytd-comments-header-renderer{font-size:13px!important;margin:6px 0 2px!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-simplebox-renderer{padding:0!important;margin:0 0 4px!important;transform:scale(0.92)!important;transform-origin:top left!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-thread-renderer{margin:0!important;padding:6px 4px!important;border-bottom:1px solid rgba(255,255,255,0.06)!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-thread-renderer:last-child{border-bottom:none!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-renderer{margin:0!important;padding:0!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-renderer #author-thumbnail{width:24px!important;height:24px!important;margin-right:8px!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-renderer #author-thumbnail img,html.ytkit-split-active #below[style*="position"] ytd-comment-renderer #author-thumbnail yt-img-shadow{width:24px!important;height:24px!important;border-radius:50%!important;} html.ytkit-split-active #below[style*="position"] #header-author{margin-bottom:1px!important;} html.ytkit-split-active #below[style*="position"] #author-text{font-size:12px!important;} html.ytkit-split-active #below[style*="position"] #published-time-text{font-size:11px!important;} html.ytkit-split-active #below[style*="position"] #content-text{font-size:13px!important;line-height:1.35!important;margin:0!important;padding:0!important;} html.ytkit-split-active #below[style*="position"] #action-buttons{margin-top:2px!important;} html.ytkit-split-active #below[style*="position"] #action-buttons ytd-toggle-button-renderer,html.ytkit-split-active #below[style*="position"] #action-buttons #reply-button-end{transform:scale(0.85)!important;transform-origin:left center!important;} html.ytkit-split-active #below[style*="position"] #action-buttons #vote-count-middle{font-size:11px!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-replies-renderer{margin-left:28px!important;padding:0!important;} html.ytkit-split-active #below[style*="position"] ytd-comment-replies-renderer #expander-contents{padding:0!important;} html.ytkit-split-active #below[style*="position"] ytd-item-section-renderer,html.ytkit-split-active #below[style*="position"] ytd-item-section-renderer > #contents{padding:0!important;margin:0!important;max-width:100%!important;box-sizing:border-box!important;} html.ytkit-split-active #below[style*="position"] yt-formatted-string{max-width:100%!important;word-break:break-word!important;} html.ytkit-split-active #ytkit-split-right{border:none!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position:fixed"],html.ytkit-split-active ytd-live-chat-frame[style*="position:fixed"],html.ytkit-split-active #chat[style*="position:fixed"],html.ytkit-split-active #chat[style*="position:fixed"]{scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,0.15) transparent!important;margin:0!important;max-width:none!important;border-radius:0!important;padding:0 6px 0 0!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"] iframe,html.ytkit-split-active #chat[style*="position"] iframe{width:100%!important;height:100%!important;min-height:0!important;border:none!important;border-radius:0!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"] #container,html.ytkit-split-active #chat[style*="position"] #container{width:100%!important;height:100%!important;max-height:none!important;min-height:0!important;border-radius:0!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"] #show-hide-button,html.ytkit-split-active #chat[style*="position"] #show-hide-button{display:none!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"],html.ytkit-split-active #chat[style*="position"]{min-height:0!important;max-height:none!important;} #ytkit-split-close{position:absolute;bottom:16px;right:16px;z-index:25;width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,0.5);color:rgba(255,255,255,0.55);display:none;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity 0.2s,background 0.15s;pointer-events:auto;} #ytkit-split-close:hover{background:rgba(220,38,38,0.75);color:#fff;opacity:1!important;} #ytkit-split-collapse-strip{position:fixed;top:0;right:0;height:32px;z-index:10002;cursor:n-resize;background:linear-gradient(180deg,rgba(255,255,255,0.03) 0%,transparent 100%);transition:background 0.2s;pointer-events:auto;} #ytkit-split-collapse-strip:hover{background:linear-gradient(180deg,rgba(255,255,255,0.1) 0%,transparent 100%);} #ytkit-split-collapse-strip::after{content:'';display:block;width:32px;height:3px;background:rgba(255,255,255,0.2);border-radius:2px;margin:12px auto 0;transition:opacity 0.2s,background 0.2s;} #ytkit-split-collapse-strip:hover::after{background:rgba(255,255,255,0.5);} html.ytkit-split-active #secondary,html.ytkit-split-active #below,html.ytkit-split-active #player-full-bleed-container,html.ytkit-split-active #columns,html.ytkit-split-active ytd-watch-flexy{view-transition-name:none!important;} html.ytkit-split-active ytd-live-chat-frame#chat,html.ytkit-split-active ytd-live-chat-frame{display:flex!important;flex-direction:column!important;max-height:none!important;min-height:0!important;visibility:visible!important;} html.ytkit-split-active #chat-container{display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;visibility:visible!important;} html.ytkit-split-active ytd-live-chat-frame#chat>iframe,html.ytkit-split-active ytd-live-chat-frame>iframe{flex:1!important;height:100%!important;min-height:0!important;max-height:none!important;} html.ytkit-split-active ytd-watch-flexy.loading ytd-live-chat-frame#chat,html.ytkit-split-active ytd-watch-flexy:not([ghost-cards-enabled]).loading #chat{visibility:visible!important;}  `;
    }

    function buildSplitMetaCss() {
        return `
                    html.ytkit-split-active #ytkit-split-close {
                        top: 16px !important;
                        right: 16px !important;
                        bottom: auto !important;
                        z-index: 35 !important;
                        width: 32px !important;
                        height: 32px !important;
                        border: 1px solid rgba(255, 255, 255, 0.12) !important;
                        border-radius: 10px !important;
                        background: rgba(6, 9, 14, 0.56) !important;
                        color: rgba(255, 255, 255, 0.72) !important;
                        box-shadow:
                            0 10px 22px rgba(0, 0, 0, 0.26),
                            inset 0 1px 0 rgba(255, 255, 255, 0.07) !important;
                        backdrop-filter: none;
                        -webkit-backdrop-filter: none;
                    }

                    html.ytkit-split-active #ytkit-split-close:hover {
                        border-color: rgba(248, 113, 113, 0.35) !important;
                        background: rgba(220, 38, 38, 0.72) !important;
                        color: #fff !important;
                    }

                    html.ytkit-split-active ytd-popup-container,
                    html.ytkit-split-active tp-yt-iron-dropdown,
                    html.ytkit-split-active ytd-menu-popup-renderer,
                    html.ytkit-split-active ytd-multi-page-menu-renderer {
                        z-index: 2147483647 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] ytd-watch-metadata {
                        margin: 0 !important;
                        padding: 0 !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        row-gap: 8px !important;
                        align-content: start !important;
                    }

                    html.ytkit-split-active #below[style*="position"] ytd-watch-metadata #top-row {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        align-items: start !important;
                        row-gap: 8px !important;
                        margin: 0 0 6px !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] ytd-watch-metadata #title,
                    html.ytkit-split-active #below[style*="position"] ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html.ytkit-split-active #below[style*="position"] ytd-watch-metadata h1.ytd-watch-metadata {
                        margin: 0 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] ytd-watch-metadata #title {
                        font-size: clamp(1.02rem, 1.45vw, 1.16rem) !important;
                        line-height: 1.34 !important;
                        letter-spacing: 0 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner.ytd-watch-metadata,
                    html.ytkit-split-active #below[style*="position"] #owner {
                        display: flex !important;
                        align-items: flex-start !important;
                        justify-content: flex-start !important;
                        flex-wrap: wrap !important;
                        gap: 8px 10px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner ytd-video-owner-renderer {
                        flex: 1 1 100% !important;
                        min-width: 0 !important;
                        margin-right: 0 !important;
                        order: 1 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner #channel-name,
                    html.ytkit-split-active #below[style*="position"] #owner #channel-name yt-formatted-string,
                    html.ytkit-split-active #below[style*="position"] #owner #owner-sub-count,
                    html.ytkit-split-active #below[style*="position"] #owner #owner-sub-count yt-formatted-string {
                        display: block !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner #owner-sub-count,
                    html.ytkit-split-active #below[style*="position"] #owner #owner-sub-count yt-formatted-string {
                        margin-top: 2px !important;
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                        color: rgba(255, 255, 255, 0.58) !important;
                        white-space: normal !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner #subscribe-button,
                    html.ytkit-split-active #below[style*="position"] #owner yt-subscribe-button-view-model,
                    html.ytkit-split-active #below[style*="position"] #owner ytd-subscribe-button-renderer {
                        flex: 1 1 100% !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        order: 2 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner #notification-preference-button,
                    html.ytkit-split-active #below[style*="position"] #owner ytd-subscription-notification-toggle-button-renderer-next,
                    html.ytkit-split-active #below[style*="position"] #owner > #ytkit-watch-btn,
                    html.ytkit-split-active #below[style*="position"] #owner > #ytkit-page-btn-watch {
                        flex: 0 0 auto !important;
                        order: 3 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner > #ytkit-watch-btn,
                    html.ytkit-split-active #below[style*="position"] #owner > #ytkit-page-btn-watch {
                        order: 4 !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner > #ytkit-watch-btn {
                        display: none !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner #subscribe-button .yt-spec-button-shape-next,
                    html.ytkit-split-active #below[style*="position"] #owner #notification-preference-button .yt-spec-button-shape-next,
                    html.ytkit-split-active #below[style*="position"] #owner yt-subscribe-button-view-model .yt-spec-button-shape-next {
                        min-height: 30px !important;
                        height: 30px !important;
                        padding-inline: 10px !important;
                        border-radius: 10px !important;
                        font-size: 11px !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #owner #notification-preference-button .yt-spec-button-shape-next {
                        min-width: 30px !important;
                        padding-inline: 7px !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #actions,
                    html.ytkit-split-active #below[style*="position"] #actions.ytd-watch-metadata {
                        display: block !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #actions-inner,
                    html.ytkit-split-active #below[style*="position"] #actions ytd-menu-renderer,
                    html.ytkit-split-active #below[style*="position"] #top-level-buttons-computed {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 6px !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #top-level-buttons-computed > * {
                        flex: 0 0 auto !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #actions button,
                    html.ytkit-split-active #below[style*="position"] #actions ytd-button-renderer,
                    html.ytkit-split-active #below[style*="position"] #actions ytd-toggle-button-renderer,
                    html.ytkit-split-active #below[style*="position"] #action-buttons ytd-toggle-button-renderer,
                    html.ytkit-split-active #below[style*="position"] #action-buttons #reply-button-end {
                        transform: none !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #action-buttons {
                        margin-top: 4px !important;
                        display: flex !important;
                        align-items: center !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #actions .yt-spec-button-shape-next--segmented-start,
                    html.ytkit-split-active #below[style*="position"] #actions .yt-spec-button-shape-next--segmented-end {
                        text-align: center !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #actions #segmented-like-button button,
                    html.ytkit-split-active #below[style*="position"] #actions #segmented-dislike-button button,
                    html.ytkit-split-active #below[style*="position"] #actions like-button-view-model button,
                    html.ytkit-split-active #below[style*="position"] #actions dislike-button-view-model button,
                    html.ytkit-split-active #below[style*="position"] ytd-segmented-like-dislike-button-renderer,
                    html.ytkit-split-active #below[style*="position"] segmented-like-dislike-button-view-model,
                    html.ytkit-split-active #below[style*="position"] .ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #actions #segmented-like-button button,
                    html.ytkit-split-active #below[style*="position"] #actions #segmented-dislike-button button,
                    html.ytkit-split-active #below[style*="position"] #actions like-button-view-model button,
                    html.ytkit-split-active #below[style*="position"] #actions dislike-button-view-model button {
                        min-height: 32px !important;
                        gap: 6px !important;
                        padding-inline: 10px !important;
                    }

                    html.ytkit-split-active #below[style*="position"] #action-buttons #vote-count-middle,
                    html.ytkit-split-active #below[style*="position"] #action-buttons .yt-spec-button-shape-next__button-text-content,
                    html.ytkit-split-active #below[style*="position"] #actions #vote-count-middle,
                    html.ytkit-split-active #below[style*="position"] #actions .yt-spec-button-shape-next__button-text-content {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        line-height: 1 !important;
                        white-space: nowrap !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "count sort"
                            "box box" !important;
                        align-items: center !important;
                        column-gap: 10px !important;
                        row-gap: 12px !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #title {
                        grid-area: count !important;
                        justify-self: start !important;
                        align-self: center !important;
                        display: flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        flex-wrap: wrap !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #leading-section,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #additional-section {
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        margin: 0 !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments #count.ytd-comments-header-renderer,
                    html.ytkit-split-open #below[style*="position"] #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-flex !important;
                        align-items: baseline !important;
                        flex: 0 1 auto !important;
                        min-width: 0 !important;
                        gap: 0.28em !important;
                        font-size: 14px !important;
                        font-weight: 700 !important;
                        line-height: 1.15 !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-flex !important;
                        gap: 0.28em !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer > span {
                        display: inline-block !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments #count.ytd-comments-header-renderer::before {
                        content: none !important;
                        display: none !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer {
                        grid-area: sort !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin-left: 0 !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 32px !important;
                        height: 32px !important;
                        padding: 0 12px !important;
                        border-radius: 10px !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #placeholder-area {
                        min-height: 50px !important;
                        padding: 0 14px !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        display: grid !important;
                        grid-template-columns: 32px minmax(0, 1fr) !important;
                        align-items: center !important;
                        gap: 10px !important;
                        width: 100% !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #author-thumbnail,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #author-thumbnail img,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #author-thumbnail yt-img-shadow,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #avatar,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #avatar img,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #avatar yt-img-shadow {
                        width: 32px !important;
                        height: 32px !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #simple-box {
                        grid-area: box !important;
                        grid-column: 1 / -1 !important;
                        justify-self: stretch !important;
                        align-self: stretch !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer {
                        transform: none !important;
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #main,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #creation-box,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #input-container,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer tp-yt-paper-input-container,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #placeholder-area,
                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #contenteditable-root {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        box-sizing: border-box !important;
                    }

                    html.ytkit-split-open #below[style*="position"] ytd-watch-metadata #top-row {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        align-items: start !important;
                        row-gap: 10px !important;
                        margin: 0 0 10px !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] ytd-watch-metadata #title,
                    html.ytkit-split-open #below[style*="position"] ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html.ytkit-split-open #below[style*="position"] ytd-watch-metadata h1.ytd-watch-metadata,
                    html.ytkit-split-open #below[style*="position"] h1.style-scope.ytd-watch-metadata {
                        margin: 0 !important;
                        font-size: clamp(1rem, 1.45vw, 1.14rem) !important;
                        line-height: 1.18 !important;
                        letter-spacing: 0 !important;
                        text-align: left !important;
                        text-transform: none !important;
                        font-weight: 780 !important;
                        white-space: normal !important;
                        overflow: visible !important;
                        text-overflow: clip !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner,
                    html.ytkit-split-open #below[style*="position"] #owner.ytd-watch-metadata {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto auto !important;
                        grid-template-areas:
                            "owner owner owner"
                            "sub page watch" !important;
                        align-items: center !important;
                        column-gap: 8px !important;
                        row-gap: 8px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer {
                        grid-area: owner !important;
                        display: grid !important;
                        grid-template-columns: 52px minmax(0, 1fr) !important;
                        align-items: center !important;
                        column-gap: 12px !important;
                        row-gap: 0 !important;
                        min-width: 0 !important;
                        margin-right: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer #avatar,
                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer #avatar img {
                        width: 52px !important;
                        height: 52px !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer #upload-info {
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 4px !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer ytd-channel-name,
                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer ytd-channel-name #container {
                        display: flex !important;
                        align-items: center !important;
                        gap: 6px !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer #channel-name,
                    html.ytkit-split-open #below[style*="position"] #owner ytd-video-owner-renderer #channel-name a {
                        font-size: 13px !important;
                        line-height: 1.18 !important;
                        font-weight: 700 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner #owner-sub-count,
                    html.ytkit-split-open #below[style*="position"] #owner #owner-sub-count yt-formatted-string {
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                        color: rgba(255,255,255,0.58) !important;
                        white-space: normal !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner #subscribe-button {
                        grid-area: sub !important;
                        justify-self: start !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner > #ytkit-page-btn-watch {
                        grid-area: page !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #owner > #ytkit-watch-btn {
                        grid-area: watch !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #actions,
                    html.ytkit-split-open #below[style*="position"] #actions.ytd-watch-metadata {
                        display: block !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 0 12px !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #actions-inner,
                    html.ytkit-split-open #below[style*="position"] #top-level-buttons-computed,
                    html.ytkit-split-open #below[style*="position"] #actions ytd-menu-renderer {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                        row-gap: 8px !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #actions ytd-menu-renderer,
                    html.ytkit-split-open #below[style*="position"] #top-level-buttons-computed,
                    html.ytkit-split-open #below[style*="position"] #flexible-item-buttons {
                        width: auto !important;
                        max-width: 100% !important;
                        flex: 0 1 auto !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #top-level-buttons-computed {
                        row-gap: 6px !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #actions ytd-menu-renderer > #button-shape,
                    html.ytkit-split-open #below[style*="position"] #actions ytd-menu-renderer > yt-button-shape,
                    html.ytkit-split-open #below[style*="position"] #actions ytd-menu-renderer > yt-icon-button {
                        flex: 0 0 auto !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #actions yt-button-shape,
                    html.ytkit-split-open #below[style*="position"] #actions yt-button-view-model,
                    html.ytkit-split-open #below[style*="position"] #actions ytd-button-renderer,
                    html.ytkit-split-open #below[style*="position"] #actions ytd-toggle-button-renderer {
                        transform: none !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #actions .ytkit-local-dl-btn {
                        margin: 0 !important;
                        align-self: center !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments {
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer {
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "count sort"
                            "box box" !important;
                        grid-auto-rows: minmax(0, auto) !important;
                        align-items: center !important;
                        column-gap: 10px !important;
                        row-gap: 12px !important;
                        margin: 0 !important;
                        padding: 0 0 14px !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer #title,
                    html.ytkit-split-open #below[style*="position"] #comments #count.ytd-comments-header-renderer,
                    html.ytkit-split-open #below[style*="position"] #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer {
                        grid-area: box !important;
                        grid-column: 1 / -1 !important;
                        justify-self: stretch !important;
                        align-self: stretch !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: none !important;
                    }

                    html.ytkit-split-open #below[style*="position"] #comments ytd-comment-simplebox-renderer #placeholder-area {
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments#comments,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-comments#comments {
                        margin-top: 10px !important;
                        padding: 10px 12px 52px !important;
                        border-radius: 12px !important;
                        box-shadow: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        align-items: center !important;
                        column-gap: 10px !important;
                        row-gap: 10px !important;
                        margin: 0 0 12px !important;
                        padding: 0 0 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #title,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #leading-section,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #additional-section {
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments #count.ytd-comments-header-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-flex !important;
                        align-items: baseline !important;
                        gap: 0.26em !important;
                        margin: 0 !important;
                        font-size: 13px !important;
                        line-height: 1.15 !important;
                        white-space: nowrap !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer > span {
                        display: inline-block !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #sort-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer {
                        display: inline-flex !important;
                        align-items: center !important;
                        margin: 0 !important;
                        flex: 0 0 auto !important;
                        justify-self: end !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 28px !important;
                        height: 28px !important;
                        padding: 0 11px !important;
                        border-radius: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #simple-box {
                        grid-column: 1 / -1 !important;
                        display: block !important;
                        margin-left: 0 !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        justify-self: stretch !important;
                        align-self: stretch !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer {
                        display: block !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: none !important;
                        transform: none !important;
                        transform-origin: top left !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #simple-box,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #simple-box > ytd-comment-simplebox-renderer {
                        display: block !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        display: grid !important;
                        grid-template-columns: 24px minmax(0, 1fr) !important;
                        align-items: center !important;
                        gap: 8px !important;
                        width: 100% !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #avatar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #avatar yt-img-shadow {
                        width: 24px !important;
                        height: 24px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #creation-box,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #input-container,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer tp-yt-paper-input-container,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #placeholder-area {
                        width: 100% !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #placeholder-area {
                        min-height: 40px !important;
                        padding: 0 12px !important;
                        border-radius: 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata {
                        margin: 0 !important;
                        padding: 0 !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        row-gap: 8px !important;
                        align-content: start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata #top-row {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        align-items: start !important;
                        row-gap: 8px !important;
                        margin: 0 0 8px !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata #title,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata h1.ytd-watch-metadata {
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner.ytd-watch-metadata {
                        display: flex !important;
                        align-items: flex-start !important;
                        justify-content: flex-start !important;
                        flex-wrap: wrap !important;
                        gap: 8px 10px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer {
                        flex: 1 1 100% !important;
                        min-width: 0 !important;
                        margin-right: 0 !important;
                        order: 1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner yt-subscribe-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-subscribe-button-renderer {
                        flex: 1 1 100% !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        order: 2 !important;
                        align-self: center !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #notification-preference-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-subscription-notification-toggle-button-renderer-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner > #ytkit-watch-btn,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner > #ytkit-page-btn-watch {
                        flex: 0 0 auto !important;
                        order: 3 !important;
                        align-self: center !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions.ytd-watch-metadata {
                        display: block !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 0 12px !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions-inner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #top-level-buttons-computed {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 6px !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #top-level-buttons-computed > * {
                        flex: 0 0 auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-button-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-toggle-button-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #action-buttons ytd-toggle-button-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #action-buttons #reply-button-end {
                        transform: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #action-buttons {
                        display: flex !important;
                        align-items: center !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                        margin-top: 4px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions dislike-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions #segmented-dislike-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions .ytDislikeButtonViewModelHost {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions like-button-view-model button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions #segmented-like-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions .ytLikeButtonViewModelHost button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions .yt-spec-button-shape-next--segmented-start {
                        border-radius: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-comments-header-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-comment-simplebox-renderer {
                        max-width: 100% !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata {
                        row-gap: 10px !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata #top-row {
                        row-gap: 12px !important;
                        margin: 0 0 12px !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata #title,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata h1.ytd-watch-metadata,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below h1.style-scope.ytd-watch-metadata {
                        margin: 0 !important;
                        font-size: clamp(1rem, 1.45vw, 1.14rem) !important;
                        line-height: 1.18 !important;
                        letter-spacing: 0 !important;
                        text-align: left !important;
                        text-transform: none !important;
                        font-weight: 780 !important;
                        white-space: normal !important;
                        overflow: visible !important;
                        text-overflow: clip !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner.ytd-watch-metadata {
                        position: relative !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto auto auto !important;
                        grid-template-areas:
                            "owner sub page watch" !important;
                        align-items: center !important;
                        column-gap: 8px !important;
                        row-gap: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer {
                        grid-area: owner !important;
                        display: grid !important;
                        grid-template-columns: 52px minmax(0, 1fr) !important;
                        align-items: center !important;
                        column-gap: 12px !important;
                        row-gap: 0 !important;
                        justify-self: start !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer #avatar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer #avatar img {
                        width: 52px !important;
                        height: 52px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer #upload-info {
                        display: flex !important;
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 4px !important;
                        min-width: 0 !important;
                        text-align: left !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer ytd-channel-name,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer ytd-channel-name #container {
                        display: flex !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 6px !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer #channel-name,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-video-owner-renderer #channel-name a {
                        font-size: 13px !important;
                        line-height: 1.18 !important;
                        font-weight: 700 !important;
                        text-align: left !important;
                        justify-self: start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #owner-sub-count,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #owner-sub-count yt-formatted-string {
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                        color: rgba(255,255,255,0.58) !important;
                        white-space: normal !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #subscribe-button {
                        grid-area: sub !important;
                        justify-self: start !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #notification-preference-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-subscription-notification-toggle-button-renderer-next {
                        position: relative !important;
                        grid-area: sub !important;
                        justify-self: start !important;
                        align-self: center !important;
                        margin: 0 !important;
                        overflow: visible !important;
                        pointer-events: auto !important;
                        z-index: 40 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #notification-preference-button *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner ytd-subscription-notification-toggle-button-renderer-next * {
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner > #ytkit-page-btn-watch {
                        grid-area: page !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner > #ytkit-watch-btn {
                        grid-area: watch !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #subscribe-button .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner #notification-preference-button .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner yt-subscribe-button-view-model .yt-spec-button-shape-next {
                        min-height: 32px !important;
                        height: 32px !important;
                        border-radius: 10px !important;
                        padding-inline: 11px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions.ytd-watch-metadata {
                        margin: 0 0 14px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions-inner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #top-level-buttons-computed,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-menu-renderer {
                        gap: 8px !important;
                        row-gap: 8px !important;
                        align-items: center !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #top-level-buttons-computed,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #flexible-item-buttons {
                        width: auto !important;
                        max-width: 100% !important;
                        flex: 0 1 auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #top-level-buttons-computed {
                        row-gap: 6px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-menu-renderer > #button-shape,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-menu-renderer > yt-button-shape,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #actions ytd-menu-renderer > yt-icon-button {
                        flex: 0 0 auto !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata #top-row[data-ytkit-split-actions-docked="1"] > #actions,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-watch-metadata #top-row[data-ytkit-split-actions-docked="1"] > #actions.ytd-watch-metadata {
                        display: none !important;
                        height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner:has(.ytkit-split-owner-actions),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner.ytd-watch-metadata:has(.ytkit-split-owner-actions) {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        grid-template-areas:
                            "owner"
                            "sub"
                            "actions" !important;
                        align-content: flex-start !important;
                        align-items: center !important;
                        justify-items: start !important;
                        gap: 12px 8px !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner:not(:has(#subscribe-button)):has(.ytkit-split-owner-actions) {
                        grid-template-areas:
                            "owner"
                            "actions" !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner:has(.ytkit-split-owner-actions) ytd-video-owner-renderer {
                        grid-area: owner !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner:has(.ytkit-split-owner-actions) #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner:has(.ytkit-split-owner-actions) yt-subscribe-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner:has(.ytkit-split-owner-actions) ytd-subscribe-button-renderer {
                        grid-area: sub !important;
                        flex: 0 1 auto !important;
                        order: 2 !important;
                        width: auto !important;
                        max-width: 100% !important;
                        justify-self: start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions {
                        grid-area: actions !important;
                        grid-column: 1 / -1 !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        align-self: stretch !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                        flex: 1 1 100% !important;
                        order: 3 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        position: relative !important;
                        z-index: 20 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions[hidden] {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions > * {
                        flex: 0 1 auto !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions #notification-preference-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions ytd-subscription-notification-toggle-button-renderer-next {
                        order: 1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions > #ytkit-page-btn-watch,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions > #ytkit-watch-btn {
                        order: 2 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions segmented-like-dislike-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions ytd-segmented-like-dislike-button-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions like-button-view-model {
                        order: 3 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytkit-local-dl-btn {
                        order: 4 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytkit-local-dl-btn,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .yt-spec-button-shape-next {
                        min-height: 32px !important;
                        height: 32px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        color: rgba(226, 232, 240, 0.88) !important;
                        font-size: 11px !important;
                        font-weight: 720 !important;
                        letter-spacing: 0 !important;
                        transform: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytkit-local-dl-btn {
                        gap: 5px !important;
                        padding-inline: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions dislike-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions #segmented-dislike-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytDislikeButtonViewModelHost {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions segmented-like-dislike-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions ytd-segmented-like-dislike-button-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions like-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions segmented-like-dislike-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions ytd-segmented-like-dislike-button-renderer {
                        overflow: hidden !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        box-shadow: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper {
                        gap: 0 !important;
                        overflow: hidden !important;
                        border: 0 !important;
                        border-radius: 10px !important;
                        background: transparent !important;
                        box-shadow: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper::before,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper::after,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions like-button-view-model::before,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions like-button-view-model::after {
                        content: none !important;
                        display: none !important;
                        border: 0 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytSpecButtonShapeNextSegmentedStart,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .ytSpecButtonShapeNextSegmentedEnd,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .yt-spec-button-shape-next--segmented-start,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #owner .ytkit-split-owner-actions .yt-spec-button-shape-next--segmented-end {
                        border: 0 !important;
                        border-radius: 10px !important;
                        background: transparent !important;
                        box-shadow: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments#comments,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-comments#comments {
                        margin-top: 12px !important;
                        padding: 14px 14px 64px !important;
                        border-radius: 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "count sort"
                            "box box" !important;
                        align-items: center !important;
                        column-gap: 10px !important;
                        row-gap: 12px !important;
                        margin: 0 0 14px !important;
                        padding: 0 0 14px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #title {
                        grid-area: count !important;
                        justify-self: start !important;
                        align-self: center !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        flex-wrap: wrap !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #leading-section,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #additional-section,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments #count.ytd-comments-header-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-flex !important;
                        align-items: baseline !important;
                        gap: 0.28em !important;
                        font-size: 14px !important;
                        line-height: 1.15 !important;
                        font-weight: 700 !important;
                        white-space: nowrap !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #sort-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer {
                        grid-area: sort !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 32px !important;
                        height: 32px !important;
                        padding: 0 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #simple-box {
                        grid-area: box !important;
                        grid-column: 1 / -1 !important;
                        justify-self: stretch !important;
                        align-self: stretch !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #simple-box {
                        display: block !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer {
                        transform: none !important;
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #author-thumbnail[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #placeholder-area[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #attachments[hidden] {
                        display: none !important;
                        width: 0 !important;
                        height: 0 !important;
                        min-width: 0 !important;
                        min-height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog > ytd-comment-dialog-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox {
                        display: block !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #commentbox,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #creation-box {
                        display: block !important;
                        flex: 1 1 auto !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #thumbnail-input-row {
                        display: grid !important;
                        grid-template-columns: 32px minmax(0, 1fr) !important;
                        align-items: start !important;
                        gap: 10px !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #avatar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #avatar yt-img-shadow {
                        width: 32px !important;
                        height: 32px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #placeholder-area:not([hidden]) {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #thumbnail-input-row,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #placeholder-area {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog {
                        display: block !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        grid-column: 1 / -1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #thumbnail-input-row {
                        display: block !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        gap: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #avatar {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #creation-box,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #input-container,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox tp-yt-paper-input-container,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox .input-wrapper,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #labelAndInputContainer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox .input-content,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox .paper-input-input,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox ytd-emoji-input,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox yt-user-mention-autosuggest-input,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #contenteditable-textarea,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #contenteditable-root {
                        display: block !important;
                        flex: 1 1 auto !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #contenteditable-textarea,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #contenteditable-root {
                        min-height: 50px !important;
                        padding: 0 14px !important;
                        border-radius: 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #footer {
                        display: flex !important;
                        align-items: center !important;
                        justify-content: space-between !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        margin-top: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer > #comment-dialog ytd-commentbox #footer #buttons {
                        display: flex !important;
                        align-items: center !important;
                        justify-content: flex-end !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                        margin-left: auto !important;
                        min-width: 0 !important;
                    }
                `;
    }

    function buildSplitCommentsCss() {
        return `
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] {
                        --ytkit-split-accent-rgb: var(--ytkit-accent-rgb, 245, 158, 11);
                        color-scheme: dark !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) ytd-popup-container,
                    html:is(.ytkit-split-active, .ytkit-split-open) tp-yt-iron-dropdown,
                    html:is(.ytkit-split-active, .ytkit-split-open) ytd-menu-popup-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) ytd-multi-page-menu-renderer {
                        z-index: 2147483647 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata {
                        margin: 0 0 14px !important;
                        padding: 0 0 14px !important;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #top-row {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        justify-self: stretch !important;
                        box-sizing: border-box !important;
                        gap: 14px !important;
                        margin: 0 0 14px !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title {
                        position: relative !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        align-content: start !important;
                        row-gap: 10px !important;
                        z-index: 60 !important;
                        margin: 0 0 10px !important;
                        padding: 12px 14px 13px !important;
                        border: 1px solid rgba(255, 255, 255, 0.075) !important;
                        border-left: 2px solid rgba(var(--ytkit-split-accent-rgb), 0.42) !important;
                        border-radius: 12px !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.050), rgba(255, 255, 255, 0.018)),
                            rgba(11, 15, 23, 0.76) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.034), 0 12px 24px rgba(2, 6, 12, 0.18) !important;
                        box-sizing: border-box !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title:has(#ytkit-po-logo-wrap.ytkit-ql-open) {
                        z-index: 2147483646 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-title-bar {
                        display: grid !important;
                        grid-template-columns: auto minmax(0, 1fr) !important;
                        grid-template-areas:
                            "home date"
                            "actions actions" !important;
                        align-items: center !important;
                        gap: 9px 10px !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        position: relative !important;
                        z-index: 5 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-youtube-link {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        flex: 0 0 auto !important;
                        grid-area: home !important;
                        width: 32px !important;
                        min-width: 32px !important;
                        height: 28px !important;
                        min-height: 28px !important;
                        padding: 0 !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.12) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.030)),
                            rgba(255, 255, 255, 0.045) !important;
                        color: #ff0033 !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20), 0 8px 18px rgba(0, 0, 0, 0.26) !important;
                        text-decoration: none !important;
                        transition: transform 140ms var(--ytkit-ease-out), filter 140ms var(--ytkit-ease-out) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-youtube-link:hover {
                        filter: brightness(1.12) !important;
                        transform: translateY(-1px) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-youtube-link:active {
                        transform: translateY(0) scale(0.96) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-youtube-link svg {
                        width: 24px !important;
                        height: 18px !important;
                        display: block !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-header-actions {
                        display: inline-flex !important;
                        align-items: center !important;
                        flex-wrap: wrap !important;
                        grid-area: actions !important;
                        justify-self: stretch !important;
                        gap: 8px !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        position: relative !important;
                        z-index: 30 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-header-actions[hidden] {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap {
                        position: relative !important;
                        z-index: 30 !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 3px !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap.ytkit-ql-open {
                        z-index: 2147483647 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap::before {
                        content: none !important;
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher--player,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-toggle {
                        width: 30px !important;
                        min-width: 30px !important;
                        height: 28px !important;
                        min-height: 28px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.095) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.024)),
                            rgba(255, 255, 255, 0.045) !important;
                        color: rgba(226, 232, 240, 0.90) !important;
                        box-shadow: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher--player:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-toggle:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.28) !important;
                        background:
                            linear-gradient(180deg, rgba(var(--ytkit-split-accent-rgb), 0.15), rgba(var(--ytkit-split-accent-rgb), 0.045)),
                            rgba(255, 255, 255, 0.052) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher-glyph,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher-glyph svg {
                        width: 15px !important;
                        height: 15px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-toggle {
                        width: 25px !important;
                        min-width: 25px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-drop {
                        top: calc(100% + 8px) !important;
                        right: auto !important;
                        bottom: auto !important;
                        left: 0 !important;
                        z-index: 2147483647 !important;
                        min-width: 232px !important;
                        max-width: min(260px, calc(100vw - 34px)) !important;
                        max-height: min(440px, calc(100vh - 92px)) !important;
                        overflow: auto !important;
                        transform-origin: top left !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-upload-meta {
                        display: inline-grid !important;
                        align-items: center !important;
                        justify-items: end !important;
                        align-content: center !important;
                        gap: 2px !important;
                        flex: 0 1 auto !important;
                        grid-area: date !important;
                        justify-self: end !important;
                        max-width: min(100%, 220px) !important;
                        min-height: 38px !important;
                        margin-left: 0 !important;
                        padding: 5px 11px 6px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(var(--ytkit-split-accent-rgb), 0.18) !important;
                        background:
                            linear-gradient(180deg, rgba(var(--ytkit-split-accent-rgb), 0.115), rgba(var(--ytkit-split-accent-rgb), 0.035)),
                            rgba(255, 255, 255, 0.035) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045) !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-upload-date {
                        display: block !important;
                        max-width: 100% !important;
                        color: rgba(226, 232, 240, 0.90) !important;
                        font-size: 11.5px !important;
                        line-height: 1.05 !important;
                        font-weight: 650 !important;
                        letter-spacing: 0 !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-view-count {
                        display: block !important;
                        max-width: 100% !important;
                        color: rgba(148, 163, 184, 0.86) !important;
                        font-size: 10.5px !important;
                        line-height: 1.05 !important;
                        font-weight: 650 !important;
                        letter-spacing: 0 !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-upload-meta[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-upload-date[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-upload-date:empty,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-view-count[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title .ytkit-split-view-count:empty {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title h1,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata h1.ytd-watch-metadata {
                        margin: 0 !important;
                        padding: 0 !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        font-size: 16px !important;
                        line-height: 1.30 !important;
                        letter-spacing: 0 !important;
                        text-align: left !important;
                        text-transform: none !important;
                        font-weight: 780 !important;
                        color: rgba(248, 250, 252, 0.96) !important;
                        text-wrap: balance !important;
                        white-space: normal !important;
                        display: -webkit-box !important;
                        -webkit-line-clamp: 3 !important;
                        -webkit-box-orient: vertical !important;
                        overflow: hidden !important;
                        overflow-wrap: anywhere !important;
                        text-overflow: ellipsis !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-watch-metadata #title yt-formatted-string {
                        display: block !important;
                        min-width: 0 !important;
                        max-width: 100% !important;
                        color: inherit !important;
                        font-size: inherit !important;
                        font-weight: inherit !important;
                        line-height: inherit !important;
                        letter-spacing: 0 !important;
                        overflow-wrap: inherit !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner.ytd-watch-metadata {
                        position: relative !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        justify-self: stretch !important;
                        box-sizing: border-box !important;
                        gap: 7px !important;
                        margin: 0 !important;
                        padding: 9px 12px 8px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        border-radius: 12px !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018)),
                            rgba(12, 16, 24, 0.82) !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-video-owner-renderer {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 10px !important;
                        justify-self: start !important;
                        width: auto !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-video-owner-renderer #avatar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-video-owner-renderer #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-video-owner-renderer #avatar yt-img-shadow {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        width: 42px !important;
                        height: 42px !important;
                        flex: 0 0 42px !important;
                        min-width: 42px !important;
                        margin: 0 !important;
                        border-radius: 12px !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-video-owner-renderer #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-video-owner-renderer #avatar yt-img-shadow {
                        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.10) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-video-owner-renderer #upload-info {
                        display: grid !important;
                        justify-items: start !important;
                        gap: 3px !important;
                        flex: 0 1 auto !important;
                        width: auto !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        text-align: left !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #channel-name,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #channel-name a,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #channel-name yt-formatted-string {
                        color: rgba(248, 250, 252, 0.96) !important;
                        font-size: 13px !important;
                        line-height: 1.2 !important;
                        font-weight: 760 !important;
                        letter-spacing: 0 !important;
                        text-align: left !important;
                        justify-self: start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #owner-sub-count,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #owner-sub-count yt-formatted-string {
                        color: rgba(148, 163, 184, 0.88) !important;
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #notification-preference-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscription-notification-toggle-button-renderer-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner > #ytkit-page-btn-watch,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner > #ytkit-watch-btn {
                        position: relative !important;
                        align-self: center !important;
                        justify-self: start !important;
                        margin: 0 !important;
                        max-width: 100% !important;
                        overflow: visible !important;
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #notification-preference-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscription-notification-toggle-button-renderer-next {
                        z-index: 40 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #notification-preference-button *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscription-notification-toggle-button-renderer-next * {
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #notification-preference-button .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #notification-preference-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscription-notification-toggle-button-renderer-next .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscription-notification-toggle-button-renderer-next button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner > #ytkit-page-btn-watch,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner > #ytkit-watch-btn {
                        min-height: 32px !important;
                        height: 32px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.055) !important;
                        color: rgba(248, 250, 252, 0.92) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner yt-subscribe-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscribe-button-renderer {
                        flex: 1 1 100% !important;
                        order: 2 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner yt-subscribe-button-view-model .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner yt-subscribe-button-view-model button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscribe-button-renderer button {
                        min-height: 34px !important;
                        height: 34px !important;
                        min-width: 118px !important;
                        max-width: 100% !important;
                        padding: 0 16px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(var(--ytkit-split-accent-rgb), 0.24) !important;
                        background:
                            linear-gradient(180deg, rgba(var(--ytkit-split-accent-rgb), 0.17), rgba(var(--ytkit-split-accent-rgb), 0.075)),
                            rgba(14, 19, 29, 0.9) !important;
                        color: rgba(248, 250, 252, 0.98) !important;
                        font-size: 12px !important;
                        font-weight: 780 !important;
                        letter-spacing: 0 !important;
                        text-transform: none !important;
                        box-shadow: 0 10px 22px rgba(2, 6, 12, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner yt-subscribe-button-view-model .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner yt-subscribe-button-view-model button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscribe-button-renderer button:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.34) !important;
                        background:
                            linear-gradient(180deg, rgba(var(--ytkit-split-accent-rgb), 0.22), rgba(var(--ytkit-split-accent-rgb), 0.1)),
                            rgba(16, 22, 33, 0.96) !important;
                        color: rgba(255, 255, 255, 0.99) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button .yt-spec-button-shape-next *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner #subscribe-button button *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner yt-subscribe-button-view-model .yt-spec-button-shape-next *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner yt-subscribe-button-view-model button *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner ytd-subscribe-button-renderer button * {
                        color: inherit !important;
                        font-weight: inherit !important;
                        letter-spacing: inherit !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner:has(.ytkit-split-owner-actions),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner.ytd-watch-metadata:has(.ytkit-split-owner-actions) {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        grid-template-areas:
                            "owner"
                            "sub"
                            "actions" !important;
                        align-content: flex-start !important;
                        align-items: center !important;
                        justify-items: start !important;
                        gap: 12px 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner:not(:has(#subscribe-button)):has(.ytkit-split-owner-actions) {
                        grid-template-areas:
                            "owner"
                            "actions" !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner:has(.ytkit-split-owner-actions) ytd-video-owner-renderer {
                        grid-area: owner !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner:has(.ytkit-split-owner-actions) #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner:has(.ytkit-split-owner-actions) yt-subscribe-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner:has(.ytkit-split-owner-actions) ytd-subscribe-button-renderer {
                        grid-area: sub !important;
                        flex: 0 1 auto !important;
                        order: 2 !important;
                        width: auto !important;
                        max-width: 100% !important;
                        justify-self: start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #owner .ytkit-split-owner-actions {
                        grid-area: actions !important;
                        grid-column: 1 / -1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions.ytd-watch-metadata {
                        display: block !important;
                        width: 100% !important;
                        margin: 0 0 10px !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions-inner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #top-level-buttons-computed,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #flexible-item-buttons {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 8px !important;
                        row-gap: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] .ytkit-local-dl-btn {
                        min-height: 32px !important;
                        height: 32px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        color: rgba(226, 232, 240, 0.88) !important;
                        font-size: 11px !important;
                        font-weight: 720 !important;
                        letter-spacing: 0 !important;
                        transform: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #actions button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] .ytkit-local-dl-btn:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.24) !important;
                        background: rgba(255, 255, 255, 0.075) !important;
                        color: rgba(248, 250, 252, 0.98) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments {
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments#comments,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] ytd-comments#comments {
                        display: block !important;
                        visibility: visible !important;
                        margin: 0 !important;
                        padding: 0 0 64px !important;
                        border: none !important;
                        border-radius: 0 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "count sort"
                            "box box" !important;
                        gap: 10px !important;
                        align-content: start !important;
                        align-items: center !important;
                        min-height: 0 !important;
                        margin: 0 0 12px !important;
                        padding: 10px 12px 9px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        border-radius: 12px !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.018)),
                            rgba(13, 17, 25, 0.82) !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #title {
                        grid-area: count !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        margin: 0 !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #count.ytd-comments-header-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-flex !important;
                        align-items: baseline !important;
                        gap: 0.26em !important;
                        margin: 0 !important;
                        color: rgba(248, 250, 252, 0.96) !important;
                        font-size: 15px !important;
                        font-weight: 780 !important;
                        line-height: 1.15 !important;
                        letter-spacing: 0 !important;
                        white-space: nowrap !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer {
                        grid-area: sort !important;
                        justify-self: end !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 30px !important;
                        height: 30px !important;
                        padding: 0 12px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        color: rgba(226, 232, 240, 0.86) !important;
                        font-size: 11px !important;
                        font-weight: 720 !important;
                        letter-spacing: 0 !important;
                        text-transform: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #simple-box,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer {
                        grid-area: box !important;
                        grid-column: 1 / -1 !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        min-height: 0 !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        display: grid !important;
                        grid-template-columns: 32px minmax(0, 1fr) !important;
                        align-items: center !important;
                        gap: 10px !important;
                        width: 100% !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #avatar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #avatar yt-img-shadow {
                        width: 32px !important;
                        height: 32px !important;
                        border-radius: 11px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #placeholder-area,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-commentbox #contenteditable-textarea {
                        display: flex !important;
                        align-items: center !important;
                        width: 100% !important;
                        min-height: 38px !important;
                        margin: 0 !important;
                        padding: 0 11px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        color: rgba(226, 232, 240, 0.74) !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-thread-renderer {
                        margin: 0 0 10px !important;
                        padding: 0 !important;
                        border: none !important;
                        background: transparent !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer {
                        position: relative !important;
                        display: block !important;
                        margin: 0 !important;
                        padding: 12px 54px 12px 12px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.085) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.046), rgba(255, 255, 255, 0.022)),
                            rgba(12, 16, 24, 0.82) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035), 0 14px 30px rgba(2, 6, 12, 0.22) !important;
                        transition: border-color 160ms ease, background 160ms ease, transform 160ms ease !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.22) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.03)),
                            rgba(14, 19, 29, 0.9) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer > #body {
                        display: flex !important;
                        align-items: flex-start !important;
                        gap: 11px !important;
                        position: static !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #author-thumbnail yt-img-shadow {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        flex: 0 0 34px !important;
                        width: 34px !important;
                        height: 34px !important;
                        border-radius: 12px !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model > #body > #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer > #body > #main {
                        min-width: 0 !important;
                        flex: 1 1 auto !important;
                        padding-right: 0 !important;
                        position: static !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #header-author,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #header-author {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: baseline !important;
                        gap: 6px !important;
                        margin: 0 0 4px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #author-text {
                        color: rgba(248, 250, 252, 0.96) !important;
                        font-size: 12.5px !important;
                        font-weight: 760 !important;
                        letter-spacing: 0 !important;
                        line-height: 1.25 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model .published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer .published-time-text {
                        color: rgba(148, 163, 184, 0.78) !important;
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #content-text {
                        display: block !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        color: rgba(241, 245, 249, 0.95) !important;
                        font-size: 14px !important;
                        line-height: 1.54 !important;
                        letter-spacing: 0 !important;
                        word-break: break-word !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #content-text a,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #content-text a {
                        color: rgba(var(--ytkit-split-accent-rgb), 0.92) !important;
                        text-decoration: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-thread-renderer .thread-hitbox,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-thread-renderer .thread-hitbox.style-scope.ytd-comment-thread-renderer {
                        display: none !important;
                        pointer-events: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-thread-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model > #body > #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer > #body > #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model ytd-expander,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer ytd-expander,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #content,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #content,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model .ytAttributedStringHost,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer .ytAttributedStringHost {
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #content-text *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #content-text *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model .ytAttributedStringHost,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer .ytAttributedStringHost {
                        -webkit-user-select: text !important;
                        user-select: text !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer yt-core-attributed-string {
                        cursor: text !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #inline-action-menu {
                        position: absolute !important;
                        top: 11px !important;
                        right: 11px !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: 28px !important;
                        height: 28px !important;
                        min-width: 28px !important;
                        min-height: 28px !important;
                        opacity: 0.64 !important;
                        margin: 0 !important;
                        z-index: 3 !important;
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #inline-action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #inline-action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #inline-action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #inline-action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #action-menu button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #action-menu button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #inline-action-menu button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #inline-action-menu button {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: 28px !important;
                        height: 28px !important;
                        min-width: 28px !important;
                        min-height: 28px !important;
                        padding: 0 !important;
                        border-radius: 10px !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        color: rgba(226, 232, 240, 0.82) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model:hover #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer:hover #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model:hover #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer:hover #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model:focus-within #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer:focus-within #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model:focus-within #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer:focus-within #inline-action-menu {
                        opacity: 1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #action-menu button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #action-menu button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #inline-action-menu button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #inline-action-menu button:hover {
                        background: rgba(255, 255, 255, 0.075) !important;
                        color: rgba(255, 255, 255, 0.96) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #inline-action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #inline-action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #action-menu svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #action-menu svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #inline-action-menu svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #inline-action-menu svg {
                        width: 18px !important;
                        height: 18px !important;
                        color: inherit !important;
                        fill: currentColor !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar {
                        display: block !important;
                        margin: 9px 0 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #toolbar {
                        display: flex !important;
                        flex-wrap: nowrap !important;
                        align-items: center !important;
                        gap: 5px !important;
                        margin: 0 !important;
                        row-gap: 0 !important;
                        width: max-content !important;
                        max-width: 100% !important;
                        white-space: nowrap !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #toolbar > * {
                        flex: 0 0 auto !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #reply-button-end,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #reply-button-end yt-button-shape,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #reply-button-end .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-creator-heart-renderer {
                        display: inline-flex !important;
                        align-items: center !important;
                        flex: 0 0 auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #dislike-button {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #toolbar button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #toolbar .yt-spec-button-shape-next {
                        min-height: 28px !important;
                        height: 28px !important;
                        padding: 0 10px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        color: rgba(226, 232, 240, 0.82) !important;
                        font-size: 11px !important;
                        letter-spacing: 0 !important;
                        transform: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer {
                        position: relative !important;
                        margin: 7px 0 0 12px !important;
                        padding: 4px 0 0 7px !important;
                        border-left: 1px solid rgba(var(--ytkit-split-accent-rgb), 0.18) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-replies-renderer {
                        margin-left: 8px !important;
                        padding-left: 6px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-renderer {
                        padding: 10px 40px 10px 10px !important;
                        border-radius: 12px !important;
                        box-shadow: none !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.034), rgba(255, 255, 255, 0.016)),
                            rgba(9, 13, 20, 0.72) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-view-model > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-renderer > #body {
                        gap: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail yt-img-shadow {
                        flex-basis: 28px !important;
                        width: 28px !important;
                        height: 28px !important;
                        border-radius: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer .show-replies-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies-sub-thread,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread {
                        margin: 6px 0 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer .show-replies-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies-sub-thread .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies-sub-thread button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread button {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        gap: 8px !important;
                        min-width: 0 !important;
                        min-height: 30px !important;
                        height: 30px !important;
                        padding: 0 14px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(148, 163, 184, 0.16) !important;
                        background: linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.018)), rgba(7, 10, 16, 0.62) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
                        color: rgba(226, 232, 240, 0.9) !important;
                        font-size: 12.5px !important;
                        font-weight: 650 !important;
                        letter-spacing: 0 !important;
                        text-transform: none !important;
                        transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease !important;
                        -webkit-user-select: none !important;
                        user-select: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer .show-replies-button button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies-sub-thread .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies-sub-thread button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread button:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.3) !important;
                        background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.022)), rgba(var(--ytkit-split-accent-rgb), 0.12) !important;
                        color: rgba(255, 255, 255, 0.98) !important;
                        transform: translateY(-1px) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread button {
                        color: rgba(203, 213, 225, 0.74) !important;
                        background: linear-gradient(180deg, rgba(255, 255, 255, 0.038), rgba(255, 255, 255, 0.015)), rgba(7, 10, 16, 0.52) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer .show-replies-button yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer .show-replies-button svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies-sub-thread yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #more-replies-sub-thread svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-replies-renderer #less-replies-sub-thread svg {
                        display: inline-flex !important;
                        width: 16px !important;
                        height: 16px !important;
                        min-width: 16px !important;
                        min-height: 16px !important;
                        color: currentColor !important;
                        fill: currentColor !important;
                        opacity: 0.92 !important;
                        flex-shrink: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer {
                        gap: 6px !important;
                        min-height: 0 !important;
                        margin-bottom: 8px !important;
                        padding: 8px 10px 8px !important;
                        border-radius: 12px !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.014)),
                            rgba(12, 16, 24, 0.74) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #title,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #leading-section,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #additional-section {
                        min-height: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #count.ytd-comments-header-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        font-size: 14px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 28px !important;
                        height: 28px !important;
                        padding: 0 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer {
                        min-height: 0 !important;
                        height: auto !important;
                        margin-bottom: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        display: block !important;
                        min-height: 0 !important;
                        gap: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #avatar {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer #placeholder-area,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-commentbox #contenteditable-textarea {
                        min-height: 34px !important;
                        padding: 0 11px !important;
                        border-radius: 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #thumbnail-input-row,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #placeholder-area {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog {
                        display: block !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        grid-column: 1 / -1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #thumbnail-input-row {
                        display: block !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        gap: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #avatar {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-thread-renderer {
                        margin-bottom: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer {
                        padding: 11px 54px 10px 11px !important;
                        border-radius: 12px !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.028), 0 10px 22px rgba(2, 6, 12, 0.2) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-view-model #author-text *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-renderer #author-text * {
                        background: transparent !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        color: rgba(248, 250, 252, 0.96) !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar {
                        margin-top: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #toolbar {
                        gap: 5px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #toolbar button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-comment-engagement-bar #toolbar .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button tp-yt-paper-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button .yt-spec-button-shape-next {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: auto !important;
                        min-width: 28px !important;
                        height: 26px !important;
                        min-height: 26px !important;
                        margin: 0 !important;
                        padding: 0 8px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.045) !important;
                        box-shadow: none !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button svg {
                        max-width: 15px !important;
                        max-height: 15px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments ytd-creator-heart-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button button {
                        width: 26px !important;
                        min-width: 26px !important;
                        height: 26px !important;
                        min-height: 26px !important;
                        padding: 0 !important;
                        border-radius: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button button {
                        border: 1px solid rgba(255, 112, 122, 0.2) !important;
                        background: radial-gradient(circle at 30% 30%, rgba(255, 132, 144, 0.18), rgba(255, 112, 122, 0.07)) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button yt-interaction,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button #hearted-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button #hearted-border {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button #hearted,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button #hearted svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below[style*="position"] #comments #creator-heart-button #hearted .yt-icon-shape {
                        display: block !important;
                        width: 13px !important;
                        height: 13px !important;
                        max-width: 13px !important;
                        max-height: 13px !important;
                        color: rgba(255, 112, 122, 0.98) !important;
                        fill: currentColor !important;
                    }
                `;
    }


    function createStickyVideoFeature(deps = {}) {
        const {
            PageTypes = { WATCH: 'watch' },
            VideoTypeDetector = {
                refresh() { return 'standard'; },
                hasChat() { return false; },
                getChatEl() { return null; }
            },
            getVideoId = () => '',
            _rw = {},
            getFeatureById = () => null,
            storageRead = (_key, fallbackValue) => fallbackValue,
            storageWrite = () => {},
            DebugManager = { log() {} },
            checkAllButtons = null,
            waitForElement = () => {},
            injectStyle = () => ({ remove() {} }),
            stripCommentRestyleCss = value => value,
            addNavigateRule = () => {},
            removeNavigateRule = () => {}
        } = deps;

        return {
            id: 'stickyVideo',
            name: 'Theater Split',
            description: 'Fullscreen video on watch pages. Scroll down to reveal comments side-by-side. Scroll back to top to return to fullscreen.',
            group: 'Watch Page',
            icon: 'picture-in-picture-2',
            pages: [PageTypes.WATCH],

            // ── state ──
            _styleEl: null,
            _splitMetaStyleEl: null,
            _splitCommentsStyleEl: null,
            _isSplit: false,          // right panel is open
            _isActive: false,         // overlay is mounted
            _entering: false,
            _dismissed: false,        // user explicitly closed split — block re-expand until nav
            _chatObserver: null,      // single observer for late chat frame insertion
            _lastVideoId: null,
            _splitWrapper: null,
            _navRuleId: '_theaterSplit',
            _wheelHandler: null,
            _middleMouseHandler: null,
            _commentSelectionMouseDownHandler: null,
            _commentSelectionSelectStartHandler: null,
            _autoscrollState: null,
            _touchHandler: null,
            _touchMoveHandler: null,
            _touchStartY: 0,
            _rightWheelHandler: null,
            _rightTouchHandler: null,
            _rightTouchMoveHandler: null,
            _rightTouchStartY: 0,
            _mastheadDisplay: undefined,
            _windowResizeHandler: null,
            _keyHandler: null,
            _fullscreenHandler: null,
            _fullscreenHidden: false,
            _fullscreenOverlayStash: null, // saved visibility for _positionedEls during native fullscreen
            _playerResizeObs: null,
            _playerResizeDebounceTimer: null,
            _chatObserverTimer: null,
            _scrollToCommentsTimer: null,
            _scrollToCommentsIdle: null,
            _expandFallbackTimer: null,
            _postExpandButtonsTimer: null,
            _splitActionDock: null,
            _splitActionDockMoved: null,
            _splitActionDockObserver: null,
            _splitActionDockTimer: null,
            _splitHeaderBar: null,
            _splitHeaderMovedLogo: null,
            _splitLiveHeader: null,
            _splitLiveActionPinned: null,
            _liveHeaderHeight: 132,
            _videoType: 'standard',        // 'live' | 'vod' | 'standard'
            _positionedEls: [],            // elements we CSS-positioned over right panel
            _scrollTarget: null,           // which element receives scroll/wheel handlers
            _pendingWaits: [],             // cancel fns for in-flight waitForElement chains
            _destroyed: false,             // blocks zombie mounts after teardown

            _getPlayer()  { return document.querySelector('#player-container'); },
            _belowCache: null,
            _belowCacheHref: '',
            _getBelow() {
                if (this._belowCache?.isConnected && this._belowCacheHref === location.href) return this._belowCache;
                this._belowCacheHref = location.href;
                this._belowCache = document.querySelector('#below') || document.querySelector('ytd-watch-metadata')?.parentElement;
                return this._belowCache;
            },
            _getChatEl() {
                const chatEl = VideoTypeDetector.getChatEl();
                return this._isSplitChatCandidate(chatEl) ? chatEl : null;
            },

            _isSplitChatCandidate(chatEl) {
                if (!chatEl || typeof chatEl.hasAttribute !== 'function') return false;
                if (chatEl.hidden === true || chatEl.hasAttribute('hidden')) return false;
                if (typeof chatEl.getAttribute === 'function' && chatEl.getAttribute('aria-hidden') === 'true') return false;
                return true;
            },

            _hasSplitCommentsSurface(below) {
                return !!below?.querySelector?.('ytd-comments#comments, ytd-comments, ytd-comments-header-renderer, ytd-comment-thread-renderer');
            },

            _resolveSplitPanelType(rawType, chatEl, below) {
                const type = rawType || 'standard';
                const hasChat = this._isSplitChatCandidate(chatEl);
                const hasComments = this._hasSplitCommentsSurface(below);
                const chatCollapsed = hasChat && typeof chatEl.hasAttribute === 'function' && chatEl.hasAttribute('collapsed');

                if (type === 'live') return 'live';
                if (type === 'vod') {
                    if (hasChat && !chatCollapsed) return 'vod';
                    return below ? 'standard' : 'vod';
                }
                if (type === 'premiere') {
                    return hasChat && !hasComments && !chatCollapsed ? 'live' : 'standard';
                }
                if (type === 'standard' && hasChat && !hasComments && !chatCollapsed) return 'live';
                return 'standard';
            },

            // Nudge YouTube's player to recalculate control bar layout.
            _triggerPlayerResize() {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = setTimeout(() => {
                    this._resizeTimer = null;
                    window.dispatchEvent(new Event('resize'));
                }, 200);
            },

            _positionOverRight(el, rightPct, topOffset, heightStr) {
                if (!el) return;
                this._setStyles(el, {
                    position:'fixed', top:topOffset||'0', right:'0',
                    width:`calc(${rightPct}% - 6px)`, 'max-width':'none',
                    height:heightStr||'100vh', margin:'0',
                    'overflow-y':'auto', 'overflow-x':'hidden',
                    'z-index':'10001', background:'linear-gradient(180deg, #0b0f16 0%, #070a10 100%)', padding:'0',
                    'box-sizing':'border-box', visibility:'visible',
                    'pointer-events':'auto', display:'block',
                    'scrollbar-width':'thin', 'scrollbar-color':'rgba(255,255,255,0.15) transparent'
                });
                this._positionedEls.push(el);
            },

            _unpositionEl(el) {
                this._removeStyles(el, ['position','top','right','width','max-width','height','margin',
                    'overflow-y','overflow-x','z-index','background','padding','box-sizing',
                    'visibility','pointer-events','display','scrollbar-width','scrollbar-color','border-radius']);
            },

            // Clean up all positioned elements
            _unpositionAll() {
                (this._positionedEls || []).forEach(el => this._unpositionEl(el));
                this._positionedEls = [];
                this._scrollTarget = null;
            },

            _isSplitScrollable(el) {
                return !!(el && el.scrollHeight > el.clientHeight + 1);
            },

            _isSplitCommentTextTarget(target) {
                if (!this._isActive || !this._isSplit) return false;
                const node = target instanceof Element ? target : target?.parentElement;
                if (!node) return false;
                const thread = node.closest('ytd-comment-thread-renderer');
                if (!thread || !thread.closest('#below[style*="position"] #comments')) return false;
                if (node.closest([
                    'button',
                    '[role="button"]',
                    'yt-icon-button',
                    'tp-yt-paper-button',
                    'ytd-button-renderer',
                    'ytd-menu-renderer',
                    'ytd-toggle-button-renderer',
                    '#action-menu',
                    '#inline-action-menu',
                    '#reply-button-end',
                    '#creator-heart',
                    '#more-replies',
                    '#more-replies-sub-thread',
                    '#less-replies',
                    '#less-replies-sub-thread'
                ].join(','))) return false;
                return !!node.closest([
                    '#content',
                    '#content-text',
                    'yt-attributed-string',
                    '.ytAttributedStringHost',
                    'yt-core-attributed-string'
                ].join(','));
            },

            _shouldIgnoreSplitAutoscroll(target) {
                const node = target instanceof Element ? target : target?.parentElement;
                if (!node) return true;
                return !!node.closest([
                    'a[href]',
                    'button',
                    'input',
                    'textarea',
                    'select',
                    'option',
                    'summary',
                    '[role="button"]',
                    '[role="menuitem"]',
                    '[contenteditable="true"]',
                    'yt-icon-button',
                    'tp-yt-paper-button',
                    'ytd-button-renderer',
                    'ytd-menu-renderer',
                    'ytd-toggle-button-renderer'
                ].join(','));
            },

            _getSplitAutoscrollTarget(target) {
                if (!this._isActive || !this._isSplit) return null;
                const node = target instanceof Element ? target : target?.parentElement;
                if (!node) return null;

                const positionedHit = (this._positionedEls || []).find(el => el?.contains?.(node) && this._isSplitScrollable(el));
                if (positionedHit) return positionedHit;

                const right = this._splitWrapper?.querySelector('#ytkit-split-right');
                if (right?.contains(node) && this._isSplitScrollable(right)) return right;

                const fallback = this._scrollTarget;
                return this._isSplitScrollable(fallback) ? fallback : null;
            },

            _startSplitAutoscroll(e) {
                if (!this._isActive || !this._isSplit || e.button !== 1) return;
                if (this._shouldIgnoreSplitAutoscroll(e.target)) return;
                const scrollEl = this._getSplitAutoscrollTarget(e.target);
                if (!scrollEl) return;

                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation?.();
                this._stopSplitAutoscroll();

                const state = {
                    scrollEl,
                    originY: e.clientY,
                    currentY: e.clientY,
                    rafId: 0,
                    lastTs: performance.now(),
                    moveHandler: null,
                    upHandler: null,
                    keyHandler: null,
                    blurHandler: null
                };

                state.moveHandler = (moveEvent) => {
                    state.currentY = moveEvent.clientY;
                };
                state.upHandler = (upEvent) => {
                    if (upEvent.button !== 1) return;
                    upEvent.preventDefault();
                    upEvent.stopPropagation();
                    this._stopSplitAutoscroll();
                };
                state.keyHandler = (keyEvent) => {
                    if (keyEvent.key !== 'Escape') return;
                    keyEvent.preventDefault();
                    this._stopSplitAutoscroll();
                };
                state.blurHandler = () => this._stopSplitAutoscroll();

                this._autoscrollState = state;
                document.addEventListener('mousemove', state.moveHandler, true);
                document.addEventListener('mouseup', state.upHandler, true);
                document.addEventListener('keydown', state.keyHandler, true);
                window.addEventListener('blur', state.blurHandler);

                const tick = (now) => {
                    if (this._autoscrollState !== state) return;
                    const dy = state.currentY - state.originY;
                    const distance = Math.abs(dy);
                    const deadZone = 10;
                    const velocity = distance <= deadZone
                        ? 0
                        : Math.sign(dy) * Math.min(42, Math.pow((distance - deadZone) / 8, 1.25));
                    const dt = Math.min(48, now - state.lastTs) / 16.67;
                    state.lastTs = now;
                    if (velocity) state.scrollEl.scrollTop += velocity * dt;
                    state.rafId = requestAnimationFrame(tick);
                };
                state.rafId = requestAnimationFrame(tick);
            },

            _stopSplitAutoscroll() {
                const state = this._autoscrollState;
                if (!state) return;
                this._autoscrollState = null;
                if (state.rafId) cancelAnimationFrame(state.rafId);
                if (state.moveHandler) document.removeEventListener('mousemove', state.moveHandler, true);
                if (state.upHandler) document.removeEventListener('mouseup', state.upHandler, true);
                if (state.keyHandler) document.removeEventListener('keydown', state.keyHandler, true);
                if (state.blurHandler) window.removeEventListener('blur', state.blurHandler);
            },

            _scheduleSplitActionDock(delay = 80) {
                clearTimeout(this._splitActionDockTimer);
                this._splitActionDockTimer = setTimeout(() => {
                    this._splitActionDockTimer = null;
                    this._dockSplitHeader();
                    this._dockSplitActions();
                }, delay);
            },

            _getSplitTitleEl() {
                const below = this._getBelow();
                return below?.querySelector('ytd-watch-metadata #title, #title.ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata #title, #title.ytd-watch-metadata');
            },

            _createSplitYoutubeIcon() {
                const ns = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(ns, 'svg');
                svg.setAttribute('viewBox', '0 0 28 20');
                svg.setAttribute('aria-hidden', 'true');

                const rect = document.createElementNS(ns, 'rect');
                rect.setAttribute('x', '1.5');
                rect.setAttribute('y', '1.5');
                rect.setAttribute('width', '25');
                rect.setAttribute('height', '17');
                rect.setAttribute('rx', '5');
                rect.setAttribute('fill', 'currentColor');
                svg.appendChild(rect);

                const play = document.createElementNS(ns, 'path');
                play.setAttribute('d', 'M11 6.25 18.5 10 11 13.75Z');
                play.setAttribute('fill', '#fff');
                svg.appendChild(play);

                return svg;
            },

            _ensureSplitHeaderMeta(bar) {
                if (!bar) return null;

                let meta = bar.querySelector(':scope > .ytkit-split-upload-meta');
                let date = bar.querySelector('.ytkit-split-upload-date');
                if (!meta) {
                    meta = document.createElement('span');
                    meta.className = 'ytkit-split-upload-meta';
                    meta.setAttribute('translate', 'no');
                    if (date) {
                        date.removeAttribute('translate');
                        bar.insertBefore(meta, date);
                        meta.appendChild(date);
                    } else {
                        date = document.createElement('span');
                        date.className = 'ytkit-split-upload-date';
                        meta.appendChild(date);
                        bar.appendChild(meta);
                    }
                }

                if (!date) {
                    date = document.createElement('span');
                    date.className = 'ytkit-split-upload-date';
                    meta.insertBefore(date, meta.firstChild);
                }

                let views = meta.querySelector(':scope > .ytkit-split-view-count');
                if (!views) {
                    views = document.createElement('span');
                    views.className = 'ytkit-split-view-count';
                    meta.appendChild(views);
                }

                return meta;
            },

            _ensureSplitHeaderBar() {
                const title = this._getSplitTitleEl();
                if (!title) return null;

                let bar = title.querySelector(':scope > .ytkit-split-title-bar');
                if (!bar) {
                    bar = document.createElement('div');
                    bar.className = 'ytkit-split-title-bar';

                    const homeLink = document.createElement('a');
                    homeLink.className = 'ytkit-split-youtube-link';
                    homeLink.href = 'https://www.youtube.com/feed/subscriptions';
                    homeLink.title = 'Go to subscriptions';
                    homeLink.setAttribute('aria-label', 'Go to subscriptions');
                    homeLink.appendChild(this._createSplitYoutubeIcon());
                    bar.appendChild(homeLink);

                    const actions = document.createElement('div');
                    actions.className = 'ytkit-split-header-actions';
                    actions.setAttribute('aria-label', 'Quick links');
                    bar.appendChild(actions);

                    const meta = document.createElement('span');
                    meta.className = 'ytkit-split-upload-meta';
                    meta.setAttribute('translate', 'no');
                    const date = document.createElement('span');
                    date.className = 'ytkit-split-upload-date';
                    meta.appendChild(date);
                    const views = document.createElement('span');
                    views.className = 'ytkit-split-view-count';
                    meta.appendChild(views);
                    bar.appendChild(meta);

                    title.insertBefore(bar, title.firstChild);
                }

                this._ensureSplitHeaderMeta(bar);
                this._splitHeaderBar = bar;
                return bar;
            },

            _extractSplitFallbackDate(text) {
                const normalized = String(text || '').replace(/\u00A0/g, ' ').trim();
                if (!normalized) return null;

                const segments = normalized.split(/[•|]/).map(part => part.trim()).filter(Boolean);
                const preferred = segments.find(segment => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(segment))
                    || normalized;
                const cleaned = preferred
                    .replace(/^(Premiered|Published on|Published|Uploaded|Streamed live on|Started streaming on|Streamed)\s*/i, '')
                    .trim();
                const parsed = new Date(cleaned);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            },

            _getSplitDateAnchor() {
                const root = this._getBelow() || document;
                const candidates = Array.from(root.querySelectorAll(
                    '#info-strings yt-formatted-string, ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string'
                ));
                return candidates.find(el => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(el.textContent || ''))
                    || candidates[0]
                    || null;
            },

            _getSplitPublishDate(anchorEl) {
                const currentVideoId = getVideoId();

                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const responseVideoId = playerResponse?.videoDetails?.videoId;
                    if (!responseVideoId || !currentVideoId || responseVideoId === currentVideoId) {
                        const microformat = playerResponse?.microformat?.playerMicroformatRenderer;
                        const raw = microformat?.publishDate
                            || microformat?.uploadDate
                            || microformat?.liveBroadcastDetails?.startTimestamp
                            || microformat?.liveBroadcastDetails?.endTimestamp;
                        if (raw) {
                            const parsed = new Date(raw);
                            if (!Number.isNaN(parsed.getTime())) return parsed;
                        }
                    }
                } catch { /* reason: player response date unavailable; fallback to page text */ }

                const meta = document.querySelector('meta[itemprop="datePublished"], meta[itemprop="uploadDate"]');
                const metaValue = meta?.getAttribute('content');
                if (metaValue) {
                    const parsed = new Date(metaValue);
                    if (!Number.isNaN(parsed.getTime())) return parsed;
                }

                return this._extractSplitFallbackDate(anchorEl?.textContent || '');
            },

            _formatSplitUploadDate(date) {
                return new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }).format(date);
            },

            _getSplitUploadDateText() {
                const anchor = this._getSplitDateAnchor();
                const publishDate = this._getSplitPublishDate(anchor);
                if (publishDate) return `Uploaded ${this._formatSplitUploadDate(publishDate)}`;

                const rawText = String(anchor?.textContent || '').replace(/\u00A0/g, ' ').trim();
                if (!rawText) return '';

                const segments = rawText.split(/[•|]/).map(part => part.trim()).filter(Boolean);
                const preferred = segments.find(segment => /(?:premiered|streamed|published|uploaded|\b\d{4}\b)/i.test(segment))
                    || segments[0]
                    || rawText;

                if (/^Published on\s+/i.test(preferred)) return preferred.replace(/^Published on\s+/i, 'Uploaded ');
                if (/^(Uploaded|Published|Premiered|Streamed)/i.test(preferred)) return preferred;
                return `Uploaded ${preferred}`;
            },

            _formatSplitViewCount(value) {
                const count = Number(value);
                if (!Number.isFinite(count) || count < 0) return '';
                return `${new Intl.NumberFormat().format(Math.floor(count))} views`;
            },

            _getSplitFallbackViewCountText() {
                const root = this._getBelow() || document;
                const candidates = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #metadata-line span'
                ));
                return candidates
                    .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
                    .find(text => /\bviews?\b/i.test(text)) || '';
            },

            _getSplitViewCountText() {
                const currentVideoId = getVideoId();
                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const responseVideoId = playerResponse?.videoDetails?.videoId;
                    if (!responseVideoId || !currentVideoId || responseVideoId === currentVideoId) {
                        const viewText = this._formatSplitViewCount(playerResponse?.videoDetails?.viewCount);
                        if (viewText) return viewText;
                    }
                } catch { /* reason: player response view count unavailable; fallback to DOM text */ }
                return this._getSplitFallbackViewCountText();
            },

            _getSplitVideoTitleText() {
                const root = this._getBelow() || document;
                const el = root.querySelector('ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata #title yt-formatted-string')
                    || document.querySelector('ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata #title yt-formatted-string');
                const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) return text;
                try {
                    const title = _rw.ytInitialPlayerResponse?.videoDetails?.title;
                    if (title) return String(title).replace(/\s+/g, ' ').trim();
                } catch { /* reason: player response title unavailable; fallback to document title */ }
                return document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim() || 'Live video';
            },

            _formatSplitLiveTitleText(title) {
                const cleaned = String(title || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .replace(/^[\s\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{1F7E3}\u{1F7E4}\u{26AB}\u{26AA}\u{25CF}\u{2B24}]+/u, '')
                    .replace(/^(?:LIVE(?:\s+NOW|\s+STREAM)?|WATCHING\s+LIVE)\s*[-:|\u2022]\s*/i, '')
                    .trim();
                return cleaned || String(title || '').replace(/\s+/g, ' ').trim() || 'Live video';
            },

            _getSplitChannelText() {
                const root = this._getBelow() || document;
                const el = root.querySelector('ytd-video-owner-renderer #channel-name #text, ytd-video-owner-renderer #channel-name yt-formatted-string, #owner #channel-name #text, #owner yt-formatted-string.ytd-channel-name')
                    || document.querySelector('ytd-video-owner-renderer #channel-name #text, ytd-video-owner-renderer #channel-name yt-formatted-string, #owner #channel-name #text, #owner yt-formatted-string.ytd-channel-name');
                const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) return text;
                try {
                    return String(_rw.ytInitialPlayerResponse?.videoDetails?.author || '').replace(/\s+/g, ' ').trim();
                } catch { /* reason: player response author unavailable; fallback to DOM text */ }
                return '';
            },

            _formatSplitLiveInfoText(text, viewText = '') {
                let normalized = String(text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                if (!normalized) return '';
                if (viewText) normalized = normalized.replace(viewText, ' ');
                normalized = normalized
                    .replace(/\b\d[\d,.]*\s*(?:K|M|B)?\s*(?:watching(?:\s+now)?|waiting|views?)\b/i, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const match = normalized.match(/\b(?:Started streaming|Streamed live(?: on)?|Scheduled for|Premiered|Started)\b[^#|\u2022]*/i);
                return (match?.[0] || '')
                    .replace(/\s+Uploaded\b.*$/i, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            },

            _getSplitLiveInfoText(viewText = '') {
                const root = this._getBelow() || document;
                const parts = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #owner-sub-count, ytd-watch-metadata #metadata-line span, ytd-watch-info-text yt-formatted-string, factoid-renderer yt-formatted-string'
                )).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                for (const text of parts) {
                    const info = this._formatSplitLiveInfoText(text, viewText);
                    if (info) return info;
                }
                return '';
            },

            _formatSplitLiveViewText(text) {
                const normalized = String(text || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
                const liveMatch = normalized.match(/\b\d[\d,.]*\s*(?:K|M|B)?\s*(?:watching(?:\s+now)?|waiting)\b/i);
                if (liveMatch) return liveMatch[0];
                const viewMatch = normalized.match(/\b\d[\d,.]*\s*(?:K|M|B)?\s*views?\b/i);
                return viewMatch?.[0] || '';
            },

            _getSplitLiveViewCountText() {
                const root = this._getBelow() || document;
                const parts = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #info-container yt-formatted-string, ytd-watch-metadata #info-text yt-formatted-string, ytd-watch-metadata #metadata-line span, ytd-watch-info-text yt-formatted-string, factoid-renderer yt-formatted-string'
                )).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
                const watchingText = parts.map(text => this._formatSplitLiveViewText(text)).find(Boolean);
                if (watchingText) return watchingText;
                try {
                    const playerResponse = _rw.ytInitialPlayerResponse;
                    const liveDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
                    const isLive = playerResponse?.videoDetails?.isLive || playerResponse?.videoDetails?.isLiveContent || !!liveDetails;
                    const viewText = isLive ? this._formatSplitViewCount(playerResponse?.videoDetails?.viewCount).replace(/\s+views$/i, ' watching') : '';
                    if (viewText) return viewText;
                } catch { /* reason: player response live count unavailable; fallback to visible metadata */ }
                return parts.find(text => /\bviews?\b/i.test(text))
                    || this._getSplitViewCountText();
            },

            _createSplitLiveHeaderNode() {
                const header = document.createElement('section');
                header.className = 'ytkit-split-live-header';
                header.setAttribute('aria-label', 'Live video information');
                header.style.cssText = [
                    'position:fixed',
                    'top:0',
                    'right:0',
                    `height:${this._liveHeaderHeight}px`,
                    'z-index:10003',
                    'padding:10px 12px',
                    'box-sizing:border-box',
                    'pointer-events:auto',
                    'color:rgba(245,247,250,0.96)',
                    'background:linear-gradient(180deg,rgba(9,12,18,0.98),rgba(8,11,17,0.94))',
                    'border-left:1px solid rgba(255,255,255,0.07)',
                    'border-bottom:1px solid rgba(255,255,255,0.08)',
                    'box-shadow:0 16px 30px rgba(0,0,0,0.32)'
                ].join(';');

                const card = document.createElement('div');
                card.className = 'ytkit-split-live-card';
                card.style.cssText = [
                    'height:100%',
                    'border-radius: 12px',
                    'border:1px solid rgba(255,255,255,0.10)',
                    'background:rgba(18,23,32,0.88)',
                    'box-shadow:inset 0 1px 0 rgba(255,255,255,0.06)',
                    'position:relative',
                    'display:grid',
                    'grid-template-columns:minmax(0,1fr) auto',
                    'grid-template-areas:"channel actions" "meta meta" "title title"',
                    'align-content:center',
                    'align-items:stretch',
                    'gap:5px',
                    'padding:12px 15px 11px',
                    'box-sizing:border-box',
                    'overflow:visible'
                ].join(';');

                const channel = document.createElement('div');
                channel.className = 'ytkit-split-live-channel';
                channel.setAttribute('translate', 'no');
                channel.style.cssText = 'grid-area:channel;min-width:0;max-width:100%;font:800 14px/1.25 Arial,sans-serif;color:rgba(245,247,250,0.98);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                card.appendChild(channel);

                const meta = document.createElement('div');
                meta.className = 'ytkit-split-live-meta';
                meta.style.cssText = 'grid-area:meta;display:flex;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:5px 8px;min-width:0;max-width:100%;overflow:hidden;';

                const liveBadge = document.createElement('span');
                liveBadge.className = 'ytkit-split-live-badge';
                liveBadge.textContent = 'LIVE';
                liveBadge.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;font:800 11px/1.2 Arial,sans-serif;letter-spacing:0;color:#fff;background:#dc2626;border-radius: 10px;padding:5px 9px;box-shadow:0 8px 18px rgba(220,38,38,0.22);';
                meta.appendChild(liveBadge);

                const viewCount = document.createElement('span');
                viewCount.className = 'ytkit-split-live-view-count';
                viewCount.setAttribute('translate', 'no');
                viewCount.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;min-width:0;max-width:100%;font:700 12px/1.2 Arial,sans-serif;color:rgba(248,250,252,0.94);background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);border-radius: 10px;padding:5px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                meta.appendChild(viewCount);

                const date = document.createElement('span');
                date.className = 'ytkit-split-live-date';
                date.setAttribute('translate', 'no');
                date.style.cssText = 'display:-webkit-box;flex:1 1 240px;min-width:150px;max-width:100%;font:650 12px/1.25 Arial,sans-serif;color:rgba(148,163,184,0.86);overflow:hidden;text-overflow:ellipsis;-webkit-line-clamp:1;-webkit-box-orient:vertical;';
                meta.appendChild(date);
                card.appendChild(meta);

                const title = document.createElement('h2');
                title.className = 'ytkit-split-live-title';
                title.style.cssText = [
                    'grid-area:title',
                    'margin:0',
                    'font:800 16px/1.22 Arial,sans-serif',
                    'letter-spacing:0',
                    'color:rgba(245,247,250,0.98)',
                    'display:-webkit-box',
                    '-webkit-line-clamp:2',
                    '-webkit-box-orient:vertical',
                    'overflow:hidden',
                    'overflow-wrap:anywhere'
                ].join(';');
                card.appendChild(title);

                const actions = document.createElement('div');
                actions.className = 'ytkit-split-live-actions';
                actions.setAttribute('aria-label', 'Live video actions');
                actions.style.cssText = 'grid-area:actions;display:flex;align-items:center;align-self:center;justify-content:flex-end;gap:8px;height:42px;min-height:42px;min-width:max-content;max-width:330px;overflow:visible;';
                card.appendChild(actions);

                header.appendChild(card);
                return header;
            },

            _ensureSplitLiveHeader(rightPct) {
                let header = this._splitLiveHeader;
                if (!header || !header.isConnected) {
                    header = this._createSplitLiveHeaderNode();
                    document.body.appendChild(header);
                    this._splitLiveHeader = header;
                }

                const headerWidth = Math.max(0, Math.round(window.innerWidth * rightPct / 100));
                const compact = headerWidth > 0 && headerWidth < 760;
                const liveHeaderHeight = compact ? 146 : this._liveHeaderHeight;
                header.dataset.ytkitLiveCompact = compact ? '1' : '0';
                header.style.width = `calc(${rightPct}% - 2px)`;
                header.style.height = `${liveHeaderHeight}px`;
                const titleEl = header.querySelector('.ytkit-split-live-title');
                const channelEl = header.querySelector('.ytkit-split-live-channel');
                const metaEl = header.querySelector('.ytkit-split-live-meta');
                const viewEl = header.querySelector('.ytkit-split-live-view-count');
                const dateEl = header.querySelector('.ytkit-split-live-date');
                const title = this._formatSplitLiveTitleText(this._getSplitVideoTitleText());
                const channel = this._getSplitChannelText();
                const dateText = this._getSplitUploadDateText();
                const viewText = this._getSplitLiveViewCountText();
                const infoText = this._getSplitLiveInfoText(viewText);
                const supplementalInfo = viewText && infoText === viewText ? '' : infoText;
                const dateInfo = [supplementalInfo, dateText].filter(Boolean).join(' | ');
                if (channelEl) {
                    channelEl.textContent = channel;
                    channelEl.hidden = !channel;
                    if (channel) channelEl.title = channel;
                    else channelEl.removeAttribute('title');
                }
                if (titleEl) {
                    titleEl.textContent = title;
                    titleEl.hidden = !title;
                    titleEl.style.setProperty('-webkit-line-clamp', compact ? '2' : '1');
                    if (title) titleEl.title = title;
                    else titleEl.removeAttribute('title');
                }
                if (metaEl) metaEl.hidden = false;
                if (viewEl) {
                    viewEl.textContent = viewText;
                    viewEl.hidden = !viewText;
                    if (viewText) viewEl.title = viewText;
                    else viewEl.removeAttribute('title');
                }
                if (dateEl) {
                    dateEl.textContent = dateInfo;
                    dateEl.hidden = !dateInfo;
                    dateEl.style.setProperty('-webkit-line-clamp', compact ? '2' : '1');
                    if (dateInfo) dateEl.title = dateInfo;
                    else dateEl.removeAttribute('title');
                }
                header.setAttribute('aria-label', ['Live video', channel, viewText, title].filter(Boolean).join(' | '));
                this._dockSplitLiveHeaderActions();
                return liveHeaderHeight;
            },

            _removeSplitLiveHeader() {
                this._splitLiveHeader?.remove();
                this._splitLiveHeader = null;
            },

            _dockSplitHeader() {
                if (!this._isActive || !this._isSplit) return;

                const bar = this._ensureSplitHeaderBar();
                if (!bar) return;

                const metaEl = bar.querySelector('.ytkit-split-upload-meta');
                const dateEl = bar.querySelector('.ytkit-split-upload-date');
                const viewEl = bar.querySelector('.ytkit-split-view-count');
                const dateText = this._getSplitUploadDateText();
                const viewText = this._getSplitViewCountText();
                if (dateEl) {
                    dateEl.textContent = dateText;
                    dateEl.hidden = !dateText;
                }
                if (viewEl) {
                    viewEl.textContent = viewText;
                    viewEl.hidden = !viewText;
                }
                if (metaEl) {
                    const metaLabel = [dateText, viewText].filter(Boolean).join(' | ');
                    metaEl.hidden = !metaLabel;
                    if (metaLabel) {
                        metaEl.title = metaLabel;
                        metaEl.setAttribute('aria-label', metaLabel);
                    } else {
                        metaEl.removeAttribute('title');
                        metaEl.removeAttribute('aria-label');
                    }
                }

                const actions = bar.querySelector('.ytkit-split-header-actions');
                const logoWrap = document.getElementById('ytkit-po-logo-wrap');
                if (actions && logoWrap && logoWrap.parentElement !== actions) {
                    if (!this._splitHeaderMovedLogo) {
                        this._splitHeaderMovedLogo = {
                            parent: logoWrap.parentNode,
                            next: logoWrap.nextSibling
                        };
                    }
                    logoWrap.dataset.ytkitSplitHeaderDocked = '1';
                    actions.appendChild(logoWrap);
                    getFeatureById('quickLinkMenu')?._syncLauncherChrome?.(logoWrap);
                }
                if (actions) actions.hidden = !logoWrap;
            },

            _restoreSplitHeader() {
                const logoWrap = document.getElementById('ytkit-po-logo-wrap');
                const moved = this._splitHeaderMovedLogo;
                if (logoWrap) delete logoWrap.dataset.ytkitSplitHeaderDocked;
                if (logoWrap && moved) {
                    const fallbackParent = document.getElementById('ytkit-player-controls');
                    const parent = moved.parent?.isConnected ? moved.parent : fallbackParent;
                    if (parent) {
                        if (moved.next?.parentNode === parent) parent.insertBefore(logoWrap, moved.next);
                        else parent.appendChild(logoWrap);
                    }
                }
                this._splitHeaderMovedLogo = null;

                document.querySelectorAll('.ytkit-split-title-bar').forEach(bar => bar.remove());
                this._splitHeaderBar = null;
            },

            _getSplitOwner() {
                const below = this._getBelow();
                return below?.querySelector('ytd-watch-metadata #owner, #owner.ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata #owner, #owner.ytd-watch-metadata');
            },

            _ensureSplitActionDock() {
                const owner = this._getSplitOwner();
                if (!owner) return null;

                let dock = owner.querySelector(':scope > .ytkit-split-owner-actions');
                if (!dock) {
                    dock = document.createElement('div');
                    dock.className = 'ytkit-split-owner-actions';
                    dock.setAttribute('aria-label', 'Video actions');
                    const subscribe = owner.querySelector('#subscribe-button');
                    if (subscribe?.nextSibling) owner.insertBefore(dock, subscribe.nextSibling);
                    else owner.appendChild(dock);
                }

                this._splitActionDock = dock;
                return dock;
            },

            _findSplitLikeControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #actions segmented-like-dislike-button-view-model',
                    'ytd-watch-metadata #actions ytd-segmented-like-dislike-button-renderer',
                    'ytd-watch-metadata #actions like-button-view-model',
                    'ytd-watch-metadata #actions #segmented-like-button'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-owner-actions')) return el;
                }
                return null;
            },

            _findSplitSubscribeControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #owner #subscribe-button',
                    'ytd-watch-metadata #owner yt-subscribe-button-view-model',
                    'ytd-watch-metadata #owner ytd-subscribe-button-renderer'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-live-actions')) return el;
                }
                return null;
            },

            _findSplitNotificationControl() {
                const root = this._getBelow() || document;
                const selectors = [
                    'ytd-watch-metadata #owner #notification-preference-button',
                    'ytd-watch-metadata #owner ytd-subscription-notification-toggle-button-renderer-next'
                ];

                for (const selector of selectors) {
                    const el = root.querySelector(selector);
                    if (el && !el.closest('.ytkit-split-owner-actions') && !el.closest('.ytkit-split-live-actions')) return el;
                }
                return null;
            },

            _findSplitPageControl() {
                const owner = this._getSplitOwner();
                if (!owner) return null;
                return owner.querySelector(':scope > #ytkit-page-btn-watch, :scope > #ytkit-watch-btn');
            },

            _findSplitDownloadControl() {
                const root = this._getBelow() || document;
                const controls = Array.from(root.querySelectorAll(
                    'ytd-watch-metadata #actions .ytkit-local-dl-btn, ytd-watch-metadata #top-level-buttons-computed .ytkit-local-dl-btn'
                ));
                return controls.find(el => !el.closest('.ytkit-split-owner-actions')) || null;
            },

            _dockSplitControl(control, dock) {
                if (!control || !dock) return false;
                if (control.parentElement === dock) {
                    control.dataset.ytkitSplitDocked = '1';
                    return false;
                }

                if (!this._splitActionDockMoved) this._splitActionDockMoved = new Map();
                if (!this._splitActionDockMoved.has(control)) {
                    this._splitActionDockMoved.set(control, {
                        parent: control.parentNode,
                        next: control.nextSibling
                    });
                }

                control.dataset.ytkitSplitDocked = '1';
                dock.appendChild(control);
                return true;
            },

            _polishSplitLiveHeaderAction(control) {
                if (!control) return;
                control.style.setProperty('display', 'inline-flex', 'important');
                control.style.setProperty('align-items', 'center', 'important');
                control.style.setProperty('margin', '0', 'important');
                control.style.setProperty('overflow', 'visible', 'important');
                control.querySelectorAll('dislike-button-view-model, #segmented-dislike-button, .ytDislikeButtonViewModelHost').forEach(el => {
                    el.style.setProperty('display', 'none', 'important');
                });
                control.querySelectorAll('button, .yt-spec-button-shape-next, .ytSpecButtonShapeNextHost').forEach(button => {
                    button.style.setProperty('height', '32px', 'important');
                    button.style.setProperty('min-height', '32px', 'important');
                    button.style.setProperty('border-radius', '10px', 'important');
                    button.style.setProperty('white-space', 'nowrap', 'important');
                });
            },

            _restoreSplitLiveHeaderActionPin(control, state) {
                if (!control) return;
                delete control.dataset.ytkitSplitLivePinned;
                if (state?.style == null) control.removeAttribute('style');
                else control.setAttribute('style', state.style);
            },

            _restoreSplitLiveHeaderActionPins() {
                const pinned = this._splitLiveActionPinned;
                if (pinned) {
                    pinned.forEach((state, control) => this._restoreSplitLiveHeaderActionPin(control, state));
                    pinned.clear();
                }
                this._splitLiveActionPinned = null;

                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                if (actions) {
                    actions.hidden = true;
                    actions.style.removeProperty('width');
                    actions.style.removeProperty('min-width');
                }
            },

            _setSplitLiveHeaderActionPinsHidden(hidden) {
                this._splitLiveActionPinned?.forEach((_, control) => {
                    if (!control?.isConnected) return;
                    control.style.setProperty('visibility', hidden ? 'hidden' : 'visible', 'important');
                });
            },

            _layoutSplitLiveHeaderActions() {
                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                const pinned = this._splitLiveActionPinned;
                if (!actions || !pinned?.size) return;

                const controls = Array.from(pinned.keys()).filter(control => control?.isConnected);
                if (!controls.length) {
                    this._restoreSplitLiveHeaderActionPins();
                    return;
                }

                const gap = 8;
                const metrics = controls.map(control => {
                    const rect = control.getBoundingClientRect();
                    return {
                        control,
                        width: Math.max(32, Math.ceil(rect.width || control.offsetWidth || 96)),
                        height: Math.max(32, Math.ceil(rect.height || control.offsetHeight || 32))
                    };
                });
                const totalWidth = metrics.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, metrics.length - 1);
                actions.hidden = false;
                actions.style.width = `${totalWidth}px`;
                actions.style.minWidth = `${totalWidth}px`;

                const box = actions.getBoundingClientRect();
                const topBase = box.top + Math.max(0, (box.height - 32) / 2);
                let left = box.right - totalWidth;

                metrics.forEach(({ control, width, height }) => {
                    const top = topBase + Math.max(0, (32 - height) / 2);
                    control.dataset.ytkitSplitLivePinned = '1';
                    control.style.setProperty('position', 'fixed', 'important');
                    control.style.setProperty('left', `${Math.round(left)}px`, 'important');
                    control.style.setProperty('top', `${Math.round(top)}px`, 'important');
                    control.style.setProperty('z-index', '10006', 'important');
                    control.style.setProperty('pointer-events', 'auto', 'important');
                    control.style.setProperty('visibility', this._fullscreenHidden ? 'hidden' : 'visible', 'important');
                    control.style.setProperty('transform', 'none', 'important');
                    control.style.setProperty('max-width', 'none', 'important');
                    left += width + gap;
                });
            },

            _pinSplitLiveHeaderActions(controls, actions) {
                if (!this._splitLiveActionPinned) this._splitLiveActionPinned = new Map();
                const current = new Set(controls);

                this._splitLiveActionPinned.forEach((state, control) => {
                    if (current.has(control) && control.isConnected) return;
                    this._restoreSplitLiveHeaderActionPin(control, state);
                    this._splitLiveActionPinned.delete(control);
                });

                controls.forEach(control => {
                    if (!this._splitLiveActionPinned.has(control)) {
                        this._splitLiveActionPinned.set(control, {
                            style: control.getAttribute('style')
                        });
                    }
                    this._polishSplitLiveHeaderAction(control);
                });

                actions.hidden = controls.length === 0;
                if (!controls.length) {
                    actions.style.removeProperty('width');
                    actions.style.removeProperty('min-width');
                    return false;
                }

                this._layoutSplitLiveHeaderActions();
                return true;
            },

            _dockSplitLiveHeaderActions() {
                const actions = this._splitLiveHeader?.querySelector('.ytkit-split-live-actions');
                if (!actions) return false;

                const controls = [
                    this._findSplitLikeControl(),
                    this._findSplitSubscribeControl()
                ].filter(Boolean);

                return this._pinSplitLiveHeaderActions(controls, actions);
            },

            _dockSplitActions() {
                if (!this._isActive || !this._isSplit) return;
                if (this._videoType === 'live') {
                    this._dockSplitLiveHeaderActions();
                    return;
                }
                this._restoreSplitLiveHeaderActionPins();
                this._dockSplitHeader();

                const dock = this._ensureSplitActionDock();
                if (!dock) return;

                this._dockSplitControl(this._findSplitNotificationControl(), dock);
                this._dockSplitControl(this._findSplitPageControl(), dock);
                this._dockSplitControl(this._findSplitLikeControl(), dock);
                this._dockSplitControl(this._findSplitDownloadControl(), dock);

                const hasControls = dock.children.length > 0;
                dock.hidden = !hasControls;
                const topRow = dock.closest('#top-row');
                if (topRow) {
                    if (hasControls) topRow.dataset.ytkitSplitActionsDocked = '1';
                    else delete topRow.dataset.ytkitSplitActionsDocked;
                }
            },

            _startSplitActionDock() {
                if (!this._isActive || !this._isSplit) return;

                if (this._videoType === 'live') this._dockSplitLiveHeaderActions();
                else {
                    this._dockSplitHeader();
                    this._dockSplitActions();
                }
                if (this._splitActionDockObserver) return;

                const metadata = this._getBelow()?.querySelector('ytd-watch-metadata')
                    || document.querySelector('ytd-watch-metadata');
                if (!metadata) return;

                this._splitActionDockObserver = new MutationObserver(() => {
                    this._scheduleSplitActionDock(80);
                });
                this._splitActionDockObserver.observe(metadata, { childList: true, subtree: true });
            },

            _restoreSplitActionDock() {
                clearTimeout(this._splitActionDockTimer);
                this._splitActionDockTimer = null;
                this._splitActionDockObserver?.disconnect();
                this._splitActionDockObserver = null;
                this._restoreSplitHeader();

                const moved = this._splitActionDockMoved;
                if (moved) {
                    moved.forEach(({ parent, next }, control) => {
                        delete control.dataset.ytkitSplitDocked;
                        if (!control.isConnected || !parent?.isConnected) return;
                        if (next?.parentNode === parent) parent.insertBefore(control, next);
                        else parent.appendChild(control);
                    });
                    moved.clear();
                }
                this._splitActionDockMoved = null;
                this._restoreSplitLiveHeaderActionPins();
                this._removeSplitLiveHeader();

                document.querySelectorAll('.ytkit-split-owner-actions').forEach(dock => dock.remove());
                document.querySelectorAll('[data-ytkit-split-actions-docked]').forEach(row => {
                    delete row.dataset.ytkitSplitActionsDocked;
                });
                this._splitActionDock = null;
            },

            // Bulk set/remove style properties with !important
            _setStyles(el, props) {
                if (!el) return;
                for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, 'important');
            },
            _removeStyles(el, props) {
                if (!el) return;
                props.forEach(p => el.style.removeProperty(p));
            },

            // Force/restore chat frame internals
            _forceChatFill(chatEl) {
                if (!chatEl) return;
                const fill = {width:'100%',height:'100%'};
                this._setStyles(chatEl.querySelector('#show-hide-button'), {display:'none'});
                this._setStyles(chatEl.querySelector('#container'), {...fill,'max-height':'none','min-height':'0','border-radius':'0'});
                this._setStyles(chatEl.querySelector('iframe'), {...fill,'min-height':'0',border:'none','border-radius':'0'});
            },
            _restoreChatFill(chatEl) {
                if (!chatEl) return;
                this._removeStyles(chatEl.querySelector('#show-hide-button'), ['display']);
                this._removeStyles(chatEl.querySelector('#container'), ['width','height','max-height','min-height','border-radius']);
                this._removeStyles(chatEl.querySelector('iframe'), ['width','height','min-height','border','border-radius']);
            },

            // Position chat element over the right split panel
            _setupChat(chatEl, rightPct, top, height) {
                if (!chatEl) { this._waitForChat(rightPct, top, height); return; }
                this._positionChat(chatEl, rightPct, top, height);
            },

            _positionChat(chatEl, rightPct, top, height) {
                this._positionOverRight(chatEl, rightPct, top, height);
                chatEl.removeAttribute('collapsed');
                this._setStyles(chatEl, {width:`calc(${rightPct}% - 2px)`,padding:'0 8px 0 0','border-radius':'0'});
                this._forceChatFill(chatEl);
            },

            _prepareSecondaryForChat() {
                const sec = document.querySelector('#secondary');
                if (!sec) return;
                sec.style.display = '';
                sec.style.setProperty('display', 'block', 'important');
                sec.style.setProperty('pointer-events', 'none', 'important');
                sec.dataset.ytkitSplitHidden = '1';
                const related = sec.querySelector('#related');
                if (related) { related.dataset.ytkitSplitHidden = '1'; related.style.display = 'none'; }
            },

            _stopChatObserver() {
                clearTimeout(this._chatObserverTimer);
                this._chatObserverTimer = null;
                this._chatObserver?.disconnect();
                this._chatObserver = null;
            },

            _handleChatFound(chatEl, options = {}) {
                if (!chatEl || !this._isActive) return;
                const detectedType = VideoTypeDetector.refresh();
                const below = this._getBelow();
                const resolvedType = this._resolveSplitPanelType(detectedType, chatEl, below);
                this._videoType = resolvedType;
                if (resolvedType === 'live' || resolvedType === 'vod') {
                    this._prepareSecondaryForChat();
                } else {
                    DebugManager.log('Theater', `Late chat ignored, using ${resolvedType} comments panel`);
                    return;
                }
                if (!options.position || !this._isSplit) {
                    DebugManager.log('Theater', `Late chat detected, reclassified as ${this._videoType}`);
                    return;
                }

                let chatTop = options.topOffset;
                let chatHeight = options.heightStr;
                if (this._videoType === 'live') {
                    const liveHeaderTop = this._ensureSplitLiveHeader(options.rightPct);
                    chatTop = `${liveHeaderTop}px`;
                    chatHeight = `calc(100vh - ${liveHeaderTop}px)`;
                }
                this._positionChat(chatEl, options.rightPct, chatTop, chatHeight);
                if (!this._scrollTarget) this._scrollTarget = chatEl;
                if (this._videoType === 'vod') {
                    chatEl.style.setProperty('border-bottom', '2px solid rgba(255,255,255,0.1)', 'important');
                    const below = this._getBelow();
                    if (below && below.style.getPropertyValue('top') === '0') {
                        below.style.setProperty('top', '45vh', 'important');
                        below.style.setProperty('height', '55vh', 'important');
                    }
                }
                DebugManager.log('Theater', 'Late chat frame found and positioned');
            },

            _watchForChat(options = {}) {
                this._stopChatObserver();
                const existing = this._getChatEl();
                if (existing) { this._handleChatFound(existing, options); return; }
                this._chatObserver = new MutationObserver(() => {
                    const chatEl = this._getChatEl();
                    if (!chatEl) return;
                    this._stopChatObserver();
                    this._handleChatFound(chatEl, options);
                });
                this._chatObserver.observe(document.body, { childList: true, subtree: true });
                this._chatObserverTimer = setTimeout(() => this._stopChatObserver(), options.timeoutMs || 10000);
            },

            // Wait for chat frame via MutationObserver (replaces 10s polling loop)
            _waitForChat(rightPct, topOffset, heightStr) {
                this._watchForChat({
                    position: true,
                    rightPct,
                    topOffset,
                    heightStr,
                    timeoutMs: 10000
                });
            },

            // ── Build the fixed overlay (video full-width, right panel hidden) ──
            _buildOverlay() {
                const wrapper = document.createElement('div');
                wrapper.id = 'ytkit-split-wrapper';
                wrapper.style.cssText = `display:flex;position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:transparent;overflow:hidden;pointer-events:none;`;

                // LEFT — full width initially
                const left = document.createElement('div');
                left.id = 'ytkit-split-left';
                // flex:1 — left fills whatever space the right panel doesn't take.
                // No fixed width, no transition needed — it reacts automatically.
                left.style.cssText = `flex:1;min-width:0;display:flex;flex-direction:column;align-items:stretch;justify-content:center;background:transparent;position:relative;pointer-events:none;`;

                // DIVIDER — hidden until split
                const divider = document.createElement('div');
                divider.id = 'ytkit-split-divider';
                divider.style.cssText = `flex:0 0 0;width:0;cursor:col-resize;position:relative;background:#0a0d13;transition:flex-basis 0.35s cubic-bezier(0.4,0,0.2,1);overflow:hidden;z-index:10;pointer-events:auto;scrollbar-width:none;color:rgba(148,163,184,0.64);`;
                const pip = document.createElement('div');
                pip.className = 'ytkit-divider-pip';
                pip.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:40px;border-radius:2px;background:rgba(148,163,184,0.30);pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:rgba(148,163,184,0.64);`;
                // Three-dot grip pattern — universal drag indicator
                for (let i = 0; i < 3; i++) {
                    const dot = document.createElement('div');
                    dot.style.cssText = 'width:3px;height:3px;border-radius:50%;background:currentColor;flex-shrink:0;';
                    pip.appendChild(dot);
                }
                divider.appendChild(pip);
                divider.addEventListener('mouseenter', () => { divider.style.background='#111827'; pip.style.background='rgba(203,213,225,0.52)'; pip.style.color='rgba(226,232,240,0.92)'; });
                divider.addEventListener('mouseleave', () => { divider.style.background='#0a0d13'; pip.style.background='rgba(148,163,184,0.30)'; pip.style.color='rgba(148,163,184,0.64)'; });

                // RIGHT — collapsed initially
                const right = document.createElement('div');
                right.id = 'ytkit-split-right';
                // flex:0 0 0 — right starts at zero width, grows to a fixed size.
                // Left (flex:1) automatically shrinks as right expands.
                right.style.cssText = `flex:0 0 0;width:0;height:100%;overflow-y:auto;overflow-x:hidden;background:#0f0f0f;border-left:1px solid rgba(255,255,255,0.06);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;padding:0;box-sizing:border-box;opacity:0;transition:flex-basis 0.35s cubic-bezier(0.4,0,0.2,1),opacity 0.3s;pointer-events:auto;`;
                // wire divider to right panel now that it exists
                this._initDividerDrag(divider, left, right);

                // CLOSE button — low opacity, top-right of left panel
                const closeBtn = document.createElement('button');
                closeBtn.id = 'ytkit-split-close';
                closeBtn.title = 'Close side panel';
                const svgNS = 'http://www.w3.org/2000/svg';
                const cs = document.createElementNS(svgNS,'svg');
                cs.setAttribute('viewBox','0 0 24 24'); cs.setAttribute('width','13'); cs.setAttribute('height','13');
                cs.setAttribute('fill','none'); cs.setAttribute('stroke','currentColor'); cs.setAttribute('stroke-width','2.5');
                const cl1 = document.createElementNS(svgNS,'line'); cl1.setAttribute('x1','18'); cl1.setAttribute('y1','6'); cl1.setAttribute('x2','6'); cl1.setAttribute('y2','18');
                const cl2 = document.createElementNS(svgNS,'line'); cl2.setAttribute('x1','6'); cl2.setAttribute('y1','6'); cl2.setAttribute('x2','18'); cl2.setAttribute('y2','18');
                cs.appendChild(cl1); cs.appendChild(cl2);
                closeBtn.appendChild(cs);
                closeBtn.onclick = () => this._collapseSplit(true);
                left.appendChild(closeBtn);

                wrapper.appendChild(left);
                wrapper.appendChild(divider);
                wrapper.appendChild(right);
                return wrapper;
            },

            _applyDividerRatio(left, right, newLeftPct) {
                const newRightPct = 100 - newLeftPct;
                const wrapper = this._splitWrapper;
                const player = this._getPlayer();
                const strip = wrapper?.querySelector('#ytkit-split-collapse-strip');
                const positioned = this._positionedEls || [];
                right.style.flexBasis = newRightPct + '%';
                right.style.width     = newRightPct + '%';
                document.documentElement.style.setProperty('--ytkit-split-right-width', `calc(${newRightPct}vw - 6px)`);
                if (player) player.style.setProperty('width', newLeftPct + '%', 'important');
                positioned.forEach(el => {
                    el.style.setProperty('width', `calc(${newRightPct}% - 2px)`, 'important');
                });
                if (this._splitLiveHeader) {
                    this._splitLiveHeader.style.width = `calc(${newRightPct}% - 2px)`;
                    this._layoutSplitLiveHeaderActions();
                }
                if (strip) strip.style.width = `calc(${newRightPct}% - 2px)`;
                storageWrite('ytkit_split_ratio', newLeftPct);
            },

            _initDividerDrag(divider, left, right) {
                if (!right) return;

                // Double-click to reset ratio to default 75/25
                divider.addEventListener('dblclick', (e) => {
                    if (!this._isSplit) return;
                    e.preventDefault();
                    this._applyDividerRatio(left, right, 75);
                    divider.style.flexBasis = '6px';
                    this._triggerPlayerResize();
                });

                // Shared drag logic for mouse and touch
                const startDrag = (startX) => {
                    if (!this._isSplit) return null;
                    const wrapper = this._splitWrapper;
                    const totalW = wrapper.getBoundingClientRect().width;
                    const startLeftPct = left.getBoundingClientRect().width / totalW * 100;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';

                    const dragShield = document.createElement('div');
                    dragShield.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;cursor:col-resize;';
                    document.body.appendChild(dragShield);

                    let _dragRaf = null;
                    const onDrag = (clientX) => {
                        if (_dragRaf) cancelAnimationFrame(_dragRaf);
                        _dragRaf = requestAnimationFrame(() => {
                            const dx = clientX - startX;
                            const newLeftPct = Math.max(25, Math.min(85, startLeftPct + (dx / totalW * 100)));
                            this._applyDividerRatio(left, right, newLeftPct);
                            divider.style.flexBasis = '6px';
                        });
                    };
                    const cleanup = () => {
                        if (_dragRaf) cancelAnimationFrame(_dragRaf);
                        dragShield.remove();
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        this._triggerPlayerResize();
                    };
                    return { onDrag, cleanup, totalW, startLeftPct };
                };

                // Mouse drag
                divider.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const ctx = startDrag(e.clientX);
                    if (!ctx) return;
                    const onMove = (me) => ctx.onDrag(me.clientX);
                    const onUp = () => {
                        ctx.cleanup();
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                        window.removeEventListener('blur', onUp);
                        document.removeEventListener('mouseleave', onUp);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                    window.addEventListener('blur', onUp);
                    document.addEventListener('mouseleave', onUp);
                });

                // Touch drag
                divider.addEventListener('touchstart', (e) => {
                    const t = e.touches[0];
                    if (!t) return;
                    e.preventDefault();
                    const ctx = startDrag(t.clientX);
                    if (!ctx) return;
                    const onTouchMove = (te) => {
                        const tt = te.touches[0];
                        if (tt) ctx.onDrag(tt.clientX);
                    };
                    const onTouchEnd = () => {
                        ctx.cleanup();
                        window.removeEventListener('touchmove', onTouchMove);
                        window.removeEventListener('touchend', onTouchEnd);
                        window.removeEventListener('touchcancel', onTouchEnd);
                    };
                    window.addEventListener('touchmove', onTouchMove, { passive: true });
                    window.addEventListener('touchend', onTouchEnd);
                    window.addEventListener('touchcancel', onTouchEnd);
                });
            },

            // ── Mount overlay (video fullscreen, comments hidden) ──
            _mountOverlay() {
                if (this._isActive) return;
                const player = this._getPlayer();
                const below  = this._getBelow();
                if (!player) return;
                // For live streams, #below may not exist yet — that's OK
                if (!below && !VideoTypeDetector.hasChat()) return;

                // Video type already set by _activate
                this._positionedEls = [];
                this._scrollTarget = null;

                this._isActive = true;

                const wrapper = this._buildOverlay();
                this._splitWrapper = wrapper;
                wrapper.style.opacity = '0';
                document.body.appendChild(wrapper);
                // Smooth fade-in on first mount
                requestAnimationFrame(() => {
                    wrapper.style.transition = 'opacity 0.3s ease';
                    wrapper.style.opacity = '1';
                });

                const left  = wrapper.querySelector('#ytkit-split-left');
                const right = wrapper.querySelector('#ytkit-split-right');

                // Fix player in place — NO reparenting. Avoids Chrome losing the video
                // GPU compositor surface when the window moves between monitors.
                // The overlay's left panel is transparent, so the player shows through.
                this._setStyles(player, {
                    position: 'fixed', top: '0', left: '0',
                    width: '100%', height: '100vh',
                    'z-index': '9998', background: '#000',
                    'min-height': '0', margin: '0', padding: '0',
                    'max-width': 'none', overflow: 'hidden'
                });

                // Force #movie_player to fill parent — clear YT's inline px dimensions
                // Batched: runs at most once per frame, and stops after layout stabilizes
                let _fpsPending = false;
                let _fpsCount = 0;
                const forcePlayerSize = () => {
                    if (_fpsPending || _fpsCount > 5) return; // Stop after 5 cycles to prevent fight with YT
                    _fpsPending = true;
                    _fpsCount++;
                    requestAnimationFrame(() => {
                        _fpsPending = false;
                        if (!this._isActive) return;
                        const mp = document.getElementById('movie_player');
                        if (!mp) return;
                        mp.style.setProperty('width',  '100%', 'important');
                        mp.style.setProperty('height', '100%', 'important');
                        const vc = mp.querySelector('.html5-video-container');
                        const vid = mp.querySelector('video.html5-main-video');
                        if (vc)  { vc.style.setProperty('width','100%','important'); vc.style.setProperty('height','100%','important'); }
                        if (vid) { vid.style.setProperty('width','100%','important'); vid.style.setProperty('height','100%','important'); vid.style.setProperty('object-fit','contain','important'); }
                        const ytdP = mp.closest('ytd-player');
                        const innerCont = ytdP?.querySelector('#container');
                        if (innerCont) { innerCont.style.setProperty('width','100%','important'); innerCont.style.setProperty('height','100%','important'); innerCont.style.setProperty('padding-bottom','0','important'); }
                    });
                };
                forcePlayerSize();

                // Single ResizeObserver on left panel — debounced to avoid fight with YT's player
                // Also syncs player width with left panel since player is positioned separately
                this._playerResizeObs = new ResizeObserver(() => {
                    clearTimeout(this._playerResizeDebounceTimer);
                    this._playerResizeDebounceTimer = setTimeout(() => {
                        this._playerResizeDebounceTimer = null;
                        _fpsCount = 0;
                        forcePlayerSize();
                        const leftW = left.getBoundingClientRect().width;
                        if (leftW > 0) player.style.setProperty('width', leftW + 'px', 'important');
                    }, 200);
                });
                this._playerResizeObs.observe(left);

                // Delayed resize trigger — wait for layout to settle before telling YT to recalculate
                this._initResizeTimer = setTimeout(() => this._triggerPlayerResize(), 600);

                // #below stays in original DOM — overlay at z-index:9999 hides it visually.
                // DO NOT set visibility:hidden — it can prevent IntersectionObserver from firing.
                // Just block interaction until split expands.
                if (below) {
                    below.style.setProperty('pointer-events', 'none', 'important');
                }

                // For live/VOD: also hide the chat frame behind overlay
                const chatEl = this._getChatEl();
                if (chatEl) {
                    chatEl.style.setProperty('pointer-events', 'none', 'important');
                    // Ensure chat iframe isn't collapsed (YT collapses it sometimes)
                    chatEl.removeAttribute('collapsed');
                }

                // Pre-scroll to comments so YT's IO fires (behind the overlay, invisible).
                // Deferred heavily to avoid interfering with video load. Only for standard/VOD.
                if (this._videoType !== 'live' && below) {
                    const scrollToComments = () => {
                        this._scrollToCommentsTimer = null;
                        this._scrollToCommentsIdle = null;
                        if (!this._isActive) return;
                        const commentsEl = below.querySelector('ytd-comments');
                        if (commentsEl) commentsEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                    };
                    clearTimeout(this._scrollToCommentsTimer);
                    this._scrollToCommentsTimer = null;
                    if (this._scrollToCommentsIdle !== null && typeof cancelIdleCallback === 'function') {
                        cancelIdleCallback(this._scrollToCommentsIdle);
                    }
                    this._scrollToCommentsIdle = null;
                    if (typeof requestIdleCallback === 'function') {
                        this._scrollToCommentsIdle = requestIdleCallback(scrollToComments, { timeout: 2000 });
                    } else {
                        this._scrollToCommentsTimer = setTimeout(scrollToComments, 800);
                    }
                }

                // Hide related videos sidebar — but NOT the chat frame container.
                // On live/VOD pages, ytd-live-chat-frame is inside #secondary.
                // Hiding #secondary with display:none kills the chat completely.
                const sec = document.querySelector('#secondary');
                if (sec) {
                    if (this._videoType === 'live' || this._videoType === 'vod') {
                        // Only hide #related, keep #secondary visible for chat.
                        // Force display:block to override hideRelatedVideos CSS !important
                        const related = sec.querySelector('#related');
                        if (related) { related.dataset.ytkitSplitHidden='1'; related.style.display='none'; }
                        sec.style.setProperty('display', 'block', 'important');
                        sec.style.setProperty('pointer-events', 'none', 'important');
                        sec.dataset.ytkitSplitHidden='1';
                    } else {
                        sec.dataset.ytkitSplitHidden='1'; sec.style.display='none';
                    }
                }

                // Watch for late chat frame insertion — if we mounted as 'standard'
                // but a chat frame appears later (SPA race), reclassify and un-hide #secondary.
                // The same lifecycle also handles split-open positioning from _waitForChat().
                if (this._videoType === 'standard' && !this._getChatEl()) {
                    this._watchForChat({ position: false, timeoutMs: 15000 });
                }

                // Masthead hidden via CSS class added in _activate()
                const mast = document.querySelector('ytd-masthead, #masthead');
                if (mast) this._mastheadDisplay = mast.style.display;

                // Cache right panel ref for wheel handler (avoid querySelector in hot path)
                const rightRef = right;

                // Check if event target is in any positioned content element
                const isInRightContent = (target) => {
                    if (rightRef.contains(target)) return true;
                    return (this._positionedEls || []).some(el => el.contains(target));
                };

                // Wheel/touch on document capture — the overlay has pointer-events:none
                // so events target the player directly. Use capture on document to intercept
                // before YouTube's player can stopPropagation (volume control).
                const isOverPlayer = (target) => {
                    const mp = document.getElementById('movie_player');
                    return mp && mp.contains(target);
                };
                // Scroll-up-over-video collapse: require 3 consecutive scroll-up
                // ticks within 600ms to prevent accidental collapse from a single
                // inertial gesture (mirrors the right-panel collapse guard).
                let _playerCollapseCount = 0;
                let _playerCollapseTimer = null;

                this._wheelHandler = (e) => {
                    if (!this._isActive) return;

                    // Before split opens: scroll-down over player → expand
                    if (!this._isSplit) {
                        if (e.deltaY > 0 && isOverPlayer(e.target)) {
                            e.stopPropagation();
                            this._expandSplit();
                        }
                        return;
                    }

                    // ── Split is open ──
                    // The entire viewport is either the player (left) or the
                    // right panel content.  No isInRightContent gate needed —
                    // any wheel event the user can physically generate is on
                    // one of these two surfaces.

                    // Scroll UP over the video → collapse split (3-tick guard)
                    if (isOverPlayer(e.target) && e.deltaY < 0) {
                        e.stopPropagation();
                        _playerCollapseCount++;
                        clearTimeout(_playerCollapseTimer);
                        _playerCollapseTimer = setTimeout(() => { _playerCollapseCount = 0; }, 600);
                        if (_playerCollapseCount >= 3) {
                            _playerCollapseCount = 0;
                            this._collapseSplit(false);
                        }
                        return;
                    }

                    // Reset collapse counter on any downward scroll over player
                    if (isOverPlayer(e.target) && e.deltaY > 0) {
                        _playerCollapseCount = 0;
                    }

                    // Forward wheel to the right panel scroll target.
                    // This covers scrolling over the player area (proxied to
                    // comments) AND scrolling directly over the right panel
                    // content where native scroll is blocked by position:fixed.
                    const scrollEl = this._scrollTarget;
                    if (scrollEl) {
                        e.stopPropagation();
                        scrollEl.scrollTop += e.deltaY;
                    }
                };
                this._touchStartY = 0;
                this._touchHandler = (e) => { const t = e.touches[0]; if (t) this._touchStartY = t.clientY; };
                this._touchMoveHandler = (e) => {
                    if (!this._isActive) return;
                    const t = e.touches[0]; if (!t) return;
                    if (!this._isSplit && this._touchStartY - t.clientY > 30 && isOverPlayer(e.target)) {
                        e.stopPropagation();
                        this._expandSplit();
                        return;
                    }
                    if (this._isSplit) {
                        const delta = this._touchStartY - t.clientY;
                        // Swipe down on video → collapse (pull-down gesture)
                        if (isOverPlayer(e.target) && delta < -40) {
                            e.stopPropagation();
                            this._collapseSplit(false);
                            return;
                        }
                        // Forward touch scroll to right panel (covers both
                        // over-player and over-right-content targets)
                        const scrollEl = this._scrollTarget;
                        if (scrollEl) {
                            e.stopPropagation();
                            if (delta < -40 && scrollEl.scrollTop <= 0) {
                                this._collapseSplit(false);
                                return;
                            }
                            scrollEl.scrollTop += delta * 0.5;
                        }
                        this._touchStartY = t.clientY;
                    }
                };
                document.addEventListener('wheel', this._wheelHandler, { passive: true, capture: true });
                document.addEventListener('touchstart', this._touchHandler, { passive: true, capture: true });
                document.addEventListener('touchmove', this._touchMoveHandler, { passive: true, capture: true });
                this._middleMouseHandler = (e) => this._startSplitAutoscroll(e);
                document.addEventListener('mousedown', this._middleMouseHandler, true);
                this._commentSelectionSelectStartHandler = (e) => {
                    if (!this._isSplitCommentTextTarget(e.target)) return;
                    e.stopImmediatePropagation?.();
                    e.stopPropagation();
                };
                window.addEventListener('selectstart', this._commentSelectionSelectStartHandler, true);

                // Re-layout on window resize
                this._windowResizeHandler = () => {
                    if (!this._isActive) return;
                    this._triggerPlayerResize();
                    this._layoutSplitLiveHeaderActions();
                };
                window.addEventListener('resize', this._windowResizeHandler);

                // Escape key collapses split panel (or unmounts if already collapsed)
                this._keyHandler = (e) => {
                    if (e.key !== 'Escape' || !this._isActive) return;
                    // Don't intercept escape when user is typing in an input/textarea
                    const tag = document.activeElement?.tagName;
                    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
                    if (this._isSplit) {
                        this._collapseSplit(true);
                    }
                };
                document.addEventListener('keydown', this._keyHandler, true);

                // Hide overlay during native fullscreen — overlay at z-index:9999
                // would block player controls and conflict with browser fullscreen
                this._fullscreenHandler = () => {
                    const isFS = !!document.fullscreenElement;
                    const wrapper = this._splitWrapper;
                    if (!wrapper || !this._isActive) return;
                    if (isFS && !this._fullscreenHidden) {
                        this._fullscreenHidden = true;
                        wrapper.style.display = 'none';
                        if (this._splitLiveHeader) this._splitLiveHeader.style.display = 'none';
                        this._setSplitLiveHeaderActionPinsHidden(true);
                        // Hide positioned overlays (chat frame, #below) — they carry
                        // position:fixed z-index:10001 and would paint over the
                        // fullscreen player on live / previously-live videos.
                        this._fullscreenOverlayStash = [];
                        (this._positionedEls || []).forEach(el => {
                            if (!el) return;
                            this._fullscreenOverlayStash.push({ el, visibility: el.style.visibility });
                            el.style.setProperty('visibility', 'hidden', 'important');
                        });
                        // Restore player to natural sizing so fullscreen works
                        const player = this._getPlayer();
                        if (player) {
                            this._removeStyles(player, ['position', 'top', 'left', 'width', 'height',
                                'z-index', 'min-height', 'margin', 'padding', 'max-width', 'overflow']);
                        }
                        DebugManager.log('Theater', 'Overlay hidden for fullscreen');
                    } else if (!isFS && this._fullscreenHidden) {
                        this._fullscreenHidden = false;
                        wrapper.style.display = 'flex';
                        if (this._splitLiveHeader) this._splitLiveHeader.style.display = '';
                        this._setSplitLiveHeaderActionPinsHidden(false);
                        (this._fullscreenOverlayStash || []).forEach(({ el, visibility }) => {
                            if (!el) return;
                            if (visibility) el.style.setProperty('visibility', visibility, 'important');
                            else el.style.removeProperty('visibility');
                        });
                        this._fullscreenOverlayStash = null;
                        this._layoutSplitLiveHeaderActions();
                        // Re-fix player in place
                        const player = this._getPlayer();
                        if (player) {
                            const leftW = this._isSplit
                                ? (wrapper.querySelector('#ytkit-split-left')?.getBoundingClientRect().width || window.innerWidth)
                                : window.innerWidth;
                            this._setStyles(player, {
                                position: 'fixed', top: '0', left: '0',
                                width: leftW + 'px', height: '100vh',
                                'z-index': '9998', background: '#000',
                                'min-height': '0', margin: '0', padding: '0',
                                'max-width': 'none', overflow: 'hidden'
                            });
                        }
                        this._triggerPlayerResize();
                        DebugManager.log('Theater', 'Overlay restored after fullscreen');
                    }
                };
                document.addEventListener('fullscreenchange', this._fullscreenHandler);

                DebugManager.log('Theater', 'Overlay mounted');
            },

            // ── Expand right panel (show comments/chat) ──
            _expandSplit() {
                if (this._isSplit || !this._isActive || this._dismissed) return;
                this._isSplit = true;
                this._entering = true;
                this._positionedEls = [];

                const wrapper = this._splitWrapper;
                const left    = wrapper.querySelector('#ytkit-split-left');

                // Reconnect resize observer
                if (this._playerResizeObs && left) this._playerResizeObs.observe(left);
                const right   = wrapper.querySelector('#ytkit-split-right');
                const divider = wrapper.querySelector('#ytkit-split-divider');
                const below   = this._getBelow();
                const chatEl  = this._getChatEl();
                const detectedType = chatEl ? VideoTypeDetector.refresh() : this._videoType;
                this._videoType = this._resolveSplitPanelType(detectedType, chatEl, below);
                const type    = this._videoType;
                document.documentElement.classList.toggle('ytkit-split-live', type === 'live');

                const closeBtn = wrapper.querySelector('#ytkit-split-close');
                if (closeBtn) { closeBtn.style.display = 'flex'; closeBtn.style.opacity = '0.3'; }

                let leftPct = parseFloat(storageRead('ytkit_split_ratio', 75));
                if (!Number.isFinite(leftPct)) leftPct = 75;
                leftPct = Math.max(25, Math.min(85, leftPct));
                const rightPct = 100 - leftPct;
                document.documentElement.classList.add('ytkit-split-open');
                document.documentElement.style.setProperty('--ytkit-split-right-width', `calc(${rightPct}vw - 6px)`);

                // Expand overlay's right panel placeholder
                right.style.flexBasis = rightPct + '%';
                right.style.width     = rightPct + '%';
                divider.style.flexBasis = '6px';
                divider.style.width     = '6px';

                // Sync player width — player is fixed-positioned separately
                const player = this._getPlayer();
                if (player) player.style.setProperty('width', leftPct + '%', 'important');
                if (type === 'live' || type === 'vod') {
                    // Right panel is just a spacer — chat overlays it via CSS fixed
                    right.style.opacity = '0';
                    right.style.background = 'transparent';
                    right.style.borderLeft = 'none';
                } else {
                    right.style.opacity = '1';
                }

                // Elements stay in original DOM (no reparenting) so YT's IO works.
                if (type === 'live') {
                    const liveHeaderTop = this._ensureSplitLiveHeader(rightPct);
                    this._setupChat(chatEl, rightPct, `${liveHeaderTop}px`, `calc(100vh - ${liveHeaderTop}px)`);
                    this._scrollTarget = chatEl;
                } else if (type === 'vod') {
                    this._setupChat(chatEl, rightPct, '0', '45vh');
                    if (chatEl) chatEl.style.setProperty('border-bottom', '2px solid rgba(255,255,255,0.1)', 'important');
                    if (below) {
                        const hasChat = !!chatEl;
                        this._positionOverRight(below, rightPct, hasChat ? '45vh' : '0', hasChat ? '55vh' : '100vh');
                        this._setStyles(below, {width:`calc(${rightPct}% - 2px)`,padding:'16px 14px 72px'});
                    }
                    this._scrollTarget = chatEl || below;
                } else {
                    if (below) {
                        this._positionOverRight(below, rightPct, '0', '100vh');
                        this._setStyles(below, {width:`calc(${rightPct}% - 2px)`,padding:'16px 14px 72px'});
                        this._scrollTarget = below;
                    }
                }
                this._startSplitActionDock();

                const onExpanded = () => {
                    if (right) right.removeEventListener('transitionend', onTransEnd);
                    clearTimeout(this._expandFallbackTimer);
                    this._expandFallbackTimer = null;
                    this._entering = false;
                    this._triggerPlayerResize();
                    // For standard/VOD: scroll to top to show video title
                    if (type !== 'live' && below) {
                        below.scrollTop = 0;
                    }
                    // Re-inject download/action buttons — Polymer may have re-rendered
                    // #top-level-buttons-computed when the player was reparented
                    if (typeof checkAllButtons === 'function') {
                        checkAllButtons();
                        this._scheduleSplitActionDock(0);
                        clearTimeout(this._postExpandButtonsTimer);
                        this._postExpandButtonsTimer = setTimeout(() => {
                            this._postExpandButtonsTimer = null;
                            if (!this._isActive || !this._isSplit) return;
                            checkAllButtons();
                            this._scheduleSplitActionDock(0);
                        }, 500);
                    }
                };
                const onTransEnd = (e) => {
                    if (e.propertyName === 'flex-basis' || e.propertyName === 'opacity') onExpanded();
                };
                right.addEventListener('transitionend', onTransEnd);
                clearTimeout(this._expandFallbackTimer);
                this._expandFallbackTimer = setTimeout(() => {
                    this._expandFallbackTimer = null;
                    if (this._entering) onExpanded();
                }, 500);

                // Scroll/wheel handlers on the primary scroll target
                // Require 3 consecutive scroll-up ticks at top before collapsing
                // to prevent accidental collapse from a single scroll gesture
                const scrollEl = this._scrollTarget;
                let _collapseScrollCount = 0;
                let _collapseScrollTimer = null;
                if (scrollEl) {
                    this._rightWheelHandler = (e) => {
                        if (scrollEl.scrollTop <= 0 && e.deltaY < 0) {
                            _collapseScrollCount++;
                            clearTimeout(_collapseScrollTimer);
                            _collapseScrollTimer = setTimeout(() => { _collapseScrollCount = 0; }, 600);
                            if (_collapseScrollCount >= 3) {
                                _collapseScrollCount = 0;
                                this._collapseSplit(false);
                            }
                        } else {
                            _collapseScrollCount = 0;
                        }
                    };
                    this._rightTouchStartY = 0;
                    this._rightTouchHandler = (e) => {
                        const t = e.touches[0]; if (t) this._rightTouchStartY = t.clientY;
                    };
                    this._rightTouchMoveHandler = (e) => {
                        if (scrollEl.scrollTop !== 0) return;
                        const t = e.touches[0];
                        if (t && t.clientY - this._rightTouchStartY > 40) this._collapseSplit(false);
                    };
                    scrollEl.addEventListener('wheel', this._rightWheelHandler, { passive: true });
                    scrollEl.addEventListener('touchstart', this._rightTouchHandler, { passive: true });
                    scrollEl.addEventListener('touchmove', this._rightTouchMoveHandler, { passive: true });
                }

                // For live/VOD: chat iframe swallows wheel events (cross-origin).
                // Add a collapse trigger strip at top of right panel above the iframe z-index.
                if (type === 'live' || type === 'vod') {
                    const strip = document.createElement('div');
                    strip.id = 'ytkit-split-collapse-strip';
                    strip.style.width = `calc(${rightPct}% - 6px)`;
                    strip.addEventListener('wheel', (e) => {
                        if (e.deltaY < 0) this._collapseSplit(false);
                    }, { passive: true });
                    strip.addEventListener('touchstart', (e) => {
                        const t = e.touches[0]; if (t) strip._touchY = t.clientY;
                    }, { passive: true });
                    strip.addEventListener('touchmove', (e) => {
                        const t = e.touches[0];
                        if (t && t.clientY - (strip._touchY || 0) > 30) this._collapseSplit(false);
                    }, { passive: true });
                    strip.addEventListener('click', () => this._collapseSplit(false));
                    wrapper.appendChild(strip);
                }

                DebugManager.log('Theater', `Split expanded (${type})`);
            },

            // ── Collapse right panel (back to fullscreen video) ──
            _collapseSplit(dismissed) {
                if (!this._isSplit) return;
                this._isSplit = false;
                if (dismissed) this._dismissed = true;
                // Clear `_entering` in case we collapse before the expand
                // transition completed. Otherwise the 500 ms fallback timer in
                // `_expandSplit` would still see `_entering === true` and call
                // `onExpanded()` on an already-collapsed panel, re-triggering
                // `_triggerPlayerResize()` and `checkAllButtons()`.
                this._entering = false;
                clearTimeout(this._expandFallbackTimer);
                this._expandFallbackTimer = null;
                clearTimeout(this._postExpandButtonsTimer);
                this._postExpandButtonsTimer = null;
                clearTimeout(this._playerResizeDebounceTimer);
                this._playerResizeDebounceTimer = null;
                document.documentElement.classList.remove('ytkit-split-open');
                document.documentElement.classList.remove('ytkit-split-live');
                document.documentElement.style.removeProperty('--ytkit-split-right-width');
                this._restoreSplitActionDock();
                this._stopSplitAutoscroll();

                const wrapper = this._splitWrapper;
                const right   = wrapper.querySelector('#ytkit-split-right');
                const divider = wrapper.querySelector('#ytkit-split-divider');
                const closeBtn = wrapper.querySelector('#ytkit-split-close');

                // Remove scroll handlers from scroll target
                const scrollEl = this._scrollTarget;
                if (this._rightWheelHandler && scrollEl) {
                    scrollEl.removeEventListener('wheel', this._rightWheelHandler);
                    scrollEl.removeEventListener('touchstart', this._rightTouchHandler);
                    scrollEl.removeEventListener('touchmove', this._rightTouchMoveHandler);
                    this._rightWheelHandler = null;
                    this._rightTouchHandler = null;
                    this._rightTouchMoveHandler = null;
                }

                // Collapse overlay placeholder
                right.style.flexBasis = '0';
                right.style.width     = '0';
                divider.style.flexBasis = '0';
                divider.style.width     = '0';
                right.style.padding = '0';
                right.style.opacity = '0';

                // Restore player to full width
                const player = this._getPlayer();
                if (player) player.style.setProperty('width', '100%', 'important');

                // Unposition all elements and hide behind overlay
                this._unpositionAll();
                const below = this._getBelow();
                if (below) below.style.setProperty('pointer-events', 'none', 'important');
                const chatEl = this._getChatEl();
                if (chatEl) {
                    chatEl.style.setProperty('pointer-events', 'none', 'important');
                    chatEl.style.removeProperty('border-bottom');
                    this._restoreChatFill(chatEl);
                }

                if (closeBtn) { closeBtn.style.display = 'none'; closeBtn.style.opacity = '0'; }

                // Remove collapse trigger strip
                wrapper.querySelector('#ytkit-split-collapse-strip')?.remove();

                // Pause resize observer while collapsed
                this._playerResizeObs?.disconnect();

                this._triggerPlayerResize();
                DebugManager.log('Theater', 'Split collapsed');
            },

            // ── Unmount overlay entirely (navigate away / feature disabled) ──
            _unmount(keepClass) {
                if (!this._isActive) return;
                this._entering = false;
                clearTimeout(this._resizeTimer);
                this._resizeTimer = null;
                clearTimeout(this._initResizeTimer);
                this._initResizeTimer = null;
                this._stopChatObserver();
                clearTimeout(this._expandFallbackTimer);
                this._expandFallbackTimer = null;
                clearTimeout(this._postExpandButtonsTimer);
                this._postExpandButtonsTimer = null;
                clearTimeout(this._playerResizeDebounceTimer);
                this._playerResizeDebounceTimer = null;
                clearTimeout(this._scrollToCommentsTimer);
                this._scrollToCommentsTimer = null;
                if (this._scrollToCommentsIdle !== null && typeof cancelIdleCallback === 'function') {
                    cancelIdleCallback(this._scrollToCommentsIdle);
                }
                this._scrollToCommentsIdle = null;
                this._restoreSplitActionDock();
                this._stopSplitAutoscroll();

                // Remove scroll handlers from scroll target
                const scrollEl = this._scrollTarget;
                if (this._rightWheelHandler && scrollEl) {
                    scrollEl.removeEventListener('wheel', this._rightWheelHandler);
                    scrollEl.removeEventListener('touchstart', this._rightTouchHandler);
                    scrollEl.removeEventListener('touchmove', this._rightTouchMoveHandler);
                    this._rightWheelHandler = null;
                    this._rightTouchHandler = null;
                    this._rightTouchMoveHandler = null;
                }
                if (this._wheelHandler) {
                    document.removeEventListener('wheel', this._wheelHandler, true);
                    document.removeEventListener('touchstart', this._touchHandler, true);
                    document.removeEventListener('touchmove', this._touchMoveHandler, true);
                }
                this._wheelHandler = null;
                this._touchHandler = null;
                this._touchMoveHandler = null;
                if (this._middleMouseHandler) {
                    document.removeEventListener('mousedown', this._middleMouseHandler, true);
                    this._middleMouseHandler = null;
                }
                if (this._commentSelectionSelectStartHandler) {
                    window.removeEventListener('selectstart', this._commentSelectionSelectStartHandler, true);
                    this._commentSelectionSelectStartHandler = null;
                }
                if (this._windowResizeHandler) {
                    window.removeEventListener('resize', this._windowResizeHandler);
                    this._windowResizeHandler = null;
                }
                if (this._keyHandler) {
                    document.removeEventListener('keydown', this._keyHandler, true);
                    this._keyHandler = null;
                }
                if (this._fullscreenHandler) {
                    document.removeEventListener('fullscreenchange', this._fullscreenHandler);
                    this._fullscreenHandler = null;
                }
                this._fullscreenHidden = false;
                this._fullscreenOverlayStash = null;
                if (!keepClass) {
                    const masth = document.querySelector('ytd-masthead, #masthead');
                    if (masth && this._mastheadDisplay !== undefined) {
                        masth.style.display = this._mastheadDisplay || '';
                    }
                }
                this._mastheadDisplay = undefined;
                this._playerResizeObs?.disconnect();
                this._playerResizeObs = null;

                // Clear fixed positioning — player never left its original DOM location
                const player = this._getPlayer();
                if (player) {
                    this._removeStyles(player, ['position', 'top', 'left', 'width', 'height',
                        'z-index', 'background', 'min-height', 'margin', 'padding', 'max-width', 'overflow']);
                }

                // Restore all positioned elements — remove fixed positioning styles
                this._unpositionAll();
                const below = this._getBelow();
                if (below) {
                    below.style.removeProperty('pointer-events');
                    below.style.removeProperty('border-bottom');
                }
                const chatEl = this._getChatEl();
                if (chatEl) {
                    chatEl.style.removeProperty('pointer-events');
                    chatEl.style.removeProperty('border-bottom');
                    this._restoreChatFill(chatEl);
                }

                const mp = document.getElementById('movie_player');
                if (mp) { mp.style.width=''; mp.style.height=''; }

                document.querySelectorAll('[data-ytkit-split-hidden]').forEach(el => {
                    el.style.display=''; el.style.removeProperty('pointer-events');
                    delete el.dataset.ytkitSplitHidden;
                });

                this._splitWrapper?.remove();
                this._splitWrapper = null;
                this._isSplit = false;
                this._isActive = false;
                this._dismissed = false;
                this._videoType = 'standard';
                document.documentElement.classList.remove('ytkit-split-open', 'ytkit-split-live');
                document.documentElement.style.removeProperty('--ytkit-split-right-width');
                if (!keepClass) document.documentElement.classList.remove('ytkit-split-active');
                if (!keepClass) document.documentElement.style.removeProperty('--ytd-masthead-height');
                // Restore page scroll — we left it scrolled to comments for IO during mount
                window.scrollTo(0, 0);
                DebugManager.log('Theater', 'Overlay unmounted');
            },

            _activate() {
                if (!window.location.pathname.startsWith('/watch')) return;

                const vid = getVideoId();
                if (vid !== this._lastVideoId) {
                    this._lastVideoId = vid;
                    this._dismissed = false;  // reset dismiss on video change
                    if (this._isActive) {
                        // Same overlay, new video — collapse + refresh type (no unmount/remount)
                        if (this._isSplit) this._collapseSplit(false);
                        this._scrollTarget = null;
                        this._videoType = VideoTypeDetector.refresh();
                        DebugManager.log('Theater', `Video changed to ${vid}, type: ${this._videoType}`);
                        return;
                    }
                }
                if (this._isActive) return;

                // First mount — detect video type
                this._videoType = VideoTypeDetector.refresh();

                const doMount = () => {
                    // _destroyed guard: the waitForElement chains below can
                    // fire several seconds later — after teardown they must
                    // not resurrect an overlay with no styles and no teardown.
                    if (this._destroyed || this._isActive) return;
                    // Apply class right before mount — prevents broken half-state
                    // where masthead is hidden but overlay hasn’t mounted yet
                    document.documentElement.classList.add('ytkit-split-active');
                    document.documentElement.style.setProperty('--ytd-masthead-height', '0px');
                    this._mountOverlay();
                };

                const player = this._getPlayer();
                const below  = this._getBelow();
                const chatEl = this._getChatEl();
                const hasContent = below || chatEl;
                if (player && hasContent) {
                    doMount();
                } else {
                    this._cancelPendingWaits();
                    this._pendingWaits.push(waitForElement('#player-container', () => {
                        if (this._destroyed) return;
                        this._pendingWaits.push(waitForElement('#below, ytd-watch-metadata, ytd-live-chat-frame, #chat', () => {
                            if (this._destroyed) return;
                            if (window.location.pathname.startsWith('/watch')) doMount();
                        }));
                    }));
                }
            },

            _cancelPendingWaits() {
                for (const cancel of this._pendingWaits) {
                    try { if (typeof cancel === 'function') cancel(); }
                    catch { /* reason: wait cancellation is best-effort teardown */ }
                }
                this._pendingWaits = [];
            },

            init() {
                this._destroyed = false;
                const css = buildSplitShellCss();
                this._styleEl = injectStyle(stripCommentRestyleCss(css), this.id, true);
                this._splitMetaStyleEl?.remove();
                const splitMetaCss = buildSplitMetaCss();
                this._splitMetaStyleEl = injectStyle(stripCommentRestyleCss(splitMetaCss), this.id + '-meta-layout', true);
                this._splitCommentsStyleEl?.remove();
                const splitCommentsCss = buildSplitCommentsCss();
                this._splitCommentsStyleEl = injectStyle(splitCommentsCss, this.id + '-comments', true);
                addNavigateRule(this._navRuleId, () => this._activate());
                DebugManager.log('Theater', 'Theater Split initialized');
            },

            destroy() {
                this._destroyed = true;
                this._cancelPendingWaits();
                this._unmount();
                this._restoreSplitActionDock();
                this._stopChatObserver();
                this._lastVideoId = null;
                this._styleEl?.remove();
                this._splitMetaStyleEl?.remove();
                this._splitCommentsStyleEl?.remove();
                this._splitMetaStyleEl = null;
                this._splitCommentsStyleEl = null;
                removeNavigateRule(this._navRuleId);
            }
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyVideo = Object.freeze({
        STYLE_IDS,
        buildSplitShellCss,
        buildSplitMetaCss,
        buildSplitCommentsCss,
        createStickyVideoFeature
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            STYLE_IDS,
            buildSplitShellCss,
            buildSplitMetaCss,
            buildSplitCommentsCss,
            createStickyVideoFeature
        };
    }
})();
