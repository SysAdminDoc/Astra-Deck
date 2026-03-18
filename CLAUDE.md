# YouTube-Kit

## Overview
Chrome + Firefox MV3 extension and Tampermonkey userscript for comprehensive YouTube enhancement. Ad blocking, theater mode, ChapterForge AI chapters, DeArrow, filler skip, transcript extraction, video/channel hiding.

## Architecture
- Split-context ad blocking: MAIN world (page JS intercept) + ISOLATED world (DOM manipulation)
- GM_* compatibility shim for userscript mode
- YTYT-Downloader consolidated into this repo (separate repo was deleted)
- Content scripts use multiple `run_at` entries for early CSS + late logic
- Settings panel cleanup registry (`_panelCleanups`) prevents memory leaks from intervals/observers
- Lifetime ad block stats use delta-based accumulation to avoid double-counting across sessions
- Options page (`options.html`/`options.js`) uses `chrome.storage.local` directly — no dependency on gm-compat or ytkit.js

## Build System
- `node build-extension.js [--bump patch|minor|major]` — produces all artifacts in `build/`
- Outputs: Chrome ZIP + CRX3, Firefox ZIP + XPI, userscript copy
- CRX3 signing via `crx3` npm package with persistent `ytkit.pem` key (gitignored)
- Firefox manifest auto-patched: `background.scripts` array instead of `service_worker`, `browser_specific_settings.gecko` added
- XPI is a renamed ZIP — Firefox's native extension format
- `--bump` updates version in `manifest.json`, `ytkit.js` (YTKIT_VERSION), and `ytkit.user.js` header

## Firefox Differences
- Manifest uses `background.scripts` array instead of `service_worker` (broader Firefox MV3 compat)
- `browser_specific_settings.gecko.id` set to `ytkit@sysadmindoc.github.io`
- `strict_min_version: "128.0"` — requires Firefox 128+
- `chrome.*` APIs work in Firefox as a compat alias — no code changes needed

## v3.2.0 New Features (115+ features, 9 waves)

### Wave 1 — Quick Wins + Medium
**All off by default:** autoDismissStillWatching, remainingTimeDisplay, showPlaylistDuration, showTimeInTabTitle, reversePlaylist, rssFeedLink, preciseViewCounts, videoScreenshot, compactUnfixedHeader, returnYoutubeDislike, volumeBoost (range 100-600%), perChannelSpeed, hideWatchedVideos (select: dim/hide), antiTranslate, pauseOtherTabs
**Theme:** customProgressBarColor (color picker, default #ff0000)

### Wave 2 — Complex & Differentiating
**All off by default:** skipSilence (threshold range 5-50), abLoop, fineSpeedControl, showChannelVideoCount, redirectHomeToSubs, notInterestedButton, timestampBookmarks, blueLightFilter (intensity range 10-80), disableInfiniteScroll, audioNormalization, popOutPlayer (Document PiP API + fallback)

### Wave 3 — Audio & Automation
**All off by default:** audioEqualizer (10-band EQ, 9 presets via SharedAudio), watchTimeTracker (90-day retention), alwaysShowProgressBar, sortCommentsNewest, autoSkipChapters (textarea patterns), chapterNavButtons, videoLoopButton, persistentSpeed (select), codecSelector (H.264/VP9/AV1), ageRestrictionBypass, autoLikeSubscribed, thumbnailPreviewSize

### Wave 4 — Polish & Deep Enhancement
**All off by default:** cinemaAmbientGlow (canvas color sampling → radial gradient glow), transcriptViewer (sidebar with clickable timestamps), searchFilterDefaults (select: upload_date/view_count/rating), forceStandardFps (block 60fps), stickyChat, autoExpandDescription, scrollToPlayer, hideEndCards (CSS), hideInfoCards (CSS), keyMoments (chapter highlight CSS)

### Wave 5 — Power User & QoL
**All off by default:** autoTheaterMode, resumePlayback (StorageManager, 500 entry cap, 15s save interval), miniPlayerBar (floating bar with progress/play/pause on scroll-past), playbackStatsOverlay (codec/resolution/dropped frames/bandwidth), hideNotificationBadge (CSS), autoPauseOnSwitch (visibilitychange API), creatorCommentHighlight (CSS border+badge), copyVideoTitle (button next to title), channelAgeDisplay (calculated age badge), speedIndicatorOverlay (monospace overlay at 1x+ speeds), hideAutoplayToggle (CSS), fullscreenOnDoubleClick (dblclick capture handler)

### Wave 6 — Interaction & Media Control
**All off by default:** volumeScrollWheel (wheel on player adjusts volume, yields to Ctrl for videoZoom), rememberVolume (persist volume level), pipButton (one-click PiP in controls), autoSubtitles (auto-enable CC), focusedMode (hide everything except video+comments), thumbnailQualityUpgrade (maxresdefault replacement with fallback), watchLaterQuickAdd (clock overlay on thumbnails), playlistEnhancer (shuffle + copy all URLs), commentSearch (filter bar above comments), videoZoom (Ctrl+scroll to zoom, drag to pan up to 5x), forceDarkEverywhere (dark theme on all YT pages)

### Wave 7 — Customization & Utilities
**All off by default:** customCssInjection (textarea for user CSS), shareMenuCleaner (hide social share buttons), autoClosePopups (cookie/survey/premium popup auto-dismiss), videoResolutionBadge (4K/HD badges on thumbnails), likeViewRatio (like:view % badge), downloadThumbnail (maxres download button), grayscaleThumbnails (grayscale until hover), disableAutoplayNext (clicks autoplay toggle off), channelSubCount (prominent sub count badge), customSpeedButtons (0.5x–3x preset bar), openInNewTab (video links open new tabs), muteAdAudio (mute during ad segments, unmute after)

### Wave 8 — Restored Archive Features
**All off by default:** preventAutoplay, hideNotificationButton, noFrostedGlass, autoOpenChapters, autoOpenTranscript, chronologicalNotifications, hideLatestPosts, disableMiniPlayer, adaptiveLiveLayout, commentNavigator, shortsAsRegularVideo, themeAccentColor (color picker), theaterAutoScroll, scrollWheelSpeed (Shift+scroll, yields to volumeScrollWheel/videoZoom), playbackSpeedOSD, enableCPU_Tamer (rAF timer throttling), enableHandleRevealer (@handle resolution), showVlcQueueButton, showMpvButton, autoDownloadOnVisit, showDownloadPlayButton, subsVlcPlaylist, enableEmbedPlayer (custom HTML5 player), deArrow (DeArrow API with 6 sub-settings), showStatisticsDashboard, settingsProfiles, debugMode, nyanCatProgressBar
**SponsorBlock per-category:** sbCat_sponsor, sbCat_selfpromo, sbCat_interaction, sbCat_intro, sbCat_outro, sbCat_preview, sbCat_filler, sbCat_music_offtopic
**Protocol schemes:** ytdl://, ytdlplay://, ytvlc://, ytvlcq://, ytmpv:// for local player integration

### Wave 9 — Final Archive Restoration
**squareSearchBar** (on by default), **squareAvatars** (on by default), **fitPlayerToWindow** (off by default, conflicts with stickyVideo), **disableSpaNavigation** (off by default — forces full page loads via capture-phase click interception)

### Architecture
- **SharedAudio** manager: volumeBoost, skipSilence, audioNormalization, audioEqualizer all share one MediaElementSource via `SharedAudio.register()` / `SharedAudio.unregister()`. Nodes are chained: source -> [registered nodes] -> destination. Prevents Web Audio API "already connected" errors.
- **CONFLICT_MAP** covers 15 entries: persistentSpeed ↔ perChannelSpeed, autoPauseOnSwitch ↔ pauseOtherTabs, focusedMode ↔ hideSidebar+hideRelatedVideos+transcriptViewer+timestampBookmarks+stickyVideo, forceH264 ↔ codecSelector (both patch canPlayType), hideEndCards ↔ hideVideoEndContent (overlapping CSS), popOutPlayer ↔ fullscreenOnDoubleClick+pipButton (video element moves to PiP window)
- **volumeScrollWheel** yields Ctrl+scroll to videoZoom (ctrlKey guard)
- RYD API added to manifest host_permissions
- Screenshot also added to right-click context menu
- Per-Channel Speed stores in StorageManager keyed by channel handle, capped at 500 entries
- Pause Other Tabs uses BroadcastChannel API
- Timestamp Bookmarks persist in StorageManager with inline note editing
- Cinema Ambient Glow uses requestAnimationFrame + 500ms throttled canvas sampling
- Transcript Viewer fetches json3 format from YouTube caption tracks API
- **scrollWheelSpeed** yields to both volumeScrollWheel (`appState.settings.volumeScrollWheel && !e.shiftKey`) and videoZoom (`e.ctrlKey`)
- **DeArrow** caches API responses with configurable TTL, formats titles (sentence/title case), falls back to original on API miss
- **enableCPU_Tamer** patches `setTimeout`/`setInterval` to use `requestAnimationFrame` when tab is background
- **sync-userscript.js** — converts extension source to userscript: strips gm-compat preamble, removes `_rw` bridge, replaces `_rw.` → `window.`

## Gotchas
- MAIN world cannot access `chrome.*` APIs — needs localStorage mirroring or CustomEvent bridge from ISOLATED world
- ISOLATED world cannot access page JS globals (`window.ytcfg`, `ytInitialPlayerResponse`) — needs fallback parsing or cross-world CustomEvent bridge
- Stats counters shared between worlds can overwrite each other if both write to same DOM element
- `trustedTypes.createPolicy()` required for all innerHTML on YouTube
- `el.innerHTML = ''` still violates trustedTypes CSP — use `el.textContent = ''` to clear
- YouTube filter chips (e.g. "Recently uploaded") replace grid content via Polymer recycling without firing `yt-navigate-finish` — need capture-phase click listener on `yt-chip-cloud-chip-renderer` to trigger reprocessing
- Video element processing must always re-check for missing X buttons even on already-processed elements, since YouTube's Polymer re-renders can strip child DOM nodes while keeping the parent element in place
- Sandbox iframes (`sandbox` attribute without `allow-scripts`) will throw if you access `contentWindow` — check sandbox attribute BEFORE appending

## Current Version: v3.2.0
