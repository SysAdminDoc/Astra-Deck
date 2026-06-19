# Roadmap — Astra Deck

## Research-Driven Additions

### P0 — Critical / Root-Cause

### P1 — Trust / Reliability / Distribution

(Moved to Roadmap_Blocked.md — CWS submission, AMO submission, companion binary release all require manual external actions.)

### P1 — Accessibility

### P2 — Quick Wins / Enhancement

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

- [ ] P2 — Companion auto-provisions Deno runtime
  Why: yt-dlp >= 2026.04 requires an external JS runtime and the companion already auto-bootstraps yt-dlp.exe and ffmpeg.exe on first run — Deno is the one remaining manual step (winget/installer), surfaced only as a warning pill.
  Evidence: `astra_downloader/astra_downloader.py` `_bootstrap()` (yt-dlp/ffmpeg auto-download with SHA sidecars) vs `probe_deno_runtime()` (probe-only); yt-dlp 2025.11.12 release notes (external JS runtime required).
  Touches: `astra_downloader/astra_downloader.py` (download pinned Deno portable zip from GitHub releases with SHA256 verification into `%LOCALAPPDATA%\AstraDownloader`, prepend to subprocess PATH), `astra_downloader/test_astra_downloader.py`, `/health` denoRuntime payload (`source: bundled|system`)
  Acceptance: On a machine without Deno, the companion offers/performs a one-click Deno provision; `/health.denoRuntime.installed` flips true without any manual install; yt-dlp subprocesses resolve the bundled runtime; checksum failure aborts cleanly.
  Complexity: M

### P2 — Observability / Developer Experience

(Visual regression testing moved to Roadmap_Blocked.md — requires headless browser environment.)

### P3 — Later / Under Consideration

- [ ] P3 — SharedAudio port to extension (MAIN world audio processing)
  Why: volumeBoost, skipSilence, audioNormalization, and audioEqualizer are userscript-only because they require MAIN world Web Audio API access. Tweaks for YouTube ships compressor, auto gain, and pan in-extension. The MAIN world bridge (`ytkit-main.js`) already exists for codec filtering.
  Evidence: CLAUDE.md "Not Yet Ported to Extension" section; Tweaks for YouTube features page lists advanced audio processing.
  Touches: `extension/ytkit-main.js` (MAIN world audio graph), `extension/ytkit.js` (data-attribute bridge), `extension/manifest.json`
  Acceptance: At least volumeBoost and audioNormalization work in the extension build via MAIN world bridge; feature toggles in settings panel.
  Complexity: XL

- [ ] P3 — Chrome Prompt API (Gemini Nano) for transcript Q&A
  Why: Chrome 138+ ships the Prompt API stable for extensions. Astra Deck already uses the Summarizer API for `localAiSummary`. The Prompt API would enable on-device transcript Q&A without BYO keys.
  Evidence: Chrome Prompt API docs; `extension/ytkit.js` already checks `window.Summarizer || window.ai?.summarizer`.
  Touches: `extension/ytkit.js` (new feature or enhancement to `localAiSummary`), settings schema
  Acceptance: When Prompt API available, user can ask questions about the current video's transcript; responses generated on-device; graceful fallback when unavailable.
  Complexity: M

- [ ] P3 — DeArrow submission and voting (write-side)
  Why: Astra Deck consumes DeArrow titles/thumbnails but cannot contribute or vote, so users who spot bad replacements have no recourse; the official DeArrow extension supports right-click submit and thumbs up/down voting.
  Evidence: github.com/ajayyy/DeArrow (submission/voting flow, requires a locally generated private userID); Astra Deck DeArrow integration is fetch-and-cache only.
  Touches: `extension/ytkit.js` (DeArrow UI: vote buttons on replaced titles, submit dialog), `extension/background.js` + `core/data-flow.js` (POST endpoints on sponsor.ajay.app, userID generation/storage with credential-scrub exemption review), privacy policy text
  Acceptance: Users can vote on a replaced title and submit a new title/timestamp thumbnail; the generated userID never leaves DeArrow requests and is excluded from settings exports; feature is off by default.
  Complexity: M

