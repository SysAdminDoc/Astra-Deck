# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

### Notes on existing tracked items

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.

- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope, and `gh release view v4.50.7` shows `AstraDownloader.exe` + `AstraDownloader.exe.sha256` already attached to that release. Only the clean-Windows-machine verification half remains blocked. Rewrite the blocker accordingly.

- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (~1.3K stars, both store listings) and BlockTube is effectively stalled (last push 2026-02-07, 484 open issues, including a MV3 service-worker-suspension defect). Astra already ships BlockTube-grade filtering, so a BlockTube migration guide is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.

## Research-Driven Additions — 2026-08-02

Source evidence and rejected alternatives: `RESEARCH.md` (2026-08-02). Baseline at research time was fully green (1272 JS tests, 356 Python tests + 131 subtests, `npm audit` zero advisories at every severity, ESLint clean), so every item below is a latent gap rather than a broken gate. Does not duplicate the 28 items in `Roadmap_Blocked.md`.

### P0 — Delivery

### P2 — Locale fidelity, capability, and maintainability

- [ ] P2 — Dedicated behavioural tests for the download and subscription-groups modules
  Why: `extension/features/download-ui/index.js` (2,818 lines) is the entire download path — port probing, foreign-server detection, auto-start, format selection, recovery classification — and is covered only by the adjacent `tests/download-health-boundary.test.js`. `extension/features/subscription-groups/index.js` (2,453 lines) has no dedicated file. Commit history shows the companion and download path are the most fix-prone areas in the repo.
  Evidence: `tests/` contains 89 files / 1272 tests with no `download-ui` or `subscription-groups` suite; `git log` over the last 400 commits shows `companion` as the highest-frequency `fix(...)` scope.
  Touches: new `tests/features/download-ui.test.js` and `tests/features/subscription-groups.test.js`.
  Acceptance: the download suite covers port-probe fallback ordering, foreign-server detection and its repair copy, auto-start retry budgets, and each `error_code` recovery branch; the subscription-groups suite covers group CRUD, membership editing, sort modes, and JSON/OPML import counters including the duplicate path.
  Complexity: M

- [ ] P2 — Client-side "mark as watched"
  Why: users want to clear a card from feeds without playing it; YouTube offers no such control, and the existing Hide Watched Videos feature can only read YouTube's own progress overlay. This is a recurring feed-hygiene request and fits the existing hidden/allowed-video storage and Undo pattern exactly.
  Evidence: Enhancer for YouTube feature request 2026-03-09, https://github.com/YouTube-Enhancer/extension/issues; PocketTube ships watched-marking, https://pockettube.io/.
  Touches: `extension/features/video-hider/index.js` (card overlay + storage), `extension/core/persisted-domains.js` (new durable domain with LRU cap), `extension/core/settings-schema.js`, `extension/_locales/*`.
  Acceptance: an off-by-default toggle adds a per-card mark-watched control; marked videos dim or hide per the existing Hide Watched Videos mode setting; the store is capped and LRU-evicted like the other video stores, is included in export/import, and every mark is undoable through the existing toast.
  Complexity: M

- [ ] P2 — Bulk unsubscribe from inactive channels
  Why: Astra already stages stale channels — `_extractCardAgeDays`, `subscriptionUnsubscribeStagingData` with a 30-day `undoUntil`, and Scan/Stage/Undo actions — but stops short of performing the unsubscribe, so the workflow dead-ends. PocketTube's equivalent is a headline differentiator at 250K+ users.
  Evidence: `extension/ytkit.js:37291-37298` (staging), `extension/ytkit.js:3456` (`subscriptionUnsubscribeStagingData` shape); PocketTube v18.7.1, https://pockettube.io/.
  Touches: `extension/features/subscription-groups/index.js`, `extension/ytkit.js` staging runtime, `extension/_locales/*`.
  Acceptance: staged channels can be unsubscribed in a bounded session reusing the `bulkCardActions` pattern (25 per run, 400 ms pacing, local log, JSON export); the action operates only on the reviewable staged list, records every removal in the existing recovery log, and is a no-op when the staging list is empty.
  Complexity: M

- [ ] P2 — Budget and gate content-script startup cost
  Why: `manifest.json` content-script entry 3 injects ~96 files into every YouTube page at `document_idle` with no measured budget, benchmark or regression gate. High CPU and post-update slowdown are among the most common review complaints for every competitor in this class, and the repo currently has no way to notice a regression.
  Evidence: `extension/manifest.json` content_scripts entry 3; `extension/ytkit.js` 52,883 lines; RESEARCH.md 2026-08-02 §Architecture Assessment.
  Touches: `scripts/smoke-mv3-worker-lifecycle.js` or a new bench script, `tests/long-session.test.js`, `npm run check`.
  Acceptance: a headless benchmark reports parse+init time and first-feature-paint against the existing fixture page and writes a tracked baseline; `npm run check` fails when the measured budget regresses beyond a stated tolerance.
  Complexity: M

- [ ] P2 — Move injected overlays to the Popover API with CloseWatcher
  Why: Astra's overlays fight YouTube for stacking context — the toast z-index had to be raised to `2147483647` and the settings panel forces `2147483646` — which is a losing arms race. The Popover API renders in the top layer and is Baseline (newly available 2025-01-27); `CloseWatcher` gives one consistent Esc/back close path. The existing headless `smoke-settings-overlay.js` harness can verify this without a live browser.
  Evidence: `extension/ytkit.js` `Z.TOAST` and settings-panel z-index forcing; https://webstatus.dev (Popover API Baseline 2025-01-27; CloseWatcher Chrome 126 / Firefox 149).
  Touches: `extension/core/toast-dom.js`, `extension/core/toast.js`, `extension/ytkit.js` settings panel, `extension/features/settings-panel/index.js`, `scripts/smoke-settings-overlay.js`.
  Acceptance: settings panel, toasts and the download-options popup render as popovers, with a non-popover fallback retained for the userscript vehicle; the rendered overlay smoke passes in all existing states plus a stacking state that previously required the maximum z-index; `CloseWatcher` handles Esc where available with the current key handler as fallback.
  Complexity: L

- [ ] P2 — Dual-language subtitles
  Why: A second independently selected caption track is valuable for language learners but must be explicitly enabled and configured.
  Evidence: YtDLS (CY Fung), Youtube dual subtitle (0xjax), vanadis bilingual persist.
  Touches: timedtext track fetch, subtitle renderer/styling pipeline, settings schema/locales.
  Acceptance: An opt-in second caption track renders below native captions with an independent language picker and clean unavailable-track fallback.
  Complexity: M

- [ ] P2 — Allowlist hiding mode
  Why: Inverse channel filtering needs a deliberate mode control and an empty-list safety guard to avoid hiding all of YouTube accidentally.
  Evidence: BlockTube issue #133; FocusTube HN subscriptions-only demand.
  Touches: `extension/features/video-hider/`, settings schema/locales, blocked/allowed channel storage.
  Acceptance: An explicitly labelled mode toggle switches home/search/related filtering to allowlist semantics; card and settings management remain recoverable.
  Complexity: M

- [ ] P2 — Audio chain completion: auto-gain + high-pass
  Why: Astra already implements compressor-backed `audioNormalization`; the remaining independently selectable nodes are auto-gain and high-pass filtering.
  Evidence: Tweaks for YouTube feature set; `extension/ytkit-main.js` audio graph and `audioNormalization` setting.
  Touches: MAIN-world audio graph, isolated-world bridge, settings schema/locales.
  Acceptance: Auto-gain and high-pass nodes toggle independently with sane defaults, live-apply, and never double-connect across SPA navigation.
  Complexity: M

- [ ] P2 — Enforced Shorts daily limit
  Why: A Shorts-specific budget and hard-block/snooze policy are distinct from the existing all-video `dwDailyCapMin` setting.
  Evidence: TechCrunch 2025-10-22 Shorts timer coverage; Shorts Addiction Helper scripts; `extension/features/digital-wellbeing/`.
  Touches: digitalWellbeing runtime, Shorts route detection, settings schema/locales.
  Acceptance: Users configure daily Shorts minutes and hard-block versus five-minute snooze; usage resets at local midnight and the block is accessible.
  Complexity: M

- [ ] P2 — Hide AI surfaces pack
  Why: Independent controls are needed because Ask, Gemini, AI summaries, and context panels are separate surfaces with different user value.
  Evidence: Control Panel for YouTube; Remove YouTube Gemini buttons; Youtube without fact checking.
  Touches: `extension/early.css`, CSS feature registrations, selector packs, settings schema/locales.
  Acceptance: Independent toggles hide each verified surface with capture-backed selector canaries.
  Complexity: S

- [ ] P2 — Notification menu controls: cap count + hide read
  Why: Count and read-state filtering are user-selected policies, not safe unconditional behavior under chronological sorting.
  Evidence: competitor notification options; `chronologicalNotifications` in `extension/ytkit.js`.
  Touches: chronologicalNotifications runtime, settings schema/locales.
  Acceptance: Independent options cap rendered notifications and hide read entries without observer/re-render loops.
  Complexity: S

- [ ] P2 — Comment intelligence pack
  Why: Language selection and duplicate expansion need discoverable controls; the existing `commentFilterRules` textarea already persists `@author` block rules but its localized contract does not cover language or duplicate behavior.
  Evidence: YouTube Comment Language Filter (GF 558814), Similar Comments Hider (hjk789), user-block scripts; `commentFilterManager` in `extension/ytkit.js`.
  Touches: comment filter runtime, settings-panel controls, settings schema/locales.
  Acceptance: A localized language allowlist hides other-language comments without network access; near duplicates collapse under an accessible expander; author blocks persist and remain manageable.
  Complexity: M

- [ ] P2 — Playlist power pack
  Why: Duration sorting, per-playlist resume, and auto-skip-watched are user-selected actions/policies that need clear accessible controls in the existing Playlist Enhancer toolbar.
  Evidence: Sort Youtube Playlist by Duration (KohGeek), playlists playback tracker (andrybak), Playlist Auto Skip Watched (neverlandeverland).
  Touches: playlistEnhancer runtime, resume storage, settings/localized UI copy.
  Acceptance: The playlist panel offers duration sort and last-video resume; an explicit persisted option auto-skips entries watched at least 90%.
  Complexity: M

### P3 — Under consideration

- [ ] P3 — Parametric EQ on the audio graph
  Why: rounds out the audio chain alongside the auto-gain/high-pass work currently in `Roadmap_Blocked.md` and the audio-sync item above; a `BiquadFilterNode` chain reuses the same reconnect-safe graph. Lower value than audio sync — cited by one competitor (Zenith), not a recurring request.
  Evidence: `extension/ytkit-main.js:586-594` (no `createBiquadFilter`); https://alternativeto.net/software/iridium-by-particlecore/.
  Touches: `extension/ytkit-main.js`, `extension/core/audio-track.js`, settings schema and locales.
  Acceptance: an off-by-default 3-to-5-band EQ applies live, never double-connects across SPA navigation, and is bypassed (not merely flat) when disabled.
  Complexity: M

- [ ] P3 — SponsorBlock segment submission and voting
  Why: Astra reads the SponsorBlock commons (`skipSegments` GET only) with no path to contribute, and reviewers of competing tools repeatedly ask for a local correction path when a segment is wrong. DeArrow voting and casual mode are already shipped, so the UI precedent exists.
  Evidence: `extension/features/sponsorblock/index.js:242-306` (read-only); `extension/ytkit.js` `deArrowVoting` / `casualMode` precedent; https://github.com/ajayyy/SponsorBlock/issues.
  Touches: `extension/features/sponsorblock/index.js`, `extension/core/credential-vault.js` or a new durable domain for the private user ID, `extension/core/data-flow.js`, settings schema and locales.
  Acceptance: off by default and GitHub-full only; a locally generated private user ID is stored in a backup-excluded, scrub-covered domain; voting works before submission is enabled; every write is rate-budgeted and surfaces failures through `external-api-health`.
  Complexity: L
  Note: gated on the Open Question in `RESEARCH.md` — whether Astra should carry submission at all, versus voting only. Decide that before implementing.

- [ ] P3 — Adopt the Navigation API for SPA route detection
  Why: route detection currently hooks `yt-navigate-finish`, `yt-page-data-updated`, `popstate` and `video-id` attribute changes — four YouTube-specific signals that have each broken before. The Navigation API became Baseline on 2026-01-13 and gives a platform-owned, YouTube-independent signal.
  Evidence: `extension/core/navigation.js`; https://webstatus.dev (Navigation API, newly available 2026-01-13).
  Touches: `extension/core/navigation.js`, `tests/long-session.test.js`.
  Acceptance: the Navigation API drives route dispatch where available, with the existing YouTube-event path retained as fallback; `tests/long-session.test.js` still passes its 1000-cycle observer and cleanup assertions under both paths.
  Complexity: M

- [ ] P3 — List (row) feed layout
  Why: the single most-upvoted open request on ImprovedTube. Astra ships Compact Layout, Videos Per Row and Dense Mode, which tune the grid but do not offer a row layout with metadata beside the thumbnail — a genuinely different information density, not a smaller grid.
  Evidence: https://github.com/code-charity/youtube/issues/3593 (19 reactions); `extension/features/home-subs-css/index.js` and `denseMode` cover grid density only.
  Touches: `extension/features/home-subs-css/index.js`, `extension/early.css`, settings schema and locales.
  Acceptance: an off-by-default layout renders home, subscriptions and search cards as rows with thumbnail-left / metadata-right, survives Polymer re-render, and is mutually exclusive with Videos Per Row through `CONFLICT_MAP`.
  Complexity: M

- [ ] P3 — Per-participant blocking on multi-uploader cards
  Why: a card crediting two or more channels evades per-channel blocking entirely, so a blocked channel reappears whenever it collaborates. Astra can hide collaborations wholesale but cannot block one participant. Filed against BlockTube 2026-07-17 and unfixed there.
  Evidence: https://github.com/amitbl/blocktube/issues; `extension/features/video-hider/index.js` `_isChannelBlocked` matches a single channel identity key per card.
  Touches: `extension/features/video-hider/index.js` (channel extraction + `_channelKeyCache`), `extension/ytkit.js` twin, `tests/features/video-hider.test.js`.
  Acceptance: channel extraction returns every credited channel for a card; the card is hidden when any credited channel is blocked; the existing precomputed key-set lookup stays O(1) per card and the allowlist override still wins.
  Complexity: M

- [ ] P3 — Buffer / preload control
  Why: a long-standing request on ImprovedTube; playback stalls on constrained connections are a recurring complaint and YouTube exposes no user control.
  Evidence: https://github.com/code-charity/youtube/issues/581 (13 reactions).
  Touches: `extension/ytkit-main.js` (MAIN-world player bridge), settings schema and locales.
  Acceptance: an off-by-default control raises the player's buffer target where the player API allows it, no-ops with a recorded degradation reason when the expected API shape is absent, and never changes behaviour on live streams.
  Complexity: M
