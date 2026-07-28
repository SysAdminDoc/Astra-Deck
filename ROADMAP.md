# Roadmap - Astra Deck

Blocked / operator-gated work lives in `Roadmap_Blocked.md`.

## Deep-audit backlog — 2026-07-23 (verified, unfixed)

- [ ] P2 — Popup Export/Import/Reset degrade gracefully without a YouTube tab
  Why: all three hard-require a responsive content script for the transcript/page snapshot — with zero YouTube tabs the storage-corruption banner's advertised "Reset to recover" path is wedged.
  Where: extension/popup.js (readAllTranscriptRecords, createCoordinatedSnapshot, sendPersistedDataMessage)
- [ ] P2 — Localize the remaining raw-English in-page surfaces
  Why: subscription digest/health center, video-notes, the downloader install/repair prompt, and the bulk-actions bar are English-only on an 11-locale product; the install prompt even mixes languages with its localized toasts. Companion yt-dlp/update status strings in popup.js bypass t() with an ASCII "->", and toast chrome ("Done", "Undo", "Dismiss notification") is hardcoded.
  Where: extension/features/subscription-groups/index.js, features/video-notes/index.js, features/download-ui/index.js:414-576, extension/ytkit.js (bulk bar), extension/popup.js:4291-4338, extension/core/toast-dom.js
- [ ] P2 — Make toast-only Undo reachable from the settings panel focus trap
  Why: panel-triggered destructive actions point at a toast Undo that Tab can never reach while the trap is active (toasts mount outside the dialog); auto-dismiss makes recovery mouse-only.
  Where: extension/features/settings-panel/index.js (trapFocusWithin), extension/core/toast-dom.js
- [ ] P3 — Settings section Reset/Undo must cover settingKey-keyed values and refresh non-checkbox controls
  Why: ~23 features store under settingKey ≠ id (uiStyle, colorTheme, customCssCode…) — section reset/undo skips them entirely and selects/ranges/colors keep stale UI after an id-keyed reset.
  Where: extension/features/settings-panel/index.js:1817-1869 + ytkit.js twin
- [ ] P3 — Settings search un-dims inert sub-features of disabled parents
  Why: matching sub-feature cards look enabled during search but ignore clicks (inert + disabled stay set while opacity is cleared).
  Where: extension/features/settings-panel/index.js:2878-2881 + twin
- [ ] P3 — Await the settings-import rollback/undo restore writes
  Why: restore fires 7 setSync calls and reports rolledBack/ok on the synchronous return — the exact storage-failure class that triggered the rollback can silently fail it (apply() was fixed in v4.49.6; restore was not).
  Where: extension/core/settings-import-transaction.js:46-97, ytkit.js:4072-4080
- [ ] P3 — Theater Split: recompute player width when collapsed-state resize precedes fullscreen exit
  Why: fullscreen exit re-fixes the player at a stale snapshot px width; the resize observer is disconnected while collapsed so a window resize never corrects it until the next expand.
  Where: extension/features/sticky-video/index.js (_fullscreenHandler restore arm) + twin
- [ ] P3 — persistentQueue cross-tab coherence
  Why: the panel renders only from local writes (stale indexes remove the wrong item after another tab edits the queue) and two tabs ending videos concurrently can shift() the same head.
  Where: extension/ytkit.js (persistentQueue _read/_write/_removeAt)
- [ ] P3 — WL workbench _removeRow should verify the menu item belongs to the row
  Why: the shared iron-dropdown retains the previous row's endpoints during slow rebinds; a fixed 120ms wait can click the stale entry and miscount.
  Where: extension/ytkit.js (_removeRow)
- [ ] P3 — digital-wellbeing: reconcile per-tab watch-time accumulators
  Why: two playing tabs clobber each other's daily total (last save wins), undercounting the daily cap; tab close also drops up to 29s (no pagehide flush).
  Where: extension/features/digital-wellbeing/index.js:62-69, 206
- [ ] P3 — Locale-independent selectors for live-chat popout / subscribe tooltip and home-subs hideCreateButton
  Why: aria-label/text matches are English-only, so these toggles silently no-op on the 10 non-EN locales.
  Where: extension/features/live-chat/index.js:20,163-166, features/home-subs-css/index.js:19
- [ ] P3 — subscription-groups import should merge (or offer merge) instead of replace-all
  Why: importing any file deletes every group not present in it with only a 6s toast Undo as recovery.
  Where: extension/features/subscription-groups/index.js:2193-2204
- [ ] P3 — subscription-view order mode is silently dead when the groups toolbar exists
  Why: applyOrder() early-returns when .ytkit-sub-toolbar is present and nothing reimplements ordering — the persisted setting is ignored with no hint.
  Where: extension/features/subscription-view/index.js:197,257
- [ ] P3 — chat-style-comments: skip fully-processed comments in processAllComments
  Why: every mutation batch re-runs ~30 inline style writes per comment across the whole thread (500 comments re-styled to add 20).
  Where: extension/features/chat-style-comments/index.js:1154-1330
- [ ] P3 — api-limiter: wire consumers or drop it from the manifest bundle
  Why: shipped dead code loaded on every page; its bucket also wedges permanently on a never-settling task and serializes regardless of capacity.
  Where: extension/core/api-limiter.js, manifest content_scripts
- [ ] P3 — predicate-sandbox: align ! precedence with JavaScript (or document it)
  Why: !ctx.a === true parses as !(ctx.a === true), diverging from JS for user-authored predicates that deliberately look like JS.
  Where: extension/core/predicate-sandbox.js:231-247
- [ ] P3 — Theming coherence backlog: light-theme cards for subscription digest/health/members/create-group dialog; a corner-stacking registry for bottom-right fixed UI (queue pill vs reaction launcher vs bulk bar vs shorts chip); accent consolidation onto --ytkit-accent-rgb (orange/purple/blue drift); Roboto for inline-in-YouTube surfaces; cap split-mode dropdown and AI-summary z-index below the settings modal; remaining physical margins → logical (subscription-groups chips/badges, return-dislike, queue thumbnail button).
  Where: extension/features/subscription-groups/index.js, extension/ytkit.js (Z table consumers, aisum panel, queue), features/return-dislike/index.js
- [ ] P3 — Companion: cover the cookie-less live-retry path with tests and dedupe its ~140 cloned lines
  Why: the retry path duplicates the watchdog/parse loop with zero test coverage (cookie stripping, watchdog rebinding, failure classification unasserted).
  Where: astra_downloader/download.py:1253-1440
- [ ] P3 — Video Insights: distinguish degraded fetches from "not published"
  Why: rate-limited/failed InnerTube fetches render "Not provided" identically to genuinely absent data.
  Where: extension/features/video-insights/index.js:204-268,347-363
- [ ] P3 — Microcopy normalization pass: "…" vs "...", em-dash vs spaced hyphen, digest empty-state pointing at the + Group control, disabled Mark-read explanation, dedicated sidepanel keys instead of reused toggle/download keys
  Where: extension/_locales/en/messages.json, extension/sidepanel.html:50,118,126, features/subscription-groups/index.js:1081,1110-1114

## Research-Driven Additions — 2026-07-09 (userscript competitive sweep)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-09). Extension-first; userscript parity intentionally excluded. Every mutation feature must reuse the bulkCardActions bounded-session + Undo pattern and external-api-health degradation surfaces.

### P1 — root-cause reliability + highest-demand gaps

### P2 — live tooling, subtitles, filtering, hygiene

### P3 — insights, hygiene, and smaller bets
## Research-Driven Additions

### P0 — Now: lockout, data integrity, and vulnerable floors

### P1 — Next: recoverable runtimes, releases, and shared state

### P2 — Later: boundary fidelity, localization, and enforceable filtering

### P3 — Under consideration: validated viewer differentiators

## Research-Driven Additions — 2026-07-14 post-hardening refresh

### P0 — Release and workstation safety

### P1 — Security, data safety, and runtime correctness

### P2 — Resilience, accessibility, and maintainability

## Deep-audit backlog — 2026-07-15 (verified, unfixed)

## Deep-audit backlog — 2026-07-20 (companion pass, verified, unfixed)

## Research-Driven Additions — 2026-07-20 (competitive + yt-dlp ecosystem sweep)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-20). Most competitor breadth is already shipped; these are the verified remaining gaps. Extension features reuse the external-api-health/degradation-surface pattern with per-feature auto-disable-on-DOM-miss.

### P3 — Hardening + small verified viewer gaps

## Research-Driven Additions — 2026-07-21 (client-fallback validation delta)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-21). Validates the token-exempt fallback shipped 2026-07-21.

### P3 — Degradation UX

- [ ] P3 — Nudge to install a PO-token provider when an exempt-chain download degrades or fails
  Why: no token-free client covers the full catalog at full quality — `tv` fails `LOGIN_REQUIRED` on age-gated/members content, `android_vr` fails kids/age-gated, `web_embedded` only covers embeddable videos; when a download on the exempt chain fails or falls back to a low format, the user has no guidance that a PO-token provider would fix it. The dashboard "PO provider: Fallback" row is passive.
  Evidence: RESEARCH.md 2026-07-21 §Security/Reliability (inherent coverage gap); yt-dlp issues #15583, #15780; `astra_downloader/download.py` failure-classification path (`classify_download_failure`, `error_advice`).
  Touches: `astra_downloader/download.py` (map LOGIN_REQUIRED/UNPLAYABLE/format-degraded outcomes to advice), companion download-card `error_advice` surface, popup health banner.
  Acceptance: when a YouTube download fails with a sign-in/age-gate/UNPLAYABLE class or completes with only a 360p muxed format while no provider is running, the error/advice line explicitly suggests installing a PO-token provider; unchanged when a provider is live.
  Complexity: M

## Research-Driven Additions — 2026-07-27 (Astra Downloader companion deep research)
Source evidence and rejected alternatives: RESEARCH.md (2026-07-27, companion-scoped). No P0 — the companion is well-hardened; these are reliability/capability/UX gaps. Does not duplicate the companion items already in `Roadmap_Blocked.md` (bgutil auto-provision, playlist bounding, /health token echo, unauth /health log leak, license route, release assets, Chrome-LNA validation, cookie-domain tightening, native-host handshake).

### P1 — Next: freshness, transport survivability, real format choice

### P2 — Later: expose the knobs yt-dlp already has + GUI truthfulness/robustness

- [ ] P2 — Clip / section download via ffmpeg re-cut
  Why: clipping a slice is a popular request (Stacher trim sliders); Parabolic deliberately uses an ffmpeg re-cut instead of yt-dlp `--download-sections` because the native flag is inaccurate.
  Evidence: RESEARCH.md §Competitive; https://github.com/NickvisionApps/Parabolic/releases
  Touches: `astra_downloader/download.py` (optional start/end → ffmpeg re-cut post-step), `routes.py` `/download` body (`section: {start,end}`), extension/GUI trim UI.
  Acceptance: a download with a start/end range produces an accurately trimmed file; omitting the range is unchanged.
  Complexity: M

- [ ] P2 — Playlist preview + `--playlist-items` subset selection
  Why: today a playlist URL is all-or-nothing; users want to see items and pick a subset before enqueue (MeTube/Parabolic/4K). Complements the tracked `Roadmap_Blocked.md` "Bound companion playlist downloads" safety item — this is the feature half.
  Evidence: RESEARCH.md §Competitive; `astra_downloader/download.py:1120` (`--yes-playlist`, no item control).
  Touches: `routes.py` (new `POST /playlist` → `--flat-playlist` preview), `download.py` (`--playlist-items` passthrough, validated), extension playlist UI.
  Acceptance: `POST /playlist {url}` returns the item list without downloading; a download can specify a validated item range; unbounded playlist behavior stays gated by the existing safety cap.
  Complexity: M

- [ ] P2 — Diff/patch the GUI download list instead of full teardown
  Why: `_update_ui` deletes and recreates every card via `_clear_layout` on each content-signature change at up to 2 Hz, destroying scroll position and focus and churning widgets.
  Evidence: RESEARCH.md §Architecture; `astra_downloader/gui.py:1797` (`_clear_layout` rebuild), `gui.py:1742` (`_update_ui`).
  Touches: `astra_downloader/gui.py` (`_update_ui`/`_download_card` → keyed reconciliation).
  Acceptance: updating one download's progress mutates only that card; scroll position and keyboard focus survive a refresh.
  Complexity: M

### P3 — Under consideration: breadth, coherence, and larger bets

- [ ] P3 — Companion GUI accessibility pass
  Why: status is conveyed by color-only dots, the log `QTextEdit` and the dashboard state dot have no accessible names, inline hardcoded hex greys risk sub-4.5:1 contrast, and the page fade ignores reduced-motion — the GUI's a11y lags the extension's WCAG-gated surfaces.
  Evidence: RESEARCH.md §Architecture (GUI robustness); `astra_downloader/gui.py` (status dots ~L934/L1042, log QTextEdit ~L1136, inline hex ~L792-826, page fade `_animate_page` ~L1489).
  Touches: `astra_downloader/gui.py` (accessible names on dots/log, text+icon status not color-alone, centralize colors + contrast audit, honor `prefers-reduced-motion`).
  Acceptance: every status indicator exposes an accessible name and a non-color cue; the log and state dot are screen-reader nameable; readiness/text colors meet 4.5:1; the fade is skipped under reduced-motion.
  Complexity: M

- [ ] P3 — Clipboard link-grabber (paste YouTube URLs straight into the app)
  Why: lets users download without the extension (e.g. links from chat/email); the link-grabber is JDownloader/Stacher's signature capture UX.
  Evidence: RESEARCH.md §Competitive; https://jdownloader.org
  Touches: `astra_downloader/gui.py` (opt-in persistent clipboard watcher → detected YouTube URLs staged for confirm), `config.py` (toggle).
  Acceptance: with the opt-in on, copying a YouTube URL surfaces a stage-to-download prompt; off by default; ignores non-YouTube clipboard content.
  Complexity: M

- [ ] P3 — aria2c external-downloader option
  Why: aria2c splits fragmented streams into many parallel connections for large speed gains on big/segmented media (Seal ships it); the app has only native download + concurrent fragments.
  Evidence: RESEARCH.md §Competitive; https://github.com/JunkFood02/Seal
  Touches: `astra_downloader/download.py` (`--external-downloader aria2c --downloader-args`), provisioning + checksum verify (mirror the Deno provisioner), `config.py`, `health.py` readiness row.
  Acceptance: enabling aria2c provisions/verifies the binary and routes downloads through it; disabled keeps native download; a missing/failed aria2c falls back with clear advice.
  Complexity: L

- [ ] P3 — Companion GUI i18n scaffolding
  Why: the companion GUI is entirely English (no `tr()`/QTranslator) while the paired extension ships 11 locales — a coherence gap for non-English users.
  Evidence: RESEARCH.md §Exec Summary; `astra_downloader/gui.py` (all string literals).
  Touches: `astra_downloader/gui.py` (wrap user-facing strings in `tr()`), `.ts`/`.qm` pipeline in `build.py`, at minimum the extension's shipped locale set.
  Acceptance: GUI strings load from translation catalogs; at least one non-English locale renders; build packages the `.qm` files.
  Complexity: L

- [ ] P3 — Channel subscriptions + scheduled rescan (archiver bet)
  Why: subscribe to a channel/playlist and auto-download new uploads on a schedule — the single feature 4K Video Downloader paywalls and the clearest competitive leapfrog (Stacher/ytdl-sub/TubeArchivist). Tradeoff: turns the app into an always-on stateful archiver (durable dedupe/archive state, storage growth, new failure surface) — must be built on a real archive-state store from day one, not bolted on.
  Evidence: RESEARCH.md §Competitive + Open Questions; https://github.com/tubearchivist/tubearchivist, https://github.com/jmbannon/ytdl-sub
  Touches: new subscription store + scheduler in the companion, `download.py` (archive-aware dedupe), `routes.py` (subscription CRUD), `gui.py` Subscriptions page, extension surface.
  Acceptance: a subscribed channel auto-enqueues only genuinely new uploads on its schedule; already-downloaded items are not re-fetched across restarts; subscriptions and archive state survive a companion update.
  Complexity: XL

- [ ] P3 — Pin the companion self-update version manifest to the tagged Release
  Why: the self-update reads `APP_VERSION` from `main` HEAD raw source; the binary is Release-sourced + digest-pinned + guarded, but keying the version check on branch HEAD leaves a branch-trust edge (a premature/bad main commit drives update logic).
  Evidence: RESEARCH.md §Architecture; `astra_downloader/astra_downloader.py:~225` (companion update version URL).
  Touches: `astra_downloader/astra_downloader.py` (read version from the latest tagged Release/manifest, not `main` raw source).
  Acceptance: the update version comparison is sourced from the tagged Release/its digest manifest; a version bump on `main` without a published Release does not trigger update logic.
  Complexity: M
