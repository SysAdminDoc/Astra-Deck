(() => {
    'use strict';

    const LAYOUT_KEY = 'ytkit-sticky-chat-layout';
    const FLOATING_CLASS = 'ytkit-floating-chat';

    function sanitizeStickyChatLayout(value = {}) {
        const x = Number(value?.x);
        const y = Number(value?.y);
        const opacity = Number(value?.opacity);
        return {
            x: Number.isFinite(x) ? Math.max(0, Math.min(10000, Math.round(x))) : null,
            y: Number.isFinite(y) ? Math.max(0, Math.min(10000, Math.round(y))) : null,
            opacity: Number.isFinite(opacity) ? Math.max(0.45, Math.min(1, Math.round(opacity * 20) / 20)) : 0.9
        };
    }

    function createStickyChatFeature(deps = {}) {
        const {
            documentRef = typeof document !== 'undefined' ? document : null,
            windowRef = typeof window !== 'undefined' ? window : null,
            MutationObserverCtor = globalThis.MutationObserver,
            storageReadJSON = (_key, fallback) => fallback,
            storageWriteJSON = () => {},
            injectStyle = () => ({ remove() {} }),
            addNavigateRule = () => {},
            removeNavigateRule = () => {},
            setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
            clearTimeoutFn = timer => clearTimeout(timer),
            t = (_key, fallback) => fallback
        } = deps;

        return {
            id: 'stickyChat',
            name: t('feature_stickyChat_name', 'Sticky Live Chat'),
            description: t('feature_stickyChat_desc', 'Keeps the live chat panel pinned at the top of the sidebar when scrolling'),
            group: 'Live Chat',
            icon: 'message-circle',
            _styleEl: null,
            _observer: null,
            _frame: null,
            _controls: null,
            _syncTimer: null,
            _drag: null,
            _layout: sanitizeStickyChatLayout(storageReadJSON(LAYOUT_KEY, {})),

            _isFullscreen() {
                const root = documentRef?.documentElement;
                return !!documentRef?.fullscreenElement
                    || !!root?.hasAttribute?.('fullscreen')
                    || !!root?.classList?.contains?.('ytp-fullscreen');
            },

            _findUsableChatFrame() {
                const frame = documentRef?.querySelector?.('ytd-live-chat-frame#chat, ytd-live-chat-frame');
                if (!frame || frame.hasAttribute?.('collapsed') || frame.hidden) return null;
                return frame.querySelector?.('iframe') ? frame : null;
            },

            _clampLayout(frame = this._frame) {
                const rect = frame?.getBoundingClientRect?.() || {};
                const width = Number(rect.width) || Math.min(420, Math.max(280, (windowRef?.innerWidth || 1280) - 32));
                const height = Number(rect.height) || Math.min(640, Math.max(280, (windowRef?.innerHeight || 720) * 0.7));
                const maxX = Math.max(0, (windowRef?.innerWidth || width) - width);
                const maxY = Math.max(0, (windowRef?.innerHeight || height) - height);
                const fallbackX = Math.max(0, maxX - 24);
                const fallbackY = Math.min(24, maxY);
                this._layout.x = Math.max(0, Math.min(maxX, this._layout.x ?? fallbackX));
                this._layout.y = Math.max(0, Math.min(maxY, this._layout.y ?? fallbackY));
                return this._layout;
            },

            _applyLayout() {
                if (!this._frame) return;
                const layout = this._clampLayout();
                this._frame.style?.setProperty?.('--ytkit-floating-chat-x', `${layout.x}px`);
                this._frame.style?.setProperty?.('--ytkit-floating-chat-y', `${layout.y}px`);
                this._frame.style?.setProperty?.('--ytkit-floating-chat-opacity', String(layout.opacity));
                this._controls?.querySelector?.('input[type="range"]')?.setAttribute?.('aria-valuenow', String(Math.round(layout.opacity * 100)));
            },

            _persistLayout() {
                storageWriteJSON(LAYOUT_KEY, sanitizeStickyChatLayout(this._layout));
            },

            _removeDragListeners() {
                if (!this._drag) return;
                documentRef?.removeEventListener?.('pointermove', this._drag.move, true);
                documentRef?.removeEventListener?.('pointerup', this._drag.end, true);
                documentRef?.removeEventListener?.('pointercancel', this._drag.end, true);
                this._drag = null;
            },

            _beginDrag(event) {
                if (!this._frame || event?.button > 0) return;
                event?.preventDefault?.();
                // A second pointerdown while a drag is live must not overwrite
                // this._drag — that would permanently leak the previous
                // capture-phase move listener.
                this._removeDragListeners();
                this._clampLayout();
                const pointerId = event?.pointerId;
                // Capture the pointer so move/up events keep flowing when the
                // cursor outruns the frame into the cross-origin chat iframe
                // (or leaves the window); otherwise the drag strands with
                // listeners attached and the layout is never persisted.
                if (pointerId != null) {
                    try { event.currentTarget?.setPointerCapture?.(pointerId); }
                    catch { /* reason: capture is best-effort; drag still works inside the frame */ }
                }
                const startX = Number(event?.clientX) || 0;
                const startY = Number(event?.clientY) || 0;
                const originX = this._layout.x;
                const originY = this._layout.y;
                const move = moveEvent => {
                    if (pointerId != null && moveEvent?.pointerId != null && moveEvent.pointerId !== pointerId) return;
                    this._layout.x = originX + ((Number(moveEvent?.clientX) || 0) - startX);
                    this._layout.y = originY + ((Number(moveEvent?.clientY) || 0) - startY);
                    this._applyLayout();
                };
                const end = endEvent => {
                    if (pointerId != null && endEvent?.pointerId != null && endEvent.pointerId !== pointerId) return;
                    this._removeDragListeners();
                    this._persistLayout();
                };
                this._drag = { move, end };
                documentRef?.addEventListener?.('pointermove', move, true);
                documentRef?.addEventListener?.('pointerup', end, true);
                documentRef?.addEventListener?.('pointercancel', end, true);
            },

            // One step per press, ten with Shift, and the same clamp and persist
            // the pointer drag goes through so the two paths cannot disagree
            // about where the panel is allowed to sit.
            _NUDGE_STEP: 16,
            _NUDGE_STEP_LARGE: 96,

            _nudgeLayout(dx, dy) {
                if (!this._frame) return false;
                this._layout.x = (Number(this._layout.x) || 0) + dx;
                this._layout.y = (Number(this._layout.y) || 0) + dy;
                // _applyLayout clamps before it writes, so the nudge cannot
                // walk the panel off screen where the pointer drag cannot.
                this._applyLayout();
                this._persistLayout();
                return true;
            },

            _onDragHandleKey(event) {
                const step = event?.shiftKey ? this._NUDGE_STEP_LARGE : this._NUDGE_STEP;
                let dx = 0;
                let dy = 0;
                if (event?.key === 'ArrowLeft') dx = -step;
                else if (event?.key === 'ArrowRight') dx = step;
                else if (event?.key === 'ArrowUp') dy = -step;
                else if (event?.key === 'ArrowDown') dy = step;
                else return false;
                if (!this._nudgeLayout(dx, dy)) return false;
                event.preventDefault?.();
                event.stopPropagation?.();
                return true;
            },

            _mountControls(frame) {
                if (this._controls?.isConnected && this._controls.parentNode === frame) return;
                this._controls?.remove?.();
                const controls = documentRef.createElement('div');
                controls.className = 'ytkit-floating-chat-controls';
                controls.setAttribute('role', 'toolbar');
                controls.setAttribute('aria-label', t('floatingChatControlsAria', 'Floating chat controls'));

                const dragHandle = documentRef.createElement('button');
                dragHandle.type = 'button';
                dragHandle.className = 'ytkit-floating-chat-drag';
                dragHandle.textContent = '⋮⋮';
                dragHandle.setAttribute('aria-label', t('floatingChatDragAria', 'Move floating chat'));
                dragHandle.setAttribute('title', t('floatingChatDragTitle', 'Drag to move'));
                // The label promised a control. Say how it works, and mean it.
                dragHandle.setAttribute('aria-describedby', 'ytkit-floating-chat-drag-hint');
                dragHandle.addEventListener('pointerdown', event => this._beginDrag(event));
                dragHandle.addEventListener('keydown', event => this._onDragHandleKey(event));

                const dragHint = documentRef.createElement('span');
                dragHint.id = 'ytkit-floating-chat-drag-hint';
                dragHint.className = 'ytkit-floating-chat-drag-hint';
                dragHint.textContent = t('floatingChatDragKeysAria',
                    'Use the arrow keys to move the panel, or hold Shift to move it further.');
                dragHint.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;'
                    + 'overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';

                const opacity = documentRef.createElement('input');
                opacity.type = 'range';
                opacity.min = '45';
                opacity.max = '100';
                opacity.step = '5';
                opacity.value = String(Math.round(this._layout.opacity * 100));
                opacity.setAttribute('aria-label', t('floatingChatOpacityAria', 'Chat opacity'));
                opacity.addEventListener('input', () => {
                    this._layout.opacity = sanitizeStickyChatLayout({ opacity: Number(opacity.value) / 100 }).opacity;
                    this._applyLayout();
                });
                opacity.addEventListener('change', () => this._persistLayout());

                controls.appendChild(dragHandle);
                controls.appendChild(dragHint);
                controls.appendChild(opacity);
                frame.appendChild(controls);
                this._controls = controls;
            },

            _leaveFloatingMode() {
                this._removeDragListeners();
                this._controls?.remove?.();
                this._controls = null;
                this._frame?.classList?.remove?.(FLOATING_CLASS);
                this._frame = null;
            },

            _sync() {
                const frame = this._findUsableChatFrame();
                if (!this._isFullscreen() || !frame) {
                    this._leaveFloatingMode();
                    return;
                }
                if (this._frame && this._frame !== frame) this._leaveFloatingMode();
                this._frame = frame;
                frame.classList?.add?.(FLOATING_CLASS);
                this._mountControls(frame);
                this._applyLayout();
            },

            _scheduleSync(delay = 0) {
                if (this._syncTimer) clearTimeoutFn(this._syncTimer);
                this._syncTimer = setTimeoutFn(() => {
                    this._syncTimer = null;
                    this._sync();
                }, delay);
            },

            init() {
                const css = `
                    ytd-live-chat-frame:not(.ytkit-floating-chat),
                    #chat-container { position: sticky !important; top: 8px !important; z-index: 100 !important; }
                    ytd-live-chat-frame.ytkit-floating-chat {
                        position: fixed !important;
                        inset: auto !important;
                        left: var(--ytkit-floating-chat-x, calc(100vw - 444px)) !important;
                        top: var(--ytkit-floating-chat-y, 24px) !important;
                        width: min(420px, calc(100vw - 32px)) !important;
                        height: min(70vh, 640px) !important;
                        z-index: 2147483000 !important;
                        opacity: var(--ytkit-floating-chat-opacity, 0.9);
                        border: 1px solid var(--ytkit-overlay-border, rgba(255,255,255,0.2)) !important;
                        border-radius: 14px !important;
                        overflow: hidden !important;
                        background: var(--ytkit-overlay-bg, #171b23) !important;
                        box-shadow: 0 22px 70px rgba(0,0,0,0.52) !important;
                    }
                    ytd-live-chat-frame.ytkit-floating-chat > iframe { width: 100% !important; height: 100% !important; }
                    .ytkit-floating-chat-controls {
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        z-index: 5;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 5px 7px;
                        border: 1px solid var(--ytkit-overlay-border, rgba(255,255,255,0.2));
                        border-radius: 10px;
                        color: var(--ytkit-overlay-text, #e8ecf4);
                        background: var(--ytkit-overlay-bg-soft, rgba(23,27,35,0.96));
                        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
                    }
                    .ytkit-floating-chat-drag {
                        width: 36px;
                        min-height: 36px;
                        padding: 0;
                        border: 0;
                        border-radius: 8px;
                        color: inherit;
                        background: transparent;
                        cursor: move;
                        touch-action: none;
                    }
                    .ytkit-floating-chat-controls input[type="range"] { width: 88px; min-height: 36px; accent-color: var(--ytkit-accent, #a78bfa); }
                    .ytkit-floating-chat-drag:hover { background: var(--ytkit-overlay-hover, rgba(255,255,255,0.1)); }
                    .ytkit-floating-chat-drag:focus-visible,
                    .ytkit-floating-chat-controls input:focus-visible { outline: none; box-shadow: var(--ytkit-focus-ring, 0 0 0 2px rgba(8,11,16,0.98), 0 0 0 4px rgba(255,107,74,0.55)); }
                    @media (max-width: 520px) {
                        ytd-live-chat-frame.ytkit-floating-chat { width: calc(100vw - 24px) !important; height: min(65vh, 560px) !important; }
                    }
                    @media (forced-colors: active) {
                        ytd-live-chat-frame.ytkit-floating-chat,
                        .ytkit-floating-chat-controls { border: 2px solid CanvasText !important; }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        ytd-live-chat-frame.ytkit-floating-chat { transition: none !important; }
                    }
                `;
                this._styleEl = injectStyle(css, this.id, true);
                this._fullscreenHandler = () => this._scheduleSync();
                this._resizeHandler = () => { if (this._frame) this._applyLayout(); };
                documentRef?.addEventListener?.('fullscreenchange', this._fullscreenHandler);
                windowRef?.addEventListener?.('resize', this._resizeHandler);
                addNavigateRule(this.id, () => this._scheduleSync(250));
                if (MutationObserverCtor && documentRef?.documentElement) {
                    this._observer = new MutationObserverCtor(() => this._scheduleSync(100));
                    this._observer.observe(documentRef.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['collapsed', 'fullscreen'] });
                }
                this._sync();
            },

            destroy() {
                if (this._syncTimer) { clearTimeoutFn(this._syncTimer); this._syncTimer = null; }
                this._observer?.disconnect?.();
                this._observer = null;
                documentRef?.removeEventListener?.('fullscreenchange', this._fullscreenHandler);
                windowRef?.removeEventListener?.('resize', this._resizeHandler);
                removeNavigateRule(this.id);
                this._leaveFloatingMode();
                this._styleEl?.remove?.();
                this._styleEl = null;
            }
        };
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyChat = Object.freeze({ createStickyChatFeature, sanitizeStickyChatLayout });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { createStickyChatFeature, sanitizeStickyChatLayout };
    }
})();
