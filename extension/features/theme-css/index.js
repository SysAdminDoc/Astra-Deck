(() => {
    'use strict';

    // extension/features/theme-css/index.js
    //
    // v4.19.0 bundled peel for three small CSS-only theme features that
    // share a single pattern: read one or two schema settings, return a
    // pure CSS string. Each helper has its own monolith consumer; this
    // module just centralises the strings so they're testable in
    // isolation and reusable from the popup preview surfaces.
    //
    // Schema keys touched (category `shell`):
    //   customProgressBarColor (string)  — progress-bar swatch override
    //   customSelectionColor   (boolean) — gates the selection override
    //   selectionColor         (string)  — ::selection background
    //   grayscaleThumbnails    (boolean) — grayscale-on-rest thumbnails

    function isHexLike(value) {
        return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value);
    }

    // customProgressBarColor: the prior inline implementation returned
    // *nothing* when the color matched the default '#ff0000' so the
    // monolith would skip the style-tag insertion entirely. Mirror that:
    // return `null` for the default, the CSS string otherwise.
    function buildProgressBarCss(settings) {
        const colour = (settings && settings.customProgressBarColor) || '#ff0000';
        if (!isHexLike(colour)) return null;
        if (colour.toLowerCase() === '#ff0000') return null;
        return '.ytp-play-progress, .ytp-swatch-background-color { background: ' + colour + ' !important; }'
            + ' .ytp-volume-slider-foreground::after { background: ' + colour + ' !important; }';
    }

    // customSelectionColor: the monolith block always emits the rules
    // when the master toggle is on. The pure helper is symmetric — it
    // emits the CSS unconditionally and lets the caller decide whether
    // to inject. Default selection color is the v0.1 schema fallback
    // '#2dd36f'.
    function buildSelectionColorCss(settings) {
        const colour = (settings && settings.selectionColor) || '#2dd36f';
        const safe = isHexLike(colour) ? colour : '#2dd36f';
        return '\n                    ::selection { background: ' + safe + ' !important; color: #000 !important; }\n'
            + '                    ::-moz-selection { background: ' + safe + ' !important; color: #000 !important; }\n                ';
    }

    // grayscaleThumbnails: pure constant — no parameters. Returned as a
    // function for symmetry with the other builders so the test surface
    // can call them uniformly.
    function buildGrayscaleThumbnailsCss() {
        return '\n                    ytd-rich-item-renderer ytd-thumbnail img,\n'
            + '                    ytd-video-renderer ytd-thumbnail img,\n'
            + '                    ytd-grid-video-renderer ytd-thumbnail img,\n'
            + '                    ytd-compact-video-renderer ytd-thumbnail img {\n'
            + '                        filter: grayscale(100%) !important;\n'
            + '                        transition: filter 0.3s ease !important;\n'
            + '                    }\n'
            + '                    ytd-rich-item-renderer:hover ytd-thumbnail img,\n'
            + '                    ytd-video-renderer:hover ytd-thumbnail img,\n'
            + '                    ytd-grid-video-renderer:hover ytd-thumbnail img,\n'
            + '                    ytd-compact-video-renderer:hover ytd-thumbnail img {\n'
            + '                        filter: grayscale(0%) !important;\n'
            + '                    }\n                ';
    }

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.themeCss = Object.freeze({
        buildProgressBarCss,
        buildSelectionColorCss,
        buildGrayscaleThumbnailsCss
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildProgressBarCss,
            buildSelectionColorCss,
            buildGrayscaleThumbnailsCss
        };
    }
})();
