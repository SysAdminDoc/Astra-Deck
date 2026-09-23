(() => {
    'use strict';

    // extension/features/sticky-video-chat/index.js
    //
    // Theater Split's live chat placement: find the chat frame (now or when it
    // arrives late), decide whether the right pane is live chat, a replay or
    // comments, and pin the frame over that pane with its inline styles stashed
    // for restore. features/sticky-video merges these methods onto the feature
    // object, so `this` is the feature and the chat observer state lives there.

    function createStickyVideoChatMethods(deps = {}) {
        const { VideoTypeDetector, DebugManager } = deps;
        return {
            // Force/restore chat frame internals
            _forceChatFill(chatEl) {
                if (!chatEl) return;
                const fill = {width:'100%',height:'100%'};
                const showHide = chatEl.querySelector('#show-hide-button');
                const container = chatEl.querySelector('#container');
                const frame = chatEl.querySelector('iframe');
                this._stashSplitInlineStyles(showHide, ['display']);
                this._stashSplitInlineStyles(container, ['width','height','max-height','min-height','border-radius']);
                this._stashSplitInlineStyles(frame, ['width','height','min-height','border','border-radius']);
                this._setStyles(showHide, {display:'none'});
                this._setStyles(container, {...fill,'max-height':'none','min-height':'0','border-radius':'0'});
                this._setStyles(frame, {...fill,'min-height':'0',border:'none','border-radius':'0'});
            },
            _restoreChatFill(chatEl) {
                if (!chatEl) return;
                this._restoreSplitInlineStyles(chatEl.querySelector('#show-hide-button'), ['display']);
                this._restoreSplitInlineStyles(chatEl.querySelector('#container'), ['width','height','max-height','min-height','border-radius']);
                this._restoreSplitInlineStyles(chatEl.querySelector('iframe'), ['width','height','min-height','border','border-radius']);
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
                this._stashSplitInlineStyles(sec, ['display', 'pointer-events']);
                sec.style.setProperty('display', 'block', 'important');
                sec.style.setProperty('pointer-events', 'none', 'important');
                sec.dataset.ytkitSplitHidden = '1';
                const related = sec.querySelector('#related');
                if (related) {
                    this._stashSplitInlineStyles(related, ['display']);
                    related.dataset.ytkitSplitHidden = '1';
                    related.style.display = 'none';
                }
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
                    this._stashSplitInlineStyles(chatEl, ['border-bottom']);
                    chatEl.style.setProperty('border-bottom', '2px solid var(--ytkit-split-border)', 'important');
                    const below = this._getBelow();
                    if (below && parseFloat(below.style.getPropertyValue('top')) === 0) {
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
        };
    }

    const api = Object.freeze({ createStickyVideoChatMethods });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyVideoChat = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
