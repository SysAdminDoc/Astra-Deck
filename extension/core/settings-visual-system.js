(() => {
    'use strict';

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    const STYLE_ID = 'ytkit-settings-visual-v5';

    // Presentation-only index shared by the in-page panel, popup-search tests,
    // and the generated README. Canonical schema categories stay untouched.
    const SHORTS_SETTING_KEYS = Object.freeze([
        'removeAllShorts',
        'redirectShorts',
        'disablePlayOnHover',
        'shortsSpeedControl',
        'shortsAutoAdvance',
        'shortsAsRegularVideo',
        'shortsDailyLimitMin',
        'shortsDailyLimitMode',
        'shortsWatchTimeToday'
    ]);
    const SHORTS_PANEL_SETTING_KEYS = Object.freeze(
        SHORTS_SETTING_KEYS.filter((key) => key !== 'shortsWatchTimeToday')
    );

    const SETTINGS_CATEGORY_SECTIONS = Object.freeze({
        'Video Player': [
            { labelKey: 'settingsSectionPlaybackQuality', fallback: 'Playback & quality', match: /^(persistentSpeed|codecSelector|autoMaxResolution|forceH264|forceStandardFps|musicVideoSpeedLock|qualityProfileMatrix|perChannelSpeed|fineSpeedControl|customSpeedButtons|speedIndicatorOverlay)$/ },
            { labelKey: 'settingsSectionTransformDisplay', fallback: 'Transform & display', match: /^(videoRotation|videoFlip|videoZoom|videoVisualFilters|photosensitiveFlashProtection|cinemaAmbientGlow|fitPlayerToWindow|adaptiveLiveLayout|fullscreenScroll|fullscreenOnDoubleClick|autoTheaterMode|miniPlayerBar|popOutPlayer|disableMiniPlayer|hideVideoEndContent|hideJumpAheadButton|hiddenPlayerControlsManager|playbackStatsOverlay|pipButton|frameByFrameButtons|chapterJumpButtons|hideAirplayButton|videoLoopButton|abLoop|sleepTimer)$/ },
            { labelKey: 'settingsSectionAudio', fallback: 'Audio', match: /^(audio|volume|mono|disableLoudness|preferDescriptive|notifyAutoDubbed|bufferPreload)/ },
            { labelKey: 'settingsSectionCaptureSubtitles', fallback: 'Capture & subtitles', match: /^(downloadScreenshotFormat|videoScreenshot|downloadSubtitlesWithScreenshot|subtitleStyling|dualLanguageSubtitles)$/ },
            { labelKey: 'settingsSectionPlayerStateControls', fallback: 'Player state & controls', match: /.*/ }
        ],
        Playback: [
            { labelKey: 'settingsSectionSession', fallback: 'Session', match: /^(autoDismissStillWatching|resumePlayback|rememberVolume|pauseOtherTabs|autoPauseOnSwitch|disableAutoplayNext|preventAutoplay|ageRestrictionBypass|autoDismissContentWarning)$/ },
            { labelKey: 'settingsSectionTiming', fallback: 'Timing', match: /^(remainingTimeDisplay|showPlaylistDuration|showTimeInTabTitle|liveSpeedReset|scrollWheelSpeed|playbackSpeedOSD)$/ },
            { labelKey: 'settingsSectionCaptionsNavigation', fallback: 'Captions & navigation', match: /^(autoSubtitles|autoSubtitlesWhenMuted|subtitlesOnRewind|autoOpenChapters|autoOpenTranscript|preloadComments|reversePlaylist)$/ },
            { labelKey: 'settingsSectionRecoveryFullscreen', fallback: 'Recovery & fullscreen', match: /.*/ }
        ],
        Comments: [
            { labelKey: 'settingsSectionComposition', fallback: 'Composition', match: /^(hideCommentComposer|hideCommentReplyButton|chatStyleComments)$/ },
            { labelKey: 'settingsSectionThreadBehavior', fallback: 'Thread behavior', match: /^(hidePinnedComments|hideCommentDislikeButton|autoExpandComments|commentEnhancements|sortCommentsNewest|creatorCommentHighlight)$/ },
            { labelKey: 'settingsSectionDiscoveryTranslation', fallback: 'Discovery & translation', match: /^(commentSearch|commentNavigator|commentTranslate)$/ },
            { labelKey: 'settingsSectionFilters', fallback: 'Filters', match: /.*/ }
        ],
        'Watch Page': [
            { labelKey: 'settingsSectionTranscriptAi', fallback: 'Transcript & AI', match: /^(transcriptAiHandoff|transcriptViewer|aiVideoSummary|keyMoments|copyChapterMarkdown)$/ },
            { labelKey: 'settingsSectionPlayerChrome', fallback: 'Player chrome', match: /^(removeScrubber|softBottomGradient|alwaysShowProgressBar|autoSkipChapters|chapterNavButtons|hideAutoplayToggle|floatingLogoOnWatch|stickyVideo|scrollToPlayer|playlistEnhancer|playlistSearch|watchPageTabs|focusedMode|zenMode)$/ },
            // YouTube's own AI surfaces, kept together so the whole answer to
            // "turn this off" is visible at once. These sit ahead of Page
            // elements deliberately: that section's alternates are unanchored
            // and would otherwise absorb hideAskAi/hideGeminiButtons/
            // hideAiSummary by prefix.
            { labelKey: 'settingsSectionAiContent', fallback: 'AI content', match: /^(hideAskAi|hideGeminiButtons|hideAiSummary)$/ },
            { labelKey: 'settingsSectionPageElements', fallback: 'Page elements', match: /^(hiddenWatchElementsManager|hidePaidContentOverlay|hideInfoPanels|hideRelatedVideos|hideDescription|hideMerch|hideAsk|hideGemini|hideAi|hideHashtags|hideComment|condenseComments|hidePaidPromotionWatch|hideChannelJoinButton|hideFundraiser|hiddenActionButtonsManager|hideInfoCards)/ },
            { labelKey: 'settingsSectionInsightsNotes', fallback: 'Insights & notes', match: /^(preciseViewCounts|videoInsights|showChannelVideoCount|timestampBookmarks|videoNotes|watchTimeTracker|likeViewRatio|channelAgeDisplay|channelSubCount|redditComments|watchHistoryAnalytics)$/ },
            { labelKey: 'settingsSectionSharingActions', fallback: 'Sharing & actions', match: /.*/ }
        ],
        Content: [
            { labelKey: 'settingsSectionFeedVisibility', fallback: 'Feed visibility', match: /^(hideWatchedVideos|searchFilterDefaults|searchHide|hideCollaborations|hideVideosFromHome|titleNormalization|watchProgress|antiTranslate|notInterestedButton|thumbnail|watchLaterQuickAdd|grayscaleThumbnails|openInNewTab|hideLatestPosts)$/ },
            { labelKey: 'settingsSectionShortsDiscovery', fallback: 'Shorts controls', match: /^(removeAllShorts|redirectShorts|disablePlayOnHover|shortsSpeedControl|shortsAutoAdvance|shortsAsRegularVideo|shortsDailyLimitMin|shortsDailyLimitMode)$/ },
            { labelKey: 'settingsSectionSponsorblockDearrow', fallback: 'SponsorBlock & DeArrow', match: /^(sponsorBlock|sbPerChannelProfiles|deArrow)/ },
            { labelKey: 'settingsSectionFeedToolsAutomation', fallback: 'Feed tools & automation', match: /.*/ }
        ],
        'Home / Subscriptions': [
            { labelKey: 'settingsSectionFeedLayout', fallback: 'Feed layout', match: /^(videosPerRow|titleCaseTransform|subscriptionsGrid|homepageGridAlign|fullWidthSubscriptions|listFeedLayout|fullTitles|videoAgeColors|disableInfiniteScroll|hideQueueOnThumbnails)$/ },
            { labelKey: 'settingsSectionHeader', fallback: 'Header', match: /^(hideCreateButton|hideVoiceSearch|logoToSubscriptions|widenSearchBar|hideOwnAvatar|compactUnfixedHeader|hideNotificationBadge|squareSearchBar)$/ },
            { labelKey: 'settingsSectionNavigation', fallback: 'Navigation', match: /^(hiddenGuideElementsManager|hideSidebar|quickLinkMenu|rssFeedLink|redirectHomeToSubs|redirectToVideosTab)$/ },
            { labelKey: 'settingsSectionDiscovery', fallback: 'Discovery', match: /.*/ }
        ],
        Theme: [
            { labelKey: 'settingsSectionFoundation', fallback: 'Foundation', match: /^(uiFontFamily|uiStyleManager|colorThemeManager|uiFontSize|themeAccentColor)$/ },
            { labelKey: 'settingsSectionDensity', fallback: 'Density', match: /^(styledFilterChips|compactLayout|thinScrollbar|cleanUiPreset)$/ },
            { labelKey: 'settingsSectionCustomCss', fallback: 'Custom CSS', match: /^customCssInjection$/ },
            { labelKey: 'settingsSectionSurfaces', fallback: 'Surfaces', match: /.*/ }
        ],
        'Live Chat': [
            { labelKey: 'settingsSectionPresentation', fallback: 'Presentation', match: /^(hideLiveChatEngagement|premiumLiveChat|stickyChat)$/ },
            { labelKey: 'settingsSectionVisibility', fallback: 'Visibility', match: /^hiddenChatElementsManager$/ },
            { labelKey: 'settingsSectionMessages', fallback: 'Messages', match: /.*/ }
        ],
        Downloads: [
            { labelKey: 'settingsSectionFormats', fallback: 'Formats', match: /^(downloadQuality|downloadVideoFormat|downloadAudioFormat)$/ },
            { labelKey: 'settingsSectionEntryPoints', fallback: 'Entry points', match: /^(showLocalDownloadButton|videoContextMenu)$/ },
            { labelKey: 'settingsSectionAutomation', fallback: 'Automation', match: /^(autoDownloadOnVisit|subtitleDownload)$/ },
            { labelKey: 'settingsSectionToolsHealth', fallback: 'Tools & health', match: /.*/ }
        ],
        Advanced: [
            { labelKey: 'settingsSectionNotifications', fallback: 'Notifications', match: /^chronologicalNotifications$/ },
            { labelKey: 'settingsSectionPerformance', fallback: 'Performance', match: /^(enableCPU_Tamer|disableSpaNavigation|storageQuotaLRU)$/ },
            { labelKey: 'settingsSectionDiagnostics', fallback: 'Diagnostics', match: /^(enableHandleRevealer|showStatisticsDashboard|debugMode|diagnosticLog|selectorHealthPanel)$/ },
            { labelKey: 'settingsSectionProfilesWellbeing', fallback: 'Profiles & wellbeing', match: /.*/ }
        ]
    });

    const SETTINGS_VISUAL_SYSTEM_CSS = `
        /* Astra Deck settings visual system v5 — imagegen-matched command deck. */
        #ytkit-settings-panel {
            inset: auto;
            margin: 0;
            --ytkit-v3-bg: #0b1421;
            /* Three planes, not one. Everything used to paint --ytkit-v3-bg,
               so the rail, the content and the settings table were the same
               near-black slab with hairlines drawn on it. */
            --ytkit-v3-rail: #08111d;
            --ytkit-v3-panel: #111d2b;
            --ytkit-v3-surface: #172437;
            --ytkit-v3-surface-raised: #203149;
            --ytkit-v3-hover: rgba(154,190,228,0.08);
            --ytkit-v3-border: rgba(151,178,208,0.18);
            --ytkit-v3-border-strong: rgba(151,178,208,0.30);
            --ytkit-v3-control-stroke: rgba(151,178,208,0.16);
            --ytkit-v3-text: #f4f7fb;
            --ytkit-v3-muted: #b8c3d1;
            /* #7f8996 was 4.5:1 against the old black and only just holds at
               the lifted surface; #8b95a3 restores the margin (5.3:1). */
            --ytkit-v3-subtle: #8594a7;
            --ytkit-v3-accent: #ff5a4f;
            --ytkit-v3-accent-rgb: 255,90,79;
            /* Filled controls carrying white text need a darker coral than
               the highlight accent: #fff on #ff5a4f is 3.08:1 (fails AA). */
            --ytkit-v3-accent-fill: #cf352f;
            --ytkit-v3-accent-fill-hover: #b92c27;
            --ytkit-v3-success: #45d978;
            /* Known-breakage notices. 10.77:1 on --ytkit-v3-bg. */
            --ytkit-v3-warning: #f6b863;
            /* Above YouTube player chrome and ad overlays (was the folded
               "premium refresh" layer's job before v4 became the SSOT). */
            z-index: 2147483646 !important;
            width: min(1540px, calc(100vw - 40px)) !important;
            height: min(94vh, 920px) !important;
            max-height: min(94vh, 920px) !important;
            border: 1px solid var(--ytkit-v3-border-strong) !important;
            border-radius: 12px !important;
            background: var(--ytkit-v3-bg) !important;
            color: var(--ytkit-v3-text) !important;
            box-shadow: 0 28px 80px rgba(0,0,0,0.52) !important;
            color-scheme: dark !important;
            font-family: Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif !important;
            font-size: 15px !important;
            line-height: 1.45 !important;
            overflow: hidden !important;
        }

        #ytkit-settings-panel:popover-open {
            inset: auto !important;
            top: 50% !important;
            right: auto !important;
            bottom: auto !important;
            left: 50% !important;
            margin: 0 !important;
        }

        #ytkit-overlay {
            z-index: 2147483645 !important;
        }

        #ytkit-settings-panel .ytkit-header {
            display: grid !important;
            grid-template-columns: 260px minmax(320px, 1fr) auto !important;
            grid-template-areas: "brand search actions" !important;
            align-items: center !important;
            gap: 20px !important;
            min-height: 64px !important;
            padding: 0 20px !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-bg) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-brand {
            grid-area: brand !important;
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            min-width: 0 !important;
            padding: 0 !important;
        }

        #ytkit-settings-panel .ytkit-brand-mark {
            display: grid !important;
            place-items: center !important;
            width: 34px !important;
            height: 34px !important;
            min-width: 34px !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-brand-image {
            width: 30px !important;
            height: 30px !important;
            object-fit: contain !important;
        }

        #ytkit-settings-panel .ytkit-brand-copy {
            display: flex !important;
            flex-direction: row !important;
            align-items: baseline !important;
            gap: 12px !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-brand-lockup {
            display: inline-flex !important;
            flex: 0 1 auto !important;
            flex-direction: row !important;
            align-items: baseline !important;
            gap: 12px !important;
            min-width: 0 !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-eyebrow {
            color: var(--ytkit-v3-text) !important;
            font-size: 18px !important;
            font-weight: 720 !important;
            line-height: 1 !important;
            letter-spacing: -0.015em !important;
            text-transform: none !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-title {
            margin: 0 !important;
            color: var(--ytkit-v3-accent) !important;
            font-size: 14px !important;
            font-weight: 760 !important;
            line-height: 1 !important;
            letter-spacing: 0.08em !important;
            text-transform: uppercase !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-brand-intro,
        #ytkit-settings-panel .ytkit-brand-badges {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-command-search {
            grid-area: search !important;
            position: relative !important;
            width: 100% !important;
            height: 42px !important;
            min-height: 42px !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 8px !important;
            background: var(--ytkit-v3-surface) !important;
            box-shadow: inset 0 0 0 1px var(--ytkit-v3-border) !important;
            overflow: hidden !important;
        }

        #ytkit-settings-panel .ytkit-command-search:focus-within {
            box-shadow: inset 0 0 0 1px rgba(var(--ytkit-v3-accent-rgb),0.72), 0 0 0 3px rgba(var(--ytkit-v3-accent-rgb),0.12) !important;
        }

        #ytkit-settings-panel .ytkit-command-search .ytkit-search-input {
            height: 100% !important;
            min-height: 0 !important;
            padding: 0 50px 0 44px !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 15px !important;
            font-weight: 480 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-command-search .ytkit-search-input::placeholder {
            color: var(--ytkit-v3-subtle) !important;
            opacity: 1 !important;
        }

        #ytkit-settings-panel .ytkit-command-search .ytkit-search-icon {
            left: 15px !important;
            width: 18px !important;
            height: 18px !important;
            color: var(--ytkit-v3-muted) !important;
        }

        #ytkit-settings-panel .ytkit-search-meta {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-search-clear {
            width: 36px !important;
            min-width: 36px !important;
            height: 36px !important;
            min-height: 36px !important;
            border: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
        }

        #ytkit-settings-panel .ytkit-header-actions {
            grid-area: actions !important;
            display: flex !important;
            align-items: center !important;
            gap: 14px !important;
        }

        #ytkit-settings-panel .ytkit-header-live {
            min-height: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 14px !important;
            font-weight: 520 !important;
            box-shadow: none !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-header-live-dot {
            display: block !important;
            width: 8px !important;
            height: 8px !important;
            border-radius: 50% !important;
            background: var(--ytkit-v3-accent) !important;
            box-shadow: 0 0 0 3px rgba(var(--ytkit-v3-accent-rgb),0.10) !important;
        }

        #ytkit-settings-panel .ytkit-close {
            width: 40px !important;
            min-width: 40px !important;
            height: 40px !important;
            min-height: 40px !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 10px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-close:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-body {
            display: grid !important;
            grid-template-columns: 260px minmax(0, 1fr) !important;
            min-height: 0 !important;
            background: var(--ytkit-v3-bg) !important;
        }

        #ytkit-settings-panel .ytkit-sidebar {
            display: flex !important;
            flex-direction: column !important;
            width: auto !important;
            min-width: 0 !important;
            height: auto !important;
            padding: 14px 12px 12px !important;
            gap: 0 !important;
            border: 0 !important;
            border-right: 1px solid var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-rail) !important;
            box-shadow: none !important;
            overflow: hidden !important;
        }

        #ytkit-settings-panel .ytkit-sidebar-top,
        #ytkit-settings-panel .ytkit-nav-meta,
        #ytkit-settings-panel .ytkit-nav-state,
        #ytkit-settings-panel .ytkit-nav-arrow {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-group-label {
            display: block !important;
            margin: 14px 10px 5px !important;
            color: var(--ytkit-v3-subtle) !important;
            font-size: 10px !important;
            font-weight: 720 !important;
            line-height: 1.2 !important;
            letter-spacing: 0.105em !important;
            text-transform: uppercase !important;
            user-select: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-group-label:first-child {
            margin-top: 4px !important;
        }

        #ytkit-settings-panel .ytkit-nav-list {
            display: flex !important;
            flex: 1 1 auto !important;
            flex-direction: column !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            gap: 2px !important;
            overflow: auto !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn {
            position: relative !important;
            display: grid !important;
            grid-template-columns: 28px minmax(0, 1fr) auto !important;
            align-items: center !important;
            gap: 10px !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 42px !important;
            margin: 0 !important;
            padding: 0 12px !important;
            border: 0 !important;
            border-radius: 6px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            box-shadow: none !important;
            text-align: start !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn::before {
            content: "" !important;
            position: absolute !important;
            top: 10px !important;
            bottom: 10px !important;
            inset-inline-start: 0 !important;
            width: 2px !important;
            border-radius: 0 !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active {
            border: 0 !important;
            background: rgba(var(--ytkit-v3-accent-rgb),0.075) !important;
            color: var(--ytkit-v3-text) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active::before {
            background: var(--ytkit-v3-accent) !important;
        }

        #ytkit-settings-panel .ytkit-nav-icon {
            display: grid !important;
            place-items: center !important;
            width: 24px !important;
            height: 24px !important;
            min-width: 24px !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: currentColor !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-icon svg {
            width: 18px !important;
            height: 18px !important;
        }

        #ytkit-settings-panel .ytkit-nav-copy {
            display: block !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-nav-label {
            display: block !important;
            overflow: hidden !important;
            color: inherit !important;
            font-size: 15px !important;
            font-weight: 610 !important;
            line-height: 1.25 !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }

        /* Every category shows its enabled/total count, not just the open one.
           Hiding the rest meant the only way to find out where your settings
           actually were was to click all ten. */
        #ytkit-settings-panel .ytkit-nav-count {
            display: inline !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-subtle) !important;
            font-size: 11px !important;
            font-weight: 600 !important;
            font-variant-numeric: tabular-nums !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active .ytkit-nav-count {
            display: inline !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-sidebar-footer {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            min-height: 44px !important;
            margin: 12px 4px 0 !important;
            padding: 8px 6px 0 !important;
            border: 0 !important;
            border-top: 1px solid var(--ytkit-v3-border) !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-github {
            width: 36px !important;
            min-width: 36px !important;
            height: 36px !important;
            min-height: 36px !important;
            border: 0 !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: var(--ytkit-v3-subtle) !important;
        }

        #ytkit-settings-panel .ytkit-version {
            margin-left: auto !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-subtle) !important;
            font-size: 11px !important;
        }

        #ytkit-settings-panel .ytkit-content {
            min-width: 0 !important;
            padding: 18px 34px 34px !important;
            background: var(--ytkit-v3-bg) !important;
            scrollbar-gutter: stable !important;
        }

        #ytkit-settings-panel .ytkit-pane-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 4 !important;
            display: grid !important;
            grid-template-columns: minmax(250px, 1fr) minmax(320px, 0.95fr) auto !important;
            align-items: center !important;
            gap: 28px !important;
            min-height: 90px !important;
            margin: 0 !important;
            padding: 0 0 14px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-bg) !important;
            box-shadow: 0 -20px 0 var(--ytkit-v3-bg) !important;
            isolation: isolate !important;
        }

        #ytkit-settings-panel .ytkit-pane-title {
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-pane-eyebrow {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-pane-meta {
            display: flex !important;
            align-items: center !important;
            gap: 0 !important;
            margin-top: 7px !important;
            color: var(--ytkit-v3-subtle) !important;
            font-size: 11px !important;
            font-weight: 560 !important;
        }

        #ytkit-settings-panel .ytkit-pane-chip {
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: inherit !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-pane-chip + .ytkit-pane-chip::before {
            content: "·" !important;
            margin: 0 7px !important;
            color: var(--ytkit-v3-border-strong) !important;
        }

        #ytkit-settings-panel .ytkit-pane-title h2 {
            margin: 0 !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 29px !important;
            font-weight: 720 !important;
            line-height: 1.15 !important;
            letter-spacing: -0.025em !important;
        }

        #ytkit-settings-panel .ytkit-pane-description {
            display: block !important;
            max-width: 720px !important;
            margin: 5px 0 0 !important;
            overflow: hidden !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14px !important;
            font-weight: 440 !important;
            line-height: 1.4 !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-pane-context {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            min-width: 0 !important;
            border-inline-start: 1px solid var(--ytkit-v3-border) !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-item {
            min-width: 0 !important;
            padding: 2px 16px !important;
            border-inline-end: 1px solid var(--ytkit-v3-border) !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-label,
        #ytkit-settings-panel .ytkit-pane-context-value {
            display: block !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-label {
            color: var(--ytkit-v3-subtle) !important;
            font-size: 10px !important;
            font-weight: 520 !important;
            line-height: 1.35 !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-value {
            margin-top: 2px !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 12px !important;
            font-weight: 640 !important;
            line-height: 1.35 !important;
        }

        #ytkit-settings-panel .ytkit-pane.ytkit-search-active .ytkit-pane-context {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-pane-actions {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            flex: 0 0 auto !important;
            /* Pin to the last grid column: the middle context block is
               conditional (absent on panes without select features, hidden
               during search), and auto-placement would otherwise float the
               actions into the 320px middle column. */
            grid-column: -2 / -1 !important;
            justify-self: end !important;
        }

        #ytkit-settings-panel .ytkit-reset-group-btn {
            min-height: 38px !important;
            padding: 0 10px !important;
            border: 0 !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            font-weight: 620 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-reset-group-btn:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-toggle-all {
            min-height: 38px !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-toggle-all > span {
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            font-weight: 620 !important;
            letter-spacing: 0 !important;
        }

        #ytkit-settings-panel .ytkit-features-grid {
            display: block !important;
            margin: 14px 0 0 !important;
            padding: 0 !important;
            border: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 10px !important;
            background: var(--ytkit-v3-panel) !important;
            overflow: hidden !important;
        }

        #ytkit-settings-panel .ytkit-feature-card {
            position: relative !important;
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) minmax(190px, 300px) !important;
            align-items: center !important;
            gap: 32px !important;
            width: 100% !important;
            min-height: 76px !important;
            margin: 0 !important;
            padding: 12px 18px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 0 !important;
            background: rgba(255,255,255,0.008) !important;
            box-shadow: none !important;
            color: var(--ytkit-v3-text) !important;
            overflow: visible !important;
        }

        #ytkit-settings-panel .ytkit-feature-card:first-child {
            border-top: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-card:last-child {
            border-bottom: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-card.ytkit-card-enabled {
            border-color: var(--ytkit-v3-border) !important;
            background: rgba(var(--ytkit-v3-accent-rgb),0.055) !important;
            box-shadow: none !important;
            transform: none !important;
        }

        #ytkit-settings-panel .ytkit-feature-card.ytkit-card-enabled::before {
            content: "" !important;
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            bottom: 0 !important;
            inset-inline-start: 0 !important;
            width: 3px !important;
            background: var(--ytkit-v3-accent) !important;
        }

        #ytkit-settings-panel .ytkit-feature-card:hover,
        #ytkit-settings-panel .ytkit-feature-card:focus-within {
            border-color: var(--ytkit-v3-border) !important;
            background: rgba(255,255,255,0.045) !important;
            box-shadow: none !important;
            transform: none !important;
        }

        #ytkit-settings-panel .ytkit-feature-card::before,
        #ytkit-settings-panel .ytkit-feature-card::after,
        #ytkit-settings-panel .ytkit-feature-card.ytkit-has-preview::after {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-info-card {
            grid-column: 1 / -1 !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner,
        #ytkit-settings-panel .ytkit-mediadl-banner[data-state] {
            margin: 0 0 10px !important;
            padding: 4px 4px 18px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__top {
            gap: 18px !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__main {
            gap: 12px !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__title {
            color: var(--ytkit-v3-text) !important;
            font-size: 14px !important;
            font-weight: 650 !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__status {
            color: var(--ytkit-v3-muted) !important;
            font-size: 12.5px !important;
            line-height: 1.45 !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__actions {
            gap: 4px !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__btn {
            min-height: 40px !important;
            padding: 0 10px !important;
            border: 0 !important;
            border-radius: 8px !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 12.5px !important;
            font-weight: 620 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__btn:hover {
            background: var(--ytkit-v3-hover) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__btn--accent,
        #ytkit-settings-panel .ytkit-mediadl-banner__btn.is-success {
            background: var(--ytkit-v3-accent-fill) !important;
            color: #fff !important;
        }

        #ytkit-settings-panel .ytkit-feature-main {
            display: grid !important;
            grid-template-columns: 30px minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 14px !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-meta,
        #ytkit-settings-panel .ytkit-feature-badge {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-feature-glyph {
            display: grid !important;
            place-items: center !important;
            width: 28px !important;
            height: 28px !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-feature-glyph svg {
            width: 20px !important;
            height: 20px !important;
        }

        #ytkit-settings-panel .ytkit-feature-info {
            display: block !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-name {
            margin: 0 !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 16px !important;
            font-weight: 650 !important;
            line-height: 1.3 !important;
            letter-spacing: -0.008em !important;
        }

        #ytkit-settings-panel .ytkit-feature-desc {
            display: block !important;
            max-width: 640px !important;
            margin: 4px 0 0 !important;
            overflow: hidden !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14px !important;
            font-weight: 430 !important;
            line-height: 1.4 !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
        }

        /* Known-breakage notice. Wraps, unlike the description above it: this
           is the one line on the card the user has to actually read. */
        #ytkit-settings-panel .ytkit-feature-broken-note {
            display: block !important;
            max-width: 640px !important;
            margin: 6px 0 0 !important;
            color: var(--ytkit-v3-warning) !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            line-height: 1.45 !important;
            white-space: normal !important;
        }

        #ytkit-settings-panel .ytkit-feature-broken-link {
            color: inherit !important;
            text-decoration: underline !important;
        }

        #ytkit-settings-panel .ytkit-select-shell,
        #ytkit-settings-panel .ytkit-field-shell,
        #ytkit-settings-panel .ytkit-range-shell,
        #ytkit-settings-panel .ytkit-color-shell,
        #ytkit-settings-panel .ytkit-feature-custom {
            justify-self: stretch !important;
            width: 100% !important;
            max-width: 300px !important;
            margin: 0 !important;
        }

        #ytkit-settings-panel .ytkit-select-shell-chrome {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-select {
            width: 100% !important;
            min-height: 44px !important;
            padding: 0 42px 0 14px !important;
            border: 0 !important;
            border-radius: 6px !important;
            background: var(--ytkit-v3-surface) !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 14px !important;
            font-weight: 560 !important;
            box-shadow: inset 0 0 0 1px var(--ytkit-v3-control-stroke) !important;
        }

        #ytkit-settings-panel .ytkit-select:hover {
            background: var(--ytkit-v3-surface-raised) !important;
            box-shadow: inset 0 0 0 1px rgba(var(--ytkit-v3-accent-rgb),0.30) !important;
        }

        #ytkit-settings-panel .ytkit-select:focus-visible,
        #ytkit-settings-panel .ytkit-input:focus-visible,
        #ytkit-settings-panel .ytkit-vh-number:focus-visible {
            outline: 0 !important;
            box-shadow: inset 0 0 0 1px rgba(var(--ytkit-v3-accent-rgb),0.80), 0 0 0 3px rgba(var(--ytkit-v3-accent-rgb),0.14) !important;
        }

        /* The command-center reset sheet clears button shadows with
           !important. Keep the actual keyboard lane equally strong so
           :focus-visible remains visible on actions, tabs, and links. */
        #ytkit-settings-panel button:focus-visible,
        #ytkit-settings-panel input:focus-visible,
        #ytkit-settings-panel select:focus-visible,
        #ytkit-settings-panel textarea:focus-visible,
        #ytkit-settings-panel a:focus-visible {
            outline: 0 !important;
            box-shadow: 0 0 0 2px var(--ytkit-v3-bg), 0 0 0 4px rgba(var(--ytkit-v3-accent-rgb), 0.75) !important;
            border-color: var(--ytkit-v3-accent) !important;
        }

        #ytkit-settings-panel .ytkit-switch {
            position: relative !important;
            justify-self: end !important;
            width: 46px !important;
            min-width: 46px !important;
            height: 26px !important;
            min-height: 26px !important;
            border: 0 !important;
            border-radius: 6px !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-switch .ytkit-switch-track {
            position: absolute !important;
            inset: 0 !important;
            border: 0 !important;
            border-radius: 6px !important;
            background: var(--ytkit-v3-surface-raised) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-switch .ytkit-switch-thumb {
            top: 3px !important;
            inset-inline-start: 3px !important;
            inset-inline-end: auto !important;
            width: 20px !important;
            height: 20px !important;
            border: 0 !important;
            border-radius: 4px !important;
            background: #e8edf2 !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.32) !important;
            transform: none !important;
        }

        #ytkit-settings-panel .ytkit-switch.active .ytkit-switch-track {
            border-color: transparent !important;
            background: var(--ytkit-v3-accent) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-switch.active .ytkit-switch-thumb {
            inset-inline-start: 23px !important;
            inset-inline-end: auto !important;
            background: #fff !important;
            transform: none !important;
        }

        /* The toggle's <input> is opacity:0 and this sheet resets the track's
           box-shadow, so without an explicit rule here the panel's primary
           control has NO visible keyboard focus indicator (the lower-
           specificity command-center focus rules lose the !important war). */
        #ytkit-settings-panel .ytkit-switch:focus-within .ytkit-switch-track {
            border-color: var(--ytkit-v3-accent) !important;
            box-shadow: 0 0 0 2px var(--ytkit-v3-bg), 0 0 0 4px rgba(var(--ytkit-v3-accent-rgb), 0.75) !important;
        }

        #ytkit-settings-panel .ytkit-switch-icon {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-textarea-card,
        #ytkit-settings-panel .ytkit-range-card,
        #ytkit-settings-panel .ytkit-color-card,
        #ytkit-settings-panel .ytkit-feature-card:has(.ytkit-feature-custom) {
            grid-template-columns: minmax(0, 1fr) minmax(220px, 360px) !important;
            min-height: 92px !important;
        }

        #ytkit-settings-panel .ytkit-input,
        #ytkit-settings-panel .ytkit-vh-number {
            border: 0 !important;
            border-radius: 6px !important;
            background: var(--ytkit-v3-surface) !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 14px !important;
            box-shadow: inset 0 0 0 1px var(--ytkit-v3-control-stroke) !important;
        }

        #ytkit-settings-panel .ytkit-sub-features {
            display: block !important;
            margin-block: 0 8px !important;
            margin-inline: 18px 0 !important;
            padding-block: 0 !important;
            padding-inline: 18px 0 !important;
            border: 0 !important;
            border-inline-start: 1px solid rgba(var(--ytkit-v3-accent-rgb),0.28) !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-sub-card {
            min-height: 62px !important;
            padding-block: 10px !important;
        }

        #ytkit-settings-panel .ytkit-sub-card .ytkit-feature-name {
            font-size: 15px !important;
        }

        #ytkit-settings-panel .ytkit-sub-card .ytkit-feature-desc {
            font-size: 13.25px !important;
        }

        #ytkit-settings-panel .ytkit-insights {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-insight-section {
            margin: 0 0 26px !important;
            padding: 0 !important;
            border: 0 !important;
        }

        #ytkit-settings-panel .ytkit-insight-section[data-ytkit-insight-section="recent-activity"] {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-insight-heading {
            margin: 0 0 14px !important;
            color: var(--ytkit-v3-text) !important;
            font-size: 15px !important;
            font-weight: 680 !important;
            line-height: 1.3 !important;
            letter-spacing: 0 !important;
            text-transform: none !important;
        }

        #ytkit-settings-panel .ytkit-insight-card,
        #ytkit-settings-panel .ytkit-status-card,
        #ytkit-settings-panel .ytkit-backup-card {
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-status-hero {
            display: block !important;
            margin: 0 0 10px !important;
            padding: 0 0 14px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-v3-border) !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-status-hero-icon,
        #ytkit-settings-panel .ytkit-status-hero-copy span {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-status-hero-copy strong {
            color: var(--ytkit-v3-success) !important;
            font-size: 14px !important;
            font-weight: 680 !important;
        }

        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row[data-ytkit-insight="extension"],
        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row[data-ytkit-insight="enabled"],
        #ytkit-settings-panel .ytkit-status-card .ytkit-status-row[data-ytkit-insight="profile"] {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            gap: 10px !important;
            min-height: 34px !important;
            padding: 7px 0 !important;
            border: 0 !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-status-dot {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-status-label,
        #ytkit-settings-panel .ytkit-status-value {
            color: var(--ytkit-v3-muted) !important;
            font-size: 12.5px !important;
            font-weight: 500 !important;
        }

        #ytkit-settings-panel .ytkit-status-value {
            color: var(--ytkit-v3-text) !important;
            font-weight: 620 !important;
            text-align: right !important;
        }

        #ytkit-settings-panel .ytkit-backup-card .ytkit-status-row {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-rail-action {
            width: auto !important;
            min-height: 40px !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            box-shadow: none !important;
            justify-content: flex-start !important;
        }

        #ytkit-settings-panel .ytkit-rail-action:hover {
            color: var(--ytkit-v3-accent) !important;
        }

        #ytkit-settings-panel .ytkit-footer {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto !important;
            align-items: center !important;
            gap: 24px !important;
            min-height: 58px !important;
            padding: 0 20px !important;
            border: 0 !important;
            border-top: 1px solid var(--ytkit-v3-border) !important;
            background: var(--ytkit-v3-bg) !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-panel-status {
            display: block !important;
            flex: 0 1 auto !important;
            width: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            line-height: 1.4 !important;
            text-align: start !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-panel-status::before,
        #ytkit-settings-panel .ytkit-panel-status::after {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-right,
        #ytkit-settings-panel .ytkit-footer-actions {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            gap: 8px !important;
            width: auto !important;
            /* Wrap instead of overflowing. Without this the footer is a single
               unwrappable row, so at a 320 CSS-pixel viewport (WCAG 1.4.10
               reflow) the Done button was pushed 13px past the panel edge and
               could not be clicked. */
            flex-wrap: wrap !important;
            max-width: 100% !important;
        }

        #ytkit-settings-panel #ytkit-reset-active-section {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn {
            min-width: 0 !important;
            min-height: 40px !important;
            padding: 0 14px !important;
            border: 1px solid transparent !important;
            border-radius: 6px !important;
            background: var(--ytkit-v3-surface) !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14px !important;
            font-weight: 620 !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn svg {
            display: block !important;
            width: 16px !important;
            height: 16px !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn:hover {
            border-color: var(--ytkit-v3-border-strong) !important;
            background: var(--ytkit-v3-surface-raised) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary {
            min-width: 112px !important;
            padding-inline: 22px !important;
            border-color: transparent !important;
            background: var(--ytkit-v3-accent-fill) !important;
            color: #fff !important;
            box-shadow: none !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary:hover {
            background: var(--ytkit-v3-accent-fill-hover) !important;
            color: #fff !important;
        }

        html:not([dark]) #ytkit-settings-panel {
            --ytkit-v3-bg: #f7f8fa;
            --ytkit-v3-rail: #eceff4;
            --ytkit-v3-panel: #ffffff;
            --ytkit-v3-surface: #eef1f5;
            --ytkit-v3-surface-raised: #e7ebf0;
            --ytkit-v3-hover: rgba(15,23,42,0.045);
            --ytkit-v3-border: rgba(15,23,42,0.10);
            --ytkit-v3-border-strong: rgba(15,23,42,0.16);
            --ytkit-v3-control-stroke: rgba(15,23,42,0.07);
            --ytkit-v3-text: #17202b;
            --ytkit-v3-muted: #5f6b79;
            /* #7d8997 on #f7f8fa was 3.36:1 — below AA for the placeholder,
               version, and nav-count text that consume this token. */
            --ytkit-v3-subtle: #66707d;
            --ytkit-v3-accent: #cf352f;
            --ytkit-v3-accent-rgb: 207,53,47;
            --ytkit-v3-success: #168845;
            /* The dark lane's amber is 1.36:1 on this ground. 6.01:1 here. */
            --ytkit-v3-warning: #8a5200;
            color-scheme: light !important;
            background: var(--ytkit-v3-bg) !important;
            color: var(--ytkit-v3-text) !important;
            box-shadow: 0 28px 80px rgba(15,23,42,0.26) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-header,
        html:not([dark]) #ytkit-settings-panel .ytkit-content,
        html:not([dark]) #ytkit-settings-panel .ytkit-footer {
            background: var(--ytkit-v3-bg) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-sidebar {
            background: var(--ytkit-v3-rail) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-feature-card {
            background: rgba(255,255,255,0.32) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-insights {
            background: rgba(15,23,42,0.012) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-switch .ytkit-switch-thumb {
            background: #fff !important;
        }

        @media (max-width: 1180px) and (min-width: 901px) {
            #ytkit-settings-panel .ytkit-header {
                grid-template-columns: 220px minmax(280px, 1fr) auto !important;
                gap: 16px !important;
            }

            #ytkit-settings-panel .ytkit-body {
                grid-template-columns: 210px minmax(0, 1fr) !important;
            }

            #ytkit-settings-panel .ytkit-insights {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-content {
                padding-inline: 32px !important;
            }

            #ytkit-settings-panel .ytkit-pane-header {
                grid-template-columns: minmax(0, 1fr) auto !important;
            }

            #ytkit-settings-panel .ytkit-pane-context {
                display: none !important;
            }
        }

        @media (max-width: 900px) {
            #ytkit-settings-panel {
                width: min(100vw - 20px, 760px) !important;
                height: min(95vh, 920px) !important;
                max-height: min(95vh, 920px) !important;
                border-radius: 12px !important;
            }

            #ytkit-settings-panel .ytkit-header {
                grid-template-columns: minmax(0, 1fr) auto !important;
                grid-template-areas:
                    "brand actions"
                    "search search" !important;
                gap: 12px !important;
                min-height: auto !important;
                padding: 14px !important;
            }

            #ytkit-settings-panel .ytkit-header-live {
                display: block !important;
                font-size: 12.5px !important;
            }

            #ytkit-settings-panel .ytkit-body {
                display: flex !important;
                flex-direction: column !important;
                min-height: 0 !important;
            }

            #ytkit-settings-panel .ytkit-sidebar {
                display: block !important;
                flex: 0 0 66px !important;
                width: 100% !important;
                min-height: 66px !important;
                height: 66px !important;
                padding: 8px 12px !important;
                border: 0 !important;
                border-bottom: 1px solid var(--ytkit-v3-border) !important;
                overflow: hidden !important;
            }

            #ytkit-settings-panel .ytkit-nav-list {
                display: grid !important;
                grid-template-columns: none !important;
                grid-auto-flow: column !important;
                grid-auto-columns: minmax(142px, 170px) !important;
                width: 100% !important;
                height: 50px !important;
                gap: 4px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
            }

            #ytkit-settings-panel .ytkit-nav-group-label,
            #ytkit-settings-panel .ytkit-pane-context {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn {
                min-height: 48px !important;
                padding-inline: 10px !important;
            }

            #ytkit-settings-panel .ytkit-sidebar-footer {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-content {
                flex: 1 1 auto !important;
                padding: 24px !important;
            }

            #ytkit-settings-panel .ytkit-pane-header {
                grid-template-columns: minmax(0, 1fr) auto !important;
            }

            #ytkit-settings-panel .ytkit-insights {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-footer {
                min-height: 68px !important;
                padding: 10px 16px !important;
            }
        }

        /* At narrow desktop zoom the content viewport can be shorter than
           the command header. A sticky header that is taller than that
           viewport becomes a permanent overlay over every focused control;
           let the header scroll normally in this reflow lane. */
        @media (max-width: 720px) {
            #ytkit-settings-panel .ytkit-pane-header {
                position: static !important;
                min-height: 0 !important;
            }
        }

        @media (max-width: 560px) {
            #ytkit-settings-panel {
                width: 100vw !important;
                height: 100vh !important;
                max-height: 100vh !important;
                border: 0 !important;
                border-radius: 0 !important;
            }

            #ytkit-settings-panel .ytkit-header {
                padding: 12px 14px !important;
            }

            #ytkit-settings-panel .ytkit-brand-copy {
                gap: 9px !important;
            }

            #ytkit-settings-panel .ytkit-brand-lockup {
                gap: 9px !important;
            }

            #ytkit-settings-panel .ytkit-eyebrow {
                font-size: 16px !important;
            }

            #ytkit-settings-panel .ytkit-title {
                font-size: 12px !important;
            }

            #ytkit-settings-panel .ytkit-brand-mark {
                width: 32px !important;
                min-width: 32px !important;
                height: 32px !important;
            }

            #ytkit-settings-panel .ytkit-brand-image {
                width: 28px !important;
                height: 28px !important;
            }

            #ytkit-settings-panel .ytkit-command-search {
                height: 44px !important;
                min-height: 44px !important;
            }

            #ytkit-settings-panel .ytkit-nav-list {
                grid-auto-columns: minmax(144px, 164px) !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn {
                grid-template-columns: 24px minmax(0, 1fr) !important;
                gap: 8px !important;
            }

            #ytkit-settings-panel .ytkit-nav-count {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn.active .ytkit-nav-count {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-header-actions {
                gap: 8px !important;
            }

            #ytkit-settings-panel .ytkit-header-live {
                display: grid !important;
                place-items: center !important;
                width: 14px !important;
                min-width: 14px !important;
                height: 14px !important;
                min-height: 14px !important;
                overflow: visible !important;
                font-size: 0 !important;
            }

            #ytkit-settings-panel .ytkit-header-live-dot {
                display: block !important;
                width: 8px !important;
                height: 8px !important;
                border-radius: 50% !important;
                background: var(--ytkit-v3-success) !important;
                box-shadow: 0 0 0 3px rgba(34,197,94,0.16) !important;
            }

            #ytkit-settings-panel .ytkit-content {
                padding: 20px 18px 28px !important;
            }

            #ytkit-settings-panel .ytkit-pane-header {
                display: block !important;
                margin-bottom: 14px !important;
                padding-bottom: 16px !important;
            }

            #ytkit-settings-panel .ytkit-pane-title h2 {
                font-size: 24px !important;
            }

            #ytkit-settings-panel .ytkit-pane-actions {
                justify-content: space-between !important;
                margin-top: 14px !important;
            }

            #ytkit-settings-panel .ytkit-feature-card,
            #ytkit-settings-panel .ytkit-textarea-card,
            #ytkit-settings-panel .ytkit-range-card,
            #ytkit-settings-panel .ytkit-color-card,
            #ytkit-settings-panel .ytkit-feature-card:has(.ytkit-feature-custom) {
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 14px !important;
                min-height: 0 !important;
                padding: 16px 0 !important;
            }

            #ytkit-settings-panel .ytkit-features-grid {
                padding-inline: 16px !important;
            }

            #ytkit-settings-panel .ytkit-feature-name {
                font-size: 15.5px !important;
            }

            /* No line clamp here. The later top-level .ytkit-feature-desc rule
               sets overflow: visible, and being later it wins — so the clamp
               produced a two-line-tall box with a third line painting outside
               it, sheared horizontally behind the select control. A clamp needs
               overflow: hidden to be a clamp at all. Descriptions wrap fully at
               every width now, which is what the later rule already intended. */
            #ytkit-settings-panel .ytkit-feature-desc {
                font-size: 13px !important;
                display: block !important;
                white-space: normal !important;
            }

            #ytkit-settings-panel .ytkit-select-shell,
            #ytkit-settings-panel .ytkit-field-shell,
            #ytkit-settings-panel .ytkit-range-shell,
            #ytkit-settings-panel .ytkit-color-shell,
            #ytkit-settings-panel .ytkit-feature-custom {
                justify-self: stretch !important;
                width: 100% !important;
                max-width: none !important;
            }

            #ytkit-settings-panel .ytkit-switch {
                justify-self: start !important;
            }

            #ytkit-settings-panel .ytkit-feature-main {
                grid-template-columns: minmax(0, 1fr) !important;
            }

            #ytkit-settings-panel .ytkit-feature-glyph {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-sub-features {
                margin-left: 8px !important;
                padding-left: 14px !important;
            }

            #ytkit-settings-panel .ytkit-footer {
                grid-template-columns: 1fr !important;
                gap: 8px !important;
                min-height: 0 !important;
                padding: 10px 14px !important;
            }

            #ytkit-settings-panel .ytkit-panel-status {
                overflow: hidden !important;
                font-size: 12.5px !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            #ytkit-settings-panel .ytkit-footer-right,
            #ytkit-settings-panel .ytkit-footer-actions {
                width: 100% !important;
            }

            #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn {
                flex: 1 1 0 !important;
                min-height: 42px !important;
                padding-inline: 10px !important;
            }

            #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary {
                min-width: 0 !important;
            }
        }

        /* v5 command-deck parity overrides. Kept after every legacy breakpoint
           so the imagegen-approved hierarchy is the final rendered contract. */
        #ytkit-settings-panel {
            width: min(1540px, calc(100vw - 24px)) !important;
            height: min(96vh, 980px) !important;
            max-height: min(96vh, 980px) !important;
            border-radius: 12px !important;
            background: var(--ytkit-v3-bg) !important;
            box-shadow: 0 24px 64px rgba(0,0,0,0.52) !important;
        }

        #ytkit-settings-panel .ytkit-header {
            grid-template-columns: 300px minmax(320px, 1fr) auto !important;
            gap: 22px !important;
            min-height: 66px !important;
            padding: 0 24px !important;
            background: rgba(8,17,29,0.82) !important;
        }

        #ytkit-settings-panel .ytkit-command-search {
            height: 48px !important;
            min-height: 48px !important;
            border-radius: 8px !important;
            background: rgba(17,29,43,0.92) !important;
        }

        #ytkit-settings-panel .ytkit-header-live {
            display: inline-flex !important;
            align-items: center !important;
            gap: 9px !important;
        }

        #ytkit-settings-panel .ytkit-header-live-switch {
            position: relative !important;
            display: inline-block !important;
            width: 38px !important;
            height: 22px !important;
            margin-inline-start: 2px !important;
            border-radius: 6px !important;
            background: var(--ytkit-v3-accent) !important;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.13) !important;
        }

        #ytkit-settings-panel .ytkit-header-live-switch-thumb {
            position: absolute !important;
            top: 3px !important;
            inset-inline-end: 3px !important;
            display: block !important;
            width: 16px !important;
            height: 16px !important;
            border-radius: 4px !important;
            background: #fff !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.34) !important;
        }

        #ytkit-settings-panel .ytkit-body {
            grid-template-columns: 300px minmax(0, 1fr) !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-sidebar {
            padding: 20px 16px 14px !important;
            background: var(--ytkit-v3-rail) !important;
        }

        #ytkit-settings-panel .ytkit-nav-list {
            gap: 4px !important;
        }

        #ytkit-settings-panel .ytkit-nav-group-label {
            display: none !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn {
            grid-template-columns: 30px minmax(0, 1fr) auto !important;
            min-height: 50px !important;
            padding: 0 14px !important;
            border-radius: 8px !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn::before {
            top: 0 !important;
            bottom: 0 !important;
            width: 3px !important;
            border-radius: 0 3px 3px 0 !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active {
            background: rgba(var(--ytkit-v3-accent-rgb),0.11) !important;
        }

        #ytkit-settings-panel .ytkit-nav-label {
            font-size: 15.5px !important;
            font-weight: 620 !important;
        }

        #ytkit-settings-panel .ytkit-nav-count {
            min-width: 39px !important;
            padding: 3px 6px !important;
            border-radius: 4px !important;
            background: rgba(151,178,208,0.07) !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 11.5px !important;
            font-variant-numeric: tabular-nums !important;
            text-align: center !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active .ytkit-nav-count {
            background: rgba(var(--ytkit-v3-accent-rgb),0.10) !important;
            color: var(--ytkit-v3-text) !important;
        }

        #ytkit-settings-panel .ytkit-content {
            padding: 18px 22px 30px !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-pane-header {
            grid-template-columns: minmax(360px, 1fr) minmax(390px, 0.95fr) !important;
            grid-template-areas:
                "lead context"
                "lead actions" !important;
            gap: 8px 20px !important;
            min-height: 132px !important;
            margin: 0 !important;
            padding: 16px 18px !important;
            border: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 12px !important;
            background: var(--ytkit-v3-panel) !important;
            background-color: var(--ytkit-v3-bg) !important;
            box-shadow: 0 -20px 0 var(--ytkit-v3-bg), 0 10px 28px rgba(0,0,0,0.18) !important;
        }

        #ytkit-settings-panel .ytkit-pane-lead {
            grid-area: lead !important;
            display: grid !important;
            grid-template-columns: 82px minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 18px !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-pane-icon {
            position: relative !important;
            display: grid !important;
            place-items: center !important;
            width: 78px !important;
            height: 78px !important;
            border: 1px solid color-mix(in srgb, var(--cat-color, var(--ytkit-v3-accent)) 38%, transparent) !important;
            border-radius: 12px !important;
            background: color-mix(in srgb, var(--cat-color, var(--ytkit-v3-accent)) 12%, var(--ytkit-v3-surface)) !important;
            color: var(--ytkit-v3-text) !important;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 24px rgba(0,0,0,0.16) !important;
        }

        #ytkit-settings-panel .ytkit-pane-icon svg {
            width: 36px !important;
            height: 36px !important;
            stroke-width: 1.65 !important;
        }

        #ytkit-settings-panel .ytkit-pane-title h2 {
            font-size: 30px !important;
            font-weight: 735 !important;
            line-height: 1.08 !important;
        }

        #ytkit-settings-panel .ytkit-pane-description {
            max-width: 600px !important;
            margin-top: 7px !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14.5px !important;
            white-space: normal !important;
        }

        #ytkit-settings-panel .ytkit-pane-meta {
            margin-top: 11px !important;
        }

        #ytkit-settings-panel .ytkit-pane-chip {
            font-size: 10.5px !important;
            font-weight: 670 !important;
            letter-spacing: 0.09em !important;
            text-transform: uppercase !important;
        }

        #ytkit-settings-panel .ytkit-pane-context {
            grid-area: context !important;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 10px !important;
            min-width: 0 !important;
            border: 0 !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-item {
            display: grid !important;
            grid-template-columns: 28px minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 9px !important;
            min-width: 0 !important;
            min-height: 60px !important;
            padding: 9px 11px !important;
            border: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 8px !important;
            background: rgba(8,17,29,0.28) !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-icon {
            display: grid !important;
            place-items: center !important;
            width: 28px !important;
            height: 28px !important;
            color: var(--ytkit-v3-muted) !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-icon svg {
            width: 22px !important;
            height: 22px !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-copy {
            display: block !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-label {
            color: var(--ytkit-v3-subtle) !important;
            font-size: 10.5px !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-value {
            margin-top: 3px !important;
            font-size: 12.5px !important;
            font-weight: 650 !important;
        }

        #ytkit-settings-panel .ytkit-pane-actions {
            grid-area: actions !important;
            grid-column: auto !important;
            justify-self: end !important;
            gap: 8px !important;
        }

        #ytkit-settings-panel .ytkit-reset-group-btn,
        #ytkit-settings-panel .ytkit-toggle-all {
            min-height: 32px !important;
        }

        #ytkit-settings-panel .ytkit-features-grid {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 16px !important;
            margin: 16px 0 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            overflow: visible !important;
        }

        #ytkit-settings-panel .ytkit-feature-section {
            display: block !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-feature-section-title {
            margin: 0 0 7px 14px !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 10.5px !important;
            font-weight: 680 !important;
            line-height: 1.2 !important;
            letter-spacing: 0.09em !important;
            text-transform: uppercase !important;
        }

        #ytkit-settings-panel .ytkit-feature-section-body {
            overflow: hidden !important;
            border: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 10px !important;
            background: var(--ytkit-v3-panel) !important;
        }

        #ytkit-settings-panel .ytkit-shorts-dependency {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
            padding: 10px 14px !important;
            border-top: 1px solid var(--ytkit-v3-border) !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 12px !important;
        }

        #ytkit-settings-panel .ytkit-shorts-dependency button {
            flex: none !important;
            min-height: 32px !important;
            padding: 6px 10px !important;
            border: 1px solid var(--ytkit-v3-border-strong) !important;
            border-radius: 6px !important;
            background: var(--ytkit-v3-surface) !important;
            color: var(--ytkit-v3-text) !important;
            font: inherit !important;
            font-size: 12px !important;
            font-weight: 650 !important;
            line-height: 1.2 !important;
            cursor: pointer !important;
        }

        #ytkit-settings-panel .ytkit-shorts-dependency button:hover {
            background: var(--ytkit-v3-surface-raised) !important;
        }

        #ytkit-settings-panel .ytkit-feature-card {
            grid-template-columns: minmax(0, 1fr) minmax(190px, 300px) !important;
            gap: 28px !important;
            min-height: 70px !important;
            padding: 10px 16px !important;
            background: transparent !important;
        }

        #ytkit-settings-panel .ytkit-feature-card.ytkit-card-enabled {
            background: rgba(var(--ytkit-v3-accent-rgb),0.075) !important;
        }

        #ytkit-settings-panel .ytkit-feature-card.ytkit-card-enabled::before {
            display: block !important;
            width: 3px !important;
        }

        #ytkit-settings-panel .ytkit-feature-main {
            grid-template-columns: 48px minmax(0, 1fr) !important;
            gap: 14px !important;
        }

        #ytkit-settings-panel .ytkit-feature-glyph {
            display: grid !important;
            place-items: center !important;
            width: 44px !important;
            min-width: 44px !important;
            height: 44px !important;
            border: 1px solid var(--ytkit-v3-control-stroke) !important;
            border-radius: 8px !important;
            background: rgba(23,36,55,0.72) !important;
            color: var(--ytkit-v3-muted) !important;
        }

        #ytkit-settings-panel .ytkit-feature-glyph svg {
            width: 21px !important;
            height: 21px !important;
        }

        #ytkit-settings-panel .ytkit-feature-name {
            font-size: 16px !important;
            font-weight: 650 !important;
        }

        #ytkit-settings-panel .ytkit-feature-desc {
            margin-top: 3px !important;
            overflow: visible !important;
            color: var(--ytkit-v3-muted) !important;
            font-size: 14px !important;
            line-height: 1.4 !important;
            text-overflow: clip !important;
            white-space: normal !important;
        }

        #ytkit-settings-panel .ytkit-select,
        #ytkit-settings-panel .ytkit-input {
            min-height: 44px !important;
            border-radius: 8px !important;
            background: rgba(23,36,55,0.96) !important;
        }

        #ytkit-settings-panel .ytkit-sub-features {
            margin: 0 0 0 24px !important;
            padding: 0 0 0 18px !important;
            border-inline-start: 1px solid rgba(var(--ytkit-v3-accent-rgb),0.38) !important;
        }

        #ytkit-settings-panel .ytkit-sub-features .ytkit-feature-card {
            min-height: 62px !important;
            padding-block: 8px !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner,
        #ytkit-settings-panel .ytkit-mediadl-banner[data-state] {
            margin: 14px 0 0 !important;
            padding: 12px 14px !important;
            border: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 10px !important;
            background: rgba(17,29,43,0.92) !important;
        }

        #ytkit-settings-panel .ytkit-mediadl-banner__btn {
            min-height: 42px !important;
            padding-inline: 14px !important;
        }

        #ytkit-settings-panel .ytkit-footer {
            min-height: 64px !important;
            padding: 0 24px !important;
            background: rgba(8,17,29,0.96) !important;
        }

        #ytkit-settings-panel .ytkit-panel-status {
            display: inline-flex !important;
            align-items: center !important;
            gap: 9px !important;
        }

        #ytkit-settings-panel .ytkit-panel-status::before {
            content: "✓" !important;
            display: grid !important;
            place-items: center !important;
            width: 22px !important;
            height: 22px !important;
            border: 1px solid currentColor !important;
            border-radius: 50% !important;
            font-size: 12px !important;
            line-height: 1 !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn {
            min-height: 44px !important;
            padding-inline: 17px !important;
            border-color: var(--ytkit-v3-border) !important;
            background: rgba(17,29,43,0.9) !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary {
            min-width: 126px !important;
            border-color: transparent !important;
            background: var(--ytkit-v3-accent-fill) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-header,
        html:not([dark]) #ytkit-settings-panel .ytkit-footer {
            background: rgba(247,248,250,0.96) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-command-search,
        html:not([dark]) #ytkit-settings-panel .ytkit-select,
        html:not([dark]) #ytkit-settings-panel .ytkit-input,
        /* :not(.ytkit-btn-primary) — this light-lane rule carries a higher
           specificity than the primary button's accent fill, so without the
           exclusion the Done button painted itself pale grey while keeping
           color:#fff, i.e. white text on near-white. */
        html:not([dark]) #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn:not(.ytkit-btn-primary) {
            background: rgba(238,241,245,0.98) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary {
            background: var(--ytkit-v3-accent-fill) !important;
            color: #fff !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-sidebar {
            background: var(--ytkit-v3-rail) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-pane-header {
            background: rgba(255,255,255,0.96) !important;
            background-color: var(--ytkit-v3-bg) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-pane-context-item,
        html:not([dark]) #ytkit-settings-panel .ytkit-feature-section-body,
        html:not([dark]) #ytkit-settings-panel .ytkit-mediadl-banner,
        html:not([dark]) #ytkit-settings-panel .ytkit-mediadl-banner[data-state] {
            background: rgba(255,255,255,0.92) !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-feature-glyph {
            background: rgba(238,241,245,0.88) !important;
        }

        @media (max-width: 1180px) and (min-width: 901px) {
            #ytkit-settings-panel .ytkit-header {
                grid-template-columns: 220px minmax(280px, 1fr) auto !important;
            }

            #ytkit-settings-panel .ytkit-body {
                grid-template-columns: 220px minmax(0, 1fr) !important;
            }

            #ytkit-settings-panel .ytkit-content {
                padding-inline: 18px !important;
            }

            #ytkit-settings-panel .ytkit-pane-header {
                grid-template-columns: minmax(0, 1fr) !important;
                grid-template-areas:
                    "lead"
                    "context"
                    "actions" !important;
            }

            #ytkit-settings-panel .ytkit-pane-context {
                display: grid !important;
            }
        }

        @media (max-width: 900px) {
            #ytkit-settings-panel {
                width: min(100vw - 20px, 760px) !important;
                height: min(95vh, 920px) !important;
                max-height: min(95vh, 920px) !important;
            }

            #ytkit-settings-panel .ytkit-header {
                grid-template-columns: minmax(0, 1fr) auto !important;
                grid-template-areas:
                    "brand actions"
                    "search search" !important;
                gap: 12px !important;
                min-height: auto !important;
                padding: 14px !important;
            }

            #ytkit-settings-panel .ytkit-body {
                display: flex !important;
                flex-direction: column !important;
            }

            #ytkit-settings-panel .ytkit-sidebar {
                display: block !important;
                flex: 0 0 66px !important;
                width: 100% !important;
                height: 66px !important;
                min-height: 66px !important;
                padding: 8px 12px !important;
                border-right: 0 !important;
                border-bottom: 1px solid var(--ytkit-v3-border) !important;
            }

            #ytkit-settings-panel .ytkit-nav-list {
                display: grid !important;
                grid-template-columns: none !important;
                grid-auto-flow: column !important;
                grid-auto-columns: minmax(150px, 178px) !important;
                height: 50px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
            }

            #ytkit-settings-panel .ytkit-content {
                flex: 1 1 auto !important;
                padding: 18px !important;
            }

            #ytkit-settings-panel .ytkit-pane-header {
                grid-template-columns: minmax(0, 1fr) !important;
                grid-template-areas:
                    "lead"
                    "actions" !important;
                min-height: 0 !important;
            }

            #ytkit-settings-panel .ytkit-pane-context {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-pane-actions {
                justify-self: stretch !important;
                justify-content: space-between !important;
            }
        }

        @media (max-width: 560px) {
            #ytkit-settings-panel {
                width: 100vw !important;
                height: 100vh !important;
                max-height: 100vh !important;
                border: 0 !important;
                border-radius: 0 !important;
            }

            #ytkit-settings-panel .ytkit-header-live-switch {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-content {
                padding: 14px 12px 22px !important;
            }

            #ytkit-settings-panel .ytkit-pane-header {
                display: grid !important;
                margin: 0 !important;
                padding: 14px !important;
                border-radius: 10px !important;
            }

            #ytkit-settings-panel .ytkit-pane-lead {
                grid-template-columns: 54px minmax(0, 1fr) !important;
                gap: 12px !important;
            }

            #ytkit-settings-panel .ytkit-pane-icon {
                width: 52px !important;
                height: 52px !important;
                border-radius: 10px !important;
            }

            #ytkit-settings-panel .ytkit-pane-icon svg {
                width: 26px !important;
                height: 26px !important;
            }

            #ytkit-settings-panel .ytkit-pane-title h2 {
                font-size: 23px !important;
            }

            #ytkit-settings-panel .ytkit-pane-description {
                font-size: 13px !important;
            }

            #ytkit-settings-panel .ytkit-features-grid {
                gap: 14px !important;
                padding: 0 !important;
            }

            #ytkit-settings-panel .ytkit-feature-section-title {
                margin-inline-start: 8px !important;
            }

            #ytkit-settings-panel .ytkit-feature-card,
            #ytkit-settings-panel .ytkit-textarea-card,
            #ytkit-settings-panel .ytkit-range-card,
            #ytkit-settings-panel .ytkit-color-card,
            #ytkit-settings-panel .ytkit-feature-card:has(.ytkit-feature-custom) {
                grid-template-columns: minmax(0, 1fr) !important;
                gap: 12px !important;
                min-height: 0 !important;
                padding: 14px !important;
            }

            #ytkit-settings-panel .ytkit-feature-main {
                grid-template-columns: minmax(0, 1fr) !important;
            }

            #ytkit-settings-panel .ytkit-feature-glyph {
                display: none !important;
            }

            #ytkit-settings-panel .ytkit-sub-features {
                margin-inline-start: 10px !important;
                padding-inline-start: 10px !important;
            }

            #ytkit-settings-panel .ytkit-footer {
                grid-template-columns: 1fr !important;
                gap: 8px !important;
                min-height: 0 !important;
                padding: 10px 12px !important;
            }

            #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn-primary {
                min-width: 0 !important;
            }
        }

        /* v6 desktop parity pass. These refinements are grounded in the
           eleven page-specific ImageGen references under outputs/: preserve
           the command-deck hierarchy while removing ellipsis-only labels and
           giving Video Hider the same mission header + summary rhythm. */
        @media (min-width: 1181px) {
            #ytkit-settings-panel .ytkit-header {
                grid-template-columns: 320px minmax(320px, 1fr) auto !important;
            }

            #ytkit-settings-panel .ytkit-body {
                grid-template-columns: 320px minmax(0, 1fr) !important;
            }
        }

        #ytkit-settings-panel .ytkit-nav-btn {
            min-height: 52px !important;
        }

        #ytkit-settings-panel .ytkit-nav-label,
        #ytkit-settings-panel .ytkit-pane-context-label,
        #ytkit-settings-panel .ytkit-pane-context-value {
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
        }

        #ytkit-settings-panel .ytkit-nav-label {
            line-height: 1.25 !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-item {
            min-height: 68px !important;
        }

        #ytkit-settings-panel .ytkit-pane-context-label,
        #ytkit-settings-panel .ytkit-pane-context-value {
            display: block !important;
            line-height: 1.25 !important;
        }

        #ytkit-settings-panel .ytkit-vh-pane .ytkit-pane-header {
            grid-template-columns: minmax(0, 1fr) auto !important;
            grid-template-areas: "lead actions" !important;
            align-items: center !important;
            min-height: 126px !important;
        }

        #ytkit-settings-panel .ytkit-vh-pane .ytkit-pane-actions {
            align-self: center !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 12px !important;
            margin: 16px 0 !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card {
            display: grid !important;
            grid-template-columns: 44px minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 12px !important;
            min-width: 0 !important;
            min-height: 82px !important;
            padding: 14px 16px !important;
            border: 1px solid var(--ytkit-v3-border) !important;
            border-radius: 10px !important;
            background: rgba(8,17,29,0.42) !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card__icon {
            display: grid !important;
            place-items: center !important;
            width: 44px !important;
            height: 44px !important;
            border: 1px solid rgba(var(--ytkit-v3-accent-rgb),0.2) !important;
            border-radius: 10px !important;
            background: rgba(var(--ytkit-v3-accent-rgb),0.1) !important;
            color: var(--ytkit-v3-accent) !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card[data-kind="allowed"] .ytkit-vh-summary-card__icon {
            border-color: rgba(16,185,129,0.22) !important;
            background: rgba(16,185,129,0.1) !important;
            color: #5ee2b3 !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card[data-kind="channels"] .ytkit-vh-summary-card__icon {
            border-color: rgba(245,158,11,0.22) !important;
            background: rgba(245,158,11,0.1) !important;
            color: #f6bf5d !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card__icon svg {
            width: 22px !important;
            height: 22px !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card__copy {
            display: grid !important;
            gap: 3px !important;
            min-width: 0 !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card__value {
            color: var(--ytkit-v3-text) !important;
            font-size: 23px !important;
            font-weight: 740 !important;
            line-height: 1 !important;
            font-variant-numeric: tabular-nums !important;
        }

        #ytkit-settings-panel .ytkit-vh-summary-card__label {
            color: var(--ytkit-v3-muted) !important;
            font-size: 12px !important;
            font-weight: 620 !important;
            line-height: 1.3 !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
        }

        #ytkit-settings-panel .ytkit-vh-tabs {
            margin-bottom: 16px !important;
            border-radius: 10px !important;
        }

        #ytkit-settings-panel #ytkit-vh-content > .ytkit-vh-hero.is-empty {
            place-content: center !important;
            justify-items: center !important;
            min-height: 150px !important;
            text-align: center !important;
        }

        html:not([dark]) #ytkit-settings-panel .ytkit-vh-summary-card {
            background: rgba(255,255,255,0.92) !important;
        }

        @media (max-width: 1180px) {
            #ytkit-settings-panel .ytkit-vh-summary {
                grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)) !important;
            }
        }

        /* Keep this final focus lane after the footer, light-theme, and
           breakpoint overrides above. Those rules intentionally use
           !important for their visual contract, so focus must do the same. */
        #ytkit-settings-panel button:focus-visible,
        #ytkit-settings-panel input:focus-visible,
        #ytkit-settings-panel select:focus-visible,
        #ytkit-settings-panel textarea:focus-visible,
        #ytkit-settings-panel a:focus-visible {
            outline: 0 !important;
            box-shadow: 0 0 0 2px #0b1421, 0 0 0 4px rgba(255,90,79,0.75) !important;
            border-color: #ff5a4f !important;
        }

        #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn:focus-visible {
            box-shadow: 0 0 0 2px #0b1421, 0 0 0 4px rgba(255,90,79,0.75) !important;
            border-color: #ff5a4f !important;
        }

        #ytkit-settings-panel .ytkit-command-search .ytkit-search-input:focus-visible {
            box-shadow: inset 0 0 0 1px rgba(255,90,79,0.80), 0 0 0 3px rgba(255,90,79,0.75) !important;
        }

        #ytkit-settings-panel .ytkit-nav-btn.active:focus-visible {
            box-shadow: 0 0 0 2px #0b1421, 0 0 0 4px rgba(255,90,79,0.75) !important;
        }

        /* Author display rules can override the browser's hidden UA rule;
           keep hidden dialog controls out of both sight and tab order. */
        #ytkit-settings-panel [hidden] {
            display: none !important;
        }

        @media (forced-colors: active) {
            #ytkit-settings-panel,
            #ytkit-settings-panel .ytkit-command-search,
            #ytkit-settings-panel .ytkit-select,
            #ytkit-settings-panel .ytkit-input {
                border-color: CanvasText !important;
            }

            #ytkit-settings-panel button:focus-visible,
            #ytkit-settings-panel input:focus-visible,
            #ytkit-settings-panel select:focus-visible,
            #ytkit-settings-panel textarea:focus-visible,
            #ytkit-settings-panel a:focus-visible,
            #ytkit-settings-panel .ytkit-footer-actions .ytkit-btn:focus-visible {
                outline: 2px solid Highlight !important;
                outline-offset: 2px !important;
                box-shadow: none !important;
            }

            #ytkit-settings-panel .ytkit-command-search .ytkit-search-input:focus-visible,
            #ytkit-settings-panel .ytkit-select:focus-visible,
            #ytkit-settings-panel .ytkit-input:focus-visible,
            #ytkit-settings-panel .ytkit-vh-number:focus-visible {
                outline: 2px solid Highlight !important;
                outline-offset: 2px !important;
                box-shadow: none !important;
            }

            #ytkit-settings-panel .ytkit-switch:focus-within .ytkit-switch-track {
                outline: 2px solid Highlight !important;
                outline-offset: 2px !important;
                box-shadow: none !important;
            }

            #ytkit-settings-panel .ytkit-nav-btn.active {
                outline: 2px solid Highlight !important;
                outline-offset: -2px !important;
            }

            #ytkit-settings-panel .ytkit-feature-card {
                border-bottom-color: CanvasText !important;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #ytkit-settings-panel *,
            #ytkit-settings-panel *::before,
            #ytkit-settings-panel *::after {
                scroll-behavior: auto !important;
                transition-duration: 0.01ms !important;
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
            }
        }
    `;

    const SURFACE_STYLE_ID = 'ytkit-surface-visual-v1';
    const SURFACE_VISUAL_SYSTEM_CSS = `
        :root {
            --ytkit-premium-canvas: #07101b;
            --ytkit-premium-panel: #0d1928;
            --ytkit-premium-raised: #122238;
            --ytkit-premium-hover: #172a42;
            --ytkit-premium-border: rgba(151,178,208,0.22);
            --ytkit-premium-border-strong: rgba(151,178,208,0.36);
            --ytkit-premium-text: #f5f7fb;
            --ytkit-premium-muted: #aab7c8;
            --ytkit-premium-subtle: #8190a5;
            --ytkit-premium-accent: #ff5d4a;
            --ytkit-premium-accent-rgb: 255,93,74;
            --ytkit-premium-accent-fill: #cf352f;
            --ytkit-premium-success: #45d978;
            --ytkit-premium-warning: #f6b863;
            --ytkit-premium-danger: #ff7a86;
            --ytkit-premium-focus: 0 0 0 2px #07101b, 0 0 0 4px rgba(255,93,74,0.72);
            --ytkit-premium-shadow: 0 20px 56px rgba(0,0,0,0.42);
        }

        html:not([dark]) {
            --ytkit-premium-canvas: #eef2f6;
            --ytkit-premium-panel: #ffffff;
            --ytkit-premium-raised: #f3f6f9;
            --ytkit-premium-hover: #e8edf3;
            --ytkit-premium-border: rgba(30,53,78,0.18);
            --ytkit-premium-border-strong: rgba(30,53,78,0.30);
            --ytkit-premium-text: #172335;
            --ytkit-premium-muted: #536278;
            --ytkit-premium-subtle: #6d7c91;
            --ytkit-premium-focus: 0 0 0 2px #ffffff, 0 0 0 4px rgba(207,53,47,0.55);
            --ytkit-premium-shadow: 0 18px 48px rgba(20,35,54,0.18);
        }

        :is(
            .ytkit-ai-qa-modal,
            .ytkit-local-ai-modal,
            .ytkit-aisum-panel,
            .ytkit-transcript-panel,
            .ytkit-transcript-search-panel,
            .ytkit-transcript-batch-panel,
            .ytkit-dl-popup,
            .ytkit-dl-history-panel,
            .ytkit-stream-links-panel,
            .ytkit-stats-overlay,
            .ytkit-vvf-panel,
            .ytkit-wha-overlay,
            .ytkit-sub-group-dialog,
            .ytkit-sub-members-panel,
            .ytkit-sub-digest-panel,
            .ytkit-search-watch-panel,
            .ytkit-video-notes-container,
            .ytkit-bookmarks-container,
            .ytkit-queue-panel,
            .ytkit-wlwb-panel,
            .ytkit-rc-panel,
            .ytkit-reaction-spammer-panel,
            .ytkit-speed-popup,
            .ytkit-sleep-popover,
            .ytkit-ql-menu,
            .ytkit-context-menu,
            .ytkit-wellbeing-card,
            .ytkit-blocked-watch-dialog
        ) {
            border: 1px solid var(--ytkit-premium-border-strong) !important;
            border-radius: 12px !important;
            background: var(--ytkit-premium-panel) !important;
            color: var(--ytkit-premium-text) !important;
            box-shadow: var(--ytkit-premium-shadow) !important;
            color-scheme: dark !important;
            font-family: Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif !important;
        }

        html:not([dark]) :is(
            .ytkit-ai-qa-modal,
            .ytkit-local-ai-modal,
            .ytkit-aisum-panel,
            .ytkit-transcript-panel,
            .ytkit-transcript-search-panel,
            .ytkit-transcript-batch-panel,
            .ytkit-dl-popup,
            .ytkit-dl-history-panel,
            .ytkit-stream-links-panel,
            .ytkit-wha-overlay,
            .ytkit-sub-group-dialog,
            .ytkit-sub-members-panel,
            .ytkit-sub-digest-panel,
            .ytkit-search-watch-panel,
            .ytkit-video-notes-container,
            .ytkit-bookmarks-container,
            .ytkit-queue-panel,
            .ytkit-wlwb-panel
        ) {
            color-scheme: light !important;
        }

        :is(
            .ytkit-dl-progress,
            .ytkit-subs-load-banner,
            .ytkit-sub-toolbar,
            .ytkit-wl-workbench,
            .ytkit-search-container,
            .ytkit-pm-overlay,
            .ytkit-mediadl-banner,
            .ytkit-mediadl-install-prompt,
            .ytkit-playlist-enhance,
            .ytkit-speed-presets,
            .ytkit-mini-player-bar,
            .ytkit-photosensitive-alert,
            .ytkit-playback-recovery
        ) {
            border: 1px solid var(--ytkit-premium-border-strong) !important;
            border-radius: 10px !important;
            background: var(--ytkit-premium-panel) !important;
            color: var(--ytkit-premium-text) !important;
            box-shadow: var(--ytkit-premium-shadow) !important;
            color-scheme: dark !important;
            font-family: Inter, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif !important;
        }

        html:not([dark]) :is(
            .ytkit-dl-progress,
            .ytkit-subs-load-banner,
            .ytkit-sub-toolbar,
            .ytkit-wl-workbench,
            .ytkit-search-container,
            .ytkit-pm-overlay,
            .ytkit-mediadl-banner,
            .ytkit-mediadl-install-prompt,
            .ytkit-playlist-enhance,
            .ytkit-speed-presets,
            .ytkit-mini-player-bar,
            .ytkit-photosensitive-alert,
            .ytkit-playback-recovery
        ) {
            color-scheme: light !important;
        }

        :is(
            .ytkit-dl-progress,
            .ytkit-subs-load-banner,
            .ytkit-sub-toolbar,
            .ytkit-wl-workbench,
            .ytkit-search-container,
            .ytkit-pm-overlay,
            .ytkit-mediadl-banner,
            .ytkit-mediadl-install-prompt,
            .ytkit-playlist-enhance,
            .ytkit-speed-presets,
            .ytkit-mini-player-bar,
            .ytkit-photosensitive-alert,
            .ytkit-playback-recovery
        ) :is(button, input, select, textarea) {
            border-radius: 6px !important;
            box-shadow: none !important;
            font: inherit !important;
        }

        :is(
            .ytkit-dl-progress,
            .ytkit-subs-load-banner,
            .ytkit-sub-toolbar,
            .ytkit-wl-workbench,
            .ytkit-search-container,
            .ytkit-pm-overlay,
            .ytkit-mediadl-banner,
            .ytkit-mediadl-install-prompt,
            .ytkit-playlist-enhance,
            .ytkit-speed-presets,
            .ytkit-mini-player-bar,
            .ytkit-photosensitive-alert,
            .ytkit-playback-recovery
        ) :is(button, input, select, textarea, a):focus-visible {
            outline: 0 !important;
            border-color: var(--ytkit-premium-accent) !important;
            box-shadow: var(--ytkit-premium-focus) !important;
        }

        :is(
            .ytkit-ai-qa-modal,
            .ytkit-local-ai-modal,
            .ytkit-aisum-panel,
            .ytkit-transcript-search-panel,
            .ytkit-transcript-batch-panel,
            .ytkit-dl-popup,
            .ytkit-dl-history-panel,
            .ytkit-stream-links-panel,
            .ytkit-vvf-panel,
            .ytkit-wha-overlay,
            .ytkit-sub-group-dialog,
            .ytkit-sub-members-panel,
            .ytkit-sub-digest-panel,
            .ytkit-search-watch-panel,
            .ytkit-video-notes-container,
            .ytkit-bookmarks-container,
            .ytkit-queue-panel,
            .ytkit-wlwb-panel,
            .ytkit-rc-panel,
            .ytkit-reaction-spammer-panel,
            .ytkit-speed-popup,
            .ytkit-sleep-popover,
            .ytkit-ql-menu,
            .ytkit-context-menu,
            .ytkit-wellbeing-card,
            .ytkit-blocked-watch-dialog
        ) :is(button, input, select, textarea) {
            border-radius: 6px !important;
            border-color: var(--ytkit-premium-border) !important;
            box-shadow: none !important;
            font: inherit !important;
        }

        :is(
            .ytkit-ai-qa-modal,
            .ytkit-local-ai-modal,
            .ytkit-aisum-panel,
            .ytkit-transcript-search-panel,
            .ytkit-transcript-batch-panel,
            .ytkit-dl-popup,
            .ytkit-dl-history-panel,
            .ytkit-stream-links-panel,
            .ytkit-vvf-panel,
            .ytkit-wha-overlay,
            .ytkit-sub-group-dialog,
            .ytkit-sub-members-panel,
            .ytkit-sub-digest-panel,
            .ytkit-search-watch-panel,
            .ytkit-video-notes-container,
            .ytkit-bookmarks-container,
            .ytkit-queue-panel,
            .ytkit-wlwb-panel,
            .ytkit-rc-panel,
            .ytkit-reaction-spammer-panel,
            .ytkit-speed-popup,
            .ytkit-sleep-popover,
            .ytkit-ql-menu,
            .ytkit-context-menu,
            .ytkit-wellbeing-card,
            .ytkit-blocked-watch-dialog
        ) :is(button, input, select, textarea, a):focus-visible {
            outline: 0 !important;
            border-color: var(--ytkit-premium-accent) !important;
            box-shadow: var(--ytkit-premium-focus) !important;
        }

        :is(
            .ytkit-service-state-pill,
            .ytkit-pane-chip,
            .ytkit-meta-chip,
            .ytkit-badge,
            .ytkit-feature-badge,
            .ytkit-wellbeing-badge,
            .ytkit-transcript-meta__pill,
            .ytkit-audio-only-pill,
            .ytkit-subs-load-chip,
            .ytkit-sub-count-badge,
            .ytkit-sub-group-chip,
            .ytkit-download-health__pill,
            .ytkit-queue-pill,
            .ytkit-ryd-pill,
            .ytkit-monet-pill,
            .ytkit-dock-pill,
            .ytkit-vh-pill,
            .ytkit-speed-badge,
            .ytkit-dl-progress__badge
        ) {
            border-radius: 6px !important;
        }

        :is(
            .ytkit-progress-bar,
            .ytkit-dl-progress__bar,
            .ytkit-dl-progress__fill,
            .ytkit-wha-bar,
            .ytkit-volume-hud__bar,
            .ytkit-volume-hud__fill,
            .ytkit-mini-player-progress,
            .ytkit-mini-player-progress-fill
        ) {
            border-radius: 4px !important;
        }

        .ytkit-transcript-panel {
            max-height: min(620px, calc(100vh - 120px)) !important;
            overflow: hidden !important;
        }

        .ytkit-transcript-header {
            min-height: 58px !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid var(--ytkit-premium-border) !important;
            background: var(--ytkit-premium-panel) !important;
        }

        .ytkit-transcript-heading {
            gap: 3px !important;
        }

        .ytkit-transcript-eyebrow {
            min-height: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-premium-subtle) !important;
        }

        .ytkit-transcript-title {
            color: var(--ytkit-premium-text) !important;
            font-size: 16px !important;
            font-weight: 680 !important;
        }

        .ytkit-transcript-toggle {
            min-width: 40px !important;
            min-height: 40px !important;
            border-radius: 6px !important;
            background: var(--ytkit-premium-raised) !important;
            color: var(--ytkit-premium-muted) !important;
        }

        .ytkit-transcript-meta {
            min-height: 46px !important;
            padding: 8px 16px !important;
            border-bottom: 1px solid var(--ytkit-premium-border) !important;
        }

        .ytkit-transcript-export {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 0 !important;
            padding: 0 !important;
            border-bottom: 1px solid var(--ytkit-premium-border) !important;
            background: var(--ytkit-premium-raised) !important;
        }

        .ytkit-transcript-export__btn {
            min-height: 42px !important;
            border: 0 !important;
            border-inline-end: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-premium-text) !important;
            transform: none !important;
        }

        .ytkit-transcript-export__btn:last-child {
            border-inline-end: 0 !important;
        }

        .ytkit-transcript-export__btn:hover {
            background: var(--ytkit-premium-hover) !important;
            border-color: var(--ytkit-premium-border) !important;
            transform: none !important;
        }

        .ytkit-transcript-body {
            padding: 0 !important;
            color: var(--ytkit-premium-muted) !important;
        }

        .ytkit-transcript-line {
            display: grid !important;
            grid-template-columns: 72px minmax(0, 1fr) !important;
            align-items: center !important;
            gap: 16px !important;
            min-height: 52px !important;
            padding: 10px 16px !important;
            border: 0 !important;
            border-bottom: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 0 !important;
        }

        .ytkit-transcript-line:hover {
            background: var(--ytkit-premium-hover) !important;
        }

        .ytkit-transcript-line.is-active {
            background: rgba(var(--ytkit-premium-accent-rgb),0.12) !important;
            box-shadow: inset 3px 0 0 var(--ytkit-premium-accent) !important;
        }

        .ytkit-transcript-line__ts {
            min-width: 0 !important;
            color: var(--ytkit-premium-subtle) !important;
            font-variant-numeric: tabular-nums !important;
        }

        .ytkit-transcript-line.is-active .ytkit-transcript-line__ts,
        .ytkit-transcript-line.is-active .ytkit-transcript-line__text {
            color: var(--ytkit-premium-accent) !important;
        }

        .ytkit-transcript-line__text {
            color: var(--ytkit-premium-text) !important;
            font-size: 14px !important;
            line-height: 1.45 !important;
        }

        .ytkit-transcript-state {
            margin: 12px !important;
            border-color: var(--ytkit-premium-border) !important;
            border-radius: 8px !important;
            background: var(--ytkit-premium-raised) !important;
        }

        .ytkit-dl-popup {
            width: min(440px, calc(100vw - 24px)) !important;
            max-width: min(440px, calc(100vw - 24px)) !important;
            padding: 0 !important;
            overflow: hidden !important;
        }

        .ytkit-dl-popup::backdrop {
            background: rgba(2,7,14,0.68) !important;
        }

        .ytkit-dl-popup__toolbar {
            min-height: 54px !important;
            padding: 0 12px !important;
            border-bottom: 1px solid var(--ytkit-premium-border) !important;
            background: var(--ytkit-premium-panel) !important;
        }

        .ytkit-dl-popup__tabs {
            gap: 0 !important;
            align-self: stretch !important;
        }

        .ytkit-dl-popup__tab {
            min-width: 92px !important;
            min-height: 100% !important;
            border: 0 !important;
            border-bottom: 2px solid transparent !important;
            border-radius: 0 !important;
            background: transparent !important;
            color: var(--ytkit-premium-muted) !important;
        }

        .ytkit-dl-popup__tab.is-active,
        .ytkit-dl-popup__tab[aria-selected="true"] {
            border-bottom-color: var(--ytkit-premium-accent) !important;
            background: rgba(var(--ytkit-premium-accent-rgb),0.06) !important;
            color: var(--ytkit-premium-accent) !important;
        }

        .ytkit-dl-popup__close {
            width: 40px !important;
            height: 40px !important;
            border-radius: 6px !important;
            background: transparent !important;
        }

        .ytkit-dl-popup__body {
            gap: 14px !important;
            padding: 14px 16px 16px !important;
            background: var(--ytkit-premium-panel) !important;
        }

        .ytkit-dl-popup__row {
            gap: 7px !important;
        }

        .ytkit-dl-popup__label {
            color: var(--ytkit-premium-muted) !important;
            letter-spacing: 0.06em !important;
        }

        .ytkit-dl-popup__chips {
            gap: 6px !important;
        }

        .ytkit-dl-popup__chip,
        .ytkit-dl-popup__dir-btn,
        .ytkit-dl-popup__clip-input {
            min-height: 38px !important;
            border: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 6px !important;
            background: var(--ytkit-premium-raised) !important;
            color: var(--ytkit-premium-text) !important;
        }

        .ytkit-dl-popup__chip.is-active,
        .ytkit-dl-popup__chip[aria-pressed="true"] {
            border-color: var(--ytkit-premium-accent) !important;
            background: rgba(var(--ytkit-premium-accent-rgb),0.10) !important;
            color: var(--ytkit-premium-accent) !important;
        }

        .ytkit-dl-popup__go {
            min-height: 44px !important;
            border: 1px solid transparent !important;
            border-radius: 6px !important;
            background: var(--ytkit-premium-accent-fill) !important;
            color: #fff !important;
            box-shadow: none !important;
        }

        .ytkit-global-toast {
            border: 1px solid var(--ytkit-premium-border-strong) !important;
            border-radius: 10px !important;
            background: var(--ytkit-premium-panel) !important;
            color: var(--ytkit-premium-text) !important;
            box-shadow: var(--ytkit-premium-shadow) !important;
        }

        :is(
            .ytkit-seek-hud,
            .ytkit-volume-hud,
            .ytkit-speed-osd,
            .ytkit-audio-only-status,
            .ytkit-buffer-status,
            .ytkit-photosensitive-status,
            .ytkit-live-latency-readout
        ) {
            border: 1px solid var(--ytkit-premium-border-strong) !important;
            border-radius: 8px !important;
            background: rgba(7,16,27,0.96) !important;
            color: var(--ytkit-premium-text) !important;
            box-shadow: 0 12px 30px rgba(0,0,0,0.34) !important;
            text-shadow: none !important;
        }

        .ytkit-context-menu {
            padding: 6px !important;
        }

        .ytkit-context-menu-item {
            min-height: 38px !important;
            border-radius: 6px !important;
        }

        #ytkit-player-controls {
            border-radius: 8px !important;
            border-color: var(--ytkit-premium-border) !important;
            background: rgba(7,16,27,0.94) !important;
            box-shadow: 0 12px 30px rgba(0,0,0,0.34) !important;
        }

        #ytkit-player-controls :is(.ytkit-player-btn, .ytkit-ql-launcher--player, .ytkit-ql-toggle) {
            border-radius: 6px !important;
            background: rgba(255,255,255,0.035) !important;
            box-shadow: none !important;
        }

        #ytkit-po-drop {
            border-radius: 10px !important;
            background: rgba(7,16,27,0.98) !important;
            box-shadow: 0 20px 48px rgba(0,0,0,0.42) !important;
        }

        #ytkit-po-drop :is(.ytkit-ql-item, .ytkit-ql-del, .ytkit-ql-bottom-btn, .ytkit-ql-input, .ytkit-ql-add-btn) {
            border-radius: 6px !important;
        }

        html.ytkit-watch-restyle ytd-watch-metadata {
            margin-top: 10px !important;
            padding: 10px 0 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
        }

        html.ytkit-watch-restyle ytd-watch-metadata h1.ytd-watch-metadata,
        html.ytkit-watch-restyle ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string {
            margin: 0 !important;
            color: var(--yt-spec-text-primary, var(--ytkit-premium-text)) !important;
            font-size: clamp(20px, 1.55vw, 25px) !important;
            font-weight: 690 !important;
            line-height: 1.28 !important;
            text-align: start !important;
            text-transform: none !important;
            text-shadow: none !important;
        }

        html.ytkit-watch-restyle ytd-watch-metadata #top-row {
            gap: 10px !important;
            padding: 12px 0 8px !important;
        }

        html.ytkit-watch-restyle ytd-watch-metadata #top-level-buttons-computed .yt-spec-button-shape-next,
        html.ytkit-watch-restyle .ytkit-local-dl-btn,
        html.ytkit-watch-restyle ytd-watch-metadata #subscribe-button .yt-spec-button-shape-next,
        html.ytkit-watch-restyle #notification-preference-button .yt-spec-button-shape-next {
            min-height: 36px !important;
            height: 36px !important;
            padding-inline: 12px !important;
            border: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 6px !important;
            background: var(--ytkit-premium-raised) !important;
            color: var(--yt-spec-text-primary, var(--ytkit-premium-text)) !important;
            box-shadow: none !important;
        }

        html.ytkit-watch-restyle ytd-watch-metadata #top-level-buttons-computed .yt-spec-button-shape-next:hover,
        html.ytkit-watch-restyle .ytkit-local-dl-btn:hover {
            border-color: var(--ytkit-premium-border-strong) !important;
            background: var(--ytkit-premium-hover) !important;
        }

        html.ytkit-watch-restyle ytd-watch-metadata #description.ytd-watch-metadata,
        html.ytkit-watch-restyle ytd-watch-metadata ytd-text-inline-expander {
            margin-top: 10px !important;
            padding: 12px 14px !important;
            border: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 8px !important;
            background: var(--ytkit-premium-raised) !important;
        }

        html.ytkit-watch-restyle ytd-comments#comments {
            margin-top: 18px !important;
            padding: 14px 0 20px !important;
            border: 0 !important;
            border-top: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 0 !important;
            background: transparent !important;
        }

        html.ytkit-watch-restyle :is(ytd-comment-view-model, ytd-comment-renderer) {
            padding-block: 12px !important;
            border-bottom: 1px solid var(--ytkit-premium-border) !important;
            background: transparent !important;
        }

        html.ytkit-watch-restyle ytd-commentbox #contenteditable-textarea,
        html.ytkit-watch-restyle ytd-comments-header-renderer ytd-comment-simplebox-renderer #placeholder-area {
            min-height: 44px !important;
            border: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 8px !important;
            background: var(--ytkit-premium-raised) !important;
        }

        html.ytkit-split-active,
        html.ytkit-split-active body {
            background: var(--ytkit-premium-canvas) !important;
        }

        html.ytkit-split-active #ytkit-split-wrapper,
        html.ytkit-split-active #ytkit-split-left {
            background: transparent !important;
        }

        html.ytkit-split-active #ytkit-split-right {
            border-inline-start: 1px solid var(--ytkit-premium-border) !important;
            background: var(--ytkit-premium-panel) !important;
            color: var(--ytkit-premium-text) !important;
        }

        html.ytkit-split-active #ytkit-split-divider {
            width: 8px !important;
            border: 0 !important;
            border-inline-start: 1px solid var(--ytkit-premium-border) !important;
            border-inline-end: 1px solid var(--ytkit-premium-border) !important;
            background: var(--ytkit-premium-canvas) !important;
        }

        html.ytkit-split-active #ytkit-split-divider:hover {
            border-color: rgba(var(--ytkit-premium-accent-rgb),0.54) !important;
            background: rgba(var(--ytkit-premium-accent-rgb),0.08) !important;
        }

        html.ytkit-split-active .ytkit-divider-pip {
            width: 2px !important;
            border-radius: 0 !important;
            background: var(--ytkit-premium-subtle) !important;
        }

        html.ytkit-split-active :is(#ytkit-split-title-bar, .ytkit-split-live-header) {
            border-bottom: 1px solid var(--ytkit-premium-border) !important;
            background: var(--ytkit-premium-panel) !important;
            color: var(--ytkit-premium-text) !important;
        }

        html.ytkit-split-active :is(.ytkit-split-live-card, .ytkit-split-actions-docked) {
            border: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 8px !important;
            background: var(--ytkit-premium-raised) !important;
            box-shadow: none !important;
        }

        html.ytkit-split-active #ytkit-split-close {
            width: 36px !important;
            height: 36px !important;
            border: 1px solid var(--ytkit-premium-border) !important;
            border-radius: 6px !important;
            background: var(--ytkit-premium-raised) !important;
            color: var(--ytkit-premium-muted) !important;
        }

        @media (max-width: 720px) {
            .ytkit-transcript-export {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }

            .ytkit-transcript-export__btn {
                border-bottom: 1px solid var(--ytkit-premium-border) !important;
            }

            .ytkit-transcript-line {
                grid-template-columns: 58px minmax(0, 1fr) !important;
                gap: 10px !important;
                padding-inline: 12px !important;
            }
        }

        @media (forced-colors: active) {
            :is(
                .ytkit-ai-qa-modal,
                .ytkit-local-ai-modal,
                .ytkit-aisum-panel,
                .ytkit-transcript-panel,
                .ytkit-transcript-search-panel,
                .ytkit-transcript-batch-panel,
                .ytkit-dl-popup,
                .ytkit-dl-history-panel,
                .ytkit-stream-links-panel,
                .ytkit-stats-overlay,
                .ytkit-vvf-panel,
                .ytkit-wha-overlay,
                .ytkit-sub-group-dialog,
                .ytkit-sub-members-panel,
                .ytkit-sub-digest-panel,
                .ytkit-search-watch-panel,
                .ytkit-video-notes-container,
                .ytkit-bookmarks-container,
                .ytkit-queue-panel,
                .ytkit-wlwb-panel,
                .ytkit-context-menu,
                .ytkit-global-toast
            ) {
                border-color: CanvasText !important;
                box-shadow: none !important;
            }

            :is(button, input, select, textarea, a):focus-visible {
                outline: 2px solid Highlight !important;
                outline-offset: 2px !important;
                box-shadow: none !important;
            }
        }
    `;

    function ensureSettingsVisualSystem(doc = globalThis.document) {
        if (!doc?.getElementById) return null;
        const id = `yt-suite-style-${STYLE_ID}`;
        const existing = doc.getElementById(id);
        if (existing) return existing;
        if (doc !== globalThis.document || typeof core.injectStyle !== 'function') return null;
        return core.injectStyle(SETTINGS_VISUAL_SYSTEM_CSS, STYLE_ID, true);
    }

    function ensureSurfaceVisualSystem(doc = globalThis.document) {
        if (!doc?.getElementById) return null;
        const id = `yt-suite-style-${SURFACE_STYLE_ID}`;
        const existing = doc.getElementById(id);
        if (existing) return existing;
        if (doc !== globalThis.document || typeof core.injectStyle !== 'function') return null;
        return core.injectStyle(SURFACE_VISUAL_SYSTEM_CSS, SURFACE_STYLE_ID, true);
    }

    Object.assign(core, {
        SETTINGS_CATEGORY_SECTIONS,
        SHORTS_SETTING_KEYS,
        SHORTS_PANEL_SETTING_KEYS,
        SETTINGS_VISUAL_SYSTEM_CSS,
        SURFACE_VISUAL_SYSTEM_CSS,
        ensureSettingsVisualSystem,
        ensureSurfaceVisualSystem
    });

    ensureSurfaceVisualSystem();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            SETTINGS_CATEGORY_SECTIONS,
            SHORTS_SETTING_KEYS,
            SHORTS_PANEL_SETTING_KEYS,
            SETTINGS_VISUAL_SYSTEM_CSS,
            SURFACE_VISUAL_SYSTEM_CSS,
            STYLE_ID,
            SURFACE_STYLE_ID,
            ensureSettingsVisualSystem,
            ensureSurfaceVisualSystem
        };
    }
})();
