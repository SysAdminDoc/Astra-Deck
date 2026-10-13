(() => {
    'use strict';

    // extension/features/home-subs-css/index.js
    //
    // v4.43.0 bundled peel for CSS-only "Home / Subscriptions"
    // features that share the cssFeature() helper's static-CSS
    // pattern. Each builder is parameter-less; the value of the peel
    // is centralising the CSS strings + their parity guards so a
    // future redesign (Premium-only thumbnail hover preview, etc.)
    // is a one-file edit instead of an inline literal hunt.
    //
    // Schema keys touched (all default off):
    //   hideCreateButton, hideVoiceSearch, widenSearchBar,
    //   disablePlayOnHover, fullWidthSubscriptions,
    //   hideSubscriptionOptions, listFeedLayout, fullTitles,
    //   viewsOnSeparateLine

    function buildHideCreateButtonCss() {
        const core = globalThis.YTKitCore;
        const chain = core?.getSurfaceHookSelectorChain?.('nav', 'createButton');
        if (Array.isArray(chain) && chain.length) return chain.join(', ');
        // The leading "+" glyph is stable across locales and is more
        // specific than the masthead button row, which also holds Sign in.
        return 'ytd-masthead #buttons ytd-button-renderer:has(path[d^="M12 3a1 1 0 00-1 1v7H4"])';
    }

    function buildHideVoiceSearchCss() {
        return '#voice-search-button';
    }

    function buildWidenSearchBarCss() {
        return `ytd-masthead yt-searchbox { margin-left: -180px; margin-right: -300px; }`;
    }

    function buildDisablePlayOnHoverCss() {
        return `ytd-video-preview, #preview, #mouseover-overlay,
                    ytd-moving-thumbnail-renderer,
                    ytd-thumbnail-overlay-loading-preview-renderer {
                        display: none !important;
                    }`;
    }

    function buildFullWidthSubscriptionsCss() {
        return `ytd-browse[page-subtype="subscriptions"] #grid-container.ytd-two-column-browse-results-renderer {
                        max-width: 100% !important;
                    }`;
    }

    function buildHideSubscriptionOptionsCss() {
        return 'ytd-browse[page-subtype="subscriptions"] ytd-rich-section-renderer:has(.grid-subheader)';
    }

    // The existing grid toggles own the feed workspace. The active-page guard
    // matters because YouTube retains hidden browse pages during SPA navigation.
    function buildFeedGridCss(page = 'home') {
        const feed = `ytd-browse[page-subtype="${page === 'subscriptions' ? 'subscriptions' : 'home'}"]`;
        const active = `html:has(ytd-page-manager > ${feed}:not([hidden]))`;
        const grid = `body:not(.ytkit-listFeedLayout) ${feed}:not([data-ytkit-subscription-view="list"]):not([data-ytkit-subscription-view="compact"])`;
        return `
${active} {
    --ytkit-feed-canvas: var(--ytkit-split-theme-canvas, #111214);
    --ytkit-feed-panel: var(--ytkit-split-theme-panel, #18191c);
    --ytkit-feed-text: var(--ytkit-split-theme-text, var(--ytkit-premium-text, #f1f1f1));
    --ytkit-feed-muted: var(--ytkit-split-theme-muted, var(--ytkit-premium-muted, #aaaaaa));
    --ytkit-feed-raised: color-mix(in srgb, var(--ytkit-feed-text) 6%, var(--ytkit-feed-panel));
    --ytkit-feed-hover: color-mix(in srgb, var(--ytkit-feed-text) 10%, var(--ytkit-feed-panel));
    --ytkit-feed-border: color-mix(in srgb, var(--ytkit-feed-text) 12%, transparent);
    --ytkit-feed-accent: var(--ytkit-split-theme-accent, #ff6259);
    --yt-spec-base-background: var(--ytkit-feed-canvas) !important;
    --yt-spec-brand-background-solid: var(--ytkit-feed-canvas) !important;
    --yt-spec-raised-background: var(--ytkit-feed-panel) !important;
    --yt-spec-menu-background: var(--ytkit-feed-panel) !important;
    --yt-spec-text-primary: var(--ytkit-feed-text) !important;
    --yt-spec-text-secondary: var(--ytkit-feed-muted) !important;
    --yt-spec-badge-chip-background: var(--ytkit-feed-raised) !important;
    --ytd-searchbox-background: var(--ytkit-feed-panel) !important;
    --ytd-searchbox-border-color: var(--ytkit-feed-border) !important;
    background: var(--ytkit-feed-canvas) !important;
    scrollbar-color: var(--ytkit-feed-border) transparent;
}
${active}:not([dark]) {
    --ytkit-feed-canvas: #f7f8fa;
    --ytkit-feed-panel: #ffffff;
    --ytkit-feed-text: var(--ytkit-premium-text, #172335);
    --ytkit-feed-muted: var(--ytkit-premium-muted, #536278);
}
${active} :is(body, ytd-app, ytd-page-manager, ytd-masthead #background, ytd-masthead #frosted-glass) {
    background: var(--ytkit-feed-canvas) !important;
}
${active} :is(#guide-content, #guide-inner-content, ytd-mini-guide-renderer) {
    background: var(--ytkit-feed-canvas) !important;
    border-inline-end: 1px solid var(--ytkit-feed-border) !important;
}
${active} ytd-guide-entry-renderer #endpoint {
    min-height: 42px !important;
    border-radius: 6px !important;
    transition: background-color 140ms ease !important;
}
${active} ytd-guide-entry-renderer[active] #endpoint {
    background: color-mix(in srgb, var(--ytkit-feed-accent) 10%, var(--ytkit-feed-panel)) !important;
    box-shadow: inset 3px 0 var(--ytkit-feed-accent) !important;
}
${active} ytd-guide-entry-renderer[active] yt-icon { color: var(--ytkit-feed-accent) !important; }
${active} ytd-guide-entry-renderer #endpoint:hover { background: var(--ytkit-feed-hover) !important; }
${active} ytd-masthead :is(.ytSearchboxComponentInputBox, #container.ytd-searchbox) {
    border: 1px solid var(--ytkit-feed-border) !important;
    border-radius: 8px 0 0 8px !important;
    background: var(--ytkit-feed-panel) !important;
    box-shadow: none !important;
}
${active} ytd-masthead :is(.ytSearchboxComponentInputBoxHasFocus, .ytSearchboxComponentInputBoxHasFocusDark, ytd-searchbox[has-focus] #container) {
    border-color: var(--ytkit-feed-accent) !important;
}
${active} ytd-masthead :is(.ytSearchboxComponentSearchButton, #search-icon-legacy) {
    border-color: var(--ytkit-feed-border) !important;
    border-radius: 0 8px 8px 0 !important;
    background: var(--ytkit-feed-raised) !important;
    color: var(--ytkit-feed-text) !important;
}
${active} ytd-masthead :is(.ytSearchboxComponentSuggestionsContainer, .ytSearchboxComponentSuggestionsContainerDark) {
    border: 1px solid var(--ytkit-feed-border) !important;
    border-radius: 8px !important;
    background: var(--ytkit-feed-panel) !important;
    color: var(--ytkit-feed-text) !important;
}
${feed} { background: var(--ytkit-feed-canvas) !important; }
${grid} #contents.ytd-rich-grid-renderer {
    display: grid !important;
    grid-template-columns: var(--ytkit-feed-columns, repeat(auto-fill, minmax(min(100%, 300px), 1fr))) !important;
    gap: 30px 20px !important;
    align-items: start !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 20px 24px 40px !important;
    box-sizing: border-box !important;
}
${grid} #contents.ytd-rich-grid-renderer > ytd-rich-grid-row,
${grid} #contents.ytd-rich-grid-renderer > ytd-rich-grid-row > #contents { display: contents !important; }
${grid} ytd-rich-item-renderer {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
}
${grid} ytd-rich-item-renderer.ytkit-video-hidden { display: none !important; }
${grid} #contents.ytd-rich-grid-renderer > :is(ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-continuation-item-renderer) {
    grid-column: 1 / -1 !important;
}
${feed} ytd-rich-item-renderer :is(yt-lockup-view-model, yt-lockup-metadata-view-model) { min-width: 0 !important; }
${feed} ytd-rich-item-renderer :is(yt-thumbnail-view-model, ytd-thumbnail, .ytThumbnailViewModelImage, .ytThumbnailViewModelImageAspectRatio16By9, .ytCoreImageHost, .ytLockupViewModelContentImage, .yt-lockup-view-model__content-image) {
    border-radius: 8px !important;
}
${feed} ytd-rich-item-renderer :is(yt-thumbnail-view-model, ytd-thumbnail) { overflow: hidden !important; }
${feed} ytd-rich-item-renderer :is(.ytLockupMetadataViewModelTitle, #video-title) {
    color: var(--ytkit-feed-text) !important;
    font-size: 16px !important;
    line-height: 1.4 !important;
    font-weight: 600 !important;
    letter-spacing: 0 !important;
    text-wrap: pretty !important;
}
${feed} ytd-rich-item-renderer :is(.ytLockupMetadataViewModelTitle, #video-title) .ytAttributedStringHost { font: inherit !important; }
${feed} ytd-rich-item-renderer :is(yt-lockup-metadata-view-model, #details.ytd-rich-grid-media) {
    padding-top: 12px !important;
    min-height: 0 !important;
    max-height: none !important;
}
${feed} ytd-rich-item-renderer :is(.ytContentMetadataViewModelMetadataText, #metadata-line) {
    color: var(--ytkit-feed-muted) !important;
    font-size: 13px !important;
    line-height: 1.5 !important;
}
${feed} ytd-rich-item-renderer :is(.ytLockupMetadataViewModelMenuButton, #menu) { border-radius: 6px !important; }
${feed} ytd-rich-item-renderer :is(.ytLockupMetadataViewModelMenuButton, #menu):hover { background: var(--ytkit-feed-hover) !important; }
${active} :is(ytd-guide-entry-renderer #endpoint, yt-chip-cloud-chip-renderer, ytd-masthead button, .ytLockupMetadataViewModelTitle):focus-visible {
    outline: 2px solid var(--ytkit-feed-accent) !important;
    outline-offset: 3px !important;
}
@media (max-width: 900px) {
    ${grid} #contents.ytd-rich-grid-renderer { padding-inline: 16px !important; gap: 24px 16px !important; }
}
@media (prefers-reduced-motion: reduce) {
    ${active} ytd-guide-entry-renderer #endpoint { transition: none !important; }
}
`;
    }

    function buildStyledFilterChipsCss() {
        return `
ytd-feed-filter-chip-bar-renderer #chips-wrapper { background: var(--yt-spec-base-background, #111214) !important; }
ytd-feed-filter-chip-bar-renderer #scroll-container { padding-block: 8px !important; }
ytd-feed-filter-chip-bar-renderer :is(#left-arrow, #right-arrow) { background: var(--yt-spec-base-background, #111214) !important; }
yt-chip-cloud-chip-renderer :is(.ytChipShapeChip, #chip-container) {
    height: 34px !important;
    padding-inline: 14px !important;
    border: 1px solid color-mix(in srgb, var(--yt-spec-text-primary) 10%, transparent) !important;
    border-radius: 6px !important;
    box-shadow: none !important;
    transition: background-color 140ms ease, color 140ms ease !important;
}
yt-chip-cloud-chip-renderer :is(.ytChipShapeInactive, #chip-container) {
    background: color-mix(in srgb, var(--yt-spec-text-primary) 6%, var(--yt-spec-base-background)) !important;
    color: var(--yt-spec-text-primary) !important;
}
yt-chip-cloud-chip-renderer :is(.ytChipShapeInactive, #chip-container):hover {
    background: color-mix(in srgb, var(--yt-spec-text-primary) 12%, var(--yt-spec-base-background)) !important;
}
yt-chip-cloud-chip-renderer .ytChipShapeActive,
yt-chip-cloud-chip-renderer[selected] #chip-container {
    background: var(--yt-spec-text-primary) !important;
    color: var(--yt-spec-base-background) !important;
    font-weight: 600 !important;
}
yt-chip-cloud-chip-renderer .ytChipShapeTextContent { font-size: 13px !important; line-height: 1.2 !important; }
@media (prefers-reduced-motion: reduce) {
    yt-chip-cloud-chip-renderer :is(.ytChipShapeChip, #chip-container) { transition: none !important; }
}
`;
    }

    // NOTE: no apostrophes or backticks in comments in this function.
    // stripSafeLineComments refuses to drop a comment line carrying a quote,
    // so one costs bytes in a core bundle that sits against a 2 MiB host cap.
    //
    // v4.90.0: YouTube moved the feed off ytd-rich-grid-media and #video-title
    // onto yt-lockup-view-model, so the old fullTitles selector list matched
    // nothing at all on Home, Subscriptions, Channel or the watch sidebar.
    // Ground truth read off the captured Subscriptions page in the repo root,
    // verified 2026-09-14 -- 96 lockup titles, 0 legacy renderers:
    //   .ytLockupMetadataViewModelStandard .ytLockupMetadataViewModelTitle {
    //       overflow:hidden; max-height:4.4rem; display:-webkit-box;
    //       -webkit-box-orient:vertical; text-overflow:ellipsis }
    //   @supports (-webkit-line-clamp:1) { ... -webkit-line-clamp:2 }
    // The TypographyBump variant repeats the block at 5.2rem. Shorts lockups
    // clamp .shortsLockupViewModelHostMetadataTitle to 3 lines the same way.
    //
    // Two specificity notes, both deliberate:
    //  * Selectors lead with html body.ytkit-fullTitles. canScopeCss in
    //    core/styles.js refuses to wrap a sheet whose selectors start at the
    //    document root, so this sheet stays unwrapped and keeps its own
    //    specificity rather than inheriting the zero that @scope contributes.
    //  * listFeedLayout re-clamps titles to 3 lines at (1,1,2) and (0,2,3).
    //    The html body prefix clears both, so enabling full titles wins
    //    whichever order the two sheets happen to land in.
    //
    // CSS comments live out here rather than inside the returned template.
    // Anything in the template is shipped to every page on every load, and a
    // comment there is also a compaction hazard: an apostrophe inside one used
    // to be read as a string delimiter, which silently left the rest of the
    // template uncompacted.
    //
    // Rules in the returned sheet, in order:
    //  1. The unclamp itself, across every title surface.
    //  2. The attributed-string span inside a lockup title, which carries its
    //     own clamp on some experiments and would otherwise decide the
    //     rendered height even after the anchor is freed.
    //  3. Menu-button padding, so a title that now runs past two lines does
    //     not slide under the overflow button pinned to the metadata block.
    //  4. The legacy max-lines custom property, which sizes the old title box
    //     independently of the clamp and so has to move with it.
    function buildFullTitlesCss() {
        // Ordered so the parent-qualified forms carry an extra type unit. That
        // matters against the listFeedLayout rule ending yt-lockup-view-model
        // a[title], which is (0,2,3): the bare class form would only tie it,
        // and a tie is settled by sheet order, which nothing here controls.
        const MODERN = [
            'yt-lockup-metadata-view-model a.ytLockupMetadataViewModelTitle',
            'yt-lockup-view-model a.ytLockupMetadataViewModelTitle',
            'a.ytLockupMetadataViewModelTitle',
            '.ytLockupMetadataViewModelTitle',
            'h3.ytLockupMetadataViewModelHeadingReset',
            '.ytLockupMetadataViewModelHeadingReset',
            'ytm-shorts-lockup-view-model .shortsLockupViewModelHostMetadataTitle',
            '.shortsLockupViewModelHostMetadataTitle',
            'ytm-shorts-lockup-view-model h3'
        ];
        // Legacy Polymer renderers still back search results, playlist panels
        // and a few shelves. Written as a pair of :is lists rather than the
        // 27-selector cross product they expand to. An :is list takes the
        // specificity of its most specific argument, so the host list counts
        // as one type and the title list as one id, landing the whole rule at
        // (1,1,3) -- one unit above the listFeedLayout (1,1,2) -- for a
        // twentieth of the bytes.
        const LEGACY_HOSTS = ':is(ytd-rich-item-renderer, ytd-rich-grid-media, ytd-grid-video-renderer,'
            + ' ytd-video-renderer, ytd-compact-video-renderer, ytd-compact-radio-renderer,'
            + ' ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, ytd-reel-item-renderer)';
        // The h3 anchor form also matches channel and playlist links, so it
        // only ever appears scoped to one of the renderers above.
        const LEGACY_TITLES = ':is(#video-title, #video-title-link, h3 a.yt-simple-endpoint)';
        const selectors = [
            ...MODERN,
            `${LEGACY_HOSTS} ${LEGACY_TITLES}`,
            // Safe unscoped: these two ids are only ever a video title.
            '#video-title',
            '#video-title-link'
        ].map((selector) => `html body.ytkit-fullTitles ${selector}`);
        return `
            ${selectors.join(',\n            ')} {
                display: block !important;
                -webkit-line-clamp: unset !important;
                line-clamp: unset !important;
                max-height: none !important;
                height: auto !important;
                overflow: visible !important;
                text-overflow: clip !important;
                white-space: normal !important;
                word-break: break-word !important;
                overflow-wrap: anywhere !important;
            }
            html body.ytkit-fullTitles .ytLockupMetadataViewModelTitle .ytAttributedStringHost,
            html body.ytkit-fullTitles .shortsLockupViewModelHostMetadataTitle .ytAttributedStringHost {
                display: inline !important;
                -webkit-line-clamp: unset !important;
                max-height: none !important;
                overflow: visible !important;
                text-overflow: clip !important;
                white-space: normal !important;
            }
            html body.ytkit-fullTitles .ytLockupMetadataViewModelHasMenuButton .ytLockupMetadataViewModelTitle {
                padding-right: 24px !important;
            }
            html body.ytkit-fullTitles ytd-rich-grid-media #video-title,
            html body.ytkit-fullTitles ytd-video-renderer #video-title {
                --yt-formatted-string-max-lines: none !important;
            }
        `;
    }

    function buildListFeedLayoutCss() {
        return `
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer {
                display: flex !important;
                flex-direction: column !important;
                gap: 12px !important;
                width: 100% !important;
            }
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row,
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row > #contents,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row > #contents {
                display: contents !important;
            }
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-item-renderer,
            ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row ytd-rich-item-renderer,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-item-renderer,
            ytd-browse[page-subtype="subscriptions"] #contents.ytd-rich-grid-renderer > ytd-rich-grid-row ytd-rich-item-renderer,
            ytd-search[page-subtype="search"] ytd-video-renderer,
            ytd-search[page-subtype="search"] yt-lockup-view-model {
                display: block !important;
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible,
            ytd-browse[page-subtype="home"] yt-lockup-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model,
            ytd-search[page-subtype="search"] yt-lockup-view-model {
                display: grid !important;
                grid-template-columns: minmax(180px, min(32vw, 360px)) minmax(0, 1fr) !important;
                align-items: start !important;
                column-gap: 16px !important;
                width: 100% !important;
                min-width: 0 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible > #thumbnail,
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible > ytd-thumbnail,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible > #thumbnail,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible > ytd-thumbnail,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible > #thumbnail,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible > ytd-thumbnail,
            ytd-browse[page-subtype="home"] yt-lockup-view-model > yt-thumbnail-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model > yt-thumbnail-view-model,
            ytd-search[page-subtype="search"] yt-lockup-view-model > yt-thumbnail-view-model,
            ytd-browse[page-subtype="home"] yt-lockup-view-model > a.yt-lockup-view-model__content-image,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model > a.yt-lockup-view-model__content-image,
            ytd-search[page-subtype="search"] yt-lockup-view-model > a.yt-lockup-view-model__content-image {
                grid-column: 1 !important;
                grid-row: 1 !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: none !important;
                margin: 0 !important;
                aspect-ratio: 16 / 9 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible > #details,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible > #details,
            ytd-search[page-subtype="search"] ytd-video-renderer #dismissible > #details,
            ytd-browse[page-subtype="home"] yt-lockup-view-model > yt-lockup-metadata-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model > yt-lockup-metadata-view-model,
            ytd-search[page-subtype="search"] yt-lockup-view-model > yt-lockup-metadata-view-model {
                grid-column: 2 !important;
                grid-row: 1 !important;
                min-width: 0 !important;
                padding: 4px 0 !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #video-title,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #video-title,
            ytd-search[page-subtype="search"] ytd-video-renderer #video-title,
            ytd-browse[page-subtype="home"] yt-lockup-view-model a[title],
            ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model a[title],
            ytd-search[page-subtype="search"] yt-lockup-view-model a[title] {
                display: -webkit-box !important;
                -webkit-box-orient: vertical !important;
                -webkit-line-clamp: 3 !important;
                overflow: hidden !important;
                white-space: normal !important;
            }
            ytd-browse[page-subtype="home"] ytd-rich-item-renderer #metadata-line,
            ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #metadata-line,
            ytd-search[page-subtype="search"] ytd-video-renderer #metadata-line,
            ytd-browse[page-subtype="home"] yt-lockup-metadata-view-model,
            ytd-browse[page-subtype="subscriptions"] yt-lockup-metadata-view-model,
            ytd-search[page-subtype="search"] yt-lockup-metadata-view-model {
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }
            @media (max-width: 700px) {
                ytd-browse[page-subtype="home"] ytd-rich-item-renderer #dismissible,
                ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer #dismissible,
                ytd-search[page-subtype="search"] ytd-video-renderer #dismissible,
                ytd-browse[page-subtype="home"] yt-lockup-view-model,
                ytd-browse[page-subtype="subscriptions"] yt-lockup-view-model,
                ytd-search[page-subtype="search"] yt-lockup-view-model {
                    grid-template-columns: minmax(128px, 38vw) minmax(0, 1fr) !important;
                    column-gap: 10px !important;
                }
            }
        `;
    }

    // viewsOnSeparateLine. Since 2026-09-25 Home and Subscriptions cards print
    // the channel, the views and the age on one metadata row: channel name,
    // badge, an empty delimiter, the eye icon, views, delimiter, age. A long
    // channel name pushes the numbers out of the card. The row wraps at the
    // delimiter in front of the eye icon, which becomes a full-width line of
    // no height, and the channel name ends in an ellipsis short of the badge
    // so the badge stays on the first line. Cards that already print views on
    // a row of their own (channel shelves) have no delimiter before the eye
    // icon and are left alone. Rendered and measured 2026-10-10 on a live
    // channel shelf card rebuilt into the one-row form.
    function buildViewsOnSeparateLineCss() {
        const row = 'ytd-browse:is([page-subtype="home"], [page-subtype="subscriptions"]) ytd-rich-item-renderer'
            + ' .ytContentMetadataViewModelMetadataRow:has(> .ytContentMetadataViewModelDelimiter + .ytContentMetadataViewModelLeadingIcon)';
        return `
            ${row} {
                flex-wrap: wrap !important;
            }
            ${row} > .ytContentMetadataViewModelMetadataText:first-child {
                max-width: calc(100% - 20px) !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }
            ${row} > .ytContentMetadataViewModelDelimiter:has(+ .ytContentMetadataViewModelLeadingIcon) {
                flex-basis: 100% !important;
                height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
            }
        `;
    }

    function createLifecycleSpec(id, category, buildCss, pageScopes = ['all']) {
        const factory = globalThis.YTKitCore
            && typeof globalThis.YTKitCore.createCssLifecycleSpec === 'function'
            && globalThis.YTKitCore.createCssLifecycleSpec;
        if (factory) return factory({ id, category, buildCss, pageScopes });
        return {
            id,
            category,
            buildCss,
            pageScopes: Object.freeze([...pageScopes]),
            init() { /* reason: styles core helper unavailable in this context */ },
            destroy() { /* reason: styles core helper unavailable in this context */ }
        };
    }

    // v4.47.0 NF5 wave 3: lifecycle specs for the home-subs CSS-only
    // feature ids this module owns. These specs now own style injection
    // and body-class teardown via core/styles.js; ytkit.js's cssFeature()
    // is only the compatibility wrapper/fallback.
    const LIFECYCLE_SPECS = Object.freeze([
        createLifecycleSpec('hideCreateButton',        'nav',          buildHideCreateButtonCss,        ['all']),
        createLifecycleSpec('hideVoiceSearch',         'nav',          buildHideVoiceSearchCss,         ['all']),
        createLifecycleSpec('widenSearchBar',          'shell',        buildWidenSearchBarCss,          ['all']),
        createLifecycleSpec('disablePlayOnHover',      'shorts',       buildDisablePlayOnHoverCss,      ['home', 'subscriptions', 'search', 'channel']),
        createLifecycleSpec('fullWidthSubscriptions',  'shell',        buildFullWidthSubscriptionsCss,  ['subscriptions']),
        createLifecycleSpec('hideSubscriptionOptions', 'watch-player', buildHideSubscriptionOptionsCss, ['subscriptions']),
        createLifecycleSpec('listFeedLayout',           'feed',         buildListFeedLayoutCss,          ['home', 'subscriptions', 'search']),
        createLifecycleSpec('fullTitles',              'feed',         buildFullTitlesCss,              ['all']),
        createLifecycleSpec('viewsOnSeparateLine',     'feed',         buildViewsOnSeparateLineCss,     ['home', 'subscriptions']),
    ]);

    const features = globalThis.YTKitFeatures || (globalThis.YTKitFeatures = {});
    features.homeSubsCss = Object.freeze({
        buildFeedGridCss,
        buildStyledFilterChipsCss,
        buildHideCreateButtonCss,
        buildHideVoiceSearchCss,
        buildWidenSearchBarCss,
        buildDisablePlayOnHoverCss,
        buildFullWidthSubscriptionsCss,
        buildHideSubscriptionOptionsCss,
        buildListFeedLayoutCss,
        buildFullTitlesCss,
        buildViewsOnSeparateLineCss,
        LIFECYCLE_SPECS
    });

    try {
        if (globalThis.YTKitCore && typeof globalThis.YTKitCore.getLifecycle === 'function') {
            const lc = globalThis.YTKitCore.getLifecycle();
            for (const spec of LIFECYCLE_SPECS) {
                try {
                    lc.defineFeature(spec);
                } catch (_) {
                    // reason: duplicate id from a prior load — safe to skip
                }
            }
        }
    } catch (_) {
        // reason: lifecycle unavailable in this context (e.g. test harness)
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildFeedGridCss,
            buildStyledFilterChipsCss,
            buildHideCreateButtonCss,
            buildHideVoiceSearchCss,
            buildWidenSearchBarCss,
            buildDisablePlayOnHoverCss,
            buildFullWidthSubscriptionsCss,
            buildHideSubscriptionOptionsCss,
            buildListFeedLayoutCss,
            buildFullTitlesCss,
            buildViewsOnSeparateLineCss,
            LIFECYCLE_SPECS
        };
    }
})();
