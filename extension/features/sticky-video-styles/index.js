(() => {
    'use strict';

    // extension/features/sticky-video-styles/index.js
    //
    // Theater Split's three stylesheets: the page shell, the metadata column
    // and the comments pane. Pure functions with no page or storage access, so
    // they load and test on their own. features/sticky-video/index.js injects
    // them from init().

    const STYLE_IDS = Object.freeze({
        shell: 'stickyVideo',
        meta: 'stickyVideo-meta-layout',
        comments: 'stickyVideo-comments'
    });

    function buildSplitShellCss() {
        return `html.ytkit-split-active ytd-watch-flexy{display:block!important;overflow:visible!important;} html.ytkit-split-active ytd-watch-flexy #columns{max-width:100%!important;} html.ytkit-split-active ytd-masthead,html.ytkit-split-active #masthead-container{display:none!important;} html.ytkit-split-active #page-manager{margin-top:0!important;} html.ytkit-split-active ytd-app{--ytd-masthead-height:0px;} html.ytkit-split-active,html.ytkit-split-active body{overflow:hidden!important;} html.ytkit-split-active body{padding-top:0!important;} html.ytkit-split-active #player-container,html.ytkit-split-active #player-container-inner,html.ytkit-split-active #player-theater-container,html.ytkit-split-active ytd-player{width:100%!important;max-width:none!important;height:100%!important;min-height:0!important;padding:0!important;margin:0!important;} html.ytkit-split-active #movie_player{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;position:relative!important;left:auto!important;top:auto!important;} html.ytkit-split-active .html5-video-container{width:100%!important;height:100%!important;} html.ytkit-split-active video.html5-main-video{width:100%!important;height:100%!important;object-fit:contain!important;left:0!important;top:0!important;} html.ytkit-split-active ytd-player > #container,html.ytkit-split-active #player-container-inner #player{width:100%!important;height:100%!important;padding-bottom:0!important;} html.ytkit-split-active ytd-watch-flexy[flexy-header-flipper_] #player-container,html.ytkit-split-active ytd-watch-flexy[theater] #player-container,html.ytkit-split-active ytd-watch-flexy #player-container{width:100%!important;max-width:none!important;} #ytkit-split-right::-webkit-scrollbar{width:5px;} #ytkit-split-right::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.14);border-radius:3px;} #ytkit-split-right::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.28);} .ytkit-divider-pip{opacity:0.4;transition:opacity 0.2s ease;} #ytkit-split-divider:hover .ytkit-divider-pip{opacity:1;} html.ytkit-split-active #below.ytkit-split-scroll-surface,html.ytkit-split-active #below.ytkit-split-scroll-surface{scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,0.12) transparent!important;font-size:13px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata{margin:-12px 0 0!important;padding:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata .item{padding:0!important;margin:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title{font-size:15px!important;line-height:1.3!important;margin-bottom:2px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #owner{margin:2px 0!important;padding:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #actions{flex-wrap:wrap!important;max-width:100%!important;margin:0!important;padding:2px 0!important;gap:4px!important;overflow:visible!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #actions ytd-menu-renderer,html.ytkit-split-active #below.ytkit-split-scroll-surface #top-level-buttons-computed{flex-wrap:wrap!important;gap:2px!important;overflow:visible!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #actions button,html.ytkit-split-active #below.ytkit-split-scroll-surface #actions ytd-button-renderer,html.ytkit-split-active #below.ytkit-split-scroll-surface #actions ytd-toggle-button-renderer{transform:scale(0.88)!important;transform-origin:center!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-text-inline-expander,html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-text-inline-expander > div{padding:0!important;margin:0!important;max-width:100%!important;word-break:break-word!important;font-size:12px!important;line-height:1.4!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #description-inline-expander{margin:4px 0!important;padding:6px 8px!important;background:rgba(255,255,255,0.04)!important;border-radius:6px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comments{margin:0!important;padding:0 0 40px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comments-header-renderer,html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comments-header-renderer > div{padding:0!important;margin:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #count.ytd-comments-header-renderer{font-size:13px!important;margin:6px 0 2px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-simplebox-renderer{padding:0!important;margin:0 0 4px!important;transform:scale(0.92)!important;transform-origin:top left!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-thread-renderer{margin:0!important;padding:6px 4px!important;border-bottom:1px solid rgba(255,255,255,0.06)!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-thread-renderer:last-child{border-bottom:none!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-renderer{margin:0!important;padding:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-renderer #author-thumbnail{width:24px!important;height:24px!important;margin-right:8px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-renderer #author-thumbnail img,html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-renderer #author-thumbnail yt-img-shadow{width:24px!important;height:24px!important;border-radius:50%!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #header-author{margin-bottom:1px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #author-text{font-size:12px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #published-time-text{font-size:11px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #content-text{font-size:13px!important;line-height:1.35!important;margin:0!important;padding:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons{margin-top:2px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons ytd-toggle-button-renderer,html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons #reply-button-end{transform:scale(0.85)!important;transform-origin:left center!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons #vote-count-middle{font-size:11px!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-replies-renderer{margin-left:28px!important;padding:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-comment-replies-renderer #expander-contents{padding:0!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-item-section-renderer,html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-item-section-renderer > #contents{padding:0!important;margin:0!important;max-width:100%!important;box-sizing:border-box!important;} html.ytkit-split-active #below.ytkit-split-scroll-surface yt-formatted-string{max-width:100%!important;word-break:break-word!important;} html.ytkit-split-active #ytkit-split-right{border:none!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position:fixed"],html.ytkit-split-active ytd-live-chat-frame[style*="position:fixed"],html.ytkit-split-active #chat[style*="position:fixed"],html.ytkit-split-active #chat[style*="position:fixed"]{scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,0.15) transparent!important;margin:0!important;max-width:none!important;border-radius:0!important;padding:0 6px 0 0!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"] iframe,html.ytkit-split-active #chat[style*="position"] iframe{width:100%!important;height:100%!important;min-height:0!important;border:none!important;border-radius:0!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"] #container,html.ytkit-split-active #chat[style*="position"] #container{width:100%!important;height:100%!important;max-height:none!important;min-height:0!important;border-radius:0!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"] #show-hide-button,html.ytkit-split-active #chat[style*="position"] #show-hide-button{display:none!important;} html.ytkit-split-active ytd-live-chat-frame[style*="position"],html.ytkit-split-active #chat[style*="position"]{min-height:0!important;max-height:none!important;} #ytkit-split-close{position:absolute;bottom:16px;right:16px;z-index:25;width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,0.5);color:rgba(255,255,255,0.55);display:none;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity 0.2s,background 0.15s;pointer-events:auto;} #ytkit-split-close:hover{background:rgba(220,38,38,0.75);color:#fff;opacity:1!important;} #ytkit-split-collapse-strip{position:fixed;top:0;right:0;height:32px;z-index:10002;cursor:n-resize;background:linear-gradient(180deg,rgba(255,255,255,0.03) 0%,transparent 100%);transition:background 0.2s;pointer-events:auto;} #ytkit-split-collapse-strip:hover{background:linear-gradient(180deg,rgba(255,255,255,0.1) 0%,transparent 100%);} #ytkit-split-collapse-strip::after{content:'';display:block;width:32px;height:3px;background:rgba(255,255,255,0.2);border-radius:2px;margin:12px auto 0;transition:opacity 0.2s,background 0.2s;} #ytkit-split-collapse-strip:hover::after{background:rgba(255,255,255,0.5);} html.ytkit-split-active #secondary,html.ytkit-split-active #below,html.ytkit-split-active #player-full-bleed-container,html.ytkit-split-active #columns,html.ytkit-split-active ytd-watch-flexy{view-transition-name:none!important;} html.ytkit-split-active ytd-live-chat-frame#chat,html.ytkit-split-active ytd-live-chat-frame{display:flex!important;flex-direction:column!important;max-height:none!important;min-height:0!important;visibility:visible!important;} html.ytkit-split-active #chat-container{display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;visibility:visible!important;} html.ytkit-split-active ytd-live-chat-frame#chat>iframe,html.ytkit-split-active ytd-live-chat-frame>iframe{flex:1!important;height:100%!important;min-height:0!important;max-height:none!important;} html.ytkit-split-active ytd-watch-flexy.loading ytd-live-chat-frame#chat,html.ytkit-split-active ytd-watch-flexy:not([ghost-cards-enabled]).loading #chat{visibility:visible!important;}  `;
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

                    html.ytkit-split-active #below.ytkit-split-scroll-surface {
                        min-width: 0 !important;
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                        overflow-x: clip !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata {
                        margin: 0 !important;
                        padding: 0 !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        inline-size: 100% !important;
                        max-inline-size: 100% !important;
                        row-gap: 8px !important;
                        align-content: start !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #top-row {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        align-items: start !important;
                        row-gap: 8px !important;
                        margin: 0 0 6px !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #above-the-fold,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title h1,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title h1 *,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title yt-formatted-string,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title yt-formatted-string *,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title yt-attributed-string,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title .yt-core-attributed-string,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title .yt-core-attributed-string--white-space-pre-wrap {
                        min-width: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        inline-size: 100% !important;
                        max-inline-size: 100% !important;
                        box-sizing: border-box !important;
                        overflow: visible !important;
                        white-space: normal !important;
                        text-overflow: clip !important;
                        overflow-wrap: anywhere !important;
                        word-break: break-word !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title h1,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title h1 *,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title yt-formatted-string,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title yt-formatted-string *,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title yt-attributed-string,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title .yt-core-attributed-string,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title .yt-core-attributed-string--white-space-pre-wrap {
                        display: block !important;
                        max-height: none !important;
                        -webkit-line-clamp: unset !important;
                        -webkit-box-orient: initial !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata h1.ytd-watch-metadata {
                        margin: 0 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-watch-metadata #title {
                        font-size: clamp(1.02rem, 1.45vw, 1.16rem) !important;
                        line-height: 1.34 !important;
                        letter-spacing: 0 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner.ytd-watch-metadata,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner {
                        display: flex !important;
                        align-items: flex-start !important;
                        justify-content: flex-start !important;
                        flex-wrap: wrap !important;
                        gap: 8px 10px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer {
                        flex: 1 1 100% !important;
                        min-width: 0 !important;
                        margin-right: 0 !important;
                        order: 1 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #channel-name,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #channel-name yt-formatted-string,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #owner-sub-count,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #owner-sub-count yt-formatted-string {
                        display: block !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #owner-sub-count,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #owner-sub-count yt-formatted-string {
                        margin-top: 2px !important;
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                        color: rgba(255, 255, 255, 0.58) !important;
                        white-space: normal !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #subscribe-button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner ytd-subscribe-button-renderer {
                        flex: 1 1 100% !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        order: 2 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #notification-preference-button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner ytd-subscription-notification-toggle-button-renderer-next,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner > #ytkit-watch-btn,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner > #ytkit-page-btn-watch {
                        flex: 0 0 auto !important;
                        order: 3 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner > #ytkit-watch-btn,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner > #ytkit-page-btn-watch {
                        order: 4 !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner > #ytkit-watch-btn {
                        display: none !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #subscribe-button .yt-spec-button-shape-next,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #notification-preference-button .yt-spec-button-shape-next,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model .yt-spec-button-shape-next {
                        min-height: 30px !important;
                        height: 30px !important;
                        padding-inline: 10px !important;
                        border-radius: 10px !important;
                        font-size: 11px !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #owner #notification-preference-button .yt-spec-button-shape-next {
                        min-width: 30px !important;
                        padding-inline: 7px !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions.ytd-watch-metadata {
                        display: block !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions-inner,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions ytd-menu-renderer,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #top-level-buttons-computed {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 6px !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #top-level-buttons-computed > * {
                        flex: 0 0 auto !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions ytd-button-renderer,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions ytd-toggle-button-renderer,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons ytd-toggle-button-renderer,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons #reply-button-end {
                        transform: none !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons {
                        margin-top: 4px !important;
                        display: flex !important;
                        align-items: center !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions .yt-spec-button-shape-next--segmented-start,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions .yt-spec-button-shape-next--segmented-end {
                        text-align: center !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions #segmented-like-button button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions #segmented-dislike-button button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions like-button-view-model button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions dislike-button-view-model button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface ytd-segmented-like-dislike-button-renderer,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface segmented-like-dislike-button-view-model,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface .ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions #segmented-like-button button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions #segmented-dislike-button button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions like-button-view-model button,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions dislike-button-view-model button {
                        min-height: 32px !important;
                        gap: 6px !important;
                        padding-inline: 10px !important;
                    }

                    html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons #vote-count-middle,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #action-buttons .yt-spec-button-shape-next__button-text-content,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions #vote-count-middle,
                    html.ytkit-split-active #below.ytkit-split-scroll-surface #actions .yt-spec-button-shape-next__button-text-content {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        line-height: 1 !important;
                        white-space: nowrap !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "count sort"
                            "box box" !important;
                        align-items: center !important;
                        column-gap: 10px !important;
                        row-gap: 12px !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #title {
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

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #leading-section,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #additional-section {
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        margin: 0 !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments #count.ytd-comments-header-renderer,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
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

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-flex !important;
                        gap: 0.28em !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer > span {
                        display: inline-block !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments #count.ytd-comments-header-renderer::before {
                        content: none !important;
                        display: none !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer {
                        grid-area: sort !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin-left: 0 !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 32px !important;
                        height: 32px !important;
                        padding: 0 12px !important;
                        border-radius: 10px !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #placeholder-area {
                        min-height: 50px !important;
                        padding: 0 14px !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        display: grid !important;
                        grid-template-columns: 32px minmax(0, 1fr) !important;
                        align-items: center !important;
                        gap: 10px !important;
                        width: 100% !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #author-thumbnail,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #author-thumbnail img,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #author-thumbnail yt-img-shadow,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #avatar,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #avatar img,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #avatar yt-img-shadow {
                        width: 32px !important;
                        height: 32px !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #simple-box {
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

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer {
                        transform: none !important;
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #main,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #creation-box,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #input-container,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer tp-yt-paper-input-container,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #placeholder-area,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #contenteditable-root {
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        box-sizing: border-box !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface ytd-watch-metadata #top-row {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        align-items: start !important;
                        row-gap: 10px !important;
                        margin: 0 0 10px !important;
                        padding: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface ytd-watch-metadata #title,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface ytd-watch-metadata h1.ytd-watch-metadata,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface h1.style-scope.ytd-watch-metadata {
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

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner.ytd-watch-metadata {
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

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer {
                        grid-area: owner !important;
                        display: grid !important;
                        grid-template-columns: 52px minmax(0, 1fr) !important;
                        align-items: center !important;
                        column-gap: 12px !important;
                        row-gap: 0 !important;
                        min-width: 0 !important;
                        margin-right: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #avatar,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #avatar img {
                        width: 52px !important;
                        height: 52px !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #upload-info {
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 4px !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer ytd-channel-name,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer ytd-channel-name #container {
                        display: flex !important;
                        align-items: center !important;
                        gap: 6px !important;
                        min-width: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #channel-name,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #channel-name a {
                        font-size: 13px !important;
                        line-height: 1.18 !important;
                        font-weight: 700 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner #owner-sub-count,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner #owner-sub-count yt-formatted-string {
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                        color: rgba(255,255,255,0.58) !important;
                        white-space: normal !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner #subscribe-button {
                        grid-area: sub !important;
                        justify-self: start !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner > #ytkit-page-btn-watch {
                        grid-area: page !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #owner > #ytkit-watch-btn {
                        grid-area: watch !important;
                        justify-self: end !important;
                        align-self: center !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions.ytd-watch-metadata {
                        display: block !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 0 12px !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions-inner,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #top-level-buttons-computed,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions ytd-menu-renderer {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        gap: 8px !important;
                        row-gap: 8px !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        overflow: visible !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions ytd-menu-renderer,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #top-level-buttons-computed,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #flexible-item-buttons {
                        width: auto !important;
                        max-width: 100% !important;
                        flex: 0 1 auto !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #top-level-buttons-computed {
                        row-gap: 6px !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions ytd-menu-renderer > #button-shape,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions ytd-menu-renderer > yt-button-shape,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions ytd-menu-renderer > yt-icon-button {
                        flex: 0 0 auto !important;
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions yt-button-shape,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions yt-button-view-model,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions ytd-button-renderer,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions ytd-toggle-button-renderer {
                        transform: none !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #actions .ytkit-local-dl-btn {
                        margin: 0 !important;
                        align-self: center !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments {
                        margin-top: 0 !important;
                        padding-top: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer {
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

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #title,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments #count.ytd-comments-header-renderer,
                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        margin: 0 !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer {
                        grid-area: box !important;
                        grid-column: 1 / -1 !important;
                        justify-self: stretch !important;
                        align-self: stretch !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: none !important;
                    }

                    html.ytkit-split-open #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #placeholder-area {
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
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface {
                        color-scheme: inherit !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) ytd-popup-container,
                    html:is(.ytkit-split-active, .ytkit-split-open) tp-yt-iron-dropdown,
                    html:is(.ytkit-split-active, .ytkit-split-open) ytd-menu-popup-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) ytd-multi-page-menu-renderer {
                        z-index: 2147483647 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata {
                        margin: 0 0 10px !important;
                        padding: 0 0 10px !important;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #top-row {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        justify-self: stretch !important;
                        box-sizing: border-box !important;
                        gap: 8px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title {
                        position: relative !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        align-content: start !important;
                        row-gap: 8px !important;
                        z-index: 60 !important;
                        margin: 0 !important;
                        padding: 10px 12px 11px !important;
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title:has(#ytkit-po-logo-wrap.ytkit-ql-open) {
                        z-index: 2147483646 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-title-bar {
                        display: grid !important;
                        grid-template-columns: auto minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "home actions date" !important;
                        align-items: center !important;
                        gap: 8px !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                        position: relative !important;
                        z-index: 5 !important;
                        order: 2 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-youtube-link {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-youtube-link:hover {
                        filter: brightness(1.12) !important;
                        transform: translateY(-1px) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-youtube-link:active {
                        transform: translateY(0) scale(0.96) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-youtube-link svg {
                        width: 24px !important;
                        height: 18px !important;
                        display: block !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-header-actions {
                        display: inline-flex !important;
                        align-items: center !important;
                        flex-wrap: nowrap !important;
                        grid-area: actions !important;
                        justify-self: start !important;
                        gap: 6px !important;
                        width: auto !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        position: relative !important;
                        z-index: 30 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-header-actions[hidden] {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap.ytkit-ql-open {
                        z-index: 2147483647 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap::before {
                        content: none !important;
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher--player,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-toggle {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher--player:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-toggle:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.28) !important;
                        background:
                            linear-gradient(180deg, rgba(var(--ytkit-split-accent-rgb), 0.15), rgba(var(--ytkit-split-accent-rgb), 0.045)),
                            rgba(255, 255, 255, 0.052) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher-glyph,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-launcher-glyph svg {
                        width: 15px !important;
                        height: 15px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-toggle {
                        width: 25px !important;
                        min-width: 25px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title #ytkit-po-logo-wrap .ytkit-ql-drop {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-upload-meta {
                        display: inline-grid !important;
                        align-items: center !important;
                        justify-items: end !important;
                        align-content: center !important;
                        gap: 2px !important;
                        flex: 0 1 auto !important;
                        grid-area: date !important;
                        justify-self: end !important;
                        max-width: min(100%, 200px) !important;
                        min-height: 34px !important;
                        margin-left: 0 !important;
                        padding: 4px 9px 5px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(var(--ytkit-split-accent-rgb), 0.18) !important;
                        background:
                            linear-gradient(180deg, rgba(var(--ytkit-split-accent-rgb), 0.115), rgba(var(--ytkit-split-accent-rgb), 0.035)),
                            rgba(255, 255, 255, 0.035) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.045) !important;
                        white-space: nowrap !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-upload-date {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-view-count {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-upload-meta[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-upload-date[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-upload-date:empty,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-view-count[hidden],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-view-count:empty {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title h1,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata h1.style-scope.ytd-watch-metadata,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata h1.ytd-watch-metadata {
                        margin: 0 !important;
                        padding: 0 !important;
                        order: 1 !important;
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title yt-formatted-string {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner.ytd-watch-metadata {
                        position: relative !important;
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                        justify-self: stretch !important;
                        box-sizing: border-box !important;
                        gap: 8px !important;
                        margin: 0 !important;
                        padding: 10px 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        border-radius: 12px !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018)),
                            rgba(12, 16, 24, 0.82) !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #avatar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #avatar yt-img-shadow {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #avatar yt-img-shadow {
                        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.10) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-video-owner-renderer #upload-info {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #channel-name,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #channel-name a,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #channel-name yt-formatted-string {
                        color: rgba(248, 250, 252, 0.96) !important;
                        font-size: 13px !important;
                        line-height: 1.2 !important;
                        font-weight: 760 !important;
                        letter-spacing: 0 !important;
                        text-align: left !important;
                        justify-self: start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #owner-sub-count,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #owner-sub-count yt-formatted-string {
                        color: rgba(148, 163, 184, 0.88) !important;
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #notification-preference-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscription-notification-toggle-button-renderer-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner > #ytkit-page-btn-watch,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner > #ytkit-watch-btn {
                        position: relative !important;
                        align-self: center !important;
                        justify-self: start !important;
                        margin: 0 !important;
                        max-width: 100% !important;
                        overflow: visible !important;
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #notification-preference-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscription-notification-toggle-button-renderer-next {
                        z-index: 40 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #notification-preference-button *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscription-notification-toggle-button-renderer-next * {
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #notification-preference-button .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #notification-preference-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscription-notification-toggle-button-renderer-next .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscription-notification-toggle-button-renderer-next button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner > #ytkit-page-btn-watch,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner > #ytkit-watch-btn {
                        min-height: 32px !important;
                        height: 32px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.055) !important;
                        color: rgba(248, 250, 252, 0.92) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscribe-button-renderer {
                        flex: 1 1 100% !important;
                        order: 2 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscribe-button-renderer button {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscribe-button-renderer button:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.34) !important;
                        background:
                            linear-gradient(180deg, rgba(var(--ytkit-split-accent-rgb), 0.22), rgba(var(--ytkit-split-accent-rgb), 0.1)),
                            rgba(16, 22, 33, 0.96) !important;
                        color: rgba(255, 255, 255, 0.99) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button .yt-spec-button-shape-next *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner #subscribe-button button *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model .yt-spec-button-shape-next *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner yt-subscribe-button-view-model button *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner ytd-subscribe-button-renderer button * {
                        color: inherit !important;
                        font-weight: inherit !important;
                        letter-spacing: inherit !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner:has(.ytkit-split-owner-actions),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner.ytd-watch-metadata:has(.ytkit-split-owner-actions) {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "owner sub"
                            "actions actions" !important;
                        align-content: flex-start !important;
                        align-items: center !important;
                        justify-items: start !important;
                        gap: 8px 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner:not(:has(#subscribe-button)):has(.ytkit-split-owner-actions) {
                        grid-template-areas:
                            "owner owner"
                            "actions actions" !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner:has(.ytkit-split-owner-actions) ytd-video-owner-renderer {
                        grid-area: owner !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner:has(.ytkit-split-owner-actions) #subscribe-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner:has(.ytkit-split-owner-actions) yt-subscribe-button-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner:has(.ytkit-split-owner-actions) ytd-subscribe-button-renderer {
                        grid-area: sub !important;
                        flex: 0 1 auto !important;
                        order: 2 !important;
                        width: auto !important;
                        max-width: 100% !important;
                        justify-self: start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #owner .ytkit-split-owner-actions {
                        grid-area: actions !important;
                        grid-column: 1 / -1 !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        flex-wrap: wrap !important;
                        gap: 6px !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-width: 0 !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions.ytd-watch-metadata {
                        display: block !important;
                        width: 100% !important;
                        margin: 0 0 10px !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions-inner,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #top-level-buttons-computed,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #flexible-item-buttons {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 8px !important;
                        row-gap: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface .ytkit-local-dl-btn {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #actions button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface .ytkit-local-dl-btn:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.24) !important;
                        background: rgba(255, 255, 255, 0.075) !important;
                        color: rgba(248, 250, 252, 0.98) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments {
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments#comments,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-comments#comments {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer {
                        display: grid !important;
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "count sort"
                            "box box" !important;
                        gap: 8px !important;
                        align-content: start !important;
                        align-items: center !important;
                        min-height: 0 !important;
                        margin: 0 0 10px !important;
                        padding: 8px 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        border-radius: 12px !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.018)),
                            rgba(13, 17, 25, 0.82) !important;
                        box-sizing: border-box !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #title {
                        grid-area: count !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        gap: 8px !important;
                        margin: 0 !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #count.ytd-comments-header-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer {
                        grid-area: sort !important;
                        justify-self: end !important;
                        margin: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu button {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #simple-box,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer ytd-comment-simplebox-renderer {
                        grid-area: box !important;
                        grid-column: 1 / -1 !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        min-height: 0 !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        display: grid !important;
                        grid-template-columns: 32px minmax(0, 1fr) !important;
                        align-items: center !important;
                        gap: 10px !important;
                        width: 100% !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #avatar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #avatar img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #avatar yt-img-shadow {
                        width: 32px !important;
                        height: 32px !important;
                        border-radius: 11px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #placeholder-area,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-commentbox #contenteditable-textarea {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-thread-renderer {
                        margin: 0 0 10px !important;
                        padding: 0 !important;
                        border: none !important;
                        background: transparent !important;
                        content-visibility: auto !important;
                        contain-intrinsic-size: auto 180px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.22) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.03)),
                            rgba(14, 19, 29, 0.9) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer > #body {
                        display: flex !important;
                        align-items: flex-start !important;
                        gap: 11px !important;
                        position: static !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #author-thumbnail yt-img-shadow {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        flex: 0 0 34px !important;
                        width: 34px !important;
                        height: 34px !important;
                        border-radius: 12px !important;
                        overflow: hidden !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model > #body > #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer > #body > #main {
                        min-width: 0 !important;
                        flex: 1 1 auto !important;
                        padding-right: 0 !important;
                        position: static !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #header-author,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #header-author {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        align-items: baseline !important;
                        gap: 6px !important;
                        margin: 0 0 4px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #author-text {
                        color: rgba(248, 250, 252, 0.96) !important;
                        font-size: 12.5px !important;
                        font-weight: 760 !important;
                        letter-spacing: 0 !important;
                        line-height: 1.25 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model .published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer .published-time-text {
                        color: rgba(148, 163, 184, 0.78) !important;
                        font-size: 11px !important;
                        line-height: 1.25 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #content-text {
                        display: block !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        color: rgba(241, 245, 249, 0.95) !important;
                        font-size: 14px !important;
                        line-height: 1.54 !important;
                        letter-spacing: 0 !important;
                        word-break: break-word !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #content-text a,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #content-text a {
                        color: rgba(var(--ytkit-split-accent-rgb), 0.92) !important;
                        text-decoration: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-thread-renderer .thread-hitbox,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-thread-renderer .thread-hitbox.style-scope.ytd-comment-thread-renderer {
                        display: none !important;
                        pointer-events: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-thread-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model > #body > #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer > #body > #main,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model ytd-expander,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer ytd-expander,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #content,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #content,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model .ytAttributedStringHost,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer .ytAttributedStringHost {
                        pointer-events: auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #content-text *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #content-text *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #published-time-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model .ytAttributedStringHost,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer .ytAttributedStringHost {
                        -webkit-user-select: text !important;
                        user-select: text !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #content-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer yt-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model yt-core-attributed-string,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer yt-core-attributed-string {
                        cursor: text !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #inline-action-menu {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #inline-action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #inline-action-menu ytd-menu-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #inline-action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #inline-action-menu yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #action-menu button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #action-menu button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #inline-action-menu button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #inline-action-menu button {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model:hover #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer:hover #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model:hover #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer:hover #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model:focus-within #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer:focus-within #action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model:focus-within #inline-action-menu,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer:focus-within #inline-action-menu {
                        opacity: 1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #action-menu button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #action-menu button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #inline-action-menu button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #inline-action-menu button:hover {
                        background: rgba(255, 255, 255, 0.075) !important;
                        color: rgba(255, 255, 255, 0.96) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #inline-action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #inline-action-menu yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #action-menu svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #action-menu svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #inline-action-menu svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #inline-action-menu svg {
                        width: 18px !important;
                        height: 18px !important;
                        color: inherit !important;
                        fill: currentColor !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar {
                        display: block !important;
                        margin: 9px 0 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar > * {
                        flex: 0 0 auto !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #reply-button-end,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #reply-button-end yt-button-shape,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #reply-button-end .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-creator-heart-renderer {
                        display: inline-flex !important;
                        align-items: center !important;
                        flex: 0 0 auto !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #dislike-button {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar .yt-spec-button-shape-next {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer {
                        position: relative !important;
                        margin: 7px 0 0 12px !important;
                        padding: 4px 0 0 7px !important;
                        border-left: 1px solid rgba(var(--ytkit-split-accent-rgb), 0.18) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-replies-renderer {
                        margin-left: 8px !important;
                        padding-left: 6px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-renderer {
                        padding: 10px 40px 10px 10px !important;
                        border-radius: 12px !important;
                        box-shadow: none !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.034), rgba(255, 255, 255, 0.016)),
                            rgba(9, 13, 20, 0.72) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-view-model > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-renderer > #body {
                        gap: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail yt-img-shadow {
                        flex-basis: 28px !important;
                        width: 28px !important;
                        height: 28px !important;
                        border-radius: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer .show-replies-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies-sub-thread,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread {
                        margin: 6px 0 0 !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer .show-replies-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies-sub-thread .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies-sub-thread button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread button {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer .show-replies-button button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies-sub-thread .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies-sub-thread button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies button:hover,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread button:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.3) !important;
                        background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.022)), rgba(var(--ytkit-split-accent-rgb), 0.12) !important;
                        color: rgba(255, 255, 255, 0.98) !important;
                        transform: translateY(-1px) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread button {
                        color: rgba(203, 213, 225, 0.74) !important;
                        background: linear-gradient(180deg, rgba(255, 255, 255, 0.038), rgba(255, 255, 255, 0.015)), rgba(7, 10, 16, 0.52) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer .show-replies-button yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer .show-replies-button svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies-sub-thread yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #more-replies-sub-thread svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer #less-replies-sub-thread svg {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer {
                        gap: 6px !important;
                        min-height: 0 !important;
                        margin-bottom: 8px !important;
                        padding: 8px 10px 8px !important;
                        border-radius: 12px !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.014)),
                            rgba(12, 16, 24, 0.74) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #title,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #leading-section,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #additional-section {
                        min-height: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #count.ytd-comments-header-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        font-size: 14px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 28px !important;
                        height: 28px !important;
                        padding: 0 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer {
                        min-height: 0 !important;
                        height: auto !important;
                        margin-bottom: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        display: block !important;
                        min-height: 0 !important;
                        gap: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #avatar {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer #placeholder-area,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-commentbox #contenteditable-textarea {
                        min-height: 34px !important;
                        padding: 0 11px !important;
                        border-radius: 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #thumbnail-input-row,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #placeholder-area {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog {
                        display: block !important;
                        width: 100% !important;
                        min-width: 0 !important;
                        max-width: none !important;
                        grid-column: 1 / -1 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #thumbnail-input-row {
                        display: block !important;
                        grid-template-columns: minmax(0, 1fr) !important;
                        gap: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #comment-dialog ytd-commentbox #avatar {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-thread-renderer {
                        margin-bottom: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer {
                        padding: 11px 54px 10px 11px !important;
                        border-radius: 12px !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.028), 0 10px 22px rgba(2, 6, 12, 0.2) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #author-text,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-view-model #author-text *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-renderer #author-text * {
                        background: transparent !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        color: rgba(248, 250, 252, 0.96) !important;
                        padding: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar {
                        margin-top: 8px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar {
                        gap: 5px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-engagement-bar #toolbar .yt-spec-button-shape-next,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button yt-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button tp-yt-paper-icon-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button .yt-spec-button-shape-next {
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

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button yt-icon,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button svg {
                        max-width: 15px !important;
                        max-height: 15px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-creator-heart-renderer,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button button {
                        width: 26px !important;
                        min-width: 26px !important;
                        height: 26px !important;
                        min-height: 26px !important;
                        padding: 0 !important;
                        border-radius: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button button {
                        border: 1px solid rgba(255, 112, 122, 0.2) !important;
                        background: radial-gradient(circle at 30% 30%, rgba(255, 132, 144, 0.18), rgba(255, 112, 122, 0.07)) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button yt-interaction,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button #hearted-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button #hearted-border {
                        display: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button #hearted,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button #hearted svg,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments #creator-heart-button #hearted .yt-icon-shape {
                        display: block !important;
                        width: 13px !important;
                        height: 13px !important;
                        max-width: 13px !important;
                        max-height: 13px !important;
                        color: rgba(255, 112, 122, 0.98) !important;
                        fill: currentColor !important;
                    }

                    /* Final premium surface layer. Preserve native YouTube layout. */
                    html:is(.ytkit-split-active, .ytkit-split-open) {
                        --ytkit-split-canvas: var(--ytkit-premium-canvas, #07101b);
                        --ytkit-split-panel: var(--ytkit-premium-panel, #0d1928);
                        --ytkit-split-raised: var(--ytkit-premium-raised, #122238);
                        --ytkit-split-hover: var(--ytkit-premium-hover, #172a42);
                        --ytkit-split-border: var(--ytkit-premium-border, rgba(151, 178, 208, 0.22));
                        --ytkit-split-border-strong: var(--ytkit-premium-border-strong, rgba(151, 178, 208, 0.36));
                        --ytkit-split-text: var(--ytkit-premium-text, #f5f7fb);
                        --ytkit-split-muted: var(--ytkit-premium-muted, #aab7c8);
                        --ytkit-split-accent: var(--ytkit-premium-accent, #ff5d4a);
                        --ytkit-split-accent-fill: var(--ytkit-premium-accent-fill, #cf352f);
                        --ytkit-split-accent-rgb: var(--ytkit-premium-accent-rgb, 255, 93, 74);
                        --ytkit-split-scrollbar: var(--ytkit-premium-scrollbar, rgba(151, 178, 208, 0.34));
                        --ytkit-split-control: var(--ytkit-premium-control, #101f33);
                        --ytkit-split-control-hover: var(--ytkit-premium-control-hover, #192e48);
                        --ytkit-split-control-active: var(--ytkit-premium-control-active, #1d3653);
                        --ytkit-split-control-selected: var(--ytkit-premium-control-selected, rgba(255, 93, 74, 0.14));
                        --ytkit-split-control-selected-border: var(--ytkit-premium-control-selected-border, rgba(255, 93, 74, 0.52));
                        --ytkit-split-control-shadow: var(--ytkit-premium-control-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 5px 14px rgba(0, 0, 0, 0.24));
                        --ytkit-split-control-shadow-hover: var(--ytkit-premium-control-shadow-hover, inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 8px 20px rgba(0, 0, 0, 0.30));
                        --ytkit-split-comment-control: rgba(151, 178, 208, 0.08);
                        --ytkit-split-comment-control-hover: rgba(151, 178, 208, 0.15);
                        --ytkit-split-comment-control-active: rgba(151, 178, 208, 0.20);
                        --ytkit-split-comment-border: rgba(151, 178, 208, 0.18);
                        --ytkit-split-comment-divider: rgba(151, 178, 208, 0.16);
                        --ytkit-split-comment-shadow: none;
                        --ytkit-split-comment-shadow-hover: inset 0 1px 0 rgba(255, 255, 255, 0.055);
                        background: var(--ytkit-split-canvas) !important;
                        color-scheme: dark !important;
                    }
                    html:not([dark]):is(.ytkit-split-active, .ytkit-split-open) {
                        --ytkit-split-canvas: var(--ytkit-premium-canvas, #eef2f6);
                        --ytkit-split-panel: var(--ytkit-premium-panel, #ffffff);
                        --ytkit-split-raised: var(--ytkit-premium-raised, #f3f6f9);
                        --ytkit-split-hover: var(--ytkit-premium-hover, #e8edf3);
                        --ytkit-split-border: var(--ytkit-premium-border, rgba(30, 53, 78, 0.18));
                        --ytkit-split-border-strong: var(--ytkit-premium-border-strong, rgba(30, 53, 78, 0.30));
                        --ytkit-split-text: var(--ytkit-premium-text, #172335);
                        --ytkit-split-muted: var(--ytkit-premium-muted, #536278);
                        --ytkit-split-scrollbar: var(--ytkit-premium-scrollbar, rgba(30, 53, 78, 0.30));
                        --ytkit-split-control: var(--ytkit-premium-control, #f7f9fb);
                        --ytkit-split-control-hover: var(--ytkit-premium-control-hover, #edf2f7);
                        --ytkit-split-control-active: var(--ytkit-premium-control-active, #e3eaf2);
                        --ytkit-split-control-selected: var(--ytkit-premium-control-selected, rgba(207, 53, 47, 0.10));
                        --ytkit-split-control-selected-border: var(--ytkit-premium-control-selected-border, rgba(207, 53, 47, 0.44));
                        --ytkit-split-control-shadow: var(--ytkit-premium-control-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 4px 12px rgba(20, 35, 54, 0.12));
                        --ytkit-split-control-shadow-hover: var(--ytkit-premium-control-shadow-hover, inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 7px 18px rgba(20, 35, 54, 0.17));
                        --ytkit-split-comment-control: rgba(30, 53, 78, 0.055);
                        --ytkit-split-comment-control-hover: rgba(30, 53, 78, 0.10);
                        --ytkit-split-comment-control-active: rgba(30, 53, 78, 0.15);
                        --ytkit-split-comment-border: rgba(30, 53, 78, 0.16);
                        --ytkit-split-comment-divider: rgba(30, 53, 78, 0.14);
                        --ytkit-split-comment-shadow: none;
                        --ytkit-split-comment-shadow-hover: inset 0 1px 0 rgba(255, 255, 255, 0.72);
                        color-scheme: light !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) body {
                        background: var(--ytkit-split-canvas) !important;
                        color: var(--ytkit-split-text) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-wrapper,
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-left {
                        background: transparent !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-right,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface {
                        border-inline-start: 1px solid var(--ytkit-split-border) !important;
                        background: var(--ytkit-split-panel) !important;
                        color: var(--ytkit-split-text) !important;
                        scrollbar-color: var(--ytkit-split-scrollbar) transparent !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-divider {
                        width: 8px !important;
                        flex-basis: 8px !important;
                        border-inline: 1px solid var(--ytkit-split-border) !important;
                        background: var(--ytkit-split-canvas) !important;
                        overflow: visible !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-divider:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.62) !important;
                        background: rgba(var(--ytkit-split-accent-rgb), 0.08) !important;
                    }
                    html.ytkit-split-active #ytkit-split-divider[data-ytkit-panel-state="closed"] {
                        width: 8px !important;
                        flex-basis: 8px !important;
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.5) !important;
                        background: rgba(var(--ytkit-split-accent-rgb), 0.1) !important;
                    }
                    html.ytkit-split-active #ytkit-split-divider[data-ytkit-panel-state="closed"] .ytkit-divider-pip {
                        opacity: 0.86 !important;
                        background: rgba(var(--ytkit-split-accent-rgb), 0.82) !important;
                    }
                    html.ytkit-split-active #ytkit-split-divider[data-ytkit-panel-state="hidden"] {
                        width: 0 !important;
                        flex-basis: 0 !important;
                        border: 0 !important;
                        overflow: hidden !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-divider:focus-visible {
                        outline: 2px solid var(--ytkit-split-accent) !important;
                        outline-offset: -2px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-divider .ytkit-divider-pip {
                        width: 2px !important;
                        height: 46px !important;
                        border-radius: 0 !important;
                        background: var(--ytkit-split-muted) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-close {
                        width: 34px !important;
                        height: 34px !important;
                        border: 1px solid var(--ytkit-split-border-strong) !important;
                        border-radius: 6px !important;
                        background: var(--ytkit-split-raised) !important;
                        color: var(--ytkit-split-text) !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-close:hover {
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.62) !important;
                        background: var(--ytkit-split-hover) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-collapse-strip {
                        background: transparent !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title,
                    html:is(.ytkit-split-active, .ytkit-split-open) .ytkit-split-live-card,
                    html:is(.ytkit-split-active, .ytkit-split-open) .ytkit-split-actions-docked {
                        border: 1px solid var(--ytkit-split-border) !important;
                        border-left: 2px solid rgba(var(--ytkit-split-accent-rgb), 0.64) !important;
                        border-radius: 8px !important;
                        background: var(--ytkit-split-panel) !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title {
                        row-gap: 6px !important;
                        padding: 8px 10px 9px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title :is(
                        h1,
                        yt-formatted-string,
                        yt-attributed-string,
                        .yt-core-attributed-string,
                        .yt-core-attributed-string--white-space-pre-wrap
                    ) {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-upload-meta {
                        min-height: 40px !important;
                        height: 40px !important;
                        padding: 4px 9px !important;
                        border: 1px solid rgba(var(--ytkit-split-accent-rgb), 0.24) !important;
                        border-radius: 8px !important;
                        background: var(--ytkit-split-raised) !important;
                        box-shadow: none !important;
                        box-sizing: border-box !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-upload-date {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        font-size: 11.5px !important;
                        line-height: 1.15 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #title .ytkit-split-view-count {
                        color: var(--ytkit-split-muted) !important;
                        -webkit-text-fill-color: var(--ytkit-split-muted) !important;
                        font-size: 10.75px !important;
                        line-height: 1.15 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata :is(
                        #info,
                        #info-container,
                        #info-text
                    ) {
                        display: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #owner {
                        grid-template-columns: minmax(0, 1fr) auto !important;
                        grid-template-areas:
                            "owner sub"
                            "actions actions" !important;
                        align-content: center !important;
                        align-items: center !important;
                        gap: 6px 10px !important;
                        min-height: 0 !important;
                        padding: 8px 10px !important;
                        border: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 8px !important;
                        background: var(--ytkit-split-raised) !important;
                        color: var(--ytkit-split-text) !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #owner :is(
                        #channel-name,
                        #channel-name *,
                        yt-formatted-string,
                        yt-attributed-string
                    ) {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata #owner :is(
                        #owner-sub-count,
                        #owner-sub-count *
                    ) {
                        color: var(--ytkit-split-muted) !important;
                        -webkit-text-fill-color: var(--ytkit-split-muted) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface ytd-watch-metadata #owner#owner {
                        border-color: var(--ytkit-split-border) !important;
                        background: var(--ytkit-split-raised) !important;
                        background-image: none !important;
                        color: var(--ytkit-split-text) !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface ytd-watch-metadata #owner#owner :is(
                        #channel-name#channel-name,
                        #channel-name#channel-name *,
                        yt-formatted-string,
                        yt-attributed-string
                    ) {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface ytd-watch-metadata #owner#owner :is(
                        #owner-sub-count#owner-sub-count,
                        #owner-sub-count#owner-sub-count *
                    ) {
                        color: var(--ytkit-split-muted) !important;
                        -webkit-text-fill-color: var(--ytkit-split-muted) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner ytd-video-owner-renderer {
                        grid-area: owner !important;
                        gap: 8px !important;
                        min-height: 0 !important;
                        height: 38px !important;
                        max-height: 38px !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner ytd-video-owner-renderer :is(
                        #avatar,
                        #avatar img,
                        #avatar yt-img-shadow
                    ) {
                        width: 38px !important;
                        min-width: 38px !important;
                        height: 38px !important;
                        flex-basis: 38px !important;
                        border-radius: 8px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner :is(
                        #subscribe-button,
                        yt-subscribe-button-view-model,
                        ytd-subscribe-button-renderer
                    ) {
                        grid-area: sub !important;
                        width: auto !important;
                        max-width: 100% !important;
                        justify-self: end !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner .ytkit-split-owner-actions {
                        grid-area: actions !important;
                        grid-column: 1 / -1 !important;
                        gap: 5px !important;
                        min-height: 30px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #description-inline-expander,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface ytd-watch-metadata ytd-text-inline-expander {
                        border: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 8px !important;
                        background: var(--ytkit-split-raised) !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface :is(
                        #actions,
                        #owner,
                        #top-level-buttons-computed,
                        ytd-menu-renderer
                    ) :is(button, .yt-spec-button-shape-next, tp-yt-paper-button) {
                        border-radius: 6px !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comments-header-renderer {
                        border: 0 !important;
                        border-bottom: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 0 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments :is(
                        ytd-comment-simplebox-renderer,
                        ytd-commentbox
                    ) {
                        border: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 8px !important;
                        background: var(--ytkit-split-raised) !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments :is(
                        ytd-comment-view-model,
                        ytd-comment-renderer
                    ) {
                        border: 0 !important;
                        border-bottom: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 0 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments ytd-comment-replies-renderer :is(
                        ytd-comment-view-model,
                        ytd-comment-renderer
                    ) {
                        border: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 8px !important;
                        background: var(--ytkit-split-raised) !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface :is(
                        ytd-watch-metadata,
                        ytd-comments#comments,
                        ytd-comments-header-renderer,
                        ytd-comment-view-model,
                        ytd-comment-renderer,
                        ytd-commentbox,
                        ytd-comment-simplebox-renderer
                    ) {
                        color: var(--ytkit-split-text) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface :is(
                        #content-text,
                        #content-text *,
                        #author-text,
                        #author-text *,
                        #count,
                        #count *
                    ) {
                        color: var(--ytkit-split-text) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments :is(
                        #content-text#content-text,
                        #content-text#content-text *,
                        #author-text#author-text,
                        #author-text#author-text *,
                        #count#count,
                        #count#count *
                    ) {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments :is(
                        #content#content,
                        #content-text#content-text,
                        #content-text#content-text *
                    ) {
                        background: transparent !important;
                        background-image: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface :is(
                        #published-time-text,
                        #published-time-text *,
                        .published-time-text,
                        .published-time-text *,
                        #placeholder-area,
                        #vote-count-middle
                    ) {
                        color: var(--ytkit-split-muted) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments :is(
                        ytd-comments-header-renderer #sort-menu,
                        ytd-comments-header-renderer #sort-menu *,
                        ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer,
                        ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer *,
                        ytd-comment-engagement-bar,
                        ytd-comment-engagement-bar *
                    ) {
                        color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #toolbar {
                        align-items: center !important;
                        gap: 8px !important;
                        min-height: 32px !important;
                        height: 32px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #toolbar > * {
                        margin: 0 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #toolbar#toolbar > :is(
                        #like-button,
                        #reply-button-end,
                        #creator-heart-button
                    ) {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        align-self: center !important;
                        flex: 0 0 auto !important;
                        width: auto !important;
                        min-width: 0 !important;
                        height: 32px !important;
                        min-height: 32px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        line-height: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #toolbar#toolbar > :is(
                        #like-button,
                        #reply-button-end,
                        #creator-heart-button
                    ) > :is(yt-button-shape, ytd-button-renderer, yt-icon-button) {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: auto !important;
                        min-width: 0 !important;
                        height: 32px !important;
                        min-height: 32px !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments :is(
                        ytd-comment-view-model,
                        ytd-comment-renderer
                    ):is(:hover, :focus-within) {
                        border-bottom-color: var(--ytkit-split-border-strong) !important;
                        background: var(--ytkit-split-hover) !important;
                        background-image: none !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #vote-count-middle {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        align-self: center !important;
                        flex: 0 0 auto !important;
                        min-width: 0 !important;
                        height: 30px !important;
                        min-height: 30px !important;
                        margin: 0 4px 0 -4px !important;
                        padding: 0 4px !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        background: transparent !important;
                        background-image: none !important;
                        color: var(--ytkit-split-muted) !important;
                        -webkit-text-fill-color: var(--ytkit-split-muted) !important;
                        box-shadow: none !important;
                        font-size: 11.5px !important;
                        font-weight: 700 !important;
                        font-variant-numeric: tabular-nums !important;
                        line-height: 1 !important;
                        letter-spacing: 0.01em !important;
                        cursor: default !important;
                        pointer-events: none !important;
                        box-sizing: border-box !important;
                        transform: translateY(0) !important;
                        transition:
                            transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1),
                            border-color 150ms ease,
                            background-color 150ms ease,
                            color 150ms ease,
                            box-shadow 150ms ease !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #vote-count-middle::before,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #vote-count-middle::after {
                        content: none !important;
                        display: none !important;
                        width: 0 !important;
                        height: 0 !important;
                        border: 0 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ) {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        min-width: 30px !important;
                        min-height: 30px !important;
                        height: 30px !important;
                        padding: 0 9px !important;
                        border: 1px solid transparent !important;
                        border-radius: 6px !important;
                        background: var(--ytkit-split-comment-control) !important;
                        background-image: none !important;
                        color: var(--ytkit-split-text) !important;
                        box-shadow: none !important;
                        font-size: 12px !important;
                        font-weight: 650 !important;
                        line-height: 1 !important;
                        letter-spacing: 0.01em !important;
                        cursor: pointer !important;
                        isolation: isolate !important;
                        transform: translateY(0) !important;
                        transition:
                            transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1),
                            border-color 150ms ease,
                            background-color 150ms ease,
                            color 150ms ease,
                            box-shadow 150ms ease !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button:is(button, .yt-spec-button-shape-next),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button :is(button, .yt-spec-button-shape-next, tp-yt-paper-button, yt-icon-button) {
                        width: 30px !important;
                        min-width: 30px !important;
                        height: 30px !important;
                        min-height: 30px !important;
                        padding: 0 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button:is(button, .yt-spec-button-shape-next):has(~ #vote-count-middle:not(:empty)),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button:has(~ #vote-count-middle:not(:empty)) :is(button, .yt-spec-button-shape-next, tp-yt-paper-button, yt-icon-button) {
                        border-inline-end-color: transparent !important;
                        border-radius: 6px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #reply-button-end :is(button, .yt-spec-button-shape-next, tp-yt-paper-button) {
                        min-width: 48px !important;
                        height: 30px !important;
                        min-height: 30px !important;
                        padding-inline: 10px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button :is(yt-icon, svg, .yt-icon-shape),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #reply-button-end :is(yt-icon, svg, .yt-icon-shape) {
                        width: 17px !important;
                        height: 17px !important;
                        min-width: 17px !important;
                        color: currentColor !important;
                        fill: currentColor !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #creator-heart-button:is(button, .yt-spec-button-shape-next, yt-icon-button),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #creator-heart-button :is(button, .yt-spec-button-shape-next, tp-yt-paper-button, yt-icon-button) {
                        width: 30px !important;
                        min-width: 30px !important;
                        height: 30px !important;
                        min-height: 30px !important;
                        padding: 0 !important;
                        border-color: var(--ytkit-split-control-selected-border) !important;
                        border-radius: 6px !important;
                        background: var(--ytkit-split-control-selected) !important;
                        color: var(--ytkit-split-accent-fill) !important;
                        -webkit-text-fill-color: currentColor !important;
                        box-shadow: var(--ytkit-split-comment-shadow) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #creator-heart-button :is(
                        #hearted,
                        #hearted svg,
                        yt-icon,
                        svg,
                        .yt-icon-shape
                    ) {
                        width: 16px !important;
                        height: 16px !important;
                        min-width: 16px !important;
                        max-width: 16px !important;
                        max-height: 16px !important;
                        color: var(--ytkit-split-accent-fill) !important;
                        fill: currentColor !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ) *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    )::before,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    )::after {
                        background: transparent !important;
                        background-image: none !important;
                        border: 0 !important;
                        outline: 0 !important;
                        color: inherit !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(svg, path) {
                        fill: currentColor !important;
                        stroke: currentColor !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ):hover:not([disabled]):not([aria-disabled="true"]) {
                        border-color: var(--ytkit-split-comment-border) !important;
                        background: var(--ytkit-split-comment-control-hover) !important;
                        color: var(--ytkit-split-text) !important;
                        box-shadow: var(--ytkit-split-comment-shadow-hover) !important;
                        transform: translateY(-1px) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button:is(:hover, :focus-within) ~ #vote-count-middle {
                        border-color: transparent !important;
                        background: transparent !important;
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: currentColor !important;
                        box-shadow: none !important;
                        transform: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ):active:not([disabled]):not([aria-disabled="true"]) {
                        border-color: var(--ytkit-split-control-selected-border) !important;
                        background: var(--ytkit-split-comment-control-active) !important;
                        box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.24) !important;
                        transform: translateY(0) scale(0.98) !important;
                        transition-duration: 60ms !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button:active ~ #vote-count-middle {
                        border-color: transparent !important;
                        background: transparent !important;
                        box-shadow: none !important;
                        transform: none !important;
                        transition-duration: 60ms !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    )[aria-pressed="true"],
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button[aria-pressed="true"] :is(button, .yt-spec-button-shape-next),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-action-buttons-renderer[is-liked] #like-button :is(button, .yt-spec-button-shape-next) {
                        border-color: var(--ytkit-split-control-selected-border) !important;
                        background: var(--ytkit-split-control-selected) !important;
                        color: var(--ytkit-split-accent-fill) !important;
                        -webkit-text-fill-color: currentColor !important;
                        box-shadow: var(--ytkit-split-comment-shadow) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button:has([aria-pressed="true"]) ~ #vote-count-middle,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar #like-button[aria-pressed="true"] ~ #vote-count-middle,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-action-buttons-renderer[is-liked] #like-button ~ #vote-count-middle {
                        border-color: transparent !important;
                        background: transparent !important;
                        color: var(--ytkit-split-accent-fill) !important;
                        -webkit-text-fill-color: currentColor !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ):is([disabled], [aria-disabled="true"]) {
                        border-color: var(--ytkit-split-comment-border) !important;
                        background: var(--ytkit-split-comment-control) !important;
                        color: var(--ytkit-split-muted) !important;
                        -webkit-text-fill-color: currentColor !important;
                        box-shadow: none !important;
                        opacity: 0.58 !important;
                        cursor: not-allowed !important;
                        transform: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments :is(
                        #content-text,
                        #content-text *
                    ) {
                        background: transparent !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner :is(
                        #actions,
                        #top-level-buttons-computed,
                        ytd-menu-renderer
                    ) :is(button, .yt-spec-button-shape-next, tp-yt-paper-button, yt-icon-button),
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface .ytkit-split-actions-docked :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ) {
                        border: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 6px !important;
                        background: var(--ytkit-split-control) !important;
                        background-image: none !important;
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner .ytkit-split-owner-actions :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ) {
                        min-height: 30px !important;
                        height: 30px !important;
                        padding-inline: 9px !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner .ytkit-split-owner-actions :is(
                        #text,
                        #text *,
                        yt-formatted-string,
                        yt-attributed-string,
                        .yt-core-attributed-string,
                        span
                    ) {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner .ytkit-split-owner-actions :is(
                        segmented-like-dislike-button-view-model,
                        like-button-view-model,
                        dislike-button-view-model,
                        toggle-button-view-model,
                        yt-button-shape,
                        .ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper
                    ) {
                        background: transparent !important;
                        background-image: none !important;
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner .ytkit-split-owner-actions :is(
                        .ytSpecButtonShapeNextButtonTextContent,
                        .yt-spec-button-shape-next__button-text-content
                    ) {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                        opacity: 1 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner #subscribe-button :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button
                    ) {
                        min-width: 98px !important;
                        min-height: 32px !important;
                        height: 32px !important;
                        padding-inline: 14px !important;
                        border-color: rgba(var(--ytkit-split-accent-rgb), 0.58) !important;
                        border-radius: 6px !important;
                        background: var(--ytkit-split-accent-fill) !important;
                        color: #ffffff !important;
                        -webkit-text-fill-color: #ffffff !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #owner#owner :is(
                        #actions,
                        #top-level-buttons-computed,
                        ytd-menu-renderer
                    ) :is(button, .yt-spec-button-shape-next, tp-yt-paper-button, yt-icon-button) *,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface .ytkit-split-actions-docked :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ) * {
                        background: transparent !important;
                        background-image: none !important;
                        color: inherit !important;
                        -webkit-text-fill-color: inherit !important;
                        opacity: 1 !important;
                        box-shadow: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface :is(
                        #owner#owner,
                        .ytkit-split-actions-docked
                    ) :is(svg, path) {
                        fill: currentColor !important;
                        stroke: currentColor !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ) {
                        border-radius: 6px !important;
                        background-image: none !important;
                        box-shadow: none !important;
                        transform: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    )[disabled] {
                        opacity: 0.46 !important;
                        cursor: not-allowed !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface #comments :is(
                        button,
                        .yt-spec-button-shape-next,
                        tp-yt-paper-button,
                        yt-icon-button
                    ):active {
                        transform: translateY(1px) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-replies-renderer {
                        border-inline-start: 1px solid var(--ytkit-split-comment-divider) !important;
                        border-left-color: var(--ytkit-split-comment-divider) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-replies-renderer .ytSubThreadConnection {
                        border: 0 !important;
                        background: transparent !important;
                        opacity: 0 !important;
                        pointer-events: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-replies-renderer :is(
                        .show-replies-button button,
                        #more-replies .yt-spec-button-shape-next,
                        #more-replies-sub-thread .yt-spec-button-shape-next,
                        #less-replies .yt-spec-button-shape-next,
                        #less-replies-sub-thread .yt-spec-button-shape-next,
                        #more-replies button,
                        #more-replies-sub-thread button,
                        #less-replies button,
                        #less-replies-sub-thread button
                    ) {
                        min-height: 30px !important;
                        height: 30px !important;
                        padding-inline: 10px !important;
                        border: 1px solid var(--ytkit-split-comment-border) !important;
                        border-radius: 6px !important;
                        background: var(--ytkit-split-comment-control) !important;
                        background-image: none !important;
                        color: var(--ytkit-split-muted) !important;
                        -webkit-text-fill-color: var(--ytkit-split-muted) !important;
                        box-shadow: none !important;
                        transform: none !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-replies-renderer :is(
                        .show-replies-button button,
                        #more-replies .yt-spec-button-shape-next,
                        #more-replies-sub-thread .yt-spec-button-shape-next,
                        #less-replies .yt-spec-button-shape-next,
                        #less-replies-sub-thread .yt-spec-button-shape-next,
                        #more-replies button,
                        #more-replies-sub-thread button,
                        #less-replies button,
                        #less-replies-sub-thread button
                    ):hover {
                        border-color: var(--ytkit-split-border-strong) !important;
                        background: var(--ytkit-split-comment-control-hover) !important;
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) .ytkit-split-live-header {
                        border-bottom: 1px solid var(--ytkit-split-border) !important;
                        background: var(--ytkit-split-panel) !important;
                        color: var(--ytkit-split-text) !important;
                        box-shadow: none !important;
                        overflow: hidden !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) .ytkit-split-live-card {
                        border-color: var(--ytkit-split-border) !important;
                        background: var(--ytkit-split-raised) !important;
                        box-shadow: var(--ytkit-split-control-shadow) !important;
                        overflow: hidden !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) :is(
                        .ytkit-split-live-channel,
                        .ytkit-split-live-title,
                        .ytkit-split-live-view-count
                    ) {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) .ytkit-split-live-title {
                        display: -webkit-box !important;
                        max-height: 2.44em !important;
                        overflow: hidden !important;
                        text-overflow: ellipsis !important;
                        -webkit-box-orient: vertical !important;
                        -webkit-line-clamp: 2 !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) .ytkit-split-live-view-count {
                        border-color: var(--ytkit-split-border) !important;
                        background: var(--ytkit-split-comment-control) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) .ytkit-split-live-date {
                        color: var(--ytkit-split-muted) !important;
                        -webkit-text-fill-color: var(--ytkit-split-muted) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) [data-ytkit-split-live-pinned="1"],
                    html:is(.ytkit-split-active, .ytkit-split-open) [data-ytkit-split-live-pinned="1"] * {
                        color: var(--ytkit-split-text) !important;
                        -webkit-text-fill-color: var(--ytkit-split-text) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) [data-ytkit-split-live-pinned="1"] :is(
                        button,
                        .yt-spec-button-shape-next,
                        .ytSpecButtonShapeNextHost
                    ) {
                        border: 1px solid var(--ytkit-split-border) !important;
                        border-radius: 10px !important;
                        background: var(--ytkit-split-control) !important;
                        box-shadow: var(--ytkit-split-control-shadow) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) [data-ytkit-split-live-pinned="1"] :is(
                        button,
                        .yt-spec-button-shape-next,
                        .ytSpecButtonShapeNextHost
                    ):hover {
                        border-color: var(--ytkit-split-border-strong) !important;
                        background: var(--ytkit-split-control-hover) !important;
                        box-shadow: var(--ytkit-split-control-shadow-hover) !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) [data-ytkit-split-live-pinned="1"] :is(svg, path) {
                        color: var(--ytkit-split-text) !important;
                        fill: currentColor !important;
                    }
                    html:is(.ytkit-split-active, .ytkit-split-open) :is(button, input, textarea, select, a):focus-visible {
                        outline: 2px solid var(--ytkit-split-accent) !important;
                        outline-offset: 2px !important;
                        box-shadow: none !important;
                    }

                    @media (prefers-reduced-motion: reduce) {
                        html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-wrapper *,
                        html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-wrapper *::before,
                        html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-wrapper *::after {
                            transition-duration: 0.01ms !important;
                            animation-duration: 0.01ms !important;
                            animation-iteration-count: 1 !important;
                        }
                    }

                    @media (forced-colors: active) {
                        html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-divider,
                        html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-close,
                        html:is(.ytkit-split-active, .ytkit-split-open) #below.ytkit-split-scroll-surface {
                            border-color: CanvasText !important;
                        }
                        html:is(.ytkit-split-active, .ytkit-split-open) #ytkit-split-divider:focus-visible,
                        html:is(.ytkit-split-active, .ytkit-split-open) :is(button, input, textarea, select, a):focus-visible {
                            outline: 2px solid Highlight !important;
                            outline-offset: 2px !important;
                        }
                        html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                            button,
                            .yt-spec-button-shape-next,
                            tp-yt-paper-button,
                            yt-icon-button
                        ) {
                            border-color: ButtonText !important;
                            background: ButtonFace !important;
                            color: ButtonText !important;
                            box-shadow: none !important;
                            forced-color-adjust: auto !important;
                        }
                        html:is(.ytkit-split-active, .ytkit-split-open) #below#below.ytkit-split-scroll-surface #comments#comments ytd-comment-engagement-bar :is(
                            button,
                            .yt-spec-button-shape-next,
                            tp-yt-paper-button,
                            yt-icon-button
                        )[aria-pressed="true"] {
                            border-color: Highlight !important;
                            background: Highlight !important;
                            color: HighlightText !important;
                        }
                    }
                `;
    }

    const api = Object.freeze({
        STYLE_IDS,
        buildSplitShellCss,
        buildSplitMetaCss,
        buildSplitCommentsCss
    });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyVideoStyles = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
