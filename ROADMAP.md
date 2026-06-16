# Roadmap — Astra Deck

## Research-Driven Additions

### P0 — Critical / Root-Cause

### P1 — Trust / Reliability / Distribution

- [ ] P1 — Chrome Web Store submission (store-safe profile)
  Why: The store-safe build profile exists and strips AI/Cobalt/loopback permissions, but has never been submitted. Every major competitor (Enhancer, ImprovedTube, Tweaks, Unhook) is CWS-published. Side-loading requires developer mode, which most users won't enable.
  Evidence: CWS review process docs; `docs/cws-submission-checklist.md` and `docs/store-permission-rationale.md` already prepared; Enhancer for YouTube and ImprovedTube are CWS precedent for 100-200+ feature YouTube extensions.
  Touches: Chrome Web Store developer dashboard, `docs/cws-submission-checklist.md`, store listing assets (screenshots, description)
  Acceptance: Store-safe profile submitted and either approved or rejected with actionable feedback.
  Complexity: M

- [ ] P1 — Firefox AMO submission (store-safe profile)
  Why: Firefox XPI distribution currently requires manual install. AMO listing provides auto-updates, trust signal, and discoverability. Firefox 142+ manifest patch is already automated.
  Evidence: AMO updated policies (August 2025); Enhancer for YouTube lost Firefox AMO presence, creating an opportunity gap.
  Touches: AMO developer dashboard, `scripts/manifest-patch.js` output verification, store listing assets
  Acceptance: Store-safe XPI submitted to AMO and either approved or rejected with actionable feedback.
  Complexity: M

- [ ] P1 — Companion binary release (PyInstaller freeze + SHA256 sidecar)
  Why: README documents `AstraDownloader.exe` and `.sha256` as expected release assets, but no release has ever included them. Users must install Python 3.12 and run from source. This is the #1 onboarding friction for the download feature.
  Evidence: README "Astra Downloader Companion Setup" section; `astra_downloader/build.py` exists; `scripts/stage-companion-release.js` exists.
  Touches: `astra_downloader/build.py`, GitHub Release workflow, `scripts/stage-companion-release.js`
  Acceptance: `AstraDownloader.exe` and `AstraDownloader.exe.sha256` attached to a GitHub Release; the EXE runs on a clean Windows 10 machine without Python installed; `/health` returns valid JSON.
  Complexity: M

- [ ] P1 — Userscript/extension sync is structural drift, not sync
  Why: `sync-userscript.js` only rewrites the metadata header and re-bundles a hardcoded 22-module list; the ~15k-line monolith body is hand-maintained. The extension carries 247 feature ids vs 178 in the userscript; SponsorBlock, subscriptionGroups, the v4 export schema-validation wiring, and most post-v3 fixes never reached the userscript (the bundled `policy-profile.js` ships but is never called by the userscript's export/import path). Bundling also re-indents module template literals, so "verbatim" parity is already false.
  Evidence: 2026-06-10 audit; `V5_BUNDLE_MODULES` (22) vs manifest content_scripts (~64); userscript `exportVersion: 3` vs extension `exportVersion: 4`.
  Touches: `sync-userscript.js` (drift report or real conversion), CI guard comparing module lists, `YTKit.user.js` export/import path, decision on feature-parity scope
  Acceptance: either a documented, CI-enforced "userscript ships subset X" contract, or the userscript export/import wires `validateSettingsSnapshot` and a drift report fails CI when a bundled module diverges.
  Complexity: L

### P1 — Accessibility

### P2 — Quick Wins / Enhancement

- [ ] P2 — Adopt Chrome built-in Translator API for anti-translate
  Why: `antiTranslate` and `antiTranslateTranscript` currently work by suppressing YouTube's translation or stripping `tlang` params. Chrome 138+ ships a stable on-device Translator API that could provide local transcript translation without BYO keys, complementing the existing `localAiSummary` (Summarizer API) integration.
  Evidence: Chrome Translator API stable since Chrome 138; `extension/ytkit.js` already uses `window.Summarizer || window.ai?.summarizer` for local AI summary; zero references to Translator/LanguageDetector APIs in codebase.
  Touches: `extension/ytkit.js` (transcript viewer, anti-translate features), `extension/manifest.json` (permissions if needed)
  Acceptance: When Chrome Translator API is available, transcript viewer offers a "Translate" button that translates transcript text on-device; graceful degradation when API unavailable.
  Complexity: S

- [ ] P2 — Monolith decomposition: SponsorBlock feature peel
  Why: SponsorBlock rendering, segment fetching, skip scheduling, and progress bar painting are self-contained (~800 lines) but inline in the 45.6K-line monolith. Peeling this into `features/sponsorblock/index.js` matches the established pattern (11 modules already peeled) and makes the code independently testable.
  Evidence: `tests/features/sponsorblock.test.js` already exists (93 lines) but tests source-string patterns, not module exports; `features/` directory has the established pattern.
  Touches: New `extension/features/sponsorblock/index.js`, `extension/ytkit.js` (delegate to module), `extension/manifest.json` (content_scripts), `tests/features/sponsorblock.test.js`
  Acceptance: SponsorBlock feature works identically; the peeled module is testable via direct import; monolith `ytkit.js` shrinks by ~800 lines.
  Complexity: M

- [ ] P2 — Monolith decomposition: DeArrow feature peel
  Why: DeArrow cache, title formatting, thumbnail replacement, and API fetching are self-contained (~600 lines) but inline. Same rationale as SponsorBlock peel.
  Evidence: `tests/features/dearrow.test.js` already exists (107 lines); peeling matches the `features/` pattern.
  Touches: New `extension/features/dearrow/index.js`, `extension/ytkit.js`, `extension/manifest.json`, `tests/features/dearrow.test.js`
  Acceptance: DeArrow feature works identically; monolith shrinks by ~600 lines; DeArrow-specific tests can import the module directly.
  Complexity: M

- [ ] P2 — Monolith decomposition: Download UI peel
  Why: Download popup, progress panel, health panel, stream links panel, and Cobalt fallback total ~1500 lines. They have clear boundaries and a single integration surface (`ytKitDownload`).
  Evidence: Download UI is the largest unpelled feature domain; `MediaDLManager` singleton is already semi-isolated.
  Touches: New `extension/features/download-ui/index.js`, `extension/ytkit.js`, `extension/manifest.json`
  Acceptance: Download flows work identically; monolith shrinks by ~1500 lines.
  Complexity: L

- [ ] P2 — Companion module split
  Why: `astra_downloader/astra_downloader.py` (5.3K lines) mixes Flask routes, Qt GUI, download management, yt-dlp subprocess control, config management, and health probes in a single file. Splitting improves testability and maintainability.
  Evidence: H26 audit noted threading concerns; `test_astra_downloader.py` must mock deeply to test individual concerns.
  Touches: `astra_downloader/astra_downloader.py` (split into `routes.py`, `downloader.py`, `gui.py`, `health.py`, `config.py`), `astra_downloader/test_astra_downloader.py`
  Acceptance: All 111 Python tests pass; companion starts and serves downloads identically; each module is independently importable for testing.
  Complexity: L

- [ ] P2 — SponsorBlock per-channel skip profiles
  Why: SponsorBlock 6.0 (Sep 2025) made per-channel category overrides table-stakes; Astra Deck has only global category toggles, while it already ships the per-channel storage pattern (perChannelSpeed keyed by channel handle, 500-entry cap).
  Evidence: github.com/ajayyy/SponsorBlock/releases (v6.0 channel skip profiles); `extension/ytkit.js` perChannelSpeed StorageManager pattern.
  Touches: `extension/ytkit.js` (SponsorBlock settings resolution per channel, watch-page quick control), `core/storage-manager.js` (capped per-channel store), settings schema + locales
  Acceptance: User can override skip categories for the current channel from the player/settings UI; overrides persist with deterministic eviction; global defaults apply otherwise.
  Complexity: M

- [ ] P2 — Classic player chrome restoration preset
  Why: Four single-purpose extensions (OldYTPlayer, CustomTube, YouTube Redux, PlayerTube) exist solely to revert YouTube's 2025/26 "Delhi"/Liquid Glass player redesign and review demand is strong; Astra Deck already ships partial pieces (Delhi chrome hiding ~`ytkit.js` line 34292, `noFrostedGlass`) and can own this with one CSS-first preset toggle.
  Evidence: chromewebstore listings for OldYTPlayer/CustomTube/YouTube Redux; tomsguide.com redesign-backlash coverage; existing `ytp-delhi-modern` selectors in `core/selector-packs/playerChrome.js`.
  Touches: `extension/ytkit.js` (new `classicPlayerChrome` feature grouping existing + new CSS: opaque square controls, classic progress bar without pink gradient, classic time display), `core/selector-packs/playerChrome.js`, settings schema + locales, `early.css`
  Acceptance: One toggle restores a pre-redesign player look (CSS-only, no DOM rebuild) on current YouTube; conflict-free with customProgressBarColor and nyanCatProgressBar (conflict map entries if needed); selector regression fixtures updated.
  Complexity: M

- [ ] P2 — Per-context quality (fullscreen vs windowed vs PiP)
  Why: Tweaks for YouTube ships per-context quality (fullscreen/theater/embedded/background) and it is the natural extension of `alwaysBestQuality`'s DOM-click quality forcing — e.g. best in fullscreen, capped in windowed to save bandwidth.
  Evidence: inzk.dev/tweaks-for-youtube/features; existing quality-forcing implementation in `extension/ytkit.js` (DOM click through `.ytp-settings-button`).
  Touches: `extension/ytkit.js` (quality engine context detection via fullscreenchange/PiP events, per-context target settings), settings schema + locales
  Acceptance: Distinct quality targets for windowed/fullscreen/PiP apply within ~1s of context change; defaults preserve current alwaysBestQuality behavior.
  Complexity: M

- [ ] P2 — Companion auto-provisions Deno runtime
  Why: yt-dlp >= 2026.04 requires an external JS runtime and the companion already auto-bootstraps yt-dlp.exe and ffmpeg.exe on first run — Deno is the one remaining manual step (winget/installer), surfaced only as a warning pill.
  Evidence: `astra_downloader/astra_downloader.py` `_bootstrap()` (yt-dlp/ffmpeg auto-download with SHA sidecars) vs `probe_deno_runtime()` (probe-only); yt-dlp 2025.11.12 release notes (external JS runtime required).
  Touches: `astra_downloader/astra_downloader.py` (download pinned Deno portable zip from GitHub releases with SHA256 verification into `%LOCALAPPDATA%\AstraDownloader`, prepend to subprocess PATH), `astra_downloader/test_astra_downloader.py`, `/health` denoRuntime payload (`source: bundled|system`)
  Acceptance: On a machine without Deno, the companion offers/performs a one-click Deno provision; `/health.denoRuntime.installed` flips true without any manual install; yt-dlp subprocesses resolve the bundled runtime; checksum failure aborts cleanly.
  Complexity: M

### P2 — Observability / Developer Experience

- [ ] P2 — Visual regression testing for popup
  Why: The popup is the primary user-facing control surface. CSS changes, i18n string length variations, and Chrome version differences can cause visual regressions that unit tests cannot catch.
  Evidence: No visual regression tests in the codebase; popup has been through multiple redesigns (v3.11, v3.19, v4.x).
  Touches: New `tests/visual/` directory, Puppeteer screenshot comparison, CI integration
  Acceptance: CI captures popup screenshots in Chrome and Firefox; a baseline is committed; regressions fail the build with a diff image.
  Complexity: M

### P3 — Later / Under Consideration

- [ ] P3 — SharedAudio port to extension (MAIN world audio processing)
  Why: volumeBoost, skipSilence, audioNormalization, and audioEqualizer are userscript-only because they require MAIN world Web Audio API access. Tweaks for YouTube ships compressor, auto gain, and pan in-extension. The MAIN world bridge (`ytkit-main.js`) already exists for codec filtering.
  Evidence: CLAUDE.md "Not Yet Ported to Extension" section; Tweaks for YouTube features page lists advanced audio processing.
  Touches: `extension/ytkit-main.js` (MAIN world audio graph), `extension/ytkit.js` (data-attribute bridge), `extension/manifest.json`
  Acceptance: At least volumeBoost and audioNormalization work in the extension build via MAIN world bridge; feature toggles in settings panel.
  Complexity: XL

- [ ] P3 — Search within playlist
  Why: Tweaks for YouTube offers Ctrl+Shift+F to search within playlist panels. Astra Deck has `commentSearch` for comments but no equivalent for playlists.
  Evidence: Tweaks for YouTube features page; YouTube Alchemy also implements playlist search.
  Touches: `extension/ytkit.js` (new feature), settings schema
  Acceptance: Search input appears above playlist panel; filters playlist items by title; keyboard shortcut optional.
  Complexity: S

- [ ] P3 — Chrome Prompt API (Gemini Nano) for transcript Q&A
  Why: Chrome 138+ ships the Prompt API stable for extensions. Astra Deck already uses the Summarizer API for `localAiSummary`. The Prompt API would enable on-device transcript Q&A without BYO keys.
  Evidence: Chrome Prompt API docs; `extension/ytkit.js` already checks `window.Summarizer || window.ai?.summarizer`.
  Touches: `extension/ytkit.js` (new feature or enhancement to `localAiSummary`), settings schema
  Acceptance: When Prompt API available, user can ask questions about the current video's transcript; responses generated on-device; graceful fallback when unavailable.
  Complexity: M

- [ ] P3 — Color-coded video age borders on feed cards
  Why: YouTube Alchemy implements color-coded borders indicating video age (fresh/week/month/year). Astra Deck has `videoAgeColors` (v3.9.0) but it uses CSS pseudo-elements. The YouTube Alchemy approach of highlighting the last uploaded video on the subscriptions page with auto-scroll is a UX improvement.
  Evidence: YouTube Alchemy README; Astra Deck `videoAgeColors` already exists but could be enhanced.
  Touches: `extension/ytkit.js` (enhance `videoAgeColors`), settings schema
  Acceptance: Subscription page highlights the most recent video per channel with a distinct border and optional auto-scroll to the first new video.
  Complexity: S

- [ ] P3 — DeArrow submission and voting (write-side)
  Why: Astra Deck consumes DeArrow titles/thumbnails but cannot contribute or vote, so users who spot bad replacements have no recourse; the official DeArrow extension supports right-click submit and thumbs up/down voting.
  Evidence: github.com/ajayyy/DeArrow (submission/voting flow, requires a locally generated private userID); Astra Deck DeArrow integration is fetch-and-cache only.
  Touches: `extension/ytkit.js` (DeArrow UI: vote buttons on replaced titles, submit dialog), `extension/background.js` + `core/data-flow.js` (POST endpoints on sponsor.ajay.app, userID generation/storage with credential-scrub exemption review), privacy policy text
  Acceptance: Users can vote on a replaced title and submit a new title/timestamp thumbnail; the generated userID never leaves DeArrow requests and is excluded from settings exports; feature is off by default.
  Complexity: M

