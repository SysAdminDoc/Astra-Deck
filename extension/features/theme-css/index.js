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

    // forceDarkEverywhere: parameter-less rules to drag YouTube's
    // non-standard pages (settings, about, embedded) into the same dark
    // surface tokens the main UI uses. Caller is responsible for the
    // `dark` attribute + `color-scheme: dark` documentElement bits —
    // those touch the DOM and stay in the monolith.
    function buildForceDarkEverywhereCss() {
        return '\n                    html[dark] { --yt-spec-base-background: #0f0f0f !important; --yt-spec-brand-background-solid: #0f0f0f !important; }\n'
            + '                    ytd-app, ytd-browse, ytd-page-manager, #content { background-color: #0f0f0f !important; }\n'
            + '                    body { background-color: #0f0f0f !important; color: #f1f1f1 !important; }\n'
            + '                    /* Force dark on non-standard pages */\n'
            + '                    .page-container, .yt-core-attributed-string, [light] { background: #0f0f0f !important; color: #f1f1f1 !important; }\n                ';
    }

    // themeAccentColor: only emits CSS when the accent is a valid hex
    // (#RGB / #RRGGBB / #RGBA / #RRGGBBAA, matching the prior inline
    // validation). Returns `null` otherwise so the monolith can skip the
    // style-tag insertion.
    const ACCENT_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    function buildAccentColorCss(settings) {
        const accent = settings && settings.themeAccentColor;
        if (!accent || !ACCENT_HEX_RE.test(accent)) return null;
        return '\n                    :root { --ytkit-accent: ' + accent + ' !important; }\n'
            + '                    .ytp-swatch-background-color, .ytp-play-progress,\n'
            + '                    #progress.ytd-thumbnail-overlay-resume-playback-renderer {\n'
            + '                        background: ' + accent + ' !important;\n'
            + '                    }\n'
            + '                    yt-chip-cloud-chip-renderer[selected] {\n'
            + '                        background-color: ' + accent + ' !important;\n'
            + '                    }\n'
            + '                    ytd-toggle-button-renderer.style-default-active[is-icon-button] yt-icon {\n'
            + '                        color: ' + accent + ' !important;\n'
            + '                    }\n                ';
    }

    // compactUnfixedHeader: parameter-less rules that shrink the
    // masthead and let it scroll away. v4.22.0 peel.
    function buildCompactUnfixedHeaderCss() {
        return '\n                    ytd-masthead { position: absolute !important; height: 40px !important; min-height: 40px !important; }\n'
            + '                    ytd-masthead #container.ytd-masthead { height: 40px !important; }\n'
            + '                    ytd-masthead #logo { height: 16px !important; }\n'
            + '                    ytd-masthead #search-form, ytd-masthead #search-input { height: 32px !important; }\n'
            + '                    ytd-page-manager { margin-top: 0 !important; }\n'
            + '                    html[dark] #cinematics { top: 40px !important; }\n                ';
    }

    // hideVideoEndContent: parameter-less rules that suppress every
    // YouTube end-screen / end-card surface plus the fullscreen video
    // grid that shows after a video ends. v4.22.0 peel.
    function buildHideVideoEndContentCss() {
        return '\n                    .ytp-ce-element, .ytp-ce-covering-overlay, .ytp-ce-element-shadow,\n'
            + '                    .ytp-ce-covering-image, .ytp-ce-expanding-image,\n'
            + '                    .ytp-ce-element.ytp-ce-video, .ytp-ce-element.ytp-ce-channel,\n'
            + '                    .ytp-ce-element.ytp-ce-playlist,\n'
            + '                    .ytp-endscreen-content,\n'
            + '                    div.ytp-fullscreen-grid-stills-container { display: none !important; }\n                ';
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
        buildGrayscaleThumbnailsCss,
        buildForceDarkEverywhereCss,
        buildAccentColorCss,
        buildCompactUnfixedHeaderCss,
        buildHideVideoEndContentCss
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildProgressBarCss,
            buildSelectionColorCss,
            buildGrayscaleThumbnailsCss,
            buildForceDarkEverywhereCss,
            buildAccentColorCss,
            buildCompactUnfixedHeaderCss,
            buildHideVideoEndContentCss
        };
    }
})();
