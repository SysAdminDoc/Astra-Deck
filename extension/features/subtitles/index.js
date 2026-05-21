(() => {
    'use strict';

    // extension/features/subtitles/index.js
    //
    // v4.13.0 first feature peel from the 43k-line ytkit.js monolith.
    // Owns the YouTube caption-styling override layer driven by these
    // eight settings-schema keys (category `subtitles` in the v4.6.0
    // schema):
    //
    //   subtitleStyling          (boolean)  master toggle
    //   subStyleFontSize         (number)   50-300 %
    //   subStyleFontFamily       (string)   default | sans | serif | mono | YouTube Sans
    //   subStyleColor            (string)   #rrggbb foreground
    //   subStyleBgOpacity        (number)   0-100 %
    //   subStyleBgColor          (string)   #rrggbb background
    //   subStyleBottomOffset     (number)   % from viewport bottom
    //   subStyleTextShadow       (boolean)  drop shadow on/off
    //
    // The module exposes a single pure helper, buildSubtitleCss(settings),
    // that ytkit.js's existing subtitleStyling feature block delegates to.
    // Both paths render byte-identical CSS — the parity is locked in by a
    // hardening test. A subsequent slice will flip the feature block over
    // to the v4.7.0 lifecycle contract; this slice gets the pure logic out
    // of the monolith first so it can be tested + reasoned about in
    // isolation.

    const FONT_FAMILY_MAP = Object.freeze({
        default: '',
        sans:    'Roboto, sans-serif',
        serif:   'Georgia, serif',
        mono:    'Menlo, Consolas, monospace',
        'YouTube Sans': '"YouTube Sans", Roboto, sans-serif'
    });

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, n));
    }

    function normaliseHex(input, fallback) {
        if (typeof input !== 'string') return fallback;
        const trimmed = input.trim();
        // Accept #RGB / #RRGGBB; reject anything else (defensive — the
        // popup picker only emits #RRGGBB but a corrupted import could
        // ship a malformed value through chrome.storage).
        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
        if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
            const r = trimmed[1];
            const g = trimmed[2];
            const b = trimmed[3];
            return ('#' + r + r + g + g + b + b).toLowerCase();
        }
        return fallback;
    }

    function hexToRgb(hex) {
        const safe = normaliseHex(hex, '#000000');
        return {
            r: parseInt(safe.slice(1, 3), 16),
            g: parseInt(safe.slice(3, 5), 16),
            b: parseInt(safe.slice(5, 7), 16)
        };
    }

    // Pure: same input → same CSS string. The CSS shape is preserved
    // byte-for-byte against the previous inline ytkit.js implementation
    // so existing visual regressions stay quiet.
    function buildSubtitleCss(settings) {
        const s = settings || {};
        const sizePct = clamp(s.subStyleFontSize || 100, 50, 300);
        const familyKey = s.subStyleFontFamily;
        const fam = FONT_FAMILY_MAP[familyKey] || '';
        const bgOpacity = clamp(s.subStyleBgOpacity ?? 75, 0, 100) / 100;
        const bgRgb = hexToRgb(s.subStyleBgColor || '#000000');
        const bgRgba = 'rgba(' + bgRgb.r + ', ' + bgRgb.g + ', ' + bgRgb.b + ', ' + bgOpacity + ')';
        const bottom = clamp(s.subStyleBottomOffset ?? 10, 0, 90);
        const shadow = s.subStyleTextShadow !== false
            ? '2px 2px 4px rgba(0,0,0,0.9)'
            : 'none';
        const colorHex = normaliseHex(s.subStyleColor, '#ffffff') || '#ffffff';
        return `
                    .ytp-caption-segment {
                        font-size: ${sizePct}% !important;
                        color: ${colorHex} !important;
                        background: ${bgRgba} !important;
                        ${fam ? `font-family: ${fam} !important;` : ''}
                        text-shadow: ${shadow} !important;
                        padding: 2px 6px !important;
                    }
                    .caption-window, .ytp-caption-window-container {
                        bottom: ${bottom}% !important;
                    }
                `;
    }

    // Lifecycle-ready spec. Not yet wired into the existing feature
    // registry (the in-monolith block still owns init/destroy), but
    // exported so a follow-up slice can flip to the v4.7.0 contract
    // without touching the buildSubtitleCss function again.
    const featureSpec = Object.freeze({
        id: 'subtitleStyling',
        category: 'subtitles',
        buildCss: buildSubtitleCss
    });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.subtitles = Object.freeze({
        buildSubtitleCss,
        featureSpec,
        FONT_FAMILY_MAP
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { buildSubtitleCss, featureSpec, FONT_FAMILY_MAP };
    }
})();
