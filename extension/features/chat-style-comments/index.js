(() => {
    'use strict';

    // extension/features/chat-style-comments/index.js
    //
    // Top-3 monolith peel seed for the Studio Comments feature. The monolith
    // still owns DOM observers and event listeners; this module owns the
    // style payload builders so tests can pin them independently and ytkit.js
    // can delegate to a feature namespace when the module is loaded.

    const STYLE_IDS = Object.freeze({
        base: 'chatStyleComments',
        premium: 'chatStyleComments-premium',
        interaction: 'chatStyleComments-premium-2'
    });

    function buildCommentRestyleCss() {
        return `ytd-comments#comments{background:rgba(var(--ytkit-accent-rgb),0.03) !important;background-image:linear-gradient(180deg,rgba(var(--ytkit-accent-rgb),0.05) 0%,rgba(var(--ytkit-accent-rgb),0.01) 100%) !important;border-radius:12px !important;padding:4px 8px !important}ytd-comment-thread-renderer{margin:0 !important;padding:0 !important;border:none !important;background:none !important}ytd-comment-thread-renderer[is-pinned]{background:none !important;border-radius:0 !important;padding:0 !important;margin:0 !important}#contents.ytd-item-section-renderer{margin:0 !important;padding:0 !important}ytd-comment-view-model,ytd-comment-renderer{position:relative !important;padding:8px 4px 6px !important;margin:0 !important;display:block !important;border-bottom:1px solid rgba(255,255,255,0.035) !important;transition:background 0.15s ease !important}ytd-comment-view-model:last-child,ytd-comment-renderer:last-child{border-bottom:none !important}ytd-comment-view-model:hover,ytd-comment-renderer:hover{background:rgba(var(--ytkit-accent-rgb),0.03) !important}ytd-comment-view-model>#body,ytd-comment-renderer>#body{display:flex !important;flex-direction:row !important;gap:10px !important;align-items:flex-start !important}ytd-comment-view-model #author-thumbnail,ytd-comment-renderer #author-thumbnail{display:block !important;flex-shrink:0 !important;width:28px !important;height:28px !important;margin-top:2px !important}ytd-comment-view-model #author-thumbnail img,ytd-comment-renderer #author-thumbnail img,ytd-comment-view-model #author-thumbnail yt-img-shadow,ytd-comment-renderer #author-thumbnail yt-img-shadow{width:28px !important;height:28px !important;border-radius:50% !important}ytd-comment-view-model>#body>#main,ytd-comment-renderer>#body>#main{flex:1 !important;min-width:0 !important;display:block !important}ytd-comment-view-model>#body>#main>#header,ytd-comment-renderer>#body>#main>#header{display:block !important;margin-bottom:3px !important}ytd-comment-view-model>#body>#main>#header>#header-author,ytd-comment-renderer>#body>#main>#header>#header-author{display:flex !important;flex-wrap:wrap !important;align-items:baseline !important;gap:0 6px !important}ytd-comment-view-model>#body>#main>#header>#header-author>h3,ytd-comment-renderer>#body>#main>#header>#header-author>h3{display:contents !important}ytd-comment-view-model #author-text,ytd-comment-renderer #author-text{display:inline !important;font-size:12.5px !important;font-weight:600 !important;color:var(--ytkit-accent) !important;line-height:1.4 !important;text-decoration:none !important;transition:color 0.15s !important}ytd-comment-view-model #author-text:hover,ytd-comment-renderer #author-text:hover{color:var(--ytkit-accent-light) !important}ytd-comment-view-model #author-text span,ytd-comment-renderer #author-text span{font-size:12.5px !important}ytd-comment-view-model ytd-author-comment-badge-renderer,ytd-comment-renderer ytd-author-comment-badge-renderer{display:inline-flex !important;vertical-align:baseline !important;margin-left:2px !important}.ytkit-vote-badge{display:inline-flex !important;align-items:center !important;font-size:10.5px !important;color:rgba(255,255,255,0.3) !important;cursor:pointer !important;vertical-align:baseline !important;gap:2px !important;padding:1px 4px !important;border-radius:3px !important;transition:all 0.15s ease !important}.ytkit-vote-badge:hover{color:rgba(var(--ytkit-accent-rgb),0.9) !important;background:rgba(var(--ytkit-accent-rgb),0.08) !important}.ytkit-vote-badge svg{width:11px !important;height:11px !important;fill:currentColor !important;vertical-align:-1px !important}.ytkit-vote-badge.ytkit-liked{color:rgba(var(--ytkit-accent-rgb),0.9) !important}ytd-comment-view-model #published-time-text,ytd-comment-renderer #published-time-text,ytd-comment-view-model .published-time-text,ytd-comment-renderer .published-time-text{display:inline !important;font-size:11px !important;color:rgba(255,255,255,0.25) !important;line-height:1.4 !important}ytd-comment-view-model #published-time-text a,ytd-comment-renderer #published-time-text a,ytd-comment-view-model .published-time-text a,ytd-comment-renderer .published-time-text a{color:rgba(255,255,255,0.25) !important;text-decoration:none !important}ytd-comment-view-model #pinned-comment-badge,ytd-comment-renderer #pinned-comment-badge,ytd-comment-view-model #linked-comment-badge,ytd-comment-view-model #paid-comment-background,ytd-comment-view-model #creator-heart-button,ytd-comment-renderer #creator-heart-button,ytd-comment-view-model #inline-action-menu,ytd-comment-renderer #inline-action-menu,ytd-comment-view-model #action-menu,ytd-comment-renderer #action-menu,ytd-comment-view-model #more,ytd-comment-view-model [slot="more"],ytd-comment-view-model #less,ytd-comment-view-model [slot="less"],ytd-comment-renderer tp-yt-paper-button.ytd-expander,ytd-comment-view-model #sponsor-comment-badge,ytd-comment-renderer #sponsor-comment-badge,ytd-comment-engagement-bar #dislike-button{display:none !important}ytd-comment-view-model #content-text,ytd-comment-renderer #content-text{display:block !important;font-size:13px !important;line-height:1.55 !important;color:rgba(255,255,255,0.78) !important;margin:0 !important;padding:0 !important;word-break:break-word !important}ytd-comment-view-model #content-text *,ytd-comment-renderer #content-text *{font-size:13px !important;line-height:1.55 !important}ytd-comment-view-model #content-text a,ytd-comment-renderer #content-text a{color:rgba(var(--ytkit-accent-rgb),0.75) !important;text-decoration:none !important}ytd-comment-view-model #content-text a:hover,ytd-comment-renderer #content-text a:hover{color:var(--ytkit-accent-light) !important;text-decoration:underline !important}ytd-comment-view-model #error-text{display:none !important}ytd-comment-view-model ytd-comment-engagement-bar,ytd-comment-renderer ytd-comment-engagement-bar{position:absolute !important;top:6px !important;right:4px !important;margin:0 !important;padding:0 !important;z-index:2 !important;pointer-events:none !important}ytd-comment-view-model:hover ytd-comment-engagement-bar,ytd-comment-renderer:hover ytd-comment-engagement-bar{pointer-events:auto !important}ytd-comment-engagement-bar #toolbar{display:none !important;position:static !important;align-items:center !important;gap:4px !important;margin:0 !important}ytd-comment-view-model:hover>* ytd-comment-engagement-bar #toolbar,ytd-comment-view-model:hover ytd-comment-engagement-bar #toolbar,ytd-comment-renderer:hover ytd-comment-engagement-bar #toolbar{display:inline-flex !important}ytd-comment-engagement-bar #like-button,ytd-comment-engagement-bar #dislike-button,ytd-comment-engagement-bar #vote-count-middle,ytd-comment-engagement-bar #vote-count-left,ytd-comment-engagement-bar #vote-count-right,ytd-comment-engagement-bar #creator-heart-button{display:none !important}ytd-comment-engagement-bar #reply-button-end .yt-spec-button-shape-next{height:24px !important;min-height:unset !important;padding:0 10px !important;font-size:11px !important;min-width:unset !important;color:rgba(var(--ytkit-accent-rgb),0.6) !important;background:rgba(var(--ytkit-accent-rgb),0.06) !important;border-radius:4px !important;transition:all 0.15s !important}ytd-comment-engagement-bar #reply-button-end .yt-spec-button-shape-next:hover{color:rgba(var(--ytkit-accent-rgb),0.9) !important;background:rgba(var(--ytkit-accent-rgb),0.12) !important}ytd-comment-engagement-bar #reply-button-end yt-icon{display:none !important}ytd-comment-engagement-bar #reply-dialog{padding:10px 0 4px !important;margin:0 !important;position:relative !important;width:100% !important;box-sizing:border-box !important;overflow:visible !important;border:none !important;outline:none !important;background:transparent !important}ytd-comment-engagement-bar #reply-dialog #unopened-dialog{display:none !important}ytd-comment-engagement-bar #reply-dialog:not(:has(ytd-commentbox:not([hidden]))){display:none !important}ytd-comment-engagement-bar #reply-dialog:empty{display:none !important;padding:0 !important}.ytkit-replying ytd-comment-engagement-bar{position:relative !important;top:auto !important;right:auto !important;pointer-events:auto !important;margin:4px 0 0 !important;width:100% !important;display:block !important}.ytkit-replying ytd-comment-engagement-bar #toolbar{display:none !important}.ytkit-replying:hover ytd-comment-engagement-bar #toolbar{display:none !important}ytd-comment-replies-renderer{margin:0 !important;padding:4px 0 4px 20px !important;border:none !important;display:block !important}.ytSubThreadThreadline,.ytSubThreadConnection,.ytSubThreadContinuation,.ytSubThreadShadow{display:none !important}yt-sub-thread{padding:0 !important;margin:0 !important}.ytSubThreadSubThreadContent{padding:0 !important}ytd-comment-replies-renderer #expanded-threads ytd-comment-view-model,ytd-comment-replies-renderer #expanded-threads ytd-comment-renderer,ytd-comment-replies-renderer #expander-contents ytd-comment-view-model,ytd-comment-replies-renderer #expander-contents ytd-comment-renderer{padding:8px 4px 8px 12px !important;border-bottom:none !important;border-left:2px solid rgba(var(--ytkit-accent-rgb),0.12) !important;border-radius:0 !important;margin:0 !important}ytd-comment-replies-renderer #expanded-threads ytd-comment-view-model:hover,ytd-comment-replies-renderer #expanded-threads ytd-comment-renderer:hover,ytd-comment-replies-renderer #expander-contents ytd-comment-view-model:hover,ytd-comment-replies-renderer #expander-contents ytd-comment-renderer:hover{border-left-color:rgba(var(--ytkit-accent-rgb),0.3) !important;background:rgba(var(--ytkit-accent-rgb),0.025) !important}ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail,ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail{width:22px !important;height:22px !important}ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail img,ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail img,ytd-comment-replies-renderer ytd-comment-view-model #author-thumbnail yt-img-shadow,ytd-comment-replies-renderer ytd-comment-renderer #author-thumbnail yt-img-shadow{width:22px !important;height:22px !important}.show-replies-button,ytd-comment-replies-renderer #more-replies,ytd-comment-replies-renderer #more-replies-sub-thread{margin:2px 0 !important;padding:0 !important}ytd-comment-replies-renderer #more-replies .yt-spec-button-shape-next,ytd-comment-replies-renderer #more-replies-sub-thread .yt-spec-button-shape-next{font-size:11px !important;height:24px !important;padding:0 10px !important;color:rgba(var(--ytkit-accent-rgb),0.6) !important;min-height:unset !important;min-width:unset !important;background:rgba(var(--ytkit-accent-rgb),0.06) !important;border-radius:4px !important;transition:all 0.15s !important}ytd-comment-replies-renderer #more-replies .yt-spec-button-shape-next:hover,ytd-comment-replies-renderer #more-replies-sub-thread .yt-spec-button-shape-next:hover{background:rgba(var(--ytkit-accent-rgb),0.12) !important;color:rgba(var(--ytkit-accent-rgb),0.9) !important}ytd-comment-replies-renderer #more-replies .yt-spec-button-shape-next yt-icon,ytd-comment-replies-renderer #more-replies-sub-thread .yt-spec-button-shape-next yt-icon,ytd-comment-replies-renderer #more-replies svg,ytd-comment-replies-renderer #more-replies-sub-thread svg,ytd-comment-replies-renderer #more-replies yt-icon,ytd-comment-replies-renderer #more-replies-sub-thread yt-icon,ytd-comment-replies-renderer .show-replies-button yt-icon,ytd-comment-replies-renderer .show-replies-button svg{display:none !important}ytd-comment-replies-renderer #expanded-threads,ytd-comment-replies-renderer #expander-contents,#collapsed-threads.ytd-comment-replies-renderer{padding:0 !important;margin:0 !important}ytd-comment-replies-renderer #less-replies,ytd-comment-replies-renderer #less-replies-sub-thread{margin:2px 0 !important;padding:0 !important}ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next,ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next{font-size:11px !important;height:24px !important;padding:0 10px !important;color:rgba(var(--ytkit-accent-rgb),0.35) !important;min-height:unset !important;background:rgba(var(--ytkit-accent-rgb),0.04) !important;border-radius:4px !important}ytd-comment-replies-renderer #less-replies .yt-spec-button-shape-next yt-icon,ytd-comment-replies-renderer #less-replies-sub-thread .yt-spec-button-shape-next yt-icon,ytd-comment-replies-renderer #less-replies svg,ytd-comment-replies-renderer #less-replies-sub-thread svg,ytd-comment-replies-renderer #less-replies yt-icon,ytd-comment-replies-renderer #less-replies-sub-thread yt-icon{display:none !important}ytd-comments-header-renderer{margin:0 0 4px 0 !important;padding:0 !important}ytd-comments-entry-point-header-renderer,ytd-comments-entry-point-teaser-renderer{display:none !important}ytd-continuation-item-renderer{padding:4px 0 !important}ytd-commentbox #divider-line{display:none !important}ytd-commentbox #thumbnail-input-row{display:flex !important;align-items:flex-start !important;gap:10px !important;background:transparent !important;border:none !important;padding:0 !important;margin:0 !important;width:100% !important;box-sizing:border-box !important}ytd-commentbox #creation-box,ytd-commentbox #main{background:transparent !important;border:none !important;padding:0 !important;margin:0 !important;flex:1 !important;min-width:0 !important;width:100% !important;box-sizing:border-box !important}ytd-commentbox .underline,ytd-commentbox .unfocused-line,ytd-commentbox .focused-line{display:none !important}ytd-commentbox #contenteditable-textarea{display:block !important;font-size:13px !important;padding:10px 12px !important;background:rgba(255,255,255,0.04) !important;border:1px solid rgba(var(--ytkit-accent-rgb),0.15) !important;border-radius:8px !important;min-height:44px !important;color:rgba(255,255,255,0.85) !important;line-height:1.5 !important;outline:none !important;width:100% !important;box-sizing:border-box !important;transition:border-color 0.2s,background 0.2s,box-shadow 0.2s !important}ytd-commentbox #creation-box:not(.not-focused) #contenteditable-textarea,ytd-commentbox #contenteditable-textarea:focus-within{border-color:rgba(var(--ytkit-accent-rgb),0.4) !important;background:rgba(255,255,255,0.06) !important;box-shadow:0 0 0 2px rgba(var(--ytkit-accent-rgb),0.08) !important}ytd-commentbox #contenteditable-root{font-size:13px !important;color:rgba(255,255,255,0.85) !important;line-height:1.5 !important;outline:none !important;border:none !important;background:transparent !important;padding:0 !important}ytd-commentbox #input-container,ytd-commentbox tp-yt-paper-input-container{background:transparent !important;border:none !important;padding:0 !important;width:100% !important;box-sizing:border-box !important}ytd-commentbox .input-wrapper{width:100% !important;box-sizing:border-box !important}ytd-commentbox #labelAndInputContainer{width:100% !important;box-sizing:border-box !important}ytd-commentbox .paper-input-input{width:100% !important;box-sizing:border-box !important}ytd-commentbox .floated-label-placeholder{display:none !important}ytd-commentbox #footer{margin-top:8px !important;gap:6px !important;display:flex !important;align-items:center !important}ytd-commentbox #footer #buttons{display:flex !important;align-items:center !important;gap:6px !important}ytd-commentbox #footer #buttons .yt-spec-button-shape-next{height:30px !important;font-size:12px !important;padding:0 16px !important;min-height:unset !important;border-radius:6px !important;transition:all 0.15s !important}ytd-commentbox #submit-button .yt-spec-button-shape-next--filled:not([disabled]){background:var(--ytkit-accent) !important;color:#000 !important}ytd-commentbox #submit-button .yt-spec-button-shape-next--filled:not([disabled]):hover{filter:brightness(1.15) !important}ytd-commentbox #cancel-button .yt-spec-button-shape-next{color:rgba(255,255,255,0.5) !important}ytd-commentbox #cancel-button .yt-spec-button-shape-next:hover{color:rgba(255,255,255,0.75) !important}ytd-commentbox #emoji-button .yt-spec-button-shape-next{color:rgba(255,255,255,0.3) !important;transition:color 0.15s !important}ytd-commentbox #emoji-button .yt-spec-button-shape-next:hover{color:rgba(var(--ytkit-accent-rgb),0.7) !important}ytd-commentbox #author-thumbnail{flex-shrink:0 !important;width:28px !important;height:28px !important;margin:0 !important;padding:0 !important}ytd-commentbox #author-thumbnail img,ytd-commentbox #author-thumbnail yt-img-shadow{width:28px !important;height:28px !important;border-radius:50% !important}`;
    }

    function buildPremiumCommentsCss() {
        return `
                    #comments ytd-comments#comments,
                    ytd-comments#comments {
                        display: block !important;
                        visibility: visible !important;
                        margin-top: 10px !important;
                        padding: 8px 10px 6px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.045) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.004)),
                            rgba(8, 11, 17, 0.6) !important;
                        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12) !important;
                        overflow: hidden !important;
                    }

                    #comments #contents.ytd-item-section-renderer,
                    #comments ytd-item-section-renderer > #contents {
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    #comments ytd-comments-header-renderer {
                        margin: 0 0 10px !important;
                        padding: 0 0 8px !important;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
                    }

                    #comments ytd-comments-header-renderer #title,
                    #comments ytd-comments-header-renderer #leading-section,
                    #comments ytd-comments-header-renderer #additional-section {
                        display: flex !important;
                        align-items: center !important;
                        gap: 6px !important;
                        flex-wrap: wrap !important;
                    }

                    #comments ytd-comments-header-renderer #title {
                        justify-content: flex-start !important;
                        margin: 0 !important;
                    }

                    #comments ytd-comments-header-renderer #count,
                    #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-block !important;
                        margin: 0 !important;
                        font-size: 13.5px !important;
                        font-weight: 700 !important;
                        letter-spacing: 0 !important;
                        color: rgba(255, 255, 255, 0.88) !important;
                    }

                    #comments yt-formatted-string.count-text.style-scope.ytd-comments-header-renderer {
                        display: inline-flex !important;
                        align-items: baseline !important;
                        gap: 0.26em !important;
                    }

                    #comments ytd-comments-header-renderer #count::before {
                        content: none !important;
                        display: none !important;
                    }

                    #comments ytd-comments-header-renderer #sort-menu,
                    #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer {
                        margin: 0 !important;
                        opacity: 1 !important;
                    }

                    #comments ytd-comments-header-renderer #sort-menu tp-yt-paper-button,
                    #comments ytd-comments-header-renderer yt-sort-filter-sub-menu-renderer tp-yt-paper-button,
                    #comments ytd-comments-header-renderer #sort-menu button {
                        min-height: 28px !important;
                        padding: 0 11px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.04) !important;
                        color: rgba(255, 255, 255, 0.76) !important;
                        font-size: 10.5px !important;
                        font-weight: 700 !important;
                        text-transform: none !important;
                    }

                    #comments ytd-comment-thread-renderer {
                        margin: 0 0 8px !important;
                        padding: 0 !important;
                        border: none !important;
                        background: transparent !important;
                    }

                    #comments ytd-comment-view-model,
                    #comments ytd-comment-renderer {
                        margin: 0 !important;
                        padding: 6px 6px 6px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.05) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.005)),
                            rgba(9, 13, 19, 0.62) !important;
                        box-shadow: none !important;
                        transition: border-color 180ms ease, background 180ms ease !important;
                    }

                    #comments ytd-comment-view-model:hover,
                    #comments ytd-comment-renderer:hover {
                        border-color: rgba(var(--ytkit-accent-rgb), 0.12) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.007)),
                            rgba(10, 13, 20, 0.68) !important;
                    }

                    #comments ytd-comment-view-model #pinned-comment-badge,
                    #comments ytd-comment-renderer #pinned-comment-badge,
                    #comments ytd-comment-view-model #linked-comment-badge,
                    #comments ytd-comment-renderer #linked-comment-badge,
                    #comments ytd-comment-view-model #creator-heart-button,
                    #comments ytd-comment-renderer #creator-heart-button,
                    #comments ytd-comment-view-model #action-menu,
                    #comments ytd-comment-renderer #action-menu,
                    #comments ytd-comment-view-model #inline-action-menu,
                    #comments ytd-comment-renderer #inline-action-menu,
                    #comments ytd-comment-engagement-bar #dislike-button {
                        display: inline-flex !important;
                    }
                `;
    }

    function buildPremiumInteractionCss(options = {}) {
        const n = Number(options && options.tooltipZ);
        const tooltipZ = Number.isFinite(n) ? n : 70002;
        return `
                    #comments ytd-comment-view-model > #body,
                    #comments ytd-comment-renderer > #body {
                        gap: 6px !important;
                        align-items: flex-start !important;
                    }

                    #comments ytd-comment-view-model,
                    #comments ytd-comment-renderer {
                        --ytd-comment-thumb-dimension: 24px !important;
                    }

                    #comments ytd-comment-view-model #author-thumbnail,
                    #comments ytd-comment-renderer #author-thumbnail,
                    #comments ytd-comment-view-model #author-thumbnail img,
                    #comments ytd-comment-renderer #author-thumbnail img,
                    #comments ytd-comment-view-model #author-thumbnail yt-img-shadow,
                    #comments ytd-comment-renderer #author-thumbnail yt-img-shadow {
                        width: 24px !important;
                        height: 24px !important;
                        border-radius: 50% !important;
                    }

                    #comments ytd-comment-view-model #author-thumbnail,
                    #comments ytd-comment-renderer #author-thumbnail {
                        margin-right: 0 !important;
                        flex: 0 0 24px !important;
                    }

                    #comments ytd-comment-view-model > #body > #main,
                    #comments ytd-comment-renderer > #body > #main {
                        min-width: 0 !important;
                        flex: 1 1 0 !important;
                        padding-right: 6px !important;
                    }

                    #comments ytd-comment-view-model #header-author,
                    #comments ytd-comment-renderer #header-author {
                        align-items: center !important;
                        gap: 6px !important;
                    }

                    #comments ytd-comment-view-model #author-text,
                    #comments ytd-comment-renderer #author-text {
                        color: rgba(255, 255, 255, 0.95) !important;
                        font-size: 12.5px !important;
                        font-weight: 750 !important;
                        letter-spacing: 0 !important;
                    }

                    #comments ytd-comment-view-model #author-text:hover,
                    #comments ytd-comment-renderer #author-text:hover {
                        color: rgba(var(--ytkit-accent-rgb), 0.95) !important;
                    }

                    #comments ytd-comment-view-model #published-time-text,
                    #comments ytd-comment-renderer #published-time-text,
                    #comments ytd-comment-view-model .published-time-text,
                    #comments ytd-comment-renderer .published-time-text {
                        color: rgba(255, 255, 255, 0.48) !important;
                    }

                    #comments ytd-comment-view-model #content-text,
                    #comments ytd-comment-renderer #content-text {
                        color: rgba(255, 255, 255, 0.88) !important;
                        font-size: 13.5px !important;
                        line-height: 1.62 !important;
                        display: block !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                    }

                    #comments ytd-comment-view-model #content-text a,
                    #comments ytd-comment-renderer #content-text a {
                        color: rgba(var(--ytkit-accent-rgb), 0.88) !important;
                    }

                    #comments ytd-comment-view-model > #body > #main,
                    #comments ytd-comment-renderer > #body > #main,
                    #comments ytd-comment-view-model #header,
                    #comments ytd-comment-renderer #header,
                    #comments ytd-comment-view-model #header-author,
                    #comments ytd-comment-renderer #header-author,
                    #comments ytd-comment-view-model ytd-expander,
                    #comments ytd-comment-renderer ytd-expander,
                    #comments ytd-comment-view-model #content,
                    #comments ytd-comment-renderer #content {
                        display: block !important;
                        position: relative !important;
                        z-index: 1 !important;
                        pointer-events: auto !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                    }

                    #comments ytd-comment-view-model #author-text,
                    #comments ytd-comment-renderer #author-text,
                    #comments ytd-comment-view-model #author-text a,
                    #comments ytd-comment-renderer #author-text a,
                    #comments ytd-comment-view-model #published-time-text,
                    #comments ytd-comment-renderer #published-time-text,
                    #comments ytd-comment-view-model #published-time-text a,
                    #comments ytd-comment-renderer #published-time-text a {
                        position: relative !important;
                        z-index: 2 !important;
                        pointer-events: auto !important;
                    }

                    #comments ytd-comment-thread-renderer .thread-hitbox,
                    #comments ytd-comment-thread-renderer .thread-hitbox.style-scope.ytd-comment-thread-renderer {
                        display: none !important;
                        pointer-events: none !important;
                    }

                    #comments ytd-comment-view-model #content-text,
                    #comments ytd-comment-renderer #content-text,
                    #comments ytd-comment-view-model yt-attributed-string,
                    #comments ytd-comment-renderer yt-attributed-string,
                    #comments ytd-comment-view-model .ytAttributedStringHost,
                    #comments ytd-comment-renderer .ytAttributedStringHost,
                    #comments ytd-comment-view-model yt-core-attributed-string,
                    #comments ytd-comment-renderer yt-core-attributed-string {
                        display: block !important;
                        pointer-events: auto !important;
                        -webkit-user-select: text !important;
                        user-select: text !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-width: 0 !important;
                    }

                    #comments ytd-comment-view-model #content-text *,
                    #comments ytd-comment-renderer #content-text * {
                        pointer-events: auto !important;
                        -webkit-user-select: text !important;
                        user-select: text !important;
                    }

                    #comments ytd-comment-view-model #content-text,
                    #comments ytd-comment-renderer #content-text,
                    #comments ytd-comment-view-model yt-attributed-string,
                    #comments ytd-comment-renderer yt-attributed-string,
                    #comments ytd-comment-view-model .ytAttributedStringHost,
                    #comments ytd-comment-renderer .ytAttributedStringHost,
                    #comments ytd-comment-view-model yt-core-attributed-string,
                    #comments ytd-comment-renderer yt-core-attributed-string {
                        cursor: text !important;
                    }

                    #comments .ytkit-vote-badge {
                        display: none !important;
                    }

                    #comments ytd-comment-view-model #action-menu,
                    #comments ytd-comment-renderer #action-menu,
                    #comments ytd-comment-view-model #inline-action-menu,
                    #comments ytd-comment-renderer #inline-action-menu {
                        position: absolute !important;
                        top: 10px !important;
                        right: 6px !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        opacity: 0 !important;
                        pointer-events: none !important;
                        transform: translateY(-2px) !important;
                        transition: opacity 160ms ease, transform 160ms ease !important;
                        z-index: 3 !important;
                    }

                    #comments ytd-comment-view-model:hover #action-menu,
                    #comments ytd-comment-renderer:hover #action-menu,
                    #comments ytd-comment-view-model:hover #inline-action-menu,
                    #comments ytd-comment-renderer:hover #inline-action-menu,
                    #comments ytd-comment-view-model:focus-within #action-menu,
                    #comments ytd-comment-renderer:focus-within #action-menu,
                    #comments ytd-comment-view-model:focus-within #inline-action-menu,
                    #comments ytd-comment-renderer:focus-within #inline-action-menu {
                        opacity: 1 !important;
                        pointer-events: auto !important;
                        transform: translateY(0) !important;
                    }

                    #comments ytd-comment-view-model #action-menu button,
                    #comments ytd-comment-renderer #action-menu button,
                    #comments ytd-comment-view-model #inline-action-menu button,
                    #comments ytd-comment-renderer #inline-action-menu button,
                    #comments ytd-comment-view-model #action-menu tp-yt-paper-icon-button,
                    #comments ytd-comment-renderer #action-menu tp-yt-paper-icon-button,
                    #comments ytd-comment-view-model #inline-action-menu tp-yt-paper-icon-button,
                    #comments ytd-comment-renderer #inline-action-menu tp-yt-paper-icon-button {
                        width: 28px !important;
                        height: 28px !important;
                        min-width: 28px !important;
                        min-height: 28px !important;
                        padding: 0 !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.04) !important;
                        color: rgba(255, 255, 255, 0.66) !important;
                        box-shadow: none !important;
                    }

                    #comments ytd-comment-view-model #action-menu button:hover,
                    #comments ytd-comment-renderer #action-menu button:hover,
                    #comments ytd-comment-view-model #inline-action-menu button:hover,
                    #comments ytd-comment-renderer #inline-action-menu button:hover,
                    #comments ytd-comment-view-model #action-menu tp-yt-paper-icon-button:hover,
                    #comments ytd-comment-renderer #action-menu tp-yt-paper-icon-button:hover,
                    #comments ytd-comment-view-model #inline-action-menu tp-yt-paper-icon-button:hover,
                    #comments ytd-comment-renderer #inline-action-menu tp-yt-paper-icon-button:hover {
                        background: rgba(255, 255, 255, 0.08) !important;
                        color: rgba(255, 255, 255, 0.92) !important;
                        border-color: rgba(var(--ytkit-accent-rgb), 0.22) !important;
                    }

                    #comments ytd-comment-view-model #action-menu yt-icon,
                    #comments ytd-comment-renderer #action-menu yt-icon,
                    #comments ytd-comment-view-model #inline-action-menu yt-icon,
                    #comments ytd-comment-renderer #inline-action-menu yt-icon,
                    #comments ytd-comment-view-model #action-menu svg,
                    #comments ytd-comment-renderer #action-menu svg,
                    #comments ytd-comment-view-model #inline-action-menu svg,
                    #comments ytd-comment-renderer #inline-action-menu svg {
                        width: 16px !important;
                        height: 16px !important;
                        color: inherit !important;
                        fill: currentColor !important;
                    }

                    #comments ytd-comment-view-model:not([has-author-badge]) ytd-author-comment-badge-renderer,
                    #comments ytd-comment-renderer:not([has-author-badge]) ytd-author-comment-badge-renderer {
                        display: none !important;
                    }

                    #comments ytd-comment-engagement-bar,
                    #comments .ytkit-replying ytd-comment-engagement-bar {
                        position: relative !important;
                        top: auto !important;
                        right: auto !important;
                        width: auto !important;
                        margin: 8px 0 0 0 !important;
                        padding: 0 !important;
                        pointer-events: auto !important;
                        display: block !important;
                    }

                    #comments ytd-comment-engagement-bar #toolbar {
                        display: flex !important;
                        align-items: center !important;
                        gap: 4px !important;
                        flex-wrap: nowrap !important;
                        margin: 0 !important;
                        row-gap: 0 !important;
                        width: max-content !important;
                        max-width: 100% !important;
                        white-space: nowrap !important;
                    }

                    #comments ytd-comment-engagement-bar #toolbar > * {
                        flex: 0 0 auto !important;
                        min-width: 0 !important;
                    }

                    #comments ytd-comment-engagement-bar #reply-button-end,
                    #comments ytd-comment-engagement-bar #reply-button-end yt-button-shape,
                    #comments ytd-comment-engagement-bar #reply-button-end .yt-spec-button-shape-next,
                    #comments ytd-comment-engagement-bar #creator-heart,
                    #comments ytd-comment-engagement-bar ytd-creator-heart-renderer {
                        display: inline-flex !important;
                        align-items: center !important;
                        flex: 0 0 auto !important;
                    }

                    #comments ytd-comment-engagement-bar #dislike-button {
                        display: none !important;
                    }

                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox tp-yt-paper-input-container,
                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox #input-container,
                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox #creation-box {
                        border: none !important;
                        border-bottom: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                    }

                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox .underline,
                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox .unfocused-line,
                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox .focused-line,
                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox .add-on-content,
                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox tp-yt-paper-input-container[use-v2-underline]::before,
                    #comments ytd-comment-engagement-bar #reply-dialog ytd-commentbox tp-yt-paper-input-container[use-v2-underline]::after {
                        content: none !important;
                        display: none !important;
                        opacity: 0 !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        border: none !important;
                        border-bottom: none !important;
                        box-shadow: none !important;
                        overflow: hidden !important;
                    }

                    #comments ytd-comment-engagement-bar #like-button,
                    #comments ytd-comment-engagement-bar #dislike-button,
                    #comments ytd-comment-engagement-bar #vote-count-middle,
                    #comments ytd-comment-engagement-bar #vote-count-left,
                    #comments ytd-comment-engagement-bar #vote-count-right,
                    #comments ytd-comment-engagement-bar #creator-heart-button {
                        display: inline-flex !important;
                    }

                    #comments ytd-comment-engagement-bar #toolbar button,
                    #comments ytd-comment-engagement-bar #toolbar .yt-spec-button-shape-next {
                        min-height: 28px !important;
                        height: 28px !important;
                        padding: 0 10px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.04) !important;
                        color: rgba(255, 255, 255, 0.72) !important;
                        box-shadow: none !important;
                        font-size: 10.5px !important;
                    }

                    #comments ytd-comment-view-model[data-ytkitPinned="1"],
                    #comments ytd-comment-renderer[data-ytkitPinned="1"] {
                        border-color: rgba(var(--ytkit-accent-rgb), 0.26) !important;
                        background:
                            radial-gradient(circle at top right, rgba(var(--ytkit-accent-rgb), 0.16), transparent 42%),
                            linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.018)),
                            rgba(11, 15, 23, 0.92) !important;
                    }

                    #comments ytd-comment-view-model[data-ytkitHeart="1"],
                    #comments ytd-comment-renderer[data-ytkitHeart="1"] {
                        box-shadow: 0 0 0 1px rgba(255, 112, 122, 0.16) !important;
                    }

                    #comments ytd-comment-view-model[data-ytkitLinked="1"],
                    #comments ytd-comment-renderer[data-ytkitLinked="1"] {
                        border-color: rgba(125, 211, 252, 0.24) !important;
                    }

                    #comments ytd-comment-view-model[data-ytkitPinned="1"] #pinned-comment-badge,
                    #comments ytd-comment-renderer[data-ytkitPinned="1"] #pinned-comment-badge,
                    #comments ytd-comment-view-model[data-ytkitLinked="1"] #linked-comment-badge,
                    #comments ytd-comment-renderer[data-ytkitLinked="1"] #linked-comment-badge {
                        display: inline-flex !important;
                        align-items: center !important;
                        align-self: flex-start !important;
                        gap: 6px !important;
                        max-width: fit-content !important;
                        margin: 0 0 10px !important;
                        padding: 5px 10px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.05) !important;
                        color: rgba(255, 255, 255, 0.76) !important;
                        font-size: 10px !important;
                        font-weight: 800 !important;
                        letter-spacing: 0.08em !important;
                        text-transform: uppercase !important;
                    }

                    #comments ytd-comment-view-model:not([data-ytkitPinned="1"]) #pinned-comment-badge,
                    #comments ytd-comment-renderer:not([data-ytkitPinned="1"]) #pinned-comment-badge,
                    #comments ytd-comment-view-model:not([data-ytkitLinked="1"]) #linked-comment-badge,
                    #comments ytd-comment-renderer:not([data-ytkitLinked="1"]) #linked-comment-badge {
                        display: none !important;
                    }

                    #comments ytd-comment-view-model[data-ytkitPinned="1"] #pinned-comment-badge,
                    #comments ytd-comment-renderer[data-ytkitPinned="1"] #pinned-comment-badge {
                        border-color: rgba(var(--ytkit-accent-rgb), 0.2) !important;
                        background: rgba(var(--ytkit-accent-rgb), 0.12) !important;
                        color: rgba(255, 189, 170, 0.96) !important;
                    }

                    #comments ytd-comment-view-model[data-ytkitLinked="1"] #linked-comment-badge,
                    #comments ytd-comment-renderer[data-ytkitLinked="1"] #linked-comment-badge {
                        border-color: rgba(125, 211, 252, 0.22) !important;
                        background: rgba(125, 211, 252, 0.12) !important;
                        color: rgba(194, 236, 255, 0.96) !important;
                    }

                    #comments ytd-comment-view-model #pinned-comment-badge yt-icon,
                    #comments ytd-comment-renderer #pinned-comment-badge yt-icon,
                    #comments ytd-comment-view-model #linked-comment-badge yt-icon,
                    #comments ytd-comment-renderer #linked-comment-badge yt-icon,
                    #comments ytd-comment-view-model #pinned-comment-badge svg,
                    #comments ytd-comment-renderer #pinned-comment-badge svg,
                    #comments ytd-comment-view-model #linked-comment-badge svg,
                    #comments ytd-comment-renderer #linked-comment-badge svg {
                        width: 12px !important;
                        height: 12px !important;
                        color: inherit !important;
                        fill: currentColor !important;
                    }

                    #comments ytd-comment-view-model #pinned-comment-badge #label,
                    #comments ytd-comment-renderer #pinned-comment-badge #label,
                    #comments ytd-comment-view-model #linked-comment-badge #label,
                    #comments ytd-comment-renderer #linked-comment-badge #label {
                        color: inherit !important;
                        font-size: 10px !important;
                        line-height: 1 !important;
                    }

                    #comments ytd-comment-view-model #creator-heart-button,
                    #comments ytd-comment-renderer #creator-heart-button {
                        color: rgba(255, 112, 122, 0.95) !important;
                    }

                    #comments ytd-comment-engagement-bar #creator-heart,
                    #comments ytd-comment-engagement-bar ytd-creator-heart-renderer,
                    #comments ytd-comment-engagement-bar #creator-heart-button {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        flex: 0 0 auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        min-width: 0 !important;
                    }

                    #comments ytd-comment-engagement-bar #creator-heart-button,
                    #comments ytd-comment-engagement-bar #creator-heart-button button {
                        width: 28px !important;
                        min-width: 28px !important;
                        height: 28px !important;
                        min-height: 28px !important;
                        padding: 0 !important;
                        border-radius: 10px !important;
                    }

                    #comments ytd-comment-engagement-bar #creator-heart-button button {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        border: 1px solid rgba(255, 112, 122, 0.22) !important;
                        background: radial-gradient(circle at 30% 30%, rgba(255, 132, 144, 0.2), rgba(255, 112, 122, 0.08)) !important;
                        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
                        overflow: hidden !important;
                    }

                    #comments ytd-comment-engagement-bar #creator-heart-button yt-interaction,
                    #comments ytd-comment-engagement-bar #creator-heart-button #hearted-thumbnail,
                    #comments ytd-comment-engagement-bar #creator-heart-button #hearted-border {
                        display: none !important;
                    }

                    #comments ytd-comment-engagement-bar #creator-heart-button #hearted,
                    #comments ytd-comment-engagement-bar #creator-heart-button #hearted svg,
                    #comments ytd-comment-engagement-bar #creator-heart-button #hearted .yt-icon-shape {
                        display: block !important;
                        width: 14px !important;
                        height: 14px !important;
                        color: rgba(255, 112, 122, 0.98) !important;
                        fill: currentColor !important;
                    }

                    #comments ytd-comment-engagement-bar #creator-heart-button #hearted {
                        margin: 0 !important;
                    }

                    tp-yt-paper-tooltip.ytd-creator-heart-renderer,
                    tp-yt-paper-tooltip.ytd-creator-heart-renderer #tooltip,
                    #comments ytd-comment-engagement-bar ytd-creator-heart-renderer tp-yt-paper-tooltip,
                    #comments ytd-comment-engagement-bar ytd-creator-heart-renderer tp-yt-paper-tooltip #tooltip {
                        border-radius: 10px !important;
                    }

                    tp-yt-paper-tooltip.ytd-creator-heart-renderer,
                    #comments ytd-comment-engagement-bar ytd-creator-heart-renderer tp-yt-paper-tooltip {
                        z-index: ${tooltipZ} !important;
                        pointer-events: none !important;
                    }

                    tp-yt-paper-tooltip.ytd-creator-heart-renderer #tooltip,
                    #comments ytd-comment-engagement-bar ytd-creator-heart-renderer tp-yt-paper-tooltip #tooltip {
                        min-height: 24px !important;
                        padding: 0 10px !important;
                        border: 1px solid rgba(255, 112, 122, 0.22) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015)),
                            rgba(11, 15, 21, 0.96) !important;
                        color: rgba(255, 228, 232, 0.96) !important;
                        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.34) !important;
                        backdrop-filter: none;
                        font-size: 10.5px !important;
                        font-weight: 700 !important;
                        letter-spacing: 0.01em !important;
                        line-height: 24px !important;
                        white-space: nowrap !important;
                    }

                    #comments ytd-comment-view-model ytd-author-comment-badge-renderer[creator],
                    #comments ytd-comment-renderer ytd-author-comment-badge-renderer[creator] {
                        padding: 2px 8px !important;
                        border-radius: 10px !important;
                        background: rgba(var(--ytkit-accent-rgb), 0.14) !important;
                        border: 1px solid rgba(var(--ytkit-accent-rgb), 0.2) !important;
                    }

                    #comments ytd-comment-replies-renderer {
                        position: relative !important;
                        margin: 8px 0 0 14px !important;
                        padding: 8px 0 0 8px !important;
                        border-left: none !important;
                    }

                    #comments ytd-comment-replies-renderer::before {
                        content: '' !important;
                        position: absolute !important;
                        top: 2px !important;
                        bottom: 8px !important;
                        left: 0 !important;
                        width: 1px !important;
                        background: linear-gradient(180deg, rgba(125, 211, 252, 0.16), rgba(255, 255, 255, 0.04)) !important;
                    }

                    #comments ytd-comment-replies-renderer::after {
                        content: '' !important;
                        position: absolute !important;
                        top: -1px !important;
                        left: -3px !important;
                        width: 7px !important;
                        height: 7px !important;
                        border-radius: 50% !important;
                        background: rgba(125, 211, 252, 0.16) !important;
                        box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.03) !important;
                    }

                    #comments ytd-comment-replies-renderer ytd-comment-view-model,
                    #comments ytd-comment-replies-renderer ytd-comment-renderer {
                        padding: 9px 11px 8px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.055) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.014), rgba(255, 255, 255, 0.005)),
                            rgba(8, 11, 17, 0.6) !important;
                        box-shadow: none !important;
                    }

                    #comments ytd-comment-replies-renderer ytd-comment-view-model:hover,
                    #comments ytd-comment-replies-renderer ytd-comment-renderer:hover {
                        border-color: rgba(125, 211, 252, 0.18) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.014)),
                            rgba(10, 13, 20, 0.88) !important;
                    }

                    #comments ytd-comment-view-model #more,
                    #comments ytd-comment-view-model [slot="more"],
                    #comments ytd-comment-view-model #less,
                    #comments ytd-comment-view-model [slot="less"],
                    #comments ytd-comment-renderer #more,
                    #comments ytd-comment-renderer [slot="more"],
                    #comments ytd-comment-renderer #less,
                    #comments ytd-comment-renderer [slot="less"],
                    #comments ytd-comment-renderer tp-yt-paper-button.ytd-expander,
                    #comments .more-button.ytd-comment-view-model.style-scope,
                    #comments .less-button.ytd-comment-view-model.style-scope {
                        align-items: center !important;
                        justify-content: flex-start !important;
                        gap: 6px !important;
                        width: auto !important;
                        min-height: 0 !important;
                        margin: 10px 0 0 !important;
                        padding: 0 !important;
                        border: none !important;
                        background: transparent !important;
                        box-shadow: none !important;
                        color: rgba(var(--ytkit-accent-rgb), 0.82) !important;
                        font-size: 11px !important;
                        font-weight: 700 !important;
                        letter-spacing: 0.08em !important;
                        line-height: 1.2 !important;
                        text-transform: uppercase !important;
                    }

                    #comments ytd-comment-view-model #more:hover,
                    #comments ytd-comment-view-model [slot="more"]:hover,
                    #comments ytd-comment-view-model #less:hover,
                    #comments ytd-comment-view-model [slot="less"]:hover,
                    #comments ytd-comment-renderer #more:hover,
                    #comments ytd-comment-renderer [slot="more"]:hover,
                    #comments ytd-comment-renderer #less:hover,
                    #comments ytd-comment-renderer [slot="less"]:hover,
                    #comments ytd-comment-renderer tp-yt-paper-button.ytd-expander:hover,
                    #comments .more-button.ytd-comment-view-model.style-scope:hover,
                    #comments .less-button.ytd-comment-view-model.style-scope:hover {
                        color: rgba(255, 255, 255, 0.96) !important;
                    }

                    #comments ytd-comment-view-model #more yt-formatted-string,
                    #comments ytd-comment-view-model [slot="more"] yt-formatted-string,
                    #comments ytd-comment-view-model #less yt-formatted-string,
                    #comments ytd-comment-view-model [slot="less"] yt-formatted-string,
                    #comments ytd-comment-renderer #more yt-formatted-string,
                    #comments ytd-comment-renderer [slot="more"] yt-formatted-string,
                    #comments ytd-comment-renderer #less yt-formatted-string,
                    #comments ytd-comment-renderer [slot="less"] yt-formatted-string,
                    #comments ytd-comment-renderer tp-yt-paper-button.ytd-expander yt-formatted-string {
                        color: inherit !important;
                        font-size: inherit !important;
                        font-weight: inherit !important;
                        letter-spacing: inherit !important;
                    }

                    #comments .ytkit-comment-search {
                        display: grid !important;
                        gap: 12px !important;
                        margin: 12px 0 16px !important;
                        padding: 14px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background:
                            radial-gradient(circle at top right, rgba(var(--ytkit-accent-rgb), 0.12), transparent 42%),
                            linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.012)),
                            rgba(8, 11, 18, 0.92) !important;
                        box-shadow: 0 20px 44px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
                    }

                    #comments .ytkit-comment-search[data-search-empty="1"] {
                        border-color: rgba(245, 158, 11, 0.24) !important;
                        box-shadow: 0 22px 48px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(245, 158, 11, 0.08) !important;
                    }

                    #comments .ytkit-comment-search-head {
                        display: flex !important;
                        align-items: flex-start !important;
                        justify-content: space-between !important;
                        gap: 12px !important;
                    }

                    #comments .ytkit-comment-search-copy {
                        display: grid !important;
                        gap: 4px !important;
                        min-width: 0 !important;
                    }

                    #comments .ytkit-comment-search-eyebrow {
                        color: rgba(255, 255, 255, 0.48) !important;
                        font-size: 10px !important;
                        font-weight: 800 !important;
                        letter-spacing: 0.12em !important;
                        text-transform: uppercase !important;
                    }

                    #comments .ytkit-comment-search-summary {
                        margin: 0 !important;
                        color: rgba(255, 255, 255, 0.92) !important;
                        font-size: 12.5px !important;
                        line-height: 1.45 !important;
                        font-weight: 600 !important;
                        text-wrap: pretty !important;
                    }

                    #comments .ytkit-comment-search-field {
                        display: grid !important;
                        grid-template-columns: auto minmax(0, 1fr) auto !important;
                        align-items: center !important;
                        gap: 10px !important;
                        min-height: 48px !important;
                        padding: 0 14px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background: rgba(255, 255, 255, 0.035) !important;
                        transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease !important;
                    }

                    #comments .ytkit-comment-search-field:focus-within {
                        border-color: rgba(var(--ytkit-accent-rgb), 0.3) !important;
                        background: rgba(255, 255, 255, 0.055) !important;
                        box-shadow: 0 0 0 4px rgba(var(--ytkit-accent-rgb), 0.08) !important;
                    }

                    #comments .ytkit-comment-search-input {
                        width: 100% !important;
                        min-width: 0 !important;
                        border: none !important;
                        background: transparent !important;
                        color: rgba(255, 255, 255, 0.94) !important;
                        font-size: 13px !important;
                        font-weight: 600 !important;
                        outline: none !important;
                    }

                    #comments .ytkit-comment-search-input:focus-visible,
                    #comments .ytkit-comment-search-clear:focus-visible,
                    #comments .ytkit-comment-search-empty-btn:focus-visible,
                    #comments ytd-comment-engagement-bar #toolbar button:focus-visible,
                    #comments ytd-comment-engagement-bar #toolbar .yt-spec-button-shape-next:focus-visible {
                        outline: 2px solid rgba(var(--ytkit-accent-rgb), 0.44) !important;
                        outline-offset: 2px !important;
                    }

                    #comments .ytkit-comment-search-input::placeholder {
                        color: rgba(255, 255, 255, 0.42) !important;
                    }

                    #comments .ytkit-comment-search-icon {
                        width: 16px !important;
                        height: 16px !important;
                        color: rgba(255, 255, 255, 0.52) !important;
                    }

                    #comments .ytkit-comment-search-clear {
                        width: 34px !important;
                        height: 34px !important;
                        padding: 0 !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        border-radius: 12px !important;
                        background: rgba(255, 255, 255, 0.04) !important;
                        color: rgba(255, 255, 255, 0.72) !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        cursor: pointer !important;
                        touch-action: manipulation !important;
                        transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease !important;
                    }

                    #comments .ytkit-comment-search-clear:hover:not(:disabled) {
                        border-color: rgba(var(--ytkit-accent-rgb), 0.2) !important;
                        background: rgba(var(--ytkit-accent-rgb), 0.12) !important;
                        color: rgba(255, 255, 255, 0.96) !important;
                        transform: translateY(-1px) !important;
                    }

                    #comments .ytkit-comment-search-clear:disabled {
                        opacity: 0.5 !important;
                        cursor: default !important;
                    }

                    #comments .ytkit-comment-search-clear svg {
                        width: 14px !important;
                        height: 14px !important;
                    }

                    #comments .ytkit-search-count {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        min-height: 34px !important;
                        min-width: 96px !important;
                        padding: 0 12px !important;
                        border-radius: 10px !important;
                        background: rgba(255, 255, 255, 0.05) !important;
                        border: 1px solid rgba(255, 255, 255, 0.06) !important;
                        color: rgba(255, 255, 255, 0.76) !important;
                        font-size: 10px !important;
                        font-weight: 800 !important;
                        letter-spacing: 0.08em !important;
                        text-transform: uppercase !important;
                        white-space: nowrap !important;
                        font-variant-numeric: tabular-nums !important;
                    }

                    #comments .ytkit-comment-search-hint {
                        color: rgba(255, 255, 255, 0.56) !important;
                        font-size: 11px !important;
                        font-weight: 600 !important;
                        line-height: 1.45 !important;
                        text-wrap: pretty !important;
                    }

                    #comments .ytkit-comment-search-empty {
                        display: grid !important;
                        gap: 10px !important;
                        padding: 14px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(245, 158, 11, 0.16) !important;
                        background: linear-gradient(180deg, rgba(245, 158, 11, 0.08), rgba(255, 255, 255, 0.015)) !important;
                    }

                    #comments .ytkit-comment-search-empty[hidden] {
                        display: none !important;
                    }

                    #comments .ytkit-comment-search-empty-title {
                        color: rgba(255, 255, 255, 0.96) !important;
                        font-size: 13px !important;
                        font-weight: 700 !important;
                    }

                    #comments .ytkit-comment-search-empty-copy {
                        color: rgba(255, 255, 255, 0.68) !important;
                        font-size: 11.5px !important;
                        line-height: 1.5 !important;
                        text-wrap: pretty !important;
                    }

                    #comments .ytkit-comment-search-empty-btn {
                        justify-self: start !important;
                        min-height: 34px !important;
                        padding: 0 14px !important;
                        border-radius: 10px !important;
                        border: 1px solid rgba(var(--ytkit-accent-rgb), 0.22) !important;
                        background: rgba(var(--ytkit-accent-rgb), 0.12) !important;
                        color: rgba(255, 255, 255, 0.96) !important;
                        font-size: 11px !important;
                        font-weight: 700 !important;
                        cursor: pointer !important;
                        touch-action: manipulation !important;
                        transition: border-color 160ms ease, background 160ms ease, transform 160ms ease !important;
                    }

                    #comments .ytkit-comment-search-empty-btn:hover {
                        border-color: rgba(var(--ytkit-accent-rgb), 0.34) !important;
                        background: rgba(var(--ytkit-accent-rgb), 0.18) !important;
                        transform: translateY(-1px) !important;
                    }

                    #comments ytd-comment-simplebox-renderer {
                        margin: 0 0 14px !important;
                        padding: 0 !important;
                    }

                    #comments ytd-comment-simplebox-renderer #thumbnail-input-row {
                        gap: 8px !important;
                    }

                    #comments ytd-comment-simplebox-renderer #placeholder-area {
                        display: flex !important;
                        align-items: center !important;
                        width: 100% !important;
                        min-height: 40px !important;
                        padding: 0 12px !important;
                        border-radius: 12px !important;
                        border: 1px solid rgba(255, 255, 255, 0.08) !important;
                        background:
                            linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.008)),
                            rgba(9, 13, 19, 0.56) !important;
                        color: rgba(255, 255, 255, 0.58) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments#comments,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below ytd-comments#comments {
                        margin-top: 10px !important;
                        padding: 12px 12px 76px !important;
                        border-radius: 12px !important;
                        box-shadow: none !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer {
                        grid-template-columns: minmax(0, 1fr) !important;
                        margin-bottom: 12px !important;
                        padding: 0 0 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comments-header-renderer #simple-box {
                        justify-self: stretch !important;
                        width: 100% !important;
                        min-width: 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-view-model,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-renderer {
                        padding: 12px 14px 10px !important;
                        border-radius: 12px !important;
                        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18) !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-view-model > #body,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-renderer > #body {
                        gap: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-view-model #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-renderer #author-thumbnail,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-view-model #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-renderer #author-thumbnail img,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-view-model #author-thumbnail yt-img-shadow,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-renderer #author-thumbnail yt-img-shadow {
                        width: 30px !important;
                        height: 30px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-engagement-bar,
                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments .ytkit-replying ytd-comment-engagement-bar {
                        margin: 8px 0 0 0 !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-replies-renderer {
                        margin: 8px 0 0 10px !important;
                        padding: 8px 0 0 6px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments .ytkit-comment-search {
                        margin: 10px 0 14px !important;
                        padding: 12px !important;
                        gap: 10px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments .ytkit-comment-search-head {
                        flex-direction: column !important;
                        align-items: stretch !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments .ytkit-search-count {
                        align-self: flex-start !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments .ytkit-comment-search-field {
                        min-height: 46px !important;
                        gap: 8px !important;
                        padding: 0 12px !important;
                        border-radius: 12px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer {
                        margin-bottom: 14px !important;
                    }

                    html:is(.ytkit-split-active, .ytkit-split-open) #below #comments ytd-comment-simplebox-renderer #placeholder-area {
                        min-height: 46px !important;
                        border-radius: 12px !important;
                    }
                `;
    }

    function buildSelectorSupportFallbackCss() {
        return `
                    @supports selector(:has(*)) {
                        #comments ytd-comment-engagement-bar #reply-dialog:not(:has(ytd-commentbox:not([hidden]))) {
                            display: none !important;
                            padding: 0 !important;
                        }
                    }

                    @supports not selector(:has(*)) {
                        #comments ytd-comment-engagement-bar #reply-dialog {
                            display: none !important;
                            padding: 0 !important;
                        }

                        #comments .ytkit-replying ytd-comment-engagement-bar #reply-dialog {
                            display: block !important;
                            padding: 10px 0 4px !important;
                        }
                    }
                `;
    }

    function isCommentTextSelectionTarget(target) {
        const node = target instanceof Element ? target : target?.parentElement;
        if (!node) return false;

        const comment = node.closest('#comments ytd-comment-view-model, #comments ytd-comment-renderer');
        if (!comment) return false;

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
    }

    function setDataFlag(comment, flagName, enabled) {
        if (enabled) comment.dataset[flagName] = '1';
        else delete comment.dataset[flagName];
    }

    function applyLayoutStyles(nodes, styles) {
        nodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            Object.entries(styles).forEach(([key, value]) => node.style.setProperty(key, value, 'important'));
        });
    }

    function normalizeCommentLayoutSurface(comment) {
        if (!(comment instanceof Element)) return;
        comment.removeAttribute('optimal-reading-width-comments');
        comment.style.setProperty('--ytd-comment-thumb-dimension', '24px', 'important');
        comment.style.setProperty('padding', '6px 6px 6px', 'important');
        comment.style.setProperty('width', '100%', 'important');
        comment.style.setProperty('max-width', 'none', 'important');
        comment.style.setProperty('box-sizing', 'border-box', 'important');

        const body = comment.querySelector(':scope > #body');
        applyLayoutStyles([body], {
            display: 'flex',
            'align-items': 'flex-start',
            gap: '6px',
            width: '100%',
            'max-width': 'none',
            'box-sizing': 'border-box'
        });

        const authorThumbnail = comment.querySelector('#author-thumbnail');
        applyLayoutStyles([authorThumbnail], {
            'margin-right': '0',
            flex: '0 0 24px',
            width: '24px',
            'min-width': '24px'
        });
        applyLayoutStyles(comment.querySelectorAll('#author-thumbnail yt-img-shadow, #author-thumbnail img, #author-thumbnail button'), {
            width: '24px',
            height: '24px'
        });

        const main = comment.querySelector(':scope > #body > #main');
        applyLayoutStyles([main], {
            display: 'block',
            flex: '1 1 0',
            width: 'auto',
            'max-width': 'none',
            'min-width': '0',
            'padding-right': '6px',
            'box-sizing': 'border-box'
        });

        applyLayoutStyles(comment.querySelectorAll('#header, #header-author, ytd-expander, #content, #content-text, yt-attributed-string, .ytAttributedStringHost, yt-core-attributed-string'), {
            width: '100%',
            'max-width': 'none',
            'min-width': '0',
            'box-sizing': 'border-box'
        });

        const actionMenu = comment.querySelector('#action-menu, #inline-action-menu');
        applyLayoutStyles([actionMenu], {
            right: '6px',
            top: '8px'
        });
    }

    function normalizeCommentInteractionSurface(comment) {
        if (!(comment instanceof Element)) return;
        const thread = comment.closest('ytd-comment-thread-renderer');
        thread?.querySelectorAll('.thread-hitbox').forEach((hitbox) => {
            hitbox.style.setProperty('display', 'none', 'important');
            hitbox.style.setProperty('pointer-events', 'none', 'important');
            hitbox.style.setProperty('visibility', 'hidden', 'important');
            hitbox.style.setProperty('opacity', '0', 'important');
            hitbox.style.setProperty('width', '0', 'important');
            hitbox.style.setProperty('height', '0', 'important');
        });

        comment.querySelectorAll('#main, #header, #header-author, ytd-expander, #content, #content-text').forEach((node) => {
            node.style.setProperty('position', 'relative', 'important');
            node.style.setProperty('z-index', '1', 'important');
            node.style.setProperty('pointer-events', 'auto', 'important');
        });

        comment.querySelectorAll('#author-text, #author-text a, #published-time-text, #published-time-text a').forEach((node) => {
            node.style.setProperty('position', 'relative', 'important');
            node.style.setProperty('z-index', '2', 'important');
            node.style.setProperty('pointer-events', 'auto', 'important');
        });

        comment.querySelectorAll('#content, #content-text, yt-attributed-string, .ytAttributedStringHost, yt-core-attributed-string').forEach((node) => {
            node.style.setProperty('pointer-events', 'auto', 'important');
            node.style.setProperty('-webkit-user-select', 'text', 'important');
            node.style.setProperty('user-select', 'text', 'important');
        });
    }

    function processComment(comment) {
        if (!(comment instanceof Element)) return;
        comment.dataset.ytkitChat = '1';
        setDataFlag(comment, 'ytkitPinned', comment.matches?.('[pinned]') || !!comment.querySelector('ytd-pinned-comment-badge-renderer:not([hidden])'));
        setDataFlag(comment, 'ytkitHeart', !!comment.querySelector('#creator-heart-button[is-hearted], #creator-heart-button:not([hidden])'));
        setDataFlag(comment, 'ytkitLinked', comment.matches?.('[linked]') || !!comment.querySelector('#linked-comment-badge:not([hidden])'));
        comment.querySelector('.ytkit-vote-badge')?.remove();
        normalizeCommentLayoutSurface(comment);
        normalizeCommentInteractionSurface(comment);
    }

    function styleReplyDialogs(doc) {
        doc.querySelectorAll('ytd-comment-engagement-bar #reply-dialog').forEach(dialog => {
            const cb = dialog.querySelector('ytd-commentbox:not([hidden])');
            const isOpen = cb && !cb.closest('[hidden]') && cb.offsetParent !== null;

            if (!isOpen) {
                if (dialog.dataset.ytkitStyled) {
                    delete dialog.dataset.ytkitStyled;
                    dialog.removeAttribute('style');
                    const allCb = dialog.querySelector('ytd-commentbox');
                    if (allCb) {
                        allCb.removeAttribute('style');
                        allCb.querySelectorAll('#thumbnail-input-row, #main, #divider-line, #creation-box, #input-container, tp-yt-paper-input-container, .input-wrapper, #labelAndInputContainer, .paper-input-input, ytd-emoji-input, yt-user-mention-autosuggest-input, #author-thumbnail, .underline, .unfocused-line, .focused-line, #contenteditable-textarea, #contenteditable-root, #footer, ytd-comment-reply-dialog-renderer').forEach(el => el.removeAttribute('style'));
                        allCb.querySelectorAll('#footer .yt-spec-button-shape-next').forEach(el => el.removeAttribute('style'));
                        const ta = allCb.querySelector('#contenteditable-textarea');
                        if (ta) delete ta.dataset.ytkitFocus;
                    }
                    const rr = dialog.querySelector('ytd-comment-reply-dialog-renderer');
                    if (rr) rr.removeAttribute('style');
                }
                return;
            }
            dialog.dataset.ytkitStyled = '1';

            const S = (el, props) => { if (!el) return; for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, 'important'); };
            const HIDE = { display: 'none', height: '0', border: 'none', 'border-bottom': 'none', overflow: 'hidden', opacity: '0', visibility: 'hidden', 'box-shadow': 'none' };
            const CLEAR = { display: 'block', width: '100%', border: 'none', 'border-bottom': 'none', outline: 'none', background: 'transparent', 'box-shadow': 'none', padding: '0', margin: '0', 'box-sizing': 'border-box' };

            S(dialog, { display: 'block', padding: '10px 0 4px', margin: '0', position: 'relative', width: '100%', 'box-sizing': 'border-box', overflow: 'visible', border: 'none', outline: 'none', background: 'transparent' });
            S(cb, { ...CLEAR, overflow: 'visible' });
            S(cb.querySelector('#thumbnail-input-row'), CLEAR);
            S(cb.querySelector('#main'), CLEAR);
            S(cb.querySelector('#divider-line'), HIDE);
            S(cb.querySelector('#creation-box'), CLEAR);
            const inputContainer = cb.querySelector('#input-container') || cb.querySelector('tp-yt-paper-input-container');
            S(inputContainer, { ...CLEAR, 'border-bottom': 'none', 'box-shadow': 'none' });
            S(cb.querySelector('.input-wrapper'), CLEAR);
            S(cb.querySelector('#labelAndInputContainer'), CLEAR);
            cb.querySelectorAll('.paper-input-input').forEach(el => S(el, CLEAR));
            S(cb.querySelector('ytd-emoji-input'), CLEAR);
            S(cb.querySelector('yt-user-mention-autosuggest-input'), CLEAR);
            S(cb.querySelector('#author-thumbnail'), { display: 'none' });
            const replyRenderer = dialog.querySelector('ytd-comment-reply-dialog-renderer');
            S(replyRenderer, { ...CLEAR, overflow: 'visible' });

            cb.querySelectorAll('.underline, .unfocused-line, .focused-line, .add-on-content').forEach(el => S(el, HIDE));

            const textarea = cb.querySelector('#contenteditable-textarea');
            S(textarea, { display: 'block', 'font-size': '13px', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(var(--ytkit-accent-rgb),0.2)', 'border-radius': '8px', 'min-height': '60px', height: 'auto', color: 'rgba(255,255,255,0.85)', 'line-height': '1.5', outline: 'none', width: '100%', 'box-sizing': 'border-box', transition: 'border-color 0.2s, background 0.2s' });

            const root = cb.querySelector('#contenteditable-root');
            S(root, { display: 'block', 'font-size': '13px', color: 'rgba(255,255,255,0.85)', 'line-height': '1.5', outline: 'none', border: 'none', background: 'transparent', padding: '0', 'min-height': 'unset', width: '100%' });

            if (textarea && !textarea.dataset.ytkitFocus) {
                textarea.dataset.ytkitFocus = '1';
                textarea.addEventListener('focusin', () => { textarea.style.setProperty('border-color', 'rgba(var(--ytkit-accent-rgb),0.45)', 'important'); textarea.style.setProperty('background', 'rgba(255,255,255,0.06)', 'important'); });
                textarea.addEventListener('focusout', () => { textarea.style.setProperty('border-color', 'rgba(var(--ytkit-accent-rgb),0.2)', 'important'); textarea.style.setProperty('background', 'rgba(255,255,255,0.04)', 'important'); });
            }

            const footer = cb.querySelector('#footer');
            S(footer, { 'margin-top': '8px', gap: '6px', display: 'flex', 'justify-content': 'flex-end' });
            cb.querySelectorAll('#footer .yt-spec-button-shape-next').forEach(btn => S(btn, { height: '28px', 'font-size': '11px', padding: '0 14px', 'min-height': 'unset', 'border-radius': '6px' }));
        });
    }

    function processAllComments(doc) {
        doc.querySelectorAll('ytd-comment-view-model, ytd-comment-renderer').forEach(processComment);
        doc.querySelectorAll('ytd-comment-view-model.ytkit-replying, ytd-comment-renderer.ytkit-replying').forEach(c => {
            const replyBox = c.querySelector('#reply-dialog ytd-commentbox:not([hidden])');
            const isOpen = replyBox && !replyBox.closest('[hidden]') && replyBox.offsetParent !== null;
            if (!isOpen) c.classList.remove('ytkit-replying');
        });
        doc.querySelectorAll('#reply-dialog ytd-commentbox:not([hidden])').forEach(d => {
            if (d.closest('[hidden]') || d.offsetParent === null) return;
            const comment = d.closest('ytd-comment-view-model, ytd-comment-renderer');
            if (comment) comment.classList.add('ytkit-replying');
        });
        styleReplyDialogs(doc);
    }

    function cleanupRuntimeDom(doc) {
        doc.querySelectorAll('.ytkit-vote-badge').forEach(el => el.remove());
        doc.querySelectorAll('[data-ytkit-chat]').forEach(el => {
            delete el.dataset.ytkitChat;
            delete el.dataset.ytkitPinned;
            delete el.dataset.ytkitHeart;
            delete el.dataset.ytkitLinked;
        });
        doc.querySelectorAll('.ytkit-replying').forEach(el => el.classList.remove('ytkit-replying'));
    }

    function createChatStyleCommentsRuntime(options = {}) {
        const doc = options.document || globalThis.document;
        const win = options.window || globalThis.window;
        const raf = options.requestAnimationFrame || globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 0));
        const addRule = typeof options.addMutationRule === 'function' ? options.addMutationRule : null;
        const removeRule = typeof options.removeMutationRule === 'function' ? options.removeMutationRule : null;
        const featureId = options.featureId || 'chatStyleComments';
        let processScheduled = false;
        let destroyed = false;
        const runtime = {
            _commentSelectionSelectStartHandler: null,
            _mutationHandler: null,
            init() {
                if (!doc || !win || !addRule) return;
                destroyed = false;
                this._commentSelectionSelectStartHandler = (e) => {
                    if (!isCommentTextSelectionTarget(e.target)) return;
                    e.stopPropagation();
                    e.stopImmediatePropagation?.();
                };
                win.addEventListener('selectstart', this._commentSelectionSelectStartHandler, true);
                processAllComments(doc);
                this._mutationHandler = () => {
                    if (destroyed || processScheduled) return;
                    processScheduled = true;
                    raf(() => {
                        processScheduled = false;
                        // A rAF queued just before destroy() fires after it —
                        // without this guard it would re-tag the DOM that
                        // cleanupRuntimeDom() just stripped.
                        if (destroyed) return;
                        processAllComments(doc);
                    });
                };
                addRule(featureId, this._mutationHandler);
            },
            destroy() {
                destroyed = true;
                processScheduled = false;
                if (this._commentSelectionSelectStartHandler && win) {
                    win.removeEventListener('selectstart', this._commentSelectionSelectStartHandler, true);
                    this._commentSelectionSelectStartHandler = null;
                }
                if (removeRule) removeRule(featureId);
                if (doc) cleanupRuntimeDom(doc);
                this._mutationHandler = null;
            }
        };
        return runtime;
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.chatStyleComments = Object.freeze({
        STYLE_IDS,
        buildCommentRestyleCss,
        buildPremiumCommentsCss,
        buildPremiumInteractionCss,
        buildSelectorSupportFallbackCss,
        isCommentTextSelectionTarget,
        processComment,
        processAllComments,
        createChatStyleCommentsRuntime
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            STYLE_IDS,
            buildCommentRestyleCss,
            buildPremiumCommentsCss,
            buildPremiumInteractionCss,
            buildSelectorSupportFallbackCss,
            isCommentTextSelectionTarget,
            processComment,
            processAllComments,
            createChatStyleCommentsRuntime
        };
    }
})();
