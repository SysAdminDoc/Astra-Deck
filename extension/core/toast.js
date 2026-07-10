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

    core.toast = Object.freeze({
        inferToastTone,
        normalizeToastTone,
        getToastRgb,
        getToastBadgeLabel,
        getToastAriaDefaults,
        TONE_RGB,
        TONE_BADGE
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            inferToastTone, normalizeToastTone, getToastRgb, getToastBadgeLabel,
            getToastAriaDefaults, TONE_RGB, TONE_BADGE
        };
    }
})();
