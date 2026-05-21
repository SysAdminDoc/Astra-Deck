# Astra Deck Roadmap

Generated: 2026-05-21
Target site: YouTube desktop web, YouTube live chat frames, YouTube embeds where technically safe
Current repo version observed: Astra Deck v4.5.2
Planning track: Astra Deck v5.0.0 through v6.0.0
Deliverable for this run: planning only. No feature code was written.

## Project Overview

Astra Deck is a premium, privacy-first YouTube power-user layer for people who want one tool to replace a stack of YouTube enhancers, focus blockers, downloader helpers, transcript tools, playback controllers, UI themes, and research workflows.

One-line pitch: Astra Deck turns YouTube into a controlled, dark, dense, searchable, automatable media workstation while preserving a single-file userscript path and a store-ready MV3 extension path.

Chosen vehicle: both MV3 extension and single-file userscript.

- MV3 extension is required for `chrome.downloads`, background fetch proxying, safe cross-origin API calls, `chrome.storage`, store distribution, toolbar UI, optional declarative blocking, cookie-assisted local downloader handoff, and long-running background coordination.
- Userscript is required for single-file portability, Tampermonkey/Violentmonkey users, easier MAIN-world access, self-hosted/GitHub distribution, rapid breakage hotfixes, and bypassing store-review delays when YouTube ships DOM changes.
- Build rule: maintain one source catalog and produce two synchronized artifacts. Extension code can remain modular; userscript output must remain readable, single-file, non-minified, and parity-tested.

Version convention:

- Existing product versioning remains `Astra Deck vX.Y.Z`.
- The superset roadmap begins at `v5.0.0` because the repo is already at `v4.5.2`; a greenfield `ProjectName v0.0.1` convention is not applicable to this existing release line.
- Each phase below has explicit acceptance criteria and can ship independently.

House style for every shipped UI:

- Premium paid-software look only: deep dark and OLED palettes, glass surfaces, subtle shimmer, hover lift, spring easing, staggered entrances, branded accent, custom scrollbar, dense mode.
- Never ship a light theme.
- Do not add keyboard shortcuts. Competitor shortcut features must become visible buttons, wheel gestures, pointer controls, command-palette actions, menu items, or context actions.
- Do not use confirmation dialogs. Dangerous or destructive actions should apply immediately only when reversible; otherwise use undo toasts, soft-delete staging, disabled states, or an explicit visible action surface.
- Every feature module must expose `init()` and `destroy()`; `destroy()` must fully remove DOM, observers, listeners, timers, pending async work, body/html classes, injected style tags, and storage listeners.
- Settings overlays must use `pointer-events: none` while inactive and must not trap focus when hidden.
- CSS must scope to Astra-owned classes on `html`/`body` and `data-ytkit-*` nodes.
- On YouTube and other Trusted Types enforcing pages, all HTML injection must go through DOM APIs or the existing Trusted Types policy wrapper.
- Selectors must prefer custom elements, IDs, roles, `aria-*`, `href`, and structure. Obfuscated or generated classes are fallbacks only.
- Runtime observers must process added nodes only; no full-document scan per mutation.

## Phase 0: Local Repo Ingest

### Repo State Summary

Observed checkout: `C:\Users\--\repos\Astra-Deck`.

The repo is an existing production-grade YouTube extension/userscript project, not a scaffold. It already includes:

- Chrome/Firefox MV3 extension under `extension/`.
- Single-file userscript outputs in `YTKit.user.js` and historical archive builds.
- MAIN-world bridge (`extension/ytkit-main.js`) and isolated-world content runtime (`extension/ytkit.js`).
- Early anti-FOUC CSS (`extension/early.css`).
- Background service worker fetch/download proxy (`extension/background.js`).
- Local companion downloader (`astra_downloader/`) with PyQt/Flask/yt-dlp integration.
- Popup/settings UI (`extension/popup.*`).
- Locale bundles for 10 locales.
- Core modules for navigation, selectors, storage, styles, Trusted Types, API limiting, diagnostics, transcript service, predicate sandboxing, icons, page/player helpers, and URL/video-type utilities.
- Tests and audits for background behavior, core modules, SponsorBlock, DeArrow, theater split, userscript parity, storage size, settings migration, syntax, contrast, a11y, and repo paths.

Observed current default settings count: 354 keys. The current `extension/default-settings.json` is a flat object with no per-key category metadata. The roadmap therefore treats settings taxonomy as a first-class v5 task.

Already built or partially built:

- SponsorBlock integration with category toggles, cache fallback, and stale async invalidation.
- DeArrow title/thumbnail replacement, cache caps, channel overrides, and original-title peek controls.
- Return YouTube Dislike API fetch surface and card/watch ratio display settings.
- Transcript service with 5-method failover: page player response, Innertube player endpoint, watch HTML fetch, caption regex, and DOM panel scrape.
- Local downloader companion, local history/health panels, stream links panel, Cobalt fallback settings, format/quality defaults, and thumbnail/subtitle/screenshot download settings.
- Large content-filtering surface: Shorts removal/redirect, hidden videos, duration/view filters, watched-ratio filters, mixes/playlists/live/upcoming filters, keyword/channel/comment filters, advanced local predicate settings.
- UI and player polish: OLED/dense/classic/new-player restore settings, watch page tabs, theater split, player controls hiding, video zoom/rotation/filters, PiP, sleep timer, A/B loop, custom speed buttons, progress bar controls.
- Research and productivity settings: AI summaries, local AI summary, transcript AI handoff, research transcript index/search, spaced review, watch history analytics, subscription groups.
- Safety and diagnostics: safe/full feature profiles, privacy data-flow panel, diagnostic log, API retry/backoff, storage quota LRU, low-power profile, reduced-motion/forced-colors/a11y live-region settings.

Missing or needing a deeper build pass:

- Formal settings metadata categories for all 354 keys.
- Runtime selector health dashboard that promotes MHTML fixture failures into user-visible diagnostics.
- Self-healing selector resolver with versioned selector packs and capture provenance.
- Full competitive feature parity validation against UnTrap, Enhancer for YouTube, Improve YouTube, YouTube Alchemy, YouTube Tweaks, Tweaks for YouTube, Unhook, BlockTube, PocketTube, SponsorBlock, DeArrow, Return YouTube Dislike, and Video Speed Controller.
- Explicit store-safe vs GitHub/full-power packaging profiles with separate permission manifests and user-visible privacy copy.
- Full subscription manager parity with PocketTube: nested groups, AI tags, dead-channel detection, group notifications, bulk unsubscribe, import/export.
- Full study/work mode parity with YouFocus/UnTrap: mode history, per-video notes, focus timers, schedules, opening delays, and clean local export.
- Comprehensive live-chat capture/fixtures for chat iframe internals.
- Fresh capture for YouTube's new/Delhi/liquid-glass player chrome in all A/B variants.
- README deliverable for the v5 product after implementation. This run only updates `ROADMAP.md`.

### Full Repo Tree

Source-controlled product tree plus local capture artifacts:

```text
Astra-Deck/
  .github/
    ISSUE_TEMPLATE/
      bug_report.md
      feature_request.md
    dependabot.yml
    pull_request_template.md
    workflows/
      build.yml
  .gitignore
  .nvmrc
  AGENTS.md
  AstraDownloader.ico
  CHANGELOG.md
  CLAUDE.md
  CONTRIBUTING.md
  HARDENING.md
  LICENSE
  README.md
  ROADMAP.md
  YTKit.user.js
  YT_Reaction_Spammer.user.js
  archive/
    YTKit-v0.1.0.user.js
    YTKit-v0.2.0.user.js
    YTKit-v0.3.0.user.js
    YTKit-v0.4.0.user.js
    YTKit-v0.5.0.user.js
    YTKit-v0.6.0.user.js
    YTKit-v0.7.0.user.js
    YTKit-v0.8.0.user.js
    YTKit-v1.0.0.user.js
    YTKit-v1.1.0.user.js
    YTKit-v1.2.0.user.js
    YTKit-v1.2.1.user.js
    YTKit-v1.3.0.user.js
    YTKit-v2.0.0.user.js
    YTKit-v2.1.0.user.js
  assets/
    cat.gif
    starfall.gif
    ytlogo.png
  astra_downloader/
    astra_downloader.py
    build.py
    requirements.txt
    test_astra_downloader.py
  build-extension.js
  docs/
    cws-submission-checklist.md
    predicate-sandbox-investigation.md
    screen-reader-smoke.md
    selector-fixture-workflow.md
    signing-keys.md
  eslint.config.js
  extension/
    _locales/
      de/messages.json
      en/messages.json
      es/messages.json
      fr/messages.json
      it/messages.json
      ja/messages.json
      ko/messages.json
      pt_BR/messages.json
      ru/messages.json
      zh_CN/messages.json
    background.js
    core/
      api-limiter.js
      diagnostic-log.js
      env.js
      icons.js
      navigation.js
      page.js
      player.js
      predicate-sandbox.js
      registry.js
      selectors.js
      storage-manager.js
      storage.js
      styles.js
      transcript-service.js
      trusted-html.js
      url.js
      video-type.js
    default-settings.json
    early.css
    icons/
      128.png
      16.png
      32.png
      48.png
      brand-glyph.svg
      brand-wordmark-dark.svg
      brand-wordmark-light.svg
    manifest.json
    popup.css
    popup.html
    popup.js
    settings-meta.json
    ytkit-main.js
    ytkit.js
  logo.png
  mhtml/
    WatchPage.mhtml
    YouTube.mhtml
  package-lock.json
  package.json
  pytest.ini
  scripts/
    audit-popup-a11y.js
    audit-storage-size.js
    build-selector-fixtures.js
    catalog-utils.js
    check-contrast.js
    check-i18n.js
    check-syntax.js
    check-versions.js
    eslint-rules/
      no-post-await-addlistener.js
    extract-i18n-keys.js
    generate-locales.js
    manifest-patch.js
    repo-paths.js
  sync-userscript.js
  tests/
    background.test.js
    bugfix-validation.test.js
    catalog-utils.test.js
    core-foundation.test.js
    core-icons.test.js
    core-page-url.test.js
    core-storage-manager.test.js
    core-transcript-service.test.js
    features/
      dearrow.test.js
      sponsorblock.test.js
      theater-split.test.js
    fixtures/
      settings-import-roundtrip.json
      yt-home.tokens.txt
      yt-watch.tokens.txt
    hardening.test.js
    helpers/
      source.js
    repo-paths.test.js
    selector-regression.test.js
    settings-migration-roundtrip.test.js
    storage-size-audit.test.js
    userscript-parity.test.js
  theater-split.user.js
  Subscriptions - YouTube.mhtml
  Worldwide Societal Collapse... - YouTube.mhtml
```

Generated or dependency trees such as `.git/`, `node_modules/`, build outputs, PyInstaller output, caches, and editor state are not planning inputs and are excluded from this roadmap tree.

### MHTML Capture Ground Truth

All four local captures were treated as the DOM ground truth for current YouTube surfaces. The captures are MIME snapshots containing quoted-printable/base64 encoded HTML and CSS parts. The local parse pass decoded MIME bodies, extracted HTML/CSS documents, counted surface tags, and scanned for script/API state.

| Capture | Date observed | Approx size | Extracted parts | Surfaces present | Key notes |
|---|---:|---:|---|---|---|
| `mhtml/WatchPage.mhtml` | 2026-04-23 | 5.39 MB | 3 HTML, 75 CSS | watch, player, feed cards, comments, sidebar, nav, modals, settings, media, profile, notifications | Strong watch-page baseline with Polymer/Kevlar custom elements. |
| `mhtml/YouTube.mhtml` | 2026-04-23 | 5.40 MB | 3 HTML, 70 CSS | home feed, cards, sidebar, nav, modals, settings, media, profile, notifications | Home-grid baseline; no comment composer. |
| `Subscriptions - YouTube.mhtml` | 2026-05-19 | 5.71 MB | 3 HTML, 70 CSS | subscriptions feed, guide/sidebar, nav, feed cards, media, profile | Subscription-specific grouping/sorting baseline. |
| `Worldwide Societal Collapse... - YouTube.mhtml` | 2026-05-19 | 5.27 MB | 3 HTML, 76 CSS | watch, player, comments, related sidebar, engagement panels, media | Newer watch capture; useful for player/comment churn. |

Script/API scan result:

- The saved MHTML files did not preserve usable `ytInitialData`, `ytInitialPlayerResponse`, `ytcfg`, GraphQL query IDs, or Innertube request payloads as inline script state. Treat them as DOM/CSS ground truth, not API-state dumps.
- No GraphQL endpoint was observed. YouTube's relevant internal API surface is Innertube JSON, not GraphQL.
- CSP/Trusted Types are handled in the repo via `extension/core/trusted-html.js`; the roadmap must keep all injection behind DOM APIs or that wrapper.
- SPA signals are YouTube Polymer/Kevlar custom elements, `yt-navigate-finish`, `yt-page-data-updated`, `popstate`, `window.navigation` fallback, and `ytd-watch-flexy[video-id]` attribute mutation.

### Selector Map

Every key surface has a stable selector strategy and a fragile fallback. Stable selectors are the only selectors that should be used in new feature code unless they fail and diagnostic logs prove a fallback is necessary.

| Surface | Stable selector strategy | Fragile fallback/watchlist | Churn risk | Notes |
|---|---|---|---|---|
| App shell | `ytd-app`, `ytd-page-manager` | `body > ytd-app`, `ytd-page-manager.style-scope` | medium | Mount broad observers here only until scoped targets exist. |
| Masthead/nav | `ytd-masthead`, `#masthead-container`, `#masthead` | `ytd-masthead div.style-scope`, obfuscated topbar button wrappers | high | Header A/B churn affects buttons and search wrappers. |
| Search | `yt-searchbox`, `input#search`, `form[role="search"] input` | `yt-searchbox-input`, `ytd-searchbox #container.ytd-searchbox`, `ytSearchboxComponent*` | high | Prefer role/input over generated component classes. |
| Left guide/sidebar | `ytd-guide-renderer`, `ytd-mini-guide-renderer`, `yt-app-drawer`, `#guide` | `ytd-guide-entry-renderer.style-scope`, `ytd-mini-guide-entry-renderer.style-scope` | high | Home often has mini guide; subscriptions capture has full guide. |
| Feed root | `ytd-browse ytd-rich-grid-renderer`, `ytd-rich-grid-renderer`, `#contents` scoped below feed | `#contents.ytd-rich-grid-renderer`, `ytd-rich-grid-renderer.style-scope` | high | Filter chips recycle content without route events. |
| Feed card/post | `ytd-rich-item-renderer`, `yt-lockup-view-model`, `ytd-video-renderer` | `yt-lockup-view-model.ytd-rich-item-renderer`, `ytd-rich-item-renderer.style-scope` | high | New lockup view models appear in captures; process per-card roots. |
| Thumbnail/media card | `ytd-thumbnail`, `yt-thumbnail-view-model`, `a#thumbnail` | `ytThumbnailViewModelHost`, `ytd-thumbnail a#thumbnail` | high | Resolve from nearest card root. Do not query global thumbnails repeatedly. |
| Shorts | `a[href^="/shorts"]`, `ytd-rich-shelf-renderer` | `yt-thumbnail-overlay-badge-view-model`, `ytd-reel-shelf-renderer` | high | URL path is the stable signal. |
| Watch page | `ytd-watch-flexy[video-id]`, `ytd-watch-flexy`, `ytd-watch-metadata`, `#below` | `ytd-watch-metadata.watch-active-metadata`, `ytd-watch-flexy[flexy]` | high | `video-id` is best route state. |
| Player | `#movie_player`, `.html5-video-player` | `ytd-player #movie_player`, `#player-container #movie_player` | high | MAIN bridge required for page globals. |
| Main video | `video.html5-main-video`, `#movie_player video` | `video.video-stream`, `.html5-video-container video` | medium | Always scoped to current player. |
| Player chrome | `.ytp-chrome-bottom`, `.ytp-right-controls`, `.ytp-progress-bar` | `.ytp-delhi-modern`, `.ytp-overflow-panel`, `.ytp-action-pill`, `.ytp-actions-container` | very high | New player/liquid-glass/Delhi UI needs fresh captures. |
| Player settings | `.ytp-settings-button`, `.ytp-panel`, `.ytp-menuitem` | `.ytp-popup`, `.ytp-panel-menu`, `.ytp-overflow-panel` | high | Prefer player APIs where available; avoid forced menu opening. |
| Related sidebar | `#secondary ytd-watch-next-secondary-results-renderer`, `ytd-watch-next-secondary-results-renderer` | `#related`, `ytd-watch-next-secondary-results-renderer.style-scope` | high | Resolve section root before modifying compact cards. |
| Comments | `ytd-comments`, `ytd-comment-thread-renderer`, `ytd-comment-view-model` | `ytd-comment-thread-renderer.style-scope`, `ytd-comment-renderer` | high | Keep old/new comment shapes in selector packs. |
| Comment composer | `ytd-comment-simplebox-renderer`, `ytd-commentbox`, `#contenteditable-root` | `ytd-comment-simplebox-renderer #placeholder-area`, `ytd-comments ... div.style-scope` | high | Must preserve accessibility and native editor behavior. |
| Engagement panels | `ytd-engagement-panel-section-list-renderer`, `#panels ytd-engagement-panel-section-list-renderer` | `ytd-engagement-panel-title-header-renderer`, `*.style-scope` | high | Transcript, chapters, clips, AI summary live here. |
| Modals/popups | `tp-yt-paper-dialog`, `ytd-popup-container tp-yt-paper-dialog`, `tp-yt-iron-dropdown` | `.ytp-popup`, `.ytd-popup-container`, style-scope wrappers | high | Use inert/focus-safe overlay handling. |
| Astra settings overlay | `[data-ytkit-surface="control-center"]`, `.ytkit-control-center`, `#ytkit-panel` | `.ytkit-panel`, `.ytkit-modal` | low | Astra-owned nodes must be removable by `destroy()`. |
| Channel/profile | `ytd-video-owner-renderer`, `ytd-channel-name`, `#channel-name`, `ytd-c4-tabbed-header-renderer`, `ytd-page-header-renderer` | `yt-avatar-shape`, `yt-decorated-avatar-view-model` | high | Resolve channel IDs/handles from links, never visible text alone. |
| Notifications | `ytd-notification-topbar-button-renderer`, `yt-icon-badge-shape`, `ytd-notification-renderer` | badge-shape generated classes, multi-page-menu wrappers | high | Wait for popup menu root before sorting. |
| Live chat frame | `ytd-live-chat-frame#chat`, `ytd-live-chat-frame`, `iframe#chatframe` | `#chat.ytd-live-chat-frame`, `ytd-live-chat-frame iframe` | very high | Needs dedicated live-stream capture before major work. |
| Live chat iframe DOM | `yt-live-chat-app`, `yt-live-chat-renderer`, `yt-live-chat-item-list-renderer` | `yt-live-chat-text-message-renderer`, `yt-live-chat-message-input-renderer` | very high | Requires all-frame content script and iframe-specific fixtures. |

### CSS Token Catalog

The captures expose YouTube token families that Astra should hook instead of fighting with raw colors:

- Color and surface: `--yt-spec-*`, `--premium-yt-spec-*`, `--yt-saturated-*`, `--yt-light-wash-*`, text/icon/background token families.
- Player spacing/chrome: `--ytd-watch-flexy-space-below-player`, `--yt-delhi-pill-height`, `--yt-delhi-bottom-controls-height`, `--yt-frosted-glass-backdrop-filter-override`.
- Controls and radii: `--yt-button-icon-size`, `--yt-img-border-radius`, avatar and thumbnail radius tokens.
- Live chat: `--yt-live-chat-*` token family for item backgrounds, author colors, timestamps, badges, borders, and input surfaces.
- Text/link: `--yt-attributed-string-link-hover-color` and related attributed string tokens.
- Scrollbar/chrome: YouTube custom scrollbar tokens plus native overlay-scrollbar interaction.

Theme strategy:

- Build a `tokenThemeBridge` that maps YouTube tokens into Astra semantic variables: `--ad-bg`, `--ad-panel`, `--ad-elevated`, `--ad-text`, `--ad-muted`, `--ad-border`, `--ad-accent`, `--ad-danger`, `--ad-warning`, `--ad-success`, `--ad-radius`, `--ad-z-overlay`.
- Override tokens only when a feature class is active, for example `html.ytkit-oled html[dark]`, `html.ytkit-dense`, and `html.ytkit-classic-layout`.
- Preserve YouTube's native forced-colors and reduced-motion affordances.

## Phase 1: Competitive Landscape

Research date: 2026-05-21.

External data is volatile. User counts and update dates below are point-in-time observations from Chrome Web Store, AMO, official sites, Greasy Fork/OpenUserJS, GitHub, and community threads. Store counts are rounded by stores.

### Ranked Competitor Baselines

| Rank | Tool | Author/publisher | Platform | Popularity/recency observed | Feature count | What it does best | Source |
|---:|---|---|---|---|---:|---|---|
| 1 | Return YouTube Dislike | Dmitry Selivanov / Anarios community | Chrome, Firefox, userscript, Edge | Chrome: 6M users, 19.7K ratings, v4.0.4, updated 2026-05-02. AMO: 920,031 users but official Firefox build last updated 2024-10-17. GitHub: 13,591 stars, updated 2026-05-21. | focused | Dislike restoration via archived/sampled data and ratio UI. | https://chromewebstore.google.com/detail/return-youtube-dislike/gebbhagfogifgggkldgodflihgfeippi ; https://addons.mozilla.org/en-US/firefox/addon/return-youtube-dislikes/ ; https://github.com/Anarios/return-youtube-dislike |
| 2 | Video Speed Controller | igrigorik | Chrome, general HTML5 media | Chrome: 3M users, 4.4K ratings, v0.10.2, updated 2026-04-15. | focused | Universal speed overlay, fine increments, per-site rules, 0.07x-16x range. | https://chromewebstore.google.com/detail/video-speed-controller/nffaoalbilbmmfgbnbgppjihopabppdk |
| 3 | SponsorBlock | Ajay Ramachandran / community | Chrome, Firefox, Safari, userscript-compatible ports | Chrome: 2M users, 3.4K ratings, v6.1.5, updated 2026-04-21. AMO: 741,003 users. GitHub: 13,230 stars, updated 2026-05-21. | focused | Crowdsourced segment skipping, categories, submissions/voting, public DB. | https://chromewebstore.google.com/detail/sponsorblock-for-youtube/mnjggcdmjocbbbhaepdhchncahnbgone ; https://addons.mozilla.org/en-US/firefox/addon/sponsorblock/ ; https://github.com/ajayyy/SponsorBlock |
| 4 | Enhancer for YouTube | Maxime RF | Chrome, Edge, Firefox | Chrome: 1M users, 17.3K ratings, v3.0.17, updated 2026-03-14. AMO: 510,589 users, v2.0.133.1, updated 2026-04-07. Edge: about 560K users from Edge search. | broad | Playback, quality, volume boost, themes, cinema/mini/popout, distractions, Shorts. | https://chromewebstore.google.com/detail/enhancer-for-youtube/ponfpcnoihfmfllpaingbgckeeldkhle ; https://addons.mozilla.org/en-US/firefox/addon/enhancer-for-youtube/ ; https://www.mrfdev.com/enhancer-for-youtube |
| 5 | Unhook | Unhook | Chrome, Firefox, Edge | Chrome: 1M users, 4.2K ratings, v1.6.9, updated 2026-03-21. Official site claims 500K+ active users but store currently shows 1M. | 20+ | Simple distraction removal with a tiny private permission footprint. | https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid ; https://unhookextension.com/ |
| 6 | Improve YouTube | Code for Charity | Chrome, GitHub | Chrome: 400K users, 7.1K ratings, v4.2026, updated 2026-03-23. GitHub: 4,379 stars, updated 2026-05-21. | 250+ | Huge open-source settings catalog, multilingual, playback/layout/content controls. | https://chromewebstore.google.com/detail/improve-youtube-%F0%9F%8E%A7-for-yo/bnomihfieiccainjcjblhegjgglakjdd ; https://github.com/code-charity/youtube |
| 7 | PocketTube | NabokD | Chrome, Firefox, Edge, Opera, Safari, mobile | Official site: 300K+ users. GitHub: 334 stars, updated 2026-05-21. | subscription-focused | Subscription groups/tags, personal group feeds, sort/filter, dead-channel detection, group notifications. | https://pockettube.io/ ; https://github.com/NabokD/pockettube |
| 8 | UnTrap for YouTube | UnTrap | Chrome, Firefox, Edge, Safari, Opera | Chrome: 100K users, 490 ratings, described as 250+ features. | 250+ | All-in-one focus/customization plus AI summaries, parental controls, schedules, password-protected settings. | https://chromewebstore.google.com/detail/untrap-for-youtube/enboaomnljigfhfjfoalacienlhjlfil ; https://untrap.app/ ; https://addons.mozilla.org/firefox/addon/untrap-for-youtube/ |
| 9 | DeArrow | Ajay / SponsorBlock ecosystem | Chrome, Firefox | Chrome: 100K users, 303 ratings, v2.3.6, updated 2026-04-23. AMO: 32,224 users. GitHub: 2,144 stars, updated 2026-05-21. | focused | Crowdsourced descriptive titles/thumbnails with fallback title formatting and random timestamp thumbnails. | https://chromewebstore.google.com/detail/dearrow-better-titles-and/enamippconapkdmgfgjchkhakpfinmaj ; https://addons.mozilla.org/en-US/firefox/addon/dearrow/ ; https://github.com/ajayyy/DeArrow |
| 10 | BlockTube | amitbl | Firefox, Chrome/Edge/Opera/Brave | AMO: 30,243 users, v0.4.8, updated 2026-02-07. GitHub: 1,351 stars, updated 2026-05-21. | filtering-focused | Block channels/videos/comments by name, keyword, regex, duration, and custom JS predicate. | https://addons.mozilla.org/en-US/firefox/addon/blocktube/ ; https://github.com/amitbl/blocktube |
| 11 | DF Tube New | focusapps | Chrome | Chrome: 20K users, v1.21.2, updated 2026-05-21. | focus-focused | Hide recommendations/home grid/comments/playlists/Shorts and disable autoplay. | https://chromewebstore.google.com/detail/df-tube-new-distraction-f/kchgllkpfcggmdaoopkhlkbcokngahlg |
| 12 | YouTube Tweaks | Pedro | Firefox, Chrome, Edge | AMO: 15K users, 260 reviews, v2026.5.18, updated 2026-05-18. | 80+ | Grid sizing, hiding, per-channel speed, comments sidebar, quality, wheel controls, anti-autodub. | https://addons.mozilla.org/en-US/firefox/addon/youtube-tweaks/ |
| 13 | Tweaks for YouTube | InzkDev | Firefox, Chrome, Edge | AMO: 8,386 users, v3.89.0, updated 2026-05-15. | 100+ | Mouse-wheel/button control, audio processing, player controls, subtitle styling, YouTube Music/Drive support. | https://addons.mozilla.org/en-CA/firefox/addon/tweaks-for-youtube/ |
| 14 | YouTube Alchemy | Tim Macy | Userscript, Chrome, Firefox, Edge | Greasy Fork: 1,845 installs, v10.13, updated 2026-05-07. AMO: v10.13, updated 2026-05-07. GitHub: 86 stars, updated 2026-05-19. | 200+ | Native-feeling tab view, transcript export, header links, color-coded videos, dense UI settings. | https://greasyfork.org/en/scripts/521686-youtube-alchemy ; https://github.com/TimMacy/YouTubeAlchemy ; https://addons.mozilla.org/en-CA/firefox/addon/youtube-alchemy/ |
| 15 | YouTube HD | adisib | OpenUserJS userscript | 33,716 installs, version 2025.04.13+e9cf6ae, updated 2025-04. | focused | Auto quality 144p-8K, player resize, auto theater, no interval loop. | https://openuserjs.org/scripts/adisib/Youtube_HD |
| 16 | TubeMod | Pedro Gregorio | Chrome, Firefox | Official site claims 50+ options; open-source/free. | 50+ | Lightweight interface hiding/tweaking with import/export. | https://tubemod.dev/ |
| 17 | YouFocus | YouFocus | Chrome | Official site, 2025 product. | focused | Study/work modes, local time tracking, focused history, video notes, channel blocking. | https://youfocus.site/ |
| 18 | Scripts.YT | Robert Wesner | Userscripts and small extensions | Active script hub. | small focused scripts | Play-all restoration, timestamp persistence, shadow-comment checks. | https://scripts.yt/ |
| 19 | Tweeks | NextByte | AI-generated website modifications | Official site: 25K+ people, 4K+ public tweeks, 59 YouTube tweeks. | platform | Natural-language userscript generation and sharing. | https://www.tweeks.io/ |
| 20 | Userstyles/Stylus YouTube themes | Various | Stylus/UserCSS | Counts vary by hub. | CSS-only | OLED/dark/compact/old-layout patches and element hiding with minimal JS risk. | https://userstyles.world/ ; https://greasyfork.org/en/scripts/by-site/youtube.com?language=css |

### Community and Issue Findings

High-value feature-request and breakage themes:

- YouTube UI churn repeatedly breaks player/control/sidebar/comment integrations. Open issues in Improve YouTube, SponsorBlock, RYD, BlockTube, and DeArrow show new player UI, dislike button changes, hidden items returning, scrolled-away ratio bars, and DOM changes breaking thumbnail menus.
- Users want comments/chapters/transcript in sidebars and tabs, not buried below the player. Improve YouTube issues include comments-in-sidebar refresh regression and chapters-in-sidebar requests.
- Content filters need route-specific exceptions. BlockTube issues request subscriptions-page improvements, disable blocking on channel pages/tabs, likes field in advanced blocking, and search case-insensitivity.
- Anti-autodub and auto-translation controls are recurring requests. YouTube Tweaks and BlockTube both expose or request anti-autodub/title-translation behavior.
- Store review delays matter. RYD community threads note userscript updates can land faster than official add-on store updates.
- Focus-mode demand is strong. Recent Reddit threads and YouFocus/UnTrap show users asking for active maintenance, clean study/work modes, timers, notes, and distraction-free defaults.
- Security trust matters. 2026 malicious-extension reporting repeatedly names fake YouTube/TikTok enhancer categories as an attack vector, so Astra must make privacy boundaries, source transparency, permissions, and remote-code avoidance visible.

## Phase 2: Feature Catalog and Gap Analysis

### Abbreviations

Matrix columns:

- AD: Astra Deck current repo
- EYT: Enhancer for YouTube
- IYT: Improve YouTube
- UT: UnTrap
- UH: Unhook
- BT: BlockTube
- PT: PocketTube
- SB: SponsorBlock
- DA: DeArrow
- RYD: Return YouTube Dislike
- YTA: YouTube Alchemy
- YTT: YouTube Tweaks
- TFY: Tweaks for YouTube
- VSC: Video Speed Controller
- US: userscripts/userstyles/smaller tools

Legend: `Y` means present or clearly claimed; `P` means partial; `-` means not a primary feature; `N/A` means the competitor is focused elsewhere.

### Feature Matrix

| Category | Feature | AD | EYT | IYT | UT | UH | BT | PT | SB | DA | RYD | YTA | YTT | TFY | VSC | US | Best implementation note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Theming/UI | OLED/deep dark theme | Y | Y | Y | Y | - | - | - | - | - | - | Y | P | P | - | Y | Astra should keep OLED only and map YouTube tokens natively. |
| Theming/UI | Custom theme/token bridge | P | Y | Y | P | - | - | - | - | - | - | Y | - | custom CSS | - | userstyles | Improve YouTube has mature theme breadth; Astra should add semantic tokens. |
| Theming/UI | Dense/compact layout | Y | P | Y | Y | P | - | - | - | - | - | Y | Y | P | - | Y | YouTube Alchemy has native-feeling compact tab layout. |
| Theming/UI | Classic/old layout restoration | P | P | Y | P | - | - | - | - | - | - | Y | P | - | - | Y | Userstyles and Redux-style tools fill nostalgia gaps but are brittle. |
| Theming/UI | Square thumbnails/avatars/search | Y | P | Y | P | - | - | - | - | - | - | Y | Y | - | - | Y | Astra already has keys; must unify with theme profile. |
| Theming/UI | Custom scrollbar | Y | - | P | P | - | - | - | - | - | - | P | - | P | - | Y | Keep minimal and high-contrast. |
| Theming/UI | Hide frosted glass/new player glass | Y | P | P | P | - | - | - | - | - | - | Y | P | - | - | Y | Current YouTube player UI needs fresh capture. |
| Theming/UI | Watch tabs for info/comments/videos/transcript | Y | - | P | - | - | - | - | - | - | - | Y | - | Y | - | Y | YouTube Alchemy tab view is the benchmark. |
| Theming/UI | Comments in sidebar | P | P | P | - | - | - | - | - | - | - | Y | Y | Y | - | Y | Must survive refresh and route changes. |
| Content filtering | Hide Shorts everywhere | Y | Y | Y | Y | Y | Y | - | - | - | - | Y | Y | Y | - | Y | Use URL/path + shelf selectors. |
| Content filtering | Redirect Shorts to regular video | Y | Y | P | Y | - | - | - | - | - | - | Y | P | - | - | Y | Must preserve timestamp/share links. |
| Content filtering | Hide home feed | Y | P | Y | Y | Y | - | - | - | - | - | P | P | P | - | Y | Unhook's simple toggle is best UX. |
| Content filtering | Hide related/sidebar | Y | Y | Y | Y | Y | - | - | - | - | - | Y | P | Y | - | Y | Must be route-scoped and reversible. |
| Content filtering | Hide comments/live chat | Y | Y | Y | Y | Y | Y | - | - | - | - | Y | Y | Y | - | Y | Must not break comment loading or composer. |
| Content filtering | Keyword/video title blocking | Y | - | Y | Y | - | Y | - | - | - | - | P | P | P | - | Y | BlockTube is baseline; Astra should add safe predicate DSL. |
| Content filtering | Channel blocking | Y | - | P | Y | - | Y | - | - | - | - | P | P | - | - | Y | Include quick block buttons and import/export. |
| Content filtering | Comment author/keyword blocking | Y | - | P | Y | - | Y | - | - | - | - | - | P | - | - | Y | Needs emoji/case/locale-safe matching. |
| Content filtering | Regex filters | P | - | P | Y | - | Y | - | - | - | - | - | P | - | - | Y | Use sandboxed regex budget and circuit breaker. |
| Content filtering | Advanced predicate filters | P | - | - | - | - | Y | - | - | - | - | - | - | - | - | - | BlockTube's JS predicate is powerful but unsafe; Astra DSL must be safer. |
| Content filtering | Hide watched videos by progress | Y | - | P | Y | - | Y | P | - | - | - | Y | Y | Y | - | Y | Astra should combine native progress, local history, and user overrides. |
| Content filtering | Duration/view-count filters | Y | - | P | Y | - | Y | Y | - | - | - | P | Y | P | - | Y | PocketTube leads subscription sorting/filtering. |
| Content filtering | Hide mixes/playlists/movies/upcoming/live | Y | P | Y | Y | Y | Y | P | - | - | - | Y | Y | Y | - | Y | Keep per-route exceptions. |
| Content filtering | Hide autoplay/auto-generated playlists | Y | Y | P | P | Y | Y | - | - | - | - | Y | Y | Y | - | Y | BlockTube issues show this often regresses. |
| Content filtering | Anti auto-dub/translated titles | Y | P | P | P | - | requested | - | - | - | - | Y | Y | - | - | Y | Make title/audio/transcript separate toggles. |
| Playback | Default video quality | Y | Y | Y | P | - | - | - | - | - | - | Y | Y | Y | - | Y | YouTube HD and Enhancer are baselines. |
| Playback | Quality matrix by normal/theater/fullscreen/embed/background | Y | P | P | - | - | - | - | - | - | - | P | P | Y | - | - | Astra should own this as a premium differentiator. |
| Playback | Force H.264/codec/FPS | Y | Y | Y | - | - | - | - | - | - | - | P | - | P | - | Y | MAIN bridge required. |
| Playback | Speed defaults | Y | Y | Y | P | - | - | - | - | - | - | Y | Y | Y | Y | Y | VSC range/per-site model is best. |
| Playback | Per-channel speed | Y | P | P | - | - | - | - | - | - | - | - | Y | - | - | - | YouTube Tweaks is baseline. |
| Playback | Mouse wheel speed/volume/seek | Y | Y | P | - | - | - | - | - | - | - | P | Y | Y | P | Y | Must avoid adding keyboard shortcuts. |
| Playback | Volume boost/audio filters/mono/high-pass | P | Y | P | - | - | - | - | - | - | - | - | Y | Y | - | Y | Tweaks for YouTube is baseline. |
| Playback | A/B loop | Y | Y | P | - | - | - | - | - | - | - | - | P | P | - | Y | Provide visible controls and timeline handles. |
| Playback | Sleep timer | Y | P | P | - | - | - | - | - | - | - | - | - | - | - | Y | Add status/undo toast. |
| Playback | Pause other tabs | Y | Y | P | - | - | - | - | - | - | - | - | Y | P | - | Y | Needs BroadcastChannel/storage event arbitration. |
| Playback | Auto-dismiss "Still watching" | Y | P | Y | P | - | Y | - | - | - | - | - | Y | P | - | Y | Must stay store-policy safe. |
| Playback | Disable autoplay/playlist autoplay | Y | Y | Y | Y | Y | Y | - | - | - | - | Y | Y | Y | - | Y | Visible setting and status indicator. |
| Player UI | Cinema/theater/full-window mode | Y | Y | Y | Y | - | - | - | - | - | - | Y | Y | Y | - | Y | Enhancer/Alchemy are key baselines. |
| Player UI | Sticky/mini/popout player | Y | Y | Y | P | - | - | - | - | - | - | P | Y | Y | - | Y | Must preserve scroll and accessibility. |
| Player UI | PiP button | Y | Y | Y | P | - | - | - | - | - | - | Y | P | Y | - | Y | Use native PiP API. |
| Player UI | Screenshot/snapshot | Y | Y | Y | P | - | - | - | - | - | - | P | Y | Y | - | Y | Include format, subtitles, and filename template. |
| Player UI | Frame-by-frame controls | Y | P | P | - | - | - | - | - | - | - | - | - | Y | P | Y | Visible buttons only. |
| Player UI | Persistent progress bar/chapters | Y | P | Y | P | - | - | - | SB marks | - | - | Y | Y | Y | - | Y | Alchemy with SponsorBlock chapter markers is baseline. |
| Player UI | Custom progress bar color/Nyan progress | Y | P | Y | - | - | - | - | - | - | - | Y | Y | - | - | Y | Keep themeable and opt-in. |
| Media/downloads | Local yt-dlp downloader | Y | - | - | P | - | - | - | - | - | - | - | - | P | - | Y | Astra's local companion is differentiator. |
| Media/downloads | Direct stream links | Y | - | - | P | - | - | - | - | - | - | - | - | Y | - | Y | Must be clear about reliability and policy. |
| Media/downloads | Thumbnail download | Y | - | P | P | - | - | - | - | DA thumbs | - | - | P | Y | - | Y | Include max-res fallback chain. |
| Media/downloads | Subtitle/transcript download | Y | - | P | Y | - | - | - | - | - | - | Y | P | Y | - | Y | Alchemy transcript exporter is benchmark. |
| Sponsor/quality | SponsorBlock skips | Y | - | P | P | - | - | - | Y | - | - | Y | - | - | - | Y | SponsorBlock official behavior is baseline. |
| Sponsor/quality | SponsorBlock submissions/voting | P | - | - | - | - | - | - | Y | - | - | - | - | - | - | - | Add only if API/reputation semantics are implemented safely. |
| Sponsor/quality | DeArrow titles/thumbs | Y | - | P | P | - | - | - | - | Y | - | - | - | - | - | Y | Official DeArrow is baseline. |
| Sponsor/quality | Return dislikes/ratio | Y | - | P | P | - | - | - | - | - | Y | - | - | - | - | Y | RYD official API and caveat copy is baseline. |
| Subscriptions | Subscription groups | P | - | - | P | - | - | Y | - | - | - | - | - | - | - | Y | PocketTube is baseline. |
| Subscriptions | Group feed/filter/sort | P | - | - | P | - | - | Y | - | - | - | - | P | - | - | Y | Need local IndexedDB + YouTube page fetch fallback. |
| Subscriptions | Dead-channel detection | - | - | - | - | - | - | Y | - | - | - | - | - | - | - | - | Add a cautious local-only implementation. |
| Subscriptions | New since last visit | Y | - | - | P | - | - | Y | - | - | - | Y | - | - | - | Y | Store local last-seen per channel/group. |
| Navigation | Logo to subscriptions | Y | - | Y | P | - | - | - | - | - | - | Y | Y | - | - | Y | Already present; should be profile-aware. |
| Navigation | Restore Play All | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Y | Scripts.YT YTPA is baseline. |
| Navigation | Quick links/header links | Y | - | P | - | - | - | - | - | - | - | Y | - | - | - | Y | Alchemy supports up to 10 header links. |
| Navigation | Open in alternative frontend | Y | - | P | - | - | alt requested | - | SB supports Invidious | DA partial | - | - | - | - | - | Y | Should be explicit opt-in and per-instance. |
| Privacy | Clean share URLs | Y | - | P | P | - | - | - | - | - | - | P | - | - | - | Y | `YTShareAntiTrack` proves demand. |
| Privacy | Local-only/no tracking | Y | claimed | claimed | mixed AI | claimed | claimed | claimed | public user ID | server API | server API | claimed | claimed | claimed | claimed | varies | Split store-safe local profile from API-enabled profile. |
| Privacy | Data-flow panel | Y | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Make this visible and exportable. |
| Privacy | Password-protected settings | - | - | - | Y | - | - | - | - | - | - | - | - | - | - | - | Only implement as local UI lock, not real crypto security. |
| Accessibility | Reduced motion | Y | P | P | P | - | - | - | - | - | - | - | - | - | - | userstyles | Required for premium polish. |
| Accessibility | Forced colors/high contrast | Y | - | P | - | - | - | - | - | - | - | - | - | - | - | userstyles | Keep semantic tokens and contrast audit. |
| Accessibility | Screen-reader status region | Y | - | P | - | - | - | - | - | - | - | - | - | - | - | - | All toasts/actions announce through one live region. |
| Accessibility | Subtitle styling | Y | - | P | - | - | - | - | - | - | - | - | - | Y | - | Y | TFY is baseline for subtitle controls. |
| Research/AI | AI summary | Y | - | - | Y | - | - | - | - | - | - | P | - | - | - | Y | UnTrap/Rovetify set expectation; Astra must be BYO-key/local-first. |
| Research/AI | Transcript index/search | Y | - | - | P | - | - | - | - | - | - | Y | - | - | - | Y | Use IndexedDB and explicit retention controls. |
| Research/AI | Transcript handoff to ChatGPT/NotebookLM/etc. | Y | - | - | P | - | - | - | - | - | - | Y | - | - | - | Y | Alchemy's header buttons are benchmark. |
| Research/AI | Per-video notes | - | - | - | P | - | - | - | - | - | - | - | - | - | - | Y | YouFocus and community scripts show demand. |
| Research/AI | Study/work modes and time tracking | P | - | - | Y | - | - | - | - | - | - | - | - | - | - | Y | YouFocus is baseline; add local export. |
| Live chat | Premium live chat layout | Y | - | P | P | Y hide | - | - | - | - | - | P | P | - | - | Y | Needs fresh iframe captures. |
| Live chat | Chat keyword/reaction controls | Y | - | - | - | - | comment filters | - | - | - | - | - | - | - | - | Y | Keep spammy automation off by default. |
| Developer/DX | Feature registry lifecycle | P | - | Y | - | - | - | - | - | - | - | P | - | - | - | - | Every feature must be reversible and testable. |
| Developer/DX | MHTML selector fixtures | P | - | - | - | - | - | - | - | - | - | - | - | - | - | - | Make captures first-class fixture inputs. |
| Developer/DX | Store-safe/full profiles | P | - | - | P | - | - | - | - | - | - | - | - | - | - | - | Critical due extension-store security climate. |

### Gap Analysis

High-value gaps Astra can own:

- Selector intelligence: competitors fix DOM churn reactively. Astra should ship a runtime selector resolver that records misses, falls back through versioned selector packs, exposes a health panel, and points maintainers to stale MHTML fixtures.
- Permission transparency: many YouTube enhancers are now judged against malicious-extension risk. Astra should ship an explicit data-flow panel, store-safe manifest, and full-power GitHub build with clear permission deltas.
- Full subscription workstation: PocketTube dominates subscription grouping, but Astra can combine groups with filters, DeArrow/RYD/SponsorBlock metadata, local notes, watch-later cleanup, dead-channel detection, and AI tag suggestions.
- Research workspace: Alchemy has transcript export; UnTrap/Rovetify have AI summaries; YouFocus has notes/time tracking. Astra should unify transcripts, notes, summaries, spaced review, quote clipping, Markdown export, and local search.
- Safe predicate engine: BlockTube's custom JS is powerful but risky. Astra should build an audited expression DSL with budgets, dry-run preview, rule explanations, import/export, and route-specific exceptions.
- Player chrome resilience: YouTube's new player UI breaks the category. Astra should build a player chrome adapter with old/new selector packs and capture-backed tests.
- Live chat quality: few competitors deeply polish live chat. Astra should own live chat readability, moderation filters, sticky/side-by-side layouts, archive export, and low-latency performance.
- Accessibility as a differentiator: most competitors treat a11y as incidental. Astra should make reduced motion, forced colors, live regions, focus trapping, contrast, and pointer-target sizes part of release gates.
- Local media pipeline: downloader competitors are often sketchy or policy-sensitive. Astra already has a local companion; make it safer, clearer, and more reliable than direct in-extension download claims.

Final scope: the v6 charter is the union of competitor features above plus these gaps, constrained by privacy, store policy, performance, and maintainability.

## Phase 3: Technical Reconnaissance

### Selector Strategy

Implement selector handling as a versioned selector pack:

```js
{
  surface: "feedCard",
  stable: ["ytd-rich-item-renderer", "yt-lockup-view-model", "ytd-video-renderer"],
  fallback: ["yt-lockup-view-model.ytd-rich-item-renderer", "ytd-rich-item-renderer.style-scope"],
  captureEvidence: ["mhtml/YouTube.mhtml", "Subscriptions - YouTube.mhtml"],
  highChurn: true,
  ownerFeatureIds: ["hideVideosKeywordFilter", "deArrow", "returnDislikeOnCards"]
}
```

Rules:

- New feature code calls `findSurfaceElement(surface, root)` or `findSurfaceElements(surface, root)`, never raw document-wide selectors.
- High-churn surfaces use `waitForElement` with bounded backoff and a short timeout.
- Observers process only `addedNodes` and then scope down to nearest feature root.
- Every selector miss increments bounded diagnostics keyed by `surface::selector`.
- Selector packs include capture provenance and last verified date.
- Tests fail if a stable selector disappears from all current fixtures and no fallback matches.

### SPA Handling

Existing good signals to keep:

- `yt-navigate-finish`
- `yt-page-data-updated`
- `popstate`
- `window.navigation` `navigate` event as feature-detected fallback
- `ytd-watch-flexy[video-id]` mutation observer

Feature lifecycle model:

- `document_start`: anti-FOUC classes, theme variables, Trusted Types policy setup, MAIN bridge registration.
- `document_idle`: settings load, registry init, current-route processing.
- Once per session: storage migrations, locale load, background bridge handshake, diagnostics setup, API limiter setup.
- Once per route: watch metadata, player controls, transcript/chapters/comments panels, related sidebar, subscription feed transforms.
- Per added node: feed cards, thumbnails, comments, notifications, live-chat messages.
- Per media element: playback rate, quality, codec, volume, subtitles, PiP/screenshot controls.

Observer constraints:

- One global coordinator per document.
- One scoped observer per high-churn surface only when a feature is enabled.
- Never perform a full `document.querySelectorAll` for every mutation.
- Batch work in `requestAnimationFrame` or `requestIdleCallback` with fallback timeout.
- Disconnect all observers in feature `destroy()`.

### APIs and Rate Limits

Known API/endpoints worth using:

| API | Endpoint | Used for | Auth/cookies | Rate-limit strategy |
|---|---|---|---|---|
| YouTube watch HTML | `https://www.youtube.com/watch?v={videoId}` | fallback player response, caption tracks, title metadata | same-origin/cookies may apply | route-level cache, abort stale route fetches |
| Innertube player | `https://www.youtube.com/youtubei/v1/player?key={apiKey}` | caption tracks/player response fallback | public page key, no secret | per-video dedupe, backoff on 429/403, rotate scraped client version |
| YouTube timed text | caption `baseUrl` from player response | transcript segment download | no extra auth beyond URL | cache per video/language, cap segment payloads |
| SponsorBlock skip segments | `https://sponsor.ajay.app/api/skipSegments/{hashPrefix}` | segment skips and progress markers | no YouTube cookies | hash-prefix cache, category-specific cache key, stale fallback |
| DeArrow branding | `https://sponsor.ajay.app/api/branding?videoID={id}` | titles/thumbnails | no YouTube cookies | in-flight dedupe, TTL setting, LRU cap |
| DeArrow thumbnail | `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?...` | replacement thumbnail images | no YouTube cookies | lazy load only visible cards |
| Return YouTube Dislike | `https://returnyoutubedislikeapi.com/votes?videoId={id}` | likes/dislikes/ratio | no YouTube cookies | watch-only by default, card fetches lazy/visible and cache-bounded |
| Reddit comments | `https://www.reddit.com/...` / `https://old.reddit.com/...` | optional discussion panel | no YouTube cookies | opt-in, per-video query cap, user-visible source |
| AI providers | OpenAI, Anthropic, Gemini, Ollama/local | summaries, transcript Q&A | BYO key or local only | off by default, explicit provider, token budget, redact controls |
| Astra Downloader | `http://127.0.0.1:{port}` | local downloads, health, history, stream links | local token | 127.0.0.1 only, no localhost, health TTL, auto-start recovery |

Rate limiter requirements:

- Central `ApiLimiter` handles per-origin concurrency, dedupe, TTL, exponential backoff, stale cache fallback, and cancellation.
- No third-party API receives YouTube cookies or auth headers.
- Card-level third-party API fetches must be lazy and visibility-bound.
- Background proxy allowlist must remain strict and test-covered.

### Constraints

- Trusted Types: do not use `innerHTML`, `insertAdjacentHTML`, or string HTML sinks directly. Use DOM construction or `setTrustedHTML`.
- MV3 service worker: no long-lived background state assumptions. Persist resumable work; design for worker suspension.
- Store policy: ad blocking, downloader, Cobalt/direct-stream, and age-restriction bypass surfaces may need GitHub/full-power build separation.
- YouTube Terms and anti-abuse: no hidden botting, no automated engagement spam by default, no credential extraction, no remote code execution.
- Shadow DOM: extension-owned overlay widgets can use Shadow DOM only if theming/a11y and teardown are tested.
- Live chat iframe: all-frame content script required; top-level watch page cannot see inside cross-document chat DOM.
- Performance: feed transforms must be incremental and cache-backed; avoid layout thrash on rich grids.

### Userscript vs Extension Recommendation

Ship both.

The userscript is the fastest compatibility and recovery vehicle:

- Single file.
- Quick GitHub/Gist updates.
- Better MAIN-world access.
- Easier for power users to inspect.
- Useful when store review delays break core YouTube surfaces.

The MV3 extension is the primary polished product:

- Safer settings UI.
- Background proxy.
- Downloads API.
- Local companion bridge.
- Permission-gated optional APIs.
- Extension popup and store distribution.
- Better multi-browser packaging.

Packaging profiles:

- `store-safe`: no ad skipping claims beyond SponsorBlock-style user value, no risky downloader defaults, no broad host permissions beyond needed YouTube/API origins, no remote code, no hidden tracking.
- `github-full`: optional downloader/direct-stream/local companion/advanced predicates/experimental APIs with explicit warnings and visible data flow.
- `userscript`: single-file portable build with GM storage, GM fetch/style APIs, and graceful degradation when extension-only APIs are unavailable.

### Architecture

Recommended v5 file layout:

```text
extension/
  core/
    registry.js
    feature-lifecycle.js
    selectors.js
    selector-health.js
    navigation.js
    observers.js
    api-limiter.js
    trusted-html.js
    storage.js
    storage-manager.js
    settings-schema.js
    settings-migrations.js
    diagnostics.js
    toast.js
    a11y.js
    theme-tokens.js
    policy-profile.js
  features/
    content-filters/
    player/
    media-downloads/
    sponsorblock/
    dearrow/
    return-dislike/
    subscriptions/
    research/
    comments/
    live-chat/
    navigation/
    theming/
    privacy/
    accessibility/
  ui/
    control-center/
    popup/
    overlays/
    components/
  generated/
    userscript-bundle.js
```

Feature contract:

```js
export const feature = {
  id: "hideVideosKeywordFilter",
  category: "contentFiltering",
  storageKey: "hideVideosKeywordFilter",
  defaultValue: "",
  dependencies: ["selectorHealth", "navigation"],
  init(ctx) {},
  apply(ctx, value) {},
  destroy(ctx) {}
};
```

Lifecycle rules:

- `init()` wires observers/listeners and applies current state.
- `apply()` updates immediately when settings change.
- `destroy()` reverses everything.
- Async work gets an `AbortController` and a monotonically increasing route token.
- Feature modules may only mutate DOM below resolved surface roots.
- Feature modules must report diagnostics through one logger.

## Settings Panel Spec

The settings panel is a first-class feature, not a dump of toggles.

Panel behavior:

- Dark/OLED only.
- Dense grouped sections.
- Search/filter by feature name, storage key, competitor, route, and risk.
- Immediate apply on every toggle/change.
- Toast/status-region feedback for actions.
- No confirmation dialogs.
- Undo toast for reversible destructive actions.
- Import/export profiles.
- Store-safe/full profile indicator.
- Per-feature diagnostics row: last applied, last selector miss, last API error, active observers.
- Inactive overlays use `pointer-events: none`.

Required setting categories:

- Interface and theme
- Watch page and player
- Playback and audio
- Content filtering and moderation
- Shorts
- Comments and live chat
- Subscriptions and feeds
- SponsorBlock, DeArrow, and quality signals
- Downloads and local companion
- Transcript, research, and AI
- Privacy and data
- Accessibility and performance
- Developer diagnostics

Current observed flat key inventory, to be categorized and given metadata in v5:

```text
hideCreateButton, hideVoiceSearch, logoToSubscriptions, widenSearchBar, squareSearchBar, squareAvatars, subscriptionsGrid, homepageGridAlign, styledFilterChips, hideSidebar, uiStyle, noAmbientMode, compactLayout, thinScrollbar, watchPageRestyle, chatStyleComments, removeAllShorts, redirectShorts, disablePlayOnHover, fullWidthSubscriptions, hideSubscriptionOptions, hidePaidContentOverlay, redirectToVideosTab, hidePlayables, hideMembersOnly, hideNewsHome, hidePlaylistsHome, hideRelatedVideos, expandVideoWidth, floatingLogoOnWatch, hideDescriptionRow, hideVideoEndContent, hideJumpAheadButton, stickyVideo, cleanShareUrls, videosPerRow, quickLinkMenu, quickLinkItems, autoMaxResolution, hideMerchShelf, hideAiSummary, hideDescriptionExtras, hideHashtags, hidePinnedComments, hideCommentDislikeButton, hideCommentActionMenu, condenseComments, hideCommentTeaser, autoExpandComments, hideLiveChatEngagement, premiumLiveChat, reactionSpammer, _reactionSpammerAck, hidePaidPromotionWatch, hideChannelJoinButton, hideFundraiser, hiddenChatElementsManager, hiddenChatElements, chatKeywordFilter, hiddenActionButtonsManager, hiddenActionButtons, hiddenPlayerControlsManager, hiddenPlayerControls, hiddenWatchElementsManager, hiddenWatchElements, showLocalDownloadButton, videoContextMenu, hideCollaborations, hideVideosFromHome, hideVideosKeywordFilter, hideVideosDurationFilter, hideVideosSubsLoadLimit, hideVideosSubsLoadThreshold, hideVideosRemoveHiddenCards, hideVideosShowQuickHideButton, hideVideosAllowChannelBlock, hideVideosRememberRestoredVideos, hideVideosScopeHome, hideVideosScopeSubscriptions, hideVideosScopeSearch, hideVideosScopeWatch, hideVideosScopeChannels, hideVideosScopeOther, hideVideosLowViewFilter, hideVideosLowViewThreshold, hideVideosHideLive, hideVideosHideUpcoming, hideVideosHideMixes, hideVideosHidePlaylists, hideVideosHideMovies, hideVideosHideAutoDubbed, hideVideosWatchedRatio, hideInfoPanels, colorTheme, commentEnhancements, sidebarOrder, forceH264, titleNormalization, watchProgress, autoDismissStillWatching, remainingTimeDisplay, showPlaylistDuration, showTimeInTabTitle, customProgressBarColor, compactUnfixedHeader, reversePlaylist, rssFeedLink, preciseViewCounts, videoScreenshot, perChannelSpeed, hideWatchedVideos, hideWatchedMode, antiTranslate, pauseOtherTabs, abLoop, fineSpeedControl, showChannelVideoCount, redirectHomeToSubs, notInterestedButton, timestampBookmarks, blueLightFilter, blueLightIntensity, disableInfiniteScroll, popOutPlayer, watchTimeTracker, alwaysShowProgressBar, sortCommentsNewest, autoSkipChapters, autoSkipChapterPatterns, chapterNavButtons, videoLoopButton, persistentSpeed, persistentSpeedValue, codecSelector, ageRestrictionBypass, autoLikeSubscribed, thumbnailPreviewSize, cinemaAmbientGlow, transcriptViewer, searchFilterDefaults, searchFilterSort, forceStandardFps, stickyChat, autoExpandDescription, keyMoments, scrollToPlayer, hideEndCards, hideInfoCards, autoTheaterMode, resumePlayback, miniPlayerBar, playbackStatsOverlay, hideNotificationBadge, autoPauseOnSwitch, creatorCommentHighlight, copyVideoTitle, channelAgeDisplay, speedIndicatorOverlay, hideAutoplayToggle, fullscreenOnDoubleClick, rememberVolume, rememberVolumeLevel, pipButton, autoSubtitles, autoSubtitleLang, focusedMode, thumbnailQualityUpgrade, watchLaterQuickAdd, playlistEnhancer, commentSearch, videoZoom, forceDarkEverywhere, customCssInjection, customCssCode, shareMenuCleaner, autoClosePopups, videoResolutionBadge, likeViewRatio, downloadThumbnail, grayscaleThumbnails, disableAutoplayNext, channelSubCount, customSpeedButtons, openInNewTab, preventAutoplay, hideNotificationButton, noFrostedGlass, autoOpenChapters, autoOpenTranscript, chronologicalNotifications, hideLatestPosts, disableMiniPlayer, adaptiveLiveLayout, commentNavigator, shortsAsRegularVideo, themeAccentColor, theaterAutoScroll, scrollWheelSpeed, speedStep, preloadComments, playbackSpeedOSD, enableCPU_Tamer, enableHandleRevealer, autoDownloadOnVisit, downloadQuality, downloadVideoFormat, downloadAudioFormat, deArrow, daReplaceTitles, daReplaceThumbs, daTitleFormat, daFallbackFormat, daShowOriginalHover, daCacheTTL, sponsorBlock, sbCat_sponsor, sbCat_intro, sbCat_outro, sbCat_selfpromo, sbCat_interaction, sbCat_music_offtopic, sbCat_preview, sbCat_filler, sbCat_poi_highlight, showStatisticsDashboard, settingsProfiles, debugMode, nyanCatProgressBar, fitPlayerToWindow, disableSpaNavigation, videoRotation, videoRotationAngle, frameByFrameButtons, digitalWellbeing, dwBreakIntervalMin, dwDailyCapMin, dwWatchTimeToday, _profiles, _activeProfile, privacyDataFlowPanel, safeStoreProfile, githubFullProfile, syncSafePrefs, syncSafePrefsAllowlist, advancedLocalPredicate, advancedLocalPredicateCode, commentFilterManager, commentFilterRules, bulkCardActions, feedTriageProfile, downloadScreenshotFormat, downloadSubtitlesWithScreenshot, volumeWheelMode, disableLoudnessNormalization, perChannelIntroOutro, perChannelIntroOutroData, initialPlayerStateForeground, initialPlayerStateBackground, downloadHistoryPanel, downloadHealthPanel, downloadStreamLinksPanel, downloadCobaltFallback, downloadCobaltInstance, returnDislike, returnDislikeOnCards, returnDislikeCacheHours, returnDislikeShowRatio, deArrowChannelOverrides, deArrowChannelOverridesPanel, qualityProfileMatrix, qualityDefaultNormal, qualityDefaultTheater, qualityDefaultFullscreen, qualityDefaultBackground, qualityDefaultEmbed, antiTranslateAudioTrack, antiTranslateTranscript, monetizationIndicator, subscriptionGroups, subscriptionGroupData, subscriptionSortMode, subscriptionShowNewSinceLastVisit, subscriptionLastVisitData, subscriptionAiTags, subscriptionAiTagData, localAiSummary, researchSpacedReview, researchTranscriptIndex, researchTranscriptSearchPanel, reducedMotion, forcedColorsSupport, globalAriaLiveRegion, lowPowerProfile, lowPowerProfileBackup, oledTheme, denseMode, rectangularizeYouTube, classicLayoutProfile, newPlayerUiRestore, tokenThemeBridge, openInAlternativeFrontend, alternativeFrontendInstance, vlcMpvHandoff, astraContextMenu, youtubeMusicCompat, subtitleDownload, videoVisualFilters, vvfBrightness, vvfContrast, vvfSaturation, vvfHue, vvfGrayscale, vvfSepia, dearrowPeekButton, videoAgeColors, watchPageTabs, redditComments, diagnosticLog, _errors, storageQuotaLRU, apiRetryBackoff, watchHistoryAnalytics, subtitleStyling, subStyleFontSize, subStyleFontFamily, subStyleColor, subStyleBgOpacity, subStyleBgColor, subStyleBottomOffset, subStyleTextShadow, aiVideoSummary, aiSummaryEndpoint, aiSummaryModel, aiSummaryApiKey, aiSummaryProvider, copyChapterMarkdown, chapterJumpButtons, hideAirplayButton, hideQueueOnThumbnails, fullTitles, titleCaseTransform, titleCaseMode, customSelectionColor, selectionColor, bypassPlaylistMode, musicVideoSpeedLock, playlistQuickRemove, watchLaterCleanup, transcriptAiHandoff, transcriptAiTarget, audioTrackLanguage, preferredAudioLang, notifyAutoDubbedAudio, sleepTimer
```

For every key, `settings-schema.js` must add:

- `category`
- `label`
- `description`
- `defaultValue`
- `storageKey`
- `type`
- `risk`: `safe`, `api`, `local-companion`, `experimental`, `store-risk`
- `scope`: `global`, `feed`, `watch`, `player`, `comments`, `live-chat`, `subscriptions`, `downloads`
- `vehicle`: `extension`, `userscript`, or `both`
- `profile`: `store-safe`, `github-full`, or `both`
- `immediateApply`: true unless technically impossible
- `destroyRequired`: true for all DOM-affecting features

## Phased Build Plan

### v5.0.0 - Architecture and Settings Foundation

Goal: make the product maintainable enough to carry the full superset.

Features:

- Extract feature modules from the monolith by category.
- Introduce `feature-lifecycle.js`.
- Introduce full settings schema metadata for all 354 observed keys.
- Build category-driven settings panel with search, profile badges, and diagnostics.
- Add selector health system and versioned selector packs.
- Add route-aware observer coordinator.
- Add data-flow panel v1 with API origins and permission explanations.
- Add explicit store-safe/full/userscript profile switch.

Acceptance criteria:

- Every current setting has category, label, description, default, type, risk, scope, vehicle, and profile metadata.
- Every feature can be disabled without leaving DOM/classes/listeners/observers behind.
- `npm run check`, `npm test`, `npm run build`, `npm run audit:a11y`, and `npm run audit:contrast` pass.
- Userscript parity tests prove feature metadata bundles correctly.
- Selector fixtures fail loudly when stable selectors disappear.

### v5.1.0 - Selector Fixture and DOM Churn Hardening

Goal: make YouTube UI changes diagnosable instead of mysterious.

Features:

- Formal MHTML parser output with HTML/CSS part inventory, selector coverage, token catalog, and API-state scan.
- Add live-chat iframe capture workflow.
- Add new player/Delhi/liquid-glass capture workflow.
- Add selector health dashboard in diagnostics.
- Add runtime selector miss caps, export, and "copy report" action.
- Add per-surface smoke tests: home, subscriptions, watch, comments, related sidebar, player, notifications, live chat.

Acceptance criteria:

- Capture parser records all four current captures and produces deterministic JSON fixtures.
- Each selector pack entry includes capture provenance.
- Watch/player/comment features still apply after `yt-navigate-finish`, `yt-page-data-updated`, filter-chip recycling, and `ytd-watch-flexy[video-id]` mutation.
- No observer performs full-document scans per mutation.

### v5.2.0 - Content Filtering Superset

Goal: beat BlockTube, Unhook, UnTrap, YouTube Tweaks, and uBO-style cosmetic filters for YouTube content control.

Features:

- Unified filter rules engine for videos, channels, comments, shelves, search results, subscriptions, and related sidebar.
- Keyword, regex, channel ID, handle, duration, view count, upload age, watched ratio, live/upcoming/mix/movie/playlist/auto-dub filters.
- Route-specific rule scopes and exceptions.
- Safe predicate DSL with dry-run preview and budget/circuit breaker.
- Quick hide/block/not-interested actions on cards and comments.
- Bulk card actions and feed triage profile.
- Import/export BlockTube-style filters where safely translatable.

Acceptance criteria:

- Filters apply incrementally to added cards/comments.
- Emoji, apostrophes, casing, and localized metadata do not break matching.
- Disabled filters fully restore hidden content where possible.
- Advanced predicates cannot call arbitrary JS, network, storage, DOM mutation, or `eval`.

### v5.3.0 - Playback and Player Superset

Goal: beat Enhancer for YouTube, Video Speed Controller, Tweaks for YouTube, YouTube HD, and YouTube Alchemy in player control without adding keyboard shortcuts.

Features:

- Quality matrix by normal/theater/fullscreen/embed/background.
- Codec/FPS controls with MAIN bridge diagnostics.
- Speed presets, per-channel speed, visible custom speed controls, wheel speed/volume/seek zones.
- Audio boost, mono mix, pan, high-pass, loudness normalization disable.
- A/B loop timeline handles.
- Frame buttons and frame capture.
- PiP, popout, sticky player, mini-player bar.
- Screenshot with format/subtitle/filename options.
- Subtitle styling panel.
- Persistent progress bar with chapters, SponsorBlock marks, and remaining time adjusted for speed/skips.

Acceptance criteria:

- No keyboard shortcuts are added.
- All controls are accessible by pointer and screen reader.
- Main video element detection survives SPA navigation.
- Quality/speed settings do not fight YouTube's own async player initialization.

### v5.4.0 - Watch Page, Comments, and Live Chat Workstation

Goal: own the watch-page workflow.

Features:

- Native-feeling tabs for Info, Comments, Videos, Chapters, Transcript, Chat, Notes, Reddit.
- Comments in sidebar with refresh-safe state.
- Auto-open transcript/chapters/comments with route-scoped restore.
- Comment search, comment navigator, creator/pinned/comment highlighting controls.
- Live-chat iframe polish: OLED theme, compact density, keyword filters, author filters, sticky chat, fullscreen side-by-side chat.
- Chat replay hiding and engagement clutter cleanup.
- Engagement panel manager for AI summary, clips, transcript, chapters.

Acceptance criteria:

- Comments-in-sidebar persists after F5 and SPA navigation.
- Live chat features are backed by fresh iframe fixtures.
- Comment composer remains usable and accessible.
- All panels destroy cleanly and restore native YouTube layout.

### v5.5.0 - Subscription and Feed Manager

Goal: exceed PocketTube while staying local-first.

Features:

- Nested subscription groups.
- AI-suggested tags stored locally and editable.
- Group feeds with sort by upload date, length, popularity, watched state, and new-since-last-visit.
- Dead-channel detection.
- Bulk unsubscribe staging with undo.
- Group notifications and digest panel.
- Group import/export.
- Channel page group chips and quick actions.
- "Play all" restoration for videos, Shorts, live, popular, and group feeds.

Acceptance criteria:

- All group data is local unless explicit sync/export is enabled.
- Group feeds work without YouTube Data API keys where possible.
- Bulk unsubscribe never performs irreversible actions without an undoable staging surface.
- Import/export round-trip tests cover nested groups and AI tags.

### v5.6.0 - Research, Notes, Transcript, and AI Suite

Goal: combine YouTube Alchemy, Rovetify, UnTrap AI, and YouFocus into a local-first research workspace.

Features:

- Per-video notes with timestamps and source links.
- Transcript search index in IndexedDB.
- Spaced review queue for saved clips/notes.
- Transcript export to Markdown, TXT, JSON, SRT/VTT where source permits.
- Transcript handoff buttons for ChatGPT, NotebookLM, Claude, Gemini, Obsidian URI, local files.
- BYO-key summaries for OpenAI/Anthropic/Gemini and local Ollama summary.
- Summary provenance: source transcript language, timestamp range, model/provider, token budget.
- Top-comment digest with strict opt-in and source attribution.
- Study/work modes with local time tracking, focused history, notes, and break timer.

Acceptance criteria:

- AI is off by default.
- BYO API keys are never included in exports, diagnostics, logs, or sync-safe profiles.
- Local/offline mode works without network AI providers.
- Notes/transcripts/export have deterministic tests.

### v5.7.0 - Media and Downloader Reliability

Goal: make downloads explicit, safe, diagnostic, and better than sketchy downloader extensions.

Features:

- Local companion health dashboard v2.
- Stream link panel with format/quality capability explanation.
- yt-dlp status, Deno/runtime, ffmpeg, cookies, and PO-token diagnostics.
- Retry/fallback sequencing: local companion, stream links, Cobalt instance, thumbnail/subtitle-only paths.
- Download history with local-only retention controls.
- Safe auto-start recovery for stopped companion.
- VLC/MPV handoff with user-visible commands.

Acceptance criteria:

- Store-safe profile can disable risky download surfaces.
- No `localhost` origin is added; only literal `127.0.0.1` loopback is allowed.
- Downloader cleanup cannot delete outside intended artifact directories.
- Every failure shows actionable local diagnostics.

### v5.8.0 - Privacy, Security, and Store Profile Hardening

Goal: make trust part of the product.

Features:

- Permission diff view: store-safe vs GitHub-full vs userscript.
- API data-flow panel with per-origin purpose, credentials policy, cache TTL, and disable action.
- Remote-code audit gate.
- Secret scanner for built artifacts.
- Extension manifest profile generator.
- Safer AI-key storage copy.
- Profile export scrubber.
- Network activity diagnostics.

Acceptance criteria:

- Store-safe artifact has the minimal host permissions needed for its enabled features.
- Third-party API requests omit YouTube credentials.
- Build fails if remote code, unexpected host permissions, or API-key leaks appear.
- Privacy copy is suitable for Chrome Web Store/AMO submission.

### v5.9.0 - Accessibility and Performance Release Gate

Goal: make quality measurable.

Features:

- Screen-reader smoke tests for popup, settings, watch overlays, toasts, and major controls.
- Forced-colors and reduced-motion support across all Astra UI.
- Contrast gate for semantic tokens.
- Long-session memory leak test.
- Feed mutation stress test.
- API rate-limit/backoff tests.
- Low-power profile that disables expensive animations, thumbnail transforms, AI, and card-level API fetches.

Acceptance criteria:

- No focus trap remains active when overlays are hidden.
- All interactive controls have names and reachable focus order.
- Feed stress test shows bounded observer work and no unbounded diagnostics maps.
- Low-power profile measurably reduces card-processing work.

### v6.0.0 - "Beats Every Competitor" Release

Goal: ship the union of competitor features plus Astra-only differentiators.

Features:

- All v5 phases complete.
- README build deliverable written for public release.
- Competitive comparison page generated from settings schema.
- Chrome, Firefox, and userscript artifacts produced.
- Store-safe and GitHub-full releases signed/packaged separately.
- Full regression bundle and manual browser smoke plan executed.

Acceptance criteria:

- Every matrix feature is either shipped, intentionally excluded with a documented policy reason, or marked experimental in GitHub-full only.
- Astra replaces at least these stacks for a power user: SponsorBlock, DeArrow, Return YouTube Dislike, Unhook, BlockTube, PocketTube, Video Speed Controller, YouTube Alchemy, YouTube Tweaks, Tweaks for YouTube, and common Stylus dark/compact themes.
- No critical route, player, comment, or feed feature depends only on a raw obfuscated class.
- README, changelog, store checklist, and privacy copy are updated in the implementation release.

## Risks and Open Questions

- YouTube player redesign: `.ytp-delhi-modern`, action pills, overflow panels, and bottom controls are high-churn. Need fresh captures before large player UI work.
- Live chat: current MHTML captures do not include full iframe internals. Major live-chat work needs live-stream fixtures.
- Store policy: download, ad/promo skip, age-restriction bypass, and Cobalt/direct-stream features may require GitHub-full only.
- RYD accuracy: dislike counts for post-2021 and low-traffic videos are estimates. UI must disclose this.
- SponsorBlock/DeArrow API terms and rate limits: card-level use must remain conservative and cache-bounded.
- AI summaries: provider APIs create privacy and cost risk. Keep opt-in, BYO key/local-first, and clearly labelled.
- Extension ecosystem trust: malicious YouTube-enhancer-like extensions are an active public concern. Avoid broad permissions, remote code, analytics, and opaque update behavior.
- Full settings schema migration: 354 flat keys require careful migration tests and import/export compatibility.
- Userscript parity: MV3-only features need clear graceful degradation in the userscript.
- Performance: rich grid cards recycle aggressively; visibility-bound processing and LRU caches are mandatory.

## Definition of Done

`v6.0.0` is done when:

- Astra Deck has a categorized settings schema for every toggle.
- Every feature has `init()`, immediate apply where possible, and complete `destroy()`.
- Store-safe, GitHub-full, and userscript profiles are generated from one source of truth.
- Selector packs are capture-backed and tested against home, subscriptions, watch, comments, player, notifications, and live chat fixtures.
- The extension beats or matches every listed competitor category, with policy-based exclusions explicitly documented.
- All UI is dark/OLED, dense, accessible, reversible, and free of confirmation dialogs.
- No keyboard shortcuts are added.
- Third-party APIs are opt-in or narrowly scoped, rate-limited, and credential-safe.
- The local downloader is explicit, diagnostic, and bounded to `127.0.0.1`.
- Tests, lint, syntax checks, a11y audit, contrast audit, storage audit, version checks, build, and userscript parity all pass.
- A public README is produced in the implementation release, not in this planning-only run.
