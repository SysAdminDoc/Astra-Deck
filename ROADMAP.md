# Roadmap — Astra Deck

## Research-Driven Additions

### P0 — Critical / Root-Cause

### P1 — Trust / Reliability / Distribution

(CWS submission, AMO submission, companion binary release moved to Roadmap_Blocked.md — require manual external actions.)

### P1 — Accessibility

### P2 — Quick Wins / Enhancement

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

(Competitor migration docs and supply chain transparency docs moved to Roadmap_Blocked.md — require creating new markdown files.)

### P2 — Observability / Developer Experience

(Visual regression testing moved to Roadmap_Blocked.md — requires headless browser environment.)

### P3 — Later / Under Consideration

- [ ] P3 — SharedAudio port to extension (MAIN world audio processing)
  Why: volumeBoost, skipSilence, audioNormalization, and audioEqualizer are userscript-only because they require MAIN world Web Audio API access. Tweaks for YouTube ships compressor, auto gain, and pan in-extension. The MAIN world bridge (`ytkit-main.js`) already exists for codec filtering.
  Evidence: CLAUDE.md "Not Yet Ported to Extension" section; Tweaks for YouTube features page lists advanced audio processing.
  Touches: `extension/ytkit-main.js` (MAIN world audio graph), `extension/ytkit.js` (data-attribute bridge), `extension/manifest.json`
  Acceptance: At least volumeBoost and audioNormalization work in the extension build via MAIN world bridge; feature toggles in settings panel.
  Complexity: XL



(Chrome Writer/Rewriter API moved to Roadmap_Blocked.md — API still in Developer Trial, not stable.)

## Research-Driven Additions (June 2026 Cycle 2)



### P2 — Quick Wins / Enhancement

- [ ] P2 — Userscript feature gap closure: SponsorBlock
  Why: SponsorBlock is extension-only (247 ext feature IDs vs 178 userscript feature IDs). The userscript has no SponsorBlock integration, which is the single most requested YouTube extension feature. This is the largest concrete gap between the two vehicles.
  Evidence: CLAUDE.md "Not Yet Ported to Extension" section lists SponsorBlock as ported in v3.4.0 for extension but does not exist in userscript; `check-userscript-drift.js` only checks module parity, not feature parity; `YTKit.user.js` at 26,944 lines has no `sponsor.ajay.app` API calls.
  Touches: `YTKit.user.js` (add SponsorBlock hash-prefix API fetch, segment rendering, skip scheduling), `sync-userscript.js` (bundle the SponsorBlock module if it gets peeled), settings schema keys in userscript defaults
  Acceptance: Userscript fetches and displays SponsorBlock segments, auto-skips enabled categories, renders colored segment bars on the progress bar. Same 9 category toggles as extension.
  Complexity: L

(Selector fixture refresh moved to Roadmap_Blocked.md — requires live browser MHTML capture.)


### P2 — Observability / Developer Experience

### P3 — Later / Under Consideration

## Research-Driven Additions (June 2026 Cycle 3)

### P1 — Security / Reliability

- [ ] P1 — Pin Werkzeug and Jinja2 floor versions in requirements.txt
  Why: `requirements.txt` pins `flask>=3.1.3,<4` but does NOT pin its transitive dependencies Werkzeug or Jinja2. CVE-2026-21860 and CVE-2026-27199 (Werkzeug < 3.1.6) allow Windows device-name path traversal in `safe_join()` — the companion's `/download` output-dir validation may traverse this code path. CVE-2025-27516 (Jinja2 < 3.1.6) is a sandbox escape — structurally inapplicable since the companion doesn't render user templates, but should be pinned defensively. Local machine is on safe versions (3.1.6/3.1.6) but fresh installs and CI could resolve to vulnerable versions.
  Evidence: `py -3.12 -m pip show werkzeug` = 3.1.6 (safe); `requirements.txt` has no werkzeug/jinja2 entries; CVE-2026-21860 affects Werkzeug < 3.1.5, CVE-2026-27199 affects Werkzeug <= 3.1.5 (bypass of 21860 fix).
  Touches: `astra_downloader/requirements.txt`
  Acceptance: `requirements.txt` contains `werkzeug>=3.1.6,<4` and `jinja2>=3.1.6,<4`. `pip-audit` CI job passes. Fresh `pip install -r requirements.txt` resolves to safe versions.
  Complexity: S

- [ ] P1 — Validate Chrome Local Network Access exemption for companion communication
  Why: Chrome 142+ gates content-script-to-localhost fetch behind a user permission prompt. Chrome 147+ extends this to WebSocket. The extension communicates with the companion via `fetch()` to `http://127.0.0.1:9751` (and 5 fallback ports). The manifest has explicit `host_permissions` for these origins, which should exempt the extension from the prompt — but this has never been verified on Chrome 147+. If the exemption doesn't hold, companion communication silently breaks for users on Chrome 147+.
  Evidence: Chrome What's New in Extensions (Local Network Access, Chrome 142/146/147); manifest.json `host_permissions` includes `http://127.0.0.1:9751/*` through `9851/*`.
  Touches: Manual testing on Chrome 147+. If exemption fails: `extension/manifest.json` (add `optional_host_permissions`), `extension/core/optional-host-permissions.js`, `extension/ytkit.js` (MediaDLManager.check flow).
  Acceptance: Companion health check and download flow work on Chrome 147+ without user-visible permission prompt. If prompt is needed, document the flow and surface a diagnostic message.
  Complexity: S (if exempted) / M (if not)

### P2 — Quick Wins / Enhancement

- [ ] P2 — Subscription group Live/Streamed content filter
  Why: Tweaks for YouTube v3.90.0 (Jun 2026) added content filters for Live and Streamed videos in subscription feeds. Astra Deck's subscription groups sort and filter by age/duration/watched status but cannot filter out live broadcasts or premieres, which clutter feeds for users who only want VODs.
  Evidence: Tweaks for YouTube v3.90.0 changelog; Astra Deck subscription groups have 5 sort modes but no content-type filter.
  Touches: `extension/ytkit.js` (subscriptionGroups feature), settings schema (new `subscriptionFilterLive` / `subscriptionFilterPremiered` boolean keys)
  Acceptance: Subscription group toolbar gains a filter dropdown or toggles for Live/Upcoming/Premiered. Filtered cards are hidden from the feed. Filter persists per session.
  Complexity: S

- [ ] P2 — Settings panel guided onboarding wizard
  Why: With 257 feature toggles across 18 categories, the settings panel is overwhelming for new users. The preset profiles (Privacy, Researcher, Power User) exist but require users to find them. A first-run wizard that asks 3-4 questions about usage style and auto-applies the best matching preset would dramatically improve onboarding.
  Evidence: ImprovedTube (250+ features) and Astra Deck both struggle with discoverability at scale; PocketTube's focused subscription UX is a counterexample of clarity. The existing `FIRST_RUN_SEEN_KEY` sentinel already tracks first-run state.
  Touches: `extension/ytkit.js` (first-run flow), `extension/popup.js` (optional popup-side wizard)
  Acceptance: First-run users see a 3-step wizard (Privacy / Research / Power User / Custom) that applies the matching preset profile. Wizard can be re-triggered from settings. Existing users are not affected.
  Complexity: M

- [ ] P2 — Horizontal/vertical video flip buttons
  Why: YouTube Enhancer (v1.33.0) ships horizontal and vertical flip buttons as player controls. These are useful for mirrored dance tutorials, text readability correction, and accessibility. CSS-only implementation via `transform: scaleX(-1)` / `scaleY(-1)`.
  Evidence: YouTube Enhancer feature list; 64 features includes flip controls.
  Touches: `extension/ytkit.js` (new `videoFlipHorizontal` / `videoFlipVertical` features), settings schema
  Acceptance: Two new player-controls buttons (flip H / flip V) toggle CSS transforms on `.html5-main-video`. State persists per session. Compatible with existing `videoRotation`.
  Complexity: S

- [ ] P2 — Mono-to-stereo audio conversion
  Why: YouTube Enhancer ships mono-to-stereo conversion. Some YouTube content (lectures, podcasts, old recordings) is mono, which sounds unbalanced on headphones. A Web Audio API `ChannelSplitterNode` + `ChannelMergerNode` can duplicate mono to both channels.
  Evidence: YouTube Enhancer v1.33.0 feature list.
  Touches: `extension/ytkit-main.js` (MAIN world audio graph), `extension/ytkit.js` (settings toggle), settings schema
  Acceptance: New `monoToStereo` toggle in settings. When enabled, mono audio content plays as centered stereo. No effect on already-stereo content. Feature auto-detects mono via `AudioContext.createAnalyser()` channel count.
  Complexity: M

- [ ] P2 — Userscript feature parity dashboard in check pipeline
  Why: The userscript drift guard (`check-userscript-drift.js`) only checks module parity (14 manifest features vs V5_BUNDLE_MODULES), not feature-ID parity (257 ext vs 178 userscript). The 79-feature gap is invisible to CI — regressions in feature parity aren't caught.
  Evidence: `npm run check` output shows "14 manifest feature module(s) covered by V5_BUNDLE_MODULES" but doesn't report the 79 feature-ID gap. CLAUDE.md documents the drift as "247 ext feature ids vs 178 us" (now 257 vs 178).
  Touches: `scripts/check-userscript-drift.js`, `extension/ytkit.js` (feature ID extraction), `YTKit.user.js` (feature ID extraction)
  Acceptance: `npm run check` reports the feature-ID parity ratio (e.g., "178/257 feature IDs in userscript (69% parity)"). No gate — informational only, ratchets naturally as features are ported.
  Complexity: S

### P2 — Observability / Developer Experience

- [ ] P2 — Per-feature performance budget with dashboard
  Why: Per-feature init/destroy timing is now captured (`initMs`/`destroyMs` in registry health snapshot). The data exists but is only accessible via the diagnostic JSON download. A user-facing dashboard in the popup or settings panel would let users identify and disable slow features.
  Evidence: `core/feature-lifecycle.js` captures `performance.now()` elapsed time; `core/registry.js` stores health snapshots; popup diagnostic download includes these fields.
  Touches: `extension/popup.js` (new performance tab or section), `extension/popup.css`
  Acceptance: Popup shows a sortable list of feature init times. Features exceeding a threshold (e.g., 50ms) are flagged. Users can disable slow features from the dashboard.
  Complexity: M

### P2 — Platform

- [ ] P2 — Chrome Side Panel for diagnostics and data-flow dashboard
  Why: Chrome's Side Panel API (stable since Chrome 114) provides a persistent, resizable UI docked to the browser window that survives tab navigation. The current data-flow panel, selector-health dashboard, and diagnostic views are injected into YouTube's DOM (polluting it) or crammed into the 420x600 popup. A side panel would give these views more space, persist across SPA navigation, and run in the extension context (no Trusted Types concerns).
  Evidence: Chrome Side Panel API docs; the popup already bundles `core/data-flow.js`, `core/selector-health.js`, and `core/policy-profile.js`. YouTube extensions like Cleangarden use the side panel for playlist management. The side panel is Chrome-only (Firefox has no equivalent API), so this would be a progressive enhancement with popup fallback.
  Touches: New `extension/sidepanel.html` + `sidepanel.js` + `sidepanel.css`, `extension/manifest.json` (`side_panel` permission + `side_panel.default_path`), `extension/popup.js` (open-in-sidepanel action)
  Acceptance: Clicking a "Open in Side Panel" action in the popup opens a full-height diagnostic dashboard with data-flow, selector health, performance timing, and storage stats. Chrome users get the enhanced view; Firefox users keep the popup. Settings panel remains in-page (it needs YouTube DOM context).
  Complexity: M

### P3 — Later / Under Consideration

- [ ] P3 — Auto-recovery from settings corruption crash loop
  Why: If corrupted settings cause ytkit.js to crash on init, the user's only recovery is appending `?ytkit=safe` to the URL — but they must know this exists. An automatic detection mechanism (crash counter in `chrome.storage.session`, reset after N consecutive crashes within M seconds) would auto-enter safe mode and surface the recovery UI.
  Evidence: Safe mode exists (`?ytkit=safe`) and crash recovery auto-disables individual features after 3 crashes. But a global init crash (e.g., corrupted settings object) bypasses per-feature recovery. No users have reported this, but it's a latent risk.
  Touches: `extension/ytkit.js` (early init guard), `chrome.storage.session` (crash counter)
  Acceptance: If the content script crashes 3 times within 30 seconds (tracked via session storage), the next load auto-enters safe mode and shows a toast explaining what happened with a "Reset settings" action.
  Complexity: M

- [ ] P3 — Structured logging for companion (JSON log format)
  Why: The companion's logging is currently unstructured text in a rotating file. Structured JSON logs would enable the extension's diagnostic download to include companion-side context (download failures, yt-dlp errors, health probe results) alongside extension-side diagnostics.
  Evidence: H26 audit noted threading concerns in the companion; the extension's diagnostic download already includes `download-outcome` and `transcript-po-token` categories but has no companion-side data.
  Touches: `astra_downloader/astra_downloader.py` (logging configuration)
  Acceptance: Companion logs to JSON lines format. The `/health` endpoint includes a `recentErrors` field with the last 10 error log entries. The extension diagnostic download includes companion error context when the companion is reachable.
  Complexity: M

