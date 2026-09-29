(() => {
    'use strict';

    // extension/features/sticky-video-styles/index.js
    //
    // The three Theater Split stylesheets: the page shell, the metadata column
    // and the comments pane. Pure functions with no page or storage access, so
    // they load and test on their own. features/sticky-video/index.js injects
    // them from init().
    //
    // Two rules shape how this file is laid out:
    //
    // 1. The controller passes the shell and metadata sheets through
    //    stripCommentRestyleCss, which splits on "}" and drops every rule that
    //    names a comment selector. So comment rules live only in the comments
    //    sheet, and neither of the other two may hold an @media block (a naive
    //    split on "}" would cut it in half).
    // 2. Every color comes from the tokens in buildSplitShellCss. They derive
    //    from YouTube's own --yt-spec-* variables, which the OLED theme and the
    //    color themes already override, and from --ytkit-accent. So the split
    //    follows dark, light, OLED, every palette and the user's accent with no
    //    per-theme rules here.

    const STYLE_IDS = Object.freeze({
        shell: 'stickyVideo',
        meta: 'stickyVideo-meta-layout',
        comments: 'stickyVideo-comments'
    });

    const ROOT = 'html.ytkit-split-active';
    const PANE = `${ROOT} #below.ytkit-split-scroll-surface`;
    const META = `${PANE} ytd-watch-metadata`;

    // Selectors for YouTube's button shapes. Both class generations ship at
    // once, so every control rule names both.
    // Interpolated rather than written as a CSS escape: the userscript build
    // leaves any template that holds a backslash uncompacted.
    const MIDDOT = String.fromCharCode(0xb7);

    const BUTTON_CLASSES = '.yt-spec-button-shape-next, .ytSpecButtonShapeNextHost';
    const BUTTON = `:is(${BUTTON_CLASSES})`;

    function buildSplitShellCss() {
        return `
${ROOT} {
    --ytkit-split-text: var(--yt-spec-text-primary, #f1f1f1);
    --ytkit-split-muted: var(--yt-spec-text-secondary, #aaaaaa);
    --ytkit-split-canvas: var(--yt-spec-base-background, #0f0f0f);
    --ytkit-split-panel: var(--yt-spec-base-background, #0f0f0f);
    --ytkit-split-raised: color-mix(in srgb, var(--ytkit-split-text) 7%, var(--ytkit-split-panel));
    --ytkit-split-hover: color-mix(in srgb, var(--ytkit-split-text) 12%, var(--ytkit-split-panel));
    --ytkit-split-pressed: color-mix(in srgb, var(--ytkit-split-text) 17%, var(--ytkit-split-panel));
    --ytkit-split-border: color-mix(in srgb, var(--ytkit-split-text) 14%, transparent);
    --ytkit-split-border-strong: color-mix(in srgb, var(--ytkit-split-text) 26%, transparent);
    --ytkit-split-hairline: color-mix(in srgb, var(--ytkit-split-text) 9%, transparent);
    --ytkit-split-accent: var(--ytkit-accent, #a78bfa);
    --ytkit-split-accent-ink: color-mix(in srgb, var(--ytkit-split-accent) 82%, var(--ytkit-split-text));
    --ytkit-split-accent-soft: color-mix(in srgb, var(--ytkit-split-accent) 16%, transparent);
    --ytkit-split-control: var(--ytkit-split-raised);
    --ytkit-split-control-hover: var(--ytkit-split-hover);
    --ytkit-split-control-active: var(--ytkit-split-pressed);
    --ytkit-split-scrollbar: color-mix(in srgb, var(--ytkit-split-text) 22%, transparent);
    --ytkit-split-scrim: rgba(8, 8, 10, 0.74);
    --ytkit-split-radius: 8px;
    --ytkit-split-radius-sm: 6px;
    --ytkit-split-control-h: 32px;
    --ytkit-split-ease: cubic-bezier(0.2, 0, 0, 1);
    color-scheme: dark;
}
html:not([dark]).ytkit-split-active {
    --ytkit-split-text: var(--yt-spec-text-primary, #0f0f0f);
    --ytkit-split-muted: var(--yt-spec-text-secondary, #606060);
    --ytkit-split-canvas: var(--yt-spec-base-background, #ffffff);
    --ytkit-split-panel: var(--yt-spec-base-background, #ffffff);
    --ytkit-split-raised: color-mix(in srgb, var(--ytkit-split-text) 5%, var(--ytkit-split-panel));
    --ytkit-split-hover: color-mix(in srgb, var(--ytkit-split-text) 9%, var(--ytkit-split-panel));
    --ytkit-split-pressed: color-mix(in srgb, var(--ytkit-split-text) 14%, var(--ytkit-split-panel));
    --ytkit-split-accent-ink: color-mix(in srgb, var(--ytkit-split-accent) 58%, var(--ytkit-split-text));
    --ytkit-split-accent-soft: color-mix(in srgb, var(--ytkit-split-accent) 13%, transparent);
    color-scheme: light;
}

${ROOT} ytd-watch-flexy { display: block !important; overflow: visible !important; }
${ROOT} ytd-watch-flexy #columns { max-width: 100% !important; }
${ROOT} ytd-masthead, ${ROOT} #masthead-container { display: none !important; }
${ROOT} #page-manager { margin-top: 0 !important; }
${ROOT} ytd-app { --ytd-masthead-height: 0px; }
${ROOT}, ${ROOT} body { overflow: hidden !important; }
${ROOT} body { padding-top: 0 !important; background: var(--ytkit-split-canvas) !important; }
${ROOT} :is(#player-container, #player-container-inner, #player-theater-container, ytd-player) {
    width: 100% !important;
    max-width: none !important;
    height: 100% !important;
    min-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
}
${ROOT} #movie_player {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    position: relative !important;
    left: auto !important;
    top: auto !important;
}
${ROOT} .html5-video-container { width: 100% !important; height: 100% !important; }
${ROOT} video.html5-main-video {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    left: 0 !important;
    top: 0 !important;
}
${ROOT} :is(ytd-player > #container, #player-container-inner #player) {
    width: 100% !important;
    height: 100% !important;
    padding-bottom: 0 !important;
}
${ROOT} ytd-watch-flexy :is([flexy-header-flipper_], [theater], *) #player-container,
${ROOT} ytd-watch-flexy #player-container { width: 100% !important; max-width: none !important; }
${ROOT} :is(#secondary, #below, #player-full-bleed-container, #columns, ytd-watch-flexy) { view-transition-name: none !important; }
${ROOT} :is(ytd-popup-container, tp-yt-iron-dropdown, ytd-menu-popup-renderer, ytd-multi-page-menu-renderer) { z-index: 2147483647 !important; }

${ROOT} :is(#ytkit-split-wrapper, #ytkit-split-left) { background: transparent !important; }
${ROOT} #ytkit-split-right {
    border: 0 !important;
    background: var(--ytkit-split-panel) !important;
    scrollbar-width: thin !important;
    scrollbar-color: var(--ytkit-split-scrollbar) transparent !important;
}

${ROOT} #ytkit-split-divider {
    position: relative !important;
    overflow: visible !important;
    border: 0 !important;
    background: var(--ytkit-split-canvas) !important;
    color: var(--ytkit-split-muted) !important;
    outline: none !important;
    touch-action: none !important;
    transition: background-color 160ms var(--ytkit-split-ease), flex-basis 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
${ROOT} #ytkit-split-divider::before {
    content: '' !important;
    position: absolute !important;
    inset: 0 -1px 0 auto !important;
    width: 1px !important;
    background: var(--ytkit-split-hairline) !important;
    transition: background-color 160ms var(--ytkit-split-ease), width 160ms var(--ytkit-split-ease) !important;
}
${ROOT} #ytkit-split-divider::after {
    content: '' !important;
    position: absolute !important;
    inset: 0 0 0 -8px !important;
}
${ROOT} #ytkit-split-divider .ytkit-divider-pip {
    position: absolute !important;
    top: 50% !important;
    left: 50% !important;
    z-index: 1 !important;
    display: grid !important;
    place-content: center !important;
    gap: 4px !important;
    width: 10px !important;
    height: 40px !important;
    padding: 0 !important;
    border: 1px solid var(--ytkit-split-border) !important;
    border-radius: 4px !important;
    background: var(--ytkit-split-raised) !important;
    color: var(--ytkit-split-muted) !important;
    opacity: 1 !important;
    transform: translate(-50%, -50%) !important;
    transition: background-color 160ms var(--ytkit-split-ease), border-color 160ms var(--ytkit-split-ease), color 160ms var(--ytkit-split-ease), height 160ms var(--ytkit-split-ease) !important;
}
${ROOT} #ytkit-split-divider .ytkit-divider-pip > div {
    width: 2px !important;
    height: 2px !important;
    border-radius: 0 !important;
    background: currentColor !important;
}
${ROOT} #ytkit-split-divider:hover,
${ROOT} #ytkit-split-divider:focus-visible { background: color-mix(in srgb, var(--ytkit-split-accent) 10%, var(--ytkit-split-canvas)) !important; }
${ROOT} #ytkit-split-divider:hover::before,
${ROOT} #ytkit-split-divider:focus-visible::before { background: var(--ytkit-split-accent) !important; }
${ROOT} #ytkit-split-divider:hover .ytkit-divider-pip,
${ROOT} #ytkit-split-divider:focus-visible .ytkit-divider-pip {
    height: 56px !important;
    border-color: var(--ytkit-split-accent) !important;
    background: var(--ytkit-split-accent) !important;
    color: var(--ytkit-split-panel) !important;
}
${ROOT} #ytkit-split-divider:focus-visible .ytkit-divider-pip {
    outline: 2px solid var(--ytkit-split-accent) !important;
    outline-offset: 3px !important;
}
${ROOT} #ytkit-split-divider[data-ytkit-panel-state="closed"] { background: color-mix(in srgb, var(--ytkit-split-accent) 14%, var(--ytkit-split-canvas)) !important; }
${ROOT} #ytkit-split-divider[data-ytkit-panel-state="closed"] .ytkit-divider-pip {
    border-color: var(--ytkit-split-accent) !important;
    color: var(--ytkit-split-accent) !important;
}
${ROOT} #ytkit-split-divider[data-ytkit-panel-state="hidden"] {
    width: 0 !important;
    flex-basis: 0 !important;
    overflow: hidden !important;
}
${ROOT} #ytkit-split-divider[data-ytkit-panel-state="hidden"]::after { content: none !important; }

${ROOT} #ytkit-split-close {
    position: absolute !important;
    top: 16px !important;
    right: 16px !important;
    bottom: auto !important;
    z-index: 35 !important;
    align-items: center !important;
    justify-content: center !important;
    width: 36px !important;
    height: 36px !important;
    padding: 0 !important;
    border: 1px solid rgba(255, 255, 255, 0.16) !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-scrim) !important;
    color: #ffffff !important;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32) !important;
    cursor: pointer !important;
    pointer-events: auto !important;
    transition: background-color 160ms var(--ytkit-split-ease), border-color 160ms var(--ytkit-split-ease), transform 160ms var(--ytkit-split-ease), opacity 200ms ease !important;
}
${ROOT} #ytkit-split-close svg { width: 16px !important; height: 16px !important; }
${ROOT} #ytkit-split-close:hover {
    border-color: rgba(255, 255, 255, 0.3) !important;
    background: rgba(24, 24, 28, 0.86) !important;
    transform: translateY(-1px) !important;
}
${ROOT} #ytkit-split-close:active { transform: translateY(0) scale(0.96) !important; }
${ROOT} #ytkit-split-close:focus-visible {
    outline: 2px solid var(--ytkit-split-accent) !important;
    outline-offset: 2px !important;
}

${ROOT} #ytkit-split-collapse-strip {
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    height: 20px !important;
    z-index: 10002 !important;
    cursor: n-resize !important;
    background: transparent !important;
    pointer-events: auto !important;
}
${ROOT} #ytkit-split-collapse-strip::after {
    content: '' !important;
    display: block !important;
    width: 36px !important;
    height: 4px !important;
    margin: 8px auto 0 !important;
    border-radius: 0 !important;
    background: var(--ytkit-split-border-strong) !important;
    transition: background-color 160ms var(--ytkit-split-ease), width 160ms var(--ytkit-split-ease) !important;
}
${ROOT} #ytkit-split-collapse-strip:hover::after { width: 48px !important; background: var(--ytkit-split-accent) !important; }

${PANE} {
    /* YouTube paints fades and expanders with its own surface tokens, and an
       ancestor can scope them to another value than <html> holds (the watch
       restyle does; OLED sets them on <html>). Inside the pane they follow the
       split, so no native band ever differs from the panel. */
    --yt-spec-base-background: var(--ytkit-split-panel);
    --yt-spec-general-background-a: var(--ytkit-split-panel);
    --yt-spec-raised-background: var(--ytkit-split-raised);
    --yt-spec-text-primary: var(--ytkit-split-text);
    --yt-spec-text-secondary: var(--ytkit-split-muted);
    border-inline-start: 1px solid var(--ytkit-split-hairline) !important;
    background: var(--ytkit-split-panel) !important;
    color: var(--ytkit-split-text) !important;
    color-scheme: inherit !important;
    scrollbar-width: thin !important;
    scrollbar-color: var(--ytkit-split-scrollbar) transparent !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
    overflow-x: clip !important;
    font-size: 14px !important;
}
${PANE}::-webkit-scrollbar { width: 8px; }
${PANE}::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 4px;
    background: var(--ytkit-split-scrollbar) padding-box;
}
${PANE} yt-formatted-string { max-width: 100% !important; overflow-wrap: anywhere !important; }
${PANE} :is(ytd-item-section-renderer, ytd-item-section-renderer > #contents) {
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
}

${ROOT} :is(ytd-live-chat-frame, #chat)[style*="position"] {
    min-height: 0 !important;
    max-height: none !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    border-inline-start: 1px solid var(--ytkit-split-hairline) !important;
    background: var(--ytkit-split-panel) !important;
    scrollbar-width: thin !important;
    scrollbar-color: var(--ytkit-split-scrollbar) transparent !important;
}
${ROOT} :is(ytd-live-chat-frame, #chat)[style*="position"] iframe {
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
}
${ROOT} :is(ytd-live-chat-frame, #chat)[style*="position"] #container {
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    max-height: none !important;
    border-radius: 0 !important;
}
${ROOT} :is(ytd-live-chat-frame, #chat)[style*="position"] #show-hide-button { display: none !important; }
${ROOT} :is(ytd-live-chat-frame#chat, ytd-live-chat-frame) {
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
    max-height: none !important;
    visibility: visible !important;
}
${ROOT} #chat-container {
    display: block !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    visibility: visible !important;
}
${ROOT} :is(ytd-live-chat-frame#chat, ytd-live-chat-frame) > iframe {
    flex: 1 !important;
    height: 100% !important;
    min-height: 0 !important;
    max-height: none !important;
}
${ROOT} ytd-watch-flexy.loading ytd-live-chat-frame#chat,
${ROOT} ytd-watch-flexy:not([ghost-cards-enabled]).loading #chat { visibility: visible !important; }
`;
    }

    function buildSplitMetaCss() {
        return `
${META} {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    min-height: 0 !important;
    margin: 0 0 20px !important;
    padding: 0 0 20px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--ytkit-split-hairline) !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
}
${META} :is(#above-the-fold, .item) { margin: 0 !important; padding: 0 !important; }
${META} #above-the-fold {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    row-gap: 14px !important;
    min-width: 0 !important;
}

${META} #title {
    position: relative !important;
    z-index: 60 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    row-gap: 10px !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
    overflow: visible !important;
}
${META} #title:has(#ytkit-po-logo-wrap.ytkit-ql-open) { z-index: 2147483646 !important; }
${META} #title h1,
${META} h1.ytd-watch-metadata {
    order: 1 !important;
    display: block !important;
    min-width: 0 !important;
    max-width: 100% !important;
    max-inline-size: 100% !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    color: var(--ytkit-split-text) !important;
    font-family: "YouTube Sans", Roboto, Arial, sans-serif !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    font-style: normal !important;
    line-height: 1.3 !important;
    letter-spacing: 0 !important;
    text-align: start !important;
    text-transform: none !important;
    text-shadow: none !important;
    text-wrap: pretty !important;
    white-space: normal !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    -webkit-line-clamp: unset !important;
}
${META} #title :is(yt-formatted-string, yt-attributed-string, .yt-core-attributed-string, .yt-core-attributed-string--white-space-pre-wrap) {
    display: inline !important;
    max-width: 100% !important;
    max-inline-size: 100% !important;
    overflow-wrap: anywhere !important;
    color: inherit !important;
    -webkit-text-fill-color: currentColor !important;
    font: inherit !important;
    letter-spacing: inherit !important;
    white-space: normal !important;
    -webkit-line-clamp: unset !important;
}

${META} #title .ytkit-split-title-bar {
    order: 2 !important;
    position: relative !important;
    z-index: 5 !important;
    display: grid !important;
    grid-template-columns: auto auto minmax(0, 1fr) !important;
    grid-template-areas: "home actions date" !important;
    align-items: center !important;
    gap: 6px !important;
    min-width: 0 !important;
    margin: 0 !important;
}
${META} #title .ytkit-split-youtube-link {
    grid-area: home !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: var(--ytkit-split-control-h) !important;
    height: var(--ytkit-split-control-h) !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-control) !important;
    color: #ff0033 !important;
    box-shadow: none !important;
    text-decoration: none !important;
    transition: background-color 160ms var(--ytkit-split-ease), transform 160ms var(--ytkit-split-ease) !important;
}
${META} #title .ytkit-split-youtube-link svg { display: block !important; width: 22px !important; height: 16px !important; color: #ff0033 !important; }
${META} #title .ytkit-split-youtube-link path { fill: #ffffff !important; }
${META} #title .ytkit-split-youtube-link:hover { background: var(--ytkit-split-control-hover) !important; }
${META} #title .ytkit-split-youtube-link:active { transform: scale(0.96) !important; background: var(--ytkit-split-control-active) !important; }
${META} #title .ytkit-split-header-actions {
    grid-area: actions !important;
    position: relative !important;
    z-index: 30 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    min-width: 0 !important;
}
${META} #title .ytkit-split-header-actions[hidden] { display: none !important; }
${META} #title #ytkit-po-logo-wrap {
    position: relative !important;
    z-index: 30 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 2px !important;
    margin: 0 !important;
    padding: 0 !important;
}
${META} #title #ytkit-po-logo-wrap.ytkit-ql-open { z-index: 2147483647 !important; }
${META} #title #ytkit-po-logo-wrap::before { content: none !important; display: none !important; }
${META} #title #ytkit-po-logo-wrap :is(.ytkit-ql-launcher--player, .ytkit-ql-toggle) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: var(--ytkit-split-control-h) !important;
    min-width: var(--ytkit-split-control-h) !important;
    height: var(--ytkit-split-control-h) !important;
    min-height: var(--ytkit-split-control-h) !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-control) !important;
    color: var(--ytkit-split-text) !important;
    box-shadow: none !important;
    transition: background-color 160ms var(--ytkit-split-ease) !important;
}
${META} #title #ytkit-po-logo-wrap .ytkit-ql-toggle { width: 24px !important; min-width: 24px !important; }
${META} #title #ytkit-po-logo-wrap :is(.ytkit-ql-launcher--player, .ytkit-ql-toggle):hover { background: var(--ytkit-split-control-hover) !important; }
${META} #title #ytkit-po-logo-wrap :is(.ytkit-ql-launcher-glyph, .ytkit-ql-launcher-glyph svg) { width: 16px !important; height: 16px !important; }
${META} #title #ytkit-po-logo-wrap .ytkit-ql-drop {
    top: calc(100% + 8px) !important;
    right: auto !important;
    bottom: auto !important;
    left: 0 !important;
    z-index: 2147483647 !important;
    min-width: 232px !important;
    max-width: min(260px, calc(100vw - 34px)) !important;
    max-height: min(440px, calc(100vh - 92px)) !important;
    overflow: auto !important;
    transform-origin: top left !important;
}
${META} #title .ytkit-split-upload-meta {
    grid-area: date !important;
    justify-self: end !important;
    display: flex !important;
    flex-wrap: wrap !important;
    justify-content: flex-end !important;
    align-items: baseline !important;
    column-gap: 6px !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
    color: var(--ytkit-split-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    line-height: 1.35 !important;
    text-align: end !important;
    font-variant-numeric: tabular-nums !important;
}
${META} #title :is(.ytkit-split-upload-date, .ytkit-split-view-count) {
    display: inline !important;
    color: inherit !important;
    -webkit-text-fill-color: currentColor !important;
    font: inherit !important;
    white-space: nowrap !important;
}
${META} #title .ytkit-split-upload-date:not([hidden]):not(:empty) ~ .ytkit-split-view-count:not([hidden]):not(:empty)::before {
    content: '${MIDDOT}' !important;
    margin-inline-end: 6px !important;
}
${META} #title :is(.ytkit-split-upload-meta, .ytkit-split-upload-date, .ytkit-split-view-count):is([hidden], :empty) { display: none !important; }

${META} #top-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    row-gap: 12px !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
    overflow: visible !important;
}
${META} #owner {
    container: ytkit-split-owner / inline-size !important;
    position: relative !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    grid-template-areas: "owner sub" "actions actions" !important;
    align-items: center !important;
    gap: 12px 12px !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
    overflow: visible !important;
}
${META} #owner:not(:has(#subscribe-button *)) { grid-template-areas: "owner owner" "actions actions" !important; }
${META} #owner ytd-video-owner-renderer {
    grid-area: owner !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    min-width: 0 !important;
    margin: 0 !important;
}
${META} #owner ytd-video-owner-renderer :is(#avatar, #avatar img, #avatar yt-img-shadow) {
    display: block !important;
    flex: 0 0 auto !important;
    width: 40px !important;
    height: 40px !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    visibility: visible !important;
    opacity: 1 !important;
}
${META} #owner #upload-info {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    min-width: 0 !important;
}
${META} #owner :is(ytd-channel-name, ytd-channel-name #container) {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    min-width: 0 !important;
    max-width: 100% !important;
}
${META} #owner :is(#channel-name, #channel-name a, #channel-name #text) {
    min-width: 0 !important;
    color: var(--ytkit-split-text) !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    line-height: 1.25 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}
${META} #owner #channel-name ytd-badge-supported-renderer { display: inline-flex !important; flex: 0 0 auto !important; margin: 0 !important; color: var(--ytkit-split-muted) !important; }
${META} #owner :is(#owner-sub-count, #owner-sub-count yt-formatted-string) {
    display: block !important;
    margin: 0 !important;
    color: var(--ytkit-split-muted) !important;
    font-size: 12px !important;
    line-height: 1.3 !important;
    white-space: nowrap !important;
    opacity: 1 !important;
}
${META} #owner #subscribe-button { grid-area: sub !important; justify-self: end !important; align-self: center !important; margin: 0 !important; }
/* The bell opens a native dropdown; a clipped or inert ancestor, or the dock
   painting over it, kept that menu from opening. */
${META} #owner :is(#subscribe-button, #notification-preference-button, #notification-preference-button *) {
    overflow: visible !important;
    pointer-events: auto !important;
}
${META} #owner #notification-preference-button { position: relative !important; z-index: 40 !important; }
/* Before you subscribe, YouTube keeps the bell laid out but invisible; in
   the dock that reserved an empty 150px slot and pushed the row onto two lines. */
${META} #owner #notification-preference-button[invisible] { display: none !important; }
${META} #owner #subscribe-button:not(:has(*)) { display: none !important; }
${META} #owner :is(#subscribe-button, #notification-preference-button) ${BUTTON} {
    height: var(--ytkit-split-control-h) !important;
    min-height: var(--ytkit-split-control-h) !important;
    padding: 0 14px !important;
    border-radius: var(--ytkit-split-radius) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
}
${META} #owner #subscribe-button ${BUTTON}:is(.yt-spec-button-shape-next--filled, .ytSpecButtonShapeNextFilled) {
    background: var(--ytkit-split-text) !important;
    color: var(--ytkit-split-panel) !important;
}
${META} #owner > #ytkit-watch-btn { display: none !important; }
${META} #owner > :is(#ytkit-page-btn-watch, #notification-preference-button) { grid-area: actions !important; justify-self: start !important; }

${META} #owner .ytkit-split-owner-actions {
    grid-area: actions !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 8px !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
}
${META} #owner .ytkit-split-owner-actions > * { flex: 0 0 auto !important; margin: 0 !important; transform: none !important; }
${META} #owner .ytkit-split-owner-actions > :is(segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer, like-button-view-model) { order: 1 !important; }
${META} #owner .ytkit-split-owner-actions > .ytkit-local-dl-btn { order: 2 !important; }
${META} #owner .ytkit-split-owner-actions > #notification-preference-button { order: 3 !important; }
${META} #owner .ytkit-split-owner-actions > :is(#ytkit-page-btn-watch, #ytkit-watch-btn) { order: 4 !important; }

${META} :is(#owner, #actions) ${BUTTON},
${META} #owner :is(.ytkit-local-dl-btn, .ytkit-trigger-btn) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    height: var(--ytkit-split-control-h) !important;
    min-height: var(--ytkit-split-control-h) !important;
    min-width: var(--ytkit-split-control-h) !important;
    margin: 0 !important;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-control) !important;
    background-image: none !important;
    color: var(--ytkit-split-text) !important;
    -webkit-text-fill-color: currentColor !important;
    box-shadow: none !important;
    font-family: Roboto, Arial, sans-serif !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    opacity: 1 !important;
    cursor: pointer !important;
    transition: background-color 160ms var(--ytkit-split-ease), color 160ms var(--ytkit-split-ease), transform 120ms var(--ytkit-split-ease) !important;
}
${META} #owner .ytkit-trigger-btn,
${META} #owner ${BUTTON}:is(.yt-spec-button-shape-next--icon-button, .ytSpecButtonShapeNextIconButton) { width: var(--ytkit-split-control-h) !important; padding: 0 !important; }
${META} :is(#owner, #actions) ${BUTTON}:hover,
${META} #owner :is(.ytkit-local-dl-btn, .ytkit-trigger-btn):hover { background: var(--ytkit-split-control-hover) !important; }
${META} :is(#owner, #actions) ${BUTTON}:active,
${META} #owner :is(.ytkit-local-dl-btn, .ytkit-trigger-btn):active { background: var(--ytkit-split-control-active) !important; transform: scale(0.97) !important; }
${META} :is(#owner, #actions) ${BUTTON}[aria-pressed="true"] { background: var(--ytkit-split-accent-soft) !important; color: var(--ytkit-split-accent-ink) !important; }
${META} :is(#owner, #actions) ${BUTTON}:is([disabled], [aria-disabled="true"]) { opacity: 0.45 !important; cursor: default !important; transform: none !important; }
${META} :is(#owner, #actions) ${BUTTON}:focus-visible,
${META} #owner :is(.ytkit-local-dl-btn, .ytkit-trigger-btn):focus-visible,
${META} #title :is(.ytkit-split-youtube-link, .ytkit-ql-launcher--player, .ytkit-ql-toggle):focus-visible {
    outline: 2px solid var(--ytkit-split-accent) !important;
    outline-offset: 2px !important;
}
${META} :is(#owner, #actions) ${BUTTON} * { background: transparent !important; color: inherit !important; -webkit-text-fill-color: currentColor !important; opacity: 1 !important; }
${META} :is(#owner, #actions, .ytkit-split-owner-actions) :is(svg, path) { fill: currentColor !important; }
${META} :is(#owner, #actions) :is(.ytSpecButtonShapeNextIcon, .yt-spec-button-shape-next__icon, yt-icon, .ytIconWrapperHost, .yt-icon-shape) {
    width: 20px !important;
    height: 20px !important;
    margin: 0 !important;
}
${META} :is(#owner, #actions) :is(.ytIconWrapperHost, .yt-icon-shape) svg { width: 100% !important; height: 100% !important; }
${META} #owner :is(.ytkit-local-dl-btn svg, .ytkit-trigger-btn svg, .ytkit-watch-action-btn__icon) { width: 16px !important; height: 16px !important; }
${META} :is(#owner, #actions) :is(yt-touch-feedback-shape, .ytSpecTouchFeedbackShapeHost, yt-interaction) { display: none !important; }

${META} :is(segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer) :is(.ytSegmentedLikeDislikeButtonViewModelSegmentedButtonsWrapper, #segmented-buttons-wrapper) {
    display: inline-flex !important;
    gap: 1px !important;
    border-radius: var(--ytkit-split-radius) !important;
    overflow: hidden !important;
}
${META} :is(like-button-view-model, #segmented-like-button) ${BUTTON} { border-radius: var(--ytkit-split-radius) 0 0 var(--ytkit-split-radius) !important; padding-inline: 12px 14px !important; }
${META} :is(dislike-button-view-model, #segmented-dislike-button) ${BUTTON} { border-radius: 0 var(--ytkit-split-radius) var(--ytkit-split-radius) 0 !important; width: 40px !important; padding: 0 !important; }
${META} :is(like-button-view-model, #segmented-like-button):only-child ${BUTTON} { border-radius: var(--ytkit-split-radius) !important; }
${META} :is(segmented-like-dislike-button-view-model, ytd-segmented-like-dislike-button-renderer) .ytSpecButtonShapeNextButtonTextContent { font-variant-numeric: tabular-nums !important; }

${META} #actions,
${META} #actions.ytd-watch-metadata {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
}
${META} :is(#actions-inner, #actions ytd-menu-renderer, #top-level-buttons-computed, #flexible-item-buttons) {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 8px !important;
    max-width: 100% !important;
    overflow: visible !important;
}
${META} #actions :is(yt-button-shape, yt-button-view-model, ytd-button-renderer, ytd-toggle-button-renderer) { transform: none !important; margin: 0 !important; }
${META} #top-row[data-ytkit-split-actions-docked="1"] > #actions { display: none !important; }

${META} #bottom-row { margin: 0 !important; padding: 0 !important; }
${META} :is(#description, #description.ytd-watch-metadata) {
    margin: 0 !important;
    padding: 12px 14px !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-raised) !important;
    box-shadow: none !important;
    transition: background-color 160ms var(--ytkit-split-ease) !important;
}
${META} #description:hover { background: var(--ytkit-split-hover) !important; }
${META} :is(#description-inner, #description ytd-text-inline-expander, #description-inline-expander) {
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
    box-shadow: none !important;
}
${META} #description :is(ytd-watch-info-text, #info-container) {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 2px 8px !important;
    margin: 0 0 6px !important;
    color: var(--ytkit-split-text) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
}
${META} #description ytd-watch-info-text:not(:has(#info-container *:not(:empty))) { display: none !important; }
${META} #description :is(#snippet, #plain-snippet-text, #attributed-snippet-text, yt-attributed-string, .yt-core-attributed-string) {
    color: var(--ytkit-split-text) !important;
    -webkit-text-fill-color: currentColor !important;
    font-size: 13px !important;
    line-height: 1.55 !important;
    overflow-wrap: anywhere !important;
}
${META} #description :is(#snippet, #plain-snippet-text, #attributed-snippet-text) span:not(a, a *) { color: inherit !important; -webkit-text-fill-color: currentColor !important; }
${META} #description :is(#snippet, #attributed-snippet-text) a { color: var(--ytkit-split-accent-ink) !important; -webkit-text-fill-color: currentColor !important; }
${META} #description :is(#expand, #collapse, tp-yt-paper-button#expand, tp-yt-paper-button#collapse) {
    justify-content: flex-start !important;
    margin: 6px 0 0 !important;
    text-align: start !important;
    padding: 0 !important;
    color: var(--ytkit-split-accent-ink) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    text-transform: none !important;
}
${META} #description :is(#expand, #collapse):focus-visible { outline: 2px solid var(--ytkit-split-accent) !important; outline-offset: 2px !important; border-radius: 4px !important; }

${ROOT} .ytkit-split-live-header {
    border-bottom: 1px solid var(--ytkit-split-hairline) !important;
    background: var(--ytkit-split-panel) !important;
    color: var(--ytkit-split-text) !important;
    box-shadow: none !important;
    overflow: hidden !important;
}
${ROOT} .ytkit-split-live-card {
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-raised) !important;
    box-shadow: none !important;
    overflow: hidden !important;
}
${ROOT} :is(.ytkit-split-live-channel, .ytkit-split-live-title) {
    color: var(--ytkit-split-text) !important;
    -webkit-text-fill-color: currentColor !important;
}
${ROOT} .ytkit-split-live-channel { font-weight: 600 !important; }
${ROOT} .ytkit-split-live-title {
    display: -webkit-box !important;
    max-height: 2.6em !important;
    font-weight: 700 !important;
    line-height: 1.3 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
}
${ROOT} :is(.ytkit-split-live-date, .ytkit-split-live-meta) { color: var(--ytkit-split-muted) !important; -webkit-text-fill-color: currentColor !important; }
${ROOT} .ytkit-split-live-view-count {
    border: 0 !important;
    border-radius: var(--ytkit-split-radius-sm) !important;
    background: var(--ytkit-split-hover) !important;
    color: var(--ytkit-split-text) !important;
    -webkit-text-fill-color: currentColor !important;
    font-variant-numeric: tabular-nums !important;
}
${ROOT} .ytkit-split-live-badge {
    border-radius: 4px !important;
    background: #cc0000 !important;
    color: #ffffff !important;
    -webkit-text-fill-color: currentColor !important;
}
${ROOT} :is([data-ytkit-split-live-pinned="1"], [data-ytkit-split-live-pinned="1"] *) { color: var(--ytkit-split-text) !important; -webkit-text-fill-color: currentColor !important; }
${ROOT} [data-ytkit-split-live-pinned="1"] ${BUTTON} {
    height: var(--ytkit-split-control-h) !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-control) !important;
    color: var(--ytkit-split-text) !important;
    -webkit-text-fill-color: var(--ytkit-split-text) !important;
    box-shadow: none !important;
}
${ROOT} [data-ytkit-split-live-pinned="1"] ${BUTTON}:hover { background: var(--ytkit-split-control-hover) !important; }
${ROOT} [data-ytkit-split-live-pinned="1"] ${BUTTON}:focus-visible { outline: 2px solid var(--ytkit-split-accent) !important; outline-offset: 2px !important; }
${ROOT} [data-ytkit-split-live-pinned="1"] :is(svg, path) { fill: currentColor !important; }
`;
    }

    function buildSplitCommentsCss() {
        const COMMENT = `${PANE} :is(ytd-comment-view-model, ytd-comment-renderer)`;
        const TOOLBAR = `${PANE} ytd-comment-engagement-bar #toolbar#toolbar`;
        return `
${PANE} ytd-comments#comments {
    display: block !important;
    margin: 0 !important;
    padding: 0 0 48px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: none !important;
    box-shadow: none !important;
}

${PANE} ytd-comments-header-renderer {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 0 !important;
    min-height: 0 !important;
    margin: 0 0 24px !important;
    padding: 0 !important;
    border: 0 !important;
}
${PANE} ytd-comments-header-renderer :is(#title, #leading-section, #additional-section) {
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    min-width: 0 !important;
    margin: 0 !important;
}
${PANE} ytd-comments-header-renderer #title { justify-content: flex-start !important; gap: 12px !important; }
${PANE} ytd-comments-header-renderer :is(#count, yt-formatted-string.count-text) {
    display: inline-flex !important;
    align-items: baseline !important;
    gap: 0.3em !important;
    margin: 0 !important;
    color: var(--ytkit-split-text) !important;
    font-size: 16px !important;
    font-weight: 700 !important;
    line-height: 1.2 !important;
    white-space: nowrap !important;
    opacity: 1 !important;
    font-variant-numeric: tabular-nums !important;
}
${PANE} ytd-comments-header-renderer yt-formatted-string.count-text > span { display: inline-block !important; }
${PANE} ytd-comments-header-renderer #count::before { content: none !important; display: none !important; }
${PANE} ytd-comments-header-renderer :is(#sort-menu, yt-sort-filter-sub-menu-renderer) {
    display: inline-flex !important;
    margin: 0 !important;
    opacity: 1 !important;
}
${PANE} ytd-comments-header-renderer :is(#sort-menu, yt-sort-filter-sub-menu-renderer) :is(tp-yt-paper-button, button, #label) {
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    height: var(--ytkit-split-control-h) !important;
    min-height: var(--ytkit-split-control-h) !important;
    margin: 0 !important;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: transparent !important;
    color: var(--ytkit-split-text) !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    transition: background-color 160ms var(--ytkit-split-ease) !important;
}
${PANE} ytd-comments-header-renderer :is(#sort-menu, yt-sort-filter-sub-menu-renderer) :is(tp-yt-paper-button, button, #label):hover { background: var(--ytkit-split-control-hover) !important; }
${PANE} ytd-comments-header-renderer :is(#sort-menu, yt-sort-filter-sub-menu-renderer) :is(tp-yt-paper-button, button, #label):focus-visible { outline: 2px solid var(--ytkit-split-accent) !important; outline-offset: 2px !important; }
${PANE} ytd-comments-header-renderer :is(#sort-menu, yt-sort-filter-sub-menu-renderer) :is(#icon-label, #label-icon, yt-icon, svg, path) {
    color: inherit !important;
    fill: currentColor !important;
    -webkit-text-fill-color: currentColor !important;
}
${PANE} ytd-comments-header-renderer :is(#sort-menu, yt-sort-filter-sub-menu-renderer) yt-icon { width: 20px !important; height: 20px !important; }

${PANE} ytd-comments-header-renderer :is(ytd-comment-simplebox-renderer, #simple-box) {
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
}
${PANE} ytd-comments-header-renderer #simple-box { margin-top: 16px !important; }
${PANE} ytd-comment-simplebox-renderer #thumbnail-input-row {
    display: grid !important;
    grid-template-columns: 32px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 12px !important;
    width: 100% !important;
}
${PANE} ytd-comment-simplebox-renderer :is(#author-thumbnail, #avatar, #author-thumbnail img, #avatar img, #author-thumbnail yt-img-shadow, #avatar yt-img-shadow) {
    width: 32px !important;
    height: 32px !important;
    margin: 0 !important;
    border-radius: var(--ytkit-split-radius-sm) !important;
}
${PANE} ytd-comment-simplebox-renderer :is(#main, #creation-box, #input-container, tp-yt-paper-input-container, #contenteditable-root) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    box-sizing: border-box !important;
}
${PANE} ytd-comment-simplebox-renderer #placeholder-area {
    display: flex !important;
    align-items: center !important;
    width: 100% !important;
    min-height: 40px !important;
    margin: 0 !important;
    padding: 0 14px !important;
    border: 1px solid transparent !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: var(--ytkit-split-raised) !important;
    color: var(--ytkit-split-muted) !important;
    font-size: 14px !important;
    box-sizing: border-box !important;
    cursor: text !important;
    transition: background-color 160ms var(--ytkit-split-ease), border-color 160ms var(--ytkit-split-ease) !important;
}
${PANE} ytd-comment-simplebox-renderer #placeholder-area:hover { background: var(--ytkit-split-hover) !important; }
${PANE} ytd-comment-simplebox-renderer #placeholder-area:focus-within { border-color: var(--ytkit-split-accent) !important; }
/* Once the composer opens, the placeholder row is stale and the editor needs
   the full width. */
${PANE} ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) > #thumbnail-input-row { display: none !important; }
${PANE} ytd-comment-simplebox-renderer:has(> #comment-dialog:not([hidden])) {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
}
${PANE} ytd-comment-simplebox-renderer #comment-dialog :is(ytd-commentbox, #main, #creation-box) {
    width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
}
${PANE} ytd-commentbox #contenteditable-root {
    color: var(--ytkit-split-text) !important;
    font-size: 14px !important;
    line-height: 1.5 !important;
    caret-color: var(--ytkit-split-accent) !important;
}
${PANE} ytd-commentbox :is(#cancel-button, #submit-button) ${BUTTON} {
    height: var(--ytkit-split-control-h) !important;
    padding: 0 14px !important;
    border-radius: var(--ytkit-split-radius) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
}
${PANE} ytd-commentbox #submit-button ${BUTTON}:not([disabled]):not([aria-disabled="true"]) { background: var(--ytkit-split-accent-ink) !important; color: var(--ytkit-split-panel) !important; }
${PANE} ytd-commentbox :is(#cancel-button, #submit-button) ${BUTTON}:focus-visible { outline: 2px solid var(--ytkit-split-accent) !important; outline-offset: 2px !important; }

${PANE} ytd-comment-thread-renderer {
    display: block !important;
    margin: 0 !important;
    padding: 0 0 20px !important;
    border: 0 !important;
    background: none !important;
    content-visibility: auto !important;
    contain-intrinsic-size: auto 180px !important;
}
${PANE} ytd-comment-thread-renderer div.thread-hitbox { display: none !important; }
${COMMENT} {
    display: block !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
}
${COMMENT} > #body {
    position: relative !important;
    display: grid !important;
    grid-template-columns: 32px minmax(0, 1fr) auto !important;
    align-items: start !important;
    column-gap: 12px !important;
    margin: 0 !important;
    padding: 0 !important;
}
${COMMENT} #author-thumbnail {
    position: relative !important;
    width: 32px !important;
    height: auto !important;
    margin: 0 !important;
}
${COMMENT} :is(#author-thumbnail-button, #author-thumbnail a) { display: block !important; padding: 0 !important; border-radius: var(--ytkit-split-radius-sm) !important; }
${COMMENT} :is(#author-thumbnail img, #author-thumbnail yt-img-shadow) {
    display: block !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: var(--ytkit-split-radius-sm) !important;
}
${COMMENT} #author-thumbnail .threadline { border-color: var(--ytkit-split-hairline) !important; }
${COMMENT} > #body > #main { min-width: 0 !important; margin: 0 !important; padding: 0 !important; }
${COMMENT} #header { margin: 0 0 4px !important; padding: 0 !important; }
${COMMENT} #header-author {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: baseline !important;
    gap: 2px 8px !important;
    margin: 0 !important;
}
${COMMENT} #header-author h3 { margin: 0 !important; }
${COMMENT} #author-text,
${COMMENT} #author-text span {
    color: var(--ytkit-split-text) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    line-height: 1.3 !important;
    text-decoration: none !important;
}
${COMMENT} #author-text.ytd-comment-view-model[href] { border-radius: 4px !important; }
${COMMENT} :is(#published-time-text, #published-time-text a) {
    color: var(--ytkit-split-muted) !important;
    font-size: 12px !important;
    line-height: 1.3 !important;
    text-decoration: none !important;
}
${COMMENT} #pinned-comment-badge :is(ytd-pinned-comment-badge-renderer, #badge, .badge) {
    color: var(--ytkit-split-muted) !important;
    font-size: 12px !important;
}
${COMMENT} ytd-author-comment-badge-renderer { font-size: 12px !important; }
${COMMENT} #author-comment-badge { margin: 0 !important; }
/* A verified or creator author shows as a chip. Its text color and fill come
   from here too: YouTube pairs the creator chip's dark text with its own
   background, so recoloring one without the other made it unreadable. */
${COMMENT} ytd-author-comment-badge-renderer {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 1px 8px !important;
    border-radius: var(--ytkit-split-radius-sm) !important;
    background: var(--ytkit-split-control) !important;
    color: var(--ytkit-split-text) !important;
}
${COMMENT} ytd-author-comment-badge-renderer[creator] {
    background: var(--ytkit-split-text) !important;
    color: var(--ytkit-split-panel) !important;
}
${COMMENT} ytd-author-comment-badge-renderer *:not(tp-yt-paper-tooltip, tp-yt-paper-tooltip *) { color: inherit !important; -webkit-text-fill-color: currentColor !important; }
${COMMENT} ytd-author-comment-badge-renderer :is(yt-icon, svg, path) { color: inherit !important; fill: currentColor !important; }
${COMMENT} :is(#content-text, #content-text span) {
    margin: 0 !important;
    padding: 0 !important;
    color: var(--ytkit-split-text) !important;
    font-size: 14px !important;
    line-height: 1.5 !important;
    overflow-wrap: anywhere !important;
}
${COMMENT} #content-text a { color: var(--ytkit-split-accent-ink) !important; }
/* The split's wheel and autoscroll handling runs on this pane; comment text
   stays selectable, and YouTube's invisible thread hitbox stays out of the way. */
${COMMENT} :is(#content-text, #content-text *, yt-core-attributed-string, .yt-core-attributed-string) {
    -webkit-user-select: text !important;
    user-select: text !important;
    cursor: text !important;
    pointer-events: auto !important;
}
${COMMENT} #content-text a { cursor: pointer !important; }
${PANE} .thread-hitbox.style-scope.ytd-comment-thread-renderer { display: none !important; pointer-events: none !important; }
${COMMENT} ytd-expander :is(#more, #less, tp-yt-paper-button) {
    margin: 4px 0 0 !important;
    padding: 0 !important;
    color: var(--ytkit-split-muted) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    text-transform: none !important;
}

${PANE} ytd-comment-engagement-bar#action-buttons,
${PANE} #action-buttons.ytd-comment-view-model { margin: 4px 0 0 -8px !important; padding: 0 !important; }
${PANE} ytd-comment-engagement-bar #toolbar {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 8px !important;
    column-gap: 0 !important;
    min-height: var(--ytkit-split-control-h) !important;
    margin: 0 !important;
    padding: 0 !important;
}
${TOOLBAR} > :is(#like-button, #dislike-button, #reply-button-end, #creator-heart-button, #creator-heart) {
    display: inline-flex !important;
    align-items: center !important;
    height: 32px !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
}
${TOOLBAR} > :is(#like-button, #dislike-button, #reply-button-end) > :is(yt-button-shape, ytd-button-renderer, yt-icon-button) {
    display: inline-flex !important;
    height: 32px !important;
    margin: 0 !important;
}
/* :where() keeps the ids out of the specificity. With :is() this selector
   outranked the :hover, [aria-pressed] and disabled rules below, so Like and
   Dislike never showed any of those states. */
${TOOLBAR} ${BUTTON},
${TOOLBAR} :where(#like-button, #dislike-button) button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    width: auto !important;
    min-width: 32px !important;
    height: 32px !important;
    min-height: 32px !important;
    margin: 0 !important;
    padding: 0 8px !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: transparent !important;
    color: var(--ytkit-split-muted) !important;
    -webkit-text-fill-color: currentColor !important;
    box-shadow: none !important;
    opacity: 1 !important;
    cursor: pointer !important;
    transition: background-color 160ms var(--ytkit-split-ease), color 160ms var(--ytkit-split-ease), transform 120ms var(--ytkit-split-ease) !important;
}
${TOOLBAR} :is(#like-button, #dislike-button) ${BUTTON} { width: 32px !important; padding: 0 !important; }
${TOOLBAR} #reply-button-end ${BUTTON} {
    min-width: 48px !important;
    padding: 0 12px !important;
    color: var(--ytkit-split-text) !important;
    font-size: 13px !important;
    font-weight: 600 !important;
}
${TOOLBAR} ${BUTTON}:hover { background: var(--ytkit-split-control-hover) !important; color: var(--ytkit-split-text) !important; }
${TOOLBAR} ${BUTTON}:active { background: var(--ytkit-split-control-active) !important; transform: scale(0.96) !important; }
${TOOLBAR} ${BUTTON}[aria-pressed="true"] { background: var(--ytkit-split-accent-soft) !important; color: var(--ytkit-split-accent-ink) !important; }
${TOOLBAR} ${BUTTON}:is([disabled], [aria-disabled="true"]) { opacity: 0.45 !important; cursor: default !important; transform: none !important; }
${TOOLBAR} ${BUTTON}:focus-visible { outline: 2px solid var(--ytkit-split-accent) !important; outline-offset: 1px !important; }
${TOOLBAR} ${BUTTON} * { background: transparent !important; color: inherit !important; -webkit-text-fill-color: currentColor !important; }
${TOOLBAR} :is(.ytSpecButtonShapeNextIcon, .yt-spec-button-shape-next__icon, yt-icon, .ytIconWrapperHost, .yt-icon-shape) {
    width: 18px !important;
    height: 18px !important;
    margin: 0 !important;
}
${TOOLBAR} :is(.ytIconWrapperHost, .yt-icon-shape) svg { width: 100% !important; height: 100% !important; fill: currentColor !important; }
${TOOLBAR} :is(yt-touch-feedback-shape, .ytSpecTouchFeedbackShapeHost, yt-interaction) { display: none !important; }
${PANE} ytd-comment-engagement-bar #vote-count-middle {
    display: inline-flex !important;
    align-items: center !important;
    min-width: 0 !important;
    height: 32px !important;
    margin: 0 8px 0 -2px !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    color: var(--ytkit-split-muted) !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    font-variant-numeric: tabular-nums !important;
    pointer-events: none !important;
    transition: color 160ms var(--ytkit-split-ease) !important;
}
/* The count tucks 2px under the Like button, so it takes no input and reads
   as part of that control: it brightens on hover and takes the selected ink. */
${TOOLBAR} > #like-button:hover + #vote-count-middle { color: var(--ytkit-split-text) !important; }
${TOOLBAR} > #like-button:has(${BUTTON}[aria-pressed="true"]) + #vote-count-middle { color: var(--ytkit-split-accent-ink) !important; }
${PANE} ytd-comment-engagement-bar #vote-count-middle:empty { margin: 0 !important; }
${PANE} ytd-comment-engagement-bar #vote-count-middle::before,
${PANE} ytd-comment-engagement-bar #vote-count-middle::after {
    content: none !important;
    display: none !important;
    border: 0 !important;
    background: transparent !important;
}
${PANE} ytd-comment-engagement-bar #creator-heart-button :is(yt-interaction, #hearted-border) { display: none !important; }
${PANE} ytd-comment-engagement-bar #creator-heart-button :is(#hearted, #hearted svg) { width: 14px !important; height: 14px !important; color: #ff4e45 !important; fill: currentColor !important; }
${PANE} ytd-comment-engagement-bar #creator-heart-button #hearted-thumbnail {
    width: 18px !important;
    height: 18px !important;
    border-radius: 4px !important;
}

${COMMENT} > #body > #action-menu {
    align-self: start !important;
    margin: -4px -8px 0 0 !important;
    opacity: 0 !important;
    transition: opacity 160ms var(--ytkit-split-ease) !important;
}
${PANE} ytd-comment-thread-renderer :is(ytd-comment-view-model, ytd-comment-renderer):is(:hover, :focus-within) > #body > #action-menu,
${COMMENT} > #body > #action-menu:has([aria-expanded="true"]) { opacity: 1 !important; }
${COMMENT} > #body > #action-menu :is(yt-icon-button, button#button) {
    width: 32px !important;
    height: 32px !important;
    padding: 4px !important;
    border-radius: var(--ytkit-split-radius) !important;
    color: var(--ytkit-split-muted) !important;
}
${COMMENT} > #body > #action-menu button#button:hover { background: var(--ytkit-split-control-hover) !important; color: var(--ytkit-split-text) !important; }
${COMMENT} > #body > #action-menu button#button:focus-visible { outline: 2px solid var(--ytkit-split-accent) !important; outline-offset: 1px !important; }
${COMMENT} > #body > #action-menu yt-interaction { display: none !important; }

${PANE} ytd-comment-thread-renderer #replies { margin: 4px 0 0 !important; padding: 0 !important; }
${PANE} ytd-comment-replies-renderer {
    display: block !important;
    margin: 0 0 0 44px !important;
    padding: 0 !important;
}
${PANE} ytd-comment-replies-renderer ytd-comment-replies-renderer { margin-inline-start: 32px !important; }
${PANE} ytd-comment-replies-renderer :is(ytd-comment-view-model, ytd-comment-renderer) > #body { grid-template-columns: 24px minmax(0, 1fr) auto !important; column-gap: 10px !important; }
${PANE} ytd-comment-replies-renderer :is(ytd-comment-view-model, ytd-comment-renderer) :is(#author-thumbnail, #author-thumbnail img, #author-thumbnail yt-img-shadow) { width: 24px !important; height: 24px !important; border-radius: 4px !important; }
${PANE} ytd-comment-replies-renderer :is(#expander-contents, #contents) { margin: 0 !important; padding: 0 !important; }
${PANE} ytd-comment-replies-renderer :is(#expander-contents, #contents) > :is(ytd-comment-view-model, ytd-comment-renderer, yt-sub-thread) { margin-top: 12px !important; }
${PANE} ytd-comment-replies-renderer :is(.ytSubThreadConnection, .ytSubThreadContinuation) { border-color: var(--ytkit-split-hairline) !important; }
${PANE} ytd-comment-replies-renderer .ytSubThreadShadow { display: none !important; }
${PANE} ytd-comment-replies-renderer :is(#more-replies, #more-replies-sub-thread, #less-replies, #less-replies-sub-thread, .show-replies-button, .show-more-replies-button) {
    margin: 0 !important;
    padding: 0 !important;
}
${PANE} ytd-comment-replies-renderer :is(#more-replies, #more-replies-sub-thread, #less-replies, #less-replies-sub-thread, ytd-continuation-item-renderer) ${BUTTON} {
    display: inline-flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 6px !important;
    height: 32px !important;
    min-height: 32px !important;
    margin: 0 0 0 -12px !important;
    padding: 0 12px !important;
    border: 0 !important;
    border-radius: var(--ytkit-split-radius) !important;
    background: transparent !important;
    color: var(--ytkit-split-accent-ink) !important;
    -webkit-text-fill-color: currentColor !important;
    box-shadow: none !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    transition: background-color 160ms var(--ytkit-split-ease) !important;
}
${PANE} ytd-comment-replies-renderer :is(#more-replies, #more-replies-sub-thread, #less-replies, #less-replies-sub-thread, ytd-continuation-item-renderer) ${BUTTON}:hover { background: var(--ytkit-split-accent-soft) !important; }
${PANE} ytd-comment-replies-renderer :is(#more-replies, #more-replies-sub-thread, #less-replies, #less-replies-sub-thread, ytd-continuation-item-renderer) ${BUTTON}:focus-visible { outline: 2px solid var(--ytkit-split-accent) !important; outline-offset: 1px !important; }
${PANE} ytd-comment-replies-renderer :is(#more-replies, #more-replies-sub-thread, #less-replies, #less-replies-sub-thread, ytd-continuation-item-renderer) ${BUTTON} :is(yt-icon, .ytIconWrapperHost, .yt-icon-shape, svg) { width: 18px !important; height: 18px !important; fill: currentColor !important; }
${PANE} ytd-comment-replies-renderer :is(#more-replies, #more-replies-sub-thread, #less-replies, #less-replies-sub-thread) ${BUTTON} * { background: transparent !important; color: inherit !important; -webkit-text-fill-color: currentColor !important; }
${PANE} ytd-comment-replies-renderer :is(yt-touch-feedback-shape, .ytSpecTouchFeedbackShapeHost) { display: none !important; }
${PANE} :is(ytd-comment-replies-renderer, ytd-comments) ytd-continuation-item-renderer { margin: 8px 0 !important; }

@container ytkit-split-owner (max-width: 420px) {
    ${META} #owner .ytkit-split-owner-actions { gap: 6px !important; }
    ${META} #owner .ytkit-local-dl-btn { width: var(--ytkit-split-control-h) !important; padding: 0 !important; }
    ${META} #owner .ytkit-local-dl-btn .ytkit-watch-action-btn__label {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
        clip-path: inset(50%) !important;
        white-space: nowrap !important;
    }
}

@media (prefers-reduced-motion: reduce) {
    ${ROOT} :is(#ytkit-split-divider, #ytkit-split-divider::before, #ytkit-split-divider .ytkit-divider-pip, #ytkit-split-close, #ytkit-split-collapse-strip::after),
    ${PANE} :is(button, tp-yt-paper-button, a, #description, #placeholder-area, #action-menu, ${BUTTON_CLASSES}) {
        transition: none !important;
        transform: none !important;
    }
}

@media (forced-colors: active) {
    ${ROOT} #ytkit-split-divider { background: Canvas !important; forced-color-adjust: none !important; }
    ${ROOT} #ytkit-split-divider::before { background: CanvasText !important; }
    ${ROOT} #ytkit-split-divider .ytkit-divider-pip { border-color: ButtonText !important; background: ButtonFace !important; color: ButtonText !important; }
    ${ROOT} #ytkit-split-divider:is(:hover, :focus-visible) .ytkit-divider-pip { border-color: Highlight !important; background: Highlight !important; color: HighlightText !important; }
    ${ROOT} #ytkit-split-close { border: 1px solid ButtonText !important; background: ButtonFace !important; color: ButtonText !important; }
    ${PANE} :is(${BUTTON_CLASSES}, #placeholder-area, #description, .ytkit-local-dl-btn, .ytkit-trigger-btn) {
        border: 1px solid ButtonText !important;
        background: ButtonFace !important;
        color: ButtonText !important;
    }
    ${PANE} ${BUTTON}[aria-pressed="true"] { border-color: Highlight !important; background: Highlight !important; color: HighlightText !important; }
    ${ROOT} :is(#ytkit-split-close, #ytkit-split-divider .ytkit-divider-pip):focus-visible,
    ${PANE} :is(${BUTTON_CLASSES}, .ytkit-local-dl-btn, .ytkit-trigger-btn, a, tp-yt-paper-button):focus-visible { outline: 2px solid Highlight !important; }
    ${PANE} { border-inline-start: 1px solid CanvasText !important; }
}
`;
    }

    const api = Object.freeze({
        STYLE_IDS,
        buildSplitShellCss,
        buildSplitMetaCss,
        buildSplitCommentsCss
    });

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.stickyVideoStyles = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();
