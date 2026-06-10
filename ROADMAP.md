# Roadmap — Astra Deck

## Research-Driven Additions

### P0 — Critical / Root-Cause

- [ ] P0 — Bump yt-dlp pin to >= 2026.05 stable
  Why: Current pin `2026.3.17` predates SABR-only format transition; `downloadStreamLinksPanel` will return empty results as YouTube removes `adaptiveFormats` from web client responses.
  Evidence: yt-dlp/yt-dlp#12482 (SABR-only formats issue), YouTube SABR rollout confirmed by multiple sources.
  Touches: `astra_downloader/requirements.txt`, `scripts/yt-dlp-smoke.py`, `.github/workflows/yt-dlp-smoke.yml`, `extension/ytkit.js` (downloadStreamLinksPanel SABR-only messaging)
  Acceptance: `npm run build` and `yt-dlp-smoke.py` pass with the new pin; `/health` reports a yt-dlp version >= 2026.05; downloads succeed on videos that currently serve SABR-only.
  Complexity: S

- [ ] P0 — Prepare Liquid Glass selector resilience
  Why: YouTube is rolling out a player UI redesign with rounded translucent controls ("Liquid Glass" aesthetic) that will change selector surfaces the extension depends on across `playerChrome`, `player`, and `mainVideo` selector packs.
  Evidence: TechSpot, 9to5Google reporting on YouTube player redesign; existing `ytp-delhi-modern` canary selectors in `core/selector-packs/playerChrome.js`.
  Touches: `extension/core/selector-packs/playerChrome.js`, `extension/core/selector-packs/player.js`, `extension/core/selector-packs/mainVideo.js`, `tests/selector-regression.test.js`, `mhtml/` fixtures
  Acceptance: Fresh MHTML captures from current YouTube player; new selector canaries for Liquid Glass classes; selector regression tests pass against both old and new DOM shapes.
  Complexity: M

- [ ] P0 — E2E browser test harness with Puppeteer
  Why: All 246+ JS tests are Node-only. Zero tests verify DOM interaction, MV3 service worker lifecycle, popup rendering, or content-script injection on a real YouTube page. YouTube DOM churn means regressions can ship silently.
  Evidence: No Puppeteer/Playwright imports in codebase; `.gitignore` references `playwright/.auth/` but no test files exist; Chrome docs recommend Puppeteer for extension E2E.
  Touches: New `tests/e2e/` directory, `package.json` (devDependency), CI workflow
  Acceptance: At least 5 E2E tests covering: extension loads on youtube.com, settings panel opens, a toggle persists across navigation, popup renders with correct version, download button appears when companion is offline.
  Complexity: L

- [ ] P0 — Restore public availability of store-required docs and fix README 404 links
  Why: Commit 8e920ed gitignored all .md except README; SECURITY.md, docs/privacy-policy.md, CHANGELOG.md, INSTALL.md, CONTRIBUTING.md, HARDENING.md, and every docs/ link in README now 404 on GitHub. CWS and AMO listings both require a working privacy-policy URL, so this hard-blocks the P1 store submissions; docs/architecture.md is referenced but does not exist even locally. Conflicts with the maintainer's global md-hygiene rule — resolve by re-tracking a minimal public set (SECURITY.md, docs/privacy-policy.md at minimum) or publishing via GitHub Pages and rewriting README links.
  Evidence: `git ls-files '*.md'` returns only README.md; README.md lines 21-23, 447-465; CWS/AMO privacy-policy requirements (developer.chrome.com/docs/webstore, blog.mozilla.org/addons 2025-06-23 policy update).
  Touches: `.gitignore`, `README.md`, `SECURITY.md`, `docs/privacy-policy.md` (re-track or Pages), `docs/architecture.md` (create or drop the link)
  Acceptance: Every link in the rendered GitHub README resolves; the privacy-policy URL used in store listings returns 200 anonymously; GitHub shows the security policy on the repo Security tab.
  Complexity: S

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

- [ ] P1 — Settings sync via chrome.storage.sync
  Why: Users with multiple devices must manually export/import settings. `chrome.storage.sync` provides cross-device sync with 100KB total quota. Competitors (Enhancer, ImprovedTube) offer this.
  Evidence: Zero references to `storage.sync` in the codebase; MDN docs confirm Firefox supports `storage.sync` with Mozilla account.
  Touches: `extension/core/storage.js`, `extension/popup.js` (sync toggle UI), `extension/ytkit.js` (settings persistence layer)
  Acceptance: Opt-in "Sync settings" toggle in popup; toggling a feature on Device A reflects on Device B within 30 seconds; large settings (hidden videos list, watch history) remain in `storage.local` only to respect the 100KB sync quota.
  Complexity: M

- [ ] P1 — Companion binary release (PyInstaller freeze + SHA256 sidecar)
  Why: README documents `AstraDownloader.exe` and `.sha256` as expected release assets, but no release has ever included them. Users must install Python 3.12 and run from source. This is the #1 onboarding friction for the download feature.
  Evidence: README "Astra Downloader Companion Setup" section; `astra_downloader/build.py` exists; `scripts/stage-companion-release.js` exists.
  Touches: `astra_downloader/build.py`, GitHub Release workflow, `scripts/stage-companion-release.js`
  Acceptance: `AstraDownloader.exe` and `AstraDownloader.exe.sha256` attached to a GitHub Release; the EXE runs on a clean Windows 10 machine without Python installed; `/health` returns valid JSON.
  Complexity: M

- [ ] P1 — Strip unused `cookies` permission from the store-safe manifest profile
  Why: `cookies` is declared in `extension/manifest.json` but its only consumer is the `EXT_COOKIE_LIST` companion cookie bridge (`background.js` ~line 860 → `ytkit.js` ~line 2994), and store-safe strips the companion loopback origins — CWS has rejected extensions specifically for declaring-but-not-using `cookies`.
  Evidence: chromium-extensions thread "Rejected for not using the cookies permission" (groups.google.com/a/chromium.org/g/chromium-extensions/c/wAKuD5DD2ts); `core/data-flow.js` marks `127.0.0.1:9751-9851` as profile `github-full`; `build-extension.js` rewrites only host_permissions/CSP, never `permissions`.
  Touches: `build-extension.js` (profile-aware `permissions` rewrite), `core/data-flow.js` (declare API-permission ownership per origin/feature), `tests/hardening.test.js`, `docs/store-permission-rationale.md`
  Acceptance: Built store-safe Chrome/Firefox manifests contain no `cookies` permission; GitHub-full manifests still do; cookie bridge degrades gracefully (existing "permission may not be granted" log path) and all tests pass.
  Complexity: S

- [ ] P1 — Update notifier for sideloaded installs
  Why: The only current install paths (release ZIP/XPI/CRX sideload, userscript) have no auto-update; users silently stay on stale builds and miss security fixes. Only the companion has an update channel today.
  Evidence: No `releases/latest` version check anywhere in `extension/` except the companion EXE URL (`ytkit.js` line 2424); repo is unlisted on CWS/AMO so browser auto-update never applies.
  Touches: `extension/background.js` (daily `chrome.alarms` check against `https://api.github.com/repos/SysAdminDoc/Astra-Deck/releases/latest`, origin added to EXT_FETCH allowlist + manifest/CSP via `core/data-flow.js`), `extension/popup.js` (update badge + release-notes link), settings schema (opt-out toggle, default on)
  Acceptance: When the latest release tag exceeds `chrome.runtime.getManifest().version`, the popup shows a non-blocking update notice linking to the release page; check is rate-limited to once/day; opt-out works; no notice when current.
  Complexity: S

- [ ] P1 — Slim the live_chat iframe content-script payload
  Why: The second `content_scripts` block injects the full ~2.7 MB bundle (42K-line `ytkit.js` + 60 files) into every live-chat iframe with `all_frames: true`, where only chat features run; comparable bundles cost ~440 ms parse+eval per injection (DebugBear measurement of a 2.9 MB content script).
  Evidence: `extension/manifest.json` lines 171-250; debugbear.com/blog/measuring-the-performance-impact-of-chrome-extensions; the duplicated 60-file list is already a build-generation candidate.
  Touches: `build-extension.js` (generate both content_scripts blocks from one list; emit a chat-scoped entry), `extension/ytkit.js` (frame-type gate so non-chat feature init exits early in live_chat frames), `tests/` (manifest-shape regression)
  Acceptance: live_chat frames load only chat-relevant modules (or full bundle exits init before non-chat feature registration); Premium Live Chat, chat filters, and Reaction Spammer still work; measured script-eval time in the chat iframe drops materially (record before/after in the diagnostic log).
  Complexity: M

### P1 — Accessibility

- [ ] P1 — RTL locale support (Arabic, Hebrew)
  Why: 10 locales shipped but zero RTL handling. No `dir="rtl"` in any HTML. Arabic is the 5th most spoken language globally. ImprovedTube supports 30+ languages including RTL.
  Evidence: Zero matches for `dir="rtl"` or `direction: rtl` in `extension/`; i18n accessibility guide (intlpull.com) documents RTL as a baseline requirement.
  Touches: `extension/popup.html`, `extension/popup.css`, `extension/ytkit.js` (settings panel CSS), `extension/_locales/` (new `ar` and/or `he` locale), `scripts/check-i18n.js`
  Acceptance: Arabic locale added; popup and settings panel render correctly with RTL text direction; no clipping or overflow on RTL layout.
  Complexity: M

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

- [ ] P2 — ESLint 10 migration
  Why: `package.json` pins `eslint: ^10.2.1` and uses `eslint.config.js` (flat config), which is correct for ESLint 10. However, the config should be audited to ensure it leverages ESLint 10's per-file config lookup and JSX tracking improvements, and that custom rules in `scripts/eslint-rules/` are compatible.
  Evidence: ESLint 10 released February 2026; eslintrc completely removed; project already uses flat config file.
  Touches: `eslint.config.js`, `scripts/eslint-rules/*.js`, `package.json`
  Acceptance: `npm run lint` passes cleanly on ESLint 10; custom rules (`require-catch-reason`, `no-post-await-addlistener`) work without deprecation warnings.
  Complexity: S

- [ ] P2 — Companion module split
  Why: `astra_downloader/astra_downloader.py` (5.3K lines) mixes Flask routes, Qt GUI, download management, yt-dlp subprocess control, config management, and health probes in a single file. Splitting improves testability and maintainability.
  Evidence: H26 audit noted threading concerns; `test_astra_downloader.py` must mock deeply to test individual concerns.
  Touches: `astra_downloader/astra_downloader.py` (split into `routes.py`, `downloader.py`, `gui.py`, `health.py`, `config.py`), `astra_downloader/test_astra_downloader.py`
  Acceptance: All 111 Python tests pass; companion starts and serves downloads identically; each module is independently importable for testing.
  Complexity: L

- [ ] P2 — SponsorBlock category parity: add `hook`, `exclusive_access`, and mute-action segments
  Why: Upstream split Preview/Recap vs Hook/Greetings in v5.14 (July 2025) and supports `exclusive_access` full-video labels and `mute` action segments; Astra Deck ships only 9 categories (`ytkit.js` ~lines 26646-26654) so hook segments silently never skip.
  Evidence: wiki.sponsor.ajay.app/w/Types; github.com/ajayyy/SponsorBlock/releases (v5.14); `extension/ytkit.js` sbCat_ map lacks `hook`/`exclusive_access`.
  Touches: `extension/ytkit.js` (SponsorBlock category map, segment scheduler mute handling, settings panel toggles), `core/settings-schema.js`, locale bundles (`_locales/*/messages.json`), `tests/features/sponsorblock.test.js`
  Acceptance: `hook` segments skip when enabled; `exclusive_access` renders a full-video label without skipping; `mute` action segments mute instead of seeking; new toggles appear in all 10 locales with English fallback.
  Complexity: S

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

- [ ] P2 — Subscription groups CSV/OPML export and Google Takeout import
  Why: PocketTube (the 250K-user subscription-groups incumbent) offers CSV export; Takeout's subscriptions.csv is the standard migration source. Astra Deck's `subscriptionGroupData` has only versioned-JSON export, so users can't migrate in from PocketTube/Takeout or out to anything else.
  Evidence: pockettube.io feature list; `subscriptionGroupData` schema v2 export/import in `extension/ytkit.js` (no CSV/OPML found by grep).
  Touches: `extension/ytkit.js` (subscription groups import/export UI; CSV parse with header detection for Takeout `Channel Id,Channel Url,Channel Title`; OPML emit using channel RSS URLs), `tests/`
  Acceptance: Export produces CSV and OPML files of all groups/channels; importing a Google Takeout subscriptions.csv stages channels into a chosen group; round-trip preserves group membership.
  Complexity: S

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

- [ ] P2 — Watch history analytics export (CSV/JSON)
  Why: `watchHistoryAnalytics` provides a 30-day bar chart modal, but the data cannot be exported. YouTube Watch Stats (CWS extension) and youtube-history-analyzer (GitHub) both offer CSV/JSON export. The data already exists in `storage.local`.
  Evidence: `window.__ytkitOpenAnalytics()` exists; YouTube Watch Stats extension provides export; `researchSpacedReview` already exports to CSV.
  Touches: `extension/ytkit.js` (analytics modal), existing CSV export pattern from `researchSpacedReview`
  Acceptance: Analytics modal has "Export CSV" and "Export JSON" buttons; exported file contains daily watch-time data with video IDs and channel names.
  Complexity: S

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

- [ ] P3 — Zen Mode (dim/blur everything except player)
  Why: Tweaks for YouTube's "Zen Mode" and Enhancer's "Dim" feature provide focus by dimming the page around the player. Astra Deck has `focusedMode` (hides related videos) and `blueLightFilter` but no dim/blur overlay.
  Evidence: Tweaks for YouTube Zen Mode; Enhancer for YouTube cinema mode.
  Touches: `extension/ytkit.js` (new CSS feature), settings schema
  Acceptance: Toggle dims and blurs all page sections except the player; respects `prefers-reduced-motion` for the blur animation.
  Complexity: S

- [ ] P3 — Supply chain audit for crx3 transitive dependencies
  Why: The September 2025 Shai-Hulud npm supply chain worm compromised packages with billions of weekly downloads (chalk, debug, ansi-styles). `crx3` is the sole runtime dependency; its transitive tree should be audited.
  Evidence: Shai-Hulud attack reports (Snyk, Tenable CVE-2026-45321); `crx3` depends on `pbf` which depends on `resolve-protobuf-schema` (already bumped for GHSA-j452-xhg8-qg39).
  Touches: `package.json`, `package-lock.json`, `.github/workflows/validate.yml`
  Acceptance: `npm audit` clean; transitive dependency tree documented; lockfile integrity verified.
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

- [ ] P3 — Play subscription group as queue
  Why: PocketTube's "play all videos by collection" is its stickiest feature; Astra Deck groups can already enumerate rendered videos per group but offer no one-click way to watch them.
  Evidence: pockettube.io feature list; YouTube's anonymous playlist endpoint (`/watch_videos?video_ids=…`, ~50-ID cap) used by comparable tools.
  Touches: `extension/ytkit.js` (group toolbar "Play all" action building a watch_videos URL from the group's rendered new videos, newest-first, capped at 50)
  Acceptance: Clicking "Play all" on a group opens a playable queue of that group's recent videos; counts above the cap are truncated with a toast; no YouTube write APIs are called.
  Complexity: S
