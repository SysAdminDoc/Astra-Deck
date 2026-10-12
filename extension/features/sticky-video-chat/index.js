(() => {
    'use strict';

    // extension/features/sticky-video-chat/index.js
    //
    // Theater Split live chat placement: find the chat frame (now or when it
    // arrives late), decide whether the right pane is live chat, a replay or
    // comments, and pin the frame over that pane with its inline styles stashed
    // for restore. features/sticky-video merges these methods onto the feature
    // object, so this is the feature and the chat observer state lives there.
    //
    // A past live stream has both a chat replay and comments. Stacked, each
    // got half the height, so the pane shows one at a time under a toggle bar,
    // comments first. Both stay mounted in the same spot and the other one is
    // only hidden: the replay keeps time with the video, and going back to
    // the comments never reloads them.

    // Matches the bar's height in the shell sheet (sticky-video-styles).
    const SPLIT_REPLAY_TABS_HEIGHT_PX = 48;

    function createStickyVideoChatMethods(deps = {}) {
        const { VideoTypeDetector, DebugManager, t = (_key, fallback) => fallback } = deps;
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

                if (this._videoType === 'vod') {
                    this._layoutSplitReplay(chatEl, below, options.rightPct);
                    DebugManager.log('Theater', 'Late chat replay found, added to the pane toggle');
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

            // ── Past live stream: chat replay or comments, one at a time ──

            _layoutSplitReplay(chatEl, below, rightPct) {
                let top = '0';
                let height = '100vh';
                if (chatEl && below) {
                    const barHeight = this._ensureSplitReplayTabs(rightPct);
                    top = `${barHeight}px`;
                    height = `calc(100vh - ${barHeight}px)`;
                } else {
                    this._removeSplitReplayTabs();
                }
                this._setupChat(chatEl, rightPct, top, height);
                if (below) {
                    this._positionOverRight(below, rightPct, top, height);
                    this._setStyles(below, {width:`calc(${rightPct}% - 2px)`,padding:'16px 14px 72px'});
                }
                this._showSplitReplayPane();
            },

            _ensureSplitReplayTabs(rightPct) {
                let bar = this._splitReplayTabs;
                if (!bar || !bar.isConnected) {
                    bar = document.createElement('div');
                    bar.id = 'ytkit-split-replay-tabs';
                    const track = document.createElement('div');
                    track.className = 'ytkit-split-replay-track';
                    track.setAttribute('role', 'group');
                    track.setAttribute('aria-label', t('stickyVideoReplayPaneAria', 'Side panel content'));
                    track.appendChild(this._createSplitReplayTab('comments', t('stickyVideoReplayCommentsTab', 'Comments')));
                    track.appendChild(this._createSplitReplayTab('chat', t('stickyVideoReplayChatTab', 'Live chat replay')));
                    bar.appendChild(track);
                    // The bar takes over the collapse strip's job (the replay
                    // frame swallows the wheel): pulling up on it closes the
                    // pane once the surface below has nothing left to scroll up.
                    const atTop = () => !(this._scrollTarget?.scrollTop > 0);
                    let touchY = 0;
                    bar.addEventListener('wheel', (e) => {
                        if (e.deltaY < 0 && atTop()) this._collapseSplit(false);
                    }, { passive: true });
                    bar.addEventListener('touchstart', (e) => {
                        const touch = e.touches[0];
                        if (touch) touchY = touch.clientY;
                    }, { passive: true });
                    bar.addEventListener('touchmove', (e) => {
                        const touch = e.touches[0];
                        if (touch && touch.clientY - touchY > 30 && atTop()) this._collapseSplit(false);
                    }, { passive: true });
                    document.body.appendChild(bar);
                    this._splitReplayTabs = bar;
                }
                // A positioned element: the divider drag resizes it, native
                // fullscreen hides it, and the wheel proxy leaves it alone.
                bar.style.setProperty('width', `calc(${rightPct}% - 2px)`, 'important');
                if (!this._positionedEls.includes(bar)) this._positionedEls.push(bar);
                return SPLIT_REPLAY_TABS_HEIGHT_PX;
            },

            _createSplitReplayTab(pane, label) {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'ytkit-split-replay-tab';
                tab.dataset.ytkitPane = pane;
                tab.textContent = label;
                tab.title = label;
                tab.setAttribute('aria-pressed', 'false');
                tab.addEventListener('click', () => this._setSplitReplayPane(pane));
                return tab;
            },

            _removeSplitReplayTabs() {
                const bar = this._splitReplayTabs;
                if (!bar) return;
                bar.remove();
                this._positionedEls = (this._positionedEls || []).filter(el => el !== bar);
                this._splitReplayTabs = null;
            },

            _setSplitReplayPane(pane) {
                this._splitReplayPane = pane === 'chat' ? 'chat' : 'comments';
                if (!this._isSplit || this._videoType !== 'vod') return;
                this._showSplitReplayPane();
                DebugManager.log('Theater', `Past live stream pane: ${this._splitReplayPane}`);
            },

            _showSplitReplayPane() {
                const chatEl = this._getChatEl();
                const below = this._getBelow();
                const pane = (this._splitReplayPane === 'chat' && chatEl) || !below ? 'chat' : 'comments';
                const shown = pane === 'chat' ? chatEl : below;
                const hidden = pane === 'chat' ? below : chatEl;
                // Only an element this pane placed: both properties are in its
                // restore stash, so collapse and unmount put them back.
                if (hidden && this._positionedEls.includes(hidden)) {
                    this._setStyles(hidden, { visibility: 'hidden', 'pointer-events': 'none' });
                }
                if (shown && this._positionedEls.includes(shown)) {
                    this._setStyles(shown, { visibility: 'visible', 'pointer-events': 'auto' });
                }
                this._splitReplayTabs?.querySelectorAll('.ytkit-split-replay-tab').forEach(tab => {
                    tab.setAttribute('aria-pressed', String(tab.dataset.ytkitPane === pane));
                });
                this._retargetSplitScroll(shown || null);
            },

            // The pull-to-collapse handlers follow the surface on show.
            _retargetSplitScroll(next) {
                const previous = this._scrollTarget;
                if (previous === next) return;
                if (previous && this._rightWheelHandler) {
                    previous.removeEventListener('wheel', this._rightWheelHandler);
                    previous.removeEventListener('touchstart', this._rightTouchHandler);
                    previous.removeEventListener('touchmove', this._rightTouchMoveHandler);
                }
                this._scrollTarget = next;
                if (next && this._rightWheelHandler) {
                    next.addEventListener('wheel', this._rightWheelHandler, { passive: true });
                    next.addEventListener('touchstart', this._rightTouchHandler, { passive: true });
                    next.addEventListener('touchmove', this._rightTouchMoveHandler, { passive: true });
                }
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
