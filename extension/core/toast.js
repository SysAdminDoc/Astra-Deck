(() => {
    'use strict';

    // extension/core/toast.js
    //
    // v4.14.0 toast-tone helpers peeled from extension/ytkit.js. The
    // pure utility surface (tone classification, RGB tuple, badge label)
    // lives here so the popup, the in-monolith showToast/dismissToast,
    // and any future feature module can share one semantic-color
    // contract instead of each carrying its own copy.
    //
    // DOM-touching code (showToast/dismissToast, focus restoration,
    // dismiss timer) stays in ytkit.js for now — moving the dom layer
    // is a deeper refactor that needs a real live-region overlay
    // primitive in the popup too. The v5.0.0 roadmap's "single live
    // region" contract will land alongside the categorised settings
    // panel; this slice gets the pure helpers extractable first.
    //
    // Brand palette anchors (kept identical to extension/popup.css +
    // ytkit.js inline definitions):
    //
    //   success  → #35c77f   (--success)
    //   error    → #ff7480   (--error)
    //   warning  → #ffbe7a   (--warning)
    //   info     → #6aa9ff   (--info)
    //   neutral  → #8b97ab   (--text-muted)

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.toast) return;

    const TONE_RGB = Object.freeze({
        error:   '255,116,128',
        warning: '255,190,122',
        info:    '106,169,255',
        neutral: '139,151,171',
        success: '53,199,127'
    });

    const TONE_BADGE = Object.freeze({
        error:   'Issue',
        warning: 'Heads Up',
        info:    'Update',
        neutral: 'Notice',
        success: 'Done'
    });

    const TONE_ALIASES = Object.freeze({ warn: 'warning', danger: 'error' });

    function normalizeToastTone(tone, fallback = 'neutral') {
        const normalized = TONE_ALIASES[String(tone || '').toLowerCase()]
            || String(tone || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(TONE_RGB, normalized)
            ? normalized
            : fallback;
    }

    // Legacy colour input → tone bucket. Unknown accent colours are neutral:
    // an arbitrary hex must never announce an operation as successful.
    function inferToastTone(color) {
        const normalised = String(color || '').toLowerCase();
        if (normalised === '#ef4444') return 'error';
        if (normalised === '#f59e0b' || normalised === '#f97316') return 'warning';
        if (normalised === '#3b82f6') return 'info';
        if (normalised === '#6b7280') return 'neutral';
        if (normalised === '#22c55e' || normalised === '#35c77f') return 'success';
        return 'neutral';
    }

    function getToastRgb(tone) {
        const key = normalizeToastTone(tone);
        return TONE_RGB[key];
    }

    function getToastBadgeLabel(tone) {
        const key = normalizeToastTone(tone);
        return TONE_BADGE[key];
    }

    // ARIA defaults. role=alert for error so screen-readers announce
    // immediately; role=status for everything else so the assertive
    // channel isn't flooded by routine confirmations. Returned as a
    // small bag so callers can spread it onto an element in one line.
    function getToastAriaDefaults(tone) {
        if (normalizeToastTone(tone) === 'error') return { role: 'alert', ariaLive: 'assertive' };
        return { role: 'status', ariaLive: 'polite' };
    }

    function supportsPopover() {
        const HTMLElementCtor = typeof globalThis !== 'undefined' ? globalThis.HTMLElement : null;
        return typeof HTMLElementCtor?.prototype?.showPopover === 'function'
            && typeof HTMLElementCtor?.prototype?.hidePopover === 'function';
    }

    function createCloseWatcher(onClose) {
        const CloseWatcherCtor = typeof globalThis !== 'undefined' ? globalThis.CloseWatcher : null;
        if (typeof CloseWatcherCtor !== 'function' || typeof onClose !== 'function') return null;
        try {
            const watcher = new CloseWatcherCtor();
            watcher.addEventListener('close', onClose);
            return watcher;
        } catch (_) {
            // reason: CloseWatcher can reject construction outside a user activation.
            return null;
        }
    }

    function destroyCloseWatcher(watcher) {
        if (!watcher) return;
        try {
            watcher.destroy?.();
        } catch (_) {
            // reason: the browser may have already destroyed the watcher.
        }
    }

    // The top layer stacks by SHOW ORDER, not z-index. The settings panel
    // became a popover in d4bebef5, which silently undid the v4.50.1 fix that
    // put panel-fired Undo toasts above it — a toast shown before the panel
    // opens now paints underneath it for the rest of its life (undo toasts run
    // for seconds). Re-showing an open toast moves it back to the top.
    //
    // `_restackDepth` is read by the toast systems' popover `toggle` handlers:
    // the close half of this cycle must not be mistaken for a dismissal. It is
    // a counter rather than a boolean because `toggle` is queued, so the event
    // can arrive after a boolean would already have been reset.
    function raiseActiveToasts() {
        if (typeof document === 'undefined') return 0;
        let raised = 0;
        document.querySelectorAll('.ytkit-global-toast[popover]').forEach((toast) => {
            if (!toast.isConnected) return;
            if (typeof toast.showPopover !== 'function' || typeof toast.hidePopover !== 'function') return;
            try {
                toast._restackDepth = (toast._restackDepth || 0) + 1;
                toast.hidePopover();
                toast.showPopover();
                raised += 1;
            } catch (_) {
                // reason: the toast may have closed natively mid-restack; clear
                // the debt so a genuine later close still dismisses it.
                toast._restackDepth = 0;
            }
        });
        return raised;
    }

    core.toast = Object.freeze({
        inferToastTone,
        raiseActiveToasts,
        normalizeToastTone,
        getToastRgb,
        getToastBadgeLabel,
        getToastAriaDefaults,
        supportsPopover,
        createCloseWatcher,
        destroyCloseWatcher,
        TONE_RGB,
        TONE_BADGE
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            inferToastTone,
            raiseActiveToasts, normalizeToastTone, getToastRgb, getToastBadgeLabel,
            getToastAriaDefaults, supportsPopover, createCloseWatcher,
            destroyCloseWatcher, TONE_RGB, TONE_BADGE
        };
    }
})();
