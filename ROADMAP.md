# Astra Deck Product Superset Roadmap

> Version convention: `Astra Deck vX.Y.Z`
> Current repo version observed: `Astra Deck v3.22.0`
> Planning track: `v3.23.0` through `v4.0.0`
> Target site: YouTube desktop web, YouTube live chat frames, YouTube embeds where technically safe
> Deliverable type for this run: research and planning only
> Generated: 2026-05-19

## Project Overview

Astra Deck is planned as the most feature-dense YouTube power-user layer available: a privacy-first MV3 extension plus single-file userscript that combines the breadth of YouTube Alchemy, the stability of SponsorBlock and DeArrow, the control surface of Control Panel for YouTube, the filtering depth of BlockTube and Unhook, the local media pipeline of yt-dlp frontends, and a premium OLED interface designed for daily use.

Chosen vehicle: both MV3 extension and userscript.

- MV3 extension is mandatory for `chrome.downloads`, cookies, background fetch proxying, storage governance, cross-origin API calls, toolbar popup, optional DNR blocking, and store/GitHub distribution.
- Userscript remains mandatory for single-file portability, MAIN-world access, direct page API access, and features that are awkward or impossible from an isolated extension content script.
- Build rule: one source catalog, two artifacts. Extension code can stay modular. Userscript output must be readable, single-file, non-minified, and synchronized on every release.

Design house style:

- Premium paid-software look only: deep dark and OLED palettes, glass surfaces without browser-heavy blur, shimmer, hover lifts, spring easing, staggered entrances, branded accent, custom scrollbar, dense mode.
- Never ship a light theme.
- No confirmation dialogs. Every action applies immediately and reports via toast or status region.
- No new keyboard shortcuts. Any competitor feature expressed as a shortcut gets a visible button, menu item, pointer gesture, or command surface instead.
- Every feature must provide `destroy()` and clean up DOM, observers, timers, event listeners, style tags, storage listeners, and body/html classes.
- Settings overlays use `pointer-events: none` while inactive.
- CSS scopes to `html/body` feature classes and Astra-specific classes.
- On YouTube, all HTML injection routes through a Trusted Types policy wrapper or DOM APIs.
- Target obfuscated classes through structure, custom elements, IDs, aria labels, roles, and resilient fallback chains, not raw hashed classes.

## Phase 0: Local Repo Ingest

### Repo State Summary

The checkout is clean on `main` and aligned with `origin/main`. Recent commits are roadmap/status and feature hardening work, with current release surfaces at `v3.22.0`.

Core product already exists:

- Chrome and Firefox MV3 extension in `extension/`.
- Single-file userscript in `YTKit.user.js`.
- Local companion downloader in `astra_downloader/`.
- Current source architecture: `document_start` early CSS and MAIN-world bridge, `document_idle` isolated-world runtime and feature monolith, background service worker, toolbar popup, locale bundles, tests, and build scripts.
- Current feature inventory: 250+ settings keys in `extension/default-settings.json`, with major areas already implemented: SponsorBlock, DeArrow, downloads through Astra Downloader, theater split, video/channel hiding, comments/live-chat polishing, transcript tools, AI summary, speed controls, visual filters, watch analytics, i18n, storage hardening, diagnostics, and userscript parity checks.

Important already-built assets:

- `extension/ytkit.js`: 35,743 lines, primary feature monolith.
- `extension/core/*.js`: storage, navigation, player, page, style, URL, and environment helpers.
- `extension/ytkit-main.js`: MAIN-world bridge for quality/codec control.
- `extension/background.js`: fetch proxy, downloads, cookies, toolbar messaging.
- `extension/popup.*`: premium toolbar popup with quick toggles, data management, and i18n.
- `extension/_locales/*`: 10 locale bundles.
- `astra_downloader/astra_downloader.py`: local Flask/Qt downloader with yt-dlp and ffmpeg integration.
- `scripts/build-selector-fixtures.js` and `tests/selector-regression.test.js`: MHTML-derived selector canary infrastructure.

Not yet complete against the "beat everything" charter:

- Return YouTube Dislike is not shipped in the extension build.
- SharedAudio userscript features are not ported to the extension.
- Cobalt/direct-stream fallbacks are userscript-only or absent from the extension download path.
- MAIN-world ad muting/blocking is not present in the extension.
- PocketTube-grade subscription grouping and feed sorting are absent.
- YouTube Redux-grade old-layout restoration is partial.
- Control Panel-grade new-player UI restoration is partial.
- Tweaks for YouTube-grade per-surface playback presets are partial.
- Full note-taking, video research workspace, clipping, transcript search index, and study workflow are absent.
- Store-safe and GitHub/self-host feature profiles are not yet separated.
- Selector self-healing exists as a test/watchlist, not a runtime health system.

### Product Tree Snapshot

The full physical checkout contains `.git`, `node_modules`, `build`, PyInstaller output, cache directories, and saved MHTML captures. The implementation-relevant tree is:

```text
Astra-Deck/
  .github/
    ISSUE_TEMPLATE/
    workflows/build.yml
  .factory/
    rubrics/
  archive/
    YTKit-v0.1.0.user.js ... YTKit-v2.1.0.user.js
  assets/
    cat.gif
    starfall.gif
    ytlogo.png
  astra_downloader/
    astra_downloader.py
    build.py
    requirements.txt
    test_astra_downloader.py
  build/
    astra-deck-chrome-v3.22.0.crx
    astra-deck-chrome-v3.22.0.zip
    astra-deck-firefox-v3.22.0.xpi
    astra-deck-firefox-v3.22.0.zip
  docs/
    cws-submission-checklist.md
    screen-reader-smoke.md
    signing-keys.md
    research/
      iter-1-audit.md
      iter-1-harvest.md
      iter-1-landscape.md
      iter-1-scored.md
      iter-1-sources.md
      iter-1-state-of-repo.md
      iter-4-gap-fill.md
      PHASE-2-5-SUMMARY.md
      README.md
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
    core/
      env.js
      navigation.js
      page.js
      player.js
      storage.js
      styles.js
      url.js
    icons/
      16.png
      32.png
      48.png
      128.png
      brand-glyph.svg
      brand-wordmark-dark.svg
      brand-wordmark-light.svg
    background.js
    default-settings.json
    early.css
    manifest.json
    popup.css
    popup.html
    popup.js
    settings-meta.json
    ytkit-main.js
    ytkit.js
  mhtml/
    WatchPage.mhtml
    YouTube.mhtml
  scripts/
    audit-popup-a11y.js
    audit-storage-size.js
    build-selector-fixtures.js
    catalog-utils.js
    check-contrast.js
    check-i18n.js
    check-syntax.js
    check-versions.js
    eslint-rules/no-post-await-addlistener.js
    extract-i18n-keys.js
    generate-locales.js
    manifest-patch.js
    repo-paths.js
  tests/
    features/
      dearrow.test.js
      sponsorblock.test.js
      theater-split.test.js
    fixtures/
      settings-import-roundtrip.json
      yt-home.tokens.txt
      yt-watch.tokens.txt
    helpers/source.js
    background.test.js
    bugfix-validation.test.js
    catalog-utils.test.js
    core-page-url.test.js
    hardening.test.js
    repo-paths.test.js
    selector-regression.test.js
    settings-migration-roundtrip.test.js
    storage-size-audit.test.js
    userscript-parity.test.js
  AGENTS.md
  build-extension.js
  CHANGELOG.md
  CLAUDE.md
  CONTRIBUTING.md
  HARDENING.md
  LICENSE
  package-lock.json
  package.json
  README.md
  ROADMAP.md
  Subscriptions - YouTube.mhtml
  sync-userscript.js
  theater-split.user.js
  YT_Reaction_Spammer.user.js
  YTKit.user.js
  YTKit-v1.2.0.user.js
  ytkit.pem
  Worldwide Societal Collapse capture (*.mhtml)
```

### MHTML Capture Inventory

All saved captures were decoded with MIME and quoted-printable handling. The saved pages include HTML and CSS parts, but no reusable inline script payloads, no CSP meta tags, and no visible GraphQL endpoint strings inside the captures. Endpoint/state extraction therefore comes from the live extension runtime and previous repo research, not from embedded capture scripts.

| Capture | HTML bytes | CSS bytes | CSS parts | Tokens | Ground truth surfaces found |
|---|---:|---:|---:|---:|---|
| `mhtml/WatchPage.mhtml` | 951,329 | 4,059,546 | 75 | 3,487 | watch page, player, settings menu, comments, composer, related, panels, notifications |
| `mhtml/YouTube.mhtml` | 396,038 | 3,954,853 | 70 | 3,399 | home feed, masthead, mini guide, Shorts shelf, popups, notifications |
| `Subscriptions - YouTube.mhtml` | 1,032,769 | 3,846,383 | 70 | 3,404 | subscriptions grid, full guide, Shorts shelf, popups, notifications |
| `Worldwide Societal Collapse...YouTube.mhtml` | 1,037,437 | 3,973,327 | 76 | 3,506 | watch page, player, settings menu, comments, composer, related, panels, notifications |

Framework signals from captures:

- YouTube uses custom elements/Web Components and Polymer-style `ytd-*`, `yt-*`, `ytp-*`, and `html5-*` element/class families.
- No React/Vue markers were found in the captures.
- `ytd-app` is the app shell.
- Saved MHTML did not preserve inline `ytcfg`, `ytInitialData`, `ytInitialPlayerResponse`, or `INNERTUBE_*` scripts.
- YouTube is known to enforce Trusted Types. Future HTML injection must use the existing Trusted Types wrapper or DOM APIs.

### CSS Token Catalog

The captures expose more than 1,000 custom properties. Future themes should hook YouTube's native variables before overriding raw colors.

High-value token groups:

- Layout: `--app-drawer-width`, `--app-drawer-content-padding`, `--ytd-rich-grid-items-per-row`, `--ytd-rich-grid-item-max-width`, `--ytd-watch-flexy-sidebar-width`, `--ytd-watch-flexy-space-below-player`.
- Baseline colors: `--yt-sys-color-baseline--base-background`, `--yt-sys-color-baseline--raised-background`, `--yt-sys-color-baseline--overlay-background-heavy`, `--yt-sys-color-baseline--text-primary`, `--yt-sys-color-baseline--text-secondary`, `--yt-sys-color-baseline--call-to-action`, `--yt-sys-color-baseline--static-brand-red`.
- Saturated/dynamic colors: `--yt-saturated-base-background`, `--yt-saturated-raised-background`, `--yt-saturated-overlay-background`, `--yt-saturated-text-primary`, `--yt-saturated-text-secondary`, `--yt-saturated-outline`, `--yt-saturated-drop-shadow`.
- Player controls: `--ytp-progress-list`, `--ytp-swatch-background-color`, `--ytp-swatch-color-white`, `--paper-slider-active-color`, `--paper-slider-knob-color`, `--paper-slider-progress-container-border-radius`.
- Inputs and menus: `--paper-input-container-input-color`, `--paper-input-container-focus-color`, `--paper-menu-background-color`, `--paper-menu-button-dropdown-background`, `--paper-dialog-background-color`, `--paper-tooltip-background`.
- Light wash/player redesign cues: `--yt-light-wash-opacity`, `--yt-light-wash-size`, `--yt-light-wash-color`, `--yt-delhi-modern-*`, `--yt-delhi-pill-height`.

Theme strategy:

- Set Astra variables first, then map them onto YouTube tokens under `html[dark] body.ytkit-premium`.
- Never depend on a single token. Define fallbacks for `--yt-sys-*`, `--yt-saturated-*`, and legacy `--yt-*`.
- Keep OLED mode separate from "native dark", because YouTube's native dark surfaces are gray, not black.

### Selector Map

Stable selectors are the primary plan. Fragile fallbacks are retained for self-healing resolver chains and selector-canary tests.

| Surface | Stable selector | Fragile fallback from captures | Notes |
|---|---|---|---|
| App shell | `ytd-app`, `ytd-page-manager` | `ytd-page-manager.style-scope` | Mount observer here only until target containers exist. |
| Top nav/masthead | `ytd-masthead`, `#masthead-container` | `div.style-scope` inside masthead | Use structure plus aria labels for create/search/notifications. |
| Search | `yt-searchbox`, `input#search` | `yt-searchbox-input` | Hook by role/label when present; avoid raw internal wrappers. |
| Left nav | `ytd-guide-renderer`, `ytd-mini-guide-renderer`, `yt-app-drawer` | `ytd-mini-guide-entry-renderer.style-scope` | Subscriptions capture has full guide; home has mini guide. |
| Feed grid | `ytd-browse ytd-rich-grid-renderer`, `ytd-rich-grid-renderer` | `ytd-rich-grid-renderer.style-scope` | Process added nodes only; filter chips recycle grid content. |
| Feed card | `ytd-rich-item-renderer`, `yt-lockup-view-model` | `yt-lockup-view-model.ytd-rich-item-renderer` | New lockup view-model appears in current captures. |
| Thumbnail | `ytd-thumbnail`, `yt-thumbnail-view-model`, `a#thumbnail` | `ytThumbnailViewModelHost` | For badges and overlays, prefer nearest card root plus thumbnail child. |
| Shorts shelf | `a[href^="/shorts"]`, `ytd-rich-shelf-renderer` | `yt-thumbnail-overlay-badge-view-model` | Use URL path plus renderer family. |
| Watch page | `ytd-watch-flexy`, `ytd-watch-metadata`, `#below` | `ytd-watch-metadata.watch-active-metadata` | Main route state via `ytd-watch-flexy[video-id]`. |
| Related sidebar | `#secondary ytd-watch-next-secondary-results-renderer` | `ytd-watch-next-secondary-results-renderer.style-scope` | Related and compact cards change often; use section root first. |
| Player API | `#movie_player`, `video.html5-main-video` | `video.video-stream` | Use `window.movie_player` only in MAIN-world bridge. |
| Player chrome | `.ytp-chrome-bottom`, `.ytp-right-controls`, `.ytp-progress-bar` | `.ytp-panel`, `.ytp-delhi-modern`, `.ytp-id-*` | High churn area; resolver must allow old and new player UI. |
| Player settings | `.ytp-settings-button`, `.ytp-panel`, `.ytp-menuitem` | `.ytp-popup`, `.ytp-overflow-panel` | Avoid forced menu opening where MAIN APIs exist. |
| Comments | `ytd-comments`, `ytd-comment-thread-renderer`, `ytd-comment-view-model` | `ytd-comment-thread-renderer.style-scope` | Keep old and new comment shapes. |
| Comment composer | `ytd-comment-simplebox-renderer`, `ytd-commentbox`, `#contenteditable-root` | `div.style-scope` under composer | Prefer structural lookup below `ytd-comments`. |
| Engagement panels | `ytd-engagement-panel-section-list-renderer` | `ytd-popup-container.style-scope` | Transcript/chat/clip panels mount here. |
| Modals/popups | `ytd-popup-container`, `tp-yt-paper-dialog`, `yt-iron-dropdown` | `yt-reload-continuation` | Use dialog roles/aria labels when present. |
| Channel profile | `ytd-video-owner-renderer`, `ytd-channel-name`, `#channel-name` | `yt-avatar-shape`, `yt-decorated-avatar-view-model` | Resolve channel ID/handle from links, not text names. |
| Notifications | `ytd-notification-topbar-button-renderer`, `yt-icon-badge-shape` | `yt-icon-badge-shape` | Chronological sorting should wait for popup menu root. |
| Live chat frame | URL `https://*.youtube.com/live_chat*`, `yt-live-chat-app` when available | current captures do not include live chat DOM | Capture needed before major live-chat work. |
| Settings overlay | Astra-owned `#ytkit-panel`, `.ytkit-*` | n/a | All injected UI must be scoped and removable. |

Selector resolver contract:

```js
findElement(surface, selectors, { root = document, required = false }) {
  // Try stable selectors first, then fragile fallbacks.
  // Log first miss to diagnosticLog.
  // Return null, never throw, unless required is true.
}
```

Every feature that touches a high-churn surface must use a selector chain, not a single `querySelector`.

### API And State Signals

No reusable inline endpoint strings were preserved in the MHTML captures. Current runtime and repo notes identify these usable APIs:

- YouTube Innertube player: `https://www.youtube.com/youtubei/v1/player?key=<INNERTUBE_API_KEY>`.
- Runtime extraction from page scripts: `INNERTUBE_API_KEY`, `INNERTUBE_CLIENT_VERSION`, `ytInitialPlayerResponse`, `ytInitialData`, caption tracks.
- Captions/transcripts: YouTube JSON3 caption track URLs from player response.
- SponsorBlock: hash-prefix skip segment API on `https://sponsor.ajay.app`.
- DeArrow: title/thumbnail branding API and thumbnail host.
- Return YouTube Dislike: public RYD API with known rate limits.
- Reddit comments: `https://www.reddit.com/search.json` and old Reddit fallback through background proxy.
- AI summary providers: OpenAI, Anthropic, Google Generative Language, local Ollama.
- Local downloader: `http://127.0.0.1:{9751,9761,9771,9781,9791,9851}` with token/health identity.

Rate-limit policy:

- Central `ApiLimiter` in background or shared runtime.
- Per-origin budgets.
- Exponential backoff with jitter.
- Serve stale cache for SponsorBlock, DeArrow, RYD, transcript metadata, and subscription groups.
- Never make API calls in MutationObserver callbacks directly.

## Phase 1: Competitive Landscape

### Tool Abbreviations

| Abbrev | Tool |
|---|---|
| AD | Astra Deck current |
| SB | SponsorBlock |
| DA | DeArrow |
| RYD | Return YouTube Dislike |
| IT | ImprovedTube / Improve YouTube |
| EFY | Enhancer for YouTube |
| YTA | YouTube Alchemy |
| TFY | Tweaks for YouTube |
| CPYT | Control Panel for YouTube |
| UH | Unhook |
| BT | BlockTube |
| PT | PocketTube |
| YTR | YouTube Redux |
| MA | Magic Actions for YouTube |
| DF | DF Tube and similar distraction-free tools |
| IRI | Iridium |
| GF | Greasy Fork scripts |
| OUJS | OpenUserJS scripts |
| STY | Stylus/userstyle ecosystem |
| UBO | uBlock Origin Lite / native adblock baselines |
| ALT | FreeTube, NewPipe, Cobalt, MeTube, Karamel, other adjacent YouTube tools |

### Ranked Competitor Table

Ranking weights: install base first, then update recency, then unique feature value, then relevance to an Astra Deck superset.

| Rank | Tool | Source/author | Adoption signal | Last updated signal | Feature count estimate | What it does best |
|---:|---|---|---|---|---:|---|
| 1 | Return YouTube Dislike | Dmitry Selivanov/community, Anarios GitHub | 6,000,000 Chrome users, 13.6K GitHub stars | CWS 4.0.1 Oct 24 2025; GitHub active May 2026 | 5 | Restores dislike counts through archived and extension-user data. |
| 2 | SponsorBlock | Ajay/SponsorBlock | 2M Chrome users, 13.2K GitHub stars | CWS/chrome-stats 6.1.5 Apr 2026; GitHub active May 2026 | 20 | Crowdsourced sponsor/selfpromo/intro/outro skip, progress segments, privacy-preserving hash prefix. |
| 3 | uBlock Origin Lite / Brave Shields | uBlock/Brave | uBOL over 16M Chrome users, Brave native filter cadence | active May 2026 | 5 | MV3-safe network filtering baseline and anti-adblock cadence. |
| 4 | Magic Actions for YouTube | ChromeActions | Claims millions of users | site updated May 2026 | 25 | Long-running all-in-one playback/UI enhancer; volume wheel and cinema-style controls. |
| 5 | Unhook | Unhook | 500K+ users on official site; 4.8 rating | v1.6.9 Mar 2026 signal | 35 | Distraction removal: home feed, related, Shorts, comments, end screens, merch, header, notifications. |
| 6 | PocketTube | PocketTube | 300K+ users | active support/reddit Apr 2026 | 35 | Subscription groups, AI/custom tags, sort by length/date/popular, cross-browser/mobile support. |
| 7 | Control Panel for YouTube | soitis.dev | 50K Chrome users signal | v1.33.2 May 5 2026 via Softpedia; CWS feature list crawled | 80 | New player UI restoration, ad/annoyance hiding, mobile and desktop controls, feed filters. |
| 8 | ImprovedTube / Improve YouTube | code-charity | high CWS install base, major GitHub project | GitHub and releases active in 2026 | 100+ | Broad settings catalog for layout, player, appearance, shortcuts, comments, and quality. |
| 9 | YouTube Alchemy | Tim Macy | Greasy Fork plus GitHub | Greasy Fork crawled May 2026, 200+ features | 200+ | Native-feeling userscript/extension with layout controls, language-aware options, color-coded videos. |
| 10 | Tweaks for YouTube | inzk.dev | CWS listing active | crawled 2026; detailed feature list | 90 | Per-context playback presets, PiP, screenshots, comment timestamp workflow, custom CSS/JS. |
| 11 | DeArrow | Ajay/SponsorBlock | 2.1K GitHub stars; CWS/AMO distribution | AMO 2.3.6 Apr 23 2026; GitHub active May 2026 | 20 | Crowdsourced better titles/thumbnails, channel overrides, mobile/embed support. |
| 12 | BlockTube | amitbl | 100K Chrome user signal, 1.35K GitHub stars | v0.4.8 Feb/Apr 2026 signals | 30 | Channel/video/comment blocking, regex rules, advanced custom JS predicate. |
| 13 | YouTube Redux | omniZero | 90K Chrome users | v3.10.0 Oct 28 2025 | 30 | Restores older YouTube layouts, small player, classic logo, precise values, old playlist theme. |
| 14 | Iridium | ParticleCore | 1.33K GitHub stars | pushed Jan 2026; CWS crawled | 45 | Classic enhancer: autoplay, default quality/speed, super theater, blacklist, volume wheel, screenshot. |
| 15 | DF Tube / distraction-free family | focus/no-surf extensions | old DF Tube had 300K users; new forks 30K+ | Jan 2026 and fork activity | 20 | Minimal focus mode and feed/comment/recommendation hiding. |
| 16 | YouTube CPU Tamer by AnimationFrame | CY Fung, Greasy Fork | 51K+ installs | Feb 24 2025 | 8 | Timer/rAF performance optimization for YouTube, live chat, and background tabs. |
| 17 | YouTube JS Engine Tamer | CY Fung, Greasy Fork | 15K+ installs | Feb 28 2026 | 6 | YouTube JS engine/performance fixes. |
| 18 | YouTube Links | nhyone, Greasy Fork | 94K+ installs | Oct 16 2024 | 8 | Direct format links on watch page. |
| 19 | Youtube Tools All in One | MDCM, Greasy Fork | 187K+ installs | Feb 6 2026 | 15 | MP4/MP3 local download, dislike restoration, utility bundle. |
| 20 | youtube-adb | iamfugui, Greasy Fork | 296K+ installs | Nov 15 2024 | 5 | Static/video ad removal userscript. |
| 21 | YouTube HD Premium | ElectroKnight22, Greasy Fork | 12K+ installs | Jan 13 2026 | 6 | Quality forcing with Premium bitrate preference. |
| 22 | YouTube HD Plus | fznhq, Greasy Fork | 3.9K+ installs | Feb 8 2026 | 8 | Quality selection across desktop, Music, and mobile. |
| 23 | YouTube More Speeds | ssssssander, Greasy Fork | 8K+ installs | Dec 18 2023 | 4 | Extra playback speed buttons. |
| 24 | YouTube Improvements | thalrien.vx, Greasy Fork | 26K+ installs | Apr 6 2026 | 20 | Dark/light toggle, download, screenshot, fast-forward, layout improvements. |
| 25 | YouTube Block Autoplay Preview Thumbnail and Channel Trailer | miebie.1412, OpenUserJS | 74K to 83K installs | Apr 30 2026 / 5 days ago signal | 4 | Document-start blocking of hover previews and channel trailers. |
| 26 | 7ktTube 2016 Redux | arvid-demon, OpenUserJS | OpenUserJS YouTube group | active listing | 25 | Old 2016 layout, old watch page, thumbnails/player size, grayscale watched, hide suggestion blocks. |
| 27 | Youtube HD | adisib, OpenUserJS | small vote count, long-lived | Apr 2025 | 8 | Non-interval quality forcing and player resizing. |
| 28 | BetterYTM | Sv443, OpenUserJS/GitHub | niche | May 2025 | 35 | YouTube Music and YouTube layout improvements, integrations, lyrics links, local storage. |
| 29 | TamperTubePlus | Sv443, OpenUserJS | legacy | Jul 2018 | 12 | Polymer disable, download button, tags, big player, accent color. |
| 30 | Download YouTube Videos | panzi, OpenUserJS | legacy | old but indexed | 5 | Direct watch-page download menu and stream URL list. |
| 31 | Download YouTube Videos as MP4 | volkan-k, OpenUserJS | legacy | Feb 2019 | 5 | GM_download native MP4 downloader. |
| 32 | h264ify | erkserkserks | 1.2K GitHub stars | repo updated 2025 | 3 | Force H.264 to reduce CPU and improve compatibility. |
| 33 | YouTube Anti Translate | CWS specialist | CWS active listing | active | 4 | Prevent translated titles/audio and preserve original metadata. |
| 34 | YouTube-shorts block | CWS specialist | 300K to 400K user signal | active | 5 | Shorts removal and redirect. |
| 35 | Multiselect for YouTube | CWS specialist | known CWS tool | active | 8 | Bulk select and playlist/watch-later management. |
| 36 | FreshView / Watchmarker family | CWS/reddit | niche/new | Apr 2026 MV3 rewrite signal | 5 | Hide or mark watched videos across feeds. |
| 37 | YouTube Hider | youtubehider.com | public site | crawled May 2026 | 10 | Hide watched, Shorts, mixes, playlists, lives, low-view videos. |
| 38 | FocusProtect / LockedIn | CWS/GitHub | 10K+ or new | Apr/May 2026 | 15 | Focus-first hiding of feeds, Shorts, recommendations, explore. |
| 39 | Stylus dark/OLED userstyles | userstyles, GitHub gists | fragmented | mixed | 20 | Pure-CSS black themes, old-layout skins, rounded-corner removal. |
| 40 | FreeTube | FreeTubeApp | 20.9K GitHub stars | active May 2026 | 80 | Privacy-first standalone YouTube client, subscriptions outside Google. |
| 41 | NewPipe | TeamNewPipe | 38.2K GitHub stars | active May 2026 | 80 | Android YouTube client, background playback, downloads, subscriptions. |
| 42 | Cobalt | imputnet | 40.4K GitHub stars | active Apr/May 2026 | 20 | Media saving service and API model for downloads. |
| 43 | MeTube | alexta69 | high GitHub project | active | 15 | Self-hosted yt-dlp queue and library management. |
| 44 | Karamel | odensc | GitHub project | active | 5 | Reddit comments under YouTube videos. |
| 45 | YouTube Highlighter / note tools | CWS niche | 329 downloads in one listing; 1K+ in MensorAI class | 2026 listicles | 20 | Highlighting, notes, AI Q&A, spaced repetition. |

## Phase 2: Feature Catalog And Gap Analysis

### Master Feature Matrix

The final scope is the union of current Astra Deck features, competitor features, and viable gap fills. "Build action" means the roadmap action required for Astra Deck to beat that row.

| Category | Feature | Current AD | Observed in | Best implementation seen | Build action |
|---|---|---|---|---|---|
| Theming/UI | OLED black theme with token mapping | Partial | STY, YTA, CPYT | Userstyles for black surfaces; YTA for settings breadth | Build native token-based OLED theme and never-light mode. |
| Theming/UI | Glass premium settings overlay | Partial | AD, YTA | AD popup polish | Extend to in-page panel and all transient panels. |
| Theming/UI | Dense mode | Partial | YTA, CPYT, YTR | YTA row/spacing controls | Add global density scale. |
| Theming/UI | Custom accent/progress color | Yes | AD, IT, YTA, IRI | AD/Alchemy | Keep, add per-profile accent presets. |
| Theming/UI | Custom CSS | Yes | IT, TFY, YTA | TFY custom CSS/JS | Keep CSS, never ship custom JS by default; gated advanced mode. |
| Theming/UI | Old YouTube layout restoration | Partial | YTR, 7ktTube, STY | YouTube Redux/7ktTube | Build layout profile pack: Modern Dense, Classic 2020, Classic 2016-inspired. |
| Theming/UI | New player UI restoration | Partial | CPYT | Control Panel | Add player-chrome profile toggles for new controls/progress/action surfaces. |
| Theming/UI | Square avatars/search/buttons | Yes | AD, YTA, 7ktTube | AD | Keep, with no pill backdrops. |
| Theming/UI | Hide/reshape rounded UI | Partial | STY, YTR | userstyles | Add rectangularization pass with safe radii 4/6/8/10/12. |
| Theming/UI | Branded scrollbar | Partial | AD style rules | AD | Standardize across popup and in-page panels. |
| Navigation/Layout | Hide homepage feed | Yes | UH, DF, CPYT, LockedIn | Unhook | Keep and add per-profile "focus recipes". |
| Navigation/Layout | Hide related sidebar | Yes | UH, DF, CPYT | Unhook/CPYT | Keep with selector health. |
| Navigation/Layout | Hide Shorts globally | Yes | UH, CPYT, YouTube-shorts block | Specialist block extensions | Keep, add route-level redirect and shelf removal canaries. |
| Navigation/Layout | Redirect Shorts to watch page | Yes | AD, CPYT | AD | Harden with mobile/shorts URL variants. |
| Navigation/Layout | Redirect home to subscriptions | Yes | IT, IRI, AD | IRI/AD | Keep. |
| Navigation/Layout | Logo quick links/header links | Yes | YTA, AD | YTA for up to 10 links | Expand to profile-scoped link sets. |
| Navigation/Layout | Left guide replacement | Partial | YTA, PocketTube | PocketTube grouping | Add subscription groups and guide sections. |
| Navigation/Layout | Videos per row | Yes | AD, YTA, YTR | YTA/YTR | Keep, add per-route presets. |
| Navigation/Layout | Disable infinite scroll | Yes | YTR, AD | YouTube Redux | Keep; add per-route toggle. |
| Navigation/Layout | Full-width subscriptions | Yes | AD, YTA | AD | Keep and integrate PocketTube groups. |
| Navigation/Layout | Tabbed watch page | Yes | AD, GF YouTube+ | AD/Youtube+ | Keep; add draggable panel positions. |
| Player | Always best quality | Yes | IT, TFY, YTA, IRI, GF HD scripts | TFY/Youtube HD | Keep MAIN-world API path, add per-context quality profiles. |
| Player | Premium bitrate preference | Yes | GF HD Premium, AD | GF HD Premium | Keep. |
| Player | Separate quality by fullscreen/theater/background/embed | No | TFY | Tweaks for YouTube | Add per-context quality matrix. |
| Player | Persistent speed | Yes | IT, TFY, YTA, IRI | YTA supports high speed range | Expand range to 0.25x-17x but default safe presets. |
| Player | Per-channel speed | Yes | AD | AD | Keep, add channel ID keying. |
| Player | Speed buttons | Yes | AD, GF More Speeds, YTA | YTA and AD | Keep without keyboard shortcuts. |
| Player | A-B loop | Yes | AD, IT | ImprovedTube | Keep, add loop presets. |
| Player | Frame-by-frame controls | Yes | AD, TFY | TFY | Keep via visible buttons. |
| Player | Video screenshot | Yes | AD, TFY, IRI | TFY includes subtitle option | Add subtitle-included screenshot option and WebP/JPEG/PNG choice. |
| Player | Visual filters | Yes | AD | AD | Keep, add presets. |
| Player | Video rotation | Yes | AD | AD | Keep. |
| Player | Zoom/pan | Yes | AD | AD | Keep. |
| Player | Cinema/ambient glow | Yes | AD, YTA/MA | Magic Actions cinema mode | Keep but add low-power mode. |
| Player | Pop-out/Document PiP | Yes | TFY, AD | TFY | Keep and provide Firefox fallback messaging. |
| Player | Miniplayer/PiP button restore | Yes | CPYT, AD | Control Panel | Harden with new player UI. |
| Player | Disable loudness normalization | No | IRI | Iridium | Add MAIN-world audio/player config strategy. |
| Player | Volume wheel | No | MA, IRI | Magic Actions/Iridium | Add visible pointer-hover volume wheel mode, no shortcuts. |
| Player | Skip intro/outro by chapter/time | Yes | TFY, AD | Tweaks per-channel intro/outro | Add per-channel intro/outro offsets. |
| Player | Sleep timer | Yes | AD/NewPipe-inspired | NewPipe | Keep. |
| Player | Background playback/mobile | No | CPYT, NewPipe | NewPipe/CPYT mobile | Extension desktop only; mark as userscript/mobile investigation. |
| Content Filtering | Block videos by title/channel/keyword | Yes | BT, UH, AD | BlockTube | Add channel ID-first filters and import/export blocklists. |
| Content Filtering | Block comments by user/content | Partial | BT | BlockTube | Add comment filter manager. |
| Content Filtering | Regex filters | Yes | BT, AD | BlockTube | Keep with ReDoS guard. |
| Content Filtering | Custom JS predicate | No | BT | BlockTube | Add advanced local predicate sandbox only if safe; default off. |
| Content Filtering | Hide watched videos | Yes | BT, FreshView, YT Hider, AD | FreshView/BlockTube | Keep, add watch-progress threshold and per-route behavior. |
| Content Filtering | Hide low-view videos | No | YouTube Hider | YouTube Hider | Add optional threshold. |
| Content Filtering | Hide live/upcoming/mixes/playlists/movies/members-only | Partial | CPYT, UH, AD | Control Panel | Complete feed taxonomy filters. |
| Content Filtering | Hide auto-dubbed videos | Partial | CPYT, AD anti-translate | Control Panel | Add feed-level auto-dub badge detection. |
| Content Filtering | Hide hover previews/trailers | Yes | OUJS preview block, AD | OpenUserJS script | Keep document-start anti-preview. |
| Content Filtering | Hide AI summaries/Jump Ahead/Premium upsells | Yes | CPYT, AD | Control Panel/AD | Keep. |
| Content Filtering | Not Interested quick button | Yes | AD | AD | Keep. |
| Content Filtering | Bulk multi-select | No | Multiselect for YouTube | Multiselect | Add bulk actions: hide, watch later, playlist add/remove, mark watched. |
| Sponsor/Ads | SponsorBlock segment skipping | Yes | SB, AD | SponsorBlock | Keep parity with v6+ categories and channel profiles. |
| Sponsor/Ads | Segment submission/voting | No | SB | SponsorBlock | Consider light submit UI or hand off to SB extension. |
| Sponsor/Ads | Channel skip profiles | No | SB v6 | SponsorBlock | Add local per-channel overrides if API supports clean path. |
| Sponsor/Ads | Ad skip/autoclick | Partial/risky | CPYT, GF ad scripts, MA | CPYT/GF scripts | Store-safe build disables risky ad automation; GitHub build can expose documented local-only features. |
| Sponsor/Ads | DNR blocking | No/limited | UBO, Brave | uBO Lite/Brave | Add optional ruleset for non-YouTube external annoyances only if policy-safe. |
| Clickbait/Metadata | Better titles/thumbnails | Yes | DA, AD | DeArrow | Keep, add channel override UI. |
| Clickbait/Metadata | Show original on hover | Yes | DA, AD | DeArrow | Keep. |
| Clickbait/Metadata | Title case transforms | Yes | YTA, AD | YTA | Keep. |
| Clickbait/Metadata | Anti-translate titles/descriptions/audio | Yes | YouTube Anti Translate, AD | Specialist + AD | Extend across feed, watch, audio track, and transcript. |
| Ratings/Stats | Return dislikes | No in extension | RYD, YTR | RYD | Add rate-limited RYD integration with cache and fallback state. |
| Ratings/Stats | Precise view counts | Yes | AD, YTR | YouTube Redux | Keep. |
| Ratings/Stats | Like/view ratio | Yes | AD | AD | Extend with RYD ratio when available. |
| Ratings/Stats | Channel video/sub count | Yes/partial | AD, IRI | Iridium | Keep and cache. |
| Ratings/Stats | Monetization/ad count info | No | IRI | Iridium | Add optional video monetization/ad marker panel if detectable. |
| Media/Downloads | Local yt-dlp downloader | Yes | AD, MeTube, Cobalt, GF tools | AD companion/MeTube queue | Keep, add queue/library UI. |
| Media/Downloads | MP4/MKV/WebM video | Yes | AD, Cobalt, MeTube | AD | Keep. |
| Media/Downloads | MP3/M4A/Opus/FLAC/WAV audio | Yes | AD, Cobalt | AD | Keep. |
| Media/Downloads | Thumbnail download | Yes | AD, TFY, IRI | AD/TFY | Keep. |
| Media/Downloads | Transcript download | Yes | AD | AD | Keep with SRT/VTT/JSON/Markdown. |
| Media/Downloads | Subtitle download | Yes | AD | AD | Keep. |
| Media/Downloads | Direct stream URL list | Partial/userscript | YouTube Links | YouTube Links | Add advanced "stream links" panel where policy-safe. |
| Media/Downloads | Cobalt fallback | Not extension | Cobalt/GF | Cobalt | Add optional external fallback in GitHub build only. |
| Media/Downloads | Download archive/history | Partial | MeTube | MeTube | Add local companion download history panel. |
| Media/Downloads | Native folder picker | Yes | AD | AD | Keep. |
| Media/Downloads | Auto-download on visit | Yes | AD | AD | Keep off by default with visible state. |
| Transcripts/AI | Transcript viewer | Yes | AD, YTA | AD/YTA | Keep. |
| Transcripts/AI | Transcript export | Yes | AD, YTA | AD | Keep. |
| Transcripts/AI | AI summary BYO key | Yes | AD, note tools | AD | Expand providers and local model support. |
| Transcripts/AI | AI handoff to ChatGPT/Claude/Gemini/NotebookLM/Perplexity | Yes | AD | AD | Keep. |
| Transcripts/AI | Offline/private Chrome built-in AI | No | YouTube Highlighter | YouTube Highlighter | Add optional browser-local summarizer when API available. |
| Transcripts/AI | Video notes/highlights | No | YouTube Highlighter, MensorAI | YouTube Highlighter | Add local notes, highlights, timestamps, spaced review export. |
| Transcripts/AI | Transcript search index | No | gap | none complete | Add local IndexedDB transcript library. |
| Subscriptions | Subscription groups | No | PocketTube | PocketTube | Build local groups, AI tags optional, import/export. |
| Subscriptions | Sort subscriptions by length/date/popular | No | PocketTube | PocketTube | Add feed sort overlay with cache. |
| Subscriptions | Last uploaded highlight/autoscroll | No | YTA | YouTube Alchemy | Add subscription feed "new since last visit" markers. |
| Subscriptions | Group sync/cloud | No | PocketTube | PocketTube | Local export/import first; optional sync profile later. |
| Comments | Sort newest/top | Yes | AD, TFY | TFY/AD | Keep. |
| Comments | Search/filter comments | Yes | AD | AD | Keep. |
| Comments | Comment timestamp workflow | Partial | TFY | Tweaks | Add timestamp paste buttons and "back to comment" after timestamp click. |
| Comments | Reddit comments | Yes | Karamel, AD | Karamel | Keep, add Lemmy/Hacker News optional search? |
| Comments | Creator/pinned/highlight styling | Yes | AD | AD | Keep. |
| Comments | Comment handle revealer | Yes | AD | AD | Keep. |
| Live Chat | Premium chat styling | Yes | AD | AD | Keep. |
| Live Chat | Hide chat elements | Yes | AD, UH | AD | Keep. |
| Live Chat | Chat keyword filter | Yes | AD | AD | Keep. |
| Live Chat | Reaction spammer | Yes | AD | AD | Keep off by default with cooldown. |
| Live Chat | Super Chat CPU tamer | Partial | CY Fung scripts | CPU Tamer | Add chat-specific render throttling. |
| Automation | Still watching auto-dismiss | Yes | AD, BT | AD/BlockTube | Keep. |
| Automation | Auto subtitles/audio language | Yes | YTA, AD | YTA | Keep, expand language matrix. |
| Automation | Pause other tabs | Yes | AD | AD | Keep. |
| Automation | Auto close popups | Yes | AD | AD | Keep with safe selectors. |
| Automation | Prevent autoplay/disable next | Yes | AD, UH, CPYT | AD/CPYT | Keep. |
| Automation | Initial player state | No | TFY | Tweaks | Add foreground/background initial state settings. |
| Automation | Auto loop normal videos | Partial | TFY | Tweaks | Add per-type loop controls. |
| Privacy | Clean share URLs | Yes | AD | AD | Extend tracking param library. |
| Privacy | External API opt-in | Partial | AD, YTA privacy posture | YTA local-only | Add per-integration privacy badges and data-flow panel. |
| Privacy | Cookie isolation in fetch proxy | Yes | AD | AD | Keep. |
| Privacy | No telemetry | Yes | YTA, AD | YTA/AD | Keep user-initiated log export only. |
| Privacy | Store profile vs GitHub profile | No | gap | none | Add build-time feature profile matrix. |
| Accessibility | Popup a11y | Yes | AD | AD | Keep tests. |
| Accessibility | In-page overlay focus trap | Partial | a11y standards | none | Add focus management and live regions to every overlay. |
| Accessibility | Reduced motion | Partial | standards | none | Add global reduced-motion compliance. |
| Accessibility | Forced colors | Partial | standards | none | Add forced-colors audit and CSS. |
| Accessibility | No keyboard shortcuts | Required | competitor shortcuts exist | n/a | Replace shortcuts with visible controls. |
| Performance | CPU timer tamer | Yes/partial | CY Fung | CPU Tamer | Harden with feature toggle and compatibility checks. |
| Performance | Lazy comments | Partial | gap/TFY adjacent | none complete | Add lazy comment preload/unload profile. |
| Performance | Selector health | Partial tests | AD tests | AD canary | Runtime selector health HUD and export. |
| Data/Backup | Settings profiles | Yes | AD, IT | AD | Keep, add profile recipes. |
| Data/Backup | Cross-device sync | No | PocketTube, browser sync patterns | PocketTube | Add selective sync for safe prefs only. |
| Data/Backup | Import/export | Yes | many | AD | Keep with schema migration checks. |
| Integrations | VLC/MPV/protocol stream | Partial/userscript | AD current notes | AD legacy | Restore extension parity where safe. |
| Integrations | YouTube Music improvements | No/limited | BetterYTM, GF HD Plus | BetterYTM | Separate YouTube Music compatibility track. |
| Integrations | Third-party frontends | No | FreeTube/NewPipe/Invidious/Piped | FreeTube/NewPipe | Add "open in" URLs only, no backend dependency. |
| Integrations | Context menus | Yes | BT, TFY, AD | BlockTube/Tweaks | Expand context menus for block, save, copy, transcript, download. |

### Gap Analysis

No single competitor currently ships all of these at once:

- SponsorBlock plus DeArrow plus Return YouTube Dislike plus BlockTube-grade filtering.
- PocketTube-grade subscription management plus YouTube Alchemy-grade visual control.
- Local yt-dlp companion downloads plus transcript/AI workflows plus privacy-first no telemetry.
- New YouTube player UI restoration plus old-layout profiles.
- Runtime selector self-healing backed by MHTML fixtures.
- Store-safe and GitHub/self-host profiles with the same settings schema.

Weak competitor implementations to beat:

- Many userscripts poll with `setInterval` instead of SPA route events and narrow MutationObservers.
- Many rely on raw class names that churn on YouTube A/B tests.
- Many download scripts redirect to third-party web services or expose opaque remote code.
- Many broad extensions use keyboard shortcuts as the primary control path.
- Many features lack clean teardown on disable.
- Many settings panels are sparse, inconsistent, or not searchable.
- Firefox review lag and Chrome MV3 restrictions cause stale store builds.

Net-new Astra ideas:

- Selector Health Center: runtime surface health, canary drift report, one-click diagnostic export.
- Intent Profiles: Focus, Cinema, Research, Creator Audit, Low Power, Classic Layout, Downloader.
- Feed Triage: local rules combining channel ID, title regex, watched ratio, duration, view count, age, live/upcoming/mix type, and subscription group.
- Local Research Workspace: timestamp notes, transcript search, highlights, exports to Markdown/JSON/SRT/VTT, optional browser-local AI summaries.
- Store/GitHub Feature Profiles: disable risky download/ad automation for store packages while keeping GitHub/self-host build complete.
- Native YouTube Token Theme: hook `--yt-sys-*` and `--ytd-*` tokens so dark/OLED styling survives UI changes.

## Phase 3: Technical Reconnaissance

### Selector Strategy

Rules:

- Every surface gets a named resolver with stable selectors first and fragile fallbacks second.
- Each resolver logs first miss to `diagnosticLog` when `diagnosticLog` is enabled.
- Mutation observers process `addedNodes` only.
- Never run full-document scans on every mutation.
- Use `WeakSet` for processed nodes.
- Use route-level re-application on `yt-navigate-finish`, `yt-page-data-updated`, `popstate`, `ytd-watch-flexy[video-id]` mutation, and Navigation API fallback.
- High-churn surfaces: player chrome, feed cards, comments, filter chips, engagement panels, notifications, Shorts shelf.

Required self-healing helpers:

```js
const SurfaceSelectors = {
  player: ['#movie_player', '.html5-video-player', 'ytd-player #movie_player'],
  mainVideo: ['video.html5-main-video', '#movie_player video', 'video.video-stream'],
  feedCard: ['ytd-rich-item-renderer', 'yt-lockup-view-model', 'ytd-video-renderer'],
  comments: ['ytd-comments', 'ytd-comment-thread-renderer', 'ytd-comment-view-model'],
};
```

### SPA Handling

Hook these route signals:

- `yt-navigate-start`: flush pending storage writes and pause expensive work.
- `yt-navigate-finish`: re-run route rules and feature `onRoute()`.
- `yt-page-data-updated`: re-run metadata-dependent features.
- `popstate`: fallback for browser navigation.
- `window.navigation.navigate`: additive fallback where available.
- `ytd-watch-flexy[video-id]` attribute changes: player/watch-page transition.
- Capture-phase clicks on `yt-chip-cloud-chip-renderer`: feed filter chips recycle the grid without always firing route events.

Feature lifecycle split:

- `initOnce`: storage, CSS, registry, message listeners, global route manager.
- `initPerRoute`: feed/watch/search/channel/subscriptions features.
- `initPerVideo`: player, captions, transcript, SponsorBlock, DeArrow, RYD, download controls.
- `initPerNode`: card/comment/chat node processors.
- `destroy`: full cleanup on feature disable, route teardown, or safe mode.

### Site API Strategy

| API | Use | Auth/cookies | Rate limit strategy |
|---|---|---|---|
| YouTube Innertube player | player response, captions, formats, metadata | Uses page API key/client context; no extension cookies forwarded to third parties | Request only per video, cache by video ID, backoff on 429/403. |
| Caption track JSON3 | transcript viewer/export/AI | URL from player response | Cache by video ID/language; do not refetch during SPA churn. |
| SponsorBlock hash-prefix | segments, categories | no cookies | Cache per video, stale-serve on failure, category budget. |
| DeArrow | title/thumb replacements | no cookies | Cache with TTL, channel override cache. |
| Return YouTube Dislike | dislikes/ratings | no cookies | Enforce 100 req/min and 10k/day budget; cache 24h+ and degrade gracefully. |
| Reddit search | related discussion panel | no cookies | User-initiated or idle only, cache by video URL. |
| AI providers | summary/chat handoff | BYO key or local | Never call without explicit enablement; redact keys from export. |
| Local Astra Downloader | downloads, folder picker, health | token/local identity | Health cache; queue download commands; no page-origin access. |

### Constraints

- Trusted Types: YouTube requires Trusted Types for script sinks. All injected HTML must use the existing policy wrapper or DOM construction. Clearing uses `textContent = ''`, not `innerHTML = ''`.
- MV3 service worker: listeners must register synchronously at top level. No post-await listener registration.
- Chrome Web Store policy: YouTube download and ad-automation features are review-sensitive. Plan store-safe builds and GitHub/self-host builds separately.
- CRX self-hosting: modern Chromium rejects self-hosted drag/drop CRX. ZIP "Load unpacked" remains primary for Chromium self-distribution.
- Shadow DOM: use it only for large Astra-owned panels where YouTube CSS would corrupt UI. For player buttons and native-looking controls, use light DOM plus scoped classes.
- Anti-tampering/script detection: keep page-world monkeypatches minimal, documented, reversible, and gated behind feature toggles.
- Privacy: no remote telemetry. Diagnostics are local and user-exported.

### Recommended Architecture

Future layout:

```text
extension/
  core/
    env.js
    registry.js
    storage.js
    styles.js
    trusted-html.js
    selectors.js
    navigation.js
    api-limiter.js
    diagnostics.js
  surfaces/
    feed.js
    watch.js
    player.js
    comments.js
    live-chat.js
    masthead.js
    notifications.js
  features/
    appearance/
    filtering/
    player/
    sponsorblock/
    dearrow/
    dislikes/
    downloads/
    transcripts/
    subscriptions/
    comments/
    live-chat/
    research/
    privacy/
    performance/
  ui/
    panel.js
    toast.js
    command-surface.js
    settings-schema.js
    profile-recipes.js
  background/
    fetch-proxy.js
    downloads.js
    cookies.js
    dnr.js
  ytkit.js
  ytkit-main.js
  early.css
```

Feature registry contract:

```js
registerFeature({
  id: 'returnDislike',
  category: 'Ratings',
  title: 'Return dislike count',
  default: false,
  storageKey: 'returnDislike',
  surfaces: ['watch', 'feed'],
  permissions: ['EXT_FETCH:returnyoutubedislikeapi.com'],
  conflicts: [],
  dependencies: [],
  init(ctx) {},
  onRoute(ctx) {},
  processNode(node, ctx) {},
  destroy(ctx) {}
});
```

Settings storage:

- Extension: `chrome.storage.local` for all settings, caches, history, and profiles.
- Userscript: `GM_getValue`/`GM_setValue` through compatibility shim.
- Sync: optional, safe allowlist only. Never sync API keys, tokens, caches, diagnostics, download paths, cookies, or transcript library unless explicitly exported.
- CSS: `GM_addStyle` or extension style injector, tagged by feature ID and removable by cleanup registry.

## Settings Panel Spec

Panel requirements:

- Searchable.
- Grouped by category.
- Immediate apply.
- No confirmation dialogs.
- Toast/status feedback for changes.
- Every toggle indicates privacy/network/local-only impact.
- Every advanced/risky feature is default off.
- Every feature exposes Reset to default for its category.
- Profile switcher: Focus, Cinema, Research, Downloader, Classic, Low Power, Custom.

### Current Keys To Retain

Appearance and layout:

`colorTheme`, `themeAccentColor`, `forceDarkEverywhere`, `customProgressBarColor`, `customSelectionColor`, `selectionColor`, `uiStyle`, `squareSearchBar`, `squareAvatars`, `widenSearchBar`, `compactLayout`, `thinScrollbar`, `watchPageRestyle`, `chatStyleComments`, `fullWidthSubscriptions`, `homepageGridAlign`, `subscriptionsGrid`, `videosPerRow`, `styledFilterChips`, `compactUnfixedHeader`, `noFrostedGlass`, `noAmbientMode`, `expandVideoWidth`, `floatingLogoOnWatch`, `fitPlayerToWindow`.

Navigation and visibility:

`hideCreateButton`, `hideVoiceSearch`, `logoToSubscriptions`, `quickLinkMenu`, `quickLinkItems`, `hideSidebar`, `hideRelatedVideos`, `hideDescriptionRow`, `hideSubscriptionOptions`, `hidePaidContentOverlay`, `hidePlayables`, `hideMembersOnly`, `hideNewsHome`, `hidePlaylistsHome`, `hideCollaborations`, `hideVideosFromHome`, `redirectHomeToSubs`, `redirectToVideosTab`, `hideLatestPosts`, `disableInfiniteScroll`, `disableSpaNavigation`.

Shorts and feeds:

`removeAllShorts`, `redirectShorts`, `shortsAsRegularVideo`, `hideVideosKeywordFilter`, `hideVideosDurationFilter`, `hideVideosSubsLoadLimit`, `hideVideosSubsLoadThreshold`, `hideVideosRemoveHiddenCards`, `hideVideosShowQuickHideButton`, `hideVideosAllowChannelBlock`, `hideVideosRememberRestoredVideos`, `hideVideosScopeHome`, `hideVideosScopeSubscriptions`, `hideVideosScopeSearch`, `hideVideosScopeWatch`, `hideVideosScopeChannels`, `hideVideosScopeOther`, `hideWatchedVideos`, `hideWatchedMode`, `grayscaleThumbnails`, `thumbnailQualityUpgrade`, `videoResolutionBadge`.

Watch elements and action controls:

`hiddenActionButtonsManager`, `hiddenActionButtons`, `hiddenPlayerControlsManager`, `hiddenPlayerControls`, `hiddenWatchElementsManager`, `hiddenWatchElements`, `hideMerchShelf`, `hideAiSummary`, `hideDescriptionExtras`, `hideHashtags`, `hidePinnedComments`, `hideCommentDislikeButton`, `hideCommentActionMenu`, `hideCommentTeaser`, `hidePaidPromotionWatch`, `hideChannelJoinButton`, `hideFundraiser`, `hideInfoPanels`, `hideVideoEndContent`, `hideJumpAheadButton`, `hideInfoCards`, `hideEndCards`, `hideAutoplayToggle`, `hideAirplayButton`, `hideQueueOnThumbnails`, `shareMenuCleaner`.

Player and playback:

`autoMaxResolution`, `forceH264`, `codecSelector`, `forceStandardFps`, `persistentSpeed`, `persistentSpeedValue`, `perChannelSpeed`, `fineSpeedControl`, `customSpeedButtons`, `speedStep`, `speedIndicatorOverlay`, `playbackSpeedOSD`, `remainingTimeDisplay`, `showTimeInTabTitle`, `showPlaylistDuration`, `reversePlaylist`, `abLoop`, `autoSkipChapters`, `autoSkipChapterPatterns`, `chapterNavButtons`, `chapterJumpButtons`, `videoLoopButton`, `alwaysShowProgressBar`, `autoTheaterMode`, `theaterAutoScroll`, `scrollToPlayer`, `stickyVideo`, `stickyChat`, `miniPlayerBar`, `playbackStatsOverlay`, `popOutPlayer`, `pipButton`, `fullscreenOnDoubleClick`, `videoZoom`, `videoRotation`, `videoRotationAngle`, `frameByFrameButtons`, `rememberVolume`, `rememberVolumeLevel`, `autoSubtitles`, `autoSubtitleLang`, `audioTrackLanguage`, `preferredAudioLang`, `musicVideoSpeedLock`, `sleepTimer`, `preventAutoplay`, `disableAutoplayNext`, `disablePlayOnHover`.

Downloads and media:

`showLocalDownloadButton`, `videoContextMenu`, `autoDownloadOnVisit`, `downloadQuality`, `downloadVideoFormat`, `downloadAudioFormat`, `downloadThumbnail`, `videoScreenshot`, `subtitleDownload`, `copyVideoTitle`, `copyChapterMarkdown`.

Sponsor, clickbait, and ratings:

`sponsorBlock`, `sbCat_sponsor`, `sbCat_intro`, `sbCat_outro`, `sbCat_selfpromo`, `sbCat_interaction`, `sbCat_music_offtopic`, `sbCat_preview`, `sbCat_filler`, `sbCat_poi_highlight`, `deArrow`, `daReplaceTitles`, `daReplaceThumbs`, `daTitleFormat`, `daFallbackFormat`, `daShowOriginalHover`, `daCacheTTL`, `dearrowPeekButton`, `antiTranslate`, `notifyAutoDubbedAudio`, `titleNormalization`, `titleCaseTransform`, `titleCaseMode`, `fullTitles`, `preciseViewCounts`, `likeViewRatio`, `showChannelVideoCount`, `channelSubCount`, `channelAgeDisplay`.

Comments and live chat:

`commentEnhancements`, `condenseComments`, `autoExpandComments`, `sortCommentsNewest`, `commentSearch`, `commentNavigator`, `creatorCommentHighlight`, `enableHandleRevealer`, `redditComments`, `preloadComments`, `premiumLiveChat`, `hideLiveChatEngagement`, `hiddenChatElementsManager`, `hiddenChatElements`, `chatKeywordFilter`, `adaptiveLiveLayout`, `reactionSpammer`, `_reactionSpammerAck`.

Transcript, AI, and research:

`transcriptViewer`, `autoOpenTranscript`, `autoOpenChapters`, `transcriptAiHandoff`, `transcriptAiTarget`, `aiVideoSummary`, `aiSummaryProvider`, `aiSummaryEndpoint`, `aiSummaryModel`, `aiSummaryApiKey`, `watchPageTabs`, `timestampBookmarks`.

Wellbeing and automation:

`autoDismissStillWatching`, `pauseOtherTabs`, `autoPauseOnSwitch`, `autoClosePopups`, `autoLikeSubscribed`, `focusedMode`, `watchTimeTracker`, `watchProgress`, `resumePlayback`, `digitalWellbeing`, `dwBreakIntervalMin`, `dwDailyCapMin`, `dwWatchTimeToday`, `openInNewTab`, `notInterestedButton`, `bypassPlaylistMode`, `playlistEnhancer`, `playlistQuickRemove`, `watchLaterQuickAdd`, `watchLaterCleanup`, `rssFeedLink`, `searchFilterDefaults`, `searchFilterSort`.

Subtitle styling and visual filters:

`subtitleStyling`, `subStyleFontSize`, `subStyleFontFamily`, `subStyleColor`, `subStyleBgOpacity`, `subStyleBgColor`, `subStyleBottomOffset`, `subStyleTextShadow`, `blueLightFilter`, `blueLightIntensity`, `videoVisualFilters`, `vvfBrightness`, `vvfContrast`, `vvfSaturation`, `vvfHue`, `vvfGrayscale`, `vvfSepia`, `cinemaAmbientGlow`, `nyanCatProgressBar`.

Storage, diagnostics, profiles:

`settingsProfiles`, `_profiles`, `_activeProfile`, `showStatisticsDashboard`, `watchHistoryAnalytics`, `debugMode`, `diagnosticLog`, `_errors`, `storageQuotaLRU`, `apiRetryBackoff`, `enableCPU_Tamer`, `customCssInjection`, `customCssCode`, `sidebarOrder`.

### New Settings Keys To Add

Ratings:

- `returnDislike`
- `returnDislikeOnCards`
- `returnDislikeCacheHours`
- `returnDislikeShowRatio`

Subscription manager:

- `subscriptionGroups`
- `subscriptionGroupData`
- `subscriptionAiTags`
- `subscriptionSortMode`
- `subscriptionShowNewSinceLastVisit`
- `subscriptionGroupSidebar`
- `subscriptionGroupExportFormat`

Feed triage:

- `feedTriage`
- `feedHideLowViews`
- `feedLowViewsThreshold`
- `feedHideUpcoming`
- `feedHideLive`
- `feedHideMixes`
- `feedHideMovies`
- `feedHideAutoDubbed`
- `feedAgeColoring`
- `feedAgeColorRules`
- `feedDurationBuckets`
- `feedBlocklistImport`

Player context profiles:

- `qualityProfileMatrix`
- `qualityDefaultNormal`
- `qualityDefaultTheater`
- `qualityDefaultFullscreen`
- `qualityDefaultBackground`
- `qualityDefaultEmbed`
- `initialPlayerState`
- `initialForegroundState`
- `initialBackgroundState`
- `initialVolumeProfile`
- `disableLoudnessNormalization`
- `volumeWheelMode`
- `perChannelIntroOutro`
- `perChannelLoopMode`

Downloads:

- `downloadQueuePanel`
- `downloadHistory`
- `downloadHistoryRetentionDays`
- `downloadStreamLinksPanel`
- `downloadCobaltFallback`
- `downloadStoreSafeMode`
- `downloadSubtitlesWithScreenshot`
- `downloadScreenshotFormat`

Research workspace:

- `researchWorkspace`
- `researchNotes`
- `researchHighlights`
- `researchTranscriptIndex`
- `researchSpacedReview`
- `researchExportFormat`
- `localAiSummary`
- `localAiProvider`

Selector health:

- `selectorHealth`
- `selectorHealthToast`
- `selectorHealthThreshold`
- `selectorHealthLastReport`
- `selectorSelfHealing`

Theming:

- `oledTheme`
- `denseMode`
- `glassIntensity`
- `layoutProfile`
- `classicLayoutProfile`
- `rectangularizeYouTube`
- `tokenThemeBridge`

Privacy and profiles:

- `privacyDataFlowPanel`
- `safeStoreProfile`
- `githubFullProfile`
- `syncSafePrefs`
- `syncSafePrefsAllowlist`
- `advancedLocalPredicate`
- `advancedLocalPredicateCode`

## Phased Build Plan

### v3.23.0: Core Registry And Settings Foundation

Features:

- [x] Add `core/registry.js`, `core/selectors.js`, `core/trusted-html.js`, `core/api-limiter.js`.
- [x] Wrap current feature init/destroy into registry entries without changing behavior.
- [x] Introduce settings schema generator from registry.
- [x] Add category-level cleanup registry and feature health state.
- [x] Add "safe store profile" vs "full GitHub profile" setting model.

Progress:

- 2026-05-19: Added passive core foundation modules and tests. The new modules expose a feature registry with reversible cleanups and health snapshots, stable-first selector chains with first-miss diagnostics, TrustedTypes policy helpers, and bucketed API scheduling. They are loaded before `ytkit.js` in both normal and live-chat isolated content-script contexts without changing existing feature behavior.
- 2026-05-19: Bridged live feature startup, live-chat startup, popup setting messages, settings-panel toggles, config reinitializers, external storage updates, conflict disables, and SPA page transitions through shared lifecycle helpers. Each live feature is registered with a registry adapter that delegates to the existing `init()` and `destroy()` methods while recording health snapshots.
- 2026-05-19: Added a registry-backed settings schema generator. The schema combines registered feature metadata with `settingsManager.defaults`, covers default-only/internal keys, and is exposed through `ytkit.settingsSchema()` for future settings-panel and import/export work.
- 2026-05-19: Added category cleanup buckets, category destroy orchestration, and category health snapshots. `ytkit.categoryHealth()` now summarizes feature counts, initialized counts, cleanup counts, and status totals by category.
- 2026-05-19: Added the safe-store vs full-GitHub profile model. Settings now normalize profile-mode defaults on load, save, and import; local named profile saves remain full-fidelity; explicit safe-store and full-GitHub export payloads declare their mode, profile model, filtered snapshots, and secret/code exclusion behavior. The storage-size audit now proves the safe-store profile payload fits `storage.sync` while full local settings remain local-only.

Acceptance:

- All current features still initialize.
- Every migrated feature has `destroy()`.
- Settings import/export round trip passes.
- `npm test`, `npm run check`, and `git diff --check` pass.

### v3.24.0: Selector Health And MHTML-Backed Runtime Resilience

Features:

- Promote selector map into source.
- Add runtime selector health panel.
- Add first-miss diagnostics per surface.
- Add player new-UI transition selector chains.
- Add fresh-capture fixture workflow to docs.

Acceptance:

- Selector canary covers feed, watch, player, comments, notification, and live-chat placeholder surfaces.
- Runtime report can be exported as JSON.
- Mutation observers process added nodes only.

### v3.25.0: Complete Content Filtering Superset

Features:

- BlockTube-grade video/channel/comment filter manager.
- Channel ID-first blocklist.
- Regex plus safe predicate sandbox investigation.
- Low-view, live, upcoming, mix, playlist, movie, auto-dubbed, watched-ratio filters.
- Bulk card actions inspired by Multiselect.
- Feed Triage profile.

Acceptance:

- No full-document mutation scans.
- Filtered/restored state survives SPA navigation.
- ReDoS guard covers regex input.
- Import/export of filter lists works.

### v3.26.0: Player Control Superset

Features:

- Tweaks-grade quality matrix by normal/theater/fullscreen/background/embed.
- Initial player state for foreground/background tabs.
- Disable loudness normalization where technically possible.
- Volume wheel mode with visible hover affordance.
- Subtitle-included screenshots with PNG/JPEG/WebP.
- Per-channel intro/outro offsets.
- Expanded speed range and visible speed palette.

Acceptance:

- MAIN-world bridge handles quality without showing YouTube menus.
- No keyboard shortcuts added.
- Every player control can be disabled and fully removed.

### v3.27.0: Downloads And Local Media Library

Features:

- Queue/history UI backed by Astra Downloader.
- Stream links panel for advanced users.
- Cobalt fallback in GitHub/full profile only.
- Download archive and re-download controls.
- Better PO token/SABR health surfacing.
- Thumbnail, subtitle, transcript, screenshot export consolidation.

Acceptance:

- Store-safe profile disables risky download surfaces.
- Local downloader health and token state visible.
- No third-party download redirect runs without explicit opt-in.

### v3.28.0: Ratings, Clickbait, And Metadata Trust

Features:

- Return YouTube Dislike with cache/rate limiter.
- Dislike/like ratio on watch and cards.
- DeArrow channel override UI.
- Anti-translate feed/watch/audio/transcript expansion.
- Monetization/ad indicator panel if data is safely detectable.

Acceptance:

- RYD respects rate budgets.
- Offline/cache states are visible.
- No cookies forwarded to RYD/DeArrow/SponsorBlock.

### v3.29.0: Subscription Manager

Features:

- PocketTube-grade local groups.
- Optional AI tags with local/exportable metadata.
- Sort subscriptions by date, duration, popularity, unwatched, new since last visit.
- Guide/sidebar group section.
- Group export/import.

Acceptance:

- Groups key by channel ID.
- Works on subscriptions page without breaking native filters.
- Data remains local by default.

### v3.30.0: Research Workspace

Features:

- Timestamp notes and highlights.
- Transcript search index in IndexedDB.
- Markdown/JSON/SRT/VTT export.
- Local/browser AI summary path when available.
- Spaced review export.
- "Open in NotebookLM/ChatGPT/Claude/Gemini/Perplexity" retained as handoff, not silent upload.

Acceptance:

- No API call occurs without explicit enablement.
- API keys are redacted from export.
- Transcript index can be cleared from settings.

### v3.31.0: Accessibility, Mobile, And Low Power

Features:

- In-page overlay focus traps and ARIA roles.
- Live-region toasts.
- Reduced-motion support.
- Forced-colors support.
- CPU/chat tamer improvements.
- Firefox Android smoke path for userscript/extension if feasible.

Acceptance:

- Popup and in-page panel pass scripted a11y checks.
- Motion can be reduced globally.
- Low Power profile measurably reduces timers/observers.

### v3.32.0: Premium Visual System

Features:

- Native YouTube token bridge.
- OLED-only theme pack.
- Dense mode.
- Classic layout profiles.
- New-player UI restoration profile.
- Rectangularized UI with approved radii only.

Acceptance:

- No light theme.
- No pill/stadium backdrops.
- Theme survives home, subscriptions, watch, search, channel, and live chat.

### v3.33.0: Integrations And Interop

Features:

- VLC/MPV/protocol stream parity where safe.
- YouTube Music compatibility track.
- Open in FreeTube/Invidious/Piped/NewPipe-style links.
- Karamel-style comments expansion.
- Context menus for block/save/download/copy/transcript.

Acceptance:

- Integrations are opt-in and visible.
- Protocol handlers never run silently.
- Store-safe profile excludes policy-sensitive handlers.

### v4.0.0: Beats Every Competitor Release

Features:

- All rows in the feature matrix are either shipped, intentionally store-profile-gated, or documented as technically/policy impossible.
- README build deliverable written.
- Chrome ZIP/CRX, Firefox ZIP/XPI, userscript artifact built.
- Fresh MHTML captures and selector fixtures refreshed.
- Security, privacy, a11y, performance, and store-review audits complete.

Acceptance:

- Competitive matrix shows no high-value competitor feature missing without a documented reason.
- Clean-profile Chrome and Firefox smoke tests pass.
- Userscript installs and runs through Tampermonkey/Violentmonkey where supported.
- No telemetry.
- No keyboard shortcuts added.
- No confirmation dialogs.
- Every feature can be disabled and cleaned up.

## Risks And Open Questions

| Risk | Impact | Mitigation |
|---|---|---|
| YouTube DOM churn, especially player chrome and comments | High | Selector chains, MHTML fixtures, runtime health report, weekly refresh cadence. |
| Trusted Types breakage | High | Central Trusted HTML wrapper and DOM APIs. |
| Chrome Web Store policy on YouTube downloads/ad automation | High | Store-safe profile and GitHub/full profile separation. |
| MV3 service worker termination | Medium | Top-level listeners, storage/session persistence, no in-memory-only critical state. |
| API rate limits for RYD/SponsorBlock/DeArrow | Medium | Central limiter, cache, stale serving, visible degraded state. |
| Companion downloader attack surface | High | Host validation, token auth, command allowlists, yt-dlp pinning, local-only binding. |
| Userscript manager MV3 changes | Medium | Extension remains primary; userscript single-file remains secondary. |
| Feature bloat and monolith cost | High | Registry, per-surface modules, lazy init, performance budget. |
| Store review latency on Firefox/Chrome | Medium | GitHub releases with signed artifacts; AMO/CWS profile documentation. |
| External research tools exaggerate user counts | Low | Treat counts as ranking signals, not exact truth. |
| Custom JS predicate safety | High | Default off; sandbox or reject if safe design cannot be proven. |

Open questions:

- Should v4.0.0 remain GitHub/self-host first, or should a store-safe variant be prepared in parallel?
- Is YouTube Music in the main product charter or a separate compatibility product?
- Should subscription-group data ever sync through browser sync, or remain local/export-only?
- Can Return YouTube Dislike vote submission be safely supported, or should Astra Deck remain read-only?
- Can custom JS predicates be safely sandboxed enough to justify matching BlockTube's advanced mode?
- Should Cobalt fallback be bundled as an integration or only documented as an external handoff?

## Definition Of Done

`Astra Deck v4.0.0` is done when:

- It ships as MV3 Chrome, MV3 Firefox, and readable single-file userscript artifacts.
- It beats every competitor in the matrix by unioning their core user-facing features or documenting a policy/technical exclusion.
- Settings panel includes every feature as a grouped, persistent, instant-apply toggle/control.
- No light theme is present.
- No new keyboard shortcuts are added.
- No confirmation dialogs are used.
- Every feature has a working `destroy()`.
- Injected CSS is scoped and removable.
- Trusted Types and DOM injection paths are audited.
- MutationObservers process added nodes only.
- Selector health is tested against refreshed MHTML fixtures.
- API usage is rate-limited and cache-backed.
- Privacy panel accurately shows every network touchpoint.
- Store-safe and full GitHub profiles are documented.
- README.md is produced as a build deliverable in a later run.
- Fresh Chrome and Firefox clean-profile smoke tests pass.
- Userscript install/update path is verified.

## Source Index

Local sources:

- `README.md`
- `CLAUDE.md`
- `extension/default-settings.json`
- `extension/manifest.json`
- `extension/ytkit.js`
- `extension/ytkit-main.js`
- `extension/background.js`
- `extension/core/*.js`
- `scripts/build-selector-fixtures.js`
- `tests/selector-regression.test.js`
- `tests/fixtures/yt-home.tokens.txt`
- `tests/fixtures/yt-watch.tokens.txt`
- `mhtml/WatchPage.mhtml`
- `mhtml/YouTube.mhtml`
- `Subscriptions - YouTube.mhtml`
- `Worldwide Societal Collapse...YouTube.mhtml`
- `docs/research/*.md`

External sources:

- Return YouTube Dislike Chrome Web Store: https://chromewebstore.google.com/detail/return-youtube-dislike/gebbhagfogifgggkldgodflihgfeippi
- Return YouTube Dislike GitHub: https://github.com/Anarios/return-youtube-dislike
- SponsorBlock GitHub: https://github.com/ajayyy/SponsorBlock
- SponsorBlock chrome-stats: https://chrome-stats.com/d/sponsorblock
- DeArrow GitHub: https://github.com/ajayyy/DeArrow
- DeArrow AMO versions: https://addons.mozilla.org/en-US/firefox/addon/dearrow/versions/
- ImprovedTube GitHub: https://github.com/code-charity/youtube
- Enhancer for YouTube: https://www.mrfdev.com/enhancer-for-youtube
- YouTube Alchemy Greasy Fork: https://greasyfork.org/en/scripts/521686-youtube-alchemy
- Tweaks for YouTube Chrome Web Store: https://chromewebstore.google.com/detail/tweaks-for-youtube/ogkoifddpkoabehfemkolflcjhklmkge
- Control Panel for YouTube Chrome Web Store: https://chromewebstore.google.com/detail/control-panel-for-youtube/lodcanccmfbpjjpnngindkkmiehimile
- Control Panel for YouTube Softpedia: https://www.softpedia.com/get/Internet/Internet-Applications-Addons/Chrome-Extensions/Control-Panel-for-YouTube.shtml
- Unhook Chrome Web Store: https://chromewebstore.google.com/detail/unhook-remove-youtube-rec/khncfooichmfjbepaaaebmommgaepoid
- Unhook official site: https://unhookextension.com/
- BlockTube Chrome Web Store: https://chromewebstore.google.com/detail/blocktube/bbeaicapbccfllodepmimpkgecanonai
- BlockTube GitHub: https://github.com/amitbl/blocktube
- PocketTube official site: https://pockettube.io/
- YouTube Redux Chrome Web Store: https://chromewebstore.google.com/detail/youtube-redux/mdgdgieddpndgjlmeblhjgljejejkikf
- Iridium Chrome Web Store: https://chromewebstore.google.com/detail/iridium-for-youtube/gbjmgndncjkjfcnpfhgidhbgokofegbl
- Magic Actions for YouTube: https://www.chromeactions.com/magic-options.html
- YouTube CPU Tamer Greasy Fork: https://greasyfork.org/scripts/431573-youtube-cpu-tamer-by-animationframe
- Greasy Fork YouTube scripts: https://greasyfork.org/en/scripts?language=all&q=youtube&sort=total_installs
- Greasy Fork quality scripts: https://greasyfork.org/en/scripts?q=youtube+quality&sort=total_installs
- OpenUserJS YouTube group: https://openuserjs.org/group/youtube
- OpenUserJS Download YouTube Videos: https://openuserjs.org/scripts/panzi/Download_YouTube_Videos
- OpenUserJS Youtube HD: https://openuserjs.org/scripts/adisib/Youtube_HD
- OpenUserJS BetterYTM: https://openuserjs.org/scripts/Sv443/BetterYTM
- Chrome Trusted Types on YouTube: https://developer.chrome.com/blog/trusted-types-on-youtube
- Chrome extension APIs and MV3 docs: https://developer.chrome.com/docs/extensions/
- Firefox Add-ons/AMO docs: https://extensionworkshop.com/documentation/
- Chrome Web Store program policies: https://developer.chrome.com/docs/webstore/program-policies
- uBlock Origin Lite home: https://github.com/uBlockOrigin/uBOL-home
- h264ify GitHub: https://github.com/erkserkserks/h264ify
- FreeTube GitHub: https://github.com/FreeTubeApp/FreeTube
- NewPipe GitHub: https://github.com/TeamNewPipe/NewPipe
- Cobalt GitHub: https://github.com/imputnet/cobalt
- MeTube GitHub: https://github.com/alexta69/metube
- Karamel GitHub: https://github.com/odensc/karamel
- Reddit community reports on YouTube extension breakage, RYD, SponsorBlock, PocketTube, old layout, and distraction tools.
