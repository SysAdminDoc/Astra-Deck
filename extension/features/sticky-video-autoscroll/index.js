(() => {
    'use strict';

    // extension/features/sticky-video-autoscroll/index.js
    //
    // Theater Split middle-button autoscroll: holding the middle button over a
    // scrollable pane scrolls it toward the pointer, faster the further away,
    // until the button is released, Escape is pressed or the window loses focus.
    // features/sticky-video merges these methods onto the feature object, so
    // this is the feature and the autoscroll state lives there.

    function createStickyVideoAutoscrollMethods() {
        return {
            _isSplitScrollable(el) {
                return !!(el && el.scrollHeight > el.clientHeight + 1);
            },

            _isSplitCommentTextTarget(target) {
                if (!this._isActive || !this._isSplit) return false;
                const node = target instanceof Element ? target : target?.parentElement;
                if (!node) return false;
                const thread = node.closest('ytd-comment-thread-renderer');
                if (!thread || !thread.closest('#below.ytkit-split-scroll-surface #comments')) return false;
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
        };
    }

    const api = Object.freeze({ createStickyVideoAutoscrollMethods });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyVideoAutoscroll = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
