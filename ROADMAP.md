# Roadmap — Astra Deck

## Research-Driven Additions (June 2026 Cycle 5)

### P2 — Quick Wins / Enhancement

- [ ] P2 — Subscription groups monolith peel
  Why: Subscription groups is the largest remaining inline feature cluster (~3K lines). It includes group CRUD, chip filtering, sort modes, digest panel, membership editor, CSV/JSON export/import, content-type filter, stale-channel detection, AI tags, and queue playback. Extracting it to `features/subscription-groups/index.js` continues the monolith decomposition.
  Evidence: Grep for `subscriptionGroup` in `extension/ytkit.js` — ~3K lines of inline code.
  Touches: `extension/features/subscription-groups/index.js` (new), `extension/ytkit.js` (delegation), `extension/manifest.json` (content_scripts), `sync-userscript.js` (V5_BUNDLE_MODULES)
  Acceptance: Subscription groups runtime extracted. Monolith delegates to factory with inline fallback. All existing tests pass plus 3+ new peel coverage tests.
  Complexity: L

- [ ] P2 — Digital wellbeing monolith peel
  Why: Digital wellbeing (~1.5K lines) handles watch time tracking, break reminders, daily limits, and statistics. It's self-contained and a clean peel candidate.
  Evidence: Grep for `digitalWellbeing` in `extension/ytkit.js`.
  Touches: `extension/features/digital-wellbeing/index.js` (new), `extension/ytkit.js`, `extension/manifest.json`, `sync-userscript.js`
  Acceptance: Digital wellbeing runtime extracted. Monolith delegates with inline fallback. Existing tests pass.
  Complexity: M

- [ ] P2 — Settings panel monolith peel
  Why: The in-page settings panel (~4K lines) handles rendering, search/filter, conflict management, and live sync. It's the second-largest remaining feature cluster and runs independently of other features.
  Evidence: Grep for `buildSettingsPanel\|_settingsPanel\|settingsPanelOpen` in `extension/ytkit.js`.
  Touches: `extension/features/settings-panel/index.js` (new), `extension/ytkit.js`, `extension/manifest.json`, `sync-userscript.js`
  Acceptance: Settings panel runtime extracted. Monolith delegates with inline fallback. Existing tests pass.
  Complexity: L

### P3 — Later / Under Consideration

- [ ] P3 — Firefox `sidebarAction` fallback for diagnostic dashboard
  Why: Chrome Side Panel diagnostic dashboard is Chrome-only. Firefox uses `sidebarAction` API (incompatible with `sidePanel`). Firefox users have no equivalent persistent diagnostic surface. A `sidebarAction` fallback would give Firefox users feature parity.
  Evidence: MDN sidebarAction docs; blog.mozilla.org/addons Firefox MV3 updates confirm no `sidePanel` adoption planned.
  Touches: `extension/manifest.json` (add `sidebar_action` for Firefox), new `extension/sidebar.html` + `extension/sidebar.js`, `scripts/manifest-patch.js` (add `sidebar_action` to Firefox builds)
  Acceptance: Firefox build includes a sidebar with the same diagnostic sections as Chrome's Side Panel. Chrome builds are unaffected.
  Complexity: L

- [ ] P3 — Video notes monolith peel
  Why: Video notes (~1K lines) handles per-video local note storage, export, and LRU eviction. Small and self-contained.
  Evidence: Grep for `videoNotes` in `extension/ytkit.js`.
  Touches: `extension/features/video-notes/index.js` (new), `extension/ytkit.js`, `extension/manifest.json`
  Acceptance: Video notes runtime extracted. Monolith delegates with inline fallback. Existing tests pass.
  Complexity: S

- [ ] P3 — Trust communication in README and store listings
  Why: Astra Deck's open-source audit trail, SBOM/attestation, credential scrub, profile-split permissions, and privacy policy are genuine differentiators — especially post-ShadyPanda (4.3M users compromised). These are not communicated in the README's feature list or any prospective store listing.
  Evidence: LayerX 2026 report (71% extensions lack privacy policies); ShadyPanda incident; Trust Wallet CWS key leak; RYD ad injection.
  Touches: `README.md` (trust/security section), store listing copy preparation
  Acceptance: README has a "Trust & Security" section listing: open-source, SBOM, attestation, no telemetry, credential scrub, profile-split permissions, external signing key, 26+ hardening passes. Concise — 5-8 bullet points.
  Complexity: S

- [ ] P3 — Focus preset for onboarding wizard
  Why: Unhook's 1M+ users prove "remove distractions" messaging converts far better than feature counts. Astra Deck has equivalent features (removeAllShorts, hideRelatedVideos, disableInfiniteScroll, Focused Mode, Zen Mode, Digital Wellbeing) but bundles them generically. Adding a "Focus" preset to the onboarding wizard would capture this audience.
  Evidence: Unhook CWS listing (1M+ users); existing presets are Privacy/Researcher/Power User.
  Touches: `extension/ytkit.js` (onboarding wizard preset definitions), `extension/_locales/*/messages.json`
  Acceptance: Onboarding wizard offers a 4th "Focus" preset that enables distraction-removal features. i18n keys added for all 11 locales.
  Complexity: S


## Research-Driven Additions

### P1 — Security / Reliability

- [ ] P1 — Native-messaging token bootstrap cutover
  Why: The companion still keeps HTTP `/health` token disclosure as the compatibility path; native messaging is already partially implemented and gives Chrome/Firefox a browser-pinned token channel.
  Evidence: `docs/native-messaging-token-bootstrap.md`, `astra_downloader/astra_downloader.py:5640`, `extension/background.js:944`, Chrome native messaging docs, MDN native messaging docs.
  Touches: `astra_downloader/astra_downloader.py`, `astra_downloader/test_astra_downloader.py`, `extension/background.js`, `extension/features/download-ui/index.js`, `build-extension.js`, companion installer/packaging scripts.
  Acceptance: Companion setup writes Chrome `allowed_origins` and Firefox `allowed_extensions` native-host manifests for configured extension IDs; the extension tries native messaging before `/health`; diagnostics expose `tokenSource: native|legacy`; `/health` no longer returns the auth token once native bootstrap succeeds; tests cover manifest shape, fallback, and malformed native messages.
  Complexity: L

- [ ] P1 — External crowd API health dashboard
  Why: SponsorBlock, DeArrow, and Return YouTube Dislike are high-value external dependencies with recurring YouTube/API breakage; current diagnostics do not expose per-service last-success, last-error, and degraded/fallback state.
  Evidence: SponsorBlock issues #2290/#2341, Return YouTube Dislike issue #1274, DeArrow release cadence, `extension/features/sponsorblock/index.js`, `extension/features/dearrow/index.js`, `extension/features/return-dislike/index.js`, `extension/core/diagnostic-log.js`.
  Touches: `extension/core/diagnostic-log.js`, `extension/core/data-flow.js`, `extension/features/sponsorblock/index.js`, `extension/features/dearrow/index.js`, `extension/features/return-dislike/index.js`, `extension/popup.js`, `extension/sidepanel.js`, tests.
  Acceptance: Popup/sidepanel diagnostics show SponsorBlock, DeArrow, and RYD status with last success, last error class, cache/fallback state, and request budget when relevant; Copy/Save diagnostic export includes the same summary; tests simulate 429, 5xx, network offline, invalid payload, and cached fallback cases.
  Complexity: M

### P2 — Research / Offline Workflow

- [ ] P2 — Transcript study batch export queue
  Why: AI transcript competitors win on playlist/batch workflows and structured study exports; Astra already has local transcript, search, and AI handoff primitives but no bounded multi-video queue.
  Evidence: Glasp, Eightify, NoteGPT, `extension/core/transcript-service.js`, `extension/core/storage-manager.js`, `extension/ytkit.js` transcript/search/export code.
  Touches: `extension/core/transcript-service.js`, `extension/core/storage-manager.js`, `extension/ytkit.js`, `extension/popup.js`, `extension/core/settings-schema.js`, tests.
  Acceptance: User can queue current playlist/channel visible videos for transcript fetch, see per-video pending/success/failure state, and export a Markdown + JSONL study pack with video metadata, transcript language, timestamps, and failure reasons; queue size and retry caps are enforced; no remote AI call or API key is required.
  Complexity: L
