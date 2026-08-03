# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

### Notes on existing tracked items

- `Roadmap_Blocked.md` "P2 — Side-panel toggles bypass optional-host permission + profile gating" is **partly stale**: `extension/sidepanel.js` now implements the gating (`requestOptionalHostsForToggle` at `:616-637`, called from the toggle handler at `:818`, which only writes when the grant succeeds). What remains blocked is the live-browser half — verifying that `chrome.permissions.request()` actually resolves from the side panel's user-gesture context. Narrow the item to that verification rather than re-implementing the gating.

- `Roadmap_Blocked.md` "P1 — Companion release EXE + SHA256 sidecar + clean-machine verification" is **half-unblocked as of 2026-08-02**: its stated blocker includes "maintainer GitHub authentication ... `gh auth status` reports the SysAdminDoc token is invalid", but `gh auth status` now reports a valid `SysAdminDoc` token with `repo` scope, and `gh release view v4.50.7` shows `AstraDownloader.exe` + `AstraDownloader.exe.sha256` already attached to that release. Only the clean-Windows-machine verification half remains blocked. Rewrite the blocker accordingly.

- `Roadmap_Blocked.md` "P2 — Competitor migration documentation" is **better supported now, not stale**: Iridium was archived 2026-01-31 (~1.3K stars, both store listings) and BlockTube is effectively stalled (last push 2026-02-07, 484 open issues, including a MV3 service-worker-suspension defect). Astra already ships BlockTube-grade filtering, so a BlockTube migration guide is the highest-yield addition to that item. No separate roadmap entry — extend the blocked one.

## Research-Driven Additions — 2026-08-02

Source evidence and rejected alternatives: `RESEARCH.md` (2026-08-02). Baseline at research time was fully green (1272 JS tests, 356 Python tests + 131 subtests, `npm audit` zero advisories at every severity, ESLint clean), so every item below is a latent gap rather than a broken gate. Does not duplicate the 28 items in `Roadmap_Blocked.md`.

### P0 — Delivery

### P1 — Correctness, security, and broken promises

- [ ] P1 — Add a Python swallowed-exception gate matching the JavaScript one
  Why: ESLint's `local/require-catch-reason` forces a `// reason:` comment on all 159 empty JS catches and reports zero issues, but the companion has ~28 bare `except: pass` with no equivalent enforcement. Beyond the cookie sites above, these hide watchdog and process-kill failures, so a stall watchdog that fails to kill a hung yt-dlp reports nothing at all.
  Evidence: `astra_downloader/download.py:216,225,238,240,273,283,287,294,296,300,1362,1367,1770,1830,2290`; `astra_downloader/config.py:553`; `astra_downloader/subscriptions.py:237`; `astra_downloader/astra_downloader.py:441,482,487`; `astra_downloader/gui.py:556,566,662,2210,3387,3440`; `eslint.config.js` + `scripts/eslint-rules/require-catch-reason.js`.
  Touches: new check script wired into `npm run check` (alongside `scripts/audit-python-deps.js`), the listed companion modules.
  Acceptance: `npm run check` fails on a `pass`-only `except` body in `astra_downloader/**` that lacks a `# reason:` comment; every existing site either gains a reason comment or is converted to log-and-continue; the process-kill and watchdog sites log at warning level.
  Complexity: M

- [ ] P1 — Close the i18n copy-gate holes on hardcoded user-visible strings
  Why: `npm run i18n:copy:gate` passes while several user-visible strings — including two screen-reader `aria-label`s — are hardcoded English. The gate is fingerprint/baseline-based rather than exhaustive, so it cannot catch a newly added literal, which means this recurs every time a feature adds UI.
  Evidence: `extension/ytkit.js:33359` (`'Remove Watched'` button text plus `aria-label` `'Remove all watched videos from Watch Later'`), `:25511` (`showToast('Open More actions on this card to save it manually.')`), `:24796` (`Scheduled for ${exactDate}` / `Published on ${exactDate}`, also copied into `aria-label` at `:24798`).
  Touches: `extension/ytkit.js`, `extension/_locales/en/messages.json` + `scripts/generate-locales.js` + manual `ar` / `zh_CN` backfill, `scripts/check-localizable-ui-copy.js`, `docs/i18n-coverage.md`.
  Acceptance: each listed string resolves through `t()`; the copy gate is extended to fail on any string literal assigned to `textContent`, `aria-label` or `title`, or passed as the first argument to `showToast`, that is not a `t()` call — with an explicit allowlist for brand and format names.
  Complexity: M

- [ ] P1 — Re-triage the eight items blocked only by a stale session constraint
  Why: eight of the 28 items in `Roadmap_Blocked.md` cite "this run explicitly forbids staging Markdown other than `README.md` and `CHANGELOG.md`" as their blocker. That is a self-imposed constraint from a prior pass, not a property of the work — every one of them is a normal localized-feature change this repo makes routinely. Leaving them filed as blocked hides real, ready work behind a false gate.
  Evidence: `Roadmap_Blocked.md` — dual-language subtitles, allowlist hiding mode, audio auto-gain + high-pass, enforced Shorts daily limit, hide-AI-surfaces pack, notification menu controls, comment intelligence pack, playlist power pack (`grep -c "forbids staging" Roadmap_Blocked.md` = 8).
  Touches: `Roadmap_Blocked.md`, `ROADMAP.md`.
  Acceptance: each of the eight is either moved back to `ROADMAP.md` at its original priority, or its `Blocker:` line is rewritten to state a real, current blocker. No item retains the Markdown-staging justification.
  Complexity: S

- [ ] P1 — Raise companion auto-start retry budgets above the documented cold-start time
  Why: `CLAUDE.md` records that a cold 40 MB one-file companion start takes ~12 s. The main download path was bumped to `tryAutoStart(8)` (~12 s), but the default is still `4` (~6 s) and every user-facing recovery path passes `5` (~7.5 s) — so the "try starting the server again" button gives up before a cold start can finish and reports failure on a companion that was about to come up.
  Evidence: `extension/features/download-ui/index.js:428` (default `4`), `:639`, `:696`, `:1184` (recovery paths passing `5`), `:1154` (main path `8`); `extension/ytkit.js:43347`.
  Touches: `extension/features/download-ui/index.js`, `extension/ytkit.js` fallback twin, `tests/download-health-boundary.test.js`.
  Acceptance: a single named constant expresses the cold-start budget and every recovery call site uses it; the `likelyNeverInstalled ? 2 : 8` fast path is preserved; a test pins that no recovery call site polls for less than the cold-start budget.
  Complexity: S

### P2 — Locale fidelity, capability, and maintainability

- [ ] P2 — Replace English exact-match `aria-label` selectors with structural hooks, and gate against new ones
  Why: roughly 60 shipped selectors match English `aria-label` text exactly, so the features behind them are dead on every non-English YouTube UI. The watch-action button map alone silently disables nine element-manager toggles for non-English users. Without a gate the count grows with every feature.
  Evidence: `extension/ytkit.js:16381-16387` (Share/Ask/Clip/Thanks/Save/More actions map), `:8437-8441` (`_buttonAriaLabels`), `:15347-15360` (14 "Jump ahead" selectors), `:26915-26951` (consent dialogs), `:33087-33610` (Watch Later workbench), `:19428`, `:22580`, `:28644`; `extension/features/home-subs-css/index.js:25`; `extension/features/subscription-groups/index.js:595,643,644,1382`. The live-chat "Popout chat" case is already tracked in `Roadmap_Blocked.md` — exclude it.
  Touches: `extension/core/selector-packs/*`, `extension/ytkit.js`, the listed feature modules, `scripts/check-i18n.js` or a new gate, `tests/selector-regression.test.js`.
  Acceptance: selectors resolve through `core/selectors.js` packs using renderer tags, `data-*` attributes or DOM position, with English text only as a last-resort fallback that records a selector-health miss; a check gate fails on a new `[aria-label="..."]` / `[aria-label*="..."]` literal in shipped feature code outside the pack layer.
  Complexity: L

- [ ] P2 — Audio sync offset on the existing MAIN-world audio graph
  Why: the most-requested open enhancement on Enhancer for YouTube, and Astra already owns every prerequisite — a single shared `AudioContext` with `createMediaElementSource`, gain, compressor and stereo-panner nodes, plus a WeakMap-cached reconnect path across SPA navigation. Adding audio delay is one `createDelay` node in a graph that is already built, tested and reconnect-safe.
  Evidence: `extension/ytkit-main.js:499-594` (graph construction; no `createDelay`); Enhancer for YouTube open enhancement "Audio Sync Adjustment" (2026-06-09), https://github.com/YouTube-Enhancer/extension/issues.
  Touches: `extension/ytkit-main.js`, `extension/core/audio-track.js`, `extension/core/settings-schema.js`, `extension/_locales/*`, `docs/i18n-coverage.md`.
  Acceptance: an off-by-default offset (range roughly -500 ms to +500 ms) applies live without restarting playback, survives two SPA navigations without double-connecting the graph, and returns to zero added latency when set to 0.
  Complexity: M

- [ ] P2 — Single-source the companion port list
  Why: the six loopback ports are declared independently in four places, so adding or changing a fallback port requires four coordinated edits with no gate connecting them. A partial edit produces a companion listening on a port the extension has no host permission for — a silent, hard-to-diagnose total download failure.
  Evidence: `astra_downloader/astra_downloader.py:222` (`PORT_FALLBACKS`), `astra_downloader/config.py:91,493`, `extension/manifest.json` host_permissions + CSP `connect-src`, `build-extension.js:89-95`.
  Touches: `scripts/catalog-utils.js` or a new shared catalogue, `build-extension.js`, `extension/manifest.json` generation, `astra_downloader/config.py`, `tests/hardening.test.js`.
  Acceptance: one declaration drives the manifest host_permissions, the CSP `connect-src`, the build-profile catalogue and the extension-side probe list; a test fails if the companion's Python port list and the generated manifest disagree.
  Complexity: M

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
