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

- [ ] P3 — CSS Anchor Positioning for tooltip/popover UI
  Why: CSS Anchor Positioning reached Baseline 2026 (Chrome 125+, Firefox 147+, Safari 26+). Astra Deck's tooltips, popovers, and contextual panels currently use JavaScript-based positioning. Migrating to native CSS anchoring eliminates JS calculation overhead and improves maintainability.
  Evidence: css-tricks.com/interop-2026 (Baseline 2026); `extension/ytkit.js` uses absolute positioning + getBoundingClientRect for download popup, speed popup, settings panel tooltips.
  Touches: `extension/ytkit.js` (replace JS positioning with CSS anchor-name/position-anchor), `extension/popup.css` (anchor-positioned tooltips), `extension/early.css`
  Acceptance: All extension-injected tooltips and popovers use CSS Anchor Positioning; JS positioning fallback for browsers below the baseline; no visual regression.
  Complexity: M


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

- [ ] P3 — Threaded comment DOM adaptation
  Why: YouTube rolled out threaded comments (up to 3 nesting levels) with red visual thread connectors and voice replies (Jan–March 2026). Comment-manipulating features (`commentSearch`, `commentNavigator`, `sortCommentsNewest`, `commentEnhancements`, `creatorCommentHighlight`) may not account for nested reply structure.
  Evidence: socialmediatoday.com (YouTube comment threading rollout Jan–March 2026); SponsorBlock v6.1.3 changelog noted "fixes for YouTube layout changes" in this period; `core/selector-packs/comments.js` covers comment DOM selectors.
  Touches: `extension/ytkit.js` (comment features: verify nesting-level traversal), `core/selector-packs/comments.js` (add selectors for threaded reply containers if missing), `tests/features/` (regression tests)
  Acceptance: `commentSearch`, `commentNavigator`, `sortCommentsNewest` work correctly with threaded 3-level nested comments. No broken layouts on voice-reply comment elements.
  Complexity: M
